// ─────────────────────────────────────────────
// CLIENTS MODULE
// Handles: client list, add/edit client form, workflow rates
// ─────────────────────────────────────────────
import { clientBadgeColor } from './utils.js';

let sb, getState;

export function init(supabase, stateGetter) {
    sb = supabase;
    getState = stateGetter;
}

// ── State ────────────────────────────────────
let allClientsLocal    = [];  // includes inactive
let editingClient      = null;
let isNewClient        = false;
let workflowRatesLocal = [];  // rates for currently editing client
let clientsLoaded      = false;

// ─────────────────────────────────────────────
// LOAD
// ─────────────────────────────────────────────

export async function loadClients() {
    if (clientsLoaded) return;
    clientsLoaded = true;
    await _fetchAndRender();
}

export function markStale() { clientsLoaded = false; }

async function _fetchAndRender() {
    const list = document.getElementById('clientsList');
    if (!list) return;
    list.innerHTML = '<div class="spinner"></div>';

    const { data, error } = await sb
        .from('clients')
        .select('*')
        .order('name');

    if (error) {
        list.innerHTML = `<p class="text-red-500 text-sm py-4">${error.message}</p>`;
        return;
    }

    allClientsLocal = data || [];
    renderClientsList();
}

function renderClientsList() {
    const list = document.getElementById('clientsList');
    if (!list) return;
    list.innerHTML = '';

    if (!allClientsLocal.length) {
        list.innerHTML = '<p class="text-gray-400 text-sm py-8 text-center">No clients yet</p>';
        return;
    }

    const active   = allClientsLocal.filter(c => c.is_active);
    const inactive = allClientsLocal.filter(c => !c.is_active);

    function renderGroup(clients, label) {
        if (!clients.length) return;
        const hdr = document.createElement('div');
        hdr.className = 'week-header';
        hdr.innerHTML = `<span>${label}</span><span>${clients.length}</span>`;
        list.appendChild(hdr);

        const grp = document.createElement('div');
        grp.className = 'week-group';
        clients.forEach(client => {
            const badgeColor = clientBadgeColor(client.name);
            const billingLabel = { day_rate: 'Day Rate', hourly: 'Hourly', manual: 'Manual' }[client.billing_type] || client.billing_type;
            const row = document.createElement('div');
            row.className = 'client-list-row';
            row.innerHTML = `
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-0.5">
                        <span class="client-badge ${badgeColor}">${client.name}</span>
                    </div>
                    <p class="text-[13px] text-gray-400">${billingLabel}${client.is_active ? '' : ' · Inactive'}</p>
                </div>
                <svg width="16" height="16" fill="none" stroke="#c7c7cc" stroke-width="2" viewBox="0 0 24 24" style="flex-shrink:0;">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 18l6-6-6-6"/>
                </svg>`;
            row.addEventListener('click', () => openClientForm(client, row));
            grp.appendChild(row);
        });
        list.appendChild(grp);
    }

    renderGroup(active, 'Active');
    renderGroup(inactive, 'Inactive');
}

// ─────────────────────────────────────────────
// CLIENT FORM
// ─────────────────────────────────────────────

export function openNewClientForm() {
    editingClient = null;
    isNewClient   = true;
    workflowRatesLocal = [];
    _renderClientForm(null);
}

async function openClientForm(client, rowEl) {
    editingClient = client;
    isNewClient   = false;

    // Load workflow rates for this client if day_rate
    if (client.billing_type === 'day_rate') {
        const { data } = await sb
            .from('client_workflow_rates')
            .select('*')
            .eq('client_id', client.id);
        workflowRatesLocal = data || [];
    } else {
        workflowRatesLocal = [];
    }

    if (window.innerWidth >= 768 && rowEl) {
        document.querySelectorAll('.client-selected').forEach(el => el.classList.remove('client-selected'));
        rowEl.classList.add('client-selected');
    }

    _renderClientForm(client);
}

function _closeClientForm() {
    if (window.innerWidth >= 768) {
        const panel = document.getElementById('detailPanel');
        if (panel) { panel.classList.remove('open'); panel.innerHTML = ''; }
        document.querySelectorAll('.client-selected').forEach(el => el.classList.remove('client-selected'));
    } else {
        clientsLoaded = false;
        _fetchAndRender();
    }
}

