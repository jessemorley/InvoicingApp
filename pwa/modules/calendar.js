// ─────────────────────────────────────────────
// CALENDAR MODULE
// Monthly grid showing entries with invoice status icons
// ─────────────────────────────────────────────
import { fmt, clientCalColor, clientBadgeColor, entryDescription } from './utils.js';

let sb, getState;

export function init(supabase, stateGetter) {
    sb = supabase;
    getState = stateGetter;
}

// ── State ────────────────────────────────────
let currentYear  = new Date().getFullYear();
let currentMonth = new Date().getMonth(); // 0-based
let calEntries   = [];
let calInvoices  = {};  // id → invoice

// ─────────────────────────────────────────────
// LOAD
// ─────────────────────────────────────────────

export async function loadCalendar(year, month) {
    if (year  !== undefined) currentYear  = year;
    if (month !== undefined) currentMonth = month;

    const inner = document.getElementById('calendarInner');
    if (!inner) return;
    inner.innerHTML = '<div class="spinner"></div>';

    // Date range for the displayed month
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay  = new Date(currentYear, currentMonth + 1, 0);
    const fromStr  = _dateStr(firstDay);
    const toStr    = _dateStr(lastDay);

    const [{ data: entries }, { data: invoices }] = await Promise.all([
        sb.from('entries')
          .select('*, clients(name), invoices(invoice_number, status)')
          .gte('date', fromStr)
          .lte('date', toStr)
          .order('date', { ascending: true }),
        sb.from('invoices')
          .select('id, invoice_number, status')
    ]);

    calEntries  = entries  || [];
    calInvoices = {};
    (invoices || []).forEach(inv => { calInvoices[inv.id] = inv; });

    _renderCalendar();
    _wireNavButtons();
}

// ─────────────────────────────────────────────
// RENDER
// ─────────────────────────────────────────────

