// ─────────────────────────────────────────────
// EXPENSES MODULE
// Handles: listing, creating, editing, deleting expenses + receipt storage
// ─────────────────────────────────────────────

import { fmt, localDateStr } from './utils.js';

let sb, getState;

export function init(supabase, stateGetter) {
    sb = supabase;
    getState = stateGetter;
}

// ── State ─────────────────────────────────────
let expensesLoaded = false;
let expensesData   = [];
let fyStartYear    = _currentFYStartYear();
let categoryFilter = '';
let expandedExpenseWrap = null;
let _newExpenseBtnBound = false;

// ── Category config ───────────────────────────
const CATEGORIES = [
    { value: 'gear',            label: 'Gear',           color: 'bg-purple-100 text-purple-700' },
    { value: 'gear_consumable', label: 'Consumables',    color: 'bg-indigo-100 text-indigo-700' },
    { value: 'gear_hire',       label: 'Gear Hire',      color: 'bg-blue-100 text-blue-700'     },
    { value: 'lab',             label: 'Lab',            color: 'bg-cyan-100 text-cyan-700'     },
    { value: 'education',       label: 'Education',      color: 'bg-emerald-100 text-emerald-700'},
    { value: 'software',        label: 'Software',       color: 'bg-teal-100 text-teal-700'     },
    { value: 'travel',          label: 'Travel',         color: 'bg-orange-100 text-orange-700' },
    { value: 'office',          label: 'Office',         color: 'bg-yellow-100 text-yellow-700' },
    { value: 'other',           label: 'Other',          color: 'bg-gray-100 text-gray-600'     },
];

function _catInfo(value) {
    return CATEGORIES.find(c => c.value === value) || CATEGORIES[CATEGORIES.length - 1];
}

// ── FY helpers ────────────────────────────────
function _currentFYStartYear() {
    const now = new Date();
    const m   = now.getMonth() + 1; // 1–12
    return m >= 7 ? now.getFullYear() : now.getFullYear() - 1;
}
function _fyStart(y) { return `${y}-07-01`; }
function _fyEnd(y)   { return `${y + 1}-06-30`; }
function _fyLabel(y) { return `FY ${y}–${String(y + 1).slice(-2)}`; }

// ── Filtered view ─────────────────────────────
function _filtered() {
    if (!categoryFilter) return expensesData;
    return expensesData.filter(e => e.category === categoryFilter);
}
function _total() {
    return _filtered().reduce((s, e) => s + parseFloat(e.amount || 0), 0);
}

function _isDesktop() { return window.innerWidth >= 768; }

// ─────────────────────────────────────────────
// LOAD
// ─────────────────────────────────────────────

export async function loadExpenses() {
    if (expensesLoaded) return;
    expensesLoaded = true;

    // Bind the header "New Expense" button once
    if (!_newExpenseBtnBound) {
        const btn = document.getElementById('newExpenseBtn');
        if (btn) {
            btn.addEventListener('click', () => _openForm(null));
            _newExpenseBtnBound = true;
        }
    }

    await _fetchAndRender();
}

export function markStale() { expensesLoaded = false; }

async function _fetchAndRender() {
    const container = document.getElementById('expensesContent');
    if (!container) return;
    container.innerHTML = '<div class="spinner"></div>';

    const { data, error } = await sb.from('expenses')
        .select('*')
        .gte('date', _fyStart(fyStartYear))
        .lte('date', _fyEnd(fyStartYear))
        .order('date', { ascending: false });

    if (error) {
        container.innerHTML = `<p style="color:#ef4444; font-size:14px; padding:32px 0; text-align:center;">${_esc(error.message)}</p>`;
        return;
    }

    expensesData = data || [];
    _render();
}

// ─────────────────────────────────────────────
// RENDER
// ─────────────────────────────────────────────

