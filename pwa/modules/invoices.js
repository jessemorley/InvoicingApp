// ─────────────────────────────────────────────
// INVOICES MODULE
// Handles: invoice list, card expand, preview, sort
// ─────────────────────────────────────────────
import {
    fmt, fmtInvoiceAmount, fmtInvoiceRate, fmtInvoiceTime,
    abbreviateRole, formatEntryDate, formatInvoiceDate, formatInvoiceEntryDate,
    clientBadgeColor, invoiceChipColors, entryDescription,
} from './utils.js';

let sb, getState;

export function init(supabase, stateGetter) {
    sb = supabase;
    getState = stateGetter;
}

// ── State ────────────────────────────────────
let expandedInvoiceWrap   = null;
let invoicesLoaded        = false;
let invoicesAllLoaded     = false;
let invoicesSortMode      = 'chronological';
export let invoicesCache  = [];
let invoicesRenderedCount = 0;
const INVOICES_PAGE_SIZE  = 18;
let currentPreviewHTML    = null;

const ICON_GROUP = `<svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" viewBox="0 0 24 24"><path d="M3 6h18M7 12h10M11 18h2"/></svg>`;
const ICON_LIST  = `<svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" viewBox="0 0 24 24"><path d="M3 6h18M3 12h18M3 18h18"/></svg>`;

// ─────────────────────────────────────────────
// LOAD
// ─────────────────────────────────────────────

export function markStale() { invoicesLoaded = false; }
export function isLoaded()  { return invoicesLoaded; }

export async function loadInvoices() {
    invoicesLoaded        = true;
    invoicesAllLoaded     = false;
    invoicesCache         = [];
    invoicesRenderedCount = 0;
    const list = document.getElementById('invoicesList');
    list.innerHTML = '<div class="spinner"></div>';

    const { data, error } = await sb
        .from('invoices')
        .select('id, invoice_number, status, issued_date, subtotal, clients(name), entries(date)')
        .order('issued_date', { ascending: false });

    if (error || !data?.length) {
        list.innerHTML = '<p class="text-gray-400 text-sm py-8 text-center">No invoices yet</p>';
        return;
    }

    invoicesCache = data;
    updateSortBtnIcon();
    renderInvoices(invoicesCache);
}

function loadMoreInvoices() {
    if (invoicesAllLoaded) return;

    const startIndex = invoicesRenderedCount;
    const batch = invoicesCache.slice(startIndex, startIndex + INVOICES_PAGE_SIZE);
    if (!batch.length) { invoicesAllLoaded = true; updateInvoicesLoadMoreSentinel(); return; }

    const list = document.getElementById('invoicesList');
    const sentinel = document.getElementById('invoicesLoadMore');

    if (invoicesSortMode === 'chronological') {
        const grp = list.querySelector('.week-group') || (() => {
            const g = document.createElement('div');
            g.className = 'week-group';
            list.insertBefore(g, sentinel);
            return g;
        })();
        batch.forEach((inv, i) => grp.appendChild(buildInvoiceCard(inv, startIndex + i)));
    } else {
        renderInvoices(invoicesCache);
        return;
    }

    invoicesRenderedCount += batch.length;
    if (invoicesRenderedCount >= invoicesCache.length) invoicesAllLoaded = true;
    updateInvoicesLoadMoreSentinel();
}

function updateInvoicesLoadMoreSentinel() {
    const list = document.getElementById('invoicesList');
    let sentinel = document.getElementById('invoicesLoadMore');
    if (!sentinel) {
        sentinel = document.createElement('div');
        sentinel.id = 'invoicesLoadMore';
        sentinel.style.cssText = 'text-align:center;padding:16px 0 8px;';
        list.appendChild(sentinel);
    }
    sentinel.innerHTML = invoicesAllLoaded
        ? ''
        : '<div class="spinner" style="margin:0 auto;width:24px;height:24px;opacity:0.4;"></div>';
}

// ─────────────────────────────────────────────
// RENDER
// ─────────────────────────────────────────────

