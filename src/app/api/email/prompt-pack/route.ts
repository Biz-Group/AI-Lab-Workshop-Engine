import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { requireParticipantSession } from '@/lib/server/participant-session';
import { buildPromptPackData } from '@/lib/server/prompt-pack';
import { renderPromptPackPdf } from '@/lib/server/render-pdf';
import { sendPromptPackViaWebhook } from '@/lib/server/n8n';

export const maxDuration = 10;

const emailPromptPackSchema = z.object({
  sessionId: z.string().uuid(),
  participantId: z.string().uuid(),
  email: z.string().email('Please enter a valid email address'),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = emailPromptPackSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    const { sessionId, participantId, email } = validation.data;
    const auth = await requireParticipantSession(request, { participantId, sessionId });
    if (auth.response) {
      return auth.response;
    }

    const supabase = await createServiceClient();
    const authenticatedParticipantId = auth.payload.participant_id;
    const authenticatedSessionId = auth.payload.session_id;

    const { data: participant, error: participantError } = await supabase
      .from('participants')
      .select('id, display_name, session_id, feedback_submitted')
      .eq('id', authenticatedParticipantId)
      .eq('session_id', authenticatedSessionId)
      .single();

    if (participantError || !participant) {
      return NextResponse.json(
        { success: false, error: 'Participant not found' },
        { status: 404 }
      );
    }

    if (!participant.feedback_submitted) {
      return NextResponse.json(
        { success: false, error: 'Please submit feedback before receiving your Prompt Pack' },
        { status: 403 }
      );
    }

    // Update participant email
    await supabase
      .from('participants')
      .update({ email })
      .eq('id', authenticatedParticipantId)
      .eq('session_id', authenticatedSessionId);

    // Upsert lead record
    const { data: session } = await supabase
      .from('sessions')
      .select('organization_id')
      .eq('id', authenticatedSessionId)
      .single();

    if (session?.organization_id) {
      await supabase.from('leads').upsert(
        {
          organization_id: session.organization_id,
          email,
          display_name: participant.display_name,
          session_id: authenticatedSessionId,
        },
        { onConflict: 'organization_id,email' }
      );
    }

    // Build prompt pack and generate PDF
    const promptPack = await buildPromptPackData(
      authenticatedSessionId,
      authenticatedParticipantId
    );

    const pdfBuffer = await renderPromptPackPdf(promptPack);
    const pdfBase64 = Buffer.from(pdfBuffer).toString('base64');
    const filename = `prompt-pack-${participant.display_name.toLowerCase().replace(/\s+/g, '-')}.pdf`;

    // Send via n8n webhook
    const result = await sendPromptPackViaWebhook({
      to: email,
      participantName: participant.display_name,
      workshopName: promptPack.workshopName,
      organizationName: promptPack.organizationName,
      pdfBase64,
      filename,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || 'Failed to send email via webhook' },
        { status: 502 }
      );
    }

    // Mark as emailed (prevents duplicate from delayed send)
    await supabase
      .from('participants')
      .update({ prompt_pack_emailed_at: new Date().toISOString() })
      .eq('id', authenticatedParticipantId)
      .eq('session_id', authenticatedSessionId);

    return NextResponse.json({
      success: true,
      message: 'Email sent successfully',
    });
  } catch (error) {
    console.error('Email prompt pack error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to send email' },
      { status: 500 }
    );
  }
}
