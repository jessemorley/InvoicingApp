// ─────────────────────────────────────────────
// ENTRIES MODULE
// Handles: entries list, new entry form, edit/delete
// ─────────────────────────────────────────────
import {
    fmt, localDateStr, weeksAgoDateStr, weeksAgoDateStr_before,
    formatEntryDate, formatEntryDateParts, isoWeekKey, isoWeekStart,
    formatWeekLabel, clientBadgeColor, clientDowColor, clientDotColor, entryDescription,
    calcDayRate, calcHourly, calcManual,
} from './utils.js';

// State injected from app.js via init()
let sb, getState;

export function init(supabase, stateGetter) {
    sb = supabase;
    getState = stateGetter;
}

// ── Lazy-load state ──────────────────────────
let entriesOldestDate  = null;
let entriesAllLoaded   = false;
let entriesScrollLoading = false;

// ── View mode ────────────────────────────────
let entriesViewMode = 'client-week'; // 'client-week' | 'week'
let entriesRawCache = [];            // last-fetched data for re-render without refetch

// ── New entry card state ─────────────────────
let newEntryWrap           = null;
let newEntrySelectedClient = null;
let newEntryDayType        = 'full';
let newEntryWorkflow       = 'Apparel';
let newEntryRole           = 'Photographer';

// ── Edit state ───────────────────────────────
let editingEntry    = null;
let editingClient   = null;
let editDayType     = 'full';
let editWorkflow    = 'Apparel';
let editRole        = 'Photographer';
let expandedWrap    = null;

// ─────────────────────────────────────────────
// RECENT ENTRIES
// ─────────────────────────────────────────────

export async function loadRecentEntries() {
    entriesOldestDate = null;
    entriesAllLoaded  = false;
    const list = document.getElementById('recentList');
    list.innerHTML = '<div class="spinner"></div>';

    const fromDate = weeksAgoDateStr(4);
    const { data: rawData, error } = await sb
        .from('entries')
        .select('*, clients(name, billing_type), invoices(invoice_number, status)')
        .gte('date', fromDate)
        .order('date', { ascending: false });

    // Build latest invoice map for client picker
    const { clientLatestInvoiceMap } = getState();
    (rawData || []).forEach(entry => {
        const name = entry.clients?.name;
        const inv  = entry.invoices?.invoice_number;
        if (name && inv && !clientLatestInvoiceMap[name]) {
            clientLatestInvoiceMap[name] = inv;
        }
    });

    if (error || !rawData?.length) {
        list.innerHTML = '';
        appendNewEntryCard(list, 0);
        return;
    }

    entriesOldestDate = rawData[rawData.length - 1].date;
    entriesRawCache = rawData;
    list.innerHTML = '';
    renderEntries(list, rawData, 0);
    updateLoadMoreSentinel();
    appendNewEntryCard(list, 0);
}

async function loadMoreEntries() {
    if (entriesAllLoaded || !entriesOldestDate) return;

    const sentinel = document.getElementById('entriesLoadMore');
    if (sentinel) sentinel.innerHTML = '<div class="spinner" style="margin:16px auto;width:24px;height:24px;"></div>';

    const toDate   = entriesOldestDate;
    const fromDate = weeksAgoDateStr_before(toDate, 4);

    const { data: rawData, error } = await sb
        .from('entries')
        .select('*, clients(name, billing_type), invoices(invoice_number, status)')
        .gte('date', fromDate)
        .lt('date', toDate)
        .order('date', { ascending: false });

    if (error || !rawData?.length) {
        entriesAllLoaded = true;
        updateLoadMoreSentinel();
        return;
    }

    const { clientLatestInvoiceMap } = getState();
    (rawData || []).forEach(entry => {
        const name = entry.clients?.name;
        const inv  = entry.invoices?.invoice_number;
        if (name && inv && !clientLatestInvoiceMap[name]) {
            clientLatestInvoiceMap[name] = inv;
        }
    });

    entriesOldestDate = rawData[rawData.length - 1].date;
    entriesRawCache = [...entriesRawCache, ...rawData];

    const list = document.getElementById('recentList');
    const existingCardCount = list.querySelectorAll('.entry-card-wrap').length;
    renderEntries(list, rawData, existingCardCount, true);
    updateLoadMoreSentinel();
}

function updateLoadMoreSentinel() {
    let sentinel = document.getElementById('entriesLoadMore');
    if (!sentinel) {
        sentinel = document.createElement('div');
        sentinel.id = 'entriesLoadMore';
        sentinel.style.cssText = 'text-align:center;padding:16px 0 8px;color:#999;font-size:13px;';
        const list = document.getElementById('recentList');
        list.appendChild(sentinel);
    }
    if (entriesAllLoaded) {
        sentinel.textContent = '';
    } else {
        sentinel.innerHTML = '<div class="spinner" style="margin:0 auto;width:24px;height:24px;opacity:0.4;"></div>';
    }
}

function renderEntries(list, data, startCardIndex, beforeSentinel = false) {
    if (entriesViewMode === 'client-week') {
        renderEntryClientWeeks(list, data, startCardIndex, beforeSentinel);
    } else {
        renderEntryWeeks(list, data, startCardIndex, beforeSentinel);
    }
}

function renderEntryClientWeeks(list, data, startCardIndex, beforeSentinel = false) {
    const { businessDetails, invoiceChipColors } = getState();
    const includeSuperInTotals = businessDetails?.include_super_in_totals ?? true;

    function entryAmt(entry) {
        const total = entry.total_amount || 0;
        return includeSuperInTotals ? total : total - (entry.super_amount || 0);
    }

    // Group by client + ISO week, preserving order of first appearance
    const groups = [];
    const groupIndex = {};
    data.forEach(entry => {
        const clientId = entry.client_id;
        const weekKey  = isoWeekKey(entry.date);
        const key      = `${clientId}-${weekKey}`;
        if (!groupIndex[key]) {
            const g = { key, clientId, clientName: entry.clients?.name || 'Unknown', weekStart: isoWeekStart(entry.date), entries: [] };
            groups.push(g);
            groupIndex[key] = g;
        }
        groupIndex[key].entries.push(entry);
    });

    const sentinel = document.getElementById('entriesLoadMore');
    let cardIndex = startCardIndex;

    groups.forEach(({ clientName, weekStart, entries }) => {
        const badgeColor  = clientBadgeColor(clientName);
        const groupTotal  = entries.reduce((sum, e) => sum + entryAmt(e), 0);
        const isInvoiced  = entries.every(e => !!e.invoice_id);
        const inv         = entries[0]?.invoices;

        // Header: client badge + week label + subtotal + invoice chip
        const chipHtml = inv ? (() => {
            const chipColor = invoiceChipColors[inv.status] || 'bg-slate-100 text-slate-500';
            return `<span class="invoice-chip ${chipColor}">${inv.invoice_number}</span>`;
        })() : '';

        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        const opts = { day: 'numeric', month: 'short' };
        const weekLabel = `${weekStart.toLocaleDateString('en-AU', opts)} – ${weekEnd.toLocaleDateString('en-AU', opts)}`;

        const header = document.createElement('div');
        header.className = 'week-header';
        header.style.animation = `cardIn 0.3s ease both`;
        header.style.animationDelay = `${Math.min(cardIndex, 6) * 40}ms`;
        header.innerHTML = `
            <div style="display:flex; align-items:center; gap:8px; min-width:0;">
                <span class="client-badge ${badgeColor}">${clientName}</span>
                <span style="font-size:12px; color:#9ca3af;">${weekLabel}</span>
            </div>
            <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                ${chipHtml}
                <span>${fmt(groupTotal)}</span>
            </div>`;

        const group = document.createElement('div');
        group.className = 'week-group';

        entries.forEach(entry => {
            const description = entryDescription(entry);
            const total       = fmt(entryAmt(entry));
            const dowColor    = clientDowColor(clientName);

            const el = document.createElement('div');
            el.className = 'entry-row' + (isInvoiced ? ' entry-row-invoiced' : ' entry-row-tappable');
            const dateParts = formatEntryDateParts(entry.date);
            el.innerHTML = `
                <div class="entry-date-col">
                    <span class="dow ${dowColor}">${dateParts.dow}</span>
                    <span class="day-num">${dateParts.day}</span>
                    <span class="mon">${dateParts.mon}</span>
                </div>
                <div class="flex-1 min-w-0">
                    <p class="text-[15px] font-semibold text-gray-800 truncate">${description}</p>
                </div>
                <div class="flex flex-col items-end gap-1 shrink-0">
                    <span class="text-[16px] font-bold text-gray-800 tracking-tight">${total}</span>
                </div>`;

            const wrap = document.createElement('div');
            wrap.className = 'entry-card-wrap';
            wrap.style.animationDelay = `${Math.min(cardIndex, 6) * 40}ms`;
            cardIndex++;

            const detailPanel = document.createElement('div');
            detailPanel.className = 'entry-detail-panel';
            const detailInner = document.createElement('div');
            detailInner.className = 'entry-detail-inner';
            detailPanel.appendChild(detailInner);

            el.addEventListener('click', () => openEntryCard(wrap, entry, isInvoiced));
            wrap.appendChild(el);
            wrap.appendChild(detailPanel);
            group.appendChild(wrap);
        });

        if (beforeSentinel && sentinel) {
            list.insertBefore(header, sentinel);
            list.insertBefore(group, sentinel);
        } else {
            list.appendChild(header);
            list.appendChild(group);
        }
    });
}

