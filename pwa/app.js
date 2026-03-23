// ─────────────────────────────────────────────
// CONFIG  (replace before deploying)
// ─────────────────────────────────────────────
const SUPABASE_URL      = 'https://cmbycqzjlwvydemaxrtb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_UYYQBD6MkiRxpv7Z_-sIGA_riCDJQzD';

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────
let allClients       = [];
let workflowRates    = [];
let selectedClient   = null;
let currentDayType   = 'full';
let currentWorkflow  = 'Apparel';
let currentRole      = 'Photographer';
let superOverride    = false;   // for manual clients

// New entry card state
let newEntryWrap           = null;
let newEntrySelectedClient = null;
let newEntryDayType        = 'full';
let newEntryWorkflow       = 'Apparel';
let newEntryRole           = 'Photographer';
let newEntrySuperOverride  = false;

// ─────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────
async function init() {
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
        showApp();
        await loadData();
    } else {
        showLogin();
    }
}

function showLogin() {
    document.getElementById('loginScreen').classList.add('active');
    document.getElementById('appShell').classList.remove('active');
}

function showApp() {
    document.getElementById('loginScreen').classList.remove('active');
    document.getElementById('appShell').classList.add('active');
}

document.getElementById('loginBtn').addEventListener('click', async () => {
    const email    = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errEl    = document.getElementById('loginError');
    const btn      = document.getElementById('loginBtn');

    btn.disabled   = true;
    btn.textContent = 'Signing in…';
    errEl.classList.add('hidden');

    const { error } = await sb.auth.signInWithPassword({ email, password });
    btn.disabled   = false;
    btn.textContent = 'Sign In';

    if (error) {
        errEl.textContent = error.message;
        errEl.classList.remove('hidden');
    } else {
        showApp();
        await loadData();
    }
});

document.getElementById('signOutBtn').addEventListener('click', async () => {
    await sb.auth.signOut();
    resetForm();
    showLogin();
});

// ─────────────────────────────────────────────
// DATA LOADING
// ─────────────────────────────────────────────
async function loadData() {
    const [{ data: clients }, { data: rates }] = await Promise.all([
        sb.from('clients').select('*').eq('is_active', true).order('name'),
        sb.from('client_workflow_rates').select('*')
    ]);
    allClients   = clients || [];
    workflowRates = rates || [];

    setDefaultDate();
    loadRecentEntries();
}

function setDefaultDate() {
    const today = new Date();
    const yyyy  = today.getFullYear();
    const mm    = String(today.getMonth() + 1).padStart(2, '0');
    const dd    = String(today.getDate()).padStart(2, '0');
    document.getElementById('entryDate').value = `${yyyy}-${mm}-${dd}`;
}


// ─────────────────────────────────────────────
// CLIENT AUTOCOMPLETE
// ─────────────────────────────────────────────
const clientInput     = document.getElementById('clientInput');
const clientContainer = document.getElementById('clientContainer');
const autocompleteList = document.getElementById('autocompleteList');

clientInput.addEventListener('input', () => {
    const val = clientInput.value.trim();
    autocompleteList.innerHTML = '';

    if (!val) { autocompleteList.style.display = 'none'; return; }

    const matches = allClients.filter(c =>
        c.name.toLowerCase().includes(val.toLowerCase())
    );

    if (!matches.length) { autocompleteList.style.display = 'none'; return; }

    matches.forEach(client => {
        const el = document.createElement('div');
        el.className = 'px-5 py-4 cursor-pointer active:bg-slate-50 border-b border-slate-100 last:border-0';
        el.innerHTML = `
            <div class="font-bold text-slate-800">${client.name}</div>`;
        el.addEventListener('click', () => selectClient(client));
        autocompleteList.appendChild(el);
    });
    autocompleteList.style.display = 'block';
});


function selectClient(client) {
    selectedClient = client;
    clientInput.value    = client.name;
    clientInput.disabled = true;
    clientContainer.classList.add('has-client');
    autocompleteList.style.display = 'none';
    document.getElementById('clientSection').classList.add('fields-open');
    showEntryFields(client);
}

document.getElementById('clearClient').addEventListener('click', () => {
    clientInput.value    = '';
    clientInput.disabled = false;
    clientContainer.classList.remove('has-client');
    selectedClient = null;
    document.getElementById('entryFields').classList.remove('open');
    document.getElementById('clientSection').classList.remove('fields-open');
});

// Close autocomplete on outside click
document.addEventListener('click', (e) => {
    if (!clientContainer.contains(e.target)) {
        autocompleteList.style.display = 'none';
    }
});

// ─────────────────────────────────────────────
// SHOW ENTRY FIELDS (client-aware)
// ─────────────────────────────────────────────
function showEntryFields(client) {
    // Hide all billing sections first
    document.getElementById('dayRateFields').classList.add('hidden');
    document.getElementById('hourlyFields').classList.add('hidden');
    document.getElementById('manualFields').classList.add('hidden');
    document.getElementById('durationBlock').classList.add('hidden');
    document.getElementById('bonusLine').classList.add('hidden');
    document.getElementById('superLine').classList.add('hidden');

    if (client.billing_type === 'day_rate') {
        document.getElementById('dayRateFields').classList.remove('hidden');
        document.getElementById('bonusLine').classList.remove('hidden');
        if (client.pays_super) document.getElementById('superLine').classList.remove('hidden');
        setDayType('full');

    } else if (client.billing_type === 'hourly') {
        document.getElementById('hourlyFields').classList.remove('hidden');
        document.getElementById('durationBlock').classList.remove('hidden');
        if (client.pays_super) document.getElementById('superLine').classList.remove('hidden');

        // ITS-specific fields
        const isITS = client.name.toLowerCase().includes('images that sell');
        document.getElementById('itsFields').classList.toggle('hidden', !isITS);
        document.getElementById('hourlyDescField').classList.toggle('hidden', isITS);

        // Default times
        document.getElementById('startTime').value  = '09:00';
        document.getElementById('finishTime').value = '17:00';
        document.getElementById('breakMinutes').value = '0';

    } else { // manual
        document.getElementById('manualFields').classList.remove('hidden');
        // Pre-set super toggle from client setting
        superOverride = client.pays_super;
        const toggle  = document.getElementById('superToggle');
        toggle.checked = superOverride;
        updateSuperToggleLabel();
        if (client.pays_super) document.getElementById('superLine').classList.remove('hidden');
    }

    document.getElementById('entryFields').classList.add('open');
    document.getElementById('saveBtn').disabled = false;
    recalculate();

    setTimeout(() => {
        document.getElementById('entryFields').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
}

// ─────────────────────────────────────────────
// DAY RATE CONTROLS
// ─────────────────────────────────────────────
function setDayType(type) {
    currentDayType = type;
    document.querySelectorAll('[data-day]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.day === type);
    });

    const workflowSection = document.getElementById('workflowSection');
    const bonusLine       = document.getElementById('bonusLine');

    if (type === 'full') {
        workflowSection.classList.add('open');
        bonusLine.classList.remove('hidden');
    } else {
        workflowSection.classList.remove('open');
        bonusLine.classList.add('hidden');
    }
    recalculate();
}

function setWorkflow(wf) {
    currentWorkflow = wf;
    document.querySelectorAll('[data-wf]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.wf === wf);
    });
    document.getElementById('brandField').classList.toggle('hidden', wf !== 'Own Brand');
    document.getElementById('skuField').classList.toggle('hidden', wf === 'Own Brand');
    recalculate();
}

