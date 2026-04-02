import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendEmail } from '../_shared/sendEmail.ts';

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const CRON_SECRET               = Deno.env.get('CRON_SECRET') ?? '';

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
