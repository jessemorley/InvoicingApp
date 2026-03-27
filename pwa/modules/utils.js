// ─────────────────────────────────────────────
// UTILS — pure calculation, formatting, date helpers
// No DOM access. Imported by all other modules.
// ─────────────────────────────────────────────

// ── Formatting ──────────────────────────────

export function fmt(n) {
    return '$' + Number(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtInvoiceAmount(value) {
    return new Intl.NumberFormat('en-AU', {
        minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(parseFloat(value) || 0);
}

export function fmtInvoiceRate(value) {
    const n = parseFloat(value) || 0;
    return new Intl.NumberFormat('en-AU', {
        minimumFractionDigits: 0, maximumFractionDigits: 2,
    }).format(n);
}

export function fmtInvoiceTime(t) {
    if (!t) return '';
    const parts = t.substring(0, 5).split(':');
    if (parts.length < 2) return t;
    return `${parseInt(parts[0], 10)}:${parts[1]}`;
}

export function abbreviateRole(role) {
    if (!role) return '';
    const r = role.toLowerCase();
    if (r === 'photographer') return 'P';
    if (r === 'operator') return 'O';
    return role;
}

// ── Date formatting ──────────────────────────

export function localDateStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

export function weeksAgoDateStr(weeks) {
    const d = new Date();
    d.setDate(d.getDate() - weeks * 7);
    return localDateStr(d);
}

export function weeksAgoDateStr_before(dateStr, weeks) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() - weeks * 7);
    return localDateStr(date);
}

export function formatEntryDate(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
    return date.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function formatEntryDateParts(dateStr) {
    if (!dateStr) return { dow: '', day: '', mon: '' };
    const [y, m, d] = dateStr.split('-');
    const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
    return {
        dow: date.toLocaleDateString('en-AU', { weekday: 'short' }),
        day: date.getDate(),
        mon: date.toLocaleDateString('en-AU', { month: 'short' }),
    };
}

export function isoWeekStart(dateStr) {
    const [y, m, d] = dateStr.split('-');
    const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
    const day = date.getDay(); // 0=Sun
    const diff = (day === 0 ? -6 : 1 - day); // Monday-based
    const mon = new Date(date);
    mon.setDate(date.getDate() + diff);
    return mon;
}

export function isoWeekKey(dateStr) {
    const mon = isoWeekStart(dateStr);
    return `${mon.getFullYear()}-${mon.getMonth()}-${mon.getDate()}`;
}

export function formatWeekLabel(weekStart) {
    const end = new Date(weekStart);
    end.setDate(weekStart.getDate() + 6);
    const opts = { day: 'numeric', month: 'short' };
    return `${weekStart.toLocaleDateString('en-AU', opts)} – ${end.toLocaleDateString('en-AU', opts)}`;
}

export function formatInvoiceDate(dateStr) {
    if (!dateStr) return '';
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const [y, m, d] = dateStr.split('-').map(Number);
    return `${months[m - 1]} ${d}, ${y}`;
}

export function formatInvoiceEntryDate(dateStr) {
    if (!dateStr) return '';
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return `${days[date.getDay()]}, ${months[m - 1]} ${d}`;
}

// ── Client color helpers ─────────────────────

export function clientBadgeColor(name) {
    if (name.includes('ICONIC'))  return 'bg-purple-50 text-purple-500';
    if (name.includes('Images'))  return 'bg-blue-50 text-blue-500';
    if (name.includes('JD'))      return 'bg-orange-50 text-orange-500';
    return 'bg-gray-100 text-gray-500';
}

export function clientDotColor(name) {
    if (name.includes('ICONIC'))  return '#a855f7';
    if (name.includes('Images'))  return '#3b82f6';
    if (name.includes('JD'))      return '#f97316';
    return '#9ca3af';
}

export function clientCalColor(name) {
    if (name.includes('ICONIC'))  return { bg: '#f5f0ff', text: '#a855f7' };
    if (name.includes('Images'))  return { bg: '#eff6ff', text: '#3b82f6' };
    if (name.includes('JD'))      return { bg: '#fff7ed', text: '#f97316' };
    return { bg: '#f3f4f6', text: '#6b7280' };
}

export function clientDowColor(name) {
    if (name.includes('ICONIC'))  return 'text-purple-500';
    if (name.includes('Images'))  return 'text-blue-500';
    if (name.includes('JD'))      return 'text-orange-500';
    return 'text-gray-400';
}

export const invoiceChipColors = {
    'draft':  'bg-gray-100 text-gray-500',
    'issued': 'bg-orange-100 text-orange-600',
    'paid':   'bg-green-100 text-green-600',
};

// ── Entry display helpers ────────────────────

export function entryDescription(entry) {
    const label = entry.shoot_client || entry.description;
    if (label) return label + (entry.role ? ` · ${abbreviateRole(entry.role)}` : '');
    if (entry.day_type)     return (entry.day_type === 'full' ? 'Full day' : 'Half day')
                                   + (entry.workflow_type ? ` · ${entry.workflow_type}` : '');
    if (entry.hours_worked) return `${entry.hours_worked}h`;
    return '—';
}

// ── Calculations ─────────────────────────────

export function toMins(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}

export function calcDayRate(client, dayType, workflow, skus, workflowRates) {
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

export function calcHourly(client, startStr, finishStr, breakMins, role) {
    if (!startStr || !finishStr) return null;
    let diffMins = (toMins(finishStr) - toMins(startStr) + 1440) % 1440;
    diffMins = Math.max(0, diffMins - (parseInt(breakMins) || 0));
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

export function calcManual(amountStr, client) {
    const base     = parseFloat(amountStr) || 0;
    const superAmt = client.pays_super ? base * parseFloat(client.super_rate || 0.12) : 0;
    return { base, bonus: 0, superAmt, total: base + superAmt, hoursWorked: null };
}
