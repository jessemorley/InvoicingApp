import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BROWSERLESS_TOKEN = Deno.env.get('BROWSERLESS_TOKEN') ?? '';
const RESEND_API_KEY    = Deno.env.get('RESEND_API_KEY') ?? '';
const RESEND_FROM       = Deno.env.get('RESEND_FROM') ?? '';

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

    // Validate caller is an authenticated Supabase user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
        return jsonError('Unauthorized', 401);
    }
    const sb = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader } } },
    );
    const { error: authError } = await sb.auth.getUser();
    if (authError) return jsonError('Unauthorized', 401);

    let body: { to: string; subject: string; body_text: string; invoice_html: string; filename: string };
    try {
        body = await req.json();
    } catch {
        return jsonError('Invalid JSON body', 400);
    }

    const { to, subject, body_text, invoice_html, filename } = body;
    if (!to || !subject || !invoice_html || !filename) {
        return jsonError('Missing required fields: to, subject, invoice_html, filename', 400);
    }

    // ── 1. Generate PDF via Browserless ──────────────────────────────────────
    let pdfBase64: string;
    try {
        const browserlessRes = await fetch(
            `https://production-sfo.browserless.io/pdf?token=${BROWSERLESS_TOKEN}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    html: invoice_html,
                    options: {
                        format: 'A4',
                        printBackground: true,
                        margin: { top: '0', right: '0', bottom: '0', left: '0' },
                    },
                }),
            },
        );
        if (!browserlessRes.ok) {
            const msg = await browserlessRes.text();
            throw new Error(`Browserless error ${browserlessRes.status}: ${msg}`);
        }
        const pdfBytes = new Uint8Array(await browserlessRes.arrayBuffer());
        let binary = '';
        for (let i = 0; i < pdfBytes.length; i++) binary += String.fromCharCode(pdfBytes[i]);
        pdfBase64 = btoa(binary);
    } catch (err) {
        console.error('PDF generation failed:', err);
        return jsonError('PDF generation failed: ' + (err as Error).message, 502);
    }

    // ── 2. Send email via Resend ──────────────────────────────────────────────
    const htmlBody = (body_text || '')
        .split('\n')
        .map(line => line.trim() ? `<p style="margin:0 0 8px 0;font-family:Arial,sans-serif;font-size:15px;color:#111827;">${line}</p>` : '<p style="margin:0 0 8px 0;">&nbsp;</p>')
        .join('');

    try {
        const resendRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: RESEND_FROM,
                to: [to],
                subject,
                html: htmlBody,
                attachments: [{ filename, content: pdfBase64 }],
            }),
        });
        if (!resendRes.ok) {
            const msg = await resendRes.text();
            throw new Error(`Resend error ${resendRes.status}: ${msg}`);
        }
    } catch (err) {
        console.error('Email send failed:', err);
        return jsonError('Email send failed: ' + (err as Error).message, 502);
    }

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
