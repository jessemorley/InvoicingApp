// ─────────────────────────────────────────────
// APP SHELL — auth, routing, global state, data loading
// ─────────────────────────────────────────────
import * as Dashboard from './modules/dashboard.js';
import * as Entries  from './modules/entries.js';
import * as Invoices from './modules/invoices.js';
import * as Clients  from './modules/clients.js';
import * as Calendar from './modules/calendar.js';
import * as Generate from './modules/generate.js';
import * as Settings from './modules/settings.js';
import * as Expenses from './modules/expenses.js';
import { clientDotColor } from './modules/utils.js';

// ── Supabase ─────────────────────────────────
const SUPABASE_URL      = 'https://cmbycqzjlwvydemaxrtb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_UYYQBD6MkiRxpv7Z_-sIGA_riCDJQzD';

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── View constants ────────────────────────────
const VIEW_DASHBOARD        = 0;
const VIEW_ENTRIES          = 1;
const VIEW_INVOICES         = 2;
const VIEW_SETTINGS         = 3;
const VIEW_CALENDAR         = 4;
const VIEW_CLIENTS          = 5;
const VIEW_INVOICE_PREVIEW  = 6;
const VIEW_EXPENSES         = 7;

// ── Global state ─────────────────────────────
let allClients              = [];
let clientLatestInvoiceMap  = {};
let clientInvoiceCountMap   = {};
let workflowRates           = [];
let businessDetails         = null;
let invoiceSequence         = null;
let currentUserId           = null;
let currentViewIndex        = VIEW_ENTRIES;

function getState() {
    return { allClients, clientLatestInvoiceMap, clientInvoiceCountMap, workflowRates, businessDetails, invoiceSequence, currentUserId, invoiceChipColors };
}

const invoiceChipColors = {
    'draft':  'bg-gray-100 text-gray-500',
    'issued': 'bg-orange-100 text-orange-600',
    'paid':   'bg-green-100 text-green-600',
};

// Initialise modules
Dashboard.init(sb, getState);
Entries.init(sb, getState);
Invoices.init(sb, getState);
Clients.init(sb, getState);
Calendar.init(sb, getState);
Generate.init(sb, getState);
Settings.init(sb, getState);
Expenses.init(sb, getState);

// ─────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────
async function init() {
    const { data: { session } } = await sb.auth.getSession();
    document.getElementById('loadingScreen').classList.remove('active');
    if (session) {
        currentUserId = session.user.id;
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
    sb.auth.getSession().then(({ data: { session } }) => {
        if (session?.user?.email) {
            document.getElementById('sidebarEmail').textContent = session.user.email;
        }
    });
    Clients.initHandlers();
    const saved = parseInt(sessionStorage.getItem('activeView'));
    switchView((Number.isFinite(saved) && saved <= VIEW_CLIENTS) ? saved : VIEW_ENTRIES);
}

document.getElementById('loginBtn').addEventListener('click', async () => {
    const email    = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errEl    = document.getElementById('loginError');
    const btn      = document.getElementById('loginBtn');
    btn.disabled   = true;
    btn.textContent = 'Signing in…';
    errEl.classList.add('hidden');
    const { data: signInData, error } = await sb.auth.signInWithPassword({ email, password });
    btn.disabled   = false;
    btn.textContent = 'Sign In';
    if (error) {
        errEl.textContent = error.message;
        errEl.classList.remove('hidden');
    } else {
        currentUserId = signInData.session.user.id;
        if (signInData.session.user.email) {
            document.getElementById('sidebarEmail').textContent = signInData.session.user.email;
        }
        showApp();
        await loadData();
    }
});

document.getElementById('signOutBtn')?.addEventListener('click', async () => {
    await sb.auth.signOut();
    showLogin();
});

document.getElementById('sidebarSignOut').addEventListener('click', async () => {
    await sb.auth.signOut();
    showLogin();
});

// ─────────────────────────────────────────────
// DATA LOADING
// ─────────────────────────────────────────────
async function loadData() {
    const [{ data: clients }, { data: rates }, { data: invoices }, { data: bizData }, { data: seqData }] = await Promise.all([
        sb.from('clients').select('*').eq('is_active', true).order('name'),
        sb.from('client_workflow_rates').select('*'),
        sb.from('invoices').select('client_id'),
        sb.from('business_details').select('*').single(),
        sb.from('invoice_sequence').select('invoice_prefix').single()
    ]);
    allClients      = clients || [];
    workflowRates   = rates   || [];
    if (bizData)  businessDetails  = bizData;
    if (seqData)  invoiceSequence  = seqData;

    clientInvoiceCountMap = {};
    (invoices || []).forEach(inv => {
        if (inv.client_id) {
            clientInvoiceCountMap[inv.client_id] = (clientInvoiceCountMap[inv.client_id] || 0) + 1;
        }
    });

    Invoices.markStale();
    await Entries.loadRecentEntries();
    Generate.scanAndRender();

    if (currentViewIndex === VIEW_INVOICES) {
        Invoices.loadInvoices();
    }
}

// ─────────────────────────────────────────────
// CLIENT PICKER OVERLAY
// ─────────────────────────────────────────────
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
        const count    = clientInvoiceCountMap[client.id] || 0;
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
            Entries.openNewEntryCardForClient(client);
        });
        list.appendChild(row);
    });
}

