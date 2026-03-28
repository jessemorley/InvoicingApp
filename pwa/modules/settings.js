// ─────────────────────────────────────────────
// SETTINGS MODULE
// Handles: personal info, banking, super, invoice numbering, preferences
// ─────────────────────────────────────────────

let sb;

export function init(supabase, _stateGetter) {
    sb = supabase;
}

// ── State ─────────────────────────────────────
let settingsLoaded = false;
let bizData        = null;
let seqData        = null;
let saveSeqTask    = null;
let saveBizTask    = null;
let activeTab      = 'general';

const LOCAL_KEYS = {
    markIssuedOnExport:     'settings_markIssuedOnExport',
    dueDateOffsetDays:      'settings_dueDateOffsetDays',
    financialYearStartMonth:'settings_financialYearStartMonth',
};

function getLocal(key, defaultVal) {
    const v = localStorage.getItem(LOCAL_KEYS[key]);
    if (v === null) return defaultVal;
    if (typeof defaultVal === 'boolean') return v === 'true';
    if (typeof defaultVal === 'number')  return parseInt(v, 10);
    return v;
}

function setLocal(key, value) {
    localStorage.setItem(LOCAL_KEYS[key], String(value));
}

// ─────────────────────────────────────────────
// LOAD
// ─────────────────────────────────────────────

export async function loadSettings() {
    if (settingsLoaded) return;
    settingsLoaded = true;
    await _fetchAndRender();
}

export function markStale() { settingsLoaded = false; }

async function _fetchAndRender() {
    const container = document.getElementById('settingsContent');
    if (!container) return;
    container.innerHTML = '<div class="spinner"></div>';

    const [{ data: biz, error: bizErr }, { data: seq, error: seqErr }] = await Promise.all([
        sb.from('business_details').select('*').single(),
        sb.from('invoice_sequence').select('invoice_prefix, last_number, user_id').single(),
    ]);

    if (bizErr || seqErr) {
        container.innerHTML = `<p class="text-red-500 text-sm py-4">${(bizErr || seqErr).message}</p>`;
        return;
    }

    bizData = biz;
    seqData = seq;
    _render();
}

// ─────────────────────────────────────────────
// RENDER
// ─────────────────────────────────────────────

const TABS = [
    { id: 'general',     label: 'General' },
    { id: 'preferences', label: 'Preferences' },
    { id: 'profile',     label: 'Profile' },
    { id: 'super',       label: 'Super' },
];

