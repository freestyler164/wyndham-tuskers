import { expect, test } from '@playwright/test';

const API_BASE = process.env.MYTUSKERS_API_URL || 'http://localhost:4100';

const resetLocalData = async (request) => {
  const response = await request.post(`${API_BASE}/v1/test-data/reset`);
  expect(response.ok()).toBeTruthy();
};

test.beforeEach(async ({ request }) => {
  await resetLocalData(request);
});

test.afterEach(async ({ request }) => {
  await resetLocalData(request);
});

const login = async (page, phone = '+61400000123', name = 'Ravi') => {
  await page.goto('/login');
  await page.getByLabel('Mobile number or email').fill(phone);
  await page.locator('input[autocomplete="current-password"]').fill('Password123!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  if (name === 'Admin') {
    await expect(page.getByRole('heading', { name: 'Global admin' })).toBeVisible();
  } else {
    await expect(page.getByText(`G'day, ${name}`)).toBeVisible();
  }
};

test('player can sign in, switch teams, and view wallet activity', async ({ page }) => {
  await login(page);
  await expect(page.getByText("G'day, Ravi")).toBeVisible();
  await expect(page.locator('.active-team-name')).toHaveText('Tuskers 1st XI');
  await expect(page.getByText('Availability requests')).toHaveCount(0);
  await expect(page.locator('.team-chips')).toHaveCount(0);
  await expect(page.getByText('My Wallet')).toBeVisible();
  await expect(page.getByText('Expenses pending approval')).toBeVisible();
  await expect(page.getByText(/available/).first()).toBeVisible();
  await expect(page.getByText(/projected/).first()).toBeVisible();
  await page.getByRole('link', { name: 'Wallet' }).click();
  const approvedExpenseNote = page.locator('.activity-row', { hasText: 'Ground hire - Round 7' }).filter({ hasText: 'Expense approved' });
  await expect(approvedExpenseNote).toContainText('share posted below');
  await expect(approvedExpenseNote.locator('b')).toHaveCount(0);
  const postedExpenseDebit = page.locator('.activity-row', { hasText: 'Ground hire - Round 7' }).filter({ hasText: 'expense debit' });
  await expect(postedExpenseDebit.locator('b')).toHaveText('-$12.50');
  await page.getByRole('link', { name: /Home/ }).click();

  await page.getByRole('link', { name: /More/ }).click();
  await page.getByRole('button', { name: /Tuskers T20/ }).click();
  await expect(page.getByRole('button', { name: /Tuskers T20/ })).toContainText('✓');

  await page.getByRole('link', { name: /Home/ }).click();
  await expect(page.locator('.active-team-name')).toHaveText('Tuskers T20');
  await expect(page.getByText('My Wallet')).toBeVisible();
  await page.getByRole('button', { name: 'Submit expense' }).click();
  await expect(page.getByRole('heading', { name: 'Submit expense' })).toBeVisible();
  await expect(page).not.toHaveURL(/\/wallet/);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Top up' }).click();
  await expect(page.getByRole('heading', { name: 'Submit topup request' })).toBeVisible();
  await expect(page).not.toHaveURL(/\/wallet/);
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('link', { name: /Home/ }).click();
  await page.getByRole('link', { name: 'Wallet' }).click();
  await expect(page.getByRole('heading', { name: 'Wallet' })).toBeVisible();
  await page.getByRole('button', { name: 'Submit expense' }).click();
  await expect(page.getByRole('heading', { name: 'Submit expense' })).toBeVisible();
  await page.getByLabel('Description').fill('Shared drinks');
  await page.getByLabel('Amount').fill('24');
  await page.getByLabel('Applies to').selectOption('WHOLE_TEAM');
  await expect(page.getByText('Your pending share')).toBeVisible();
  await expect(page.locator('.expense-projection').getByText('$6.00')).toBeVisible();
  await page.getByLabel('Amount').fill('600');
  await expect(page.locator('.expense-projection').getByText('-$8.00')).toBeVisible();
  await page.getByLabel('Amount').fill('24');
  await page.getByRole('button', { name: 'Submit expense' }).last().click();
  await expect(page.getByText('Expense submitted for captain approval.')).toBeVisible();

  await page.getByRole('button', { name: 'Top up' }).click();
  await expect(page.getByRole('heading', { name: 'Submit topup request' })).toBeVisible();
  await page.getByLabel('Amount').fill('50');
  await page.getByLabel('Payment note optional').fill('Bank transfer test');
  await page.getByLabel('I agree I have made the payment outside MyTuskers.').check();
  await page.getByRole('button', { name: 'Submit topup request' }).click();
  await expect(page.getByText('Topup request submitted for captain approval.')).toBeVisible();
});

test('signed-in player is restored to Home with wallet without another login', async ({ page }) => {
  await login(page);
  await page.goto('/login');
  await expect(page.getByText("G'day, Ravi")).toBeVisible();
  await expect(page.getByText('My Wallet')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toHaveCount(0);
});

test('unknown sign-in shows an account error', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Mobile number or email').fill('+61499999999');
  await page.locator('input[autocomplete="current-password"]').fill('Password123!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Invalid username or password.')).toBeVisible();
});