function _render() {
    const container = document.getElementById('expensesContent');
    if (!container) return;

    // Close any open detail panel from previous render
    expandedExpenseWrap = null;
    if (_isDesktop()) {
        const panel = document.getElementById('detailPanel');
        if (panel?.dataset.expenseId) {
            panel.classList.remove('open');
            panel.innerHTML = '';
            delete panel.dataset.expenseId;
            document.getElementById('viewSlider')?.classList.remove('detail-open');
        }
    }

    const filtered = _filtered();
    const total    = _total();

    // Build available FY years (current + past 3)
    const currentFY = _currentFYStartYear();
    const fyOptions = [0, 1, 2, 3].map(n => currentFY - n)
        .map(y => `<option value="${y}" ${y === fyStartYear ? 'selected' : ''}>${_fyLabel(y)}</option>`)
        .join('');

    // Category filter options
    const catOptions = `<option value="">All categories</option>` +
        CATEGORIES.map(c => `<option value="${c.value}" ${c.value === categoryFilter ? 'selected' : ''}>${c.label}</option>`).join('');

    // Inject filters + total banner + list container
    container.innerHTML = `
        <!-- Filters -->
        <div style="display:flex; gap:10px; margin-bottom:16px; flex-wrap:wrap; align-items:center;">
            <select id="expFYPicker" style="flex:1; min-width:140px; background:#f3f4f6; border:none; border-radius:10px; padding:10px 14px; font-size:15px; font-family:inherit; color:#111827; cursor:pointer;">
                ${fyOptions}
            </select>
            <select id="expCatFilter" style="flex:1; min-width:160px; background:#f3f4f6; border:none; border-radius:10px; padding:10px 14px; font-size:15px; font-family:inherit; color:#111827; cursor:pointer;">
                ${catOptions}
            </select>
        </div>

        <!-- Total banner -->
        <div style="background:#f9fafb; border-radius:12px; padding:14px 18px; margin-bottom:20px; display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:14px; color:#6b7280;">${_fyLabel(fyStartYear)}${categoryFilter ? ' · ' + _catInfo(categoryFilter).label : ''}</span>
            <span style="font-size:20px; font-weight:700; color:#111827; font-variant-numeric:tabular-nums;">${fmt(total)}</span>
        </div>

        <!-- Expense list -->
        <div id="expenseList" class="card-group"></div>
    `;

    const list = document.getElementById('expenseList');

    if (filtered.length === 0) {
        list.innerHTML = `<div style="text-align:center; color:#8e8e93; font-size:15px; padding:48px 24px;">No expenses for ${_fyLabel(fyStartYear)}${categoryFilter ? ' · ' + _catInfo(categoryFilter).label : ''}.</div>`;
    } else {
        const groupWrap = document.createElement('div');
        groupWrap.style.cssText = 'background:#fff; border-radius:14px; overflow:hidden; border:1px solid #e5e7eb;';

        filtered.forEach((expense, index) => {
            const wrap = _buildExpenseCard(expense, index, filtered.length);
            groupWrap.appendChild(wrap);
        });

        list.appendChild(groupWrap);
    }

    _bindFilterHandlers();
}