function renderEntryWeeks(list, data, startCardIndex, beforeSentinel = false) {
    const { businessDetails, invoiceChipColors } = getState();
    const includeSuperInTotals = businessDetails?.include_super_in_totals ?? true;

    const weeks = [];
    const weekIndex = {};
    data.forEach(entry => {
        const key = isoWeekKey(entry.date);
        if (!weekIndex[key]) {
            const group = { key, weekStart: isoWeekStart(entry.date), entries: [] };
            weeks.push(group);
            weekIndex[key] = group;
        }
        weekIndex[key].entries.push(entry);
    });

    function entryAmt(entry) {
        const total = entry.total_amount || 0;
        return includeSuperInTotals ? total : total - (entry.super_amount || 0);
    }

    const sentinel = document.getElementById('entriesLoadMore');
    let cardIndex = startCardIndex;
    weeks.forEach(({ weekStart, entries }) => {
        const header = document.createElement('div');
        header.className = 'week-header';
        header.style.animation = `cardIn 0.3s ease both`;
        header.style.animationDelay = `${Math.min(cardIndex, 6) * 40}ms`;
        const weekTotal = entries.reduce((sum, e) => sum + entryAmt(e), 0);
        header.innerHTML = `<span>${formatWeekLabel(weekStart)}</span><span>${fmt(weekTotal)}</span>`;

        const group = document.createElement('div');
        group.className = 'week-group';
        entries.forEach(entry => {
            const clientName  = entry.clients?.name || 'Unknown';
            const badgeColor  = clientBadgeColor(clientName);
            const description = entryDescription(entry);
            const total       = fmt(entryAmt(entry));
            const inv         = entry.invoices;
            const isInvoiced  = !!entry.invoice_id;

            const chipHtml = inv ? (() => {
                const chipColor = invoiceChipColors[inv.status] || 'bg-slate-100 text-slate-500';
                return `<span class="invoice-chip ${chipColor}">${inv.invoice_number}</span>`;
            })() : '';

            const el = document.createElement('div');
            el.className = 'entry-row' + (isInvoiced ? ' entry-row-invoiced' : ' entry-row-tappable');
            const dateParts = formatEntryDateParts(entry.date);
            const dowColor  = clientDowColor(clientName);
            el.innerHTML = `
                <div class="entry-date-col">
                    <span class="dow ${dowColor}">${dateParts.dow}</span>
                    <span class="day-num">${dateParts.day}</span>
                    <span class="mon">${dateParts.mon}</span>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1.5 mb-1.5">
                        <span class="client-badge ${badgeColor}">${clientName}</span>
                    </div>
                    <p class="text-[15px] font-semibold text-gray-800 truncate">${description}</p>
                </div>
                <div class="flex flex-col items-end gap-1 shrink-0">
                    ${chipHtml || '<span class="h-[18px]"></span>'}
                    <span class="text-[16px] font-bold text-gray-800 tracking-tight">${total}</span>
                </div>`;

            const wrap = document.createElement('div');
            wrap.className = 'entry-card-wrap';
            wrap.style.animationDelay = `${Math.min(cardIndex, 6) * 40}ms`;
            cardIndex++;

            const detailPanel = document.createElement('div');
            detailPanel.className = 'entry-detail-panel';
            const detailInner = document.createElement('div');
            detailInner.className = 'entry-detail-inner';
            detailPanel.appendChild(detailInner);

            el.addEventListener('click', () => openEntryCard(wrap, entry, isInvoiced));
            wrap.appendChild(el);
            wrap.appendChild(detailPanel);
            group.appendChild(wrap);
        });

        if (beforeSentinel && sentinel) {
            list.insertBefore(header, sentinel);
            list.insertBefore(group, sentinel);
        } else {
            list.appendChild(header);
            list.appendChild(group);
        }
    });
}

// ─────────────────────────────────────────────
// NEW ENTRY CARD
// ─────────────────────────────────────────────

function appendNewEntryCard(_list, _cardIndex) {
    const slot = document.getElementById('newEntrySlot');
    const newWrap = document.createElement('div');
    newWrap.className = 'entry-card-wrap';
    newWrap.style.marginTop = '24px';
    newWrap.style.marginBottom = '1rem';
    newWrap.style.display = 'none';
    newWrap.innerHTML = buildNewEntryFormHTML();
    slot.innerHTML = '';
    slot.appendChild(newWrap);
    newEntryWrap = newWrap;
    wireNewEntryForm();
}

export function closeNewEntryCard() {
    if (!newEntryWrap) return;
    newEntrySelectedClient = null;
    newEntryDayType        = 'full';
    newEntryWorkflow       = 'Apparel';
    newEntryRole           = 'Photographer';
    newEntryWrap.style.display = 'none';
    newEntryWrap.innerHTML = buildNewEntryFormHTML();
    wireNewEntryForm();
}

