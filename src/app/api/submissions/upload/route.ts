import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireParticipantSession } from '@/lib/server/participant-session';
import { checkRateLimit, rateLimitResponse } from '@/lib/utils/rate-limit';

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

// Magic byte signatures for each image type
const MAGIC_BYTES: Record<string, number[][]> = {
  'image/png': [[0x89, 0x50, 0x4E, 0x47]],
  'image/jpeg': [[0xFF, 0xD8, 0xFF]],
  'image/gif': [[0x47, 0x49, 0x46, 0x38]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]],
};

function verifyMagicBytes(buffer: ArrayBuffer, declaredType: string): boolean {
  const bytes = new Uint8Array(buffer);
  const signatures = MAGIC_BYTES[declaredType];
  if (!signatures) return false;

  return signatures.some((signature) =>
    signature.every((byte, index) => bytes[index] === byte)
  );
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const participantId = formData.get('participantId') as string | null;
    const sessionId = formData.get('sessionId') as string | null;
    const stepId = formData.get('stepId') as string | null;
    // Present only when replacing the file on an already-saved image (an
    // edit); absent for a brand-new image. See storagePath below.
    const submissionId = formData.get('submissionId') as string | null;

    if (!file || !participantId || !sessionId || !stepId) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: file, participantId, sessionId, stepId' },
        { status: 400 }
      );
    }

    const auth = await requireParticipantSession(request, { participantId, sessionId });
    if (auth.response) {
      return auth.response;
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: 'Invalid file type. Allowed: PNG, JPEG, GIF, WebP' },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { success: false, error: 'File too large. Maximum size is 5MB' },
        { status: 400 }
      );
    }

    const rl = await checkRateLimit(`upload:${participantId}`, 10, 60_000);
    if (!rl.allowed) return rateLimitResponse(rl.resetAt);

    const supabase = await createServiceClient();
    const [{ data: participant }, { data: step }] = await Promise.all([
      supabase
        .from('participants')
        .select('id')
        .eq('id', participantId)
        .eq('session_id', sessionId)
        .single(),
      supabase
        .from('session_snapshot_steps')
        .select('id')
        .eq('id', stepId)
        .eq('session_id', sessionId)
        .single(),
    ]);

    if (!participant) {
      return NextResponse.json(
        { success: false, error: 'Participant not found in session' },
        { status: 403 }
      );
    }

    if (!step) {
      return NextResponse.json(
        { success: false, error: 'Step not found in session' },
        { status: 400 }
      );
    }

    // Editing an existing image's file (not a brand-new upload) reuses that
    // row's own storage key, so the ownership check happens before touching
    // storage -- otherwise a forged submissionId could overwrite someone
    // else's object.
    if (submissionId) {
      const { data: existing } = await supabase
        .from('submissions')
        .select('id')
        .eq('id', submissionId)
        .eq('participant_id', participantId)
        .eq('session_id', sessionId)
        .eq('step_id', stepId)
        .single();

      if (!existing) {
        return NextResponse.json(
          { success: false, error: 'Submission not found' },
          { status: 404 }
        );
      }
    }

    const arrayBuffer = await file.arrayBuffer();
    if (!verifyMagicBytes(arrayBuffer, file.type)) {
      return NextResponse.json(
        { success: false, error: 'File content does not match declared type' },
        { status: 400 }
      );
    }

    const ext = file.type.split('/')[1] === 'jpeg' ? 'jpg' : file.type.split('/')[1];
    // A brand-new image gets its own random key so it can never collide with
    // (or overwrite) a sibling image for the same participant+step; editing
    // an existing image's file reuses that row's own id as the key so the
    // replacement lands on the same storage object instead of orphaning it.
    const storagePath = submissionId
      ? `${sessionId}/${participantId}/${stepId}/${submissionId}.${ext}`
      : `${sessionId}/${participantId}/${stepId}/${crypto.randomUUID()}.${ext}`;
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await supabase.storage
      .from('submission-images')
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: Boolean(submissionId),
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return NextResponse.json(
        { success: false, error: 'Failed to upload image' },
        { status: 500 }
      );
    }

    const { data: urlData } = supabase.storage
      .from('submission-images')
      .getPublicUrl(storagePath);

    return NextResponse.json({
      success: true,
      imageUrl: urlData.publicUrl,
    });
  } catch (error) {
    console.error('Image upload error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