function _renderClientForm(client) {
    const desktop = window.innerWidth >= 768;
    const isNew = !client;
    const bt = client?.billing_type || 'day_rate';

    const header = desktop
        ? `<div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:20px;">
            <h3 style="font-size:15px; font-weight:700; color:#111827; margin:0;">${isNew ? 'New Client' : client.name}</h3>
            <button id="cfBackBtn" style="background:none; border:none; cursor:pointer; color:#9ca3af; padding:4px;">
                <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
           </div>`
        : `<div class="flex items-center justify-between mb-5">
            <button id="cfBackBtn" class="text-[15px] font-semibold text-blue-500 bg-none border-none cursor-pointer p-0">← Clients</button>
            <h2 class="text-[17px] font-bold text-gray-900">${isNew ? 'New Client' : client.name}</h2>
            <div style="width:80px;"></div>
           </div>`;

    const formHtml = `
    <div class="${desktop ? '' : 'client-form-panel'}">
        ${header}

        <!-- Name -->
        <div class="space-y-3">
        <div class="bg-slate-50 rounded-2xl px-5 py-4">
            <span class="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-0.5">Name</span>
            <input type="text" id="cfName" class="bg-transparent w-full text-[15px] font-semibold outline-none" value="${_esc(client?.name || '')}">
        </div>

        <!-- Billing type -->
        <div>
            <span class="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-1.5 px-1">Billing Type</span>
            <div class="seg-ctrl" style="grid-template-columns: 1fr 1fr 1fr;">
                <button class="seg-btn${bt === 'day_rate' ? ' active' : ''}" data-cfbt="day_rate">Day Rate</button>
                <button class="seg-btn${bt === 'hourly'   ? ' active' : ''}" data-cfbt="hourly">Hourly</button>
                <button class="seg-btn${bt === 'manual'   ? ' active' : ''}" data-cfbt="manual">Manual</button>
            </div>
        </div>

        <!-- Day rate fields -->
        <div id="cfDayRateFields" class="${bt === 'day_rate' ? '' : 'hidden'} space-y-3">
            <div class="grid grid-cols-2 gap-3">
                <div class="bg-slate-50 rounded-2xl px-5 py-4">
                    <span class="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-0.5">Full Day ($)</span>
                    <input type="number" id="cfRateFullDay" step="0.01" class="bg-transparent w-full text-[15px] font-semibold outline-none" value="${_esc(client?.rate_full_day || '')}">
                </div>
                <div class="bg-slate-50 rounded-2xl px-5 py-4">
                    <span class="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-0.5">Half Day ($)</span>
                    <input type="number" id="cfRateHalfDay" step="0.01" class="bg-transparent w-full text-[15px] font-semibold outline-none" value="${_esc(client?.rate_half_day || '')}">
                </div>
            </div>
        </div>

        <!-- Hourly fields -->
        <div id="cfHourlyFields" class="${bt === 'hourly' ? '' : 'hidden'} space-y-3">
            <div class="bg-slate-50 rounded-2xl px-5 py-4">
                <span class="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-0.5">Hourly Rate ($)</span>
                <input type="number" id="cfRateHourly" step="0.01" class="bg-transparent w-full text-[15px] font-semibold outline-none" value="${_esc(client?.rate_hourly || '')}">
            </div>
            <div class="grid grid-cols-2 gap-3">
                <div class="bg-slate-50 rounded-2xl px-5 py-4">
                    <span class="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-0.5">Photographer ($)</span>
                    <input type="number" id="cfRatePhotographer" step="0.01" class="bg-transparent w-full text-[15px] font-semibold outline-none" value="${_esc(client?.rate_hourly_photographer || '')}">
                </div>
                <div class="bg-slate-50 rounded-2xl px-5 py-4">
                    <span class="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-0.5">Operator ($)</span>
                    <input type="number" id="cfRateOperator" step="0.01" class="bg-transparent w-full text-[15px] font-semibold outline-none" value="${_esc(client?.rate_hourly_operator || '')}">
                </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
                <div class="bg-slate-50 rounded-2xl px-5 py-4">
                    <span class="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-0.5">Default Start</span>
                    <input type="time" id="cfDefaultStart" class="bg-transparent w-full text-[15px] font-semibold outline-none" value="${(client?.default_start_time || '').substring(0,5)}">
                </div>
                <div class="bg-slate-50 rounded-2xl px-5 py-4">
                    <span class="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-0.5">Default Finish</span>
                    <input type="time" id="cfDefaultFinish" class="bg-transparent w-full text-[15px] font-semibold outline-none" value="${(client?.default_finish_time || '').substring(0,5)}">
                </div>
            </div>
            <!-- Entry label + show role toggles -->
            <div class="bg-slate-50 rounded-2xl px-5 py-4">
                <span class="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-0.5">Entry Label (e.g. "Shoot Client")</span>
                <input type="text" id="cfEntryLabel" class="bg-transparent w-full text-[15px] font-semibold outline-none" placeholder="Leave blank to show description field" value="${_esc(client?.entry_label || '')}">
            </div>
            <div class="bg-white rounded-2xl px-5 py-4 flex items-center justify-between">
                <p class="text-[14px] font-semibold text-slate-800">Show Role (Photographer / Operator)</p>
                <label class="toggle-wrap">
                    <input type="checkbox" id="cfShowRole" ${client?.show_role ? 'checked' : ''}>
                    <div class="toggle-track"><div class="toggle-thumb"></div></div>
                </label>
            </div>
        </div>

        <!-- Super -->
        <div class="bg-white rounded-2xl px-5 py-4 flex items-center justify-between">
            <div>
                <p class="text-[14px] font-semibold text-slate-800">Pays Super</p>
            </div>
            <label class="toggle-wrap">
                <input type="checkbox" id="cfPaysSuper" ${client?.pays_super ? 'checked' : ''}>
                <div class="toggle-track"><div class="toggle-thumb"></div></div>
            </label>
        </div>
        <div id="cfSuperRateRow" class="${client?.pays_super ? '' : 'hidden'} bg-slate-50 rounded-2xl px-5 py-4">
            <span class="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-0.5">Super Rate</span>
            <input type="number" id="cfSuperRate" step="0.01" min="0" max="1" class="bg-transparent w-full text-[15px] font-semibold outline-none" value="${_esc(client?.super_rate || '0.12')}">
        </div>

        <!-- Invoice frequency -->
        <div>
            <span class="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-1.5 px-1">Invoice Frequency</span>
            <div class="seg-ctrl" style="grid-template-columns: 1fr 1fr;">
                <button class="seg-btn${(client?.invoice_frequency || 'weekly') === 'weekly' ? ' active' : ''}" data-cffreq="weekly">Weekly</button>
                <button class="seg-btn${client?.invoice_frequency === 'per_job' ? ' active' : ''}" data-cffreq="per_job">Per Job</button>
            </div>
        </div>

        <!-- Contact info -->
        <div class="bg-slate-50 rounded-2xl px-5 py-4 space-y-3">
            <div>
                <span class="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-0.5">Email</span>
                <input type="email" id="cfEmail" class="bg-transparent w-full text-[15px] font-semibold outline-none" value="${_esc(client?.email || '')}">
            </div>
            <div>
                <span class="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-0.5">Address</span>
                <input type="text" id="cfAddress" class="bg-transparent w-full text-[15px] font-semibold outline-none" value="${_esc(client?.address || '')}">
            </div>
            <div>
                <span class="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-0.5">Suburb</span>
                <input type="text" id="cfSuburb" class="bg-transparent w-full text-[15px] font-semibold outline-none" value="${_esc(client?.suburb || '')}">
            </div>
            <div>
                <span class="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-0.5">ABN</span>
                <input type="text" id="cfAbn" class="bg-transparent w-full text-[15px] font-semibold outline-none" value="${_esc(client?.abn || '')}">
            </div>
        </div>

        <!-- Active toggle (edit only) -->
        ${!isNew ? `
        <div class="bg-white rounded-2xl px-5 py-4 flex items-center justify-between">
            <p class="text-[14px] font-semibold text-slate-800">Active</p>
            <label class="toggle-wrap">
                <input type="checkbox" id="cfIsActive" ${client?.is_active ? 'checked' : ''}>
                <div class="toggle-track"><div class="toggle-thumb"></div></div>
            </label>
        </div>` : ''}

        <!-- Workflow rates (day_rate clients only) -->
        <div id="cfWorkflowRatesSection" class="${bt === 'day_rate' ? '' : 'hidden'}">
            <div class="week-header" style="padding-top:20px;"><span>Workflow Rates</span></div>
            <div id="cfWorkflowRatesList" class="space-y-2 mt-2"></div>
            <button id="cfAddWfRateBtn" class="mt-3 w-full rounded-2xl text-[14px] font-bold text-blue-500 bg-blue-50 border-none cursor-pointer py-3">
                + Add Workflow Rate
            </button>
        </div>

        <!-- Save -->
        <div class="pt-2 pb-2 space-y-2">
            <button id="cfSaveBtn" class="btn-primary">Save Client</button>
        </div>
        </div>
    </div>`;

    // Inject into detailPanel on desktop, replace list on mobile
    const list = document.getElementById('clientsList');
    if (desktop) {
        const panel = document.getElementById('detailPanel');
        panel.innerHTML = `<div style="padding:20px; overflow-y:auto; height:100%;">${formHtml}</div>`;
        panel.classList.add('open');
    } else {
        list.innerHTML = formHtml;
    }

    // Render workflow rates
    if (bt === 'day_rate') _renderWorkflowRates();

    // Billing type switcher
    document.querySelectorAll('[data-cfbt]').forEach(btn => {
        btn.addEventListener('click', () => {
            const newBt = btn.dataset.cfbt;
            document.querySelectorAll('[data-cfbt]').forEach(b => b.classList.toggle('active', b.dataset.cfbt === newBt));
            document.getElementById('cfDayRateFields').classList.toggle('hidden', newBt !== 'day_rate');
            document.getElementById('cfHourlyFields').classList.toggle('hidden', newBt !== 'hourly');
            document.getElementById('cfWorkflowRatesSection').classList.toggle('hidden', newBt !== 'day_rate');
        });
    });

    // Invoice frequency switcher
    document.querySelectorAll('[data-cffreq]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-cffreq]').forEach(b => b.classList.toggle('active', b.dataset.cffreq === btn.dataset.cffreq));
        });
    });

    // Pays super toggle
    document.getElementById('cfPaysSuper').addEventListener('change', e => {
        document.getElementById('cfSuperRateRow').classList.toggle('hidden', !e.target.checked);
    });

    // Back / close button
    document.getElementById('cfBackBtn').addEventListener('click', _closeClientForm);

    // Add workflow rate
    const addWfBtn = document.getElementById('cfAddWfRateBtn');
    if (addWfBtn) addWfBtn.addEventListener('click', () => _openWorkflowRateForm(null));

    // Save
    document.getElementById('cfSaveBtn').addEventListener('click', _saveClient);
}