function buildNewEntryFormHTML(desktop = false) {
    const wrapStyle = desktop
        ? 'padding:0 20px 20px; display:flex; flex-direction:column; gap:0;'
        : 'background:#fff; border-radius:1.75rem; padding:20px 24px; display:flex; flex-direction:column; gap:0;';
    return `
    <div style="${wrapStyle}">
        <!-- Client chip -->
        <div id="newClientContainer" class="flex items-center justify-between pb-2">
            <div id="newClientChip"></div>
            <button id="newClearClient" style="flex-shrink:0; cursor:pointer; border:none; background:none; padding:4px;">
                <span style="display:flex; align-items:center; justify-content:center; width:22px; height:22px; border-radius:50%; background:#e5e7eb;">
                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="#6b7280" stroke-width="2.5">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                </span>
            </button>
        </div>

        <!-- Billing fields (revealed after client select) -->
        <div id="newEntryFields" class="reveal space-y-3 mt-3">

            <!-- Date -->
            <div class="bg-slate-50 rounded-2xl px-5 py-4">
                <span class="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-0.5">Date</span>
                <input type="date" id="newEntryDate" class="bg-transparent w-full text-[15px] font-semibold outline-none">
            </div>

            <!-- DAY RATE -->
            <div id="newDayRateFields" class="hidden space-y-3">
                <div>
                    <span class="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-1.5 px-1">Day Type</span>
                    <div class="seg-ctrl" style="grid-template-columns: 1fr 1fr;">
                        <button class="seg-btn active" data-newday="full">Full Day</button>
                        <button class="seg-btn" data-newday="half">Half Day</button>
                    </div>
                </div>
                <div id="newWorkflowSection" class="reveal open space-y-3">
                    <div>
                        <span class="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-1.5 px-1">Workflow</span>
                        <div class="flex gap-1.5" id="newWorkflowBtns">
                            <button class="workflow-btn active" data-newwf="Apparel">Apparel</button>
                            <button class="workflow-btn" data-newwf="Product">Product</button>
                            <button class="workflow-btn" data-newwf="Own Brand">Own Brand</button>
                        </div>
                    </div>
                    <div id="newBrandField" class="hidden">
                        <div class="bg-slate-50 rounded-2xl px-5 py-4">
                            <span class="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-0.5">Brand</span>
                            <input type="text" id="newBrandInput"
                                class="bg-transparent w-full text-[15px] font-semibold outline-none placeholder-slate-400">
                        </div>
                    </div>
                    <div id="newSkuField" class="hidden">
                        <div class="bg-slate-50 rounded-2xl px-5 py-4">
                            <span class="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-0.5">SKUs Shot</span>
                            <input type="number" id="newSkuInput" placeholder="0" min="0"
                                class="bg-transparent w-full text-[15px] font-semibold outline-none">
                        </div>
                    </div>
                </div>
            </div>

            <!-- HOURLY -->
            <div id="newHourlyFields" class="hidden space-y-3">
                <div id="newItsFields" class="hidden space-y-3">
                    <div class="bg-slate-50 rounded-2xl px-5 py-4">
                        <span class="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-0.5">Shoot Client</span>
                        <input type="text" id="newShootClientInput"
                            class="bg-transparent w-full text-[15px] font-semibold outline-none placeholder-slate-400" placeholder="">
                    </div>
                    <div>
                        <span class="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-1.5 px-1">Role</span>
                        <div class="seg-ctrl" style="grid-template-columns: 1fr 1fr;">
                            <button class="seg-btn active" data-newrole="Photographer">Photographer</button>
                            <button class="seg-btn" data-newrole="Operator">Operator</button>
                        </div>
                    </div>
                </div>
                <div id="newHourlyDescField" class="hidden">
                    <div class="bg-slate-50 rounded-2xl px-5 py-4">
                        <span class="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-0.5">Description</span>
                        <input type="text" id="newHourlyDesc" class="bg-transparent w-full text-[15px] font-semibold outline-none">
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-2">
                    <div class="bg-slate-50 rounded-2xl px-5 py-4">
                        <span class="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-0.5">Start</span>
                        <input type="time" id="newStartTime" class="bg-transparent w-full text-[15px] font-semibold outline-none relative">
                    </div>
                    <div class="bg-slate-50 rounded-2xl px-5 py-4">
                        <span class="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-0.5">End</span>
                        <input type="time" id="newFinishTime" class="bg-transparent w-full text-[15px] font-semibold outline-none relative">
                    </div>
                </div>
                <div class="bg-slate-50 px-5 py-4 rounded-2xl flex items-center justify-between">
                    <div>
                        <span class="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-0.5">Break</span>
                        <div class="flex items-baseline gap-2">
                            <span id="newBreakDisplay" class="text-2xl font-black text-gray-900">0</span>
                            <span class="text-slate-400 text-[11px] font-bold uppercase">min</span>
                        </div>
                        <input type="hidden" id="newBreakMinutes" value="0">
                    </div>
                    <div class="flex gap-2">
                        <button data-newbreakadj="-15" class="h-9 px-3 bg-white hover:bg-gray-100 text-gray-900 font-bold rounded-xl shadow-sm border border-gray-100 text-[12px] transition-all">-15</button>
                        <button data-newbreakadj="15" class="h-9 px-3 bg-white hover:bg-gray-100 text-gray-900 font-bold rounded-xl shadow-sm border border-gray-100 text-[12px] transition-all">+15</button>
                    </div>
                </div>
            </div>

            <!-- MANUAL -->
            <div id="newManualFields" class="hidden space-y-3">
                <div class="bg-slate-50 rounded-2xl px-5 py-4">
                    <span class="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-0.5">Description</span>
                    <input type="text" id="newManualDesc" class="bg-transparent w-full text-[15px] font-semibold outline-none">
                </div>
                <div class="bg-slate-50 rounded-2xl px-5 py-4">
                    <span class="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-0.5">Amount ($)</span>
                    <input type="number" id="newManualAmount" placeholder="0.00" step="0.01" min="0"
                        class="bg-transparent w-full text-[15px] font-semibold outline-none">
                </div>
                <div class="bg-white rounded-2xl px-5 py-4 flex items-center justify-between">
                    <div>
                        <p class="text-[13px] font-semibold text-slate-800">Include Super (12%)</p>
                        <p id="newSuperToggleLabel" class="text-[11px] text-slate-400 mt-0.5">Off</p>
                    </div>
                    <label class="toggle-wrap">
                        <input type="checkbox" id="newSuperToggle">
                        <div class="toggle-track"><div class="toggle-thumb"></div></div>
                    </label>
                </div>
            </div>

            <!-- SUMMARY -->
            <div class="summary-card bg-white">
                <div class="flex justify-between items-end mb-2">
                    <div id="newDurationBlock" class="hidden">
                        <p class="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Duration</p>
                        <span id="newDisplayDuration" class="text-4xl font-black text-slate-900 leading-none">0h 0m</span>
                    </div>
                    <div class="text-right">
                        <p class="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Subtotal</p>
                        <h2 id="newDisplayTotal" class="text-2xl font-bold text-slate-800">$0.00</h2>
                    </div>
                </div>
                <div class="space-y-1 pt-2 border-t border-slate-100">
                    <div class="flex justify-between items-center">
                        <span class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Base</span>
                        <span id="newDisplayBase" class="text-[13px] font-bold text-slate-600">$0.00</span>
                    </div>
                    <div id="newBonusLine" class="flex justify-between items-center hidden">
                        <span class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Bonus</span>
                        <span id="newDisplayBonus" class="text-[13px] font-bold text-[#34c759]">+$0.00</span>
                    </div>
                    <div id="newSuperLine" class="flex justify-between items-center hidden">
                        <span class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Super (12%)</span>
                        <span id="newDisplaySuper" class="text-[13px] font-bold text-[#007AFF]">+$0.00</span>
                    </div>
                </div>
            </div>

            <!-- Save -->
            <div class="pt-1 pb-2">
                <button id="newSaveBtn" class="btn-primary">Save Entry</button>
            </div>

        </div><!-- /newEntryFields -->
    </div>`;
}

