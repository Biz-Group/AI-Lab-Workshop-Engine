/**
 * n8n Webhook integration for sending prompt pack emails.
 * Sends PDF attachment + metadata to n8n Cloud, which handles email delivery.
 */

interface SendPromptPackPayload {
  to: string;
  participantName: string;
  workshopName: string;
  organizationName: string;
  pdfBase64: string;
  filename: string;
}

export async function sendPromptPackViaWebhook(
  payload: SendPromptPackPayload
): Promise<{ success: boolean; error?: string }> {
  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  const webhookSecret = process.env.N8N_WEBHOOK_SECRET;

  if (!webhookUrl) {
    console.warn('[n8n] N8N_WEBHOOK_URL not configured — skipping email send');
    return { success: false, error: 'N8N_WEBHOOK_URL not configured' };
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (webhookSecret) {
    headers['Authorization'] = `Bearer ${webhookSecret}`;
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      to: payload.to,
      participantName: payload.participantName,
      workshopName: payload.workshopName,
      organizationName: payload.organizationName,
      pdfBase64: payload.pdfBase64,
      filename: payload.filename,
      subject: `Your Prompt Pack from ${payload.workshopName}`,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => 'Unknown error');
    console.error(`[n8n] Webhook failed (${response.status}):`, text);
    return { success: false, error: `n8n webhook returned ${response.status}` };
  }

  return { success: true };
}