test('new player sees install and notification onboarding after first profile setup', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Mobile number or email').fill('+61400000444');
  await page.locator('input[autocomplete="current-password"]').fill('Password123!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tell your team who you are' })).toBeVisible();
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt');
    event.prompt = () => {
      window.__mytuskersPromptCalled = true;
    };
    event.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(event);
  });
  await page.locator('input[type="file"]').setInputFiles({
    name: 'profile.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=', 'base64'),
  });
  await expect(page.getByRole('button', { name: 'Change photo' })).toBeVisible();
  await expect.poll(() => page.locator('.avatar.has-photo img').evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
  await page.getByLabel('Full name').fill(`Guest Player ${Date.now()}`);
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await expect(page.getByRole('heading', { name: 'Install MyTuskers' })).toBeVisible();
  await expect(page.getByText('Turn on match notifications')).toBeVisible();
  await page.getByRole('button', { name: 'Install MyTuskers' }).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__mytuskersPromptCalled))).toBe(true);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText("You're signed in")).toBeVisible();
  await expect(page.getByText('No active team yet')).toBeVisible();
});

test('signup creates a no-team player and shows onboarding first', async ({ page }) => {
  const suffix = String(Date.now()).slice(-8);
  await page.goto('/login');
  await page.getByRole('button', { name: 'Show sign up form' }).click();
  await expect(page.getByRole('heading', { name: 'Create your MyTuskers account' })).toBeVisible();
  await page.getByLabel('Name').fill(`No Team ${suffix}`);
  await page.getByLabel('Email').fill(`no-team-${suffix}@example.test`);
  await page.getByLabel('Mobile number').fill(`+614${suffix}`);
  await page.locator('input[autocomplete="new-password"]').fill('Password123!');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Install MyTuskers' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText("You're signed in")).toBeVisible();
  await expect(page.getByText('No active team yet')).toBeVisible();
});

test('schedule and match detail enforce draft lineup visibility', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: /More/ }).click();
  await page.getByRole('button', { name: /Tuskers T20/ }).click();
  await page.getByRole('link', { name: /Schedule/ }).click();
  await expect(page.getByRole('heading', { name: 'Schedule' })).toBeVisible();
  await page.getByRole('link', { name: /vs Point Cook CC/ }).first().click();
  await expect(page.getByText('Draft lineup is visible to captains only.')).toBeVisible();
  await page.getByRole('button', { name: 'Maybe' }).click();
  await expect(page.getByText('Availability updated.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Change availability' })).toBeVisible();
  await expect(page.getByText("You answered: Maybe")).toBeVisible();
  await expect(page.getByText(/Team availability/)).toHaveCount(0);
  await page.getByRole('link', { name: /Schedule/ }).click();
  await expect(page.locator('.schedule-item', { hasText: 'Point Cook CC' }).first().getByText('Maybe')).toBeVisible();
  await expect(page.locator('.schedule-item', { hasText: 'Point Cook CC' }).first().getByText("You're in")).toHaveCount(0);
});

test('published lineup is visible for selected player', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: /Schedule/ }).click();
  const publishedScheduleRow = page.locator('.schedule-item', { hasText: 'Hoppers Crossing CC' }).first();
  await expect(publishedScheduleRow.getByText("You're in")).toBeVisible();
  await expect(publishedScheduleRow.getByText('Not answered')).toHaveCount(0);
  await page.goto('/matches/match-1xi-hoppers');
  await expect(page.getByText(/Team for the day/).first()).toBeVisible();
  await expect(page.getByText('Team for the day', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Tuskers 1st XI vs Hoppers Crossing CC/ })).toBeVisible();
  await expect(page.getByText('Captain scheduled')).toHaveCount(0);
  await page.evaluate(() => {
    window.__calendarUrl = '';
    window.open = (url) => {
      window.__calendarUrl = url;
      return { closed: false };
    };
  });
  await page.getByRole('button', { name: 'Add to calendar' }).click();
  await expect.poll(() => page.evaluate(() => window.__calendarUrl)).toContain('calendar.google.com/calendar/render');
  await expect.poll(() => page.evaluate(() => window.__calendarUrl)).toContain('action=TEMPLATE');
  await expect.poll(() => page.evaluate(() => window.__calendarUrl)).toContain('dates=');
});

test('completed match keeps its result, lineup, and man of the match', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: /Schedule/ }).click();
  const completedRow = page.locator('.schedule-item', { hasText: 'Werribee Centrals CC' }).first();
  await expect(completedRow.getByText('Won', { exact: true })).toBeVisible();
  await expect(completedRow.getByText(/Won by 4 wickets/)).toBeVisible();

  await completedRow.click();
  await expect(page.getByText('Match complete')).toBeVisible();
  await expect(page.getByText(/Won by 4 wickets with 11 balls to spare/)).toBeVisible();
  await expect(page.getByText("Captain's Man of the Match")).toBeVisible();
  await expect(page.getByText('Jas', { exact: true })).toBeVisible();
  await expect(page.getByText('Team for the day', { exact: true })).toBeVisible();
  await expect(page.locator('.player-row')).toHaveCount(8);
});