// ─────────────────────────────────────────────
// HOURLY CONTROLS
// ─────────────────────────────────────────────
function setRole(role) {
    currentRole = role;
    document.querySelectorAll('[data-role]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.role === role);
    });
}

window.adjustBreak = (val) => {
    const el  = document.getElementById('breakMinutes');
    el.value  = Math.max(0, parseInt(el.value || 0) + val);
    recalculate();
};

// ─────────────────────────────────────────────
// SUPER TOGGLE (manual clients)
// ─────────────────────────────────────────────
document.getElementById('superToggle').addEventListener('change', (e) => {
    superOverride = e.target.checked;
    document.getElementById('superLine').classList.toggle('hidden', !superOverride);
    updateSuperToggleLabel();
    recalculate();
});

function updateSuperToggleLabel() {
    document.getElementById('superToggleLabel').textContent = superOverride ? 'Super will be added' : 'Off';
}

// ─────────────────────────────────────────────
// CALCULATION
// ─────────────────────────────────────────────
function toMins(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}

function fmt(n) {
    return '$' + Number(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function calcDayRate(client, dayType, workflow, skus) {
    const base = dayType === 'full'
        ? parseFloat(client.rate_full_day)
        : parseFloat(client.rate_half_day);

    let bonus = 0;
    if (dayType === 'full') {
        if (workflow === 'Own Brand') {
            bonus = 40;
        } else {
            const clientRates = workflowRates.filter(r => r.client_id === client.id);
            const rate = clientRates.find(r => r.workflow === workflow);
            if (rate && skus != null) {
                const s = parseInt(skus) || 0;
                if (s >= rate.upper_limit_skus) {
                    bonus = parseFloat(rate.max_bonus);
                } else if (s > rate.kpi) {
                    bonus = Math.min((s - rate.kpi) * parseFloat(rate.incentive_rate_per_sku), parseFloat(rate.max_bonus));
                }
            }
        }
    }

    const subtotal = base + bonus;
    const superAmt = client.pays_super ? subtotal * parseFloat(client.super_rate || 0.12) : 0;
    return { base, bonus, superAmt, total: subtotal + superAmt, hoursWorked: null };
}

function calcHourly(client, startStr, finishStr, breakMins) {
    if (!startStr || !finishStr) return null;
    let diffMins = (toMins(finishStr) - toMins(startStr) + 1440) % 1440;
    diffMins = Math.max(0, diffMins - (parseInt(breakMins) || 0));
    // Round to nearest quarter hour
    const roundedHours = Math.round(diffMins / 60 / 0.25) * 0.25;
    const base     = roundedHours * parseFloat(client.rate_hourly);
    const superAmt = client.pays_super ? base * parseFloat(client.super_rate || 0.12) : 0;
    return { base, bonus: 0, superAmt, total: base + superAmt, hoursWorked: roundedHours, rawMins: diffMins };
}

function calcManual(amountStr, paysSuper, superRate) {
    const base     = parseFloat(amountStr) || 0;
    const superAmt = paysSuper ? base * parseFloat(superRate || 0.12) : 0;
    return { base, bonus: 0, superAmt, total: base + superAmt, hoursWorked: null };
}

function recalculate() {
    if (!selectedClient) return;

    let result = null;

    if (selectedClient.billing_type === 'day_rate') {
        const skus = document.getElementById('skuInput').value;
        result = calcDayRate(selectedClient, currentDayType, currentWorkflow, skus);

    } else if (selectedClient.billing_type === 'hourly') {
        const start  = document.getElementById('startTime').value;
        const finish = document.getElementById('finishTime').value;
        const brk    = document.getElementById('breakMinutes').value;
        result = calcHourly(selectedClient, start, finish, brk);

        if (result) {
            const h = Math.floor(result.rawMins / 60);
            const m = result.rawMins % 60;
            document.getElementById('displayDuration').textContent = `${h}h ${m}m`;
        }

    } else { // manual
        const amount = document.getElementById('manualAmount').value;
        result = calcManual(amount, superOverride, selectedClient.super_rate);
    }

    if (!result) return;

    document.getElementById('displayTotal').textContent = fmt(result.total);
    document.getElementById('displayBase').textContent  = fmt(result.base);
    document.getElementById('displayBonus').textContent = `+${fmt(result.bonus)}`;
    document.getElementById('displaySuper').textContent = `+${fmt(result.superAmt)}`;
}

// Wire up recalc listeners
['startTime', 'finishTime', 'breakMinutes', 'skuInput', 'manualAmount', 'brandInput']
    .forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', recalculate);
    });

// ─────────────────────────────────────────────
// SAVE ENTRY
// ─────────────────────────────────────────────
document.getElementById('saveBtn').addEventListener('click', async () => {
    if (!selectedClient) return;
    const btn = document.getElementById('saveBtn');
    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
        const payload = buildPayload();
        const { error } = await sb.from('entries').insert(payload);
        if (error) throw error;

        btn.textContent = 'Saved ✓';
        btn.classList.add('success');
        setTimeout(() => {
            btn.classList.remove('success');
            btn.textContent = 'Save Entry';
            resetForm();
        }, 2000);
    } catch (err) {
        alert('Error saving entry: ' + err.message);
        btn.disabled = false;
        btn.textContent = 'Save Entry';
    }
});

function buildPayload() {
    const date = document.getElementById('entryDate').value;
    const base = {
        client_id: selectedClient.id,
        date,
        billing_type_snapshot: selectedClient.billing_type,
    };

    if (selectedClient.billing_type === 'day_rate') {
        const skus   = parseInt(document.getElementById('skuInput').value) || null;
        const brand  = document.getElementById('brandInput').value.trim() || null;
        const result = calcDayRate(selectedClient, currentDayType, currentWorkflow, skus);
        return {
            ...base,
            day_type:      currentDayType,
            workflow_type: currentDayType === 'full' ? currentWorkflow : null,
            brand:         currentDayType === 'full' && currentWorkflow === 'Own Brand' ? brand : null,
            skus:          currentDayType === 'full' && currentWorkflow !== 'Own Brand' ? skus : null,
            base_amount:   result.base,
            bonus_amount:  result.bonus,
            super_amount:  result.superAmt,
            total_amount:  result.total,
        };

    } else if (selectedClient.billing_type === 'hourly') {
        const start  = document.getElementById('startTime').value;
        const finish = document.getElementById('finishTime').value;
        const brk    = parseInt(document.getElementById('breakMinutes').value) || 0;
        const result = calcHourly(selectedClient, start, finish, brk);

        const isITS = selectedClient.name.toLowerCase().includes('images that sell');
        const shootClient = isITS ? document.getElementById('shootClientInput').value.trim() || null : null;
        const role        = isITS ? currentRole : null;
        const description = !isITS ? document.getElementById('hourlyDesc').value.trim() || null : null;

        return {
            ...base,
            start_time:    start,
            finish_time:   finish,
            break_minutes: brk,
            hours_worked:  result.hoursWorked,
            shoot_client:  shootClient,
            role,
            description,
            base_amount:   result.base,
            bonus_amount:  0,
            super_amount:  result.superAmt,
            total_amount:  result.total,
        };

    } else { // manual
        const amount = parseFloat(document.getElementById('manualAmount').value) || 0;
        const desc   = document.getElementById('manualDesc').value.trim() || null;
        const result = calcManual(amount, superOverride, selectedClient.super_rate);
        return {
            ...base,
            description:  desc,
            base_amount:  result.base,
            bonus_amount: 0,
            super_amount: result.superAmt,
            total_amount: result.total,
        };
    }
}