function _buildExpenseCard(expense, index, total) {
    const cat      = _catInfo(expense.category);
    const date     = _fmtDate(expense.date);
    const amount   = fmt(expense.amount);
    const hasReceipt = !!expense.receipt_path;
    const isLast   = index === total - 1;

    const wrap = document.createElement('div');
    wrap.className = 'expense-card-wrap';
    wrap.dataset.expenseId = expense.id;

    // Row
    const row = document.createElement('div');
    row.className = 'expense-row';
    row.style.cssText = `display:flex; align-items:center; padding:14px 16px; cursor:pointer; gap:12px;${!isLast ? ' border-bottom:1px solid #f3f4f6;' : ''}`;
    row.innerHTML = `
        <div style="flex:1; min-width:0;">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                <span style="font-size:12px; font-weight:600; padding:2px 8px; border-radius:20px; white-space:nowrap;" class="${cat.color}">${cat.label}</span>
                ${hasReceipt ? `<svg width="13" height="13" fill="none" stroke="#9ca3af" stroke-width="2" viewBox="0 0 24 24" title="Has receipt"><path stroke-linecap="round" stroke-linejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>` : ''}
            </div>
            <div style="font-size:15px; font-weight:500; color:#111827; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${_esc(expense.description)}</div>
            <div style="font-size:13px; color:#8e8e93; margin-top:2px;">${date}</div>
        </div>
        <div style="text-align:right; flex-shrink:0;">
            <div style="font-size:16px; font-weight:600; color:#111827; font-variant-numeric:tabular-nums;">${amount}</div>
            ${expense.gst_included ? `<div style="font-size:11px; color:#9ca3af; margin-top:2px;">incl. GST</div>` : ''}
        </div>
        <svg width="16" height="16" fill="none" stroke="#c7c7cc" stroke-width="2" viewBox="0 0 24 24" style="flex-shrink:0;"><path stroke-linecap="round" stroke-linejoin="round" d="M9 18l6-6-6-6"/></svg>
    `;

    // Inline detail panel (mobile only — hidden on desktop via CSS)
    const detailPanel = document.createElement('div');
    detailPanel.className = 'expense-detail-panel';
    const detailInner = document.createElement('div');
    detailInner.className = 'expense-detail-inner';
    detailPanel.appendChild(detailInner);

    row.addEventListener('click', () => _toggleExpenseCard(wrap, expense));
    wrap.appendChild(row);
    wrap.appendChild(detailPanel);

    return wrap;
}

// ─────────────────────────────────────────────
// DETAIL CARD — toggle / open
// ─────────────────────────────────────────────

async function _toggleExpenseCard(wrap, expense) {
    if (_isDesktop()) {
        await _openExpenseDesktop(wrap, expense);
        return;
    }

    // Mobile: expand in place
    if (expandedExpenseWrap && expandedExpenseWrap !== wrap) {
        _collapseExpenseCard(expandedExpenseWrap);
    }
    if (wrap.classList.contains('expanded')) {
        _collapseExpenseCard(wrap);
        return;
    }

    expandedExpenseWrap = wrap;
    wrap.classList.add('expanded');
    const inner = wrap.querySelector('.expense-detail-inner');
    _populateExpenseDetail(inner, expense);
}

function _collapseExpenseCard(wrap) {
    wrap.classList.remove('expanded');
    if (expandedExpenseWrap === wrap) expandedExpenseWrap = null;
}

async function _openExpenseDesktop(wrap, expense) {
    const panel = document.getElementById('detailPanel');
    if (!panel) return;

    // Deselect previous
    document.querySelectorAll('.expense-selected').forEach(el => el.classList.remove('expense-selected'));

    // If clicking same expense again, close
    if (panel.dataset.expenseId === expense.id && panel.classList.contains('open')) {
        panel.classList.remove('open');
        panel.innerHTML = '';
        delete panel.dataset.expenseId;
        document.getElementById('viewSlider')?.classList.remove('detail-open');
        return;
    }

    wrap.classList.add('expense-selected');
    panel.dataset.expenseId = expense.id;

    const cat = _catInfo(expense.category);

    panel.innerHTML = `
        <div class="invoice-panel-header">
            <div>
                <h3 class="invoice-panel-title">${_esc(expense.description)}</h3>
                <span style="font-size:12px; font-weight:600; padding:2px 10px; border-radius:20px; display:inline-block; margin-top:2px;" class="${cat.color}">${cat.label}</span>
            </div>
            <button id="expensePanelClose" class="invoice-panel-close-btn">
                <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
        </div>
        <div id="expensePanelBody" class="invoice-panel-body">
            <div class="spinner" style="margin:24px auto;width:24px;height:24px;"></div>
        </div>
        <div class="invoice-panel-footer">
            <button id="expensePanelDelete" class="btn-destructive-ghost">
                <svg class="shake-icon" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                Delete Expense
            </button>
        </div>`;

    panel.classList.add('open');
    document.getElementById('viewSlider')?.classList.add('detail-open');

    panel.querySelector('#expensePanelClose').addEventListener('click', () => {
        panel.classList.remove('open');
        panel.innerHTML = '';
        delete panel.dataset.expenseId;
        document.getElementById('viewSlider')?.classList.remove('detail-open');
        document.querySelectorAll('.expense-selected').forEach(el => el.classList.remove('expense-selected'));
    });

    panel.querySelector('#expensePanelDelete').addEventListener('click', () => {
        if (!confirm(`Delete "${expense.description}"?`)) return;
        _deleteExpense(expense);
    });

    const body = panel.querySelector('#expensePanelBody');
    _populateExpenseDetail(body, expense);
}

