import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';

const markSentSchema = z.object({
  participantIds: z.array(z.string().uuid()).min(1).max(50),
});

/**
 * POST /api/webhooks/prompt-pack-sent
 *
 * Called by n8n after it successfully sends emails for participants
 * returned by /api/webhooks/prompt-pack-due. Marks those participants
 * as having received their prompt pack email.
 *
 * Auth: Bearer token must match N8N_WEBHOOK_SECRET.
 */
export async function POST(request: NextRequest) {
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
    const body = await request.json();
    const validation = markSentSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    const { participantIds } = validation.data;
    const supabase = await createServiceClient();

    const { error } = await supabase
      .from('participants')
      .update({ prompt_pack_emailed_at: new Date().toISOString() })
      .in('id', participantIds);

    if (error) {
      console.error('[prompt-pack-sent] Update error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to update participants' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Marked ${participantIds.length} participant(s) as emailed`,
    });
  } catch (error) {
    console.error('[prompt-pack-sent] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
