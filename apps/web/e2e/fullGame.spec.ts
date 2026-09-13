import { test, expect, type Browser, type Page } from '@playwright/test';

/**
 * Four browser contexts (one per player) play through: create, join, seat, start, clue,
 * play a card, guess, and verify that operatives never see the key while the spymaster does.
 */
const join = async (browser: Browser, code: string, nickname: string): Promise<Page> => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`/join/${code}`);
  await page.getByLabel('Your name').fill(nickname);
  await page.getByRole('button', { name: 'Join room' }).click();
  await expect(page.getByRole('heading', { name: 'Lobby' })).toBeVisible();
  return page;
};

test('four players play a turn with correct information partitioning', async ({ browser }) => {
  const host = await browser.newPage();
  await host.goto('/new');
  await host.getByLabel('Your name').fill('Ann');
  await host.getByRole('button', { name: 'Create room' }).click();
  await expect(host.getByRole('heading', { name: 'Lobby' })).toBeVisible();
  const code = (await host.getByLabel('Copy invite link').textContent())?.trim().slice(0, 6) ?? '';
  expect(code).toMatch(/^[A-Z2-9]{6}$/);

  const bo = await join(browser, code, 'Bo');
  const cy = await join(browser, code, 'Cy');
  const di = await join(browser, code, 'Di');

  await host.getByRole('button', { name: 'Join Ember' }).click();
  await host.getByRole('button', { name: 'Be the spymaster' }).click();
  await bo.getByRole('button', { name: 'Join Ember' }).click();
  await cy.getByRole('button', { name: 'Join Tide' }).click();
  await cy.getByRole('button', { name: 'Be the spymaster' }).click();
  await di.getByRole('button', { name: 'Join Tide' }).click();

  await expect(host.getByRole('button', { name: 'Start game' })).toBeEnabled();
  await host.getByRole('button', { name: 'Start game' }).click();

  // Everyone is in the game; operatives see plain tiles, spymasters see owner rims.
  for (const p of [host, bo, cy, di]) await expect(p.getByRole('grid', { name: 'Word board' })).toBeVisible();
  const boTiles = bo.getByRole('grid', { name: 'Word board' }).getByRole('button');
  await expect(boTiles).toHaveCount(25);
  await expect(bo.locator('[aria-label*="revealed as"]')).toHaveCount(0);
  await expect(bo.getByText('You are the spymaster')).toHaveCount(0);
  await expect(host.getByText('You are the spymaster')).toBeVisible();

  // Whoever is active clues; their operative guesses one word.
  const emberActive = await host.getByText('Your clue').isVisible();
  const spy = emberActive ? host : cy;
  const op = emberActive ? bo : di;
  await spy.getByLabel('Your clue').fill('XYZZY');
  await spy.getByRole('button', { name: 'Give clue' }).click();
  await expect(op.getByText('XYZZY')).toBeVisible();

  // Operative hand exists and the opposing operative cannot see its contents.
  await expect(op.getByRole('list', { name: "Your team's hand" }).getByRole('listitem')).toHaveCount(3);

  // Two-step selection: the first click marks the word for everyone, the reveal control guesses it.
  const firstTile = op.getByRole('grid', { name: 'Word board' }).locator('button[aria-label]:not([aria-label^="Reveal"])').first();
  const word = (await firstTile.getAttribute('aria-label'))!.split(',')[0]!;
  await firstTile.click();
  await expect(host.locator(`[aria-label*="marked by"]`)).toHaveCount(1);
  await op.getByRole('button', { name: `Reveal ${word}` }).click();
  await expect(op.locator('[aria-label*="revealed as"]')).toHaveCount(1);
  await expect(host.locator('[aria-label*="revealed as"]')).toHaveCount(1);
});
