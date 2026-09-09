import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { createClient as createServerClient, createServiceClient } from '@/lib/supabase/server';

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB, matches the step-reference-images bucket limit

// Magic byte signatures for each image type -- mirrors
// src/app/api/submissions/upload/route.ts so both upload paths agree on what
// "really is an image" means, independent of the client-declared MIME type.
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

/**
 * Facilitator-side upload for a step's reference/target image (see
 * supabase/migrations/029_step_reference_image.sql). Distinct from
 * /api/submissions/upload: this is called from the admin template editor by
 * an authenticated facilitator, not a participant, and it has no session or
 * step row to check against -- only the template the step belongs to (which
 * may not exist yet while a step is still being created).
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const templateId = formData.get('templateId') as string | null;

    if (!file || !templateId) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: file, templateId' },
        { status: 400 }
      );
    }

    const serviceClient = await createServiceClient();

    // Verify the facilitator owns the template's organization -- same
    // organization -> facilitator_users join used by the template routes.
    const { data: access } = await serviceClient
      .from('workshop_templates')
      .select(`
        id,
        organization:organizations!inner(
          id,
          facilitator_users!inner(user_id)
        )
      `)
      .eq('id', templateId)
      .eq('organization.facilitator_users.user_id', user.id)
      .single();

    if (!access) {
      return NextResponse.json({ success: false, error: 'Template not found or access denied' }, { status: 404 });
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

    const arrayBuffer = await file.arrayBuffer();
    if (!verifyMagicBytes(arrayBuffer, file.type)) {
      return NextResponse.json(
        { success: false, error: 'File content does not match declared type' },
        { status: 400 }
      );
    }

    const ext = file.type.split('/')[1] === 'jpeg' ? 'jpg' : file.type.split('/')[1];
    const storagePath = `${templateId}/${randomUUID()}.${ext}`;
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await serviceClient.storage
      .from('step-reference-images')
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error('Reference image storage upload error:', uploadError);
      return NextResponse.json(
        { success: false, error: 'Failed to upload image' },
        { status: 500 }
      );
    }

    const { data: urlData } = serviceClient.storage
      .from('step-reference-images')
      .getPublicUrl(storagePath);

    return NextResponse.json({
      success: true,
      imageUrl: urlData.publicUrl,
    });
  } catch (error) {
    console.error('Reference image upload error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
