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
let pendingOpenId         = null;

const ICON_GROUP = `<svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" viewBox="0 0 24 24"><path d="M3 6h18M7 12h10M11 18h2"/></svg>`;
const ICON_LIST  = `<svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" viewBox="0 0 24 24"><path d="M3 6h18M3 12h18M3 18h18"/></svg>`;

// ─────────────────────────────────────────────
// LOAD
// ─────────────────────────────────────────────

export function markStale() { invoicesLoaded = false; }
export function isLoaded()  { return invoicesLoaded; }
export function queueOpen(id) { pendingOpenId = id; }
export async function openInvoiceById(id) {
    const inv = invoicesCache.find(i => i.id === id);
    if (!inv) return;
    const wrap = document.querySelector(`.invoice-card-wrap[data-invoice-id="${id}"]`);
    if (wrap) await toggleInvoiceCard(wrap, inv);
}

export async function loadInvoices() {
    invoicesLoaded        = true;
    invoicesAllLoaded     = false;
    invoicesCache         = [];
    invoicesRenderedCount = 0;
    const list = document.getElementById('invoicesList');
    list.innerHTML = '<div class="spinner"></div>';

    const { data, error } = await sb
        .from('invoices')
        .select('id, invoice_number, status, issued_date, subtotal, clients(name), entries(date), scheduled_emails(status)')
        .order('created_at', { ascending: false })
        .order('issued_date', { ascending: false });

    if (error || !data?.length) {
        list.innerHTML = '<p class="text-gray-400 text-sm py-8 text-center">No invoices yet</p>';
        return;
    }

    invoicesCache = data;
    updateSortBtnIcon();
    renderInvoices(invoicesCache);
    if (pendingOpenId) {
        const id = pendingOpenId;
        pendingOpenId = null;
        openInvoiceById(id);
    }
}

