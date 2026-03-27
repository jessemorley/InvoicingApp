// ─────────────────────────────────────────────
// GENERATE MODULE
// Invoice generation bar — appears at top of Entries view
// when uninvoiced entry groups exist
// ─────────────────────────────────────────────
import { fmt, isoWeekKey, isoWeekStart } from './utils.js';

let sb, getState;

export function init(supabase, stateGetter) {
    sb = supabase;
    getState = stateGetter;
}

// ── State ────────────────────────────────────
let uninvoicedGroups = [];   // { clientId, client, entries, selected }
let barExpanded      = false;

// ─────────────────────────────────────────────
// SCAN FOR UNINVOICED ENTRIES
// ─────────────────────────────────────────────

export async function scanAndRender() {
    const bar = document.getElementById('generateBar');
    if (!bar) return;

    const { data: entries, error } = await sb
        .from('entries')
        .select('*, clients(*)')
        .is('invoice_id', null)
        .order('date', { ascending: false });

    if (error || !entries?.length) {
        bar.style.display = 'none';
        uninvoicedGroups = [];
        return;
    }

    // Group by client + ISO week
    const groupMap = {};
    entries.forEach(entry => {
        const client = entry.clients;
        if (!client || !client.is_active) return;
        const key = `${client.id}-${isoWeekKey(entry.date)}`;
        if (!groupMap[key]) {
            groupMap[key] = { clientId: client.id, client, entries: [], selected: true };
        }
        groupMap[key].entries.push(entry);
    });

    uninvoicedGroups = Object.values(groupMap).sort((a, b) => {
        if (a.client.name !== b.client.name) return a.client.name < b.client.name ? -1 : 1;
        const ad = a.entries[0]?.date || '';
        const bd = b.entries[0]?.date || '';
        return ad < bd ? -1 : 1;
    });

    if (!uninvoicedGroups.length) {
        bar.style.display = 'none';
        return;
    }

    bar.style.display = '';
    barExpanded = false;
    _renderBar();
}

// ─────────────────────────────────────────────
// RENDER
// ─────────────────────────────────────────────

function _renderBar() {
    const bar = document.getElementById('generateBar');
    if (!bar) return;

    const count    = uninvoicedGroups.length;
    const selected = uninvoicedGroups.filter(g => g.selected).length;

    if (!barExpanded) {
        bar.innerHTML = `
        <div id="generateBarCollapsed" style="display:flex; align-items:center; justify-content:space-between; padding:14px 20px; background:#fff; border-radius:16px; box-shadow:0 1px 4px rgba(0,0,0,0.08); cursor:pointer; gap:12px;">
            <div style="display:flex; align-items:center; gap:10px;">
                <span style="display:flex; align-items:center; justify-content:center; width:28px; height:28px; border-radius:50%; background:#f59e0b20; flex-shrink:0;">
                    <svg width="14" height="14" fill="none" stroke="#f59e0b" stroke-width="2" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                    </svg>
                </span>
                <span style="font-size:14px; font-weight:700; color:#111827;">${count} group${count !== 1 ? 's' : ''} ready to invoice</span>
            </div>
            <svg width="16" height="16" fill="none" stroke="#9ca3af" stroke-width="2.5" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>
            </svg>
        </div>`;
        bar.querySelector('#generateBarCollapsed').addEventListener('click', () => {
            barExpanded = true;
            _renderBar();
        });
        return;
    }

    // Expanded state
    let groupRows = '';
    uninvoicedGroups.forEach((group, idx) => {
        const weekStart   = isoWeekStart(group.entries[0].date);
        const weekEnd     = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        const opts        = { day: 'numeric', month: 'short' };
        const dateRange   = `${weekStart.toLocaleDateString('en-AU', opts)} – ${weekEnd.toLocaleDateString('en-AU', opts)}`;
        const subtotal    = group.entries.reduce((s, e) => s + (e.base_amount || 0) + (e.bonus_amount || 0), 0);
        groupRows += `
        <div style="display:flex; align-items:center; gap:12px; padding:10px 0; border-bottom:1px solid #f3f4f6;">
            <label class="toggle-wrap" style="flex-shrink:0;">
                <input type="checkbox" class="gen-group-check" data-idx="${idx}" ${group.selected ? 'checked' : ''}>
                <div class="toggle-track"><div class="toggle-thumb"></div></div>
            </label>
            <div style="flex:1; min-width:0;">
                <p style="font-size:14px; font-weight:700; color:#111827; margin:0;">${group.client.name}</p>
                <p style="font-size:12px; color:#9ca3af; margin:0;">${dateRange} · ${group.entries.length} ${group.entries.length === 1 ? 'entry' : 'entries'}</p>
            </div>
            <span style="font-size:14px; font-weight:700; color:#111827; flex-shrink:0;">${fmt(subtotal)}</span>
        </div>`;
    });

    bar.innerHTML = `
    <div style="background:#fff; border-radius:16px; box-shadow:0 1px 4px rgba(0,0,0,0.08); overflow:hidden;">
        <div style="display:flex; align-items:center; justify-content:space-between; padding:14px 20px; border-bottom:1px solid #f3f4f6; cursor:pointer;" id="genBarHeader">
            <span style="font-size:14px; font-weight:700; color:#111827;">${count} group${count !== 1 ? 's' : ''} ready to invoice</span>
            <svg width="16" height="16" fill="none" stroke="#9ca3af" stroke-width="2.5" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7"/>
            </svg>
        </div>
        <div style="padding:0 20px;">
            ${groupRows}
        </div>
        <div style="padding:14px 20px;">
            <button id="generateInvoicesBtn" class="btn-primary" ${selected === 0 ? 'disabled' : ''}>
                Generate ${selected} Invoice${selected !== 1 ? 's' : ''}
            </button>
        </div>
    </div>`;

    bar.querySelector('#genBarHeader').addEventListener('click', () => {
        barExpanded = false;
        _renderBar();
    });

    bar.querySelectorAll('.gen-group-check').forEach(cb => {
        cb.addEventListener('change', e => {
            uninvoicedGroups[parseInt(e.target.dataset.idx)].selected = e.target.checked;
            _updateGenerateBtn();
        });
    });

    document.getElementById('generateInvoicesBtn').addEventListener('click', _generate);
}