function _render() {
    const container = document.getElementById('settingsContent');
    const header    = document.getElementById('settingsHeader');
    if (!container || !bizData || !seqData) return;

    const nextNum    = (seqData.last_number ?? 0) + 1;
    const markIssued = getLocal('markIssuedOnExport', true);
    const dueOffset  = getLocal('dueDateOffsetDays', 30);
    const fyMonth    = getLocal('financialYearStartMonth', 7);

    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const monthOptions = MONTHS.map((m, i) =>
        `<option value="${i+1}" ${fyMonth === i+1 ? 'selected' : ''}>${m}</option>`
    ).join('');

    // Tab bar — rendered into header
    if (header) {
        const tabBar = TABS.map(t => `
            <button class="stg-tab ${activeTab === t.id ? 'stg-tab-active' : ''}"
                    data-tab="${t.id}">${t.label}</button>
        `).join('');
        header.innerHTML = `<h1 class="stg-page-title">Settings</h1><div class="stg-tabs-bar">${tabBar}</div>`;
    }

    // Tab panels
    const panels = {
        general: `
            <div class="stg-section">
                <div class="stg-group">
                    <div class="stg-row">
                        <span class="stg-row-label">Invoice Prefix</span>
                        <input id="s_invoicePrefix" class="stg-input-inline" type="text"
                            value="${_esc(seqData.invoice_prefix)}" maxlength="10">
                    </div>
                    <div class="stg-row">
                        <span class="stg-row-label">Next Invoice #</span>
                        <input id="s_nextInvoiceNumber" class="stg-input-inline" type="number"
                            min="1" step="1" value="${nextNum}">
                    </div>
                </div>
            </div>
        `,

        preferences: `
            <div class="stg-section">
                <div class="stg-group">
                    <div class="stg-row stg-row-toggle">
                        <div class="stg-row-toggle-text">
                            <span class="stg-row-label">Include super in totals</span>
                            <span class="stg-row-sub">Add superannuation calculations to invoice summaries</span>
                        </div>
                        <label class="stg-switch">
                            <input id="s_includeSuperInTotals" type="checkbox" ${bizData.include_super_in_totals ? 'checked' : ''}>
                            <span class="stg-switch-slider"></span>
                        </label>
                    </div>
                    <div class="stg-row stg-row-toggle">
                        <div class="stg-row-toggle-text">
                            <span class="stg-row-label">Mark as issued on PDF export</span>
                            <span class="stg-row-sub">Automatically update status when downloading</span>
                        </div>
                        <label class="stg-switch">
                            <input id="s_markIssuedOnExport" type="checkbox" ${markIssued ? 'checked' : ''}>
                            <span class="stg-switch-slider"></span>
                        </label>
                    </div>
                    <div class="stg-row">
                        <span class="stg-row-label">Due date offset</span>
                        <div class="stg-row-value-group">
                            <input id="s_dueDateOffsetDays" class="stg-input-inline" type="number"
                                min="7" max="90" value="${dueOffset}">
                            <span class="stg-row-unit">days</span>
                        </div>
                    </div>
                    <div class="stg-row">
                        <span class="stg-row-label">Financial year starts</span>
                        <div class="stg-row-value-group">
                            <select id="s_financialYearStartMonth" class="stg-select">
                                ${monthOptions}
                            </select>
                        </div>
                    </div>
                </div>
            </div>
        `,

        profile: `
            <div class="stg-section">
                <div class="stg-group stg-group-fields">
                    <div class="stg-fields-grid">
                        <div class="stg-field">
                            <label class="stg-field-label" for="s_name">Name</label>
                            <div class="stg-input-box">
                                <input id="s_name" class="stg-input-boxed" type="text" value="${_esc(bizData.name)}">
                            </div>
                        </div>
                        <div class="stg-field">
                            <label class="stg-field-label" for="s_businessName">Business Name</label>
                            <div class="stg-input-box">
                                <input id="s_businessName" class="stg-input-boxed" type="text" value="${_esc(bizData.business_name)}">
                            </div>
                        </div>
                    </div>
                    <div class="stg-field stg-field-full">
                        <label class="stg-field-label" for="s_abn">ABN</label>
                        <div class="stg-input-box">
                            <input id="s_abn" class="stg-input-boxed" type="text" inputmode="numeric" value="${_esc(bizData.abn)}">
                        </div>
                    </div>
                    <div class="stg-field stg-field-full">
                        <label class="stg-field-label" for="s_address">Address</label>
                        <div class="stg-input-box">
                            <textarea id="s_address" class="stg-input-boxed stg-textarea" rows="2">${_esc(bizData.address)}</textarea>
                        </div>
                    </div>
                </div>
                <p class="stg-hint">This information appears on your generated invoices.</p>
            </div>

            <div class="stg-section">
                <div class="stg-section-header">Banking</div>
                <div class="stg-group stg-group-fields">
                    <div class="stg-fields-grid">
                        <div class="stg-field">
                            <label class="stg-field-label" for="s_bsb">BSB</label>
                            <div class="stg-input-box">
                                <input id="s_bsb" class="stg-input-boxed" type="text" inputmode="numeric" value="${_esc(bizData.bsb)}">
                            </div>
                        </div>
                        <div class="stg-field">
                            <label class="stg-field-label" for="s_accountNumber">Account Number</label>
                            <div class="stg-input-box">
                                <input id="s_accountNumber" class="stg-input-boxed" type="text" inputmode="numeric" value="${_esc(bizData.account_number)}">
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `,

        super: `
            <div class="stg-section">
                <div class="stg-group stg-group-fields">
                    <div class="stg-field stg-field-full">
                        <label class="stg-field-label" for="s_superFund">Fund Name</label>
                        <div class="stg-input-box">
                            <input id="s_superFund" class="stg-input-boxed" type="text" value="${_esc(bizData.super_fund)}">
                        </div>
                    </div>
                    <div class="stg-field stg-field-full">
                        <label class="stg-field-label" for="s_superMemberNumber">Member Number</label>
                        <div class="stg-input-box">
                            <input id="s_superMemberNumber" class="stg-input-boxed" type="text" value="${_esc(bizData.super_member_number)}">
                        </div>
                    </div>
                    <div class="stg-field stg-field-full">
                        <label class="stg-field-label" for="s_superFundAbn">Fund ABN</label>
                        <div class="stg-input-box">
                            <input id="s_superFundAbn" class="stg-input-boxed" type="text" inputmode="numeric" value="${_esc(bizData.super_fund_abn)}">
                        </div>
                    </div>
                    <div class="stg-field stg-field-full">
                        <label class="stg-field-label" for="s_superUsi">USI</label>
                        <div class="stg-input-box">
                            <input id="s_superUsi" class="stg-input-boxed" type="text" value="${_esc(bizData.super_usi)}">
                        </div>
                    </div>
                </div>
            </div>
        `,
    };

    container.innerHTML = `<div id="stgPanels">${panels[activeTab] || ''}</div>`;

    _bindTabSwitching();
    _bindHandlers();
}