document.getElementById('newEntryFab').addEventListener('click', () => {
    if (window.innerWidth >= 768) {
        Entries.openNewEntryDesktop(allClients, clientInvoiceCountMap);
    } else {
        openClientPicker();
    }
});
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

// Entries module requests picker re-open (e.g. clear client button)
document.addEventListener('entries:openClientPicker', () => {
    if (window.innerWidth >= 768) {
        Entries.openNewEntryDesktop(allClients, clientInvoiceCountMap);
    } else {
        openClientPicker();
    }
});

// After invoice generation: reload entries + invoices + re-scan
document.addEventListener('generate:done', async () => {
    await Promise.all([Entries.loadRecentEntries(), Invoices.loadInvoices()]);
    Generate.scanAndRender();
});

document.addEventListener('invoice:deleted', async () => {
    await Entries.loadRecentEntries();
    Generate.scanAndRender();
});

// After client saved: refresh allClients + workflow rates so new/edited clients appear everywhere
document.addEventListener('clients:saved', async () => {
    const [{ data: clients }, { data: rates }] = await Promise.all([
        sb.from('clients').select('*').eq('is_active', true).order('name'),
        sb.from('client_workflow_rates').select('*'),
    ]);
    allClients    = clients || [];
    workflowRates = rates   || [];
});

// ─────────────────────────────────────────────
// VIEW SWITCHING
// ─────────────────────────────────────────────
const TAB_IDS = ['tabDashboardBtn', 'tabEntriesBtn', 'tabInvoicesBtn'];
const SIDEBAR_VIEWS = ['dashboard', 'entries', 'invoices', 'settings', 'calendar', 'clients', null, 'expenses'];

function openOverflowMenu() {
    const backdrop = document.getElementById('overflowBackdrop');
    const sheet    = document.getElementById('overflowSheet');
    backdrop.style.opacity      = '1';
    backdrop.style.pointerEvents = 'auto';
    sheet.style.transform = 'translateY(0)';
}
function closeOverflowMenu() {
    const backdrop = document.getElementById('overflowBackdrop');
    const sheet    = document.getElementById('overflowSheet');
    backdrop.style.opacity      = '0';
    backdrop.style.pointerEvents = 'none';
    sheet.style.transform = 'translateY(100%)';
}
window.openOverflowMenu  = openOverflowMenu;
window.closeOverflowMenu = closeOverflowMenu;

