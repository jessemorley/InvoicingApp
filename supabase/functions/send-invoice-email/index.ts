import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BROWSERLESS_TOKEN = Deno.env.get('BROWSERLESS_TOKEN') ?? '';
const RESEND_API_KEY    = Deno.env.get('RESEND_API_KEY') ?? '';
const RESEND_FROM       = Deno.env.get('RESEND_FROM') ?? '';
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

export async function sendEmail(
    to: string, subject: string, bodyText: string,
    invoiceHtml: string, filename: string,
): Promise<string | null> {
    // Generate PDF via Browserless
    let pdfBase64: string;
    try {
        const res = await fetch(
            `https://production-sfo.browserless.io/pdf?token=${BROWSERLESS_TOKEN}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    html: invoiceHtml,
                    options: { format: 'A4', printBackground: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } },
                }),
            },
        );
        if (!res.ok) throw new Error(`Browserless error ${res.status}: ${await res.text()}`);
        const bytes = new Uint8Array(await res.arrayBuffer());
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        pdfBase64 = btoa(binary);
    } catch (err) {
        console.error('PDF generation failed:', err);
        return 'PDF generation failed: ' + (err as Error).message;
    }

    // Send via Resend
    const htmlBody = (bodyText || '')
        .split('\n')
        .map(line => line.trim()
            ? `<p style="margin:0 0 8px 0;font-family:Arial,sans-serif;font-size:15px;color:#111827;">${line}</p>`
            : '<p style="margin:0 0 8px 0;">&nbsp;</p>')
        .join('');

    try {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: RESEND_FROM, to: [to], subject, html: htmlBody, attachments: [{ filename, content: pdfBase64 }] }),
        });
        if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
    } catch (err) {
        console.error('Email send failed:', err);
        return 'Email send failed: ' + (err as Error).message;
    }

    return null;
}

function jsonError(message: string, status: number) {
    return new Response(JSON.stringify({ error: message }), {
        status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
}
