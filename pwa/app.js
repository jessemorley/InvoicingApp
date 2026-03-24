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
let allClients              = [];
let clientLatestInvoiceMap  = {};
let clientInvoiceCountMap   = {};
let workflowRates           = [];
let selectedClient   = null;
let currentDayType   = 'full';
let currentWorkflow  = 'Apparel';
let currentRole      = 'Photographer';

// View navigation
let currentViewIndex  = 0;
let invoicesLoaded    = false;
let invoicesSortMode  = 'chronological'; // 'chronological' | 'status'
let invoicesCache     = [];

// New entry card state
let newEntryWrap           = null;
let newEntrySelectedClient = null;
let newEntryDayType        = 'full';
let newEntryWorkflow       = 'Apparel';
let newEntryRole           = 'Photographer';

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

document.getElementById('newEntryFab').addEventListener('click', () => {
    openClientPicker();
});

function openClientPicker() {
    const overlay = document.getElementById('clientPickerOverlay');
    const input   = document.getElementById('overlayClientInput');
    overlay.style.display = 'flex';
    input.value = '';
    document.getElementById('overlayInputClear').style.display = 'none';
    renderOverlayClients('');
    input.focus();
}

function closeClientPicker() {
    document.getElementById('clientPickerOverlay').style.display = 'none';
    document.getElementById('overlayClientInput').value = '';
}

function clientDotColor(name) {
    if (name.includes('ICONIC'))  return '#a855f7';
    if (name.includes('Images'))  return '#3b82f6';
    if (name.includes('JD'))      return '#f97316';
    return '#9ca3af';
}

function renderOverlayClients(query) {
    const list = document.getElementById('overlayClientList');

    let matches = query
        ? allClients.filter(c => c.name.toLowerCase().includes(query.toLowerCase()))
        : [...allClients].sort((a, b) =>
            (clientInvoiceCountMap[b.id] || 0) - (clientInvoiceCountMap[a.id] || 0)
          );

    list.innerHTML = '';

    const label = document.createElement('div');
    label.style.cssText = 'padding:20px 24px 10px; font-size:13px; font-weight:700; color:#8e8e93; text-transform:uppercase; letter-spacing:0.06em;';
    label.textContent = query ? `${matches.length} ${matches.length === 1 ? 'Result' : 'Results'}` : 'Clients';
    list.appendChild(label);

    if (!matches.length) {
        const empty = document.createElement('div');
        empty.style.cssText = 'padding:60px 24px; text-align:center; color:#8e8e93; font-size:15px;';
        empty.textContent = 'No clients found';
        list.appendChild(empty);
        return;
    }

    matches.forEach(client => {
        const count = clientInvoiceCountMap[client.id] || 0;
        const subtitle = count > 0 ? `${count} ${count === 1 ? 'invoice' : 'invoices'}` : null;
        const dotColor = clientDotColor(client.name);
        const row = document.createElement('button');
        row.style.cssText = 'display:flex; width:100%; box-sizing:border-box; align-items:center; text-align:left; background:none; border:none; border-bottom:1px solid #f3f4f6; padding:14px 24px; cursor:pointer; font-family:inherit;';
        row.innerHTML = `
            <div style="flex-shrink:0; width:10px; height:10px; border-radius:50%; background:${dotColor}; margin-right:16px;"></div>
            <div style="flex:1; min-width:0;">
                <div style="font-size:17px; font-weight:600; color:#111827;">${client.name}</div>
                ${subtitle ? `<div style="font-size:13px; color:#8e8e93; margin-top:2px;">${subtitle}</div>` : ''}
            </div>
            <svg width="18" height="18" fill="none" stroke="#c7c7cc" stroke-width="2" viewBox="0 0 24 24" style="flex-shrink:0;">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 18l6-6-6-6"/>
            </svg>`;
        row.addEventListener('click', () => {
            closeClientPicker();
            openNewEntryCardForClient(client);
        });
        list.appendChild(row);
    });
}

document.getElementById('overlayClientInput').addEventListener('input', e => {
    const val = e.target.value.trim();
    renderOverlayClients(val);
    document.getElementById('overlayInputClear').style.display = val ? 'flex' : 'none';
});

