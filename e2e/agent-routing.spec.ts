import { test, expect, type Page } from '@playwright/test';

/**
 * Live agent routing checks (Playwright / Chromium).
 *
 * Required for the chat describe block:
 *   E2E_LOGIN_EMAIL, E2E_LOGIN_PASSWORD, E2E_WORKSPACE_ID, E2E_FITNESS_BUBBLE_ID
 *
 * Optional:
 *   E2E_RECIPES_WORKSPACE_ID, E2E_RECIPES_BUBBLE_ID — Recipes vs Fitness Coach scoping
 *   E2E_DM_BUBBLE_ID — 1:1 bubble with no coach binding (expects no typing indicator on "hi")
 *   E2E_ORGANIZER_BUBBLE_ID — bubble where Organizer is bound (same workspace or override WS)
 *   PLAYWRIGHT_BASE_URL — defaults to http://127.0.0.1:3000
 *   E2E_SKIP_AGENT_REPLY=1 — skip waits for LLM/agent rows after the typing indicator
 *   E2E_TASK_MODAL_URL — full URL with task modal already showing comments (saved deep link)
 */

const chatEnvReady = () =>
  Boolean(
    process.env.E2E_LOGIN_EMAIL?.trim() &&
    process.env.E2E_LOGIN_PASSWORD?.trim() &&
    process.env.E2E_WORKSPACE_ID?.trim() &&
    process.env.E2E_FITNESS_BUBBLE_ID?.trim(),
  );

async function signIn(page: Page) {
  const email = process.env.E2E_LOGIN_EMAIL!.trim();
  const password = process.env.E2E_LOGIN_PASSWORD!.trim();
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/app\//, { timeout: 60_000 });
}

async function openFitnessBubbleChat(page: Page) {
  const ws = process.env.E2E_WORKSPACE_ID!.trim();
  const bubbleId = process.env.E2E_FITNESS_BUBBLE_ID!.trim();
  await page.goto(`/app/${ws}`);
  await page.locator(`[data-bubble-id="${bubbleId}"]`).click();
  await expect(page.locator('[data-testid="chat-composer-rail"]')).toBeVisible();
}

function railInput(page: Page) {
  return page.locator('[data-testid="chat-composer-rail"] input[type="text"]');
}

function railSubmit(page: Page) {
  return page.locator('[data-testid="chat-composer-rail"] button[type="submit"]');
}