test('captain can add and clear a result on an already completed match', async ({ page }) => {
  await login(page, '+61400000111', 'Priya');
  await page.goto('/captain/matches');
  const completedRow = page.locator('.captain-match-item').filter({ hasText: 'Werribee Centrals CC' }).first();
  await expect(completedRow.getByText('Result: Won')).toBeVisible();

  await completedRow.getByRole('button', { name: 'Match actions' }).click();
  await page.getByRole('menuitem', { name: 'Edit result' }).click();
  const resultDialog = page.getByRole('dialog', { name: 'Match result' });
  await resultDialog.getByRole('button', { name: 'Lost' }).click();
  await resultDialog.getByLabel('Match summary optional').fill('Lost by 18 runs after a late collapse.');
  await resultDialog.getByRole('button', { name: 'Save result' }).click();
  await expect(page).toHaveURL(/\/feed\/new/);
  await expect(page.getByRole('heading', { name: 'Publish to feed' })).toBeVisible();
  await expect(page.getByLabel('Short description')).toHaveValue('Lost vs Werribee Centrals CC');
  await expect(page.getByLabel('Long description optional')).toHaveValue(/Lost by 18 runs/);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page).toHaveURL(/\/captain\/matches/);
  await expect(completedRow.getByText('Result: Lost')).toBeVisible();

  // Reopening drops the result so a live fixture never shows a stale scoreline.
  await completedRow.getByRole('button', { name: 'Match actions' }).click();
  await page.getByRole('menuitem', { name: 'Reopen match' }).click();
  await expect(page.getByText('Match reopened.')).toBeVisible();
  await page.goto('/schedule');
  const reopenedRow = page.locator('.schedule-item', { hasText: 'Werribee Centrals CC' }).first();
  await expect(reopenedRow.getByText('Lost')).toHaveCount(0);
  await expect(reopenedRow.getByText(/Lost by 18 runs/)).toHaveCount(0);
});

test('captain can publish a match result to the team feed', async ({ page }) => {
  await login(page, '+61400000111', 'Priya');
  await page.goto('/captain/matches');
  const completedRow = page.locator('.captain-match-item').filter({ hasText: 'Werribee Centrals CC' }).first();
  await completedRow.getByRole('button', { name: 'Match actions' }).click();
  await page.getByRole('menuitem', { name: 'Publish to feed' }).click();
  await expect(page).toHaveURL(/\/feed\/new/);
  await expect(page.getByRole('heading', { name: 'Publish to feed' })).toBeVisible();
  await expect(page.getByLabel('Short description')).toHaveValue('Won vs Werribee Centrals CC');
  await expect(page.getByLabel('Long description optional')).toHaveValue(/Won by 4 wickets/);
  await expect(page.getByLabel('Long description optional')).toHaveValue(/Captain's Man of the Match: @Jas/);
  await page.getByRole('button', { name: 'Publish to feed' }).click();
  await expect(page).toHaveURL(/\/feed$/);
  await expect(page.getByText('Posted to the team feed.')).toBeVisible();
  await expect(page.getByText('Won vs Werribee Centrals CC')).toBeVisible();
  await expect(page.getByText(/Captain's Man of the Match: @Jas/)).toBeVisible();
});

test('team feed supports posting, liking, commenting, and opening a post', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: /Feed/ }).click();
  await expect(page.getByRole('heading', { name: 'Team feed' })).toBeVisible();

  await page.getByRole('button', { name: 'Post' }).click();
  await expect(page).toHaveURL(/\/feed\/new/);
  await expect(page.getByRole('heading', { name: 'Post' })).toBeVisible();
  await page.getByLabel('Short description').fill('Brilliant energy in the field');
  await page.getByLabel('Long description optional').fill('Great work from @Arjun all afternoon.');
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  await expect(page).toHaveURL(/\/feed$/);
  await expect(page.getByText('Posted to the team feed.')).toBeVisible();

  const card = page.locator('.feed-post-card', { hasText: 'Brilliant energy in the field' });
  await expect(card).toBeVisible();
  await expect(card.locator('.feed-mention')).toHaveText('@Arjun');

  const likeButton = card.locator('.feed-actions button').first();
  await likeButton.click();
  await expect(likeButton).toHaveClass(/is-liked/);
  await expect(likeButton).toContainText('1');

  await card.getByPlaceholder('Write a comment').fill('Well played everyone');
  await card.getByRole('button', { name: 'Post comment' }).click();
  await expect(card.locator('.feed-comment-preview')).toContainText('Well played everyone');

  const likerStack = card.locator('.feed-liker-stack');
  await expect(likerStack.locator('.avatar')).toHaveCount(1);
  await likerStack.click();
  const likersSheet = page.locator('.action-modal');
  await expect(likersSheet.locator('.liker-row')).toContainText('Ravi');
  await likersSheet.getByRole('button', { name: 'Close' }).click();

  await card.locator('.feed-post-main').click();
  await expect(page).toHaveURL(/\/feed\/appreciation-/);
  const detail = page.locator('.feed-detail-card');
  await expect(detail.getByRole('heading', { name: 'Brilliant energy in the field' })).toBeVisible();
  await expect(detail.locator('.feed-comment')).toContainText('Well played everyone');
  await expect(detail.locator('.feed-liked-by')).toContainText('Liked by Ravi');
});

test('player can crop and post a photo to the feed', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: /Feed/ }).click();
  await page.getByRole('button', { name: 'Post' }).click();
  await expect(page).toHaveURL(/\/feed\/new/);
  await page.getByLabel('Short description').fill('Photo from the weekend');

  // 240x160 PNG so the crop presets have something non-square to work with.
  await page.getByLabel('Choose a photo').setInputFiles({
    name: 'match.png',
    mimeType: 'image/png',
    buffer: await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 240;
      canvas.height = 160;
      const context = canvas.getContext('2d');
      context.fillStyle = '#2f6f3f';
      context.fillRect(0, 0, 240, 160);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    }).then((bytes) => Buffer.from(bytes)),
  });

  const cropper = page.locator('.photo-cropper');
  await expect(cropper).toBeVisible();
  await cropper.getByRole('button', { name: '16:9' }).click();
  await cropper.getByRole('button', { name: 'Use photo' }).click();

  // Upload happens on crop confirm, so the thumbnail proves the round trip.
  await expect(page.locator('.composer-media img')).toBeVisible();
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  await expect(page).toHaveURL(/\/feed$/);
  await expect(page.getByText('Posted to the team feed.')).toBeVisible();

  const card = page.locator('.feed-post-card', { hasText: 'Photo from the weekend' });
  const media = card.locator('.feed-media img');
  await expect(media).toBeVisible();
  await expect(media).toHaveJSProperty('naturalWidth', await media.evaluate((img) => img.naturalWidth));
  await expect(card.locator('.feed-media')).toHaveAttribute('style', /aspect-ratio/);
});