document.getElementById('overlayInputClear').addEventListener('click', () => {
    const input = document.getElementById('overlayClientInput');
    input.value = '';
    input.focus();
    document.getElementById('overlayInputClear').style.display = 'none';
    renderOverlayClients('');
});

document.getElementById('overlayCancel').addEventListener('click', closeClientPicker);

document.getElementById('signOutBtn').addEventListener('click', async () => {
    await sb.auth.signOut();
    resetForm();
    showLogin();
});

// ─────────────────────────────────────────────
// DATA LOADING
// ─────────────────────────────────────────────
async function loadData() {
    const [{ data: clients }, { data: rates }, { data: invoices }] = await Promise.all([
        sb.from('clients').select('*').eq('is_active', true).order('name'),
        sb.from('client_workflow_rates').select('*'),
        sb.from('invoices').select('client_id')
    ]);
    allClients   = clients || [];
    workflowRates = rates || [];

    clientInvoiceCountMap = {};
    (invoices || []).forEach(inv => {
        if (inv.client_id) {
            clientInvoiceCountMap[inv.client_id] = (clientInvoiceCountMap[inv.client_id] || 0) + 1;
        }
    });

    // Mark invoices stale so the invoices view reloads on next visit
    invoicesLoaded = false;

    setDefaultDate();
    loadRecentEntries();

    // Reload invoices view if currently visible
    if (currentViewIndex === 1) {
        loadInvoices();
    }
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

        // Show entry label field if configured
        const hasLabel = !!client.entry_label;
        document.getElementById('itsFields').classList.toggle('hidden', !hasLabel);
        document.getElementById('hourlyDescField').classList.toggle('hidden', hasLabel);
        if (hasLabel) {
            const labelEl = document.getElementById('itsFieldLabel');
            if (labelEl) labelEl.textContent = client.entry_label;
        }

        // Show role picker if configured
        const roleSection = document.getElementById('roleSection');
        if (roleSection) roleSection.classList.toggle('hidden', !client.show_role);

        // Apply default times from client settings, fall back to 09:00/17:00
        const startDefault  = client.default_start_time  ? client.default_start_time.substring(0, 5)  : '09:00';
        const finishDefault = client.default_finish_time ? client.default_finish_time.substring(0, 5) : '17:00';
        document.getElementById('startTime').value  = startDefault;
        document.getElementById('finishTime').value = finishDefault;
        document.getElementById('breakMinutes').value = '0';

    } else { // manual
        document.getElementById('manualFields').classList.remove('hidden');
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
        const clientRates = workflowRates.filter(r => r.client_id === client.id);
        const rate = clientRates.find(r => r.workflow === workflow);
        if (rate) {
            if (rate.is_flat_bonus) {
                bonus = parseFloat(rate.max_bonus);
            } else if (skus != null) {
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

function calcHourly(client, startStr, finishStr, breakMins, role) {
    if (!startStr || !finishStr) return null;
    let diffMins = (toMins(finishStr) - toMins(startStr) + 1440) % 1440;
    diffMins = Math.max(0, diffMins - (parseInt(breakMins) || 0));
    // Round to nearest quarter hour
    const roundedHours = Math.round(diffMins / 60 / 0.25) * 0.25;
    let hourlyRate = parseFloat(client.rate_hourly) || 0;
    if (client.show_role && role) {
        hourlyRate = role === 'Operator'
            ? parseFloat(client.rate_hourly_operator || client.rate_hourly) || 0
            : parseFloat(client.rate_hourly_photographer || client.rate_hourly) || 0;
    }
    const base     = roundedHours * hourlyRate;
    const superAmt = client.pays_super ? base * parseFloat(client.super_rate || 0.12) : 0;
    return { base, bonus: 0, superAmt, total: base + superAmt, hoursWorked: roundedHours, rawMins: diffMins };
}

function calcManual(amountStr, client) {
    const base     = parseFloat(amountStr) || 0;
    const superAmt = client.pays_super ? base * parseFloat(client.super_rate || 0.12) : 0;
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
        result = calcHourly(selectedClient, start, finish, brk, currentRole);

        if (result) {
            const h = Math.floor(result.rawMins / 60);
            const m = result.rawMins % 60;
            document.getElementById('displayDuration').textContent = `${h}h ${m}m`;
        }

    } else { // manual
        const amount = document.getElementById('manualAmount').value;
        result = calcManual(amount, selectedClient);
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
        const result = calcHourly(selectedClient, start, finish, brk, currentRole);

        const hasLabel    = !!selectedClient.entry_label;
        const description = hasLabel ? document.getElementById('jobInput').value.trim() || null : document.getElementById('hourlyDesc').value.trim() || null;
        const role        = selectedClient.show_role ? currentRole : null;

        return {
            ...base,
            start_time:    start,
            finish_time:   finish,
            break_minutes: brk,
            hours_worked:  result.hoursWorked,
            shoot_client:  null,
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
        const result = calcManual(amount, selectedClient);
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

    const data = rawData;

    // Build latest invoice map for client picker
    clientLatestInvoiceMap = {};
    (rawData || []).forEach(entry => {
        const name = entry.clients?.name;
        const inv  = entry.invoices?.invoice_number;
        if (name && inv && !clientLatestInvoiceMap[name]) {
            clientLatestInvoiceMap[name] = inv;
        }
    });

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
        const weekTotal = entries.reduce((sum, e) => sum + ((e.total_amount || 0) - (e.super_amount || 0)), 0);
        header.innerHTML = `<span>${formatWeekLabel(weekStart)}</span><span>${fmt(weekTotal)}</span>`;
        list.appendChild(header);

        // Cards
        const group = document.createElement('div');
        group.className = 'week-group';
        entries.forEach(entry => {
            const clientName  = entry.clients?.name || 'Unknown';
            const badgeColor  = clientBadgeColor(clientName);
            const description = entryDescription(entry);
            const total       = fmt((entry.total_amount || 0) - (entry.super_amount || 0));
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
            } else {
                el.addEventListener('click', () => openEntryCard(wrap, entry, true));
            }
            wrap.appendChild(el);

            wrap.appendChild(detailPanel);
            group.appendChild(wrap);
        });
        list.appendChild(group);
    });

    appendNewEntryCard(list, cardIndex);
}

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

// ─────────────────────────────────────────────
// NEW ENTRY CARD
// ─────────────────────────────────────────────
function closeNewEntryCard() {
    if (!newEntryWrap) return;

    newEntrySelectedClient = null;
    newEntryDayType        = 'full';
    newEntryWorkflow       = 'Apparel';
    newEntryRole           = 'Photographer';

    // Hide and re-render the card fresh
    newEntryWrap.style.display = 'none';
    newEntryWrap.innerHTML = buildNewEntryFormHTML();
    wireNewEntryForm();
}

function buildNewEntryFormHTML() {
    return `
    <div style="background:#fff; border-radius:1.75rem; padding:20px 24px; display:flex; flex-direction:column; gap:0;">
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

    // Clear client — reopens the picker
    document.getElementById('newClearClient').addEventListener('click', () => {
        closeNewEntryCard();
        openClientPicker();
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
            const disp = document.getElementById('newBreakDisplay');
            if (disp) disp.textContent = el.value;
            newEntryRecalculate();
        });
    });

    // Live recalc
    ['newStartTime','newFinishTime','newBreakMinutes','newSkuInput','newManualAmount','newBrandInput'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', newEntryRecalculate);
    });

    // Save
    document.getElementById('newSaveBtn').addEventListener('click', saveNewEntry);
}

function openNewEntryCardForClient(client) {
    if (!newEntryWrap) return;
    newEntryWrap.style.display = '';
    document.getElementById('tabRecent').scrollTo({ top: 0, behavior: 'smooth' });
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
        if (hasLabel) {
            const labelEl = document.getElementById('newItsFieldLabel');
            if (labelEl) labelEl.textContent = client.entry_label;
        }

        const newRoleSection = document.getElementById('newRoleSection');
        if (newRoleSection) newRoleSection.classList.toggle('hidden', !client.show_role);

        const startDefault  = client.default_start_time  ? client.default_start_time.substring(0, 5)  : '09:00';
        const finishDefault = client.default_finish_time ? client.default_finish_time.substring(0, 5) : '17:00';
        document.getElementById('newStartTime').value    = startDefault;
        document.getElementById('newFinishTime').value   = finishDefault;
        document.getElementById('newBreakMinutes').value = '0';
        const newBreakDisp = document.getElementById('newBreakDisplay');
        if (newBreakDisp) newBreakDisp.textContent = '0';

    } else { // manual
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
    let result = null;

    if (client.billing_type === 'day_rate') {
        const skus = document.getElementById('newSkuInput')?.value;
        result = calcDayRate(client, newEntryDayType, newEntryWorkflow, skus);

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

    } else { // manual
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
        const result   = calcHourly(client, start, finish, brk, newEntryRole);
        const hasLabel = !!client.entry_label;
        const description = hasLabel ? document.getElementById('newShootClientInput').value.trim() || null : document.getElementById('newHourlyDesc').value.trim() || null;
        const role        = client.show_role ? newEntryRole : null;
        return {
            ...base,
            start_time:    start,
            finish_time:   finish,
            break_minutes: brk,
            hours_worked:  result.hoursWorked,
            shoot_client:  null,
            role,
            description,
            base_amount:   result.base,
            bonus_amount:  0,
            super_amount:  result.superAmt,
            total_amount:  result.total,
        };

    } else { // manual
        const amount = parseFloat(document.getElementById('newManualAmount').value) || 0;
        const result = calcManual(amount, client);
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
// PULL TO REFRESH — Entries
// ─────────────────────────────────────────────
(function() {
    const THRESHOLD = 110;
    const MAX_PULL  = 130;
    let startY = 0, pulling = false, triggered = false;

    const scroller  = document.getElementById('tabRecent');
    const indicator = document.getElementById('pullIndicator');

    scroller.addEventListener('touchstart', e => {
        if (scroller.scrollTop > 5) return;
        startY    = e.touches[0].clientY;
        pulling   = true;
        triggered = false;
    }, { passive: true });

    scroller.addEventListener('touchmove', e => {
        if (!pulling) return;
        const dx = Math.abs(e.touches[0].clientX - (e.touches[0].clientX)); // placeholder; direction handled by swipe handler
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

// ─────────────────────────────────────────────
// PULL TO REFRESH — Invoices
// ─────────────────────────────────────────────
(function() {
    const THRESHOLD = 110;
    const MAX_PULL  = 130;
    let startY = 0, pulling = false, triggered = false;

    const scroller  = document.getElementById('invoicesScroll');
    const indicator = document.getElementById('invoicesPullIndicator');

    scroller.addEventListener('touchstart', e => {
        if (scroller.scrollTop > 5) return;
        startY    = e.touches[0].clientY;
        pulling   = true;
        triggered = false;
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

// ─────────────────────────────────────────────
// VIEW SWIPE GESTURE
// ─────────────────────────────────────────────
(function() {
    let startX = 0, startY = 0;
    let swipeDir = null; // null | 'h' | 'v'
    let liveOffsetVw = 0;

    const slider = document.getElementById('viewSlider');

    slider.addEventListener('touchstart', e => {
        startX   = e.touches[0].clientX;
        startY   = e.touches[0].clientY;
        swipeDir = null;
        slider.style.transition = 'none';
    }, { passive: true });

    slider.addEventListener('touchmove', e => {
        const dx = e.touches[0].clientX - startX;
        const dy = e.touches[0].clientY - startY;

        // Determine direction once we have enough movement
        if (!swipeDir && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
            swipeDir = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
        }

        if (swipeDir !== 'h') return;

        e.preventDefault();

        const baseVw    = currentViewIndex * -100;
        const dragVw    = (dx / window.innerWidth) * 100;
        const totalVw   = Math.max(-100, Math.min(0, baseVw + dragVw));
        liveOffsetVw    = totalVw;
        slider.style.transform = `translateX(${totalVw}vw)`;
    }, { passive: false });

    slider.addEventListener('touchend', () => {
        if (swipeDir !== 'h') return;

        slider.style.transition = 'transform 0.32s cubic-bezier(0.4, 0, 0.2, 1)';
        const moved = liveOffsetVw - (currentViewIndex * -100);

        if (moved < -28 && currentViewIndex < 1) {
            switchView(1);
        } else if (moved > 28 && currentViewIndex > 0) {
            switchView(0);
        } else {
            // Snap back to current view
            slider.style.transform = `translateX(${currentViewIndex * -100}vw)`;
        }
    });
})();

// ─────────────────────────────────────────────
// VIEW SWITCHING
// ─────────────────────────────────────────────
function switchView(index) {
    currentViewIndex = index;
    const slider = document.getElementById('viewSlider');
    slider.style.transition = 'transform 0.32s cubic-bezier(0.4, 0, 0.2, 1)';
    slider.style.transform  = `translateX(${index * -100}vw)`;

    document.getElementById('tabEntriesBtn').classList.toggle('active', index === 0);
    document.getElementById('tabInvoicesBtn').classList.toggle('active', index === 1);
    document.getElementById('newEntryFab').style.display = index === 0 ? 'flex' : 'none';

    if (index === 1 && !invoicesLoaded) {
        loadInvoices();
    }
}

// ─────────────────────────────────────────────
// INVOICES VIEW
// ─────────────────────────────────────────────
let expandedInvoiceWrap = null;

async function loadInvoices() {
    invoicesLoaded = true;
    const list = document.getElementById('invoicesList');
    list.innerHTML = '<div class="spinner"></div>';

    const { data, error } = await sb
        .from('invoices')
        .select('*, clients(name), entries(id, date, description, total_amount, super_amount, day_type, workflow_type, shoot_client, role, hours_worked, billing_type_snapshot)')
        .order('invoice_number', { ascending: false });

    if (error || !data?.length) {
        list.innerHTML = '<p class="text-gray-400 text-sm py-8 text-center">No invoices yet</p>';
        return;
    }

    // Sort by latest entry date descending (newest invoice period first)
    data.sort((a, b) => {
        const aDate = (a.entries || []).map(e => e.date || '').filter(Boolean).sort().pop() || '';
        const bDate = (b.entries || []).map(e => e.date || '').filter(Boolean).sort().pop() || '';
        return bDate > aDate ? 1 : bDate < aDate ? -1 : 0;
    });

    invoicesCache = data;
    updateSortBtnIcon();
    renderInvoices(data);
}

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
        // Chronological — flat list, newest first (data already ordered by invoice_number desc)
        const grp = document.createElement('div');
        grp.className = 'week-group';
        data.forEach((inv, i) => grp.appendChild(buildInvoiceCard(inv, i)));
        list.appendChild(grp);
    }
}

// SVG for "tap to group by status" (funnel / decreasing lines)
const ICON_GROUP = `<svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" viewBox="0 0 24 24"><path d="M3 6h18M7 12h10M11 18h2"/></svg>`;
// SVG for "tap to show as flat list" (equal lines)
const ICON_LIST  = `<svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" viewBox="0 0 24 24"><path d="M3 6h18M3 12h18M3 18h18"/></svg>`;

function updateSortBtnIcon() {
    const btn = document.getElementById('invoiceSortBtn');
    if (btn) btn.innerHTML = invoicesSortMode === 'chronological' ? ICON_GROUP : ICON_LIST;
}

function toggleInvoiceSort() {
    invoicesSortMode = invoicesSortMode === 'chronological' ? 'status' : 'chronological';
    updateSortBtnIcon();
    // Defer re-render out of the touch event to avoid iOS tap debouncing
    requestAnimationFrame(() => renderInvoices(invoicesCache));
}

// Stop touch propagation so the horizontal swipe handler on #viewSlider
// never intercepts taps on this button and suppresses the click event.
(function () {
    const btn = document.getElementById('invoiceSortBtn');
    btn.addEventListener('click', toggleInvoiceSort);
    btn.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
    btn.addEventListener('touchend',   e => e.stopPropagation(), { passive: true });
}());

function invoiceSubtotal(inv) {
    if (!inv.entries?.length) return 0;
    return inv.entries.reduce((s, e) => s + ((e.total_amount || 0) - (e.super_amount || 0)), 0);
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

function toggleInvoiceCard(wrap, inv) {
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
    const entries = inv.entries;

    if (!entries?.length) {
        inner.innerHTML = '<p class="text-gray-400 text-sm py-4 text-center">No entries linked</p>';
        return;
    }

    const sorted = [...entries].sort((a, b) => a.date < b.date ? -1 : 1);
    let html = '<div class="space-y-0 pt-3">';
    sorted.forEach(e => {
        const desc   = entryDescription(e);
        const amount = fmt((e.total_amount || 0) - (e.super_amount || 0));
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
    </div>`;

    inner.innerHTML = html;
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
// ENTRY CARD EXPAND / COLLAPSE
// ─────────────────────────────────────────────
let editingEntry    = null;
let editingClient   = null;
let editDayType     = 'full';
let editWorkflow    = 'Apparel';
let editRole        = 'Photographer';
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

    const billing  = entry.billing_type_snapshot;
    const hasLabel = !!editingClient?.entry_label;
    const showRole = !!editingClient?.show_role;

    editDayType   = entry.day_type || 'full';
    editWorkflow  = entry.workflow_type || 'Apparel';
    editRole      = entry.role || 'Photographer';

    // Build detail panel HTML
    const inner = wrap.querySelector('.entry-detail-inner');

    // --- Date field ---
    let html = `
        <div class="space-y-3">
        <div class="bg-slate-50 rounded-2xl px-5 py-4">
            <span class="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-0.5">Date</span>
            <input type="date" id="editDate" class="bg-transparent w-full text-[15px] font-semibold outline-none"${readOnly ? ' disabled' : ''}>
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
                <span class="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-1.5 px-1">Day Type</span>
                <div class="seg-ctrl" style="grid-template-columns: 1fr 1fr;">
                    <button class="seg-btn${editDayType === 'full' ? ' active' : ''}" data-editday="full" onclick="setEditDayType('full')"${readOnly ? ' disabled' : ''}>Full Day</button>
                    <button class="seg-btn${editDayType === 'half' ? ' active' : ''}" data-editday="half" onclick="setEditDayType('half')"${readOnly ? ' disabled' : ''}>Half Day</button>
                </div>
            </div>
            <div id="editWorkflowSection" class="${wfHidden} space-y-3">
                <div>
                    <span class="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-1.5 px-1">Workflow</span>
                    <div class="flex gap-1.5" id="editWorkflowBtns">
                        <button class="workflow-btn${editWorkflow === 'Apparel' ? ' active' : ''}" data-editwf="Apparel" onclick="setEditWorkflow('Apparel')"${readOnly ? ' disabled' : ''}>Apparel</button>
                        <button class="workflow-btn${editWorkflow === 'Product' ? ' active' : ''}" data-editwf="Product" onclick="setEditWorkflow('Product')"${readOnly ? ' disabled' : ''}>Product</button>
                        <button class="workflow-btn${editWorkflow === 'Own Brand' ? ' active' : ''}" data-editwf="Own Brand" onclick="setEditWorkflow('Own Brand')"${readOnly ? ' disabled' : ''}>Own Brand</button>
                    </div>
                </div>
                <div id="editBrandField" class="${brandHidden}">
                    <div class="bg-slate-50 rounded-2xl px-5 py-4">
                        <span class="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-0.5">Brand</span>
                        <input type="text" id="editBrandInput"
                            class="bg-transparent w-full text-[15px] font-semibold outline-none placeholder-slate-400"${readOnly ? ' disabled' : ''}>
                    </div>
                </div>
                <div id="editSkuField" class="${skuHidden}">
                    <div class="bg-slate-50 rounded-2xl px-5 py-4">
                        <span class="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-0.5">SKUs Shot</span>
                        <input type="number" id="editSkuInput" placeholder="0" min="0"
                            class="bg-transparent w-full text-[15px] font-semibold outline-none"${readOnly ? ' disabled' : ''}>
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
                    <input type="text" id="editShootClientInput"
                        class="bg-transparent w-full text-[15px] font-semibold outline-none placeholder-slate-400"${readOnly ? ' disabled' : ''}>
                </div>
            </div>
            <div id="editRoleSection" class="${showRole ? '' : 'hidden'}">
                <div>
                    <span class="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-1.5 px-1">Role</span>
                    <div class="seg-ctrl" style="grid-template-columns: 1fr 1fr;">
                        <button class="seg-btn${editRole === 'Photographer' ? ' active' : ''}" data-editrole="Photographer" onclick="setEditRole('Photographer')"${readOnly ? ' disabled' : ''}>Photographer</button>
                        <button class="seg-btn${editRole === 'Operator' ? ' active' : ''}" data-editrole="Operator" onclick="setEditRole('Operator')"${readOnly ? ' disabled' : ''}>Operator</button>
                    </div>
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
                    <button onclick="adjustEditBreak(-15)" class="h-9 px-3 bg-white hover:bg-gray-100 text-gray-900 font-bold rounded-xl shadow-sm border border-gray-100 text-[12px] transition-all"${readOnly ? ' disabled' : ''}>-15</button>
                    <button onclick="adjustEditBreak(15)" class="h-9 px-3 bg-white hover:bg-gray-100 text-gray-900 font-bold rounded-xl shadow-sm border border-gray-100 text-[12px] transition-all"${readOnly ? ' disabled' : ''}>+15</button>
                </div>
            </div>
        </div>`;
    } else { // manual
        html += `
        <div id="editManualFields" class="space-y-3">
            <div class="bg-slate-50 rounded-2xl px-5 py-4">
                <span class="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-0.5">Description</span>
                <input type="text" id="editManualDesc" class="bg-transparent w-full text-[15px] font-semibold outline-none"${readOnly ? ' disabled' : ''}>
            </div>
            <div class="bg-slate-50 rounded-2xl px-5 py-4">
                <span class="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-0.5">Amount ($)</span>
                <input type="number" id="editManualAmount" placeholder="0.00" step="0.01" min="0"
                    class="bg-transparent w-full text-[15px] font-semibold outline-none"${readOnly ? ' disabled' : ''}>
            </div>
        </div>`;
    }

    // --- Summary card ---
    const bonusHiddenSummary = (billing !== 'day_rate' || editDayType !== 'full' || editWorkflow === 'Own Brand') ? 'hidden' : '';
    const durationHidden     = (billing !== 'hourly') ? 'hidden' : '';
    html += `
        <div class="summary-card bg-white">
            <div class="flex justify-between items-end mb-2">
                <div>
                    <p class="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Duration</p>
                    <div id="editDurationBlock" class="${durationHidden}">
                        <span id="editDisplayDuration" class="text-4xl font-black text-slate-900 leading-none">0h 0m</span>
                    </div>
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
        el.value = Math.max(0, (parseInt(el.value) || 0) + delta);
        const disp = document.getElementById('editBreakDisplay');
        if (disp) disp.textContent = el.value;
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
        result = calcHourly(client, start, finish, brk, editRole);
        if (result) {
            const totalMins = Math.round(result.hoursWorked * 60);
            const durEl = document.getElementById('editDisplayDuration');
            if (durEl) durEl.textContent = `${Math.floor(totalMins / 60)}h ${totalMins % 60}m`;
        }

    } else if (billing === 'manual') {
        const amountEl = document.getElementById('editManualAmount');
        const amount = parseFloat(amountEl?.value) || 0;
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
        const result      = calcHourly(client, start, finish, brk, editRole);
        const hasLbl      = !!client?.entry_label;
        const description = hasLbl ? document.getElementById('editShootClientInput').value.trim() || null : document.getElementById('editHourlyDesc').value.trim() || null;
        const role        = client?.show_role ? editRole : null;
        return {
            ...base,
            start_time:    start,
            finish_time:   finish,
            break_minutes: brk,
            hours_worked:  result.hoursWorked,
            shoot_client:  null,
            role,
            description,
            base_amount:   result.base,
            bonus_amount:  0,
            super_amount:  result.superAmt,
            total_amount:  result.total,
        };

    } else { // manual
        const amount = parseFloat(document.getElementById('editManualAmount').value) || 0;
        const result = calcManual(amount, client);
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