function renderInvoices(data) {
    const list = document.getElementById('invoicesList');
    list.innerHTML = '';
    expandedInvoiceWrap = null;

    if (invoicesSortMode === 'status') {
        const unpaid = data.filter(inv => inv.status !== 'paid');
        const paid   = data.filter(inv => inv.status === 'paid');
        let idx = 0;
        if (unpaid.length) {
            const hdr = document.createElement('div');
            hdr.className = 'week-header';
            hdr.innerHTML = `<span>Unpaid</span><span>${fmt(unpaid.reduce((s, inv) => s + invoiceSubtotal(inv), 0))}</span>`;
            list.appendChild(hdr);
            const grp = document.createElement('div');
            grp.className = 'week-group';
            unpaid.forEach(inv => grp.appendChild(buildInvoiceCard(inv, idx++)));
            list.appendChild(grp);
        }
        if (paid.length) {
            const hdr = document.createElement('div');
            hdr.className = 'week-header';
            hdr.innerHTML = `<span>Paid</span><span>${fmt(paid.reduce((s, inv) => s + invoiceSubtotal(inv), 0))}</span>`;
            list.appendChild(hdr);
            const grp = document.createElement('div');
            grp.className = 'week-group';
            paid.forEach(inv => grp.appendChild(buildInvoiceCard(inv, idx++)));
            list.appendChild(grp);
        }
    } else {
        const initial = data.slice(0, INVOICES_PAGE_SIZE);
        const grp = document.createElement('div');
        grp.className = 'week-group';
        initial.forEach((inv, i) => grp.appendChild(buildInvoiceCard(inv, i)));
        list.appendChild(grp);
        invoicesRenderedCount = initial.length;
        invoicesAllLoaded = invoicesRenderedCount >= data.length;
    }

    updateInvoicesLoadMoreSentinel();
}

function updateSortBtnIcon() {
    const btn = document.getElementById('invoiceSortBtn');
    if (btn) btn.innerHTML = invoicesSortMode === 'chronological' ? ICON_GROUP : ICON_LIST;
}

function toggleInvoiceSort() {
    invoicesSortMode = invoicesSortMode === 'chronological' ? 'status' : 'chronological';
    invoicesRenderedCount = 0;
    invoicesAllLoaded = false;
    updateSortBtnIcon();
    requestAnimationFrame(() => renderInvoices(invoicesCache));
}

function invoiceSubtotal(inv) {
    const { businessDetails } = getState();
    const includeSuperInTotals = businessDetails?.include_super_in_totals ?? true;
    if (inv.subtotal != null && !inv.entries?.some(e => e.total_amount != null)) {
        return includeSuperInTotals ? inv.total || inv.subtotal : inv.subtotal;
    }
    if (!inv.entries?.length) return includeSuperInTotals ? inv.total || inv.subtotal || 0 : inv.subtotal || 0;
    return inv.entries.reduce((s, e) => {
        const total = e.total_amount || 0;
        return s + (includeSuperInTotals ? total : total - (e.super_amount || 0));
    }, 0);
}

function invoiceDateRange(inv) {
    if (!inv.entries?.length) return '';
    const dates = inv.entries.map(e => e.date).filter(Boolean).sort();
    if (!dates.length) return '';
    const first = formatEntryDate(dates[0]);
    const last  = formatEntryDate(dates[dates.length - 1]);
    return first === last ? first : `${first} – ${last}`;
}