function _populateExpenseDetail(container, expense) {
    const cat    = _catInfo(expense.category);
    const amount = parseFloat(expense.amount || 0);
    const gst    = expense.gst_included ? amount / 11 : 0;
    const exGST  = expense.gst_included ? amount * 10 / 11 : amount;

    const gstRows = expense.gst_included ? `
        <div class="expense-detail-row">
            <span class="expense-detail-label">GST</span>
            <span class="expense-detail-value">${fmt(gst)}</span>
        </div>
        <div class="expense-detail-row">
            <span class="expense-detail-label">Ex-GST</span>
            <span class="expense-detail-value">${fmt(exGST)}</span>
        </div>
    ` : '';

    const notesRow = expense.notes ? `
        <div style="margin-top:12px; padding-top:12px; border-top:1px solid #f3f4f6;">
            <div style="font-size:12px; font-weight:600; color:#9ca3af; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:6px;">Notes</div>
            <div style="font-size:14px; color:#374151; line-height:1.5;">${_esc(expense.notes)}</div>
        </div>
    ` : '';

    container.innerHTML = `
        <div style="padding:16px;">
            <!-- Date -->
            <div class="expense-detail-row" style="margin-bottom:16px;">
                <span class="expense-detail-label">Date</span>
                <span class="expense-detail-value">${_fmtDate(expense.date)}</span>
            </div>

            <!-- Amount section -->
            <div style="background:#f9fafb; border-radius:12px; padding:14px 16px; margin-bottom:16px;">
                <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:${expense.gst_included ? '10px' : '0'};">
                    <span style="font-size:14px; color:#6b7280;">Total</span>
                    <span style="font-size:22px; font-weight:700; color:#111827; font-variant-numeric:tabular-nums;">${fmt(amount)}</span>
                </div>
                ${gstRows}
            </div>

            ${notesRow}

            <!-- Receipt -->
            <div id="expDetailReceiptSection" style="margin-top:16px; padding-top:16px; border-top:1px solid #f3f4f6;">
                <div style="font-size:12px; font-weight:600; color:#9ca3af; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px;">Receipt</div>
                ${expense.receipt_path
                    ? `<div style="display:flex; align-items:center; gap:10px;">
                           <svg width="16" height="16" fill="none" stroke="#6b7280" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
                           <span style="flex:1; font-size:13px; color:#374151; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${_esc(expense.receipt_path.split('/').pop())}</span>
                           <button id="expDetailViewReceipt" style="background:none; border:none; cursor:pointer; font-size:13px; font-weight:600; color:#111827; font-family:inherit; padding:2px 6px;">View</button>
                       </div>`
                    : `<span style="font-size:13px; color:#9ca3af;">No receipt attached</span>`
                }
            </div>

            <!-- Edit button -->
            <div style="margin-top:20px;">
                <button id="expDetailEditBtn" style="width:100%; background:#f3f4f6; border:none; border-radius:10px; padding:12px; font-size:15px; font-weight:600; color:#111827; cursor:pointer; font-family:inherit;">
                    Edit Expense
                </button>
            </div>
        </div>
    `;

    // Bind view receipt
    container.querySelector('#expDetailViewReceipt')?.addEventListener('click', async () => {
        const { data, error } = await sb.storage.from('receipts').createSignedUrl(expense.receipt_path, 3600);
        if (error) { alert('Could not load receipt: ' + error.message); return; }
        window.open(data.signedUrl, '_blank');
    });

    // Bind edit
    container.querySelector('#expDetailEditBtn')?.addEventListener('click', () => {
        _openForm(expense);
    });
}