// Drag-to-dismiss on overflow sheet
(function() {
    const sheet = document.getElementById('overflowSheet');
    let startY = 0, isDragging = false;
    sheet.addEventListener('touchstart', e => {
        startY = e.touches[0].clientY;
        isDragging = true;
        sheet.style.transition = 'none';
    }, { passive: true });
    sheet.addEventListener('touchmove', e => {
        if (!isDragging) return;
        const dy = e.touches[0].clientY - startY;
        if (dy > 0) sheet.style.transform = `translateY(${dy}px)`;
    }, { passive: true });
    sheet.addEventListener('touchend', e => {
        if (!isDragging) return;
        isDragging = false;
        sheet.style.transition = '';
        const dy = e.changedTouches[0].clientY - startY;
        if (dy > 60) {
            closeOverflowMenu();
        } else {
            sheet.style.transform = 'translateY(0)';
        }
    });
})();

export function switchView(index) {
    currentViewIndex = index;
    sessionStorage.setItem('activeView', index);
    closeOverflowMenu();
    const isDesktop = window.innerWidth >= 768;

    if (isDesktop) {
        // Clear any mobile transform so the desktop flex layout takes over
        document.getElementById('viewSlider').style.transform = '';
        const DESKTOP_PANES = ['viewDashboard','viewEntries','viewInvoices','viewSettings','viewCalendar','viewClients','viewInvoicePreview','viewExpenses'];
        DESKTOP_PANES.forEach((id, i) => {
            const el = document.getElementById(id);
            if (!el) return;
            if (i === VIEW_INVOICE_PREVIEW) {
                if (index === VIEW_INVOICE_PREVIEW) {
                    // Slide up into view
                    el.style.display = 'block';
                    el.style.transform = 'translateY(100%)';
                    el.style.transition = 'none';
                    requestAnimationFrame(() => requestAnimationFrame(() => {
                        el.style.transition = 'transform 0.35s cubic-bezier(0.4,0,0.2,1)';
                        el.style.transform  = 'translateY(0)';
                    }));
                } else {
                    el.style.display = 'none';
                    el.style.transform = '';
                    el.style.transition = '';
                }
            } else {
                el.style.display = i === index ? '' : 'none';
            }
        });
        // Sidebar: no item highlights when preview is active
        document.querySelectorAll('.sidebar-btn[data-view]').forEach(btn => {
            btn.classList.toggle('active', index !== VIEW_INVOICE_PREVIEW && btn.dataset.view === SIDEBAR_VIEWS[index]);
        });
    } else {
        // On mobile: slider transform
        const slider = document.getElementById('viewSlider');
        slider.style.transition = 'transform 0.32s cubic-bezier(0.4, 0, 0.2, 1)';
        slider.style.transform  = `translateX(${index * -100}vw)`;

        TAB_IDS.forEach((id, i) => {
            const el = document.getElementById(id);
            if (el) el.classList.toggle('active', i === index);
        });
        // Highlight hamburger when an overflow view is active
        const overflowBtn = document.getElementById('tabOverflowBtn');
        if (overflowBtn) overflowBtn.classList.toggle('active', index >= TAB_IDS.length);
    }

    // FAB: only on Entries view
    document.getElementById('newEntryFab').style.display = index === VIEW_ENTRIES ? 'flex' : 'none';

    // Lazy-load
    if (index === VIEW_DASHBOARD) Dashboard.loadDashboard();
    if (index === VIEW_INVOICES) {
        if (!Invoices.isLoaded()) Invoices.loadInvoices();
        Generate.scanAndRender();
    }
    if (index === VIEW_CALENDAR) Calendar.loadCalendar();
    if (index === VIEW_CLIENTS)  Clients.loadClients();
    if (index === VIEW_SETTINGS) Settings.loadSettings();
    if (index === VIEW_EXPENSES) Expenses.loadExpenses();
}
// Expose for onclick= attributes in HTML
window.switchView = switchView;

