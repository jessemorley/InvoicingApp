import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendEmail } from '../_shared/sendEmail.ts';

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'authorization, content-type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
            },
        });
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonError('Unauthorized', 401);

    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await sb.auth.getUser();
    if (authError || !user) return jsonError('Unauthorized', 401);

    let body: {
        to: string; subject: string; body_text: string;
        invoice_html: string; filename: string;
        invoice_id?: string; scheduled_for?: string; mark_issued?: boolean;
    };
    try { body = await req.json(); } catch { return jsonError('Invalid JSON body', 400); }

    const { to, subject, body_text, invoice_html, filename, invoice_id, scheduled_for, mark_issued } = body;
    if (!to || !subject || !invoice_html || !filename) {
        return jsonError('Missing required fields: to, subject, invoice_html, filename', 400);
    }

    // ── Scheduled send: save to DB and return ────────────────────────────────
    if (scheduled_for) {
        const { error } = await sb.from('scheduled_emails').insert({
            user_id:      user.id,
            invoice_id:   invoice_id ?? null,
            to_address:   to,
            subject,
            body_text:    body_text ?? '',
            invoice_html,
            filename,
            scheduled_for,
            mark_issued:  mark_issued ?? false,
        });
        if (error) return jsonError('Failed to schedule: ' + error.message, 500);
        return new Response(JSON.stringify({ ok: true, scheduled: true }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
    }

    // ── Immediate send ────────────────────────────────────────────────────────
    const err = await sendEmail(to, subject, body_text ?? '', invoice_html, filename);
    if (err) return jsonError(err, 502);

    return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
});

function jsonError(message: string, status: number) {
    return new Response(JSON.stringify({ error: message }), {
        status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
}