function _renderCalendar() {
    const inner = document.getElementById('calendarInner');
    if (!inner) return;

    const monthNames = ['January','February','March','April','May','June',
                        'July','August','September','October','November','December'];

    // Build a map: dateStr → entries
    const byDate = {};
    calEntries.forEach(e => {
        if (!byDate[e.date]) byDate[e.date] = [];
        byDate[e.date].push(e);
    });

    // Calendar grid setup
    const firstOfMonth = new Date(currentYear, currentMonth, 1);
    const daysInMonth  = new Date(currentYear, currentMonth + 1, 0).getDate();
    // Week starts Monday: Sunday = 6, Mon = 0, ... Sat = 5
    let startDow = firstOfMonth.getDay() - 1;
    if (startDow < 0) startDow = 6;

    const dayHeaders = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

    let html = `
    <div style="margin-bottom:16px;">
        <h2 style="font-size:22px; font-weight:800; color:#111827; margin:0;">${monthNames[currentMonth]} ${currentYear}</h2>
    </div>
    <div style="display:grid; grid-template-columns:repeat(7,1fr); grid-template-rows:auto repeat(6,minmax(90px,1fr)); gap:1px; background:#e5e7eb; border-radius:12px; overflow:hidden;">`;

    // Day-of-week header row (Sat/Sun columns slightly dimmer)
    dayHeaders.forEach((d, i) => {
        const isWknd = i >= 5;
        html += `<div style="background:${isWknd ? '#f7f7f8' : '#fff'}; text-align:center; padding:6px 0; font-size:10px; font-weight:700; color:${isWknd ? '#b0b7c3' : '#9ca3af'}; text-transform:uppercase; min-width:0; overflow:hidden;">${d}</div>`;
    });

    // Empty cells before first day
    for (let i = 0; i < startDow; i++) {
        html += `<div style="background:#f7f7f8;"></div>`;
    }

    const { businessDetails } = getState();
    const includeSuperInTotals = businessDetails?.include_super_in_totals ?? true;

    // Day cells
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr    = `${currentYear}-${String(currentMonth + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const dayEntries = byDate[dateStr] || [];
        const isToday    = dateStr === _dateStr(new Date());
        // Column index (0=Mon … 5=Sat, 6=Sun)
        const colIndex   = (startDow + day - 1) % 7;
        const isWeekend  = colIndex >= 5;

        const chipColors = { draft: 'bg-gray-100 text-gray-500', issued: 'bg-orange-100 text-orange-600', paid: 'bg-green-100 text-green-600' };

        let entriesHtml = '';
        dayEntries.forEach(e => {
            const clientName    = e.clients?.name || '';
            const { bg, text }  = clientCalColor(clientName);
            const inv     = e.invoices;
            const invChip = inv
                ? `<span class="invoice-chip ${chipColors[inv.status] || 'bg-gray-100 text-gray-500'}" style="font-size:11px; padding:2px 6px; flex-shrink:0;">${inv.invoice_number}</span>`
                : '';
            const desc   = entryDescription(e);
            const total  = e.total_amount || 0;
            const amount = fmt(includeSuperInTotals ? total : total - (e.super_amount || 0));
            entriesHtml += `
            <div style="margin-top:3px; padding:4px 7px; border-radius:6px; background:${bg}; min-width:0;">
                <div style="display:flex; align-items:center; gap:4px; min-width:0;">
                    <span style="font-size:11px; font-weight:700; color:${text}; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${clientName}</span>
                    ${invChip}
                </div>
                <div style="font-size:12px; color:#6b7280; margin-top:2px; overflow:hidden;">${desc}</div>
            </div>`;
        });

        html += `
        <div class="cal-day-cell" data-date="${dateStr}" style="background:${isWeekend ? '#f7f7f8' : '#fff'}; padding:6px 5px; cursor:${dayEntries.length ? 'pointer' : 'default'}; min-width:0; overflow:hidden;">
            <div style="font-size:12px; font-weight:${isToday ? '800' : '600'}; color:${isToday ? '#2563eb' : isWeekend ? '#6b7280' : '#111827'}; ${isToday ? 'background:#eff6ff; border-radius:50%; width:20px; height:20px; display:flex; align-items:center; justify-content:center;' : ''}">${day}</div>
            ${entriesHtml}
        </div>`;
    }

    // Fill remaining cells to complete the last row
    const totalCells = startDow + daysInMonth;
    const remainder  = totalCells % 7;
    if (remainder !== 0) {
        for (let i = 0; i < 7 - remainder; i++) {
            html += `<div style="background:#f7f7f8;"></div>`;
        }
    }

    html += `</div>`;
    inner.innerHTML = html;

    // Wire up day cell clicks
    inner.querySelectorAll('.cal-day-cell[data-date]').forEach(cell => {
        const date    = cell.dataset.date;
        const entries = byDate[date] || [];
        if (!entries.length) return;
        cell.addEventListener('click', () => _showDayEntries(date, entries));
    });
}

function _showDayEntries(dateStr, entries) {
    // On desktop, show in detail panel; on mobile, show as bottom sheet overlay
    const isDesktop = window.innerWidth >= 768;
    const panel     = document.getElementById('detailPanel');

    const [y, m, d] = dateStr.split('-').map(Number);
    const date       = new Date(y, m - 1, d);
    const dateLabel  = date.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    let html = `
    <div style="padding:20px;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
            <h3 style="font-size:15px; font-weight:700; color:#111827; margin:0;">${dateLabel}</h3>
            <button id="dayPanelClose" style="background:none; border:none; cursor:pointer; color:#9ca3af; padding:4px;">
                <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
        </div>
        <div class="space-y-3">`;

    const { businessDetails } = getState();
    const includeSuperInTotals = businessDetails?.include_super_in_totals ?? true;

    entries.forEach(e => {
        const clientName = e.clients?.name || 'Unknown';
        const badgeColor = clientBadgeColor(clientName);
        const inv        = e.invoices;
        const desc       = entryDescription(e);
        const total   = e.total_amount || 0;
        const amount  = fmt(includeSuperInTotals ? total : total - (e.super_amount || 0));

        let invChip = '';
        if (inv) {
            const chipColors = { draft: 'bg-gray-100 text-gray-500', issued: 'bg-orange-100 text-orange-600', paid: 'bg-green-100 text-green-600' };
            const color = chipColors[inv.status] || 'bg-gray-100 text-gray-500';
            invChip = `<span class="invoice-chip ${color}">${inv.invoice_number}</span>`;
        }

        html += `
        <div style="background:#f9fafb; border-radius:12px; padding:12px 14px;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:4px;">
                <span class="client-badge ${badgeColor}">${clientName}</span>
                ${invChip}
            </div>
            <div style="display:flex; align-items:center; justify-content:space-between;">
                <span style="font-size:14px; font-weight:600; color:#374151;">${desc}</span>
                <span style="font-size:14px; font-weight:700; color:#111827;">${amount}</span>
            </div>
        </div>`;
    });

    html += `</div></div>`;

    if (isDesktop && panel) {
        panel.innerHTML = html;
        panel.classList.add('open');
        panel.querySelector('#dayPanelClose').addEventListener('click', () => {
            panel.classList.remove('open');
        });
    } else {
        // Mobile: use a simple bottom overlay
        let overlay = document.getElementById('calDayOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'calDayOverlay';
            overlay.style.cssText = 'position:fixed; inset:0; z-index:500; background:rgba(0,0,0,0.4); display:flex; align-items:flex-end;';
            document.body.appendChild(overlay);
        }
        overlay.innerHTML = `
        <div style="background:#fff; border-radius:20px 20px 0 0; width:100%; max-height:70vh; overflow-y:auto; padding-bottom:env(safe-area-inset-bottom);">
            ${html}
        </div>`;
        overlay.style.display = 'flex';
        overlay.querySelector('#dayPanelClose').addEventListener('click', () => {
            overlay.style.display = 'none';
        });
        overlay.addEventListener('click', e => {
            if (e.target === overlay) overlay.style.display = 'none';
        });
    }
}

function _wireNavButtons() {
    const prev = document.getElementById('calPrevBtn');
    const next = document.getElementById('calNextBtn');
    if (prev) {
        prev.addEventListener('click', () => {
            currentMonth--;
            if (currentMonth < 0) { currentMonth = 11; currentYear--; }
            loadCalendar();
        });
    }
    if (next) {
        next.addEventListener('click', () => {
            currentMonth++;
            if (currentMonth > 11) { currentMonth = 0; currentYear++; }
            loadCalendar();
        });
    }
}

// ── Helpers ──────────────────────────────────
function _dateStr(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}
