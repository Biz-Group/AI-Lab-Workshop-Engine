import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { verifySessionToken } from '@/lib/utils/session-token';
import { buildPromptPackData } from '@/lib/server/prompt-pack';

export const maxDuration = 10;
import {
  escapeHtml,
  formatPromptPackInstructionSections,
} from '@/lib/utils/prompt-pack';

const emailPromptPackSchema = z.object({
  sessionId: z.string().uuid(),
  participantId: z.string().uuid(),
  email: z.string().email('Please enter a valid email address'),
});

function renderPromptPackEmailHtml(
  participantName: string,
  promptPack: Awaited<ReturnType<typeof buildPromptPackData>>
) {
  // Group entries by module for chapter headers
  const moduleGroups: { moduleTitle: string; moduleObjective: string | null; entries: typeof promptPack.entries }[] = [];
  for (const entry of promptPack.entries) {
    const last = moduleGroups[moduleGroups.length - 1];
    if (last && last.moduleTitle === entry.moduleTitle) {
      last.entries.push(entry);
    } else {
      moduleGroups.push({ moduleTitle: entry.moduleTitle, moduleObjective: entry.moduleObjective, entries: [entry] });
    }
  }

  let stepCounter = 0;
  const modulesHTML = moduleGroups
    .map((group, groupIndex) => {
      const objectiveHtml = group.moduleObjective
        ? `<p style="font-size: 13px; color: #4b5563; font-style: italic; margin: 4px 0 0 0;">${escapeHtml(group.moduleObjective)}</p>`
        : '';

      const entriesHtml = group.entries
        .map((entry) => {
          stepCounter++;
          const instructionSections = formatPromptPackInstructionSections(entry.stepInstructions)
            .map(
              (section) => `
                <div style="margin-bottom: 10px;">
                  <div style="font-size: 12px; font-weight: 700; color: #111827; margin-bottom: 4px;">${escapeHtml(section.label)}</div>
                  <div style="font-size: 13px; color: #374151; white-space: pre-wrap;">${escapeHtml(section.content)}</div>
                </div>
              `
            )
            .join('');

          const promptBlocksHtml = entry.promptBlocks
            .map(
              (block) => `
                <div style="margin-bottom: 10px;">
                  <div style="font-size: 12px; font-weight: 700; color: #111827; margin-bottom: 4px;">${escapeHtml(block.title)}</div>
                  <div style="font-size: 13px; color: #374151; white-space: pre-wrap;">${escapeHtml(block.content)}</div>
                </div>
              `
            )
            .join('');

          const responseHtml = entry.participantResponse?.content
            ? escapeHtml(entry.participantResponse.content)
            : 'No saved text response for this step. The instructions and prompts above are included for reuse later.';

          const imageHtml = entry.participantResponse?.imageUrl
            ? `<p style="font-size: 12px; color: #6b7280; margin-top: 8px;">Image submission captured during session: ${escapeHtml(entry.participantResponse.imageUrl)}</p>`
            : '';

          return `
            <div style="background: #f9fafb; border: 1px solid #e5e5e5; border-radius: 8px; padding: 20px; margin-bottom: 16px;">
              <div style="font-size: 12px; color: #666; margin-bottom: 8px;">
                <span style="background: #2563eb; color: white; padding: 2px 8px; border-radius: 4px; font-weight: bold;">#${stepCounter}</span>
              </div>
              <h3 style="font-size: 16px; margin-bottom: 12px; color: #1a1a1a;">${escapeHtml(entry.stepTitle)}</h3>
              ${
                instructionSections
                  ? `<div style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; margin-bottom: 12px;">
                      <div style="font-size: 12px; font-weight: 700; color: #111827; margin-bottom: 8px;">Activity Instructions</div>
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
                <div style="font-size: 12px; font-weight: 700; color: #1e3a8a; margin-bottom: 8px;">Your Response</div>
                <div style="font-family: monospace; font-size: 13px; color: #1f2937; white-space: pre-wrap;">${responseHtml}</div>
                ${imageHtml}
              </div>
            </div>
          `;
        })
        .join('');

      return `
        <div style="margin-top: 24px; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid #2563eb;">
          <h2 style="font-size: 18px; color: #1e3a8a; margin: 0;">Chapter ${groupIndex + 1}: ${escapeHtml(group.moduleTitle)}</h2>
          ${objectiveHtml}
        </div>
        ${entriesHtml}
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
        <p style="color: #666;">From ${escapeHtml(promptPack.workshopName)}</p>
        <p style="color: #888; font-size: 14px;">${escapeHtml(promptPack.organizationName)}</p>
      </div>
      <p style="margin-bottom: 24px;">Hi ${escapeHtml(participantName)},</p>
      <p style="margin-bottom: 24px;">Thanks for attending the workshop. Here is your prompt pack with the activity instructions, prompt blocks, and your saved responses.</p>
      ${modulesHTML}
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
    const validation = emailPromptPackSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    const { sessionId, participantId, email } = validation.data;

    if (payload.session_id !== sessionId || payload.participant_id !== participantId) {
      return NextResponse.json(
        { success: false, error: 'Token mismatch' },
        { status: 403 }
      );
    }

    const supabase = await createServiceClient();

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

    if (!participant.feedback_submitted) {
      return NextResponse.json(
        { success: false, error: 'Please submit feedback before receiving your Prompt Pack' },
        { status: 403 }
      );
    }

    await supabase
      .from('participants')
      .update({ email })
      .eq('id', participantId);

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

    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      console.log('Email would be sent to:', email, 'for participant:', participantId);
      return NextResponse.json({
        success: true,
        message: 'Email queued (Resend not configured - development mode)',
      });
    }

    const promptPack = await buildPromptPackData(sessionId, participantId);
    const html = renderPromptPackEmailHtml(participant.display_name, promptPack);

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