// ─────────────────────────────────────────────
// FILTER HANDLERS
// ─────────────────────────────────────────────

function _bindFilterHandlers() {
    document.getElementById('expFYPicker')?.addEventListener('change', e => {
        fyStartYear    = parseInt(e.target.value, 10);
        expensesLoaded = false;
        _fetchAndRender();
    });

    document.getElementById('expCatFilter')?.addEventListener('change', e => {
        categoryFilter = e.target.value;
        _render();
    });
}

// ─────────────────────────────────────────────
// FORM — route to desktop panel or mobile sheet
// ─────────────────────────────────────────────

let _formExpense     = null;
let _pendingFile     = null;
let _deleteReceipt   = false;

function _openForm(expense) {
    _formExpense   = expense;
    _pendingFile   = null;
    _deleteReceipt = false;

    if (_isDesktop()) {
        _openFormDesktop(expense);
    } else {
        _openFormMobile(expense);
    }
}

// ── Desktop: form in #detailPanel ─────────────

function _openFormDesktop(expense) {
    const panel = document.getElementById('detailPanel');
    if (!panel) return;

    // Deselect any selected expense row
    document.querySelectorAll('.expense-selected').forEach(el => el.classList.remove('expense-selected'));
    delete panel.dataset.expenseId;

    const isEdit         = !!expense;
    const receiptFilename = expense?.receipt_path ? expense.receipt_path.split('/').pop() : null;

    panel.innerHTML = `
        <div style="display:flex; flex-direction:column; height:100%;">
            <div class="invoice-panel-header">
                <h3 class="invoice-panel-title">${isEdit ? 'Edit Expense' : 'New Expense'}</h3>
                <button id="expFormPanelClose" class="invoice-panel-close-btn">
                    <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
            </div>
            <div style="flex:1; overflow-y:auto; padding:20px;">
                ${_formFieldsHTML(expense)}
                <input type="file" id="expReceiptInput" accept="image/*,application/pdf" style="display:none;">
                ${isEdit ? `
                <div style="margin-top:8px; padding-top:16px; border-top:1px solid #f3f4f6;">
                    <button id="expDeleteBtn" style="width:100%; background:none; border:1.5px solid #fee2e2; border-radius:10px; padding:12px; font-size:15px; font-weight:600; color:#ef4444; cursor:pointer; font-family:inherit;">
                        Delete Expense
                    </button>
                </div>` : ''}
            </div>
            <div class="invoice-panel-footer">
                <button id="expFormSave" style="width:100%; background:#111827; color:#fff; border:none; border-radius:10px; padding:13px; font-size:15px; font-weight:600; cursor:pointer; font-family:inherit;">
                    ${isEdit ? 'Save Changes' : 'Add Expense'}
                </button>
            </div>
        </div>`;

    panel.classList.add('open');
    document.getElementById('viewSlider')?.classList.add('detail-open');

    _updateGSTBreakdown();
    _bindFormHandlers(() => {
        panel.classList.remove('open');
        panel.innerHTML = '';
        delete panel.dataset.expenseId;
        document.getElementById('viewSlider')?.classList.remove('detail-open');
    });
}

// ── Mobile: bottom sheet ──────────────────────

