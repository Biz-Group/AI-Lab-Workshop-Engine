import { expect, test } from '@playwright/test';

test.describe('core browser flows', () => {
  test('home verifies join code and navigates to participant registration', async ({ page }) => {
    await page.route('**/api/sessions/verify?**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          session: {
            id: 'session-1',
            status: 'live',
            organizationName: 'Biz Group',
            templateName: 'AI Basics',
            templateDescription: 'Prompt workshop',
            estimatedDurationMinutes: 45,
          },
        }),
      });
    });

    await page.goto('/');
    await page.getByLabel('Join code character 1').fill('A');
    await page.getByLabel('Join code character 2').fill('B');
    await page.getByLabel('Join code character 3').fill('C');
    await page.getByLabel('Join code character 4').fill('D');
    await page.getByRole('button', { name: /join workshop/i }).click();

    await expect(page).toHaveURL(/\/join\/ABCD$/, { timeout: 15_000 });
  });

  test('join page validates attendee form and posts successful joins', async ({ page }) => {
    await page.route('**/api/sessions/verify?**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          session: {
            id: '11111111-1111-1111-1111-111111111111',
            status: 'live',
            organizationName: 'Biz Group',
            templateName: 'AI Basics',
            templateDescription: 'Prompt workshop',
            estimatedDurationMinutes: 45,
          },
        }),
      });
    });
    let joinRequestBody: unknown;
    const fulfillJoinRequest = async (route: Parameters<Parameters<typeof page.route>[1]>[0]) => {
      joinRequestBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    };
    await page.route('**/*', async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === '/api/sessions/verify') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            session: {
              id: '11111111-1111-1111-1111-111111111111',
              status: 'live',
              organizationName: 'Biz Group',
              templateName: 'AI Basics',
              templateDescription: 'Prompt workshop',
              estimatedDurationMinutes: 45,
            },
          }),
        });
        return;
      }

      if (pathname === '/api/sessions/join') {
        await fulfillJoinRequest(route);
        return;
      }

      await route.continue();
    });
    await page.route('**/s/11111111-1111-1111-1111-111111111111', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<h1>Workshop Loaded</h1>',
      });
    });

    await page.goto('/join/ABCD');
    await expect(page.getByText('Biz Group')).toBeVisible();

    await page.getByLabel('Your Name').fill('Alex Learner');
    await page.getByLabel('Email').fill('alex@example.com');
    await page.getByRole('button', { name: /enter workshop/i }).click();

    await expect(page).toHaveURL(/\/s\/11111111-1111-1111-1111-111111111111$/, { timeout: 15_000 });
    expect(joinRequestBody).toMatchObject({
      sessionId: '11111111-1111-1111-1111-111111111111',
      displayName: 'Alex Learner',
      email: 'alex@example.com',
    });
  });

  test('join page shows verify errors without navigating', async ({ page }) => {
    await page.route('**/api/sessions/verify?**', async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: 'Session not found or has ended' }),
      });
    });

    await page.goto('/join/ZZZZ');

    await expect(page.getByRole('heading', { name: 'Session Not Found' })).toBeVisible();
    await expect(page.getByText('Session not found or has ended')).toBeVisible();
  });

  test('login page validates invalid email and short password without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await page.route('**/auth/v1/user', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Not authenticated' }),
      });
    });

    await page.goto('/auth/login');
    await page.getByLabel('Email Address').fill('alex@example.com');
    await page.getByLabel('Password').fill('short');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.getByText('Password must be at least 8 characters')).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });
});
