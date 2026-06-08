import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireParticipantSession } from '@/lib/server/participant-session';
import { getTrustedClientIp } from '@/lib/server/request-ip';
import { buildPromptPackData } from '@/lib/server/prompt-pack';
import { renderPromptPackPdf } from '@/lib/server/render-pdf';
import { checkRateLimit, rateLimitResponse } from '@/lib/utils/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 10;

const generatePDFSchema = z.object({
  sessionId: z.string().uuid(),
  participantId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = generatePDFSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    const { sessionId, participantId } = validation.data;
    const auth = await requireParticipantSession(request, { participantId, sessionId });
    if (auth.response) {
      return auth.response;
    }

    const ip = getTrustedClientIp(request);
    const rlByParticipant = await checkRateLimit(`pdf:participant:${auth.payload.participant_id}`, 5, 60_000);
    if (!rlByParticipant.allowed) return rateLimitResponse(rlByParticipant.resetAt);
    const rlByIp = await checkRateLimit(`pdf:ip:${ip}`, 60, 60_000);
    if (!rlByIp.allowed) return rateLimitResponse(rlByIp.resetAt);

    let promptPack;
    try {
      promptPack = await buildPromptPackData(
        auth.payload.session_id,
        auth.payload.participant_id
      );
    } catch (error) {
      console.error('Prompt pack data build error:', error);
      throw error;
    }

    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await renderPromptPackPdf(promptPack);
    } catch (error) {
      console.error('Prompt pack PDF render error:', error);
      throw error;
    }

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="prompt-pack-${auth.payload.participant_id.slice(0, 8)}.pdf"`,
      },
    });
  } catch (error) {
    console.error('PDF generation error:', error);
    return NextResponse.json(
      { success: false, error: 'Unable to export prompt pack PDF right now' },
      { status: 500 }
    );
  }
}
