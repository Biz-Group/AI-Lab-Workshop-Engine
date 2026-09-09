import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * The gallery flag has to survive every path that writes a step row. These are
 * the two that silently dropped columns before: step creation validated
 * show_response_field but never inserted it, and the session snapshot copy is
 * the only thing participants and the wall actually read.
 */

const createServerClientMock = vi.fn();
const createServiceClientMock = vi.fn();
const syncModuleToLibraryMock = vi.fn();
const revalidatePathMock = vi.fn();
const generateJoinCodeMock = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: createServerClientMock,
  createServiceClient: createServiceClientMock,
}));

vi.mock('@/lib/utils/library-sync', () => ({
  syncModuleToLibrary: syncModuleToLibraryMock,
  getModuleIdFromStep: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock('@/lib/utils', async () => {
  const actual = await vi.importActual<typeof import('@/lib/utils')>('@/lib/utils');
  return { ...actual, generateJoinCode: generateJoinCodeMock };
});

const USER = { id: 'user-1' };

function authedServerClient() {
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user: USER }, error: null })) },
  };
}

/** Chainable query builder that resolves to a fixed payload. */
function builderFor(result: { data?: unknown; error?: unknown; count?: number }) {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'in', 'order', 'limit', 'not', 'neq', 'ilike', 'update', 'delete']) {
    builder[method] = vi.fn(() => builder);
  }
  builder.single = vi.fn(async () => ({ data: result.data ?? null, error: result.error ?? null }));
  builder.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({
      data: result.data ?? null,
      error: result.error ?? null,
      count: result.count,
    }).then(resolve);
  return builder;
}

describe('gallery step flag plumbing', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    syncModuleToLibraryMock.mockResolvedValue(undefined);
    generateJoinCodeMock.mockReturnValue('AB23');
  });

  describe('POST /api/admin/steps', () => {
    async function postStep(body: Record<string, unknown>) {
      const insertMock = vi.fn((_payload: Record<string, unknown>) => ({
        select: vi.fn(() => ({
          single: vi.fn(async () => ({
            data: { id: 'step-1', title: 'A step', order_index: 0 },
            error: null,
          })),
        })),
      }));

      createServerClientMock.mockResolvedValue(authedServerClient());
      createServiceClientMock.mockResolvedValue({
        from: vi.fn((table: string) => {
          if (table === 'module_steps') {
            return { ...builderFor({ count: 0 }), insert: insertMock };
          }
          // modules: access check, then the org lookup for library sync
          return builderFor({
            data: { id: 'module-1', template: { organization_id: 'org-1' } },
          });
        }),
      });

      const { POST } = await import('@/app/api/admin/steps/route');
      const res = await POST(
        new NextRequest('http://localhost/api/admin/steps', {
          method: 'POST',
          body: JSON.stringify({
            module_id: '11111111-1111-1111-1111-111111111111',
            title: 'A step',
            ...body,
          }),
        })
      );

      return { res, insertMock };
    }

    it('persists is_gallery_step on creation', async () => {
      const { res, insertMock } = await postStep({ is_gallery_step: true });

      expect(res.status).toBe(200);
      expect(insertMock).toHaveBeenCalledTimes(1);
      expect(insertMock.mock.calls[0][0]).toMatchObject({ is_gallery_step: true });
    });

    it('persists show_response_field on creation', async () => {
      // Regression guard: this flag was validated by the schema and then
      // dropped from the insert, so it could only ever be set via PATCH.
      const { insertMock } = await postStep({ show_response_field: false });

      expect(insertMock.mock.calls[0][0]).toMatchObject({ show_response_field: false });
    });

    it('defaults a new step to a guided (non-gallery) step', async () => {
      const { insertMock } = await postStep({});

      expect(insertMock.mock.calls[0][0]).toMatchObject({
        is_gallery_step: false,
        show_response_field: true,
      });
    });
  });

  describe('POST /api/admin/sessions snapshot copy', () => {
    it('carries is_gallery_step into session_snapshot_steps', async () => {
      const snapshotStepInsert = vi.fn((_rows: Array<Record<string, unknown>>) => ({
        select: vi.fn(async () => ({
          data: [{ id: 'snap-step-1', original_step_id: 'step-1' }],
          error: null,
        })),
      }));

      createServerClientMock.mockResolvedValue(authedServerClient());
      createServiceClientMock.mockResolvedValue({
        from: vi.fn((table: string) => {
          switch (table) {
            case 'facilitator_users':
              return builderFor({ data: { id: 'fac-1', organization_id: 'org-1' } });
            case 'workshop_templates':
              return builderFor({
                data: {
                  id: 'tpl-1',
                  name: 'Template',
                  ai_tool_name: 'ChatGPT',
                  ai_tool_url: 'https://chat.openai.com',
                },
              });
            case 'sessions':
              return {
                ...builderFor({ data: { id: 'session-1' } }),
                insert: vi.fn(() => ({
                  select: vi.fn(() => ({
                    single: vi.fn(async () => ({ data: { id: 'session-1' }, error: null })),
                  })),
                })),
                update: vi.fn(() => builderFor({ data: null })),
              };
            case 'modules':
              return builderFor({
                data: [{ id: 'module-1', title: 'M', objective: null, order_index: 0 }],
              });
            case 'module_steps':
              return builderFor({
                data: [
                  {
                    id: 'step-1',
                    module_id: 'module-1',
                    title: 'Gallery activity',
                    instruction_markdown: 'Objective: make an image',
                    order_index: 0,
                    estimated_minutes: 5,
                    is_required: true,
                    show_response_field: true,
                    is_gallery_step: true,
                    ai_tool_name: null,
                    ai_tool_url: null,
                  },
                ],
              });
            case 'prompt_blocks':
              return builderFor({ data: [] });
            case 'session_snapshot_modules':
              return {
                insert: vi.fn(() => ({
                  select: vi.fn(async () => ({
                    data: [{ id: 'snap-mod-1', original_module_id: 'module-1' }],
                    error: null,
                  })),
                })),
              };
            case 'session_snapshot_steps':
              // Both the snapshot insert and the follow-up read that picks the
              // first step for sessions.current_step_id.
              return {
                ...builderFor({ data: { id: 'snap-step-1' } }),
                insert: snapshotStepInsert,
              };
            default:
              return builderFor({ data: [] });
          }
        }),
      });

      const { POST } = await import('@/app/api/admin/sessions/route');
      const res = await POST(
        new NextRequest('http://localhost/api/admin/sessions', {
          method: 'POST',
          body: JSON.stringify({
            template_id: '11111111-1111-1111-1111-111111111111',
            client_name: 'Acme',
            location: 'Dubai',
            poc_name: 'Sam',
            poc_email: 'sam@example.com',
            event_type: 'halfday',
            event_date: new Date().toISOString(),
          }),
        })
      );

      expect(res.status).toBe(200);
      expect(snapshotStepInsert).toHaveBeenCalledTimes(1);

      const inserted = snapshotStepInsert.mock.calls[0][0];
      expect(inserted).toHaveLength(1);
      expect(inserted[0]).toMatchObject({
        original_step_id: 'step-1',
        is_gallery_step: true,
        show_response_field: true,
      });
    });
  });
});
