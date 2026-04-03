import { fmt } from './utils.js';

let sb, getState;
let annualChart = null;

export function init(supabase, stateGetter) {
    sb = supabase;
    getState = stateGetter;
}

export async function loadDashboard() {
    const el = document.getElementById('dashboardContent');
    if (!el) return;
    el.innerHTML = '<div class="spinner"></div>';

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); // 0-indexed
    const dayOfMonth = now.getDate();

    const monthStart    = `${year}-${pad(month + 1)}-01`;
    const prevMonth     = month === 0 ? 11 : month - 1;
    const prevMonthYear = month === 0 ? year - 1 : year;
    const prevMonthStart = `${prevMonthYear}-${pad(prevMonth + 1)}-01`;
    // Last day in prev month matching today's day-of-month (clamped to actual month length)
    const prevMonthDaysInMonth = new Date(prevMonthYear, prevMonth + 1, 0).getDate();
    const prevMonthSameDay = `${prevMonthYear}-${pad(prevMonth + 1)}-${pad(Math.min(dayOfMonth, prevMonthDaysInMonth))}`;
    const yearStart     = `${year}-01-01`;
    const prevYearStart = `${year - 1}-01-01`;

    const [
        { data: monthEntries },
        { data: prevMonthEntries },
        { data: outstandingInvoices },
        { data: currentYearEntries },
        { data: prevYearEntries },
        { data: recentEmails },
    ] = await Promise.all([
        sb.from('entries')
            .select('total_amount, client_id, clients(name)')
            .gte('date', monthStart),
        sb.from('entries')
            .select('total_amount')
            .gte('date', prevMonthStart)
            .lte('date', prevMonthSameDay),
        sb.from('invoices')
            .select('invoice_number, subtotal, clients(name)')
            .in('status', ['draft', 'issued'])
            .order('created_at', { ascending: false }),
        sb.from('entries')
            .select('date, total_amount')
            .gte('date', yearStart),
        sb.from('entries')
            .select('date, total_amount')
            .gte('date', prevYearStart)
            .lt('date', yearStart),
        sb.from('scheduled_emails')
            .select('id, invoice_id, to_address, subject, scheduled_for, status, sent_at, invoices(invoice_number, clients(name))')
            .in('status', ['pending', 'sent'])
            .order('created_at', { ascending: false })
            .limit(5),
    ]);

    // --- Month Summary calculations ---
    const monthTotal     = sum(monthEntries, 'total_amount');
    const prevMonthTotal = sum(prevMonthEntries, 'total_amount');
    const pctChange      = prevMonthTotal > 0
        ? ((monthTotal - prevMonthTotal) / prevMonthTotal) * 100
        : null;

    const entryCount = (monthEntries || []).length;
    const avgDaily   = dayOfMonth > 0 ? monthTotal / dayOfMonth : 0;

    // Top client by amount this month
    const clientTotals = {};
    (monthEntries || []).forEach(e => {
        const n = e.clients?.name || 'Unknown';
        clientTotals[n] = (clientTotals[n] || 0) + parseFloat(e.total_amount || 0);
    });
    const topClient = Object.entries(clientTotals).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';

    // --- Outstanding calculations ---
    const outstandingTotal = sum(outstandingInvoices, 'subtotal');
    const invoiceCount     = (outstandingInvoices || []).length;

    // --- Annual chart data ---
    const currentMonthly = Array(12).fill(0);
    const prevMonthly    = Array(12).fill(0);
    (currentYearEntries || []).forEach(e => {
        currentMonthly[parseInt(e.date.split('-')[1]) - 1] += parseFloat(e.total_amount || 0);
    });
    (prevYearEntries || []).forEach(e => {
        prevMonthly[parseInt(e.date.split('-')[1]) - 1] += parseFloat(e.total_amount || 0);
    });

    // --- Build HTML ---
    const monthName = now.toLocaleString('en-AU', { month: 'long' });

    const pctBadge = pctChange !== null
        ? `<div style="display:inline-flex;align-items:center;gap:2px;margin-top:6px;padding:3px 8px;border-radius:8px;font-size:10px;font-weight:700;
                background:${pctChange >= 0 ? 'rgba(52,199,89,0.1)' : 'rgba(239,68,68,0.1)'};
                color:${pctChange >= 0 ? '#34c759' : '#ef4444'};">
                ${pctChange >= 0 ? '↑' : '↓'} ${Math.abs(pctChange).toFixed(1)}% vs last month (day ${dayOfMonth})
            </div>`
        : '';

    const unpaidRows = (outstandingInvoices || []).slice(0, 3).map((inv, i, arr) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;
                ${i < arr.length - 1 ? 'border-bottom:1px solid #f3f4f6;' : ''}font-size:11px;">
            <div>
                <div style="font-weight:700;color:#111827;">${inv.invoice_number}</div>
                <div style="color:#9ca3af;font-size:10px;margin-top:1px;">${inv.clients?.name || '—'}</div>
            </div>
            <div style="font-weight:800;color:#6b7280;">${fmt(parseFloat(inv.subtotal || 0))}</div>
        </div>`).join('');

    el.innerHTML = `
        <div class="dash-grid" style="margin-bottom:10px;">

            <!-- Month Summary Card -->
            <div style="background:#fff;border-radius:16px;padding:18px;box-shadow:0 1px 3px rgba(0,0,0,0.05);display:flex;flex-direction:column;justify-content:space-between;">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                    <div>
                        <div style="font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;">${monthName} Summary</div>
                        <div style="font-size:28px;font-weight:900;color:#111827;line-height:1.1;margin-top:4px;">${fmt(monthTotal)}</div>
                        ${pctBadge}
                    </div>
                    <div style="background:rgba(0,122,255,0.08);padding:8px;border-radius:10px;color:#007AFF;flex-shrink:0;">
                        <i data-lucide="trending-up" style="width:20px;height:20px;"></i>
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:18px;padding-top:14px;border-top:1px solid #f3f4f6;">
                    <div>
                        <div style="font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:3px;">Entries</div>
                        <div style="font-size:13px;font-weight:700;color:#111827;">${entryCount} Job${entryCount !== 1 ? 's' : ''}</div>
                    </div>
                    <div>
                        <div style="font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:3px;">Avg. Daily</div>
                        <div style="font-size:13px;font-weight:700;color:#111827;">${fmt(avgDaily)}</div>
                    </div>
                    <div>
                        <div style="font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:3px;">Top Client</div>
                        <div style="font-size:13px;font-weight:700;color:#111827;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${topClient}</div>
                    </div>
                </div>
            </div>

            <!-- Outstanding Card -->
            <div style="background:#fff;border-radius:16px;padding:18px;box-shadow:0 1px 3px rgba(0,0,0,0.05);display:flex;flex-direction:column;">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
                    <div>
                        <div style="font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;">Outstanding</div>
                        <div style="font-size:22px;font-weight:900;color:#111827;margin-top:4px;">${fmt(outstandingTotal)}</div>
                    </div>
                    ${invoiceCount > 0 ? `<div style="padding:2px 8px;border-radius:8px;font-size:10px;font-weight:700;background:rgba(239,68,68,0.08);color:#ef4444;flex-shrink:0;margin-top:2px;">${invoiceCount} unpaid</div>` : ''}
                </div>
                <div style="flex:1;">
                    ${unpaidRows || '<div style="font-size:11px;color:#9ca3af;padding:6px 0;">All paid — nice!</div>'}
                </div>
                ${invoiceCount > 0 ? `<button onclick="window.switchView(2)" style="margin-top:12px;font-size:10px;color:#007AFF;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;background:none;border:none;cursor:pointer;text-align:center;width:100%;padding:0;">View All ${invoiceCount} Invoice${invoiceCount !== 1 ? 's' : ''} →</button>` : ''}
            </div>
        </div>

        <!-- Annual Performance Chart -->
        <div style="background:#fff;border-radius:16px;padding:18px;box-shadow:0 1px 3px rgba(0,0,0,0.05);margin-bottom:10px;">
            <div style="margin-bottom:14px;">
                <div style="font-size:15px;font-weight:700;color:#111827;margin-bottom:8px;">Annual Performance</div>
                <div style="display:flex;gap:16px;">
                    <div style="display:flex;align-items:center;gap:6px;">
                        <div style="width:18px;height:3px;background:#007AFF;border-radius:2px;"></div>
                        <span style="font-size:10px;color:#9ca3af;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;">${year}</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:6px;">
                        <div style="width:18px;height:2px;background:#E2E8F0;border-radius:2px;"></div>
                        <span style="font-size:10px;color:#9ca3af;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;">${year - 1}</span>
                    </div>
                </div>
            </div>
            <div style="height:180px;position:relative;">
                <canvas id="annualChart"></canvas>
            </div>
        </div>
        <!-- Email Log -->
        ${buildEmailLog(recentEmails)}
    `;

    // Refresh lucide icons for the trending-up icon we injected
    if (window.lucide) window.lucide.createIcons();

    // Build Chart.js line chart
    const canvas = document.getElementById('annualChart');
    if (canvas && window.Chart) {
        if (annualChart) annualChart.destroy();
        annualChart = new Chart(canvas, {
            type: 'line',
            data: {
                labels: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].slice(0, month + 1),
                datasets: [
                    {
                        data: currentMonthly.slice(0, month + 1),
                        borderColor: '#007AFF',
                        borderWidth: 2.5,
                        tension: 0.4,
                        pointRadius: 0,
                        pointHoverRadius: 5,
                        pointHoverBackgroundColor: '#007AFF',
                        pointHoverBorderColor: '#fff',
                        pointHoverBorderWidth: 2,
                        fill: false,
                    },
                    {
                        data: prevMonthly.slice(0, month + 1),
                        borderColor: '#E2E8F0',
                        borderWidth: 2,
                        borderDash: [4, 4],
                        tension: 0.4,
                        pointRadius: 0,
                        fill: false,
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => fmt(ctx.raw),
                            title: ctxArr => ctxArr[0].label + ' ' + (ctxArr[0].datasetIndex === 0 ? year : year - 1),
                        },
                        backgroundColor: '#fff',
                        borderColor: 'rgba(0,0,0,0.08)',
                        borderWidth: 1,
                        bodyColor: '#111827',
                        titleColor: '#9ca3af',
                        bodyFont: { weight: '700', size: 12, family: '-apple-system, SF Pro Display, Inter, sans-serif' },
                        titleFont: { size: 10, weight: '700', family: '-apple-system, SF Pro Display, Inter, sans-serif' },
                        cornerRadius: 10,
                        padding: 10,
                        displayColors: false,
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        border: { display: false },
                        ticks: {
                            color: '#94a3b8',
                            font: { size: 10, weight: '600' },
                        }
                    },
                    y: {
                        display: false,
                    }
                },
                interaction: {
                    mode: 'index',
                    intersect: false,
                }
            }
        });
    }
}

function buildEmailLog(emails) {
    if (!emails || emails.length === 0) return '';

    const rows = emails.map((e, i, arr) => {
        const isPending = e.status === 'pending';
        const clientName = e.invoices?.clients?.name || e.to_address;
        const ts = isPending ? e.scheduled_for : e.sent_at;
        const dateLabel = ts ? formatEmailDate(new Date(ts)) : '—';
        const icon = isPending
            ? `<i data-lucide="clock" style="width:16px;height:16px;color:#007AFF;flex-shrink:0;"></i>`
            : `<i data-lucide="check-circle-2" style="width:16px;height:16px;color:#34c759;flex-shrink:0;"></i>`;
        const statusLabel = isPending ? 'Scheduled' : 'Sent';
        const statusColor = isPending ? '#007AFF' : '#34c759';

        const onclick = e.invoice_id ? `onclick="window.navigateToInvoice('${e.invoice_id}')"` : '';
        return `<div ${onclick} style="display:flex;align-items:center;justify-content:space-between;padding:11px 14px;
                ${e.invoice_id ? 'cursor:pointer;' : ''}${i < arr.length - 1 ? 'border-bottom:1px solid #f3f4f6;' : ''}">
            <div style="display:flex;align-items:center;gap:10px;min-width:0;">
                ${icon}
                <div style="min-width:0;">
                    <div style="font-size:12px;font-weight:700;color:#111827;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${clientName}</div>
                    <div style="font-size:10px;color:#9ca3af;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${e.subject}</div>
                </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;margin-left:12px;">
                <div style="text-align:right;">
                    <div style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;color:${statusColor};">${statusLabel}</div>
                    <div style="font-size:9px;color:#9ca3af;font-weight:600;margin-top:1px;">${dateLabel}</div>
                </div>
                <i data-lucide="chevron-right" style="width:14px;height:14px;color:#d1d5db;flex-shrink:0;"></i>
            </div>
        </div>`;
    }).join('');

    return `
        <div style="margin-bottom:24px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <div style="font-size:15px;font-weight:700;color:#111827;">Email Log</div>
                <button onclick="window.switchView(2)" style="font-size:12px;font-weight:700;color:#9ca3af;background:none;border:none;cursor:pointer;padding:0;">History</button>
            </div>
            <div style="background:#fff;border-radius:16px;box-shadow:0 1px 3px rgba(0,0,0,0.05);overflow:hidden;">
                ${rows}
            </div>
        </div>`;
}

function formatEmailDate(d) {
    const now = new Date();
    const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    if (sameDay(d, now)) return 'Today';
    if (sameDay(d, tomorrow)) return 'Tomorrow';
    if (sameDay(d, yesterday)) return 'Yesterday';
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

function sum(rows, field) {
    return (rows || []).reduce((s, r) => s + parseFloat(r[field] || 0), 0);
}

function pad(n) {
    return String(n).padStart(2, '0');
}
