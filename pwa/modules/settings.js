// ─────────────────────────────────────────────
// SETTINGS MODULE
// Handles: personal info, banking, super, invoice numbering, preferences
// ─────────────────────────────────────────────

let sb, getState;

export function init(supabase, stateGetter) {
    sb = supabase;
    getState = stateGetter;
}

// ── State ─────────────────────────────────────
let settingsLoaded = false;
let bizData        = null;
let seqData        = null;
let saveSeqTask    = null;
let saveBizTask    = null;

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

function _render() {
    const container = document.getElementById('settingsContent');
    if (!container || !bizData || !seqData) return;

    const nextNum = (seqData.last_number ?? 0) + 1;
    const markIssued = getLocal('markIssuedOnExport', true);
    const dueOffset  = getLocal('dueDateOffsetDays', 30);
    const fyMonth    = getLocal('financialYearStartMonth', 7);

    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const monthOptions = MONTHS.map((m, i) =>
        `<option value="${i+1}" ${fyMonth === i+1 ? 'selected' : ''}>${m}</option>`
    ).join('');

    container.innerHTML = `
        <!-- GENERAL -->
        <div class="settings-section">
            <div class="settings-section-header">General</div>
            <div class="settings-group">
                <div class="settings-row">
                    <label class="settings-label">Invoice Prefix</label>
                    <input id="s_invoicePrefix" class="settings-input settings-input-short" type="text"
                        value="${_esc(seqData.invoice_prefix)}" maxlength="10">
                </div>
                <div class="settings-row">
                    <label class="settings-label">Next Invoice #</label>
                    <input id="s_nextInvoiceNumber" class="settings-input settings-input-short" type="number"
                        min="1" step="1" value="${nextNum}">
                </div>
            </div>
        </div>

        <!-- PREFERENCES -->
        <div class="settings-section">
            <div class="settings-section-header">Preferences</div>
            <div class="settings-group">
                <div class="settings-row settings-row-toggle">
                    <label class="settings-label">Include super in totals</label>
                    <label class="settings-toggle">
                        <input id="s_includeSuperInTotals" type="checkbox" ${bizData.include_super_in_totals ? 'checked' : ''}>
                        <span class="settings-toggle-track"></span>
                    </label>
                </div>
                <div class="settings-row settings-row-toggle">
                    <label class="settings-label">Mark as issued on PDF export</label>
                    <label class="settings-toggle">
                        <input id="s_markIssuedOnExport" type="checkbox" ${markIssued ? 'checked' : ''}>
                        <span class="settings-toggle-track"></span>
                    </label>
                </div>
                <div class="settings-row">
                    <label class="settings-label">Due date offset</label>
                    <div class="settings-input-row">
                        <input id="s_dueDateOffsetDays" class="settings-input settings-input-short" type="number"
                            min="7" max="90" value="${dueOffset}">
                        <span class="settings-unit">days</span>
                    </div>
                </div>
                <div class="settings-row">
                    <label class="settings-label">Financial year starts</label>
                    <select id="s_financialYearStartMonth" class="settings-select">
                        ${monthOptions}
                    </select>
                </div>
            </div>
        </div>

        <!-- PERSONAL INFO -->
        <div class="settings-section">
            <div class="settings-section-header">Personal Info</div>
            <div class="settings-group">
                <div class="settings-field">
                    <label class="settings-field-label">Name</label>
                    <input id="s_name" class="settings-input settings-input-full" type="text" value="${_esc(bizData.name)}">
                </div>
                <div class="settings-field">
                    <label class="settings-field-label">Business Name</label>
                    <input id="s_businessName" class="settings-input settings-input-full" type="text" value="${_esc(bizData.business_name)}">
                </div>
                <div class="settings-field">
                    <label class="settings-field-label">ABN</label>
                    <input id="s_abn" class="settings-input settings-input-full" type="text" inputmode="numeric" value="${_esc(bizData.abn)}">
                </div>
                <div class="settings-field">
                    <label class="settings-field-label">Address</label>
                    <input id="s_address" class="settings-input settings-input-full" type="text" value="${_esc(bizData.address)}">
                </div>
            </div>
        </div>

        <!-- BANKING -->
        <div class="settings-section">
            <div class="settings-section-header">Banking</div>
            <div class="settings-group">
                <div class="settings-field">
                    <label class="settings-field-label">BSB</label>
                    <input id="s_bsb" class="settings-input settings-input-full" type="text" inputmode="numeric" value="${_esc(bizData.bsb)}">
                </div>
                <div class="settings-field">
                    <label class="settings-field-label">Account Number</label>
                    <input id="s_accountNumber" class="settings-input settings-input-full" type="text" inputmode="numeric" value="${_esc(bizData.account_number)}">
                </div>
            </div>
        </div>

        <!-- SUPERANNUATION -->
        <div class="settings-section">
            <div class="settings-section-header">Superannuation</div>
            <div class="settings-group">
                <div class="settings-field">
                    <label class="settings-field-label">Fund Name</label>
                    <input id="s_superFund" class="settings-input settings-input-full" type="text" value="${_esc(bizData.super_fund)}">
                </div>
                <div class="settings-field">
                    <label class="settings-field-label">Member Number</label>
                    <input id="s_superMemberNumber" class="settings-input settings-input-full" type="text" value="${_esc(bizData.super_member_number)}">
                </div>
                <div class="settings-field">
                    <label class="settings-field-label">Fund ABN</label>
                    <input id="s_superFundAbn" class="settings-input settings-input-full" type="text" inputmode="numeric" value="${_esc(bizData.super_fund_abn)}">
                </div>
                <div class="settings-field">
                    <label class="settings-field-label">USI</label>
                    <input id="s_superUsi" class="settings-input settings-input-full" type="text" value="${_esc(bizData.super_usi)}">
                </div>
            </div>
        </div>
    `;

    _bindHandlers();
}

function _esc(v) {
    return String(v ?? '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
}

// ─────────────────────────────────────────────
// BIND INPUT HANDLERS
// ─────────────────────────────────────────────

function _bindHandlers() {
    // Invoice prefix — debounce save
    document.getElementById('s_invoicePrefix').addEventListener('input', e => {
        seqData.invoice_prefix = e.target.value;
        _scheduleSeqSave();
    });

    // Next invoice number — stored as last_number = nextNum - 1
    document.getElementById('s_nextInvoiceNumber').addEventListener('input', e => {
        const next = parseInt(e.target.value, 10);
        if (!isNaN(next) && next >= 1) {
            seqData.last_number = next - 1;
            _scheduleSeqSave();
        }
    });

    // Local preferences
    document.getElementById('s_markIssuedOnExport').addEventListener('change', e => {
        setLocal('markIssuedOnExport', e.target.checked);
    });
    document.getElementById('s_dueDateOffsetDays').addEventListener('input', e => {
        setLocal('dueDateOffsetDays', e.target.value);
    });
    document.getElementById('s_financialYearStartMonth').addEventListener('change', e => {
        setLocal('financialYearStartMonth', e.target.value);
    });

    // Include super — in business_details
    document.getElementById('s_includeSuperInTotals').addEventListener('change', e => {
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