test.describe('Agent routing — main chat', () => {
  test.skip(
    !chatEnvReady(),
    'Set E2E_LOGIN_EMAIL, E2E_LOGIN_PASSWORD, E2E_WORKSPACE_ID, E2E_FITNESS_BUBBLE_ID',
  );

  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('Fitness bubble: @Buddy hi → Buddy typing indicator with image avatar', async ({ page }) => {
    await openFitnessBubbleChat(page);
    await railInput(page).fill('@Buddy hi');
    await railSubmit(page).click();
    const ind = page.getByTestId('agent-typing-indicator');
    await expect(ind).toBeVisible();
    await expect(ind).toHaveAttribute('data-pending-slug', 'buddy');
    await expect(ind.locator('img')).toBeVisible();
    if (!process.env.E2E_SKIP_AGENT_REPLY) {
      await expect(ind).toBeHidden({ timeout: 120_000 });
    }
  });

  test('Fitness bubble: plain hi → Coach typing indicator', async ({ page }) => {
    await openFitnessBubbleChat(page);
    await railInput(page).fill('hi');
    await railSubmit(page).click();
    const ind = page.getByTestId('agent-typing-indicator');
    await expect(ind).toBeVisible();
    await expect(ind).toHaveAttribute('data-pending-slug', 'coach');
    if (!process.env.E2E_SKIP_AGENT_REPLY) {
      await expect(ind).toBeHidden({ timeout: 120_000 });
    }
  });

  test('@Buddy @Coach hi → Buddy wins (first mention)', async ({ page }) => {
    await openFitnessBubbleChat(page);
    await railInput(page).fill('@Buddy @Coach hi');
    await railSubmit(page).click();
    await expect(page.getByTestId('agent-typing-indicator')).toHaveAttribute(
      'data-pending-slug',
      'buddy',
    );
  });

  test('email me at foo@coach.com → no mention match, no typing indicator', async ({ page }) => {
    await openFitnessBubbleChat(page);
    await railInput(page).fill('email me at foo@coach.com');
    await railSubmit(page).click();
    await expect(page.getByTestId('agent-typing-indicator')).toHaveCount(0);
  });

  test('Recipes workspace: @Coach resolves to Recipes coach only (context-scoped)', async ({
    page,
  }) => {
    const ws = process.env.E2E_RECIPES_WORKSPACE_ID?.trim();
    const bubbleId = process.env.E2E_RECIPES_BUBBLE_ID?.trim();
    test.skip(!ws || !bubbleId, 'Set E2E_RECIPES_WORKSPACE_ID and E2E_RECIPES_BUBBLE_ID');
    await page.goto(`/app/${ws}`);
    await page.locator(`[data-bubble-id="${bubbleId}"]`).click();
    await expect(page.locator('[data-testid="chat-composer-rail"]')).toBeVisible();
    await railInput(page).fill('@Coach hi');
    await railSubmit(page).click();
    await expect(page.getByTestId('agent-typing-indicator')).toHaveAttribute(
      'data-pending-slug',
      'coach',
    );
    if (!process.env.E2E_SKIP_AGENT_REPLY) {
      await expect(page.getByTestId('agent-typing-indicator')).toBeHidden({ timeout: 120_000 });
    }
  });

  test('Organizer bubble: @Organizer hi → Organizer typing slug', async ({ page }) => {
    const ws =
      process.env.E2E_ORGANIZER_WORKSPACE_ID?.trim() ?? process.env.E2E_WORKSPACE_ID!.trim();
    const bubbleId = process.env.E2E_ORGANIZER_BUBBLE_ID?.trim();
    test.skip(!bubbleId, 'Set E2E_ORGANIZER_BUBBLE_ID (bubble with Organizer binding)');
    await page.goto(`/app/${ws}`);
    await page.locator(`[data-bubble-id="${bubbleId}"]`).click();
    await railInput(page).fill('@Organizer hi');
    await railSubmit(page).click();
    await expect(page.getByTestId('agent-typing-indicator')).toHaveAttribute(
      'data-pending-slug',
      'organizer',
    );
  });

  test('Organizer bubble: @Organizer when can we meet tomorrow → meeting-scoped reply with Organizer avatar', async ({
    page,
  }) => {
    const ws =
      process.env.E2E_ORGANIZER_WORKSPACE_ID?.trim() ?? process.env.E2E_WORKSPACE_ID!.trim();
    const bubbleId = process.env.E2E_ORGANIZER_BUBBLE_ID?.trim();
    test.skip(!bubbleId, 'Set E2E_ORGANIZER_BUBBLE_ID (bubble with Organizer binding)');
    await page.goto(`/app/${ws}`);
    await page.locator(`[data-bubble-id="${bubbleId}"]`).click();
    await railInput(page).fill('@Organizer when can we meet tomorrow');
    await railSubmit(page).click();

    // Typing indicator must be Organizer, with a non-empty image source (NOT the Buddy mark
    // post-Phase-4 asset swap).
    const ind = page.getByTestId('agent-typing-indicator');
    await expect(ind).toBeVisible();
    await expect(ind).toHaveAttribute('data-pending-slug', 'organizer');
    const img = ind.locator('img');
    await expect(img).toBeVisible();

    if (!process.env.E2E_SKIP_AGENT_REPLY) {
      // Organizer replies in meeting vocabulary. Assert on any of the meeting-scoped tokens so
      // this stays robust against model tone drift.
      await expect(ind).toBeHidden({ timeout: 120_000 });
      const lastAgentBubble = page.getByTestId('chat-message').last();
      await expect(lastAgentBubble).toContainText(
        /meet|meeting|schedule|availability|agenda/i,
      );
    }
  });

  test('DM bubble: hi → no typing indicator when default coach is unavailable', async ({
    page,
  }) => {
    const bubbleId = process.env.E2E_DM_BUBBLE_ID?.trim();
    test.skip(!bubbleId, 'Set E2E_DM_BUBBLE_ID (1:1 bubble without coach binding)');
    await page.goto(`/app/${process.env.E2E_WORKSPACE_ID!.trim()}`);
    await page.locator(`[data-bubble-id="${bubbleId}"]`).click();
    await railInput(page).fill('hi');
    await railSubmit(page).click();
    await expect(page.getByTestId('agent-typing-indicator')).toHaveCount(0);
  });

  test('thread view: @Buddy hi arms Buddy indicator in thread composer flow', async ({ page }) => {
    await openFitnessBubbleChat(page);
    await railInput(page).fill('thread anchor e2e');
    await railSubmit(page).click();
    const row = page.getByText('thread anchor e2e', { exact: false }).first();
    await row.hover();
    await page.getByRole('button', { name: 'Reply in thread' }).first().click();
    await expect(page.locator('[data-testid="chat-composer-thread"]')).toBeVisible();
    const threadInput = page.locator('[data-testid="chat-composer-thread"] input[type="text"]');
    await threadInput.fill('@Buddy hi');
    await page.locator('[data-testid="chat-composer-thread"] button[type="submit"]').click();
    await expect(page.getByTestId('agent-typing-indicator').last()).toHaveAttribute(
      'data-pending-slug',
      'buddy',
    );
  });

  test('thread view: plain hi → Coach typing (default), not Buddy', async ({ page }) => {
    await openFitnessBubbleChat(page);
    await railInput(page).fill('thread anchor coach e2e');
    await railSubmit(page).click();
    await page.getByText('thread anchor coach e2e', { exact: false }).first().hover();
    await page.getByRole('button', { name: 'Reply in thread' }).first().click();
    const threadInput = page.locator('[data-testid="chat-composer-thread"] input[type="text"]');
    await threadInput.fill('hi');
    await page.locator('[data-testid="chat-composer-thread"] button[type="submit"]').click();
    await expect(page.getByTestId('agent-typing-indicator').last()).toHaveAttribute(
      'data-pending-slug',
      'coach',
    );
  });
});