function wireNewEntryForm() {
    const today = new Date();
    const yyyy  = today.getFullYear();
    const mm    = String(today.getMonth() + 1).padStart(2, '0');
    const dd    = String(today.getDate()).padStart(2, '0');
    document.getElementById('newEntryDate').value = `${yyyy}-${mm}-${dd}`;

    document.getElementById('newClearClient').addEventListener('click', () => {
        closeNewEntryCard();
        // Notify app shell to re-open client picker
        document.dispatchEvent(new CustomEvent('entries:openClientPicker'));
    });

    newEntryWrap.querySelectorAll('[data-newday]').forEach(btn => {
        btn.addEventListener('click', () => setNewEntryDayType(btn.dataset.newday));
    });
    newEntryWrap.querySelectorAll('[data-newwf]').forEach(btn => {
        btn.addEventListener('click', () => setNewEntryWorkflow(btn.dataset.newwf));
    });
    newEntryWrap.querySelectorAll('[data-newrole]').forEach(btn => {
        btn.addEventListener('click', () => setNewEntryRole(btn.dataset.newrole));
    });
    newEntryWrap.querySelectorAll('[data-newbreakadj]').forEach(btn => {
        btn.addEventListener('click', () => {
            const el = document.getElementById('newBreakMinutes');
            el.value = Math.max(0, (parseInt(el.value) || 0) + parseInt(btn.dataset.newbreakadj));
            const disp = document.getElementById('newBreakDisplay');
            if (disp) disp.textContent = el.value;
            newEntryRecalculate();
        });
    });

    ['newStartTime','newFinishTime','newBreakMinutes','newSkuInput','newManualAmount','newBrandInput'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', newEntryRecalculate);
    });

    document.getElementById('newSaveBtn').addEventListener('click', saveNewEntry);
}

export function openNewEntryCardForClient(client) {
    if (_isDesktop()) {
        _openNewEntryDesktopWithClient(client);
        return;
    }
    if (!newEntryWrap) return;
    newEntryWrap.style.display = '';
    document.getElementById('entriesScroll').scrollTo({ top: 0, behavior: 'smooth' });
    selectNewEntryClient(client);
}

// ── Desktop: new entry in detail panel ───────

export function openNewEntryDesktop(allClients, clientInvoiceCountMap) {
    const panel = document.getElementById('detailPanel');
    if (!panel) return;

    const sorted = [...allClients].sort((a, b) =>
        (clientInvoiceCountMap[b.id] || 0) - (clientInvoiceCountMap[a.id] || 0)
    );

    function renderPicker(query) {
        const matches = query
            ? sorted.filter(c => c.name.toLowerCase().includes(query.toLowerCase()))
            : sorted;

        let rows = matches.map(c => {
            const dotColor = clientDotColor(c.name);
            const count = clientInvoiceCountMap[c.id] || 0;
            const subtitle = count > 0 ? `<div style="font-size:13px; color:#8e8e93; margin-top:2px;">${count} ${count === 1 ? 'invoice' : 'invoices'}</div>` : '';
            return `<button class="desktop-client-picker-row" data-client-id="${c.id}"
                style="display:flex; width:100%; box-sizing:border-box; align-items:center; text-align:left;
                       background:none; border:none; border-bottom:1px solid #f3f4f6; padding:14px 20px;
                       cursor:pointer; font-family:inherit;">
                <div style="flex-shrink:0; width:10px; height:10px; border-radius:50%; background:${dotColor}; margin-right:14px;"></div>
                <div style="flex:1; min-width:0;">
                    <div style="font-size:15px; font-weight:600; color:#111827;">${c.name}</div>
                    ${subtitle}
                </div>
                <svg width="16" height="16" fill="none" stroke="#c7c7cc" stroke-width="2" viewBox="0 0 24 24" style="flex-shrink:0;">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 18l6-6-6-6"/>
                </svg>
            </button>`;
        }).join('');

        panel.querySelector('#desktopClientPickerList').innerHTML = rows || `<div style="padding:40px 20px; text-align:center; color:#9ca3af;">No clients found</div>`;

        panel.querySelectorAll('.desktop-client-picker-row').forEach(btn => {
            const client = allClients.find(c => c.id === btn.dataset.clientId);
            if (client) btn.addEventListener('click', () => _openNewEntryDesktopWithClient(client));
        });
    }

    panel.innerHTML = `
        <div style="display:flex; flex-direction:column; height:100%;">
            <div style="padding:20px 20px 12px; border-bottom:1px solid #f3f4f6; flex-shrink:0;">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
                    <h3 style="font-size:15px; font-weight:700; color:#111827; margin:0;">New Entry</h3>
                    <button id="desktopNewEntryClose" style="background:none; border:none; cursor:pointer; color:#9ca3af; padding:4px;">
                        <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                </div>
                <input id="desktopClientSearch" type="text" placeholder="Search clients…"
                    style="width:100%; box-sizing:border-box; background:#f3f4f6; border:none; border-radius:10px;
                           padding:10px 14px; font-size:14px; outline:none; color:#111827;">
            </div>
            <div id="desktopClientPickerList" style="flex:1; overflow-y:auto;"></div>
        </div>`;

    panel.classList.add('open');

    panel.querySelector('#desktopNewEntryClose').addEventListener('click', () => {
        panel.classList.remove('open');
        panel.innerHTML = '';
    });

    const searchInput = panel.querySelector('#desktopClientSearch');
    renderPicker('');
    searchInput.focus();
    searchInput.addEventListener('input', e => renderPicker(e.target.value.trim()));
}

function _openNewEntryDesktopWithClient(client) {
    const panel = document.getElementById('detailPanel');
    if (!panel) return;

    // Clear the hidden mobile newEntryWrap so IDs don't duplicate
    const slot = document.getElementById('newEntrySlot');
    if (slot) slot.innerHTML = '';
    newEntryWrap = null;

    panel.innerHTML = `
        <div id="desktopNewEntryWrap" style="overflow-y:auto; height:100%; box-sizing:border-box;">
            <div style="display:flex; align-items:center; justify-content:space-between; padding:20px 20px 12px;">
                <h3 style="font-size:15px; font-weight:700; color:#111827; margin:0;">New Entry</h3>
                <button id="desktopNewEntryClose" style="background:none; border:none; cursor:pointer; color:#9ca3af; padding:4px;">
                    <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
            </div>
            ${buildNewEntryFormHTML(true)}
        </div>`;

    panel.classList.add('open');

    // Point newEntryWrap at the panel container so wireNewEntryForm can find buttons
    newEntryWrap = panel.querySelector('#desktopNewEntryWrap');

    panel.querySelector('#desktopNewEntryClose').addEventListener('click', () => {
        panel.classList.remove('open');
        panel.innerHTML = '';
        newEntrySelectedClient = null;
        newEntryWrap = null;
        // Rebuild mobile form
        appendNewEntryCard(null, 0);
    });

    // Wire form — document.getElementById finds elements in panel since slot is empty
    wireNewEntryForm();
    selectNewEntryClient(client);
}

function selectNewEntryClient(client) {
    newEntrySelectedClient = client;
    const badgeColor = clientBadgeColor(client.name);
    document.getElementById('newClientChip').innerHTML =
        `<span class="client-badge ${badgeColor}" style="font-size:15px; padding:7px 14px; border-radius:10px;">${client.name}</span>`;
    showNewEntryFields(client);
}