function _updateGenerateBtn() {
    const btn = document.getElementById('generateInvoicesBtn');
    if (!btn) return;
    const selected = uninvoicedGroups.filter(g => g.selected).length;
    btn.disabled = selected === 0;
    btn.textContent = `Generate ${selected} Invoice${selected !== 1 ? 's' : ''}`;
}

// ─────────────────────────────────────────────
// GENERATE INVOICES
// ─────────────────────────────────────────────

async function _generate() {
    const btn = document.getElementById('generateInvoicesBtn');
    btn.disabled = true;
    btn.textContent = 'Generating…';

    const { invoiceSequence, businessDetails, currentUserId } = getState();
    const selectedGroups = uninvoicedGroups.filter(g => g.selected);

    try {
        for (const group of selectedGroups) {
            // Call RPC to get next invoice number
            const { data: nextNum, error: rpcErr } = await sb.rpc('next_invoice_number');
            if (rpcErr) throw rpcErr;

            const invoicePrefix = invoiceSequence?.invoice_prefix || businessDetails?.invoice_prefix || 'INV';
            const dueDays       = businessDetails?.due_date_offset_days || 14;
            const now     = new Date();
            const dueDate = new Date(now);
            dueDate.setDate(dueDate.getDate() + dueDays);

            const invoice = {
                user_id:       currentUserId,
                invoice_number:`${invoicePrefix}${nextNum}`,
                client_id:     group.client.id,
                issued_date:   _dateStr(now),
                due_date:      _dateStr(dueDate),
                subtotal:      group.entries.reduce((s, e) => s + (e.base_amount || 0) + (e.bonus_amount || 0), 0),
                super_amount:  group.entries.reduce((s, e) => s + (e.super_amount || 0), 0),
                total:         group.entries.reduce((s, e) => s + (e.total_amount || 0), 0),
                status:        'draft',
            };

            const { data: inv, error: invErr } = await sb.from('invoices').insert(invoice).select().single();
            if (invErr) throw invErr;

            // Link entries to invoice
            const { error: updateErr } = await sb
                .from('entries')
                .update({ invoice_id: inv.id })
                .in('id', group.entries.map(e => e.id));
            if (updateErr) throw updateErr;
        }

        btn.textContent = `Generated ✓`;
        btn.classList.add('success');

        // Notify app to reload data
        document.dispatchEvent(new CustomEvent('generate:done'));

        setTimeout(() => {
            barExpanded = false;
            document.getElementById('generateBar').style.display = 'none';
        }, 2000);

    } catch (err) {
        alert('Error generating invoices: ' + err.message);
        btn.disabled = false;
        btn.textContent = 'Try Again';
    }
}

function _dateStr(date) {
    const y  = date.getFullYear();
    const m  = String(date.getMonth() + 1).padStart(2, '0');
    const d  = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}