function resetForm() {
    clientInput.value    = '';
    clientInput.disabled = false;
    clientContainer.classList.remove('has-client');
    selectedClient     = null;
    currentDayType     = 'full';
    currentWorkflow    = 'Apparel';
    currentRole        = 'Photographer';

    document.getElementById('entryFields').classList.remove('open');
    document.getElementById('clientSection').classList.remove('fields-open');
    document.getElementById('saveBtn').disabled = true;
    document.getElementById('saveBtn').textContent = 'Save Entry';

    // Reset amounts
    document.getElementById('displayTotal').textContent = '$0.00';
    document.getElementById('displayBase').textContent  = '$0.00';
    document.getElementById('displayBonus').textContent = '+$0.00';
    document.getElementById('displaySuper').textContent = '+$0.00';
    document.getElementById('displayDuration').textContent = '0h 0m';

    setDefaultDate();
}

// ─────────────────────────────────────────────
// RECENT ENTRIES
// ─────────────────────────────────────────────
async function loadRecentEntries() {
    const list = document.getElementById('recentList');
    list.innerHTML = '<div class="spinner"></div>';

    const { data: rawData, error } = await sb
        .from('entries')
        .select('*, clients(name, billing_type), invoices(invoice_number, status)')
        .order('date', { ascending: false })
        .limit(25);

    const data = rawData?.slice().reverse();

    if (error || !data?.length) {
        list.innerHTML = '';
        appendNewEntryCard(list, 0);
        return;
    }

    // Group entries by ISO week
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

    list.innerHTML = '';
    let cardIndex = 0;
    weeks.forEach(({ weekStart, entries }) => {
        // Week header
        const header = document.createElement('div');
        header.className = 'week-header';
        header.style.animation = `cardIn 0.3s ease both`;
        header.style.animationDelay = `${cardIndex * 40}ms`;
        const weekTotal = entries.reduce((sum, e) => sum + (e.total_amount || 0), 0);
        header.innerHTML = `<span>${formatWeekLabel(weekStart)}</span><span>${fmt(weekTotal)}</span>`;
        list.appendChild(header);

        // Cards
        const group = document.createElement('div');
        group.className = 'week-group';
        entries.forEach(entry => {
            const clientName  = entry.clients?.name || 'Unknown';
            const badgeColor  = clientBadgeColor(clientName);
            const description = entryDescription(entry);
            const total       = fmt(entry.total_amount);
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
            wrap.style.animationDelay = `${cardIndex * 40}ms`;
            cardIndex++;

            const detailPanel = document.createElement('div');
            detailPanel.className = 'entry-detail-panel';
            const detailInner = document.createElement('div');
            detailInner.className = 'entry-detail-inner';
            detailPanel.appendChild(detailInner);

            if (!isInvoiced) {
                el.addEventListener('click', () => openEntryCard(wrap, entry, false));
                const swipeContainer = document.createElement('div');
                swipeContainer.className = 'swipe-container';
                swipeContainer.innerHTML = '<div class="swipe-delete-bg"><svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>Delete</div>';
                swipeContainer.appendChild(el);
                addSwipeToDelete(swipeContainer, el, entry);
                wrap.appendChild(swipeContainer);
            } else {
                el.addEventListener('click', () => openEntryCard(wrap, entry, true));
                wrap.appendChild(el);
            }

            wrap.appendChild(detailPanel);
            group.appendChild(wrap);
        });
        list.appendChild(group);
    });

    appendNewEntryCard(list, cardIndex);
}

function appendNewEntryCard(list, cardIndex) {
    const newWrap = document.createElement('div');
    newWrap.className = 'entry-card-wrap';
    newWrap.style.animationDelay = `${cardIndex * 40 + 40}ms`;
    newWrap.style.marginTop = '1.25rem';
    newWrap.innerHTML = buildNewEntryFormHTML();
    list.appendChild(newWrap);
    newEntryWrap = newWrap;
    wireNewEntryForm();
}

// ─────────────────────────────────────────────
// NEW ENTRY CARD
// ─────────────────────────────────────────────
function closeNewEntryCard() {
    if (!newEntryWrap) return;

    newEntrySelectedClient = null;
    newEntryDayType        = 'full';
    newEntryWorkflow       = 'Apparel';
    newEntryRole           = 'Photographer';
    newEntrySuperOverride  = false;

    // Re-render the card fresh
    newEntryWrap.innerHTML = buildNewEntryFormHTML();
    wireNewEntryForm();
}

