import { NextRequest, NextResponse } from 'next/server';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { verifySessionToken } from '@/lib/utils/session-token';
import { getJoinField } from '@/lib/utils/supabase-join';
import { buildPromptPackData } from '@/lib/server/prompt-pack';
import { PromptPackDocument } from '@/components/pdf/PromptPackDocument';

export const runtime = 'nodejs';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const generatePDFSchema = z.object({
  sessionId: z.string().uuid(),
  participantId: z.string().uuid(),
});

// PDF document template as HTML string for simple generation
// In production, you'd use @react-pdf/renderer on the server
function generatePDFHTML(data: {
  participantName: string;
  workshopName: string;
  organizationName: string;
  completedAt: string;
  prompts: Array<{
    moduleTitle: string;
    stepTitle: string;
    userContent: string;
    finalPrompt: string;
  }>;
}): string {
  const promptsHTML = data.prompts
    .map(
      (prompt, index) => `
      <div class="prompt-block">
        <div class="prompt-header">
          <span class="prompt-number">#${index + 1}</span>
          <span class="prompt-module">${escapeHtml(prompt.moduleTitle)}</span>
        </div>
        <h3 class="prompt-title">${escapeHtml(prompt.stepTitle)}</h3>
        ${prompt.userContent ? `
          <div class="user-content">
            <strong>Your Input:</strong>
            <p>${escapeHtml(prompt.userContent)}</p>
          </div>
        ` : ''}
        <div class="final-prompt">
          <strong>Your Prompt:</strong>
          <div class="prompt-text">${escapeHtml(prompt.finalPrompt)}</div>
        </div>
      </div>
    `
    )
    .join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Prompt Pack - ${data.workshopName}</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          line-height: 1.5;
          color: #1a1a1a;
          padding: 40px;
          max-width: 800px;
          margin: 0 auto;
        }
        .header {
          text-align: center;
          margin-bottom: 40px;
          padding-bottom: 20px;
          border-bottom: 2px solid #e5e5e5;
        }
        .logo {
          font-size: 24px;
          font-weight: bold;
          color: #6366f1;
          margin-bottom: 10px;
        }
        h1 {
          font-size: 28px;
          margin-bottom: 8px;
        }
        .subtitle {
          color: #666;
          margin-bottom: 8px;
        }
        .meta {
          font-size: 14px;
          color: #888;
        }
        .prompt-block {
          background: #f9fafb;
          border: 1px solid #e5e5e5;
          border-radius: 8px;
          padding: 24px;
          margin-bottom: 20px;
          page-break-inside: avoid;
        }
        .prompt-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 10px;
        }
        .prompt-number {
          background: #6366f1;
          color: white;
          font-size: 12px;
          font-weight: bold;
          padding: 4px 8px;
          border-radius: 4px;
        }
        .prompt-module {
          font-size: 14px;
          color: #666;
        }
        .prompt-title {
          font-size: 18px;
          margin-bottom: 16px;
        }
        .user-content {
          background: white;
          border: 1px solid #e5e5e5;
          border-radius: 4px;
          padding: 12px;
          margin-bottom: 16px;
        }
        .user-content strong {
          display: block;
          font-size: 12px;
          color: #666;
          margin-bottom: 4px;
        }
        .user-content p {
          color: #333;
        }
        .final-prompt {
          background: #eef2ff;
          border: 1px solid #c7d2fe;
          border-radius: 4px;
          padding: 12px;
        }
        .final-prompt strong {
          display: block;
          font-size: 12px;
          color: #4338ca;
          margin-bottom: 4px;
        }
        .prompt-text {
          font-family: monospace;
          font-size: 14px;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .footer {
          margin-top: 40px;
          padding-top: 20px;
          border-top: 2px solid #e5e5e5;
          text-align: center;
          font-size: 14px;
          color: #888;
        }
        @media print {
          body {
            padding: 20px;
          }
          .prompt-block {
            break-inside: avoid;
          }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo">Workshop Runner</div>
        <h1>${escapeHtml(data.workshopName)}</h1>
        <div class="subtitle">Prompt Pack for ${escapeHtml(data.participantName)}</div>
        <div class="meta">${escapeHtml(data.organizationName)} • Completed ${escapeHtml(data.completedAt)}</div>
      </div>
      
      ${promptsHTML}
      
      <div class="footer">
        <p>Generated by Workshop Runner • ${new Date().toLocaleDateString()}</p>
      </div>
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
    const validation = generatePDFSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    const { sessionId, participantId } = validation.data;

    // Verify token matches request
    if (payload.session_id !== sessionId || payload.participant_id !== participantId) {
      return NextResponse.json(
        { success: false, error: 'Token mismatch' },
        { status: 403 }
      );
    }

    const promptPack = await buildPromptPackData(sessionId, participantId);
    const pdfBuffer = await renderToBuffer(
      React.createElement(PromptPackDocument, { data: promptPack }) as React.ReactElement
    );

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="prompt-pack-${participantId.slice(0, 8)}.pdf"`,
      },
    });
  } catch (error) {
    console.error('PDF generation error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate PDF' },
      { status: 500 }
    );
  }
}
