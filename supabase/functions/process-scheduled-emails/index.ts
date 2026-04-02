import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const CRON_SECRET               = Deno.env.get('CRON_SECRET') ?? '';
const BROWSERLESS_TOKEN         = Deno.env.get('BROWSERLESS_TOKEN') ?? '';
const RESEND_API_KEY            = Deno.env.get('RESEND_API_KEY') ?? '';
const RESEND_FROM               = Deno.env.get('RESEND_FROM') ?? '';

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization' } });
    }

    // Verify cron secret
    const auth = req.headers.get('Authorization') ?? '';
    if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch all due pending emails
    const { data: rows, error } = await sb
        .from('scheduled_emails')
        .select('*')
        .eq('status', 'pending')
        .lte('scheduled_for', new Date().toISOString());

    if (error) {
        console.error('Failed to fetch scheduled emails:', error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    if (!rows?.length) {
        return new Response(JSON.stringify({ ok: true, processed: 0 }), { headers: { 'Content-Type': 'application/json' } });
    }

    let sent = 0, failed = 0;

    for (const row of rows) {
        const sendErr = await sendEmail(row.to_address, row.subject, row.body_text, row.invoice_html, row.filename);

        if (sendErr) {
            await sb.from('scheduled_emails').update({ status: 'failed', error: sendErr }).eq('id', row.id);
            failed++;
            continue;
        }

        await sb.from('scheduled_emails').update({ status: 'sent', sent_at: new Date().toISOString(), error: null }).eq('id', row.id);
        sent++;

        // Mark invoice as issued if requested
        if (row.mark_issued && row.invoice_id) {
            await sb.from('invoices').update({ status: 'issued' }).eq('id', row.invoice_id).eq('status', 'draft');
        }
    }

    console.log(`Processed ${rows.length} scheduled emails: ${sent} sent, ${failed} failed`);
    return new Response(JSON.stringify({ ok: true, processed: rows.length, sent, failed }), {
        headers: { 'Content-Type': 'application/json' },
    });
});

async function sendEmail(
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
        return 'Email send failed: ' + (err as Error).message;
    }

    return null;
}
