import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { buildPromptPackData } from '@/lib/server/prompt-pack';
import { renderPromptPackPdf } from '@/lib/server/render-pdf';

export const maxDuration = 60;

/**
 * GET /api/webhooks/prompt-pack-due
 *
 * Called by n8n Schedule trigger (every 5 min) to find participants
 * who submitted feedback 90+ minutes ago but haven't received their
 * prompt pack email yet. Returns up to 10 items with PDF base64.
 *
 * Auth: Bearer token must match N8N_WEBHOOK_SECRET.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { success: false, error: 'Webhook secret not configured' },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get('Authorization');
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const supabase = await createServiceClient();

    // 90 minutes ago
    const cutoff = new Date(Date.now() - 90 * 60 * 1000).toISOString();

    // Find participants with feedback submitted 90+ min ago, not yet emailed
    const { data: feedbackRecords, error: feedbackError } = await supabase
      .from('feedback')
      .select('participant_id, session_id, submitted_at')
      .lte('submitted_at', cutoff)
      .limit(50);

    if (feedbackError) {
      console.error('[prompt-pack-due] Feedback query error:', feedbackError);
      return NextResponse.json(
        { success: false, error: 'Database query failed' },
        { status: 500 }
      );
    }

    if (!feedbackRecords || feedbackRecords.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // Get matching participants who have email, consent, and haven't been emailed yet
    const participantIds = feedbackRecords.map((f) => f.participant_id);

    const { data: participants, error: participantsError } = await supabase
      .from('participants')
      .select('id, display_name, email, session_id')
      .in('id', participantIds)
      .eq('feedback_submitted', true)
      .eq('email_consent', true)
      .is('prompt_pack_emailed_at', null)
      .not('email', 'is', null)
      .limit(10);

    if (participantsError) {
      console.error('[prompt-pack-due] Participants query error:', participantsError);
      return NextResponse.json(
        { success: false, error: 'Database query failed' },
        { status: 500 }
      );
    }

    if (!participants || participants.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // For each participant, generate PDF and build payload
    const results = [];
    for (const participant of participants) {
      try {
        const promptPack = await buildPromptPackData(
          participant.session_id,
          participant.id
        );

        const pdfBuffer = await renderPromptPackPdf(promptPack);
        const pdfBase64 = Buffer.from(pdfBuffer).toString('base64');
        const filename = `prompt-pack-${participant.display_name.toLowerCase().replace(/\s+/g, '-')}.pdf`;

        results.push({
          participantId: participant.id,
          email: participant.email!,
          participantName: participant.display_name,
          workshopName: promptPack.workshopName,
          organizationName: promptPack.organizationName,
          pdfBase64,
          filename,
          subject: `Your Prompt Pack from ${promptPack.workshopName}`,
        });
      } catch (err) {
        console.error(`[prompt-pack-due] Failed to build PDF for participant ${participant.id}:`, err);
        // Skip this participant, they'll be retried next cycle
      }
    }

    return NextResponse.json({ success: true, data: results });
  } catch (error) {
    console.error('[prompt-pack-due] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
