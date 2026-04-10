import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { verifySessionToken } from '@/lib/utils/session-token';
import { getJoinField } from '@/lib/utils/supabase-join';
import { buildPromptPackData } from '@/lib/server/prompt-pack';
import {
  escapeHtml as escapePromptPackHtml,
  formatPromptPackInstructionSections,
} from '@/lib/utils/prompt-pack';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const emailPromptPackSchema = z.object({
  sessionId: z.string().uuid(),
  participantId: z.string().uuid(),
  email: z.string().email('Please enter a valid email address'),
});

function renderPromptPackEmailHtml(participantName: string, promptPack: Awaited<ReturnType<typeof buildPromptPackData>>) {
  const promptsHTML = promptPack.entries
    .map((entry, index) => {
      const instructionSections = formatPromptPackInstructionSections(entry.stepInstructions)
        .map(
          (section) => `
            <div style="margin-bottom: 10px;">
              <div style="font-size: 12px; font-weight: 700; color: #111827; margin-bottom: 4px;">${escapePromptPackHtml(section.label)}</div>
              <div style="font-size: 13px; color: #374151; white-space: pre-wrap;">${escapePromptPackHtml(section.content)}</div>
            </div>
          `
        )
        .join('');

      const promptBlocksHtml = entry.promptBlocks
        .map(
          (block) => `
            <div style="margin-bottom: 10px;">
              <div style="font-size: 12px; font-weight: 700; color: #111827; margin-bottom: 4px;">${escapePromptPackHtml(block.title)}</div>
              <div style="font-size: 13px; color: #374151; white-space: pre-wrap;">${escapePromptPackHtml(block.content)}</div>
            </div>
          `
        )
        .join('');

      const responseHtml = entry.participantResponse?.content
        ? escapePromptPackHtml(entry.participantResponse.content)
        : 'No saved text response for this step. The workshop prompt is still included for reuse later.';

      const imageHtml = entry.participantResponse?.imageUrl
        ? `<p style="font-size: 12px; color: #6b7280; margin-top: 8px;">Image submission captured during session: ${escapePromptPackHtml(entry.participantResponse.imageUrl)}</p>`
        : '';

      return `
        <div style="background: #f9fafb; border: 1px solid #e5e5e5; border-radius: 8px; padding: 20px; margin-bottom: 16px;">
          <div style="font-size: 12px; color: #666; margin-bottom: 8px;">
            <span style="background: #2563eb; color: white; padding: 2px 8px; border-radius: 4px; font-weight: bold;">#${index + 1}</span>
            ${escapePromptPackHtml(entry.moduleTitle)}
          </div>
          <h3 style="font-size: 16px; margin-bottom: 12px; color: #1a1a1a;">${escapePromptPackHtml(entry.stepTitle)}</h3>
          ${
            instructionSections
              ? `<div style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; margin-bottom: 12px;">
                  <div style="font-size: 12px; font-weight: 700; color: #111827; margin-bottom: 8px;">Attendee Prompt</div>
                  ${instructionSections}
                </div>`
              : ''
          }
          ${
            promptBlocksHtml
              ? `<div style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; margin-bottom: 12px;">
                  <div style="font-size: 12px; font-weight: 700; color: #111827; margin-bottom: 8px;">Prompt Blocks</div>
                  ${promptBlocksHtml}
                </div>`
              : ''
          }
          <div style="background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 6px; padding: 12px;">
            <div style="font-size: 12px; font-weight: 700; color: #1e3a8a; margin-bottom: 8px;">Participant Response</div>
            <div style="font-family: monospace; font-size: 13px; color: #1f2937; white-space: pre-wrap;">${responseHtml}</div>
            ${imageHtml}
          </div>
        </div>
      `;
    })
    .join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.5; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="font-size: 24px; color: #6366f1; margin-bottom: 8px;">Your Prompt Pack</h1>
        <p style="color: #666;">From ${escapePromptPackHtml(promptPack.workshopName)}</p>
        <p style="color: #888; font-size: 14px;">${escapePromptPackHtml(promptPack.organizationName)}</p>
      </div>
      <p style="margin-bottom: 24px;">Hi ${escapePromptPackHtml(participantName)},</p>
      <p style="margin-bottom: 24px;">Thanks for attending the workshop. Here is your prompt pack with the workshop prompts, prompt blocks, and your saved responses.</p>
      ${promptsHTML}
      <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 32px 0;">
      <p style="font-size: 14px; color: #888; text-align: center;">
        You received this email because you requested your prompt pack.<br>
        Powered by Workshop Runner
      </p>
    </body>
    </html>
  `;
}

export async function POST(request: NextRequest) {
  try {
    // Verify session token from cookie or Authorization header
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

    // Validate request
    const body = await request.json();
    const validation = emailPromptPackSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    const { sessionId, participantId, email } = validation.data;

    // Verify token matches request
    if (payload.session_id !== sessionId || payload.participant_id !== participantId) {
      return NextResponse.json(
        { success: false, error: 'Token mismatch' },
        { status: 403 }
      );
    }

    const supabase = await createServiceClient();

    // Fetch participant
    const { data: participant, error: participantError } = await supabase
      .from('participants')
      .select('id, display_name, session_id, feedback_submitted')
      .eq('id', participantId)
      .eq('session_id', sessionId)
      .single();

    if (participantError || !participant) {
      return NextResponse.json(
        { success: false, error: 'Participant not found' },
        { status: 404 }
      );
    }

    // Check if feedback has been submitted
    if (!participant.feedback_submitted) {
      return NextResponse.json(
        { success: false, error: 'Please submit feedback before receiving your Prompt Pack' },
        { status: 403 }
      );
    }

    // Update participant with email (for leads)
    await supabase
      .from('participants')
      .update({ email })
      .eq('id', participantId);

    // Create lead record
    const { data: session } = await supabase
      .from('sessions')
      .select('organization_id')
      .eq('id', sessionId)
      .single();

    if (session?.organization_id) {
      await supabase.from('leads').upsert(
        {
          organization_id: session.organization_id,
          email,
          display_name: participant.display_name,
          session_id: sessionId,
        },
        { onConflict: 'organization_id,email' }
      );
    }

    // Check if Resend is configured
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      // Log that email would be sent (for development)
      console.log('Email would be sent to:', email, 'for participant:', participantId);
      
      return NextResponse.json({
        success: true,
        message: 'Email queued (Resend not configured - development mode)',
      });
    }

    const promptPack = await buildPromptPackData(sessionId, participantId);
    const html = renderPromptPackEmailHtml(participant.display_name, promptPack);

    const legacyEmailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'Workshop Runner <noreply@workshop.run>',
        to: [email],
        subject: `Your Prompt Pack from ${promptPack.workshopName}`,
        html,
      }),
    });

    if (!legacyEmailResponse.ok) {
      const errorData = await legacyEmailResponse.json();
      console.error('Resend API error:', errorData);
      return NextResponse.json(
        { success: false, error: 'Failed to send email' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Email sent successfully',
    });

    // Fetch prompts for email content
    const { data: modules } = await supabase
      .from('session_snapshot_modules')
      .select(`
        id,
        title,
        order_index,
        steps:session_snapshot_steps(
          id,
          title,
          order_index
        )
      `)
      .eq('session_id', sessionId)
      .order('order_index');

    const { data: submissions } = await supabase
      .from('submissions')
      .select('step_id, content')
      .eq('session_id', sessionId)
      .eq('participant_id', participantId);

    const submissionMap = new Map(
      (submissions || []).map((s) => [s.step_id, s.content])
    );

    // Build prompts HTML
    let promptsHTML = '';
    let promptNumber = 0;

    for (const module of modules || []) {
      for (const step of module.steps || []) {
        const finalPrompt = submissionMap.get(step.id);
        if (finalPrompt) {
          promptNumber++;
          promptsHTML += `
            <div style="background: #f9fafb; border: 1px solid #e5e5e5; border-radius: 8px; padding: 20px; margin-bottom: 16px;">
              <div style="font-size: 12px; color: #666; margin-bottom: 8px;">
                <span style="background: #6366f1; color: white; padding: 2px 8px; border-radius: 4px; font-weight: bold;">#${promptNumber}</span>
                ${escapeHtml(module.title)}
              </div>
              <h3 style="font-size: 16px; margin-bottom: 12px; color: #1a1a1a;">${escapeHtml(step.title)}</h3>
              <div style="background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 4px; padding: 12px; font-family: monospace; font-size: 14px; white-space: pre-wrap;">
                ${escapeHtml(finalPrompt)}
              </div>
            </div>
          `;
        }
      }
    }

    // Fetch session details for email
    const { data: sessionDetails } = await supabase
      .from('sessions')
      .select(`
        organization:organizations(name),
        workshop_template:workshop_templates(name)
      `)
      .eq('id', sessionId)
      .single();

    const workshopName = getJoinField(sessionDetails?.workshop_template, 'name') || 'Workshop';
    const orgName = getJoinField(sessionDetails?.organization, 'name') || 'Organization';

    // Send email via Resend
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'Workshop Runner <noreply@workshop.run>',
        to: [email],
        subject: `Your Prompt Pack from ${promptPack.workshopName}`,
        html,
      }),
    });

    if (!emailResponse.ok) {
      const errorData = await emailResponse.json();
      console.error('Resend API error:', errorData);
      return NextResponse.json(
        { success: false, error: 'Failed to send email' },
        { status: 500 }
      );
    }

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

export { renderPromptPackEmailHtml };