function _openFormMobile(expense) {
    const isEdit         = !!expense;
    const receiptFilename = expense?.receipt_path ? expense.receipt_path.split('/').pop() : null;

    const sheet = document.createElement('div');
    sheet.id = 'expenseFormSheet';
    sheet.style.cssText = `
        position:fixed; inset:0; z-index:600; display:flex; flex-direction:column; justify-content:flex-end;
        background:rgba(0,0,0,0); transition:background 0.25s;
    `;
    sheet.innerHTML = `
        <div id="expenseFormOverlay" style="position:absolute; inset:0;"></div>
        <div id="expenseFormPanel" style="
            position:relative; background:#fff; border-radius:20px 20px 0 0;
            padding:0 0 env(safe-area-inset-bottom);
            max-height:92dvh; overflow-y:auto;
            transform:translateY(100%); transition:transform 0.3s cubic-bezier(0.4,0,0.2,1);
        ">
            <div style="width:36px; height:4px; background:#d1d5db; border-radius:2px; margin:12px auto 0;"></div>
            <div style="display:flex; align-items:center; justify-content:space-between; padding:16px 20px 12px;">
                <button id="expFormCancel" style="background:none; border:none; cursor:pointer; font-size:16px; color:#6b7280; font-family:inherit; padding:4px;">Cancel</button>
                <span style="font-size:17px; font-weight:700; color:#111827;">${isEdit ? 'Edit Expense' : 'New Expense'}</span>
                <button id="expFormSave" style="background:none; border:none; cursor:pointer; font-size:16px; font-weight:600; color:#111827; font-family:inherit; padding:4px;">Save</button>
            </div>
            <div style="height:1px; background:#f3f4f6;"></div>
            <div style="padding:20px;">
                ${_formFieldsHTML(expense)}
                <input type="file" id="expReceiptInput" accept="image/*,application/pdf" style="display:none;">
                ${isEdit ? `
                <div style="margin-top:8px; padding-top:16px; border-top:1px solid #f3f4f6;">
                    <button id="expDeleteBtn" style="width:100%; background:none; border:1.5px solid #fee2e2; border-radius:10px; padding:12px; font-size:15px; font-weight:600; color:#ef4444; cursor:pointer; font-family:inherit;">
                        Delete Expense
                    </button>
                </div>` : ''}
            </div>
        </div>
    `;

    document.body.appendChild(sheet);

    requestAnimationFrame(() => requestAnimationFrame(() => {
        sheet.style.background = 'rgba(0,0,0,0.4)';
        document.getElementById('expenseFormPanel').style.transform = 'translateY(0)';
    }));

    _updateGSTBreakdown();
    _bindFormHandlers(_closeFormMobile);

    document.getElementById('expFormCancel')?.addEventListener('click', _closeFormMobile);
    document.getElementById('expenseFormOverlay')?.addEventListener('click', _closeFormMobile);
}

function _closeFormMobile() {
    const sheet = document.getElementById('expenseFormSheet');
    if (!sheet) return;
    sheet.style.background = 'rgba(0,0,0,0)';
    document.getElementById('expenseFormPanel').style.transform = 'translateY(100%)';
    setTimeout(() => sheet.remove(), 300);
}

// ── Shared form HTML ──────────────────────────

function _formFieldsHTML(expense) {
    const today      = localDateStr(new Date());
    const catOptions = CATEGORIES.map(c =>
        `<option value="${c.value}" ${expense?.category === c.value ? 'selected' : (!expense && c.value === 'other' ? 'selected' : '')}>${c.label}</option>`
    ).join('');
    const receiptFilename = expense?.receipt_path ? expense.receipt_path.split('/').pop() : null;

    return `
        <div class="exp-form-section">
            <div class="invoice-date-field">
                <label for="expDate">Date</label>
                <input id="expDate" type="date" value="${expense?.date || today}">
            </div>
        </div>

        <div class="exp-form-section">
            <span class="invoice-section-header">Category</span>
            <select id="expCategory" class="exp-form-input">
                ${catOptions}
            </select>
        </div>

        <div class="exp-form-section">
            <span class="invoice-section-header">Description</span>
            <input id="expDescription" type="text" class="exp-form-input"
                placeholder="e.g. Adobe Creative Cloud" value="${_esc(expense?.description || '')}">
        </div>

        <div class="exp-form-section">
            <span class="invoice-section-header">Amount</span>
            <div class="exp-form-amount-wrap">
                <span class="exp-form-currency">$</span>
                <input id="expAmount" type="number" inputmode="decimal" step="0.01" min="0"
                    placeholder="0.00" value="${expense?.amount || ''}">
            </div>
            <div class="exp-form-toggle-row">
                <span class="exp-form-toggle-label">Includes GST</span>
                <label class="settings-toggle">
                    <input id="expGstIncluded" type="checkbox" ${(expense?.gst_included ?? true) ? 'checked' : ''}>
                    <span class="settings-toggle-track"></span>
                </label>
            </div>
            <div id="expGstBreakdown" style="display:none;" class="exp-form-gst-breakdown">
                <div style="display:flex; justify-content:space-between; font-size:13px; color:#6b7280; padding:3px 0;">
                    <span>GST component</span>
                    <span id="expGstAmount" style="font-variant-numeric:tabular-nums;"></span>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:13px; color:#6b7280; padding:3px 0;">
                    <span>Ex-GST</span>
                    <span id="expExGstAmount" style="font-variant-numeric:tabular-nums;"></span>
                </div>
            </div>
        </div>

        <div class="exp-form-section">
            <span class="invoice-section-header">Notes</span>
            <textarea id="expNotes" class="exp-form-input" rows="3"
                placeholder="Optional notes…" style="resize:vertical;">${_esc(expense?.notes || '')}</textarea>
        </div>

        <div class="exp-form-section">
            <span class="invoice-section-header">Receipt</span>
            <div id="expReceiptSection">${_receiptSectionHTML(receiptFilename)}</div>
        </div>
    `;
}

