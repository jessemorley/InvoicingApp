import { fmt, clientBadgeColor } from './utils.js';

let sb, getState;
let annualChart = null;

export function init(supabase) {
    sb = supabase;
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
    // Rolling 6-month window: compute the start of the window (may be in previous year)
    const windowStartM    = month - 5; // can be negative
    const windowStartYear = windowStartM < 0 ? year - 1 : year;
    const windowStartMon  = windowStartM < 0 ? 12 + windowStartM : windowStartM; // 0-indexed
    // Chart fetch covers current window + same window 1 year prior
    const chartComparisonStart = `${windowStartYear - 1}-${pad(windowStartMon + 1)}-01`;

    const [
        { data: monthEntries },
        { data: prevMonthEntries },
        { data: outstandingInvoices },
        { data: chartEntries },
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
            .gte('date', chartComparisonStart),
        sb.from('scheduled_emails')
            .select('id, invoice_id, to_address, subject, body_text, scheduled_for, status, sent_at, invoices(invoice_number, clients(name))')
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

    // --- Last 6 months chart data ---
    // Build the window: 6 {year, month} pairs ending at current month
    const allMonthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const windowSlots = [];
    for (let i = 5; i >= 0; i--) {
        const m = month - i;
        windowSlots.push(m < 0
            ? { y: year - 1, m: 12 + m }
            : { y: year,     m });
    }

    const last6Labels   = windowSlots.map(s => allMonthNames[s.m]);
    const last6Data     = Array(6).fill(0);
    const last6PrevData = Array(6).fill(0);

    (chartEntries || []).forEach(e => {
        const parts = e.date.split('-');
        const ey = parseInt(parts[0]);
        const em = parseInt(parts[1]) - 1; // 0-indexed
        const amt = parseFloat(e.total_amount || 0);
        windowSlots.forEach(({ y, m }, idx) => {
            if (ey === y && em === m)         last6Data[idx]     += amt;
            if (ey === y - 1 && em === m)     last6PrevData[idx] += amt;
        });
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
            <div class="week-group">
                <div class="week-header"><span>${monthName} Summary</span></div>
                <div style="background:#fff;border-radius:16px;padding:18px;box-shadow:0 1px 3px rgba(0,0,0,0.05);display:flex;flex-direction:column;justify-content:space-between;">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                        <div>
                            <div style="font-size:28px;font-weight:900;color:#111827;line-height:1.1;">${fmt(monthTotal)}</div>
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
                            ${topClient !== '—'
                                ? `<span class="client-badge ${clientBadgeColor(topClient)}" style="font-size:11px;">${topClient}</span>`
                                : `<div style="font-size:13px;font-weight:700;color:#111827;">—</div>`
                            }
                        </div>
                    </div>
                </div>
            </div>

            <!-- Outstanding Card -->
            <div class="week-group">
                <div class="week-header"><span>Outstanding</span></div>
                <div style="background:#fff;border-radius:16px;padding:18px;box-shadow:0 1px 3px rgba(0,0,0,0.05);display:flex;flex-direction:column;">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
                        <div style="font-size:22px;font-weight:900;color:#111827;">${fmt(outstandingTotal)}</div>
                        ${invoiceCount > 0 ? `<div style="padding:2px 8px;border-radius:8px;font-size:10px;font-weight:700;background:rgba(239,68,68,0.08);color:#ef4444;flex-shrink:0;margin-top:2px;">${invoiceCount} unpaid</div>` : ''}
                    </div>
                    <div style="flex:1;">
                        ${unpaidRows || '<div style="font-size:11px;color:#9ca3af;padding:6px 0;">All paid — nice!</div>'}
                    </div>
                    ${invoiceCount > 0 ? `<button onclick="window.switchView(2)" style="margin-top:12px;font-size:10px;color:#007AFF;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;background:none;border:none;cursor:pointer;text-align:center;width:100%;padding:0;">View All ${invoiceCount} Invoice${invoiceCount !== 1 ? 's' : ''} →</button>` : ''}
                </div>
            </div>
        </div>

        <!-- Last 6 Months Chart -->
        <div class="week-group" style="margin-bottom:10px;">
            <div class="week-header">
                <span>Last 6 Months</span>
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
            <div style="background:#fff;border-radius:16px;padding:18px;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                <div style="height:180px;position:relative;">
                    <canvas id="annualChart"></canvas>
                </div>
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
                labels: last6Labels,
                datasets: [
                    {
                        data: last6Data,
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
                        data: last6PrevData,
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
                        enabled: false,
                        external({ chart, tooltip }) {
                            let el = chart.canvas.parentNode.querySelector('.chart-tooltip');
                            if (!el) {
                                el = document.createElement('div');
                                el.className = 'chart-tooltip';
                                Object.assign(el.style, {
                                    position: 'absolute', pointerEvents: 'none',
                                    background: '#fff', border: '1px solid rgba(0,0,0,0.08)',
                                    borderRadius: '10px', padding: '10px 12px',
                                    fontFamily: '-apple-system, SF Pro Display, Inter, sans-serif',
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                                    whiteSpace: 'nowrap', transition: 'opacity 0.1s',
                                });
                                chart.canvas.parentNode.style.position = 'relative';
                                chart.canvas.parentNode.appendChild(el);
                            }
                            if (tooltip.opacity === 0) { el.style.opacity = '0'; return; }
                            const dp = tooltip.dataPoints;
                            if (!dp || !dp.length) return;

                            const idx  = dp[0].dataIndex;
                            const slot = windowSlots[idx];
                            const cur  = last6Data[idx];
                            const prev = last6PrevData[idx];
                            const pct  = prev > 0 ? ((cur - prev) / prev) * 100 : null;
const pctHtml = pct !== null
                                ? `<div style="font-size:10px;font-weight:700;color:${pct >= 0 ? '#34c759' : '#ef4444'};">${pct >= 0 ? '↑' : '↓'} ${Math.abs(pct).toFixed(1)}%</div>`
                                : '';

                            el.innerHTML = `
                                <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:5px;">
                                    <div style="font-size:10px;font-weight:700;color:#9ca3af;">${allMonthNames[slot.m]}</div>
                                    ${pctHtml}
                                </div>
                                <div style="font-size:12px;font-weight:700;color:#111827;">${fmt(cur)}</div>
                                <div style="font-size:12px;font-weight:700;color:#94a3b8;">${fmt(prev)}</div>
                            `;
                            el.style.opacity = '1';

                            const x = tooltip.caretX;
                            const y = tooltip.caretY;
                            const cw = chart.canvas.offsetWidth;
                            // Flip to left side if tooltip would overflow
                            el.style.left = (x + el.offsetWidth + 16 > cw ? x - el.offsetWidth - 10 : x + 10) + 'px';
                            el.style.top  = Math.max(0, y - 20) + 'px';
                        }
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
        const statusColor = isPending ? 'var(--color-pending-text)' : 'var(--color-sent-text)';

        const onclick = e.invoice_id ? `onclick="window.navigateToInvoice('${e.invoice_id}')"` : '';
        return `<div ${onclick} class="email-log-row" style="${e.invoice_id ? 'cursor:pointer;' : ''}${i < arr.length - 1 ? 'border-bottom:1px solid #f3f4f6;' : ''}">
            <div class="email-log-left" style="display:flex;align-items:center;gap:8px;overflow:hidden;">
                <div style="flex-shrink:0;">${icon}</div>
                <div style="font-size:13px;font-weight:700;color:#111827;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${clientName}</div>
            </div>
            <div class="email-log-middle" style="font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                <span style="font-weight:500;color:#374151;">${e.subject}</span><span style="color:#d1d5db;"> · </span><span style="color:#b0b4bc;">${emailBodyPreview(e.body_text)}</span>
            </div>
            <div class="email-log-right" style="display:flex;align-items:center;gap:4px;">
                <span style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;color:${statusColor};">${statusLabel}</span>
                <span style="font-size:12px;color:#c0c4cc;">·</span>
                <span style="font-size:12px;color:#9ca3af;font-weight:600;">${dateLabel}</span>
            </div>
        </div>`;
    }).join('');

    return `
        <div class="week-group" style="margin-bottom:24px;">
            <div class="week-header">
                <span>Email Log</span>
                <button onclick="window.switchView(2)" style="font-size:10px;font-weight:700;color:#9ca3af;background:none;border:none;cursor:pointer;padding:0;text-transform:uppercase;letter-spacing:0.05em;">History</button>
            </div>
            <div style="background:#fff;border-radius:16px;box-shadow:0 1px 3px rgba(0,0,0,0.05);overflow:hidden;">
                ${rows}
            </div>
        </div>`;
}

function emailBodyPreview(body) {
    if (!body) return '';
    // Collapse whitespace and newlines to a single space, strip leading greeting line
    const flat = body.replace(/\r?\n/g, ' ').replace(/\s{2,}/g, ' ').trim();
    return flat.length > 80 ? flat.slice(0, 80) + '…' : flat;
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