function _renderPanel() {
    const panel = document.getElementById('stgPanels');
    if (!panel || !bizData || !seqData) return;

    const nextNum    = (seqData.last_number ?? 0) + 1;
    const markIssued = getLocal('markIssuedOnExport', true);
    const dueOffset  = getLocal('dueDateOffsetDays', 30);
    const fyMonth    = getLocal('financialYearStartMonth', 7);

    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const monthOptions = MONTHS.map((m, i) =>
        `<option value="${i+1}" ${fyMonth === i+1 ? 'selected' : ''}>${m}</option>`
    ).join('');

    const panels = {
        general: `
            <div class="stg-section">
                <div class="stg-group">
                    <div class="stg-row">
                        <span class="stg-row-label">Invoice Prefix</span>
                        <input id="s_invoicePrefix" class="stg-input-inline" type="text"
                            value="${_esc(seqData.invoice_prefix)}" maxlength="10">
                    </div>
                    <div class="stg-row">
                        <span class="stg-row-label">Next Invoice #</span>
                        <input id="s_nextInvoiceNumber" class="stg-input-inline" type="number"
                            min="1" step="1" value="${nextNum}">
                    </div>
                </div>
            </div>
        `,

        preferences: `
            <div class="stg-section">
                <div class="stg-group">
                    <div class="stg-row stg-row-toggle">
                        <div class="stg-row-toggle-text">
                            <span class="stg-row-label">Include super in totals</span>
                            <span class="stg-row-sub">Add superannuation calculations to invoice summaries</span>
                        </div>
                        <label class="stg-switch">
                            <input id="s_includeSuperInTotals" type="checkbox" ${bizData.include_super_in_totals ? 'checked' : ''}>
                            <span class="stg-switch-slider"></span>
                        </label>
                    </div>
                    <div class="stg-row stg-row-toggle">
                        <div class="stg-row-toggle-text">
                            <span class="stg-row-label">Mark as issued on PDF export</span>
                            <span class="stg-row-sub">Automatically update status when downloading</span>
                        </div>
                        <label class="stg-switch">
                            <input id="s_markIssuedOnExport" type="checkbox" ${markIssued ? 'checked' : ''}>
                            <span class="stg-switch-slider"></span>
                        </label>
                    </div>
                    <div class="stg-row">
                        <span class="stg-row-label">Due date offset</span>
                        <div class="stg-row-value-group">
                            <input id="s_dueDateOffsetDays" class="stg-input-inline" type="number"
                                min="7" max="90" value="${dueOffset}">
                            <span class="stg-row-unit">days</span>
                        </div>
                    </div>
                    <div class="stg-row">
                        <span class="stg-row-label">Financial year starts</span>
                        <div class="stg-row-value-group">
                            <select id="s_financialYearStartMonth" class="stg-select">
                                ${monthOptions}
                            </select>
                        </div>
                    </div>
                </div>
            </div>
        `,

        profile: `
            <div class="stg-section">
                <div class="stg-group stg-group-fields">
                    <div class="stg-fields-grid">
                        <div class="stg-field">
                            <label class="stg-field-label" for="s_name">Name</label>
                            <div class="stg-input-box">
                                <input id="s_name" class="stg-input-boxed" type="text" value="${_esc(bizData.name)}">
                            </div>
                        </div>
                        <div class="stg-field">
                            <label class="stg-field-label" for="s_businessName">Business Name</label>
                            <div class="stg-input-box">
                                <input id="s_businessName" class="stg-input-boxed" type="text" value="${_esc(bizData.business_name)}">
                            </div>
                        </div>
                    </div>
                    <div class="stg-field stg-field-full">
                        <label class="stg-field-label" for="s_abn">ABN</label>
                        <div class="stg-input-box">
                            <input id="s_abn" class="stg-input-boxed" type="text" inputmode="numeric" value="${_esc(bizData.abn)}">
                        </div>
                    </div>
                    <div class="stg-field stg-field-full">
                        <label class="stg-field-label" for="s_address">Address</label>
                        <div class="stg-input-box">
                            <textarea id="s_address" class="stg-input-boxed stg-textarea" rows="2">${_esc(bizData.address)}</textarea>
                        </div>
                    </div>
                </div>
                <p class="stg-hint">This information appears on your generated invoices.</p>
            </div>

            <div class="stg-section">
                <div class="stg-section-header">Banking</div>
                <div class="stg-group stg-group-fields">
                    <div class="stg-fields-grid">
                        <div class="stg-field">
                            <label class="stg-field-label" for="s_bsb">BSB</label>
                            <div class="stg-input-box">
                                <input id="s_bsb" class="stg-input-boxed" type="text" inputmode="numeric" value="${_esc(bizData.bsb)}">
                            </div>
                        </div>
                        <div class="stg-field">
                            <label class="stg-field-label" for="s_accountNumber">Account Number</label>
                            <div class="stg-input-box">
                                <input id="s_accountNumber" class="stg-input-boxed" type="text" inputmode="numeric" value="${_esc(bizData.account_number)}">
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `,

        super: `
            <div class="stg-section">
                <div class="stg-group stg-group-fields">
                    <div class="stg-field stg-field-full">
                        <label class="stg-field-label" for="s_superFund">Fund Name</label>
                        <div class="stg-input-box">
                            <input id="s_superFund" class="stg-input-boxed" type="text" value="${_esc(bizData.super_fund)}">
                        </div>
                    </div>
                    <div class="stg-field stg-field-full">
                        <label class="stg-field-label" for="s_superMemberNumber">Member Number</label>
                        <div class="stg-input-box">
                            <input id="s_superMemberNumber" class="stg-input-boxed" type="text" value="${_esc(bizData.super_member_number)}">
                        </div>
                    </div>
                    <div class="stg-field stg-field-full">
                        <label class="stg-field-label" for="s_superFundAbn">Fund ABN</label>
                        <div class="stg-input-box">
                            <input id="s_superFundAbn" class="stg-input-boxed" type="text" inputmode="numeric" value="${_esc(bizData.super_fund_abn)}">
                        </div>
                    </div>
                    <div class="stg-field stg-field-full">
                        <label class="stg-field-label" for="s_superUsi">USI</label>
                        <div class="stg-input-box">
                            <input id="s_superUsi" class="stg-input-boxed" type="text" value="${_esc(bizData.super_usi)}">
                        </div>
                    </div>
                </div>
            </div>
        `,
    };

    panel.innerHTML = panels[activeTab] || '';
    _bindHandlers();
}

