import { fmt } from './utils.js';

let sb, getState;

export function init(supabase, stateGetter) {
    sb = supabase;
    getState = stateGetter;
}

export async function loadDashboard() {
    const el = document.getElementById('dashboardContent');
    if (!el) return;
    el.innerHTML = '<div class="spinner"></div>';

    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    const [
        { data: unpaidInvoices },
        { data: uninvoicedEntries },
        { data: monthEntries },
        { data: recentEntries }
    ] = await Promise.all([
        sb.from('invoices').select('subtotal').in('status', ['draft', 'issued']),
        sb.from('entries').select('total_amount').is('invoice_id', null),
        sb.from('entries').select('total_amount').gte('date', monthStart),
        sb.from('entries')
            .select('date, total_amount, clients(name)')
            .order('date', { ascending: false })
            .limit(5)
    ]);

    const unpaidTotal     = (unpaidInvoices   || []).reduce((s, r) => s + parseFloat(r.subtotal     || 0), 0);
    const uninvoicedTotal = (uninvoicedEntries || []).reduce((s, r) => s + parseFloat(r.total_amount || 0), 0);
    const monthTotal      = (monthEntries      || []).reduce((s, r) => s + parseFloat(r.total_amount || 0), 0);

    const monthName = now.toLocaleString('en-AU', { month: 'long' });

    el.innerHTML = `
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">
            ${statCard('Outstanding', fmt(unpaidTotal), 'Unpaid invoices', '#ff9500')}
            ${statCard('Uninvoiced', fmt(uninvoicedTotal), 'Not yet billed', '#007AFF')}
        </div>
        ${statCardWide(monthName, fmt(monthTotal), 'Earned this month', '#34c759')}
        <div style="margin-top:20px;">
            <div style="font-size:11px; font-weight:700; color:#9ca3af; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:8px; padding:0 2px;">Recent Entries</div>
            ${(recentEntries || []).length
                ? (recentEntries || []).map(recentEntryRow).join('')
                : '<p style="color:#8e8e93; text-align:center; padding:32px 0; font-size:15px;">No entries yet</p>'}
        </div>`;
}

function statCard(label, value, subtitle, color) {
    return `<div style="background:#fff; border-radius:16px; padding:16px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
        <div style="font-size:10px; font-weight:700; color:#9ca3af; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:6px;">${label}</div>
        <div style="font-size:20px; font-weight:800; color:${color}; line-height:1.1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${value}</div>
        <div style="font-size:11px; color:#8e8e93; margin-top:4px;">${subtitle}</div>
    </div>`;
}

function statCardWide(label, value, subtitle, color) {
    return `<div style="background:#fff; border-radius:16px; padding:16px; box-shadow:0 1px 3px rgba(0,0,0,0.05); display:flex; align-items:center; justify-content:space-between;">
        <div>
            <div style="font-size:10px; font-weight:700; color:#9ca3af; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:4px;">${label}</div>
            <div style="font-size:12px; color:#8e8e93;">${subtitle}</div>
        </div>
        <div style="font-size:26px; font-weight:800; color:${color};">${value}</div>
    </div>`;
}

function recentEntryRow(entry) {
    const clientName = entry.clients?.name ?? '—';
    const amount = fmt(parseFloat(entry.total_amount || 0));
    const date = entry.date
        ? new Date(entry.date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
        : '—';
    return `<div style="background:#fff; border-radius:14px; padding:12px 16px; margin-bottom:8px; display:flex; align-items:center; justify-content:space-between; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
        <div>
            <div style="font-size:15px; font-weight:600; color:#111827;">${clientName}</div>
            <div style="font-size:12px; color:#8e8e93; margin-top:2px;">${date}</div>
        </div>
        <div style="font-size:15px; font-weight:700; color:#111827; margin-left:12px;">${amount}</div>
    </div>`;
}