function buildInvoiceCard(inv, index) {
    const clientName  = inv.clients?.name || 'Unknown';
    const badgeColor  = clientBadgeColor(clientName);
    const chipColor   = invoiceChipColors[inv.status] || 'bg-gray-100 text-gray-500';
    const statusLabel = inv.status ? (inv.status.charAt(0).toUpperCase() + inv.status.slice(1)) : '';
    const total       = fmt(invoiceSubtotal(inv));
    const dateRange   = invoiceDateRange(inv);

    const wrap = document.createElement('div');
    wrap.className = 'invoice-card-wrap';
    wrap.style.animationDelay = `${index * 40}ms`;

    const row = document.createElement('div');
    row.className = 'invoice-row';
    row.innerHTML = `
        <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1.5">
                <span class="client-badge ${badgeColor}">${clientName}</span>
                <span class="text-[15px] font-bold text-gray-800">${inv.invoice_number}</span>
            </div>
            ${dateRange ? `<p class="text-[13px] text-gray-400 truncate">${dateRange}</p>` : ''}
        </div>
        <div class="flex flex-col items-end gap-1 shrink-0">
            <span class="invoice-chip ${chipColor}">${statusLabel}</span>
            <span class="text-[16px] font-bold text-gray-800 tracking-tight">${total}</span>
        </div>`;

    const detailPanel = document.createElement('div');
    detailPanel.className = 'invoice-detail-panel';
    const detailInner = document.createElement('div');
    detailInner.className = 'invoice-detail-inner';
    detailPanel.appendChild(detailInner);

    row.addEventListener('click', () => toggleInvoiceCard(wrap, inv));
    wrap.appendChild(row);
    wrap.appendChild(detailPanel);
    return wrap;
}

async function toggleInvoiceCard(wrap, inv) {
    if (expandedInvoiceWrap && expandedInvoiceWrap !== wrap) {
        collapseInvoiceCard(expandedInvoiceWrap);
    }
    if (wrap.classList.contains('expanded')) {
        collapseInvoiceCard(wrap);
        return;
    }

    expandedInvoiceWrap = wrap;
    wrap.classList.add('expanded');

    const inner = wrap.querySelector('.invoice-detail-inner');
    const hasFullData = inv.entries?.some(e => e.total_amount != null);
    if (!hasFullData) {
        inner.innerHTML = '<div class="spinner" style="margin:16px auto;width:24px;height:24px;"></div>';
        const { data: fullInv, error } = await sb
            .from('invoices')
            .select('*, clients(name, email, address, suburb, pays_super, super_rate, rate_hourly, entry_label), entries(id, date, description, total_amount, super_amount, base_amount, bonus_amount, day_type, workflow_type, shoot_client, role, hours_worked, billing_type_snapshot, skus, brand, start_time, finish_time, break_minutes)')
            .eq('id', inv.id)
            .single();
        if (!error && fullInv) {
            const idx = invoicesCache.findIndex(i => i.id === inv.id);
            if (idx !== -1) invoicesCache[idx] = fullInv;
            Object.assign(inv, fullInv);
        }
    }

    const entries = inv.entries;
    if (!entries?.length) {
        inner.innerHTML = '<p class="text-gray-400 text-sm py-4 text-center">No entries linked</p>';
        return;
    }

    const sorted = [...entries].sort((a, b) => a.date < b.date ? -1 : 1);
    let html = '<div class="space-y-0 pt-3">';
    sorted.forEach(e => {
        const desc   = entryDescription(e);
        const { businessDetails } = getState();
        const includeSuperInTotals = businessDetails?.include_super_in_totals ?? true;
        const total  = e.total_amount || 0;
        const amount = fmt(includeSuperInTotals ? total : total - (e.super_amount || 0));
        const date   = formatEntryDate(e.date);
        html += `
            <div class="flex justify-between items-center py-2.5 border-b border-slate-50">
                <div class="flex-1 min-w-0 mr-4">
                    <p class="text-[14px] font-semibold text-gray-800 truncate">${desc}</p>
                    <p class="text-[11px] text-gray-400 mt-0.5">${date}</p>
                </div>
                <span class="text-[14px] font-bold text-gray-700 shrink-0">${amount}</span>
            </div>`;
    });

    const subtotal = invoiceSubtotal(inv);
    html += `
        <div class="flex justify-between items-center pt-3 pb-1">
            <span class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total excl. super</span>
            <span class="text-[16px] font-bold text-gray-900">${fmt(subtotal)}</span>
        </div>
    </div>
    <button id="previewBtn_${inv.id}" style="margin-top:12px; margin-bottom:4px; width:100%; padding:12px; background:#111827; color:#fff; border:none; border-radius:12px; font-size:15px; font-weight:600; cursor:pointer; font-family:inherit; letter-spacing:-0.2px; display:flex; align-items:center; justify-content:center; gap:8px;">
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
        Preview Invoice
    </button>
    <button id="deleteBtn_${inv.id}" style="margin-top:6px; margin-bottom:4px; width:100%; padding:12px; background:transparent; color:#ef4444; border:1.5px solid #fecaca; border-radius:12px; font-size:15px; font-weight:600; cursor:pointer; font-family:inherit; letter-spacing:-0.2px; display:flex; align-items:center; justify-content:center; gap:8px;">
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
        Delete Invoice
    </button>`;

    inner.innerHTML = html;
    document.getElementById(`previewBtn_${inv.id}`).addEventListener('click', () => openInvoicePreview(inv));
    document.getElementById(`deleteBtn_${inv.id}`).addEventListener('click', () => openDeleteSheet(inv));
}