test('post author can delete their own post from the detail page', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: /Feed/ }).click();

  await page.getByRole('button', { name: 'Post' }).click();
  await page.getByLabel('Short description').fill('Temporary post for deletion');
  await page.getByRole('button', { name: 'Post', exact: true }).last().click();

  const card = page.locator('.feed-post-card', { hasText: 'Temporary post for deletion' });
  await card.locator('.feed-post-main').click();

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete post' }).click();

  await expect(page).toHaveURL(/\/feed$/);
  await expect(page.locator('.feed-post-card', { hasText: 'Temporary post for deletion' })).toHaveCount(0);
});

test('invite and PWA shell metadata load locally', async ({ page, request }) => {
  const manifest = await request.get('/manifest.webmanifest');
  expect(manifest.ok()).toBeTruthy();
  await expect.poll(async () => (await manifest.json()).name).toBe('MyTuskers');
  await expect.poll(async () => (await manifest.json()).icons[0].src).toBe('/wt_logo.png');

  const sw = await request.get('/sw.js');
  expect(sw.ok()).toBeTruthy();
  expect(await sw.text()).toContain('mytuskers-shell-v2');

  await page.goto('/join/join-1st-xi-local');
  await expect(page.getByRole('heading', { name: /Join Tuskers 1st XI/ })).toBeVisible();
  await expect.poll(async () => page.evaluate(async () => Boolean(await navigator.serviceWorker.getRegistration()))).toBe(true);
});

test('new player signup from smart invite creates a join request', async ({ page }) => {
  const suffix = String(Date.now()).slice(-8);
  await page.goto('/join/join-1st-xi-local');
  await expect(page.getByRole('heading', { name: /Join Tuskers 1st XI/ })).toBeVisible();
  await page.getByRole('button', { name: 'Sign in to join' }).click();
  await page.getByRole('button', { name: 'Show sign up form' }).click();
  await page.getByLabel('Name').fill(`Invite Player ${suffix}`);
  await page.getByLabel('Email').fill(`invite-${suffix}@example.test`);
  await page.getByLabel('Mobile number').fill(`+6147${suffix}`);
  await page.locator('input[autocomplete="new-password"]').fill('Password123!');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Your join request is waiting for captain approval.')).toBeVisible();
  await expect(page.getByText('No active team yet')).toHaveCount(0);
});