// ── Shared form binding ───────────────────────

function _bindFormHandlers(closeCallback) {
    document.getElementById('expFormPanelClose')?.addEventListener('click', closeCallback);
    document.getElementById('expFormSave').addEventListener('click', () => _saveForm(closeCallback));

    document.getElementById('expGstIncluded').addEventListener('change', _updateGSTBreakdown);
    document.getElementById('expAmount').addEventListener('input', _updateGSTBreakdown);

    document.getElementById('expReceiptInput').addEventListener('change', e => {
        const file = e.target.files?.[0];
        if (!file) return;
        _pendingFile = file;
        _deleteReceipt = false;
        document.getElementById('expReceiptSection').innerHTML = _receiptSectionHTML(file.name, true);
        _bindReceiptHandlers();
    });

    _bindReceiptHandlers();

    document.getElementById('expDeleteBtn')?.addEventListener('click', async () => {
        if (!confirm('Delete this expense?')) return;
        await _deleteExpense(_formExpense, closeCallback);
    });
}

function _receiptSectionHTML(filename, isPending = false) {
    if (filename) {
        return `
            <div style="display:flex; align-items:center; gap:10px; background:#f9fafb; border-radius:10px; padding:10px 14px;">
                <svg width="18" height="18" fill="none" stroke="#6b7280" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
                <span style="flex:1; font-size:14px; color:#374151; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${_esc(filename)}</span>
                ${!isPending && _formExpense?.receipt_path ? `
                    <button id="expViewReceiptBtn" style="background:none; border:none; cursor:pointer; font-size:13px; font-weight:600; color:#111827; font-family:inherit; padding:2px 6px;">View</button>
                ` : ''}
                <button id="expRemoveReceiptBtn" style="background:none; border:none; cursor:pointer; font-size:13px; font-weight:600; color:#ef4444; font-family:inherit; padding:2px 6px;">Remove</button>
            </div>
        `;
    }
    return `
        <button id="expAttachReceiptBtn" style="display:flex; align-items:center; gap:8px; background:#f3f4f6; border:none; border-radius:10px; padding:10px 14px; font-size:14px; font-weight:500; color:#374151; cursor:pointer; font-family:inherit; width:100%;">
            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
            Attach Receipt…
        </button>
    `;
}