function buildNewEntryFormHTML() {
    return `
    <div style="background:#fff; border-radius:14px; padding:14px 16px; display:flex; flex-direction:column; gap:0;">
        <!-- Client selector -->
        <div id="newClientContainer" class="relative">
            <div class="relative flex items-center">
                <input type="text" id="newClientInput" placeholder="Client" autocomplete="off"
                    class="input-field w-full rounded-xl px-4 py-2.5 text-[15px] placeholder-slate-400 pr-10 font-medium" style="border-color: transparent !important;">
                <button id="newClearClient" class="clear-btn absolute right-3 p-1 rounded-full bg-slate-200 text-slate-500">
                    <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                </button>
            </div>
            <div id="newAutocompleteList" style="position:absolute;left:0;right:0;top:calc(100% + 6px);background:rgba(255,255,255,0.98);backdrop-filter:blur(20px);border:1px solid rgba(0,0,0,0.06);border-radius:1rem;box-shadow:0 8px 32px rgba(0,0,0,0.10);z-index:200;overflow:hidden;display:none;"></div>
        </div>

        <!-- Billing fields (revealed after client select) -->
        <div id="newEntryFields" class="reveal space-y-3 mt-3">

            <!-- Date -->
            <div class="bg-slate-50 rounded-xl px-4 py-2.5">
                <span class="text-[9px] font-semibold text-slate-400 uppercase tracking-wider block mb-0.5">Date</span>
                <input type="date" id="newEntryDate" class="bg-transparent w-full text-[15px] font-medium outline-none">
            </div>

            <!-- DAY RATE -->
            <div id="newDayRateFields" class="hidden space-y-3">
                <div>
                    <span class="text-[9px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5 px-1">Day Type</span>
                    <div class="seg-ctrl" style="grid-template-columns: 1fr 1fr;">
                        <button class="seg-btn active" data-newday="full">Full Day</button>
                        <button class="seg-btn" data-newday="half">Half Day</button>
                    </div>
                </div>
                <div id="newWorkflowSection" class="reveal open space-y-3">
                    <div>
                        <span class="text-[9px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5 px-1">Workflow</span>
                        <div class="flex gap-1.5" id="newWorkflowBtns">
                            <button class="workflow-btn active" data-newwf="Apparel">Apparel</button>
                            <button class="workflow-btn" data-newwf="Product">Product</button>
                            <button class="workflow-btn" data-newwf="Own Brand">Own Brand</button>
                        </div>
                    </div>
                    <div id="newBrandField" class="hidden">
                        <input type="text" id="newBrandInput" placeholder="Brand name"
                            class="input-field w-full rounded-xl px-4 py-2.5 text-[15px] placeholder-slate-400 font-medium">
                    </div>
                    <div id="newSkuField" class="hidden">
                        <div class="bg-slate-50 rounded-xl px-4 py-2.5">
                            <span class="text-[9px] font-semibold text-slate-400 uppercase tracking-wider block mb-0.5">SKUs Shot</span>
                            <input type="number" id="newSkuInput" placeholder="0" min="0"
                                class="bg-transparent w-full text-[15px] font-medium outline-none">
                        </div>
                    </div>
                </div>
            </div>

            <!-- HOURLY -->
            <div id="newHourlyFields" class="hidden space-y-3">
                <div id="newItsFields" class="hidden space-y-3">
                    <input type="text" id="newShootClientInput" placeholder="Shoot Client"
                        class="input-field w-full rounded-xl px-4 py-2.5 text-[15px] placeholder-slate-400 font-medium">
                    <div>
                        <span class="text-[9px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5 px-1">Role</span>
                        <div class="seg-ctrl" style="grid-template-columns: 1fr 1fr;">
                            <button class="seg-btn active" data-newrole="Photographer">Photographer</button>
                            <button class="seg-btn" data-newrole="Operator">Operator</button>
                        </div>
                    </div>
                </div>
                <div id="newHourlyDescField" class="hidden">
                    <textarea id="newHourlyDesc" rows="2" placeholder="Description"
                        class="input-field w-full rounded-xl px-4 py-2.5 text-[15px] placeholder-slate-400 resize-none font-medium"></textarea>
                </div>
                <div class="grid grid-cols-2 gap-2">
                    <div class="bg-slate-50 rounded-xl px-4 py-2.5">
                        <span class="text-[9px] font-semibold text-slate-400 uppercase tracking-wider block mb-0.5">Start</span>
                        <input type="time" id="newStartTime" class="bg-transparent w-full text-[15px] font-medium outline-none relative">
                    </div>
                    <div class="bg-slate-50 rounded-xl px-4 py-2.5">
                        <span class="text-[9px] font-semibold text-slate-400 uppercase tracking-wider block mb-0.5">End</span>
                        <input type="time" id="newFinishTime" class="bg-transparent w-full text-[15px] font-medium outline-none relative">
                    </div>
                </div>
                <div class="bg-white px-4 py-2.5 rounded-xl flex items-center justify-between">
                    <div>
                        <span class="text-[9px] font-semibold uppercase tracking-wider text-slate-400 block mb-0.5">Break</span>
                        <div class="flex items-baseline gap-1">
                            <input type="number" id="newBreakMinutes" value="0" min="0" step="5"
                                class="bg-transparent border-none p-0 w-10 text-[15px] font-bold focus:ring-0 text-slate-800 outline-none">
                            <span class="text-slate-400 text-[11px] font-bold uppercase">min</span>
                        </div>
                    </div>
                    <div class="flex gap-1.5">
                        <button data-newbreakadj="15" class="h-8 px-3 bg-slate-100 rounded-lg text-[12px] font-bold active:bg-slate-200 transition-all">+15</button>
                        <button data-newbreakadj="30" class="h-8 px-3 bg-slate-100 rounded-lg text-[12px] font-bold active:bg-slate-200 transition-all">+30</button>
                    </div>
                </div>
            </div>

            <!-- MANUAL -->
            <div id="newManualFields" class="hidden space-y-3">
                <textarea id="newManualDesc" rows="2" placeholder="Description"
                    class="input-field w-full rounded-xl px-4 py-2.5 text-[15px] placeholder-slate-400 resize-none font-medium"></textarea>
                <div class="bg-slate-50 rounded-xl px-4 py-2.5">
                    <span class="text-[9px] font-semibold text-slate-400 uppercase tracking-wider block mb-0.5">Amount ($)</span>
                    <input type="number" id="newManualAmount" placeholder="0.00" step="0.01" min="0"
                        class="bg-transparent w-full text-[15px] font-medium outline-none">
                </div>
                <div class="bg-white rounded-xl px-4 py-2.5 flex items-center justify-between">
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
            <div class="summary-card px-4 py-3 bg-white">
                <div class="flex justify-between items-baseline mb-2">
                    <div>
                        <p class="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Total</p>
                        <h2 id="newDisplayTotal" class="text-3xl font-bold tracking-tight text-slate-900">$0.00</h2>
                    </div>
                    <div class="text-right hidden" id="newDurationBlock">
                        <p class="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Duration</p>
                        <p id="newDisplayDuration" class="text-base font-bold text-slate-700">0h 0m</p>
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

    // Client autocomplete
    const clientInput = document.getElementById('newClientInput');
    const autocomplete = document.getElementById('newAutocompleteList');
    clientInput.addEventListener('input', () => {
        const val = clientInput.value.trim();
        autocomplete.innerHTML = '';
        if (!val) { autocomplete.style.display = 'none'; return; }
        const matches = allClients.filter(c => c.name.toLowerCase().includes(val.toLowerCase()));
        if (!matches.length) { autocomplete.style.display = 'none'; return; }
        matches.forEach(client => {
            const el = document.createElement('div');
            el.className = 'px-4 py-3 cursor-pointer active:bg-slate-50 border-b border-slate-100 last:border-0 font-bold text-slate-800 text-[15px]';
            el.textContent = client.name;
            el.addEventListener('click', () => selectNewEntryClient(client));
            autocomplete.appendChild(el);
        });
        autocomplete.style.display = 'block';
    });

    // Clear client
    document.getElementById('newClearClient').addEventListener('click', () => {
        clientInput.value    = '';
        clientInput.disabled = false;
        document.getElementById('newClientContainer').classList.remove('has-client');
        newEntrySelectedClient = null;
        document.getElementById('newEntryFields').classList.remove('open');
    });

    // Day type buttons
    newEntryWrap.querySelectorAll('[data-newday]').forEach(btn => {
        btn.addEventListener('click', () => setNewEntryDayType(btn.dataset.newday));
    });

    // Workflow buttons
    newEntryWrap.querySelectorAll('[data-newwf]').forEach(btn => {
        btn.addEventListener('click', () => setNewEntryWorkflow(btn.dataset.newwf));
    });

    // Role buttons
    newEntryWrap.querySelectorAll('[data-newrole]').forEach(btn => {
        btn.addEventListener('click', () => setNewEntryRole(btn.dataset.newrole));
    });

    // Break adjust
    newEntryWrap.querySelectorAll('[data-newbreakadj]').forEach(btn => {
        btn.addEventListener('click', () => {
            const el = document.getElementById('newBreakMinutes');
            el.value = Math.max(0, (parseInt(el.value) || 0) + parseInt(btn.dataset.newbreakadj));
            newEntryRecalculate();
        });
    });

    // Live recalc
    ['newStartTime','newFinishTime','newBreakMinutes','newSkuInput','newManualAmount','newBrandInput'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', newEntryRecalculate);
    });

    // Super toggle
    const superToggle = document.getElementById('newSuperToggle');
    if (superToggle) {
        superToggle.addEventListener('change', function() {
            newEntrySuperOverride = this.checked;
            document.getElementById('newSuperLine').classList.toggle('hidden', !newEntrySuperOverride);
            document.getElementById('newSuperToggleLabel').textContent = newEntrySuperOverride ? 'Super will be added' : 'Off';
            newEntryRecalculate();
        });
    }

    // Save
    document.getElementById('newSaveBtn').addEventListener('click', saveNewEntry);
}

function selectNewEntryClient(client) {
    newEntrySelectedClient = client;
    const clientInput = document.getElementById('newClientInput');
    clientInput.value    = client.name;
    clientInput.disabled = true;
    document.getElementById('newClientContainer').classList.add('has-client');
    document.getElementById('newAutocompleteList').style.display = 'none';
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

        const isITS = client.name.toLowerCase().includes('images that sell');
        document.getElementById('newItsFields').classList.toggle('hidden', !isITS);
        document.getElementById('newHourlyDescField').classList.toggle('hidden', isITS);

        document.getElementById('newStartTime').value    = '09:00';
        document.getElementById('newFinishTime').value   = '17:00';
        document.getElementById('newBreakMinutes').value = '0';

    } else { // manual
        document.getElementById('newManualFields').classList.remove('hidden');
        newEntrySuperOverride = client.pays_super;
        const toggle = document.getElementById('newSuperToggle');
        toggle.checked = newEntrySuperOverride;
        document.getElementById('newSuperToggleLabel').textContent = newEntrySuperOverride ? 'Super will be added' : 'Off';
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
    let result = null;

    if (client.billing_type === 'day_rate') {
        const skus = document.getElementById('newSkuInput')?.value;
        result = calcDayRate(client, newEntryDayType, newEntryWorkflow, skus);

    } else if (client.billing_type === 'hourly') {
        const start  = document.getElementById('newStartTime').value;
        const finish = document.getElementById('newFinishTime').value;
        const brk    = document.getElementById('newBreakMinutes').value;
        result = calcHourly(client, start, finish, brk);
        if (result) {
            const h = Math.floor(result.rawMins / 60);
            const m = result.rawMins % 60;
            document.getElementById('newDisplayDuration').textContent = `${h}h ${m}m`;
        }

    } else { // manual
        const amount = document.getElementById('newManualAmount').value;
        result = calcManual(amount, newEntrySuperOverride, client.super_rate);
    }

    if (!result) return;
    document.getElementById('newDisplayTotal').textContent = fmt(result.total);
    document.getElementById('newDisplayBase').textContent  = fmt(result.base);
    document.getElementById('newDisplayBonus').textContent = `+${fmt(result.bonus)}`;
    document.getElementById('newDisplaySuper').textContent = `+${fmt(result.superAmt)}`;
}

function buildNewEntryPayload() {
    const client = newEntrySelectedClient;
    const date   = document.getElementById('newEntryDate').value;
    const base   = {
        client_id: client.id,
        date,
        billing_type_snapshot: client.billing_type,
    };

    if (client.billing_type === 'day_rate') {
        const skus   = parseInt(document.getElementById('newSkuInput').value) || null;
        const brand  = document.getElementById('newBrandInput').value.trim() || null;
        const result = calcDayRate(client, newEntryDayType, newEntryWorkflow, skus);
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
        const result = calcHourly(client, start, finish, brk);
        const isITS  = client.name.toLowerCase().includes('images that sell');
        return {
            ...base,
            start_time:    start,
            finish_time:   finish,
            break_minutes: brk,
            hours_worked:  result.hoursWorked,
            shoot_client:  isITS ? document.getElementById('newShootClientInput').value.trim() || null : null,
            role:          isITS ? newEntryRole : null,
            description:   !isITS ? document.getElementById('newHourlyDesc').value.trim() || null : null,
            base_amount:   result.base,
            bonus_amount:  0,
            super_amount:  result.superAmt,
            total_amount:  result.total,
        };

    } else { // manual
        const amount = parseFloat(document.getElementById('newManualAmount').value) || 0;
        const result = calcManual(amount, newEntrySuperOverride, client.super_rate);
        return {
            ...base,
            description:  document.getElementById('newManualDesc').value.trim() || null,
            base_amount:  result.base,
            bonus_amount: 0,
            super_amount: result.superAmt,
            total_amount: result.total,
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
// PULL TO REFRESH
// ─────────────────────────────────────────────
(function() {
    const THRESHOLD = 72;   // px of pull needed to trigger
    const MAX_PULL  = 90;   // px cap on drag
    let startY = 0, pulling = false, triggered = false;

    const scroller   = document.getElementById('entriesScroll');
    const indicator  = document.getElementById('pullIndicator');

    scroller.addEventListener('touchstart', e => {
        if (scroller.scrollTop > 0) return;
        startY   = e.touches[0].clientY;
        pulling  = true;
        triggered = false;
    }, { passive: true });

    scroller.addEventListener('touchmove', e => {
        if (!pulling) return;
        const dy = Math.min(e.touches[0].clientY - startY, MAX_PULL);
        if (dy <= 0) return;
        indicator.classList.add('visible');
        // Slightly rotate the spinner based on pull distance as a progress cue
        const progress = Math.min(dy / THRESHOLD, 1);
        document.getElementById('pullSpinner').style.transform = `rotate(${progress * 270}deg)`;
        if (dy >= THRESHOLD) triggered = true;
    }, { passive: true });

    scroller.addEventListener('touchend', async () => {
        if (!pulling) return;
        pulling = false;
        if (triggered) {
            // Keep spinner spinning while refreshing
            document.getElementById('pullSpinner').style.transform = '';
            await loadRecentEntries();
        }
        indicator.classList.remove('visible');
    });
})();

function clientBadgeColor(name) {
    if (name.includes('ICONIC'))  return 'bg-purple-50 text-purple-500';
    if (name.includes('Images'))  return 'bg-blue-50 text-blue-500';
    if (name.includes('JD'))      return 'bg-orange-50 text-orange-500';
    return 'bg-gray-100 text-gray-500';
}

function clientDowColor(name) {
    if (name.includes('ICONIC'))  return 'text-purple-500';
    if (name.includes('Images'))  return 'text-blue-500';
    if (name.includes('JD'))      return 'text-orange-500';
    return 'text-gray-400';
}

const invoiceChipColors = {
    'draft':  'bg-gray-100 text-gray-500',
    'issued': 'bg-orange-100 text-orange-600',
    'paid':   'bg-green-100 text-green-600',
};

function entryDescription(entry) {
    if (entry.description)  return entry.description;
    if (entry.shoot_client) return entry.shoot_client + (entry.role ? ` · ${entry.role}` : '');
    if (entry.day_type)     return (entry.day_type === 'full' ? 'Full day' : 'Half day')
                                   + (entry.workflow_type ? ` · ${entry.workflow_type}` : '');
    if (entry.hours_worked) return `${entry.hours_worked}h`;
    return '—';
}

function formatEntryDate(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
    return date.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatEntryDateParts(dateStr) {
    if (!dateStr) return { dow: '', day: '', mon: '' };
    const [y, m, d] = dateStr.split('-');
    const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
    return {
        dow: date.toLocaleDateString('en-AU', { weekday: 'short' }),
        day: date.getDate(),
        mon: date.toLocaleDateString('en-AU', { month: 'short' }),
    };
}

function isoWeekStart(dateStr) {
    const [y, m, d] = dateStr.split('-');
    const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
    const day = date.getDay(); // 0=Sun
    const diff = (day === 0 ? -6 : 1 - day); // Monday-based
    const mon = new Date(date);
    mon.setDate(date.getDate() + diff);
    return mon;
}

function isoWeekKey(dateStr) {
    const mon = isoWeekStart(dateStr);
    return `${mon.getFullYear()}-${mon.getMonth()}-${mon.getDate()}`;
}

function formatWeekLabel(weekStart) {
    const end = new Date(weekStart);
    end.setDate(weekStart.getDate() + 6);
    const opts = { day: 'numeric', month: 'short' };
    return `${weekStart.toLocaleDateString('en-AU', opts)} – ${end.toLocaleDateString('en-AU', opts)}`;
}

// ─────────────────────────────────────────────
// SWIPE TO DELETE
// ─────────────────────────────────────────────
function addSwipeToDelete(wrapper, el, entry) {
    let startX = 0, startY = 0, dx = 0;
    let swiping = false, decided = false;
    let activeSnapBack = null;
    const threshold = 80; // px to reveal delete
    const commitAt  = 0.5; // fraction of row width to auto-confirm

    el.addEventListener('touchstart', e => {
        // Remove any pending snap-back listener so dragging this row again works
        if (activeSnapBack) {
            document.removeEventListener('touchstart', activeSnapBack);
            activeSnapBack = null;
        }
        startX  = e.touches[0].clientX;
        startY  = e.touches[0].clientY;
        dx      = 0;
        swiping = false;
        decided = false;
        el.style.transition = 'none';
    }, { passive: true });

    el.addEventListener('touchmove', e => {
        const curX = e.touches[0].clientX;
        const curY = e.touches[0].clientY;
        if (!decided) {
            // Determine axis on first move
            decided = true;
            swiping = Math.abs(curX - startX) > Math.abs(curY - startY);
        }
        if (!swiping) return;
        dx = Math.min(0, curX - startX); // only left swipe
        el.style.transform = `translateX(${dx}px)`;
    }, { passive: true });

    el.addEventListener('touchend', async () => {
        if (!swiping) return;
        el.style.transition = '';
        const rowWidth = el.offsetWidth;
        if (dx < -(rowWidth * commitAt)) {
            // Full swipe — delete
            el.style.transform = `translateX(-${rowWidth}px)`;
            try {
                const { error } = await sb.from('entries').delete().eq('id', entry.id);
                if (error) throw error;
                const cardWrap = wrapper.parentElement;
                const collapseTarget = cardWrap || wrapper;
                collapseTarget.style.transition = 'max-height 0.3s, opacity 0.3s';
                collapseTarget.style.maxHeight  = collapseTarget.offsetHeight + 'px';
                requestAnimationFrame(() => {
                    collapseTarget.style.maxHeight = '0';
                    collapseTarget.style.opacity   = '0';
                    collapseTarget.style.overflow  = 'hidden';
                });
                setTimeout(() => collapseTarget.remove(), 350);
            } catch (err) {
                alert('Error deleting entry: ' + err.message);
                el.style.transform = '';
            }
        } else if (dx < -threshold) {
            // Partial — snap to threshold to keep delete visible
            el.style.transform = `translateX(-${threshold}px)`;
            // Tap on the revealed delete bg to confirm
            wrapper.querySelector('.swipe-delete-bg').addEventListener('click', async () => {
                el.style.transition = 'none';
                el.style.transform  = `translateX(-${el.offsetWidth}px)`;
                try {
                    const { error } = await sb.from('entries').delete().eq('id', entry.id);
                    if (error) throw error;
                    const cardWrap = wrapper.parentElement;
                    (cardWrap || wrapper).remove();
                } catch (err) {
                    alert('Error deleting entry: ' + err.message);
                    el.style.transition = '';
                    el.style.transform  = '';
                }
            }, { once: true });
            // Tap/drag elsewhere snaps back
            activeSnapBack = (e) => {
                if (wrapper.contains(e.target)) return; // ignore touches on this row
                document.removeEventListener('touchstart', activeSnapBack);
                activeSnapBack = null;
                el.style.transform = '';
            };
            document.addEventListener('touchstart', activeSnapBack, { passive: true });
        } else {
            // Snap back
            el.style.transform = '';
        }
        dx = 0;
    });
}

// ─────────────────────────────────────────────
// ENTRY CARD EXPAND / COLLAPSE
// ─────────────────────────────────────────────
let editingEntry    = null;
let editingClient   = null;
let editDayType     = 'full';
let editWorkflow    = 'Apparel';
let editRole        = 'Photographer';
let editSuperOverride = false;
let expandedWrap    = null;

function closeEntryCard(wrap) {
    // Hold the squared-off bottom corners on the row during collapse
    const row = wrap.querySelector('.entry-row');
    if (row) row.style.borderRadius = '14px 14px 0 0';

    wrap.classList.remove('expanded');

    setTimeout(() => {
        if (row) row.style.borderRadius = '';
        const inner = wrap.querySelector('.entry-detail-inner');
        if (inner) inner.innerHTML = '';
    }, 400);

    if (expandedWrap === wrap) {
        expandedWrap  = null;
        editingEntry  = null;
        editingClient = null;
    }
}

function openEntryCard(wrap, entry, readOnly = false) {
    // Collapse any previously expanded card
    if (expandedWrap && expandedWrap !== wrap) {
        closeEntryCard(expandedWrap);
    }

    // If this card is already expanded, collapse it
    if (wrap.classList.contains('expanded')) {
        closeEntryCard(wrap);
        return;
    }

    editingEntry  = entry;
    editingClient = allClients.find(c => c.id === entry.client_id) || null;
    expandedWrap  = wrap;

    const billing = entry.billing_type_snapshot;
    const isITS   = editingClient?.name?.toLowerCase().includes('images that sell');

    editDayType        = entry.day_type || 'full';
    editWorkflow       = entry.workflow_type || 'Apparel';
    editRole           = entry.role || 'Photographer';
    editSuperOverride  = (entry.super_amount > 0);

    // Build detail panel HTML
    const inner = wrap.querySelector('.entry-detail-inner');

    // --- Date field ---
    let html = `
        <div class="space-y-3">
        <div class="bg-slate-50 rounded-xl px-4 py-2.5">
            <span class="text-[9px] font-semibold text-slate-400 uppercase tracking-wider block mb-0.5">Date</span>
            <input type="date" id="editDate" class="bg-transparent w-full text-[15px] font-medium outline-none"${readOnly ? ' disabled' : ''}>
        </div>`;

    // --- Billing-specific fields ---
    if (billing === 'day_rate') {
        const wfHidden     = editDayType !== 'full' ? 'hidden' : '';
        const brandHidden  = editWorkflow !== 'Own Brand' ? 'hidden' : '';
        const skuHidden    = editWorkflow === 'Own Brand' ? 'hidden' : '';
        const bonusHidden  = (editDayType !== 'full' || editWorkflow === 'Own Brand') ? 'hidden' : '';
        html += `
        <div id="editDayRateFields" class="space-y-3">
            <div>
                <span class="text-[9px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5 px-1">Day Type</span>
                <div class="seg-ctrl" style="grid-template-columns: 1fr 1fr;">
                    <button class="seg-btn${editDayType === 'full' ? ' active' : ''}" data-editday="full" onclick="setEditDayType('full')"${readOnly ? ' disabled' : ''}>Full Day</button>
                    <button class="seg-btn${editDayType === 'half' ? ' active' : ''}" data-editday="half" onclick="setEditDayType('half')"${readOnly ? ' disabled' : ''}>Half Day</button>
                </div>
            </div>
            <div id="editWorkflowSection" class="${wfHidden} space-y-3">
                <div>
                    <span class="text-[9px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5 px-1">Workflow</span>
                    <div class="flex gap-1.5" id="editWorkflowBtns">
                        <button class="workflow-btn${editWorkflow === 'Apparel' ? ' active' : ''}" data-editwf="Apparel" onclick="setEditWorkflow('Apparel')"${readOnly ? ' disabled' : ''}>Apparel</button>
                        <button class="workflow-btn${editWorkflow === 'Product' ? ' active' : ''}" data-editwf="Product" onclick="setEditWorkflow('Product')"${readOnly ? ' disabled' : ''}>Product</button>
                        <button class="workflow-btn${editWorkflow === 'Own Brand' ? ' active' : ''}" data-editwf="Own Brand" onclick="setEditWorkflow('Own Brand')"${readOnly ? ' disabled' : ''}>Own Brand</button>
                    </div>
                </div>
                <div id="editBrandField" class="${brandHidden}">
                    <input type="text" id="editBrandInput" placeholder="Brand name"
                        class="input-field w-full rounded-xl px-4 py-2.5 text-[15px] placeholder-slate-400 font-medium"${readOnly ? ' disabled' : ''}>
                </div>
                <div id="editSkuField" class="${skuHidden}">
                    <div class="bg-slate-50 rounded-xl px-4 py-2.5">
                        <span class="text-[9px] font-semibold text-slate-400 uppercase tracking-wider block mb-0.5">SKUs Shot</span>
                        <input type="number" id="editSkuInput" placeholder="0" min="0"
                            class="bg-transparent w-full text-[15px] font-medium outline-none"${readOnly ? ' disabled' : ''}>
                    </div>
                </div>
            </div>
        </div>`;
    } else if (billing === 'hourly') {
        html += `
        <div id="editHourlyFields" class="space-y-3">
            <div id="editItsFields" class="${isITS ? '' : 'hidden'} space-y-3">
                <input type="text" id="editShootClientInput" placeholder="Shoot Client"
                    class="input-field w-full rounded-xl px-4 py-2.5 text-[15px] placeholder-slate-400 font-medium"${readOnly ? ' disabled' : ''}>
                <div>
                    <span class="text-[9px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5 px-1">Role</span>
                    <div class="seg-ctrl" style="grid-template-columns: 1fr 1fr;">
                        <button class="seg-btn${editRole === 'Photographer' ? ' active' : ''}" data-editrole="Photographer" onclick="setEditRole('Photographer')"${readOnly ? ' disabled' : ''}>Photographer</button>
                        <button class="seg-btn${editRole === 'Operator' ? ' active' : ''}" data-editrole="Operator" onclick="setEditRole('Operator')"${readOnly ? ' disabled' : ''}>Operator</button>
                    </div>
                </div>
            </div>
            <div id="editHourlyDescField" class="${isITS ? 'hidden' : ''}">
                <textarea id="editHourlyDesc" rows="2" placeholder="Description"
                    class="input-field w-full rounded-xl px-4 py-2.5 text-[15px] placeholder-slate-400 resize-none font-medium"${readOnly ? ' disabled' : ''}></textarea>
            </div>
            <div class="grid grid-cols-2 gap-2">
                <div class="bg-slate-50 rounded-xl px-4 py-2.5">
                    <span class="text-[9px] font-semibold text-slate-400 uppercase tracking-wider block mb-0.5">Start</span>
                    <input type="time" id="editStartTime" class="bg-transparent w-full text-[15px] font-medium outline-none relative"${readOnly ? ' disabled' : ''}>
                </div>
                <div class="bg-slate-50 rounded-xl px-4 py-2.5">
                    <span class="text-[9px] font-semibold text-slate-400 uppercase tracking-wider block mb-0.5">End</span>
                    <input type="time" id="editFinishTime" class="bg-transparent w-full text-[15px] font-medium outline-none relative"${readOnly ? ' disabled' : ''}>
                </div>
            </div>
            <div class="bg-white px-4 py-2.5 rounded-xl flex items-center justify-between">
                <div>
                    <span class="text-[9px] font-semibold uppercase tracking-wider text-slate-400 block mb-0.5">Break</span>
                    <div class="flex items-baseline gap-1">
                        <input type="number" id="editBreakMinutes" value="0" min="0" step="5"
                            class="bg-transparent border-none p-0 w-10 text-[15px] font-bold focus:ring-0 text-slate-800 outline-none"${readOnly ? ' disabled' : ''}>
                        <span class="text-slate-400 text-[11px] font-bold uppercase">min</span>
                    </div>
                </div>
                <div class="flex gap-1.5">
                    <button onclick="adjustEditBreak(15)" class="h-8 px-3 bg-slate-100 rounded-lg text-[12px] font-bold active:bg-slate-200 transition-all"${readOnly ? ' disabled' : ''}>+15</button>
                    <button onclick="adjustEditBreak(30)" class="h-8 px-3 bg-slate-100 rounded-lg text-[12px] font-bold active:bg-slate-200 transition-all"${readOnly ? ' disabled' : ''}>+30</button>
                </div>
            </div>
        </div>`;
    } else { // manual
        html += `
        <div id="editManualFields" class="space-y-3">
            <textarea id="editManualDesc" rows="2" placeholder="Description"
                class="input-field w-full rounded-xl px-4 py-2.5 text-[15px] placeholder-slate-400 resize-none font-medium"${readOnly ? ' disabled' : ''}></textarea>
            <div class="bg-slate-50 rounded-xl px-4 py-2.5">
                <span class="text-[9px] font-semibold text-slate-400 uppercase tracking-wider block mb-0.5">Amount ($)</span>
                <input type="number" id="editManualAmount" placeholder="0.00" step="0.01" min="0"
                    class="bg-transparent w-full text-[15px] font-medium outline-none"${readOnly ? ' disabled' : ''}>
            </div>
            <div class="bg-white rounded-xl px-4 py-2.5 flex items-center justify-between">
                <div>
                    <p class="text-[13px] font-semibold text-slate-800">Include Super (12%)</p>
                    <p id="editSuperToggleLabel" class="text-[11px] text-slate-400 mt-0.5">${editSuperOverride ? 'On' : 'Off'}</p>
                </div>
                <label class="toggle-wrap">
                    <input type="checkbox" id="editSuperToggle"${editSuperOverride ? ' checked' : ''}${readOnly ? ' disabled' : ''}>
                    <div class="toggle-track"><div class="toggle-thumb"></div></div>
                </label>
            </div>
        </div>`;
    }

    // --- Summary card ---
    const bonusHiddenSummary = (billing !== 'day_rate' || editDayType !== 'full' || editWorkflow === 'Own Brand') ? 'hidden' : '';
    const durationHidden     = (billing !== 'hourly') ? 'hidden' : '';
    html += `
        <div class="summary-card px-4 py-3 bg-white">
            <div class="flex justify-between items-baseline mb-2">
                <div>
                    <p class="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Total</p>
                    <h2 id="editDisplayTotal" class="text-3xl font-bold tracking-tight text-slate-900">$0.00</h2>
                </div>
                <div class="text-right ${durationHidden}" id="editDurationBlock">
                    <p class="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Duration</p>
                    <p id="editDisplayDuration" class="text-base font-bold text-slate-700">0h 0m</p>
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

    // --- Footer buttons ---
    if (!readOnly) {
        html += `
        <div class="space-y-2 pt-1">
            <button id="editSaveBtn" onclick="saveEdit()" class="btn-primary">Save Changes</button>
            <button onclick="deleteEntry()" class="w-full py-3 rounded-xl text-[14px] font-bold text-red-500 bg-red-50 active:bg-red-100 transition-colors border-none cursor-pointer">Delete Entry</button>
        </div>`;
    }

    html += `</div>`; // close space-y-4

    inner.innerHTML = html;

    // Populate field values now that DOM is built
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
        if (isITS) {
            document.getElementById('editShootClientInput').value = entry.shoot_client || '';
        } else {
            document.getElementById('editHourlyDesc').value = entry.description || '';
        }
        document.getElementById('editStartTime').value    = (entry.start_time  || '').substring(0, 5);
        document.getElementById('editFinishTime').value   = (entry.finish_time || '').substring(0, 5);
        document.getElementById('editBreakMinutes').value = entry.break_minutes || 0;
    } else { // manual
        document.getElementById('editManualDesc').value   = entry.description || '';
        document.getElementById('editManualAmount').value = entry.base_amount != null ? entry.base_amount : '';
    }

    // Wire up live recalc listeners
    ['editStartTime','editFinishTime','editBreakMinutes','editSkuInput','editManualAmount','editBrandInput']
        .forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', editRecalculate);
        });
    const superToggleEl = document.getElementById('editSuperToggle');
    if (superToggleEl) {
        superToggleEl.addEventListener('change', function() {
            editSuperOverride = this.checked;
            const lbl = document.getElementById('editSuperToggleLabel');
            if (lbl) lbl.textContent = editSuperOverride ? 'On' : 'Off';
            editRecalculate();
        });
    }

    editRecalculate();

    // Expand the card
    wrap.classList.add('expanded');

    // Scroll to near top of entriesScroll
    const tabRecent = document.getElementById('entriesScroll');
    const wrapTop = wrap.getBoundingClientRect().top + tabRecent.scrollTop - 100;
    tabRecent.scrollTo({ top: wrapTop, behavior: 'smooth' });
}

