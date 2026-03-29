let sb, getState;

export function init(supabase, stateGetter) {
    sb = supabase;
    getState = stateGetter;
}

export async function loadAccount() {
    const el = document.getElementById('accountContent');
    if (!el) return;
    const { data: { session } } = await sb.auth.getSession();
    const email = session?.user?.email ?? '—';
    el.innerHTML = `
        <div class="settings-group">
            <div class="settings-row">
                <span class="settings-label">Email</span>
                <span class="settings-value-readonly">${email}</span>
            </div>
        </div>`;
}