function collapseInvoiceCard(wrap) {
    const row = wrap.querySelector('.invoice-row');
    if (row) row.style.borderRadius = '14px 14px 0 0';
    wrap.classList.remove('expanded');
    setTimeout(() => {
        if (row) row.style.borderRadius = '';
        const inner = wrap.querySelector('.invoice-detail-inner');
        if (inner) inner.innerHTML = '';
    }, 400);
    if (expandedInvoiceWrap === wrap) expandedInvoiceWrap = null;
}

// ─────────────────────────────────────────────
// INVOICE HTML + PREVIEW
// ─────────────────────────────────────────────

function buildInvoiceLineItemsHTML(inv) {
    const entries = [...(inv.entries || [])].sort((a, b) => a.date < b.date ? -1 : 1);
    const client = inv.clients || {};
    let html = '';
    for (const e of entries) {
        const dateStr = formatInvoiceEntryDate(e.date);
        let description, hours, rate, amount;
        const type = (e.billing_type_snapshot || '').toLowerCase();
        if (type === 'day_rate' || (!type && e.day_type)) {
            if (e.workflow_type === 'Own Brand') description = e.brand || 'Own Brand';
            else if (e.workflow_type) description = e.workflow_type;
            else description = 'Creative Assist';
            hours = '';
            rate = fmtInvoiceAmount(e.base_amount);
            amount = fmtInvoiceAmount(e.base_amount);
        } else if (type === 'hourly' || (!type && e.hours_worked != null)) {
            const label = e.shoot_client || e.description || '';
            description = e.role ? `${label} (${abbreviateRole(e.role)})` : label;
            hours = e.hours_worked != null ? String(e.hours_worked) : '';
            const rateHourly = parseFloat(client.rate_hourly) || 0;
            rate = rateHourly ? fmtInvoiceRate(rateHourly) : '';
            amount = fmtInvoiceAmount(e.base_amount);
        } else {
            description = e.description || '';
            hours = '';
            rate = '';
            amount = fmtInvoiceAmount(e.base_amount);
        }
        html += `<tr><td class="col-date">${dateStr}</td><td class="col-item">${description}</td><td class="col-qty">${hours}</td><td class="col-rate">${rate}</td><td class="col-amount">${amount}</td></tr>\n`;
        const bonus = parseFloat(e.bonus_amount) || 0;
        if (bonus > 0 && e.skus) {
            html += `<tr><td class="col-date"></td><td class="col-item">&nbsp;&nbsp;+ SKU bonus (${e.skus} SKUs)</td><td class="col-qty"></td><td class="col-rate"></td><td class="col-amount">${fmtInvoiceAmount(bonus)}</td></tr>\n`;
        }
        if ((type === 'hourly' || (!type && e.hours_worked != null)) && e.start_time && e.finish_time) {
            let subLine = `${fmtInvoiceTime(e.start_time)} – ${fmtInvoiceTime(e.finish_time)}`;
            if (e.break_minutes) subLine += ` (${e.break_minutes}m)`;
            html += `<tr><td class="col-date"></td><td class="col-item" style="color:#555;font-size:0.75em;padding-top:0">${subLine}</td><td class="col-qty"></td><td class="col-rate"></td><td class="col-amount"></td></tr>\n`;
        }
    }
    return html;
}

