const BROWSERLESS_TOKEN = Deno.env.get('BROWSERLESS_TOKEN') ?? '';
const RESEND_API_KEY    = Deno.env.get('RESEND_API_KEY') ?? '';
const RESEND_FROM       = Deno.env.get('RESEND_FROM') ?? '';

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