async function openAccountSettings() {
    switchView(VIEW_SETTINGS);
    await Settings.loadSettings();
    Settings.scrollToAccount();
}
window.openAccountSettings = openAccountSettings;
window.navigateToInvoice = (id) => {
    if (Invoices.isLoaded()) {
        switchView(VIEW_INVOICES);
        Invoices.openInvoiceById(id);
    } else {
        Invoices.queueOpen(id);
        switchView(VIEW_INVOICES);
    }
};

// ─────────────────────────────────────────────
// VIEW SWIPE GESTURE
// ─────────────────────────────────────────────
(function() {
    let startX = 0, startY = 0;
    let swipeDir = null;
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
        if (!swipeDir && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
            swipeDir = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
        }
        if (swipeDir !== 'h') return;
        e.preventDefault();
        const baseVw  = currentViewIndex * -100;
        const dragVw  = (dx / window.innerWidth) * 100;
        const totalVw = Math.max(-500, Math.min(0, baseVw + dragVw));
        liveOffsetVw  = totalVw;
        slider.style.transform = `translateX(${totalVw}vw)`;
    }, { passive: false });

    slider.addEventListener('touchend', () => {
        if (swipeDir !== 'h') return;
        slider.style.transition = 'transform 0.32s cubic-bezier(0.4, 0, 0.2, 1)';
        const moved = liveOffsetVw - (currentViewIndex * -100);
        const maxView = 5;
        if (moved < -28 && currentViewIndex < maxView) {
            switchView(currentViewIndex + 1);
        } else if (moved > 28 && currentViewIndex > 0) {
            switchView(currentViewIndex - 1);
        } else {
            slider.style.transform = `translateX(${currentViewIndex * -100}vw)`;
        }
    });
})();

// ─────────────────────────────────────────────
// INVOICE PREVIEW BACK / PRINT
// ─────────────────────────────────────────────
document.getElementById('invoicePreviewBack').addEventListener('click', () => {
    const isDesktop    = window.innerWidth >= 768;
    const previewPane  = document.getElementById('viewInvoicePreview');
    const scrollArea   = document.getElementById('invoicePreviewScrollArea');
    const frame        = document.getElementById('invoicePreviewFrame');

    const cleanup = () => {
        Invoices.cleanupPreview();
        scrollArea.scrollTop = 0;
        frame.srcdoc = '';
        document.getElementById('invoicePreviewScaleWrap').style.marginBottom = '';
    };

    if (isDesktop) {
        // Reveal invoices behind the preview, then slide preview down
        document.getElementById('viewInvoices').style.display = '';
        previewPane.style.transition = 'transform 0.35s cubic-bezier(0.4,0,0.2,1)';
        previewPane.style.transform  = 'translateY(100%)';
        setTimeout(() => {
            previewPane.style.display    = 'none';
            previewPane.style.transform  = '';
            previewPane.style.transition = '';
            cleanup();
            switchView(VIEW_INVOICES); // updates currentViewIndex + sidebar
        }, 350);
    } else {
        switchView(VIEW_INVOICES);
        setTimeout(cleanup, 350);
    }
});

document.getElementById('invoicePreviewPrint').addEventListener('click', () => {
    const html = Invoices.getPrintHTML();
    if (!html) return;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
});

// ─────────────────────────────────────────────
// INIT SCROLL HANDLERS + START
// ─────────────────────────────────────────────
Entries.initScrollHandlers();
Invoices.initScrollHandlers();

// Re-apply layout when crossing the mobile↔desktop breakpoint
let _lastIsDesktop = window.innerWidth >= 768;
window.addEventListener('resize', () => {
    const isDesktop = window.innerWidth >= 768;
    if (isDesktop !== _lastIsDesktop) {
        _lastIsDesktop = isDesktop;
        switchView(currentViewIndex);
    }
});

lucide.createIcons({ attrs: { 'stroke-width': 2.2 } });
init();