function showNewEntryFields(client) {
    document.getElementById('newDayRateFields').classList.add('hidden');
    document.getElementById('newHourlyFields').classList.add('hidden');
    document.getElementById('newManualFields').classList.add('hidden');
    document.getElementById('newDurationBlock').classList.add('hidden');
    document.getElementById('newBonusLine').classList.add('hidden');
    document.getElementById('newSuperLine').classList.add('hidden');

    if (client.billing_type === 'day_rate') {
        document.getElementById('newDayRateFields').classList.remove('hidden');
        document.getElementById('newBonusLine').classList.remove('hidden');
        if (client.pays_super) document.getElementById('newSuperLine').classList.remove('hidden');
        setNewEntryDayType('full');

    } else if (client.billing_type === 'hourly') {
        document.getElementById('newHourlyFields').classList.remove('hidden');
        document.getElementById('newDurationBlock').classList.remove('hidden');
        if (client.pays_super) document.getElementById('newSuperLine').classList.remove('hidden');

        const hasLabel = !!client.entry_label;
        document.getElementById('newItsFields').classList.toggle('hidden', !hasLabel);
        document.getElementById('newHourlyDescField').classList.toggle('hidden', hasLabel);

        const newRoleSection = document.getElementById('newRoleSection');
        if (newRoleSection) newRoleSection.classList.toggle('hidden', !client.show_role);

        const startDefault  = client.default_start_time  ? client.default_start_time.substring(0, 5)  : '09:00';
        const finishDefault = client.default_finish_time ? client.default_finish_time.substring(0, 5) : '17:00';
        document.getElementById('newStartTime').value    = startDefault;
        document.getElementById('newFinishTime').value   = finishDefault;
        document.getElementById('newBreakMinutes').value = '0';
        const newBreakDisp = document.getElementById('newBreakDisplay');
        if (newBreakDisp) newBreakDisp.textContent = '0';

    } else {
        document.getElementById('newManualFields').classList.remove('hidden');
        if (client.pays_super) document.getElementById('newSuperLine').classList.remove('hidden');
    }

    document.getElementById('newEntryFields').classList.add('open');
    newEntryRecalculate();

    setTimeout(() => {
        const tabRecent = document.getElementById('entriesScroll');
        tabRecent.scrollTo({ top: tabRecent.scrollHeight, behavior: 'smooth' });
    }, 150);
}

function setNewEntryDayType(type) {
    newEntryDayType = type;
    newEntryWrap.querySelectorAll('[data-newday]').forEach(b => {
        b.classList.toggle('active', b.dataset.newday === type);
    });
    const wfSection = document.getElementById('newWorkflowSection');
    const bonusLine = document.getElementById('newBonusLine');
    if (type === 'full') {
        wfSection.classList.add('open');
        bonusLine.classList.remove('hidden');
        setNewEntryWorkflow(newEntryWorkflow);
    } else {
        wfSection.classList.remove('open');
        bonusLine.classList.add('hidden');
    }
    newEntryRecalculate();
}

function setNewEntryWorkflow(wf) {
    newEntryWorkflow = wf;
    newEntryWrap.querySelectorAll('[data-newwf]').forEach(b => {
        b.classList.toggle('active', b.dataset.newwf === wf);
    });
    document.getElementById('newBrandField').classList.toggle('hidden', wf !== 'Own Brand');
    document.getElementById('newSkuField').classList.toggle('hidden', wf === 'Own Brand');
    const bonusLine = document.getElementById('newBonusLine');
    if (bonusLine) bonusLine.classList.toggle('hidden', wf === 'Own Brand');
    newEntryRecalculate();
}

function setNewEntryRole(role) {
    newEntryRole = role;
    newEntryWrap.querySelectorAll('[data-newrole]').forEach(b => {
        b.classList.toggle('active', b.dataset.newrole === role);
    });
}

function newEntryRecalculate() {
    if (!newEntrySelectedClient) return;
    const client = newEntrySelectedClient;
    const { workflowRates } = getState();
    let result = null;

    if (client.billing_type === 'day_rate') {
        const skus = document.getElementById('newSkuInput')?.value;
        result = calcDayRate(client, newEntryDayType, newEntryWorkflow, skus, workflowRates);
    } else if (client.billing_type === 'hourly') {
        const start  = document.getElementById('newStartTime').value;
        const finish = document.getElementById('newFinishTime').value;
        const brk    = document.getElementById('newBreakMinutes').value;
        result = calcHourly(client, start, finish, brk, newEntryRole);
        if (result) {
            const h = Math.floor(result.rawMins / 60);
            const m = result.rawMins % 60;
            document.getElementById('newDisplayDuration').textContent = `${h}h ${m}m`;
        }
    } else {
        const amount = document.getElementById('newManualAmount').value;
        result = calcManual(amount, client);
    }

    if (!result) return;
    document.getElementById('newDisplayTotal').textContent = fmt(result.total);
    document.getElementById('newDisplayBase').textContent  = fmt(result.base);
    document.getElementById('newDisplayBonus').textContent = `+${fmt(result.bonus)}`;
    document.getElementById('newDisplaySuper').textContent = `+${fmt(result.superAmt)}`;
}

function buildNewEntryPayload() {
    const client = newEntrySelectedClient;
    const { currentUserId, workflowRates } = getState();
    const date   = document.getElementById('newEntryDate').value;
    const base   = { user_id: currentUserId, client_id: client.id, date, billing_type_snapshot: client.billing_type };

    if (client.billing_type === 'day_rate') {
        const skus   = parseInt(document.getElementById('newSkuInput').value) || null;
        const brand  = document.getElementById('newBrandInput').value.trim() || null;
        const result = calcDayRate(client, newEntryDayType, newEntryWorkflow, skus, workflowRates);
        return {
            ...base,
            day_type:      newEntryDayType,
            workflow_type: newEntryDayType === 'full' ? newEntryWorkflow : null,
            brand:         newEntryDayType === 'full' && newEntryWorkflow === 'Own Brand' ? brand : null,
            skus:          newEntryDayType === 'full' && newEntryWorkflow !== 'Own Brand' ? skus : null,
            base_amount:   result.base,
            bonus_amount:  result.bonus,
            super_amount:  result.superAmt,
            total_amount:  result.total,
        };
    } else if (client.billing_type === 'hourly') {
        const start  = document.getElementById('newStartTime').value;
        const finish = document.getElementById('newFinishTime').value;
        const brk    = parseInt(document.getElementById('newBreakMinutes').value) || 0;
        const result = calcHourly(client, start, finish, brk, newEntryRole);
        const hasLabel    = !!client.entry_label;
        const description = hasLabel ? document.getElementById('newShootClientInput').value.trim() || null : document.getElementById('newHourlyDesc').value.trim() || null;
        const role        = client.show_role ? newEntryRole : null;
        return {
            ...base,
            start_time: start, finish_time: finish, break_minutes: brk,
            hours_worked: result.hoursWorked,
            shoot_client: null, role, description,
            base_amount: result.base, bonus_amount: 0,
            super_amount: result.superAmt, total_amount: result.total,
        };
    } else {
        const amount = parseFloat(document.getElementById('newManualAmount').value) || 0;
        const result = calcManual(amount, client);
        return {
            ...base,
            description:  document.getElementById('newManualDesc').value.trim() || null,
            base_amount:  result.base, bonus_amount: 0,
            super_amount: result.superAmt, total_amount: result.total,
        };
    }
}

async function saveNewEntry() {
    if (!newEntrySelectedClient) return;
    const btn = document.getElementById('newSaveBtn');
    btn.disabled    = true;
    btn.textContent = 'Saving…';
    try {
        const payload = buildNewEntryPayload();
        const { error } = await sb.from('entries').insert(payload);
        if (error) throw error;
        btn.textContent = 'Saved ✓';
        btn.classList.add('success');
        setTimeout(() => {
            closeNewEntryCard();
            loadRecentEntries();
        }, 1500);
    } catch (err) {
        alert('Error saving entry: ' + err.message);
        btn.disabled    = false;
        btn.textContent = 'Save Entry';
    }
}

// ─────────────────────────────────────────────
// ENTRY CARD EXPAND / EDIT / DELETE
// ─────────────────────────────────────────────

function _isDesktop() {
    return window.innerWidth >= 768;
}