function _renderWorkflowRates() {
    const container = document.getElementById('cfWorkflowRatesList');
    if (!container) return;
    container.innerHTML = '';

    if (!workflowRatesLocal.length) {
        container.innerHTML = '<p class="text-gray-400 text-sm py-2">No workflow rates configured</p>';
        return;
    }

    workflowRatesLocal.forEach(rate => {
        const row = document.createElement('div');
        row.className = 'client-list-row';
        const bonusDesc = rate.is_flat_bonus
            ? `Flat $${rate.max_bonus}`
            : `KPI ${rate.kpi} SKUs, up to $${rate.max_bonus}`;
        row.innerHTML = `
            <div class="flex-1 min-w-0">
                <p class="text-[14px] font-semibold text-gray-800">${rate.workflow}</p>
                <p class="text-[12px] text-gray-400">${bonusDesc}</p>
            </div>
            <svg width="16" height="16" fill="none" stroke="#c7c7cc" stroke-width="2" viewBox="0 0 24 24" style="flex-shrink:0;">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 18l6-6-6-6"/>
            </svg>`;
        row.addEventListener('click', () => _openWorkflowRateForm(rate));
        container.appendChild(row);
    });
}

function _openWorkflowRateForm(rate) {
    const isNew = !rate;
    const container = document.getElementById('cfWorkflowRatesList');
    if (!container) return;

    container.innerHTML = `
    <div class="bg-slate-50 rounded-2xl p-4 space-y-3">
        <div class="bg-white rounded-2xl px-5 py-4">
            <span class="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-0.5">Workflow</span>
            <div class="flex gap-1.5 mt-1" id="wfPickerBtns">
                ${['Apparel','Product','Own Brand'].map(w =>
                    `<button class="workflow-btn${(rate?.workflow || 'Apparel') === w ? ' active' : ''}" data-wfname="${w}">${w}</button>`
                ).join('')}
            </div>
        </div>
        <div class="bg-white rounded-2xl px-5 py-4 flex items-center justify-between">
            <p class="text-[14px] font-semibold text-slate-800">Flat Bonus</p>
            <label class="toggle-wrap">
                <input type="checkbox" id="wfIsFlatBonus" ${rate?.is_flat_bonus ? 'checked' : ''}>
                <div class="toggle-track"><div class="toggle-thumb"></div></div>
            </label>
        </div>
        <div id="wfSkuFields" class="${rate?.is_flat_bonus ? 'hidden' : ''} space-y-3">
            <div class="bg-white rounded-2xl px-5 py-4">
                <span class="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-0.5">KPI (SKUs)</span>
                <input type="number" id="wfKpi" class="bg-transparent w-full text-[15px] font-semibold outline-none" value="${rate?.kpi || ''}">
            </div>
            <div class="bg-white rounded-2xl px-5 py-4">
                <span class="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-0.5">Upper Limit (SKUs)</span>
                <input type="number" id="wfUpperLimit" class="bg-transparent w-full text-[15px] font-semibold outline-none" value="${rate?.upper_limit_skus || ''}">
            </div>
            <div class="bg-white rounded-2xl px-5 py-4">
                <span class="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-0.5">Incentive per SKU ($)</span>
                <input type="number" id="wfIncentiveRate" step="0.01" class="bg-transparent w-full text-[15px] font-semibold outline-none" value="${rate?.incentive_rate_per_sku || ''}">
            </div>
        </div>
        <div class="bg-white rounded-2xl px-5 py-4">
            <span class="text-[10px] font-bold text-blue-400 uppercase tracking-widest block mb-0.5">Max Bonus ($)</span>
            <input type="number" id="wfMaxBonus" step="0.01" class="bg-transparent w-full text-[15px] font-semibold outline-none" value="${rate?.max_bonus || ''}">
        </div>
        <div class="flex gap-2 pt-1">
            <button id="wfCancelBtn" class="flex-1 rounded-2xl text-[14px] font-bold text-gray-500 bg-gray-100 border-none cursor-pointer py-3">Cancel</button>
            ${!isNew ? `<button id="wfDeleteBtn" class="flex-1 rounded-2xl text-[14px] font-bold text-red-500 bg-red-50 border-none cursor-pointer py-3">Delete</button>` : ''}
            <button id="wfSaveRateBtn" class="flex-1 rounded-2xl text-[14px] font-bold text-white bg-gray-900 border-none cursor-pointer py-3">Save</button>
        </div>
    </div>`;

    // Workflow picker
    container.querySelectorAll('[data-wfname]').forEach(b => {
        b.addEventListener('click', () => {
            container.querySelectorAll('[data-wfname]').forEach(x => x.classList.toggle('active', x.dataset.wfname === b.dataset.wfname));
        });
    });

    // Flat bonus toggle
    document.getElementById('wfIsFlatBonus').addEventListener('change', e => {
        document.getElementById('wfSkuFields').classList.toggle('hidden', e.target.checked);
    });

    document.getElementById('wfCancelBtn').addEventListener('click', _renderWorkflowRates);

    if (!isNew) {
        document.getElementById('wfDeleteBtn').addEventListener('click', async () => {
            if (!confirm('Delete this workflow rate?')) return;
            await sb.from('client_workflow_rates').delete().eq('id', rate.id);
            workflowRatesLocal = workflowRatesLocal.filter(r => r.id !== rate.id);
            _renderWorkflowRates();
        });
    }

    document.getElementById('wfSaveRateBtn').addEventListener('click', async () => {
        const workflow = container.querySelector('[data-wfname].active')?.dataset.wfname || 'Apparel';
        const isFlatBonus = document.getElementById('wfIsFlatBonus').checked;
        const payload = {
            client_id:             editingClient?.id,
            workflow,
            is_flat_bonus:         isFlatBonus,
            kpi:                   isFlatBonus ? null : (parseInt(document.getElementById('wfKpi').value) || null),
            upper_limit_skus:      isFlatBonus ? null : (parseInt(document.getElementById('wfUpperLimit').value) || null),
            incentive_rate_per_sku:isFlatBonus ? null : (parseFloat(document.getElementById('wfIncentiveRate').value) || null),
            max_bonus:             parseFloat(document.getElementById('wfMaxBonus').value) || 0,
        };

        if (isNew) {
            const { data, error } = await sb.from('client_workflow_rates').insert(payload).select().single();
            if (!error && data) workflowRatesLocal.push(data);
        } else {
            const { error } = await sb.from('client_workflow_rates').update(payload).eq('id', rate.id);
            if (!error) {
                const idx = workflowRatesLocal.findIndex(r => r.id === rate.id);
                if (idx !== -1) workflowRatesLocal[idx] = { ...rate, ...payload };
            }
        }
        _renderWorkflowRates();
    });
}