function _bindReceiptHandlers() {
    document.getElementById('expAttachReceiptBtn')?.addEventListener('click', () => {
        document.getElementById('expReceiptInput').click();
    });

    document.getElementById('expRemoveReceiptBtn')?.addEventListener('click', () => {
        _pendingFile = null;
        if (_formExpense?.receipt_path) _deleteReceipt = true;
        document.getElementById('expReceiptSection').innerHTML = _receiptSectionHTML(null);
        _bindReceiptHandlers();
    });

    document.getElementById('expViewReceiptBtn')?.addEventListener('click', async () => {
        if (!_formExpense?.receipt_path) return;
        const { data, error } = await sb.storage.from('receipts').createSignedUrl(_formExpense.receipt_path, 3600);
        if (error) { alert('Could not load receipt: ' + error.message); return; }
        window.open(data.signedUrl, '_blank');
    });
}

function _updateGSTBreakdown() {
    const gstCheck   = document.getElementById('expGstIncluded');
    const amountEl   = document.getElementById('expAmount');
    const breakdown  = document.getElementById('expGstBreakdown');
    if (!gstCheck || !amountEl || !breakdown) return;

    const amount = parseFloat(amountEl.value) || 0;
    if (gstCheck.checked && amount > 0) {
        breakdown.style.display = 'block';
        document.getElementById('expGstAmount').textContent   = fmt(amount / 11);
        document.getElementById('expExGstAmount').textContent = fmt(amount * 10 / 11);
    } else {
        breakdown.style.display = 'none';
    }
}

async function _saveForm(closeCallback) {
    const date        = document.getElementById('expDate').value;
    const category    = document.getElementById('expCategory').value;
    const description = document.getElementById('expDescription').value.trim();
    const amount      = parseFloat(document.getElementById('expAmount').value);
    const gstIncluded = document.getElementById('expGstIncluded').checked;
    const notes       = document.getElementById('expNotes').value.trim() || null;

    if (!date || !description || isNaN(amount) || amount <= 0) {
        alert('Please fill in date, description, and a valid amount.');
        return;
    }

    const saveBtn = document.getElementById('expFormSave');
    saveBtn.textContent = 'Saving…';
    saveBtn.disabled    = true;

    try {
        if (_formExpense) {
            await _updateExpense(_formExpense, { date, category, description, amount, gst_included: gstIncluded, notes });
        } else {
            await _createExpense({ date, category, description, amount, gst_included: gstIncluded, notes, is_billable: false });
        }
        closeCallback();
    } catch (err) {
        alert('Error saving expense: ' + err.message);
        saveBtn.textContent = _formExpense ? 'Save Changes' : 'Add Expense';
        saveBtn.disabled    = false;
    }
}

// ─────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────

async function _createExpense(fields) {
    const userId = getState().currentUserId;
    const { data, error } = await sb.from('expenses').insert({ ...fields, user_id: userId }).select().single();
    if (error) throw error;

    if (_pendingFile && data) {
        await _uploadReceipt(data.id, _pendingFile);
    }

    _reload();
}

async function _updateExpense(expense, fields) {
    if (_deleteReceipt && expense.receipt_path) {
        await sb.storage.from('receipts').remove([expense.receipt_path]);
        fields.receipt_path = null;
    }

    if (_pendingFile) {
        const path = await _uploadReceipt(expense.id, _pendingFile);
        fields.receipt_path = path;
    }

    const { error } = await sb.from('expenses').update(fields).eq('id', expense.id);
    if (error) throw error;

    _reload();
}

async function _deleteExpense(expense, closeCallback) {
    if (expense.receipt_path) {
        await sb.storage.from('receipts').remove([expense.receipt_path]);
    }

    const { error } = await sb.from('expenses').delete().eq('id', expense.id);
    if (error) { alert('Error deleting: ' + error.message); return; }

    closeCallback();
    _reload();
}

async function _uploadReceipt(expenseId, file) {
    const userId = getState().currentUserId;
    const path   = `${userId}/${expenseId}/${file.name}`;

    const { error } = await sb.storage.from('receipts').upload(path, file, { upsert: true });
    if (error) throw error;

    await sb.from('expenses').update({ receipt_path: path }).eq('id', expenseId);
    return path;
}

function _reload() {
    expensesLoaded = false;
    _fetchAndRender();
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function _fmtDate(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function _esc(v) {
    return String(v ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