function closeEntryCard(wrap) {
    if (_isDesktop()) {
        const panel = document.getElementById('detailPanel');
        if (panel) { panel.classList.remove('open'); panel.innerHTML = ''; }
        if (wrap) wrap.classList.remove('entry-selected');
    } else {
        const row = wrap.querySelector('.entry-row');
        if (row) row.style.borderRadius = '14px 14px 0 0';
        wrap.classList.remove('expanded');
        setTimeout(() => {
            if (row) row.style.borderRadius = '';
            const inner = wrap.querySelector('.entry-detail-inner');
            if (inner) inner.innerHTML = '';
        }, 400);
    }
    if (expandedWrap === wrap) {
        expandedWrap  = null;
        editingEntry  = null;
        editingClient = null;
    }
}

function openEntryCard(wrap, entry, readOnly = false) {
    // Close previously open card
    if (expandedWrap && expandedWrap !== wrap) closeEntryCard(expandedWrap);
    // Toggle closed if same card tapped again (mobile only)
    if (!_isDesktop() && wrap.classList.contains('expanded')) { closeEntryCard(wrap); return; }

    const { allClients, workflowRates } = getState();
    editingEntry  = entry;
    editingClient = allClients.find(c => c.id === entry.client_id) || null;
    expandedWrap  = wrap;

    const billing  = entry.billing_type_snapshot;
    const hasLabel = !!editingClient?.entry_label;
    const showRole = !!editingClient?.show_role;

    editDayType  = entry.day_type     || 'full';
    editWorkflow = entry.workflow_type || 'Apparel';
    editRole     = entry.role          || 'Photographer';

    const desktop = _isDesktop();
    const panel   = desktop ? document.getElementById('detailPanel') : null;
    const inner   = desktop ? panel : wrap.querySelector('.entry-detail-inner');

    // On desktop: wrap content in a padded container with a close button header
    const desktopPrefix = desktop ? `
        <div style="padding:20px;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
            <h3 style="font-size:15px; font-weight:700; color:#111827; margin:0;">Edit Entry</h3>
            <button id="detailPanelClose" style="background:none; border:none; cursor:pointer; color:#9ca3af; padding:4px;">
                <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
        </div>` : '';
    const desktopSuffix = desktop ? `</div>` : '';

    let html = desktopPrefix + `
        <div class="space-y-3">
        <div class="bg-slate-50 rounded-2xl px-5 py-4">
            <span class="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-0.5">Date</span>
            <input type="date" id="editDate" class="bg-transparent w-full text-[15px] font-semibold outline-none"${readOnly ? ' disabled' : ''}>
        </div>`;

    if (billing === 'day_rate') {
        const wfHidden    = editDayType !== 'full' ? 'hidden' : '';
        const brandHidden = editWorkflow !== 'Own Brand' ? 'hidden' : '';
        const skuHidden   = editWorkflow === 'Own Brand' ? 'hidden' : '';
        html += `
        <div id="editDayRateFields" class="space-y-3">
            <div>
                <span class="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-1.5 px-1">Day Type</span>
                <div class="seg-ctrl" style="grid-template-columns: 1fr 1fr;">
                    <button class="seg-btn${editDayType === 'full' ? ' active' : ''}" data-editday="full"${readOnly ? ' disabled' : ''}>Full Day</button>
                    <button class="seg-btn${editDayType === 'half' ? ' active' : ''}" data-editday="half"${readOnly ? ' disabled' : ''}>Half Day</button>
                </div>
            </div>
            <div id="editWorkflowSection" class="${wfHidden} space-y-3">
                <div>
                    <span class="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-1.5 px-1">Workflow</span>
                    <div class="flex gap-1.5" id="editWorkflowBtns">
                        <button class="workflow-btn${editWorkflow === 'Apparel' ? ' active' : ''}" data-editwf="Apparel"${readOnly ? ' disabled' : ''}>Apparel</button>
                        <button class="workflow-btn${editWorkflow === 'Product' ? ' active' : ''}" data-editwf="Product"${readOnly ? ' disabled' : ''}>Product</button>
                        <button class="workflow-btn${editWorkflow === 'Own Brand' ? ' active' : ''}" data-editwf="Own Brand"${readOnly ? ' disabled' : ''}>Own Brand</button>
                    </div>
                </div>
                <div id="editBrandField" class="${brandHidden}">
                    <div class="bg-slate-50 rounded-2xl px-5 py-4">
                        <span class="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-0.5">Brand</span>
                        <input type="text" id="editBrandInput" class="bg-transparent w-full text-[15px] font-semibold outline-none placeholder-slate-400"${readOnly ? ' disabled' : ''}>
                    </div>
                </div>
                <div id="editSkuField" class="${skuHidden}">
                    <div class="bg-slate-50 rounded-2xl px-5 py-4">
                        <span class="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-0.5">SKUs Shot</span>
                        <input type="number" id="editSkuInput" placeholder="0" min="0" class="bg-transparent w-full text-[15px] font-semibold outline-none"${readOnly ? ' disabled' : ''}>
                    </div>
                </div>
            </div>
        </div>`;
    } else if (billing === 'hourly') {
        const entryFieldLabel = editingClient?.entry_label || 'Description';
        html += `
        <div id="editHourlyFields" class="space-y-3">
            <div id="editItsFields" class="${hasLabel ? '' : 'hidden'} space-y-3">
                <div class="bg-slate-50 rounded-2xl px-5 py-4">
                    <span class="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-0.5">${entryFieldLabel}</span>
                    <input type="text" id="editShootClientInput" class="bg-transparent w-full text-[15px] font-semibold outline-none placeholder-slate-400"${readOnly ? ' disabled' : ''}>
                </div>
            </div>
            <div id="editRoleSection" class="${showRole ? '' : 'hidden'}">
                <span class="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-1.5 px-1">Role</span>
                <div class="seg-ctrl" style="grid-template-columns: 1fr 1fr;">
                    <button class="seg-btn${editRole === 'Photographer' ? ' active' : ''}" data-editrole="Photographer"${readOnly ? ' disabled' : ''}>Photographer</button>
                    <button class="seg-btn${editRole === 'Operator' ? ' active' : ''}" data-editrole="Operator"${readOnly ? ' disabled' : ''}>Operator</button>
                </div>
            </div>
            <div id="editHourlyDescField" class="${hasLabel ? 'hidden' : ''}">
                <div class="bg-slate-50 rounded-2xl px-5 py-4">
                    <span class="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-0.5">Description</span>
                    <input type="text" id="editHourlyDesc" class="bg-transparent w-full text-[15px] font-semibold outline-none"${readOnly ? ' disabled' : ''}>
                </div>
            </div>
            <div class="grid grid-cols-2 gap-2">
                <div class="bg-slate-50 rounded-2xl px-5 py-4">
                    <span class="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-0.5">Start</span>
                    <input type="time" id="editStartTime" class="bg-transparent w-full text-[15px] font-semibold outline-none relative"${readOnly ? ' disabled' : ''}>
                </div>
                <div class="bg-slate-50 rounded-2xl px-5 py-4">
                    <span class="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-0.5">End</span>
                    <input type="time" id="editFinishTime" class="bg-transparent w-full text-[15px] font-semibold outline-none relative"${readOnly ? ' disabled' : ''}>
                </div>
            </div>
            <div class="bg-slate-50 px-5 py-4 rounded-2xl flex items-center justify-between">
                <div>
                    <span class="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-0.5">Break</span>
                    <div class="flex items-baseline gap-2">
                        <span id="editBreakDisplay" class="text-2xl font-black text-gray-900">0</span>
                        <span class="text-slate-400 text-[11px] font-bold uppercase">min</span>
                    </div>
                    <input type="hidden" id="editBreakMinutes" value="0">
                </div>
                <div class="flex gap-2">
                    <button data-editbreakadj="-15" class="h-9 px-3 bg-white hover:bg-gray-100 text-gray-900 font-bold rounded-xl shadow-sm border border-gray-100 text-[12px] transition-all"${readOnly ? ' disabled' : ''}>-15</button>
                    <button data-editbreakadj="15" class="h-9 px-3 bg-white hover:bg-gray-100 text-gray-900 font-bold rounded-xl shadow-sm border border-gray-100 text-[12px] transition-all"${readOnly ? ' disabled' : ''}>+15</button>
                </div>
            </div>
        </div>`;
    } else {
        html += `
        <div id="editManualFields" class="space-y-3">
            <div class="bg-slate-50 rounded-2xl px-5 py-4">
                <span class="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-0.5">Description</span>
                <input type="text" id="editManualDesc" class="bg-transparent w-full text-[15px] font-semibold outline-none"${readOnly ? ' disabled' : ''}>
            </div>
            <div class="bg-slate-50 rounded-2xl px-5 py-4">
                <span class="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-0.5">Amount ($)</span>
                <input type="number" id="editManualAmount" placeholder="0.00" step="0.01" min="0" class="bg-transparent w-full text-[15px] font-semibold outline-none"${readOnly ? ' disabled' : ''}>
            </div>
        </div>`;
    }

    const bonusHiddenSummary = (billing !== 'day_rate' || editDayType !== 'full' || editWorkflow === 'Own Brand') ? 'hidden' : '';
    const durationHidden     = (billing !== 'hourly') ? 'hidden' : '';
    html += `
        <div class="summary-card bg-white">
            <div class="flex justify-between items-end mb-2">
                <div id="editDurationBlock" class="${durationHidden}">
                    <p class="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Duration</p>
                    <span id="editDisplayDuration" class="text-4xl font-black text-slate-900 leading-none">0h 0m</span>
                </div>
                <div class="text-right">
                    <p class="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Subtotal</p>
                    <h2 id="editDisplayTotal" class="text-2xl font-bold text-slate-800">$0.00</h2>
                </div>
            </div>
            <div class="space-y-1 pt-2 border-t border-slate-100">
                <div class="flex justify-between items-center">
                    <span class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Base</span>
                    <span id="editDisplayBase" class="text-[13px] font-bold text-slate-600">$0.00</span>
                </div>
                <div id="editBonusLine" class="flex justify-between items-center ${bonusHiddenSummary}">
                    <span class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Bonus</span>
                    <span id="editDisplayBonus" class="text-[13px] font-bold text-[#34c759]">+$0.00</span>
                </div>
                <div id="editSuperLine" class="flex justify-between items-center">
                    <span class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Super (12%)</span>
                    <span id="editDisplaySuper" class="text-[13px] font-bold text-[#007AFF]">+$0.00</span>
                </div>
            </div>
        </div>`;

    if (!readOnly) {
        html += `
        <div class="space-y-2 pt-1" id="editActionBtns">
            <button id="editSaveBtn" class="btn-primary">Save Changes</button>
            <button id="editDeleteBtn" class="w-full rounded-2xl text-[15px] font-bold text-red-500 bg-red-50 active:bg-red-100 transition-colors border-none cursor-pointer" style="padding: 18px 14px;">Delete Entry</button>
        </div>`;
    }
    html += `</div>` + desktopSuffix;
    inner.innerHTML = html;

    // Populate values
    document.getElementById('editDate').value = entry.date || '';
    if (billing === 'day_rate') {
        if (editDayType === 'full') {
            if (editWorkflow === 'Own Brand') {
                document.getElementById('editBrandInput').value = entry.brand || '';
            } else {
                document.getElementById('editSkuInput').value = entry.skus != null ? entry.skus : '';
            }
        }
    } else if (billing === 'hourly') {
        if (hasLabel) {
            document.getElementById('editShootClientInput').value = entry.shoot_client || entry.description || '';
        } else {
            document.getElementById('editHourlyDesc').value = entry.description || '';
        }
        document.getElementById('editStartTime').value    = (entry.start_time  || '').substring(0, 5);
        document.getElementById('editFinishTime').value   = (entry.finish_time || '').substring(0, 5);
        document.getElementById('editBreakMinutes').value = entry.break_minutes || 0;
        const editBreakDisp = document.getElementById('editBreakDisplay');
        if (editBreakDisp) editBreakDisp.textContent = entry.break_minutes || 0;
    } else {
        document.getElementById('editManualDesc').value   = entry.description || '';
        document.getElementById('editManualAmount').value = entry.base_amount != null ? entry.base_amount : '';
    }

    // Wire day type buttons
    inner.querySelectorAll('[data-editday]').forEach(b => {
        b.addEventListener('click', () => _setEditDayType(b.dataset.editday));
    });
    inner.querySelectorAll('[data-editwf]').forEach(b => {
        b.addEventListener('click', () => _setEditWorkflow(b.dataset.editwf));
    });
    inner.querySelectorAll('[data-editrole]').forEach(b => {
        b.addEventListener('click', () => _setEditRole(b.dataset.editrole));
    });
    inner.querySelectorAll('[data-editbreakadj]').forEach(b => {
        b.addEventListener('click', () => {
            const el = document.getElementById('editBreakMinutes');
            if (el) {
                el.value = Math.max(0, (parseInt(el.value) || 0) + parseInt(b.dataset.editbreakadj));
                const disp = document.getElementById('editBreakDisplay');
                if (disp) disp.textContent = el.value;
                editRecalculate();
            }
        });
    });

    ['editStartTime','editFinishTime','editBreakMinutes','editSkuInput','editManualAmount','editBrandInput'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', editRecalculate);
    });

    if (!readOnly) {
        document.getElementById('editSaveBtn').addEventListener('click', saveEdit);
        document.getElementById('editDeleteBtn').addEventListener('click', deleteEntryEntry);
    }

    editRecalculate();

    if (desktop) {
        // Wire close button
        document.getElementById('detailPanelClose').addEventListener('click', () => closeEntryCard(wrap));
        // Highlight selected row, open panel
        document.querySelectorAll('.entry-selected').forEach(el => el.classList.remove('entry-selected'));
        wrap.classList.add('entry-selected');
        panel.classList.add('open');
    } else {
        wrap.classList.add('expanded');
        const tabRecent = document.getElementById('entriesScroll');
        const wrapTop = wrap.getBoundingClientRect().top + tabRecent.scrollTop - 100;
        tabRecent.scrollTo({ top: wrapTop, behavior: 'smooth' });
    }
}