async function _saveClient() {
    const btn = document.getElementById('cfSaveBtn');
    btn.disabled = true;
    btn.textContent = 'Saving…';

    const billingType = document.querySelector('[data-cfbt].active')?.dataset.cfbt || 'day_rate';
    const invoiceFrequency = document.querySelector('[data-cffreq].active')?.dataset.cffreq || 'weekly';
    const { currentUserId } = getState();

    const payload = {
        name:             document.getElementById('cfName').value.trim(),
        billing_type:     billingType,
        pays_super:       document.getElementById('cfPaysSuper').checked,
        super_rate:       parseFloat(document.getElementById('cfSuperRate').value) || 0.12,
        invoice_frequency:invoiceFrequency,
        email:            document.getElementById('cfEmail').value.trim() || null,
        address:          document.getElementById('cfAddress').value.trim() || null,
        suburb:           document.getElementById('cfSuburb').value.trim() || null,
        abn:              document.getElementById('cfAbn').value.trim() || null,
        is_active:        isNewClient ? true : document.getElementById('cfIsActive').checked,
    };

    if (billingType === 'day_rate') {
        payload.rate_full_day = parseFloat(document.getElementById('cfRateFullDay').value) || null;
        payload.rate_half_day = parseFloat(document.getElementById('cfRateHalfDay').value) || null;
    } else if (billingType === 'hourly') {
        payload.rate_hourly              = parseFloat(document.getElementById('cfRateHourly').value) || null;
        payload.rate_hourly_photographer = parseFloat(document.getElementById('cfRatePhotographer').value) || null;
        payload.rate_hourly_operator     = parseFloat(document.getElementById('cfRateOperator').value) || null;
        payload.default_start_time       = document.getElementById('cfDefaultStart').value || null;
        payload.default_finish_time      = document.getElementById('cfDefaultFinish').value || null;
        payload.entry_label              = document.getElementById('cfEntryLabel').value.trim() || null;
        payload.show_role                = document.getElementById('cfShowRole').checked;
    }

    try {
        if (isNewClient) {
            payload.user_id = currentUserId;
            await sb.from('clients').insert(payload);
        } else {
            await sb.from('clients').update(payload).eq('id', editingClient.id);
        }
        // Refresh list and mark app-level clients stale
        document.dispatchEvent(new CustomEvent('clients:saved'));
        _closeClientForm();
        clientsLoaded = false;
        await _fetchAndRender();
    } catch (err) {
        alert('Error saving client: ' + err.message);
        btn.disabled = false;
        btn.textContent = 'Save Client';
    }
}

// ─────────────────────────────────────────────
// INIT BUTTON HANDLERS
// ─────────────────────────────────────────────
export function initHandlers() {
    const addBtn = document.getElementById('addClientBtn');
    if (addBtn) addBtn.addEventListener('click', openNewClientForm);
}

// ── Helpers ──────────────────────────────────
function _esc(str) {
    return String(str).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