function _esc(v) {
    return String(v ?? '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
}

// ─────────────────────────────────────────────
// TAB SWITCHING
// ─────────────────────────────────────────────

function _bindTabSwitching() {
    document.querySelectorAll('.stg-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            activeTab = btn.dataset.tab;
            document.querySelectorAll('.stg-tab').forEach(b => b.classList.toggle('stg-tab-active', b.dataset.tab === activeTab));
            _renderPanel();
        });
    });
}

// ─────────────────────────────────────────────
// BIND INPUT HANDLERS
// ─────────────────────────────────────────────

function _bindHandlers() {
    // Invoice prefix — debounce save
    document.getElementById('s_invoicePrefix')?.addEventListener('input', e => {
        seqData.invoice_prefix = e.target.value;
        _scheduleSeqSave();
    });

    // Next invoice number — stored as last_number = nextNum - 1
    document.getElementById('s_nextInvoiceNumber')?.addEventListener('input', e => {
        const next = parseInt(e.target.value, 10);
        if (!isNaN(next) && next >= 1) {
            seqData.last_number = next - 1;
            _scheduleSeqSave();
        }
    });

    // Local preferences
    document.getElementById('s_markIssuedOnExport')?.addEventListener('change', e => {
        setLocal('markIssuedOnExport', e.target.checked);
    });
    document.getElementById('s_dueDateOffsetDays')?.addEventListener('input', e => {
        setLocal('dueDateOffsetDays', e.target.value);
    });
    document.getElementById('s_financialYearStartMonth')?.addEventListener('change', e => {
        setLocal('financialYearStartMonth', e.target.value);
    });

    // Include super — in business_details
    document.getElementById('s_includeSuperInTotals')?.addEventListener('change', e => {
        bizData.include_super_in_totals = e.target.checked;
        _scheduleBizSave();
    });

    // Personal / Banking / Super fields — all in business_details
    const bizFields = [
        ['s_name',            'name'],
        ['s_businessName',    'business_name'],
        ['s_abn',             'abn'],
        ['s_address',         'address'],
        ['s_bsb',             'bsb'],
        ['s_accountNumber',   'account_number'],
        ['s_superFund',       'super_fund'],
        ['s_superMemberNumber','super_member_number'],
        ['s_superFundAbn',    'super_fund_abn'],
        ['s_superUsi',        'super_usi'],
    ];
    bizFields.forEach(([id, key]) => {
        document.getElementById(id)?.addEventListener('input', e => {
            bizData[key] = e.target.value;
            _scheduleBizSave();
        });
    });
}

// ─────────────────────────────────────────────
// DEBOUNCED SAVES
// ─────────────────────────────────────────────

function _scheduleSeqSave() {
    clearTimeout(saveSeqTask);
    saveSeqTask = setTimeout(async () => {
        if (!seqData) return;
        await sb.from('invoice_sequence').update({
            invoice_prefix: seqData.invoice_prefix,
            last_number:    seqData.last_number,
        }).eq('user_id', seqData.user_id);
    }, 800);
}

function _scheduleBizSave() {
    clearTimeout(saveBizTask);
    saveBizTask = setTimeout(async () => {
        if (!bizData) return;
        await sb.from('business_details').update({
            name:                bizData.name,
            business_name:       bizData.business_name,
            abn:                 bizData.abn,
            address:             bizData.address,
            bsb:                 bizData.bsb,
            account_number:      bizData.account_number,
            super_fund:          bizData.super_fund,
            super_member_number: bizData.super_member_number,
            super_fund_abn:      bizData.super_fund_abn,
            super_usi:           bizData.super_usi,
            include_super_in_totals: bizData.include_super_in_totals,
        }).eq('user_id', bizData.user_id);
    }, 800);
}