function _setEditDayType(type) {
    editDayType = type;
    document.querySelectorAll('[data-editday]').forEach(b => {
        b.classList.toggle('active', b.dataset.editday === type);
    });
    const wfSection = document.getElementById('editWorkflowSection');
    if (wfSection) {
        if (type === 'full') {
            wfSection.classList.remove('hidden');
            _setEditWorkflow(editWorkflow);
        } else {
            wfSection.classList.add('hidden');
            const bl = document.getElementById('editBonusLine');
            if (bl) bl.classList.add('hidden');
        }
    }
    editRecalculate();
}

function _setEditWorkflow(wf) {
    editWorkflow = wf;
    document.querySelectorAll('[data-editwf]').forEach(b => {
        b.classList.toggle('active', b.dataset.editwf === wf);
    });
    const brandField = document.getElementById('editBrandField');
    const skuField   = document.getElementById('editSkuField');
    const bonusLine  = document.getElementById('editBonusLine');
    if (brandField) brandField.classList.toggle('hidden', wf !== 'Own Brand');
    if (skuField)   skuField.classList.toggle('hidden', wf === 'Own Brand');
    if (bonusLine)  bonusLine.classList.toggle('hidden', wf === 'Own Brand');
    editRecalculate();
}

function _setEditRole(role) {
    editRole = role;
    document.querySelectorAll('[data-editrole]').forEach(b => {
        b.classList.toggle('active', b.dataset.editrole === role);
    });
    editRecalculate();
}

