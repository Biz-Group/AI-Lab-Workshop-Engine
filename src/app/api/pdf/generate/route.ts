import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifySessionToken } from '@/lib/utils/session-token';
import { buildPromptPackData } from '@/lib/server/prompt-pack';
import { renderPromptPackPdf } from '@/lib/server/render-pdf';

export const runtime = 'nodejs';
export const maxDuration = 10;

const generatePDFSchema = z.object({
  sessionId: z.string().uuid(),
  participantId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  try {
    let token =
      request.cookies.get('workshop_session_token')?.value ||
      request.cookies.get('session_token')?.value;

    if (!token) {
      const authHeader = request.headers.get('Authorization');
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.slice(7);
      }
    }

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Missing session token' },
        { status: 401 }
      );
    }

    const payload = await verifySessionToken(token);
    if (!payload) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validation = generatePDFSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    const { sessionId, participantId } = validation.data;

    if (payload.session_id !== sessionId || payload.participant_id !== participantId) {
      return NextResponse.json(
        { success: false, error: 'Token mismatch' },
        { status: 403 }
      );
    }

    let promptPack;
    try {
      promptPack = await buildPromptPackData(sessionId, participantId);
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
        'Content-Disposition': `attachment; filename="prompt-pack-${participantId.slice(0, 8)}.pdf"`,
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