test('captain can add an existing player from another team', async ({ page }) => {
  await login(page, '+61400000112', 'Dan');
  await page.getByRole('link', { name: /More/ }).click();
  await page.getByRole('button', { name: /Tuskers T20/ }).click();
  await page.getByRole('link', { name: /Captain/ }).click();
  await expect(page.getByRole('heading', { name: 'Captain' })).toBeVisible();
  await page.getByLabel('Existing player').selectOption('user-marcus');
  await page.getByRole('button', { name: 'Add player' }).click();
  await expect(page.getByText('Player added to team.')).toBeVisible();
  await page.getByRole('link', { name: /Open team wallet/ }).click();
  await expect(page.getByText('Marcus L')).toBeVisible();

  await page.evaluate(async (apiBase) => {
    await fetch(`${apiBase}/v1/auth/logout`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' } });
  }, API_BASE);
  await login(page, '+61400000114', 'Marcus');
  await page.getByRole('link', { name: /More/ }).click();
  await page.getByRole('button', { name: /Tuskers T20/ }).click();
  await page.getByRole('link', { name: /Home/ }).click();
  await expect(page.getByText('Tuskers T20')).toBeVisible();
  await expect(page.getByText(/Your selected match|Next team match/)).toBeVisible();
  await expect(page.getByRole('link', { name: /vs Point Cook CC/ })).toBeVisible();
});

test('captain can grant team admin access', async ({ page }) => {
  await login(page, '+61400000111', 'Priya');
  await page.getByRole('link', { name: /Captain/ }).click();
  await expect(page.getByRole('heading', { name: 'Captain' })).toBeVisible();
  const jasRow = page.locator('.team-admin-row', { hasText: 'Jas K' });
  await jasRow.getByRole('button', { name: 'Make admin' }).click();
  await expect(page.getByText('Team admin added.')).toBeVisible();
  await expect(page.locator('.team-admin-row', { hasText: 'Jas K' }).getByText('Team admin')).toBeVisible();

  await page.evaluate(async (apiBase) => {
    await fetch(`${apiBase}/v1/auth/logout`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' } });
  }, API_BASE);
  await login(page, '+61400000113', 'Jas');
  await expect(page.getByRole('link', { name: /Captain/ })).toBeVisible();
  await page.getByRole('link', { name: /Captain/ }).click();
  await expect(page.getByRole('heading', { name: 'Captain' })).toBeVisible();
});

test('new assigned player sees team matches on Home', async ({ page }) => {
  const suffix = String(Date.now()).slice(-8);
  const playerName = `Assigned Player ${suffix}`;
  const playerPhone = `+6148${suffix}`;

  await page.goto('/login');
  await page.getByRole('button', { name: 'Show sign up form' }).click();
  await page.getByLabel('Name').fill(playerName);
  await page.getByLabel('Email').fill(`assigned-${suffix}@example.test`);
  await page.getByLabel('Mobile number').fill(playerPhone);
  await page.locator('input[autocomplete="new-password"]').fill('Password123!');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('No active team yet')).toBeVisible();

  await page.evaluate(async (apiBase) => {
    await fetch(`${apiBase}/v1/auth/logout`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' } });
  }, API_BASE);
  await login(page, '+61400000111', 'Priya');
  await page.getByRole('link', { name: /Captain/ }).click();
  await page.getByLabel('Existing player').selectOption({ label: playerName });
  await page.getByRole('button', { name: 'Add player' }).click();
  await expect(page.getByText('Player added to team.')).toBeVisible();

  await page.evaluate(async (apiBase) => {
    await fetch(`${apiBase}/v1/auth/logout`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' } });
  }, API_BASE);
  await login(page, playerPhone, 'Assigned');
  // Exact match: the wallet card renders "My Wallet - Tuskers 1st XI" moments
  // later, which otherwise trips strict mode depending on load timing.
  await expect(page.getByText('Tuskers 1st XI', { exact: true })).toBeVisible();
  await expect(page.getByText(/selected match|Next team match/)).toBeVisible();
  await expect(page.getByRole('link', { name: /vs Hoppers Crossing CC/ })).toBeVisible();
});

test("captain keeps their own availability list separate from player answers", async ({ page }) => {
  await login(page, '+61400000111', 'Priya');
  await page.getByRole('link', { name: /Captain/ }).click();
  await page.getByRole('link', { name: /Keep your own confirmed list/ }).click();
  await expect(page.getByRole('heading', { name: 'Availability' })).toBeVisible();

  const row = page.locator('.captain-availability-row').first();
  const playerAnswer = await row.locator('.availability-chip').first().innerText();
  await expect(row.locator('.availability-chip.captain')).toHaveText('Not marked');

  // Tap cycles NOT_MARKED -> AVAILABLE -> MAYBE and leaves the player's own
  // answer untouched throughout.
  await row.click();
  await expect(row.locator('.availability-chip.captain')).toHaveText('Available');
  await row.click();
  await expect(row.locator('.availability-chip.captain')).toHaveText('Maybe');
  await expect(row.locator('.availability-chip').first()).toHaveText(playerAnswer);

  await page.reload();
  await expect(page.locator('.captain-availability-row').first().locator('.availability-chip.captain')).toHaveText('Maybe');

  // Back to unmarked so the fixture is left as it was found.
  const reloaded = page.locator('.captain-availability-row').first();
  await reloaded.click();
  await expect(reloaded.locator('.availability-chip.captain')).toHaveText('Unavailable');
  await reloaded.click();
  await expect(reloaded.locator('.availability-chip.captain')).toHaveText('Not marked');
});

test('captain marks show as a badge in the match hub', async ({ page }) => {
  await login(page, '+61400000111', 'Priya');
  await page.getByRole('link', { name: /Captain/ }).click();
  await page.getByRole('link', { name: /Keep your own confirmed list/ }).click();
  const row = page.locator('.captain-availability-row').first();
  await row.click();
  await expect(row.locator('.availability-chip.captain')).toHaveText('Available');

  await page.getByRole('link', { name: /Captain/ }).click();
  await page.getByRole('link', { name: /Create matches, request availability/ }).click();
  await expect(page.locator('.captain-match-status.captain-marked').first()).toContainText('List 1/1');

  await page.getByRole('link', { name: /Captain/ }).click();
  await page.getByRole('link', { name: /Keep your own confirmed list/ }).click();
  const cleanup = page.locator('.captain-availability-row').first();
  for (const label of ['Maybe', 'Unavailable', 'Not marked']) {
    await cleanup.click();
    await expect(cleanup.locator('.availability-chip.captain')).toHaveText(label);
  }
});

test('captain can manage team operations from PRP workflows', async ({ page }) => {
  const captainExpenseTitle = `Captain test expense ${Date.now()}`;
  const captainMatchOpponent = `Lineup Test ${Date.now()}`;
  await login(page, '+61400000111', 'Priya');
  await page.getByRole('link', { name: /Captain/ }).click();
  await expect(page.getByRole('heading', { name: 'Captain' })).toBeVisible();
  await expect(page.getByText('Team balance')).toBeVisible();
  await expect(page.getByText('Player management')).toBeVisible();

  await page.getByRole('button', { name: 'Get smart invite link' }).click();
  await expect(page.getByText(/Smart invite link/)).toBeVisible();
  await expect(page.getByText('http://localhost:3100/join/join-1st-xi-local').first()).toBeVisible();

  await expect(page.getByText('Topup approvals')).toHaveCount(0);
  await expect(page.getByText('Expense approvals')).toHaveCount(0);

  await page.getByRole('link', { name: /Open team wallet/ }).click();
  await expect(page.getByRole('heading', { name: 'Team wallet' })).toBeVisible();
  await expect(page.getByText('Topup approvals')).toBeVisible();
  await expect(page.getByText('Expense approvals')).toBeVisible();
  await expect(page.getByText('Prepaid collections')).toBeVisible();
  await expect(page.getByRole('link', { name: /New collection/ })).toBeVisible();

  await page.getByRole('button', { name: /Match balls - Round 8/ }).click();
  await expect(page.getByRole('heading', { name: 'Expense approval', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Edit expense' })).toBeVisible();
  await page.getByLabel('Applies to').selectOption('WHOLE_TEAM');
  await page.getByRole('button', { name: 'Save expense changes' }).click();
  await expect(page.getByText('Expense updated.')).toBeVisible();

  await page.getByRole('button', { name: 'Add credit' }).click();
  await expect(page.getByRole('heading', { name: 'Add credit' })).toBeVisible();
  const addCreditDialog = page.getByRole('dialog', { name: 'Add credit' });
  await addCreditDialog.locator('#adhoc-credit-amount').fill('3');
  await addCreditDialog.getByRole('combobox', { name: 'Credit to' }).selectOption('SELECTED_PLAYERS');
  await addCreditDialog.getByRole('checkbox', { name: 'Ravi Sharma' }).check();
  await addCreditDialog.getByRole('button', { name: 'Add credit' }).click();
  await expect(page.getByText('Credit added to 1 player.')).toBeVisible();

  await page.getByRole('button', { name: 'Add expense' }).click();
  await expect(page.getByRole('heading', { name: 'Add expense' })).toBeVisible();
  const addExpenseDialog = page.getByRole('dialog', { name: 'Add expense' });
  await addExpenseDialog.getByLabel('Description').fill(captainExpenseTitle);
  await addExpenseDialog.getByLabel('Amount').fill('9');
  await addExpenseDialog.getByRole('combobox', { name: 'Paid by' }).selectOption('user-ravi');
  await addExpenseDialog.getByRole('combobox', { name: 'Applies to' }).selectOption('SELECTED_PLAYERS');
  await addExpenseDialog.getByRole('checkbox', { name: 'Ravi Sharma' }).check();
  await page.getByRole('button', { name: 'Add expense' }).last().click();
  await expect(page.getByText('Expense added for approval.')).toBeVisible();

  await page.getByRole('button', { name: new RegExp(captainExpenseTitle) }).click();
  await expect(page.getByRole('heading', { name: 'Expense approval', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();

  await expect(page.getByText('Player wallets')).toBeVisible();
  await page.locator('.tool-panel').filter({ has: page.getByRole('heading', { name: 'Transactions' }) }).getByLabel(/Edit /).first().click();
  await expect(page.getByRole('heading', { name: 'Edit transaction' })).toBeVisible();
  await expect(page.getByLabel('Transaction amount')).toBeFocused();
  await page.getByLabel('Transaction amount').fill('18');
  await page.getByLabel('Transaction reason').fill('Edited opening balance');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Transaction updated.')).toBeVisible();

  await page.goto('/captain/matches');
  await expect(page.getByRole('heading', { name: 'Match hub' })).toBeVisible();
  const cancelledRow = page.locator('.captain-match-item').filter({ hasText: 'Seabrook CC' }).first();
  await expect(cancelledRow.getByText('Cancelled')).toBeVisible();
  await cancelledRow.getByRole('button', { name: 'Match actions' }).click();
  await expect(page.getByRole('menuitem', { name: 'Reopen match' })).toBeVisible();
  await page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('Seabrook CC');
    await dialog.accept();
  });
  await page.getByRole('menuitem', { name: 'Delete match' }).click();
  await expect(page.getByText('Match deleted.')).toBeVisible();
  await expect(cancelledRow).toHaveCount(0);
  const publishedRow = page.locator('.captain-match-item').filter({ hasText: 'Hoppers Crossing CC' }).first();
  await expect(publishedRow.getByText(/available/)).toHaveCount(0);
  await publishedRow.getByRole('button', { name: 'Match actions' }).click();
  await expect(page.getByRole('menuitem', { name: 'Edit lineup' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Publish lineup' })).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: 'Ask availability' })).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: 'Delete match' })).toHaveCount(0);
  await publishedRow.getByRole('button', { name: 'Match actions' }).click();
  await page.getByRole('button', { name: 'Create match' }).click();
  const createMatchDialog = page.getByRole('dialog', { name: 'Create match' });
  await expect(createMatchDialog.getByLabel('Opponent')).toHaveValue('');
  await createMatchDialog.getByLabel('Opponent').fill(captainMatchOpponent);
  await createMatchDialog.getByLabel('Venue').fill('Presidents Park, Oval 3');
  await createMatchDialog.getByLabel('Date').fill(new Date(Date.now() + 9 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  await createMatchDialog.getByLabel('Start time').fill('11:00');
  await createMatchDialog.getByRole('combobox', { name: 'Match type' }).selectOption('TOURNAMENT');
  await createMatchDialog.getByLabel('Player fee cap').fill('7');
  await createMatchDialog.getByRole('button', { name: 'Create match' }).click();
  await expect(page.getByText('Match created.')).toBeVisible();

  const newMatchRow = page.locator('.captain-match-item').filter({ hasText: captainMatchOpponent });
  await newMatchRow.getByRole('button', { name: 'Match actions' }).click();
  await page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain(captainMatchOpponent);
    await dialog.dismiss();
  });
  await page.getByRole('menuitem', { name: 'Delete match' }).click();
  await expect(newMatchRow).toBeVisible();
  await newMatchRow.getByRole('button', { name: 'Match actions' }).click();
  await page.getByRole('menuitem', { name: 'Edit match' }).click();
  const editMatchDialog = page.getByRole('dialog', { name: 'Edit match' });
  await editMatchDialog.getByLabel('Venue').fill('Presidents Park, Oval 4');
  await editMatchDialog.getByRole('button', { name: 'Save match' }).click();
  await expect(page.getByText('Match updated.')).toBeVisible();
  await newMatchRow.getByRole('button', { name: 'Match actions' }).click();
  await page.getByRole('menuitem', { name: 'Ask availability' }).click();
  await expect(page.getByText('Availability requested.')).toBeVisible();
  await expect(newMatchRow.getByText(/\d+ to answer/)).toBeVisible();
  await newMatchRow.getByRole('button').first().click();
  await expect(page.getByRole('heading', { name: 'Match details' })).toBeVisible();
  await expect(page.locator('.captain-availability-row').first().locator('.availability-chip').first()).toHaveText('No response');
  await page.getByRole('button', { name: 'Close' }).click();
  await newMatchRow.getByRole('button', { name: 'Match actions' }).click();
  await page.getByRole('menuitem', { name: 'Copy availability link' }).click();
  await expect(page.getByText(/Availability link/)).toBeVisible();
  await newMatchRow.getByRole('button', { name: 'Match actions' }).click();
  await expect(page.getByRole('menuitem', { name: 'Availability requested' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Publish lineup' }).click();
  const publishDialog = page.getByRole('dialog', { name: 'Publish lineup' });
  await expect(publishDialog.getByRole('heading', { name: 'Publish lineup' })).toBeVisible();
  await expect(publishDialog.getByText('availability is not required to publish')).toBeVisible();
  await publishDialog.getByLabel('Player fee cap').fill('7');

  const lineupCount = async () => {
    const text = await publishDialog.locator('.expense-projection strong').first().textContent();
    return Number((text || '0/12').split('/')[0]);
  };
  if (await lineupCount() >= 12) {
    await publishDialog.getByRole('checkbox').last().uncheck();
  }
  let guestNumber = 1;
  while (await lineupCount() < 12) {
    await publishDialog.getByRole('button', { name: 'Add guest' }).click();
    await publishDialog.getByLabel(`Guest ${guestNumber}`, { exact: true }).fill(`Local Guest ${guestNumber}`);
    guestNumber += 1;
  }
  await expect(publishDialog.getByText('12/12')).toBeVisible();
  await publishDialog.getByRole('button', { name: 'Publish lineup' }).click();
  await expect(page.getByText('Lineup published.')).toBeVisible();
  await newMatchRow.getByRole('button', { name: 'Match actions' }).click();
  await page.getByRole('menuitem', { name: 'Mark complete early' }).click();
  const completeDialog = page.getByRole('dialog', { name: 'Complete match' });
  await completeDialog.getByRole('button', { name: 'Mark complete' }).click();
  await expect(completeDialog.getByText('Pick who won.')).toBeVisible();
  await completeDialog.getByRole('button', { name: 'Won' }).click();
  await completeDialog.getByLabel('Match summary optional').fill('Won by 5 wickets chasing 142.');
  await completeDialog.getByRole('button', { name: 'Mark complete' }).click();
  await expect(page).toHaveURL(/\/feed\/new/);
  await expect(page.getByRole('heading', { name: 'Publish to feed' })).toBeVisible();
  await expect(page.getByLabel('Short description')).toHaveValue(new RegExp(`Won vs ${captainMatchOpponent}`));
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page).toHaveURL(/\/captain\/matches/);
  await expect(newMatchRow.getByText('Result: Won')).toBeVisible();

  await page.goto('/captain/wallet');
  await expect(page.getByText(new RegExp(`${captainMatchOpponent} match fee`)).first()).toBeVisible();
});

test('captain can create prepaid collection and settle after player confirms', async ({ page }) => {
  const collectionTitle = `Kit collection ${Date.now()}`;
  await login(page, '+61400000111', 'Priya');
  await page.getByRole('link', { name: /Captain/ }).click();
  await page.getByRole('link', { name: /Open team wallet/ }).click();
  await expect(page.getByText('Prepaid collections')).toBeVisible();
  await expect(page.getByRole('link', { name: /New collection/ })).toBeVisible();
  await page.getByRole('link', { name: /New collection/ }).click();
  await expect(page.getByRole('heading', { name: 'New collection' })).toBeVisible();
  await page.getByLabel('Title').fill(collectionTitle);
  await page.getByLabel('Fill all').fill('50');
  await page.getByRole('button', { name: 'Apply' }).click();
  await page.getByLabel('Amount owed for Ravi Sharma').fill('80');
  await page.getByLabel('Amount owed for Dan W').fill('120');
  // Leave other players blank so only Ravi and Dan are included.
  for (const name of ['Priya N', 'Jas K', 'Marcus L', 'Sam T', 'Arjun P', 'Ben H']) {
    await page.getByLabel(`Amount owed for ${name}`).fill('');
  }
  await page.getByRole('button', { name: 'Create collection' }).click();
  await expect(page.getByRole('heading', { name: collectionTitle })).toBeVisible();
  await expect(page.getByText(/Ravi Sharma/)).toBeVisible();
  await expect(page.getByText(/\$80\.00 owed/)).toBeVisible();

  await page.getByRole('link', { name: /More/ }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await login(page, '+61400000123', 'Ravi');
  await expect(page.getByText('Prepaid collections')).toBeVisible();
  await expect(page.getByText(collectionTitle)).toBeVisible();
  const availableBefore = await page.locator('.wallet-amounts strong').first().textContent();
  await page.locator('.nudge-row').filter({ hasText: collectionTitle }).getByRole('link', { name: 'Confirm' }).click();
  await expect(page.getByRole('heading', { name: collectionTitle })).toBeVisible();
  await page.getByLabel(/I agree I have made the payment/).check();
  await page.getByRole('button', { name: 'Confirm payment' }).click();
  await expect(page.getByText('Payment submitted for captain approval.')).toBeVisible();
  await expect(page.getByText(/waiting for captain approval/i)).toBeVisible();

  await page.getByRole('link', { name: /More/ }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await login(page, '+61400000111', 'Priya');
  await page.goto('/captain/wallet');
  await page.getByRole('link', { name: collectionTitle }).click();
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Payment approved and held for the purchase.')).toBeVisible();
  await expect(page.getByText(/Prepaid/)).toBeVisible();

  await page.getByRole('link', { name: /More/ }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await login(page, '+61400000123', 'Ravi');
  await expect(page.getByText(/Held for collections \$80\.00/)).toBeVisible();
  await expect(page.locator('.wallet-amounts strong').first()).toHaveText(availableBefore);
  await page.getByRole('link', { name: 'Wallet' }).click();
  await expect(page.getByText(`${collectionTitle} · prepaid`)).toBeVisible();

  await page.getByRole('link', { name: /More/ }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await login(page, '+61400000111', 'Priya');
  await page.goto('/captain/wallet');
  await page.getByRole('link', { name: collectionTitle }).click();
  await page.getByRole('button', { name: 'Record purchase' }).click();
  await expect(page.getByText('Purchase recorded against prepaid amounts.')).toBeVisible();

  await page.getByRole('link', { name: /More/ }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await login(page, '+61400000123', 'Ravi');
  await page.getByRole('link', { name: 'Wallet' }).click();
  await expect(page.getByText(`${collectionTitle} · purchase`)).toBeVisible();
  await expect(page.getByText(/Held for collections/)).toHaveCount(0);
});

test('global admin can manage teams, captains, users, and audit', async ({ page }) => {
  const teamName = `Tuskers Local ${Date.now()}`;
  await login(page, '+61473623614', 'Admin');
  await expect(page.getByRole('heading', { name: 'Global admin' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Captain/ })).toBeVisible();
  await page.getByRole('link', { name: /Captain/ }).click();
  await expect(page.getByRole('heading', { name: 'Captain' })).toBeVisible();
  await page.getByRole('link', { name: /Admin/ }).click();
  await expect(page.getByRole('heading', { name: 'Team hub' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
  await page.getByRole('button', { name: 'Send test notification' }).click();
  await expect(page.getByText('No registered device found.')).toBeVisible();
  await page.getByLabel('Notification target').selectOption('TEAM');
  await page.getByLabel('Notification team').selectOption('team-1xi');
  await page.getByRole('button', { name: 'Send targeted test' }).click();
  await expect(page.getByText('No registered devices found for Tuskers 1st XI.')).toBeVisible();
  await expect(page.getByText('Users')).toBeVisible();
  await expect(page.getByText('Audit')).toBeVisible();

  await page.getByRole('button', { name: 'Open team hub' }).click();
  await expect(page.getByRole('heading', { name: 'Team hub' })).toBeVisible();
  await page.getByRole('button', { name: 'Create team' }).click();
  const createTeamDialog = page.getByRole('dialog', { name: 'Create team' });
  await expect(createTeamDialog.getByLabel('Team name')).toHaveValue('');
  await createTeamDialog.getByLabel('Team name').fill(teamName);
  await createTeamDialog.getByLabel('Short name').fill('LOC');
  await createTeamDialog.getByLabel('Add all existing players').check();
  await createTeamDialog.getByRole('button', { name: 'Create team' }).click();
  await expect(page.getByText('Team created.')).toBeVisible();
  await expect.poll(async () => page.evaluate(async ({ name, apiBase }) => {
    const response = await fetch(`${apiBase}/v1/admin/teams`, { credentials: 'include' });
    const data = await response.json();
    return data.teams.find((team) => team.name === name)?.playerCount;
  }, { name: teamName, apiBase: API_BASE })).toBe(9);

  const firstXiRow = page.locator('.team-hub-card', { hasText: 'Tuskers 1st XI' });
  await firstXiRow.getByRole('button', { name: 'Actions for Tuskers 1st XI' }).click();
  await page.getByRole('menuitem', { name: 'Edit team' }).click();
  const editTeamDialog = page.getByRole('dialog', { name: 'Edit team' });
  await editTeamDialog.getByRole('combobox', { name: 'Captain' }).selectOption('user-priya');

  await editTeamDialog.getByLabel('Wallet card colour').evaluate((input) => {
    input.value = '#225522';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await editTeamDialog.getByRole('button', { name: 'Save team' }).click();
  await expect(page.getByText('Team updated.')).toBeVisible();

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain(teamName);
    await dialog.accept();
  });
  const newTeamRow = page.locator('.team-hub-card', { hasText: teamName });
  await newTeamRow.getByRole('button', { name: `Actions for ${teamName}` }).click();
  await page.getByRole('menuitem', { name: 'Edit team' }).click();
  await page.getByRole('dialog', { name: 'Edit team' }).getByRole('button', { name: 'Delete team' }).click();
  await expect(page.getByText('Team deleted.')).toBeVisible();
  await expect(page.getByText(teamName)).toHaveCount(0);
});