function editRecalculate() {
    if (!editingEntry) return;
    const { workflowRates } = getState();
    const billing = editingEntry.billing_type_snapshot;
    const client  = editingClient;
    let result;

    if (billing === 'day_rate' && client) {
        const skuEl = document.getElementById('editSkuInput');
        const skus = skuEl ? (parseInt(skuEl.value) || null) : null;
        result = calcDayRate(client, editDayType, editDayType === 'full' ? editWorkflow : null, skus, workflowRates);
        const bl = document.getElementById('editBonusLine');
        if (bl) bl.classList.toggle('hidden', editDayType !== 'full' || editWorkflow === 'Own Brand');
    } else if (billing === 'hourly' && client) {
        const start  = document.getElementById('editStartTime')?.value;
        const finish = document.getElementById('editFinishTime')?.value;
        const brk    = parseInt(document.getElementById('editBreakMinutes')?.value) || 0;
        result = calcHourly(client, start, finish, brk, editRole);
        if (result) {
            const totalMins = Math.round(result.hoursWorked * 60);
            const durEl = document.getElementById('editDisplayDuration');
            if (durEl) durEl.textContent = `${Math.floor(totalMins / 60)}h ${totalMins % 60}m`;
        }
    } else if (billing === 'manual') {
        const amount = parseFloat(document.getElementById('editManualAmount')?.value) || 0;
        result = calcManual(amount, client);
    } else {
        return;
    }

    if (result) {
        const totalEl = document.getElementById('editDisplayTotal');
        const baseEl  = document.getElementById('editDisplayBase');
        const bonusEl = document.getElementById('editDisplayBonus');
        const superEl = document.getElementById('editDisplaySuper');
        const superLine = document.getElementById('editSuperLine');
        if (totalEl) totalEl.textContent = fmt(result.total);
        if (baseEl)  baseEl.textContent  = fmt(result.base);
        if (bonusEl) bonusEl.textContent = '+' + fmt(result.bonus || 0);
        if (superEl) superEl.textContent = '+' + fmt(result.superAmt || 0);
        if (superLine) superLine.classList.toggle('hidden', (result.superAmt || 0) === 0);
    }
}

function buildEditPayload() {
    const entry   = editingEntry;
    const client  = editingClient;
    const { workflowRates } = getState();
    const billing = entry.billing_type_snapshot;
    const date    = document.getElementById('editDate').value;
    const base    = { date };

    if (billing === 'day_rate') {
        const skus   = parseInt(document.getElementById('editSkuInput').value) || null;
        const brand  = document.getElementById('editBrandInput').value.trim() || null;
        const result = calcDayRate(client, editDayType, editDayType === 'full' ? editWorkflow : null, skus, workflowRates);
        return {
            ...base,
            day_type: editDayType, workflow_type: editDayType === 'full' ? editWorkflow : null,
            brand: editDayType === 'full' && editWorkflow === 'Own Brand' ? brand : null,
            skus:  editDayType === 'full' && editWorkflow !== 'Own Brand' ? skus : null,
            base_amount: result.base, bonus_amount: result.bonus,
            super_amount: result.superAmt, total_amount: result.total,
        };
    } else if (billing === 'hourly') {
        const start  = document.getElementById('editStartTime').value;
        const finish = document.getElementById('editFinishTime').value;
        const brk    = parseInt(document.getElementById('editBreakMinutes').value) || 0;
        const result = calcHourly(client, start, finish, brk, editRole);
        const hasLbl      = !!client?.entry_label;
        const description = hasLbl ? document.getElementById('editShootClientInput').value.trim() || null : document.getElementById('editHourlyDesc').value.trim() || null;
        const role        = client?.show_role ? editRole : null;
        return {
            ...base,
            start_time: start, finish_time: finish, break_minutes: brk,
            hours_worked: result.hoursWorked, shoot_client: null, role, description,
            base_amount: result.base, bonus_amount: 0,
            super_amount: result.superAmt, total_amount: result.total,
        };
    } else {
        const amount = parseFloat(document.getElementById('editManualAmount').value) || 0;
        const result = calcManual(amount, client);
        return {
            ...base,
            description:  document.getElementById('editManualDesc').value.trim() || null,
            base_amount: result.base, bonus_amount: 0,
            super_amount: result.superAmt, total_amount: result.total,
        };
    }
}

async function saveEdit() {
    const btn = document.getElementById('editSaveBtn');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
        const payload = buildEditPayload();
        const { error } = await sb.from('entries').update(payload).eq('id', editingEntry.id);
        if (error) throw error;
        const wrap = expandedWrap;
        closeEntryCard(wrap);
        loadRecentEntries();
    } catch (err) {
        alert('Error saving entry: ' + err.message);
        btn.disabled = false;
        btn.textContent = 'Save Changes';
    }
}

async function deleteEntryEntry() {
    if (!confirm('Delete this entry? This cannot be undone.')) return;
    try {
        const { error } = await sb.from('entries').delete().eq('id', editingEntry.id);
        if (error) throw error;
        const wrap = expandedWrap;
        closeEntryCard(wrap);
        loadRecentEntries();
    } catch (err) {
        alert('Error deleting entry: ' + err.message);
    }
}

// ─────────────────────────────────────────────
// PULL TO REFRESH + INFINITE SCROLL
// ─────────────────────────────────────────────

export function initScrollHandlers() {
    // View mode toggle
    document.getElementById('entriesViewToggle')?.addEventListener('click', e => {
        const btn = e.target.closest('[data-entriesview]');
        if (!btn) return;
        const mode = btn.dataset.entriesview;
        if (mode === entriesViewMode) return;
        entriesViewMode = mode;
        document.querySelectorAll('#entriesViewToggle .seg-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.entriesview === mode);
        });
        // Re-render from cache without refetch
        if (entriesRawCache.length) {
            const list = document.getElementById('recentList');
            list.innerHTML = '';
            renderEntries(list, entriesRawCache, 0);
            updateLoadMoreSentinel();
            appendNewEntryCard(list, 0);
        }
    });

    // Pull to refresh
    (function() {
        const THRESHOLD = 110, MAX_PULL = 130;
        let startY = 0, pulling = false, triggered = false;
        const scroller  = document.getElementById('tabRecent');
        const indicator = document.getElementById('pullIndicator');
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
            document.getElementById('pullSpinner').style.transform = `rotate(${progress * 270}deg)`;
            if (dy >= THRESHOLD) triggered = true;
        }, { passive: true });
        scroller.addEventListener('touchend', async () => {
            if (!pulling) return;
            pulling = false;
            if (triggered) {
                document.getElementById('pullSpinner').style.transform = '';
                await loadRecentEntries();
            }
            indicator.classList.remove('visible');
        });
    })();

    // Infinite scroll
    const scroller = document.getElementById('tabRecent');
    scroller.addEventListener('scroll', async () => {
        if (entriesScrollLoading || entriesAllLoaded) return;
        const distFromBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
        if (distFromBottom < 300) {
            entriesScrollLoading = true;
            await loadMoreEntries();
            entriesScrollLoading = false;
        }
    }, { passive: true });
}