function loadMoreInvoices() {
    if (invoicesAllLoaded) return;

    const startIndex = invoicesRenderedCount;
    const batch = invoicesCache.slice(startIndex, startIndex + INVOICES_PAGE_SIZE);
    if (!batch.length) { invoicesAllLoaded = true; updateInvoicesLoadMoreSentinel(); return; }

    const list = document.getElementById('invoicesList');
    const sentinel = document.getElementById('invoicesLoadMore');

    if (invoicesSortMode === 'chronological') {
        const grp = list.querySelector('.card-group') || (() => {
            const g = document.createElement('div');
            g.className = 'card-group';
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
    const panel = document.getElementById('detailPanel');
    if (panel?.dataset.invoiceId) {
        panel.classList.remove('open');
        panel.innerHTML = '';
        delete panel.dataset.invoiceId;
        document.getElementById('viewSlider')?.classList.remove('detail-open');
    }

    if (invoicesSortMode === 'status') {
        const unpaid = data.filter(inv => inv.status !== 'paid');
        const paid   = data.filter(inv => inv.status === 'paid');
        let idx = 0;
        if (unpaid.length) {
            const hdr = document.createElement('div');
            hdr.className = 'card-header';
            hdr.innerHTML = `<span>Unpaid</span><span>${fmt(unpaid.reduce((s, inv) => s + invoiceSubtotal(inv), 0))}</span>`;
            list.appendChild(hdr);
            const grp = document.createElement('div');
            grp.className = 'card-group';
            unpaid.forEach(inv => grp.appendChild(buildInvoiceCard(inv, idx++)));
            list.appendChild(grp);
        }
        if (paid.length) {
            const hdr = document.createElement('div');
            hdr.className = 'card-header';
            hdr.innerHTML = `<span>Paid</span><span>${fmt(paid.reduce((s, inv) => s + invoiceSubtotal(inv), 0))}</span>`;
            list.appendChild(hdr);
            const grp = document.createElement('div');
            grp.className = 'card-group';
            paid.forEach(inv => grp.appendChild(buildInvoiceCard(inv, idx++)));
            list.appendChild(grp);
        }
    } else {
        const initial = data.slice(0, INVOICES_PAGE_SIZE);
        const grp = document.createElement('div');
        grp.className = 'card-group';
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
    const entriesTotal = inv.entries.reduce((s, e) => {
        const total = e.total_amount || 0;
        return s + (includeSuperInTotals ? total : total - (e.super_amount || 0));
    }, 0);
    const lineItemsTotal = (inv.invoice_line_items || []).reduce((s, li) => s + (parseFloat(li.amount) || 0), 0);
    return entriesTotal + lineItemsTotal;
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

    const emailRows   = inv.scheduled_emails || [];
    const hasPending  = emailRows.some(e => e.status === 'pending');
    const hasSent     = !hasPending && emailRows.some(e => e.status === 'sent');
    const emailIcon   = hasPending
        ? `<span class="email-icon-chip" style="background:var(--color-pending-bg);"><svg width="10" height="10" fill="none" stroke="var(--color-pending-icon)" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6l4 2"/></svg></span>`
        : hasSent
        ? `<span class="email-icon-chip" style="background:var(--color-sent-bg);"><svg width="10" height="10" fill="none" stroke="var(--color-sent-icon)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h8"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/><path d="m16 19 2 2 4-4"/></svg></span>`
        : '';

    const wrap = document.createElement('div');
    wrap.className = 'invoice-card-wrap';
    wrap.style.animationDelay = `${index * 40}ms`;
    wrap.dataset.invoiceId = inv.id;

    const row = document.createElement('div');
    row.className = 'invoice-row';
    row.innerHTML = `
        <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1.5">
                <span class="text-[15px] font-bold text-gray-800">${inv.invoice_number}</span>
                <span class="client-badge ${badgeColor}">${clientName}</span>
            </div>
            ${dateRange ? `<p class="text-[13px] text-gray-400 truncate">${dateRange}</p>` : ''}
        </div>
        <div class="flex flex-col items-end gap-1 shrink-0">
            <div id="emailIconWrap_${inv.id}" class="flex items-center gap-1.5">
                ${emailIcon}
                <span class="invoice-chip ${chipColor}">${statusLabel}</span>
            </div>
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

function _updateCardEmailIcon(invId) {
    const wrap = document.getElementById(`emailIconWrap_${invId}`);
    if (!wrap) return;
    const cached = invoicesCache.find(i => i.id === invId);
    const emailRows = cached?.scheduled_emails || [];
    const hasPending = emailRows.some(e => e.status === 'pending');
    const hasSent    = !hasPending && emailRows.some(e => e.status === 'sent');
    const chip = wrap.querySelector('.invoice-chip');
    wrap.innerHTML = '';
    if (hasPending) {
        wrap.insertAdjacentHTML('beforeend', `<span class="email-icon-chip" style="background:var(--color-pending-bg);"><svg width="10" height="10" fill="none" stroke="var(--color-pending-icon)" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6l4 2"/></svg></span>`);
    } else if (hasSent) {
        wrap.insertAdjacentHTML('beforeend', `<span class="email-icon-chip" style="background:var(--color-sent-bg);"><svg width="10" height="10" fill="none" stroke="var(--color-sent-icon)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h8"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/><path d="m16 19 2 2 4-4"/></svg></span>`);
    }
    if (chip) wrap.appendChild(chip);
}

function _isDesktop() { return window.innerWidth >= 768; }

async function toggleInvoiceCard(wrap, inv) {
    if (_isDesktop()) {
        await _openInvoiceDesktop(wrap, inv);
        return;
    }

    if (expandedInvoiceWrap && expandedInvoiceWrap !== wrap) {
        collapseInvoiceCard(expandedInvoiceWrap);
    }
    if (wrap.classList.contains('expanded')) {
        collapseInvoiceCard(wrap);
        return;
    }

    expandedInvoiceWrap = wrap;
    wrap.classList.add('expanded');
    await _populateInvoiceDetail(wrap.querySelector('.invoice-detail-inner'), inv);
}

async function _openInvoiceDesktop(wrap, inv) {
    const panel = document.getElementById('detailPanel');
    if (!panel) return;

    // Deselect previous
    document.querySelectorAll('.invoice-selected').forEach(el => el.classList.remove('invoice-selected'));

    // If clicking same invoice again, close
    if (panel.dataset.invoiceId === inv.id && panel.classList.contains('open')) {
        panel.classList.remove('open');
        panel.innerHTML = '';
        delete panel.dataset.invoiceId;
        document.getElementById('viewSlider')?.classList.remove('detail-open');
        return;
    }

    wrap.classList.add('invoice-selected');
    panel.dataset.invoiceId = inv.id;

    // Show header + spinner immediately
    const clientName = inv.clients?.name || '';
    panel.innerHTML = `
        <div class="invoice-panel-header">
            <div>
                <h3 id="invoicePanelHeader" class="invoice-panel-title">${escText(inv.invoice_number)}</h3>
                ${clientName ? `<span class="client-badge ${clientBadgeColor(clientName)}">${escText(clientName)}</span>` : ''}
            </div>
            <button id="invoicePanelClose" class="invoice-panel-close-btn">
                <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
        </div>
        <div id="invoicePanelBody" class="invoice-panel-body">
            <div class="spinner" style="margin:24px auto;width:24px;height:24px;"></div>
        </div>
        <div class="invoice-panel-footer">
            <button id="deleteBtn_${inv.id}" class="btn-destructive-ghost">
                <svg class="shake-icon" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                Delete Invoice
            </button>
        </div>`;
    panel.classList.add('open');
    document.getElementById('viewSlider')?.classList.add('detail-open');

    if (inv.status === 'draft') {
        _wireHeaderEdit(panel, inv);
    }

    panel.querySelector('#invoicePanelClose').addEventListener('click', () => {
        panel.classList.remove('open');
        panel.innerHTML = '';
        delete panel.dataset.invoiceId;
        document.getElementById('viewSlider')?.classList.remove('detail-open');
        document.querySelectorAll('.invoice-selected').forEach(el => el.classList.remove('invoice-selected'));
    });

    panel.querySelector(`#deleteBtn_${inv.id}`).addEventListener('click', () => openDeleteSheet(inv));

    await _fetchFullInvoice(inv);
    const body = panel.querySelector('#invoicePanelBody');
    if (!body) return; // panel was closed while loading
    _renderInvoicePanelBody(body, inv);
}

async function _fetchFullInvoice(inv) {
    const hasFullData = inv.entries?.some(e => e.total_amount != null);
    if (hasFullData) return;
    const { data: fullInv, error } = await sb
        .from('invoices')
        .select('*, clients(name, contact_name, email, address, suburb, pays_super, super_rate, rate_hourly, rate_hourly_photographer, rate_hourly_operator, entry_label, show_role), entries(id, date, description, total_amount, super_amount, base_amount, bonus_amount, day_type, workflow_type, shoot_client, role, hours_worked, billing_type_snapshot, skus, brand, start_time, finish_time, break_minutes), invoice_line_items(id, description, quantity, amount, sort_order)')
        .eq('id', inv.id)
        .single();
    if (!error && fullInv) {
        const idx = invoicesCache.findIndex(i => i.id === inv.id);
        if (idx !== -1) invoicesCache[idx] = fullInv;
        Object.assign(inv, fullInv);
    }
}

async function _recalcAndSaveInvoiceTotals(inv) {
    const { data: lineItems } = await sb.from('invoice_line_items').select('amount').eq('invoice_id', inv.id);
    const liTotal       = (lineItems || []).reduce((s, li) => s + (parseFloat(li.amount) || 0), 0);
    const entrySubtotal = (inv.entries || []).reduce((s, e) => s + (parseFloat(e.base_amount) || 0) + (parseFloat(e.bonus_amount) || 0), 0);
    const newSubtotal   = entrySubtotal + liTotal;
    const newTotal      = newSubtotal + (parseFloat(inv.super_amount) || 0);
    const { error }     = await sb.from('invoices').update({ subtotal: newSubtotal, total: newTotal }).eq('id', inv.id);
    if (error) throw error;
    inv.subtotal = newSubtotal;
    inv.total    = newTotal;
    const cached = invoicesCache.find(i => i.id === inv.id);
    if (cached) { cached.subtotal = newSubtotal; cached.total = newTotal; }
}

function _showAddLineItemForm(inv, container) {
    if (document.getElementById('lineItemForm')) return;
    const addBtn = document.getElementById(`addLineItemBtn_${inv.id}`);
    const form = document.createElement('div');
    form.id = 'lineItemForm';
    form.style.cssText = 'margin-top:8px; padding:12px; background:#f9fafb; border-radius:10px; border:1px solid #e5e7eb;';
    form.innerHTML = `
        <input id="li_desc" placeholder="Description (e.g. Hire: Ronin R5)"
               style="width:100%;padding:9px 10px;border:1px solid #e5e7eb;border-radius:8px;
                      font-size:14px;font-family:inherit;margin-bottom:8px;box-sizing:border-box;outline:none;"/>
        <div style="display:flex;gap:8px;margin-bottom:10px;min-width:0;">
            <input id="li_qty" placeholder="Qty (optional)" type="number" min="0" step="any"
                   style="flex:1;min-width:0;padding:9px 10px;border:1px solid #e5e7eb;border-radius:8px;
                          font-size:14px;font-family:inherit;box-sizing:border-box;outline:none;"/>
            <input id="li_amount" placeholder="Amount ($)" type="number" min="0" step="0.01"
                   style="flex:1;min-width:0;padding:9px 10px;border:1px solid #e5e7eb;border-radius:8px;
                          font-size:14px;font-family:inherit;box-sizing:border-box;outline:none;"/>
        </div>
        <div style="display:flex;gap:8px;">
            <button id="li_save" class="btn-row-action">Add</button>
            <button id="li_cancel" class="btn-row-cancel">Cancel</button>
        </div>`;
    addBtn.insertAdjacentElement('beforebegin', form);
    document.getElementById('li_desc').focus();
    document.getElementById('li_cancel').addEventListener('click', () => form.remove());
    document.getElementById('li_save').addEventListener('click', () => _saveLineItem(inv, form, container));
}

async function _saveLineItem(inv, formEl, container) {
    const desc   = document.getElementById('li_desc').value.trim();
    const qty    = document.getElementById('li_qty').value;
    const amount = parseFloat(document.getElementById('li_amount').value);
    if (!desc)              { document.getElementById('li_desc').focus();   return; }
    if (isNaN(amount) || amount <= 0) { document.getElementById('li_amount').focus(); return; }
    const saveBtn = document.getElementById('li_save');
    saveBtn.disabled = true;
    saveBtn.textContent = '…';
    try {
        const { data: { user } } = await sb.auth.getUser();
        const { error } = await sb.from('invoice_line_items').insert({
            invoice_id:  inv.id,
            user_id:     user.id,
            description: desc,
            quantity:    qty !== '' ? parseFloat(qty) : null,
            amount:      amount,
            sort_order:  inv.invoice_line_items?.length ?? 0,
        });
        if (error) throw error;
        await _recalcAndSaveInvoiceTotals(inv);
        formEl.remove();
        inv.entries = null; // force re-fetch to get new line item with server id
        await _fetchFullInvoice(inv);
        _renderInvoicePanelBody(container, inv);
    } catch (err) {
        alert('Error adding line item: ' + err.message);
        saveBtn.disabled = false;
        saveBtn.textContent = 'Add';
    }
}

async function _deleteLineItem(inv, lineItemId, container) {
    const { error } = await sb.from('invoice_line_items').delete().eq('id', lineItemId);
    if (error) { alert('Error removing line item: ' + error.message); return; }
    inv.invoice_line_items = (inv.invoice_line_items || []).filter(li => li.id !== lineItemId);
    await _recalcAndSaveInvoiceTotals(inv);
    _renderInvoicePanelBody(container, inv);
}

function _renderInvoicePanelBody(container, inv) {
    const entries = inv.entries;
    if (!entries?.length) {
        container.innerHTML = '<p class="text-gray-400 text-sm py-4 text-center">No entries linked</p>';
        return;
    }
    const sorted = [...entries].sort((a, b) => a.date < b.date ? -1 : 1);
    const { businessDetails } = getState();
    const includeSuperInTotals = businessDetails?.include_super_in_totals ?? true;
    const isDesktopPanel = !!container.closest('#detailPanel');

    // ── Section 1: Items & Billing ──
    let itemsHtml = '';
    sorted.forEach(e => {
        const desc   = entryDescription(e);
        const total  = e.total_amount || 0;
        const amount = fmt(includeSuperInTotals ? total : total - (e.super_amount || 0));
        const date   = formatEntryDate(e.date);
        itemsHtml += `
            <div class="flex justify-between items-center py-2.5 border-b border-slate-100">
                <div class="flex-1 min-w-0 mr-4">
                    <p class="text-[14px] font-semibold text-gray-800 truncate">${desc}</p>
                    <p class="text-[11px] text-gray-400 mt-0.5">${date}</p>
                </div>
                <span class="text-[14px] font-bold text-gray-700 shrink-0">${amount}</span>
            </div>`;
    });

    const lineItems = [...(inv.invoice_line_items || [])].sort((a, b) => a.sort_order - b.sort_order);
    lineItems.forEach(li => {
        const qtyLabel = li.quantity != null ? ` ×${li.quantity}` : '';
        itemsHtml += `
            <div class="flex justify-between items-center py-2.5 border-b border-slate-100">
                <div class="flex-1 min-w-0 mr-2">
                    <p class="text-[14px] font-semibold text-gray-800 truncate">${li.description}${qtyLabel}</p>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                    <span class="text-[14px] font-bold text-gray-700">${fmt(parseFloat(li.amount))}</span>
                    <button class="li-delete-btn" data-li-id="${li.id}"
                        style="background:none;border:none;cursor:pointer;padding:4px;color:#d1d5db;line-height:0;">
                        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                    </button>
                </div>
            </div>`;
    });

    const subtotal = invoiceSubtotal(inv);

    let html = `
        <div class="invoice-panel-section">
            <div class="invoice-section-header-row">
                <span class="invoice-section-header">Items &amp; Billing</span>
                <button id="addLineItemBtn_${inv.id}" class="btn-add-line-item">
                    <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
                    Add line item
                </button>
            </div>
            <div class="invoice-items-card">
                ${itemsHtml}
                <div class="invoice-items-total">
                    <span class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total excl. super</span>
                    <span class="text-[18px] font-black text-gray-900">${fmt(subtotal)}</span>
                </div>
            </div>
        </div>

        <div class="invoice-panel-section">
            <span class="invoice-section-header">Payment Status</span>
            <div id="statusRow_${inv.id}" class="invoice-status-seg">
                ${_buildStatusButtons(inv.status)}
            </div>
            <div class="invoice-date-grid">
                <div class="invoice-date-field">
                    <label>Issued</label>
                    <input type="date" id="issuedDateInput_${inv.id}" value="${inv.issued_date || ''}">
                </div>
                <div class="invoice-date-field">
                    <label>Paid</label>
                    <input type="date" id="paidDateInput_${inv.id}" value="${inv.paid_date || ''}">
                </div>
            </div>
        </div>

        <div class="invoice-panel-section">
            <span class="invoice-section-header">Communication</span>
            <div id="scheduledEmailBanner_${inv.id}"></div>
        </div>

        <div class="invoice-panel-section">
            <button id="previewBtn_${inv.id}" class="btn-primary" style="margin-bottom:8px;">
                <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                Preview Invoice
            </button>
            <button id="emailBtn_${inv.id}" class="btn-secondary">
                <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                Email Invoice
            </button>
        </div>`;

    if (!isDesktopPanel) {
        html += `
        <button id="deleteBtn_${inv.id}" class="btn-destructive" style="margin-top:6px;margin-bottom:4px;">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            Delete Invoice
        </button>`;
    }

    container.innerHTML = html;
    const issuedInput = document.getElementById(`issuedDateInput_${inv.id}`);
    if (issuedInput) issuedInput.addEventListener('change', () => _updateInvoiceDate(inv, 'issued_date', issuedInput.value));
    const paidInput = document.getElementById(`paidDateInput_${inv.id}`);
    if (paidInput) paidInput.addEventListener('change', () => _updateInvoiceDate(inv, 'paid_date', paidInput.value));
    container.querySelectorAll('.li-delete-btn').forEach(btn => {
        btn.addEventListener('click', () => _deleteLineItem(inv, btn.dataset.liId, container));
    });
    document.getElementById(`addLineItemBtn_${inv.id}`).addEventListener('click', () => _showAddLineItemForm(inv, container));
    container.querySelectorAll('.status-btn').forEach(btn => {
        btn.addEventListener('click', () => _updateInvoiceStatus(inv, btn.dataset.status, container));
    });
    document.getElementById(`previewBtn_${inv.id}`).addEventListener('click', () => openInvoicePreview(inv));
    document.getElementById(`emailBtn_${inv.id}`).addEventListener('click', () => openEmailComposeSheet(inv));
    if (!isDesktopPanel) {
        document.getElementById(`deleteBtn_${inv.id}`)?.addEventListener('click', () => openDeleteSheet(inv));
    }
    _loadScheduledEmailBanner(inv, container);
}

function _wireHeaderEdit(panel, inv) {
    const headerEl = panel.querySelector('#invoicePanelHeader');
    if (!headerEl) return;
    headerEl.style.cursor = inv.status === 'draft' ? 'text' : '';
    headerEl.addEventListener('click', function onClick() {
        if (inv.status !== 'draft') return;
        const currentH3 = panel.querySelector('#invoicePanelHeader');
        if (!currentH3) return;
        const input = document.createElement('input');
        input.value = inv.invoice_number;
        input.style.cssText = 'font-size:22px;font-weight:800;letter-spacing:-0.5px;color:#111827;font-family:inherit;border:none;outline:none;background:transparent;width:100%;padding:0;margin:0;';
        currentH3.replaceWith(input);
        input.focus();
        input.select();
        const restore = (save) => {
            const newVal = input.value.trim();
            if (save && newVal && newVal !== inv.invoice_number) _updateInvoiceNumber(inv, newVal);
            const h3 = document.createElement('h3');
            h3.id = 'invoicePanelHeader';
            h3.className = 'invoice-panel-title';
            h3.style.cursor = inv.status === 'draft' ? 'text' : '';
            h3.textContent = (save && newVal) ? newVal : inv.invoice_number;
            input.replaceWith(h3);
            h3.addEventListener('click', onClick);
        };
        input.addEventListener('blur', () => restore(true));
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') input.blur();
            if (e.key === 'Escape') { input.value = inv.invoice_number; restore(false); }
        });
    });
}

async function _updateInvoiceDate(inv, field, value) {
    const newValue = value || null;
    const { error } = await sb.from('invoices').update({ [field]: newValue }).eq('id', inv.id);
    if (error) { alert('Error saving date: ' + error.message); return; }
    inv[field] = newValue;
    const cached = invoicesCache.find(i => i.id === inv.id);
    if (cached) cached[field] = newValue;
}

async function _updateInvoiceNumber(inv, newNumber) {
    newNumber = (newNumber || '').trim();
    if (!newNumber || newNumber === inv.invoice_number) return;
    const { error } = await sb.from('invoices').update({ invoice_number: newNumber }).eq('id', inv.id);
    if (error) {
        const input = document.getElementById(`invoiceNumberInput_${inv.id}`);
        if (input) input.value = inv.invoice_number;
        alert('Could not update invoice number: ' + (error.message.includes('unique') ? 'that number is already in use.' : error.message));
        return;
    }
    inv.invoice_number = newNumber;
    const cached = invoicesCache.find(i => i.id === inv.id);
    if (cached) cached.invoice_number = newNumber;
    // Update card row
    const cardSpan = document.querySelector(`.invoice-card-wrap[data-invoice-id="${inv.id}"] .text-\\[15px\\].font-bold`);
    if (cardSpan) cardSpan.textContent = newNumber;
    // Update desktop panel header
    const header = document.querySelector('#detailPanel #invoicePanelHeader');
    if (header) header.textContent = newNumber;
}

function _buildStatusButtons(currentStatus) {
    const statuses = [
        { value: 'draft',  label: 'Draft'  },
        { value: 'issued', label: 'Issued' },
        { value: 'paid',   label: 'Paid'   },
    ];
    return statuses.map(s =>
        `<button class="status-btn${s.value === currentStatus ? ' active' : ''}" data-status="${s.value}">${s.label}</button>`
    ).join('');
}

async function _updateInvoiceStatus(inv, newStatus, container) {
    if (inv.status === newStatus) return;
    const { error } = await sb.from('invoices').update({ status: newStatus }).eq('id', inv.id);
    if (error) { alert('Error updating status: ' + error.message); return; }
    inv.status = newStatus;
    const cached = invoicesCache.find(i => i.id === inv.id);
    if (cached) cached.status = newStatus;
    // Update status buttons in place
    const row = document.getElementById(`statusRow_${inv.id}`);
    if (row) row.innerHTML = _buildStatusButtons(newStatus);
    row?.querySelectorAll('.status-btn').forEach(btn => {
        btn.addEventListener('click', () => _updateInvoiceStatus(inv, btn.dataset.status, container));
    });
    // Update header cursor to reflect new editability
    const panelHeader = document.querySelector('#detailPanel #invoicePanelHeader');
    if (panelHeader) panelHeader.style.cursor = newStatus === 'draft' ? 'text' : '';
    // Update the chip on the invoice card
    const chip = document.querySelector(`.invoice-selected .invoice-chip`) ||
                 document.querySelector(`.expanded .invoice-chip`);
    if (chip) {
        const colors = { draft: 'bg-gray-100 text-gray-500', issued: 'bg-orange-100 text-orange-600', paid: 'bg-green-100 text-green-600' };
        chip.className = `invoice-chip ${colors[newStatus] || 'bg-gray-100 text-gray-500'}`;
        chip.textContent = newStatus.charAt(0).toUpperCase() + newStatus.slice(1);
    }
}

async function _populateInvoiceDetail(inner, inv) {
    inner.innerHTML = '<div class="spinner" style="margin:16px auto;width:24px;height:24px;"></div>';
    await _fetchFullInvoice(inv);
    _renderInvoicePanelBody(inner, inv);
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
            let rateHourly;
            if (client.show_role && e.role) {
                rateHourly = e.role.toLowerCase() === 'operator'
                    ? parseFloat(client.rate_hourly_operator) || parseFloat(client.rate_hourly) || 0
                    : parseFloat(client.rate_hourly_photographer) || parseFloat(client.rate_hourly) || 0;
            } else {
                rateHourly = parseFloat(client.rate_hourly) || 0;
            }
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
    const customLineItems = [...(inv.invoice_line_items || [])].sort((a, b) => a.sort_order - b.sort_order);
    for (const li of customLineItems) {
        const qtyStr = li.quantity != null ? `${li.quantity}×` : '';
        html += `<tr><td class="col-date">—</td><td class="col-item">${li.description}</td><td class="col-qty">${qtyStr}</td><td class="col-rate"></td><td class="col-amount">${fmtInvoiceAmount(li.amount)}</td></tr>\n`;
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
    const clientLines = [client.email, client.address, client.suburb]
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
// EMAIL INVOICE
// ─────────────────────────────────────────────

function openEmailComposeSheet(inv, prefill = null) {
    const existing = document.getElementById('invoiceEmailSheet');
    if (existing) existing.remove();

    const { businessDetails } = getState();
    const biz    = businessDetails || {};
    const client = inv.clients || {};

    const defaultTo      = prefill?.to      || client.email || '';
    const defaultSubject = prefill?.subject  || `Invoice ${inv.invoice_number}`;
    const defaultBody    = prefill?.body     || `Hi ${client.contact_name || client.name || ''},\n\nPlease find Invoice ${inv.invoice_number} attached.\n\nKind regards,\n${biz.name || biz.business_name || ''}`.trim();

    const isCurrentlyDraft = inv.status === 'draft';

    const sheet = document.createElement('div');
    sheet.id = 'invoiceEmailSheet';
    sheet.style.cssText = 'position:fixed;inset:0;z-index:1000;display:flex;flex-direction:column;';
    sheet.innerHTML = `
        <div id="invoiceEmailPanel" style="position:relative;background:#fff;flex:1;display:flex;flex-direction:column;padding:calc(24px + env(safe-area-inset-top)) 20px calc(32px + env(safe-area-inset-bottom));transform:translateY(100%);transition:transform 0.3s cubic-bezier(0.4,0,0.2,1);overflow-y:auto;">
            <p style="font-size:13px;font-weight:600;color:#9ca3af;text-align:center;margin:0 0 20px;letter-spacing:0.05em;text-transform:uppercase;">Email ${inv.invoice_number}</p>

            <div style="margin-bottom:12px;">
                <label style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;display:block;margin-bottom:4px;">To</label>
                <input id="emailTo" type="email" value="${escAttr(defaultTo)}"
                    style="width:100%;padding:10px 12px;border:1.5px solid #e5e7eb;border-radius:10px;font-size:15px;font-family:inherit;color:#111827;outline:none;box-sizing:border-box;" />
            </div>

            <div style="margin-bottom:12px;">
                <label style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;display:block;margin-bottom:4px;">Subject</label>
                <input id="emailSubject" type="text" value="${escAttr(defaultSubject)}"
                    style="width:100%;padding:10px 12px;border:1.5px solid #e5e7eb;border-radius:10px;font-size:15px;font-family:inherit;color:#111827;outline:none;box-sizing:border-box;" />
            </div>

            <div style="flex:1;display:flex;flex-direction:column;margin-bottom:16px;">
                <label style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;display:block;margin-bottom:4px;">Message</label>
                <textarea id="emailBody"
                    style="flex:1;width:100%;padding:10px 12px;border:1.5px solid #e5e7eb;border-radius:10px;font-size:15px;font-family:inherit;color:#111827;outline:none;box-sizing:border-box;resize:none;line-height:1.5;">${escText(defaultBody)}</textarea>
            </div>

            <style>
                #emailBottomRow { display:flex; flex-direction:column; gap:10px; }
                #emailButtons   { display:flex; gap:10px; }
                @media (min-width: 640px) {
                    #emailBottomRow { flex-direction:row; align-items:center; }
                    #emailMarkIssued-label { margin-bottom:0; flex:1; }
                    #emailButtons { flex-shrink:0; }
                    #emailButtons button { width:120px; }
                }
            </style>
            <div id="emailBottomRow">
                <label id="emailMarkIssued-label" style="display:flex;align-items:center;gap:10px;cursor:pointer;">
                    <input id="emailMarkIssued" type="checkbox" ${isCurrentlyDraft ? 'checked' : ''}
                        style="width:18px;height:18px;accent-color:#111827;cursor:pointer;flex-shrink:0;" />
                    <span style="font-size:14px;font-weight:500;color:#374151;">Mark as Issued after sending</span>
                </label>
                <div id="emailButtons">
                    <button id="emailCancelBtn" class="btn-ghost" style="flex:1;">Cancel</button>
                    <button id="emailSendBtn" class="btn-primary" style="flex:1;">
                        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                        Send
                    </button>
                </div>
            </div>

            <div style="margin-top:16px;border-top:1px solid #f3f4f6;padding-top:14px;">
                <label style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;display:block;margin-bottom:6px;">Schedule for later (optional)</label>
                <input type="datetime-local" id="emailScheduleTime"
                    style="width:100%;padding:10px 12px;border:1.5px solid #e5e7eb;border-radius:10px;font-size:15px;font-family:inherit;color:#111827;outline:none;box-sizing:border-box;" />
            </div>
        </div>`;

    document.body.appendChild(sheet);
    requestAnimationFrame(() => requestAnimationFrame(() => {
        document.getElementById('invoiceEmailPanel').style.transform = 'translateY(0)';
    }));

    const close = () => {
        document.getElementById('invoiceEmailPanel').style.transform = 'translateY(100%)';
        setTimeout(() => sheet.remove(), 300);
    };

    document.getElementById('emailCancelBtn').addEventListener('click', close);

    // Update Send button label when schedule time changes
    document.getElementById('emailScheduleTime').addEventListener('input', () => {
        const val = document.getElementById('emailScheduleTime').value;
        const sendBtn = document.getElementById('emailSendBtn');
        if (val) {
            const d = new Date(val);
            const label = d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
            sendBtn.innerHTML = `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6l4 2"/></svg> Send ${label}`;
        } else {
            sendBtn.innerHTML = `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg> Send`;
        }
    });

    document.getElementById('emailSendBtn').addEventListener('click', async () => {
        const to           = document.getElementById('emailTo').value.trim();
        const subject      = document.getElementById('emailSubject').value.trim();
        const bodyText     = document.getElementById('emailBody').value.trim();
        const markIssued   = document.getElementById('emailMarkIssued').checked;
        const scheduleVal  = document.getElementById('emailScheduleTime').value;
        const scheduledFor = scheduleVal ? new Date(scheduleVal).toISOString() : null;

        if (!to)      { document.getElementById('emailTo').focus();      return; }
        if (!subject) { document.getElementById('emailSubject').focus(); return; }

        const sendBtn = document.getElementById('emailSendBtn');
        sendBtn.disabled = true;
        sendBtn.innerHTML = '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="animation:spin 0.8s linear infinite"><path stroke-linecap="round" stroke-linejoin="round" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 100 16 8 8 0 01-8-8z"/></svg> ' + (scheduledFor ? 'Scheduling…' : 'Sending…');

        const err = await _sendInvoiceEmail(inv, to, subject, bodyText, markIssued, scheduledFor);
        if (err) {
            sendBtn.disabled = false;
            sendBtn.innerHTML = `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg> Send`;
            alert('Failed: ' + err);
            return;
        }

        close();
        if (scheduledFor) {
            const d = new Date(scheduleVal);
            _showToast(`Scheduled for ${d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`);
        } else {
            _showToast(`Invoice emailed to ${to}`);
        }
    });
}

async function _sendInvoiceEmail(inv, to, subject, bodyText, markIssued, scheduledFor = null) {
    const supabaseUrl = 'https://cmbycqzjlwvydemaxrtb.supabase.co';
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return 'Not authenticated';

    const invoiceHTML = buildInvoiceHTML(inv);
    const filename    = `${inv.invoice_number}.pdf`;

    try {
        const payload = { to, subject, body_text: bodyText, invoice_html: invoiceHTML, filename, invoice_id: inv.id };
        if (scheduledFor) { payload.scheduled_for = scheduledFor; payload.mark_issued = markIssued; }
        const res = await fetch(`${supabaseUrl}/functions/v1/send-invoice-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
            body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok || json.error) return json.error || `Server error ${res.status}`;
        if (json.scheduled) {
            const cached = invoicesCache.find(i => i.id === inv.id);
            if (cached) { if (!cached.scheduled_emails) cached.scheduled_emails = []; cached.scheduled_emails.push({ status: 'pending' }); }
            _updateCardEmailIcon(inv.id);
            return null; // scheduled — skip the mark-issued block below
        }
    } catch (err) {
        return err.message;
    }

    if (markIssued && inv.status !== 'issued') {
        const { error } = await sb.from('invoices').update({ status: 'issued' }).eq('id', inv.id);
        if (!error) {
            inv.status = 'issued';
            const cached = invoicesCache.find(i => i.id === inv.id);
            if (cached) cached.status = 'issued';
            // Refresh the status buttons if the panel is still open
            const statusRow = document.getElementById(`statusRow_${inv.id}`);
            if (statusRow) {
                statusRow.innerHTML = _buildStatusButtons('issued');
                statusRow.querySelectorAll('.status-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const body = document.getElementById(`invoicePanelBody`) ||
                                     statusRow.closest('.invoice-detail-inner');
                        _updateInvoiceStatus(inv, btn.dataset.status, body);
                    });
                });
            }
            // Update card chip
            const chip = document.querySelector(`.invoice-selected .invoice-chip`) ||
                         document.querySelector(`.expanded .invoice-chip`);
            if (chip) {
                chip.className = 'invoice-chip bg-orange-100 text-orange-600';
                chip.textContent = 'Issued';
            }
        }
    }

    const cachedForSent = invoicesCache.find(i => i.id === inv.id);
    if (cachedForSent) { if (!cachedForSent.scheduled_emails) cachedForSent.scheduled_emails = []; cachedForSent.scheduled_emails.push({ status: 'sent' }); }
    _updateCardEmailIcon(inv.id);
    return null; // success
}

function _showToast(message) {
    const existing = document.getElementById('invoiceToast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.id = 'invoiceToast';
    toast.textContent = message;
    toast.style.cssText = 'position:fixed;bottom:calc(5.5rem + env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);background:#111827;color:#fff;padding:10px 18px;border-radius:20px;font-size:14px;font-weight:500;font-family:inherit;z-index:2000;white-space:nowrap;box-shadow:0 4px 16px rgba(0,0,0,0.18);opacity:0;transition:opacity 0.2s;pointer-events:none;';
    document.body.appendChild(toast);
    requestAnimationFrame(() => requestAnimationFrame(() => { toast.style.opacity = '1'; }));
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 200);
    }, 3000);
}

function escAttr(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escText(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─────────────────────────────────────────────
// SCHEDULED EMAIL BANNER
// ─────────────────────────────────────────────

async function _loadScheduledEmailBanner(inv, container) {
    if (!inv.id) return;
    const slot = document.getElementById(`scheduledEmailBanner_${inv.id}`);
    if (!slot) return;

    const { data } = await sb
        .from('scheduled_emails')
        .select('id, to_address, subject, body_text, scheduled_for, sent_at, status, error')
        .eq('invoice_id', inv.id)
        .in('status', ['pending', 'failed', 'sent'])
        .order('created_at', { ascending: false })
        .limit(1);

    const row = data?.[0];
    if (!row) return;

    if (row.status === 'sent') {
        const d = new Date(row.sent_at);
        const dateStr = d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
        slot.innerHTML = `
            <div style="padding:12px 14px;background:var(--color-sent-bg);border:1.5px solid var(--color-sent-border);border-radius:12px;">
                <p style="font-size:13px;font-weight:600;color:var(--color-sent-text);margin:0;display:flex;align-items:center;gap:6px;">
                    <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h8"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/><path d="m16 19 2 2 4-4"/></svg>
                    Sent to ${escText(row.to_address)} · ${escText(dateStr)}
                </p>
            </div>`;
        return;
    }

    if (row.status === 'pending') {
        const d = new Date(row.scheduled_for);
        const dateStr = d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
        slot.innerHTML = `
            <div id="schedBannerWrap" style="padding:12px 14px;background:var(--color-pending-bg);border:1.5px solid var(--color-pending-border);border-radius:12px;cursor:pointer;">
                <p style="font-size:13px;font-weight:600;color:var(--color-pending-text);margin:0;display:flex;align-items:center;gap:6px;">
                    <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6l4 2"/></svg>
                    Scheduled to send ${escText(dateStr)}
                </p>
                <div id="schedBannerButtons" style="display:none;gap:8px;margin-top:10px;">
                    <button id="schedBannerSendNow" class="btn-banner-warn">Send now</button>
                    <button id="schedBannerEdit"    class="btn-banner-warn">Edit</button>
                    <button id="schedBannerCancel"  class="btn-banner-warn">Cancel</button>
                </div>
            </div>`;

        slot.querySelector('#schedBannerWrap').addEventListener('click', (e) => {
            if (e.target.closest('button')) return; // let button clicks pass through
            const btns = slot.querySelector('#schedBannerButtons');
            btns.style.display = btns.style.display === 'none' ? 'flex' : 'none';
        });

        slot.querySelector('#schedBannerSendNow').addEventListener('click', async () => {
            const btn = slot.querySelector('#schedBannerSendNow');
            btn.disabled = true; btn.textContent = 'Sending…';
            const err = await _sendInvoiceEmail(inv, row.to_address, row.subject, row.body_text, false, null);
            if (err) { btn.disabled = false; btn.textContent = 'Send now'; alert('Failed to send: ' + err); return; }
            await sb.from('scheduled_emails').update({ status: 'cancelled' }).eq('id', row.id);
            const cachedSN = invoicesCache.find(i => i.id === inv.id);
            if (cachedSN) cachedSN.scheduled_emails = (cachedSN.scheduled_emails || []).filter(e => e.status !== 'pending');
            _updateCardEmailIcon(inv.id);
            slot.innerHTML = '';
            _showToast(`Invoice emailed to ${row.to_address}`);
        });

        slot.querySelector('#schedBannerEdit').addEventListener('click', async () => {
            await sb.from('scheduled_emails').update({ status: 'cancelled' }).eq('id', row.id);
            const cachedEdit = invoicesCache.find(i => i.id === inv.id);
            if (cachedEdit) cachedEdit.scheduled_emails = (cachedEdit.scheduled_emails || []).filter(e => e.status !== 'pending');
            _updateCardEmailIcon(inv.id);
            slot.innerHTML = '';
            openEmailComposeSheet(inv, { to: row.to_address, subject: row.subject, body: row.body_text });
        });

        slot.querySelector('#schedBannerCancel').addEventListener('click', async () => {
            await sb.from('scheduled_emails').update({ status: 'cancelled' }).eq('id', row.id);
            const cachedCancel = invoicesCache.find(i => i.id === inv.id);
            if (cachedCancel) cachedCancel.scheduled_emails = (cachedCancel.scheduled_emails || []).filter(e => e.status !== 'pending');
            _updateCardEmailIcon(inv.id);
            slot.innerHTML = '';
        });

    } else { // failed
        slot.innerHTML = `
            <div style="padding:12px 14px;background:var(--color-error-bg);border:1.5px solid var(--color-error-border);border-radius:12px;">
                <p style="font-size:13px;font-weight:600;color:var(--color-error-text);margin:0 0 4px;display:flex;align-items:center;gap:6px;">
                    <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4m0 4h.01"/></svg>
                    Scheduled send failed
                </p>
                ${row.error ? `<p style="font-size:12px;color:var(--color-error-icon);margin:0 0 10px;">${escText(row.error)}</p>` : '<p style="margin:0 0 10px;"></p>'}
                <div style="display:flex;gap:8px;">
                    <button id="schedBannerEdit"   class="btn-banner-error">Retry / Edit</button>
                    <button id="schedBannerCancel" class="btn-banner-error">Dismiss</button>
                </div>
            </div>`;

        slot.querySelector('#schedBannerEdit').addEventListener('click', async () => {
            await sb.from('scheduled_emails').update({ status: 'cancelled' }).eq('id', row.id);
            const cachedEdit = invoicesCache.find(i => i.id === inv.id);
            if (cachedEdit) cachedEdit.scheduled_emails = (cachedEdit.scheduled_emails || []).filter(e => e.status !== 'pending');
            _updateCardEmailIcon(inv.id);
            slot.innerHTML = '';
            openEmailComposeSheet(inv, { to: row.to_address, subject: row.subject, body: row.body_text });
        });

        slot.querySelector('#schedBannerCancel').addEventListener('click', async () => {
            await sb.from('scheduled_emails').update({ status: 'cancelled' }).eq('id', row.id);
            const cachedCancel = invoicesCache.find(i => i.id === inv.id);
            if (cachedCancel) cachedCancel.scheduled_emails = (cachedCancel.scheduled_emails || []).filter(e => e.status !== 'pending');
            _updateCardEmailIcon(inv.id);
            slot.innerHTML = '';
        });
    }
}

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
            <button id="deleteInvoiceOnly" class="btn-secondary" style="margin-bottom:10px;">
                Delete invoice only (keep entries)
            </button>
            <button id="deleteInvoiceAndEntries" class="btn-destructive" style="margin-bottom:16px;">
                Delete invoice and entries
            </button>
            <button id="deleteInvoiceCancel" class="btn-ghost">Cancel</button>
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