function buildInvoiceHTML(inv) {
    const { businessDetails } = getState();
    const client = inv.clients || {};
    const issuedStr = formatInvoiceDate(inv.issued_date);
    const dueStr = formatInvoiceDate(inv.due_date);
    const lineItems = buildInvoiceLineItemsHTML(inv);
    const descriptionHeader = client.entry_label || 'Description';
    const paysSuper = client.pays_super;
    const superRatePct = Math.round((parseFloat(client.super_rate) || 0) * 100);
    const superRow = paysSuper
        ? `<div class="totals-row"><span class="label">Super (${superRatePct}%)</span><span class="value">${fmtInvoiceAmount(inv.super_amount)}</span></div>`
        : '';
    const clientLines = [client.name, client.email, client.address, client.suburb]
        .filter(Boolean).map(l => `<p>${l}</p>`).join('');
    const biz = businessDetails || {};
    const superMetaLines = paysSuper && biz.super_fund
        ? `<p>${biz.super_fund}, Member ${biz.super_member_number}, ABN ${biz.super_fund_abn}</p><p>USI ${biz.super_usi}</p>`
        : '';

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
<style>
  body { margin: 0; padding: 0; font-family: Arial, "Helvetica Neue", Helvetica, sans-serif; color: #000; line-height: 1.2; -webkit-text-size-adjust: 100%; }
  a { color: inherit; text-decoration: none; }
  .page { width: 794px; padding: 28px 42px; background: white; box-sizing: border-box; }
  .top-header { display: flex; justify-content: space-between; margin-bottom: 80px; }
  .address-block { font-size: 13.5px; }
  .address-block p { margin: 0 0 3px 0; }
  .invoice-title { font-size: 52px; font-weight: 500; margin: 0 0 70px 0; letter-spacing: -1px; }
  .meta-container { display: flex; margin-bottom: 120px; font-size: 13.5px; }
  .dates-block { width: 28%; }
  .dates-block p { margin: 0 0 4px 0; }
  .bank-block { flex-grow: 1; }
  .bank-block p { margin: 0 0 4px 0; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 100px; }
  th { text-align: left; padding: 10px 0; font-size: 13.5px; font-weight: normal; }
  td { padding: 6px 0; vertical-align: top; font-size: 13.5px; }
  .col-date   { width: 22%; }
  .col-item   { width: 37%; }
  .col-qty    { width: 11%; text-align: right; }
  .col-rate   { width: 11%; text-align: right; }
  .col-amount { width: 9%;  text-align: right; }
  .totals-section { display: flex; flex-direction: column; align-items: flex-end; font-size: 13.5px; }
  .totals-row { display: flex; justify-content: space-between; width: 100%; padding: 4px 0; }
  .totals-row.grand-total { margin-top: 40px; }
  .label { text-align: left; }
  .value { text-align: right; width: 100px; }
</style>
</head>
<body>
<div class="page">
  <div class="top-header">
    <div class="address-block">
      <p>${biz.business_name ?? ''}</p>
      <p>ABN ${biz.abn ?? ''}</p>
      <p>${biz.address ?? ''}</p>
    </div>
    <div class="address-block">${clientLines}</div>
  </div>
  <h1 class="invoice-title">Invoice ${inv.invoice_number}</h1>
  <div class="meta-container">
    <div class="dates-block">
      <p>Issued ${issuedStr}</p>
      <p>Due ${dueStr}</p>
    </div>
    <div class="bank-block">
      <p>BSB ${biz.bsb ?? ''} Account Number ${biz.account_number ?? ''}</p>
      ${superMetaLines}
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th class="col-date">Item</th>
        <th class="col-item">${descriptionHeader}</th>
        <th class="col-qty">Hours</th>
        <th class="col-rate">Rate</th>
        <th class="col-amount">Amount</th>
      </tr>
    </thead>
    <tbody>${lineItems}</tbody>
  </table>
  <div class="totals-section">
    <div class="totals-row"><span class="label">Subtotal</span><span class="value">${fmtInvoiceAmount(inv.subtotal)}</span></div>
    ${superRow}
    <div class="totals-row grand-total"><span class="label">Total</span><span class="value">${fmtInvoiceAmount(inv.total)}</span></div>
  </div>
</div>
</body>
</html>`;
}

export function openInvoicePreviewById(id) {
    const inv = invoicesCache.find(i => i.id === id);
    if (inv) openInvoicePreview(inv);
}

function openInvoicePreview(inv) {
    const html = buildInvoiceHTML(inv);
    currentPreviewHTML = html;
    const overlay   = document.getElementById('invoicePreviewOverlay');
    const frame     = document.getElementById('invoicePreviewFrame');
    const scaleWrap = document.getElementById('invoicePreviewScaleWrap');
    const slider    = document.getElementById('viewSlider');

    const docWidth  = 794, docHeight = 1123;
    const scale     = window.innerWidth / docWidth;
    const scaledH   = docHeight * scale;
    const topOffset = Math.max(0, (window.innerHeight - scaledH) / 2);

    frame.style.width  = docWidth + 'px';
    frame.style.height = docHeight + 'px';
    scaleWrap.style.width     = docWidth + 'px';
    scaleWrap.style.top       = topOffset + 'px';
    scaleWrap.style.transform = `scale(${scale})`;
    frame.srcdoc = html;

    slider.style.transition = 'transform 0.35s cubic-bezier(0.4,0,0.2,1)';
    slider.style.transform  = 'translateX(-200vw)';
    overlay.style.transition = 'none';
    overlay.style.transform  = 'translateX(100%)';
    overlay.style.display    = 'block';
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            overlay.style.transition = 'transform 0.35s cubic-bezier(0.4,0,0.2,1)';
            overlay.style.transform  = 'translateX(0)';
        });
    });
}

export function getPrintHTML() { return currentPreviewHTML; }

// ─────────────────────────────────────────────
// DELETE INVOICE
// ─────────────────────────────────────────────

function openDeleteSheet(inv) {
    const existing = document.getElementById('invoiceDeleteSheet');
    if (existing) existing.remove();

    const sheet = document.createElement('div');
    sheet.id = 'invoiceDeleteSheet';
    sheet.style.cssText = `position:fixed;inset:0;z-index:1000;display:flex;flex-direction:column;justify-content:flex-end;`;
    sheet.innerHTML = `
        <div id="invoiceDeleteBackdrop" style="position:absolute;inset:0;background:rgba(0,0,0,0.4);opacity:0;transition:opacity 0.25s;"></div>
        <div id="invoiceDeletePanel" style="position:relative;background:#fff;border-radius:20px 20px 0 0;padding:24px 20px 40px;transform:translateY(100%);transition:transform 0.3s cubic-bezier(0.4,0,0.2,1);">
            <p style="font-size:13px;font-weight:600;color:#9ca3af;text-align:center;margin:0 0 16px;letter-spacing:0.05em;text-transform:uppercase;">Delete ${inv.invoice_number}</p>
            <button id="deleteInvoiceOnly" style="width:100%;padding:14px;margin-bottom:10px;background:#fff;border:1.5px solid #e5e7eb;border-radius:12px;font-size:15px;font-weight:600;color:#111827;cursor:pointer;font-family:inherit;">
                Delete invoice only (keep entries)
            </button>
            <button id="deleteInvoiceAndEntries" style="width:100%;padding:14px;margin-bottom:16px;background:#fef2f2;border:1.5px solid #fecaca;border-radius:12px;font-size:15px;font-weight:600;color:#ef4444;cursor:pointer;font-family:inherit;">
                Delete invoice and entries
            </button>
            <button id="deleteInvoiceCancel" style="width:100%;padding:14px;background:#f9fafb;border:none;border-radius:12px;font-size:15px;font-weight:600;color:#6b7280;cursor:pointer;font-family:inherit;">
                Cancel
            </button>
        </div>`;

    document.body.appendChild(sheet);
    requestAnimationFrame(() => requestAnimationFrame(() => {
        document.getElementById('invoiceDeleteBackdrop').style.opacity = '1';
        document.getElementById('invoiceDeletePanel').style.transform = 'translateY(0)';
    }));

    const close = () => {
        document.getElementById('invoiceDeleteBackdrop').style.opacity = '0';
        document.getElementById('invoiceDeletePanel').style.transform = 'translateY(100%)';
        setTimeout(() => sheet.remove(), 300);
    };

    document.getElementById('invoiceDeleteBackdrop').addEventListener('click', close);
    document.getElementById('deleteInvoiceCancel').addEventListener('click', close);
    document.getElementById('deleteInvoiceOnly').addEventListener('click', async () => {
        close();
        await _deleteInvoice(inv, false);
    });
    document.getElementById('deleteInvoiceAndEntries').addEventListener('click', async () => {
        close();
        await _deleteInvoice(inv, true);
    });
}

async function _deleteInvoice(inv, deleteEntries) {
    try {
        if (deleteEntries) {
            const { error } = await sb.from('entries').delete().eq('invoice_id', inv.id);
            if (error) throw error;
        } else {
            const { error } = await sb.from('entries').update({ invoice_id: null }).eq('invoice_id', inv.id);
            if (error) throw error;
        }
        const { error: invErr } = await sb.from('invoices').delete().eq('id', inv.id);
        if (invErr) throw invErr;

        invoicesCache = invoicesCache.filter(i => i.id !== inv.id);
        invoicesLoaded = false;
        await loadInvoices();
        document.dispatchEvent(new CustomEvent('invoice:deleted'));
    } catch (err) {
        alert('Error deleting invoice: ' + err.message);
    }
}

// ─────────────────────────────────────────────
// SCROLL + PULL TO REFRESH + SORT BUTTON
// ─────────────────────────────────────────────

export function initScrollHandlers() {
    // Pull to refresh
    (function() {
        const THRESHOLD = 110, MAX_PULL = 130;
        let startY = 0, pulling = false, triggered = false;
        const scroller  = document.getElementById('invoicesScroll');
        const indicator = document.getElementById('invoicesPullIndicator');
        scroller.addEventListener('touchstart', e => {
            if (scroller.scrollTop > 5) return;
            startY = e.touches[0].clientY; pulling = true; triggered = false;
        }, { passive: true });
        scroller.addEventListener('touchmove', e => {
            if (!pulling) return;
            const dy = Math.min(e.touches[0].clientY - startY, MAX_PULL);
            if (dy <= 10) return;
            indicator.classList.add('visible');
            const progress = Math.min(dy / THRESHOLD, 1);
            document.getElementById('invoicesPullSpinner').style.transform = `rotate(${progress * 270}deg)`;
            if (dy >= THRESHOLD) triggered = true;
        }, { passive: true });
        scroller.addEventListener('touchend', async () => {
            if (!pulling) return;
            pulling = false;
            if (triggered) {
                document.getElementById('invoicesPullSpinner').style.transform = '';
                invoicesLoaded = false;
                await loadInvoices();
            }
            indicator.classList.remove('visible');
        });
    })();

    // Infinite scroll
    const scroller = document.getElementById('invoicesScroll');
    scroller.addEventListener('scroll', () => {
        if (invoicesAllLoaded) return;
        const distFromBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
        if (distFromBottom < 300) loadMoreInvoices();
    }, { passive: true });

    // Sort button
    const btn = document.getElementById('invoiceSortBtn');
    btn.addEventListener('click', toggleInvoiceSort);
    btn.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
    btn.addEventListener('touchend',   e => e.stopPropagation(), { passive: true });
}