test.describe('Agent routing — task modal (deep link)', () => {
  test.skip(
    !process.env.E2E_TASK_MODAL_URL?.trim() ||
      !process.env.E2E_LOGIN_EMAIL?.trim() ||
      !process.env.E2E_LOGIN_PASSWORD?.trim(),
    'Set E2E_TASK_MODAL_URL plus E2E_LOGIN_EMAIL / E2E_LOGIN_PASSWORD',
  );

  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('task modal thread: @Buddy hi shows Buddy typing indicator', async ({ page }) => {
    await page.goto(process.env.E2E_TASK_MODAL_URL!.trim());
    await expect(page.locator('[data-testid="task-composer-thread"]')).toBeVisible();
    const input = page.locator('[data-testid="task-composer-thread"] input[type="text"]');
    await input.fill('@Buddy hi');
    await page.locator('[data-testid="task-composer-thread"] button[type="submit"]').click();
    await expect(page.getByTestId('agent-typing-indicator').last()).toHaveAttribute(
      'data-pending-slug',
      'buddy',
    );
  });

  test('task modal thread: plain hi → Coach default', async ({ page }) => {
    await page.goto(process.env.E2E_TASK_MODAL_URL!.trim());
    const input = page.locator('[data-testid="task-composer-thread"] input[type="text"]');
    await input.fill('hi');
    await page.locator('[data-testid="task-composer-thread"] button[type="submit"]').click();
    await expect(page.getByTestId('agent-typing-indicator').last()).toHaveAttribute(
      'data-pending-slug',
      'coach',
    );
  });
});