function setEditDayType(type) {
    editDayType = type;
    document.querySelectorAll('[data-editday]').forEach(b => {
        b.classList.toggle('active', b.dataset.editday === type);
    });
    const wfSection = document.getElementById('editWorkflowSection');
    if (wfSection) {
        if (type === 'full') {
            wfSection.classList.remove('hidden');
            setEditWorkflow(editWorkflow);
        } else {
            wfSection.classList.add('hidden');
            const bl = document.getElementById('editBonusLine');
            if (bl) bl.classList.add('hidden');
        }
    }
    editRecalculate();
}

function setEditWorkflow(wf) {
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

function setEditRole(role) {
    editRole = role;
    document.querySelectorAll('[data-editrole]').forEach(b => {
        b.classList.toggle('active', b.dataset.editrole === role);
    });
    editRecalculate();
}

function adjustEditBreak(delta) {
    const el = document.getElementById('editBreakMinutes');
    if (el) {
        el.value = (parseInt(el.value) || 0) + delta;
        editRecalculate();
    }
}

function editRecalculate() {
    if (!editingEntry) return;
    const billing = editingEntry.billing_type_snapshot;
    const client  = editingClient;
    let result;

    if (billing === 'day_rate' && client) {
        const skuEl = document.getElementById('editSkuInput');
        const skus = skuEl ? (parseInt(skuEl.value) || null) : null;
        result = calcDayRate(client, editDayType, editDayType === 'full' ? editWorkflow : null, skus);
        const durEl = document.getElementById('editDisplayDuration');
        if (durEl) durEl.textContent = '';
        const bl = document.getElementById('editBonusLine');
        if (bl) bl.classList.toggle('hidden', editDayType !== 'full' || editWorkflow === 'Own Brand');

    } else if (billing === 'hourly' && client) {
        const startEl  = document.getElementById('editStartTime');
        const finishEl = document.getElementById('editFinishTime');
        const brkEl    = document.getElementById('editBreakMinutes');
        if (!startEl || !finishEl) return;
        const start  = startEl.value;
        const finish = finishEl.value;
        const brk    = parseInt(brkEl?.value) || 0;
        result = calcHourly(client, start, finish, brk);
        if (result) {
            const totalMins = Math.round(result.hoursWorked * 60);
            const durEl = document.getElementById('editDisplayDuration');
            if (durEl) durEl.textContent = `${Math.floor(totalMins / 60)}h ${totalMins % 60}m`;
        }

    } else if (billing === 'manual') {
        const amountEl = document.getElementById('editManualAmount');
        const amount = parseFloat(amountEl?.value) || 0;
        const superRate = client?.super_rate ?? 0.12;
        result = calcManual(amount, editSuperOverride, superRate);

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
    const billing = entry.billing_type_snapshot;
    const date    = document.getElementById('editDate').value;
    const base    = { date };

    if (billing === 'day_rate') {
        const skus   = parseInt(document.getElementById('editSkuInput').value) || null;
        const brand  = document.getElementById('editBrandInput').value.trim() || null;
        const result = calcDayRate(client, editDayType, editDayType === 'full' ? editWorkflow : null, skus);
        return {
            ...base,
            day_type:      editDayType,
            workflow_type: editDayType === 'full' ? editWorkflow : null,
            brand:         editDayType === 'full' && editWorkflow === 'Own Brand' ? brand : null,
            skus:          editDayType === 'full' && editWorkflow !== 'Own Brand' ? skus : null,
            base_amount:   result.base,
            bonus_amount:  result.bonus,
            super_amount:  result.superAmt,
            total_amount:  result.total,
        };

    } else if (billing === 'hourly') {
        const start  = document.getElementById('editStartTime').value;
        const finish = document.getElementById('editFinishTime').value;
        const brk    = parseInt(document.getElementById('editBreakMinutes').value) || 0;
        const result = calcHourly(client, start, finish, brk);
        const isITS  = client?.name?.toLowerCase().includes('images that sell');
        return {
            ...base,
            start_time:    start,
            finish_time:   finish,
            break_minutes: brk,
            hours_worked:  result.hoursWorked,
            shoot_client:  isITS ? document.getElementById('editShootClientInput').value.trim() || null : null,
            role:          isITS ? editRole : null,
            description:   !isITS ? document.getElementById('editHourlyDesc').value.trim() || null : null,
            base_amount:   result.base,
            bonus_amount:  0,
            super_amount:  result.superAmt,
            total_amount:  result.total,
        };

    } else { // manual
        const amount = parseFloat(document.getElementById('editManualAmount').value) || 0;
        const superRate = client?.super_rate ?? 0.12;
        const result = calcManual(amount, editSuperOverride, superRate);
        return {
            ...base,
            description:  document.getElementById('editManualDesc').value.trim() || null,
            base_amount:  result.base,
            bonus_amount: 0,
            super_amount: result.superAmt,
            total_amount: result.total,
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

async function deleteEntry() {
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
// START
// ─────────────────────────────────────────────
init();
