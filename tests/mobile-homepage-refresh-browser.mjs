import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
fs.mkdirSync('artifacts', { recursive: true });

const browser = await chromium.launch({ headless: true });
const baseURL = process.env.PERDE_TEST_URL || 'http://127.0.0.1:4173/';

async function contextFor({ viewport, screen, isMobile = false, hasTouch = false, userAgent }) {
  return browser.newContext({
    viewport,
    screen,
    isMobile,
    hasTouch,
    ...(userAgent ? { userAgent } : {})
  });
}

async function loadAndCheck(name, options, expectedActive) {
  const context = await contextFor(options);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const state = await page.evaluate(() => ({
    active: document.documentElement.classList.contains('perde-mobile-refresh-active'),
    desktopSiteRequested: document.documentElement.classList.contains('perde-desktop-site-requested'),
    phone: document.documentElement.classList.contains('perde-phone-device'),
    tablet: document.documentElement.classList.contains('perde-touch-compact'),
    tv: document.documentElement.classList.contains('perde-tv-wide')
  }));
  assert.equal(state.active, expectedActive, name + ': unexpected mobile refresh state; ' + JSON.stringify(state));
  assert.deepEqual(errors, [], name + ': uncaught page errors');
  return { context, page, state };
}

try {
  const phone = await loadAndCheck('phone portrait', {
    viewport: { width: 390, height: 844 },
    screen: { width: 390, height: 844 },
    isMobile: true, hasTouch: true
  }, true);

  assert.equal(await phone.page.locator('.mobile-bottom-nav').isVisible(), true, 'phone portrait: bottom navigation should be visible');
  const touchTargets = [
    ['menu trigger', phone.page.locator('[data-mobile-drawer-open]').first()],
    ['profile button', phone.page.locator('.site-header .user-trigger').first()],
    ['search input', phone.page.locator('.site-header #search-input')],
    ['drawer close', phone.page.locator('.mobile-drawer-close')]
  ];
  for (const [name, locator] of touchTargets) {
    const box = await locator.boundingBox();
    assert.ok(box && box.width >= 44 && box.height >= 44, 'phone: ' + name + ' touch target must be at least 44x44 CSS px');
  }
  await phone.page.emulateMedia({ reducedMotion: 'reduce' });
  const touchMenuTrigger = phone.page.locator('[data-mobile-drawer-open]').first();
  await touchMenuTrigger.waitFor({ state: 'visible' });
  await touchMenuTrigger.click();
  const reducedMotionDuration = await phone.page.locator('#mobile-drawer').evaluate(el => getComputedStyle(el).transitionDuration);
  assert.ok(reducedMotionDuration.split(',').every(value => parseFloat(value) <= 0.001), 'reduced motion: drawer transition should be effectively disabled');
  await phone.page.keyboard.press('Escape');
  await phone.page.emulateMedia({ reducedMotion: 'no-preference' });
  await phone.page.screenshot({ path: 'artifacts/phone-portrait.png' });

  // Verify the approved mobile homepage rails render, scroll horizontally, and filter correctly.
  const popularSection = phone.page.locator('#collection-popular');
  const popularRail = phone.page.locator('#popular-home-rail');
  const newestSection = phone.page.locator('#collection-newest');
  const newestRail = phone.page.locator('#newest-home-rail');
  assert.equal(await popularSection.isVisible(), true, 'phone: popular rail should be visible');
  assert.equal(await newestSection.isVisible(), true, 'phone: newest rail should be visible');
  assert.ok(await popularRail.locator('.mobile-home-poster-card').count() > 0, 'phone: popular rail should contain cards');
  assert.ok(await newestRail.locator('.mobile-home-poster-card').count() > 0, 'phone: newest rail should contain cards');
  const popularOverflow = await popularRail.evaluate(el => el.scrollWidth > el.clientWidth);
  const newestOverflow = await newestRail.evaluate(el => el.scrollWidth > el.clientWidth);
  assert.equal(popularOverflow, true, 'phone: popular rail should scroll horizontally');
  assert.equal(newestOverflow, true, 'phone: newest rail should scroll horizontally');

  const movieFilter = popularSection.locator('[data-mobile-filter="movie"]');
  await movieFilter.click();
  assert.equal(await movieFilter.getAttribute('aria-pressed'), 'true', 'popular movie filter should become active');
  const popularMovieLabels = await popularRail.locator('.collection-card-copy p').allTextContents();
  assert.ok(popularMovieLabels.length > 0 && popularMovieLabels.every(label => label.includes('Film')), 'popular movie filter should show films only');

  const seriesFilter = popularSection.locator('[data-mobile-filter="tv"]');
  await seriesFilter.click();
  assert.equal(await seriesFilter.getAttribute('aria-pressed'), 'true', 'popular series filter should become active');
  const popularSeriesLabels = await popularRail.locator('.collection-card-copy p').allTextContents();
  assert.ok(popularSeriesLabels.length > 0 && popularSeriesLabels.every(label => label.includes('Dizi')), 'popular series filter should show series only');
  await popularSection.locator('[data-mobile-filter="all"]').click();

  const newestMovieFilter = newestSection.locator('[data-mobile-filter="movie"]');
  await newestMovieFilter.click();
  const newestMovieLabels = await newestRail.locator('.collection-card-copy p').allTextContents();
  assert.ok(newestMovieLabels.length > 0 && newestMovieLabels.every(label => label.includes('Film')), 'newest movie filter should show films only');
  await newestSection.locator('[data-mobile-filter="all"]').click();

  // Poster cards must open the matching detail view by touch/click and keyboard activation.
  const firstPopularCard = popularRail.locator('.mobile-home-poster-card').first();
  const firstCardId = await firstPopularCard.getAttribute('data-detail-id');
  assert.ok(firstCardId, 'phone: poster card must expose its media id');
  await firstPopularCard.click();
  const detailView = phone.page.locator('#detail-page-view');
  await detailView.waitFor({ state: 'visible' });
  assert.equal(await phone.page.locator('#dashboard-view').isVisible(), false, 'phone: poster click should open detail view');
  await phone.page.evaluate(() => showDashboard(false));
  await popularRail.locator('.mobile-home-poster-card').first().focus();
  await phone.page.keyboard.press('Enter');
  await detailView.waitFor({ state: 'visible' });
  assert.equal(await phone.page.locator('#dashboard-view').isVisible(), false, 'phone: Enter should open focused poster detail');
  await phone.page.evaluate(() => showDashboard(false));

  const mobileSectionOrder = await phone.page.evaluate(() => {
    const ids = ['collection-popular', 'continue-watching-section', 'collection-newest', 'daily-pick-section'];
    const nodes = ids.map(id => document.getElementById(id));
    return nodes.every(Boolean) && nodes.slice(0, -1).every((node, index) =>
      Boolean(node.compareDocumentPosition(nodes[index + 1]) & Node.DOCUMENT_POSITION_FOLLOWING)
    );
  });
  assert.equal(mobileSectionOrder, true, 'phone: homepage sections should follow Popular → Continue → Newest → discovery order');
  const trigger = phone.page.locator('[data-mobile-drawer-open]').first();
  await trigger.waitFor({ state: 'visible' });
  await trigger.click();
  const drawer = phone.page.locator('#mobile-drawer');
  await drawer.waitFor({ state: 'visible' });
  assert.equal(await drawer.getAttribute('aria-hidden'), 'false');
  assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
  await phone.page.keyboard.press('Escape');
  assert.equal(await drawer.getAttribute('aria-hidden'), 'true');
  assert.equal(await trigger.getAttribute('aria-expanded'), 'false');

  await trigger.click();
  await phone.page.locator('#mobile-drawer-backdrop').click({ position: { x: 4, y: 4 } });
  assert.equal(await drawer.getAttribute('aria-hidden'), 'true');

  // Bottom navigation must route to the matching view and keep its active indicator in sync.
  const nav = phone.page.locator('.mobile-bottom-nav');
  const routeCases = [
    { route: 'filmler', hash: '#/filmler', label: 'Filmler' },
    { route: 'kesfet', hash: '#/kesfet', label: 'Keşfet' },
    { route: 'listem', hash: '#/listem', label: 'Listem' }
  ];
  for (const item of routeCases) {
    await nav.locator('[data-mobile-route="' + item.route + '"]').click();
    await phone.page.waitForFunction(expected => location.hash.toLowerCase() === expected, item.hash);
    assert.equal(await nav.locator('[data-mobile-route="' + item.route + '"]').getAttribute('aria-current'), 'page', item.label + ': active route should be announced');
    assert.equal(await nav.locator('[data-mobile-route="' + item.route + '"]').evaluate(el => el.classList.contains('is-active')), true, item.label + ': active styling should be applied');
    assert.equal(await phone.page.locator('#catalog-page').isVisible(), true, item.label + ': catalog view should be visible');
  }
  await nav.locator('[data-mobile-route="home"]').click();
  await phone.page.waitForFunction(() => location.hash.toLowerCase() === '#/anasayfa' || location.hash === '');
  assert.equal(await nav.locator('[data-mobile-route="home"]').getAttribute('aria-current'), 'page', 'home: active route should be announced');
  assert.equal(await phone.page.locator('#dashboard-view').isVisible(), true, 'home: dashboard should be restored');
  assert.equal(await phone.page.locator('#catalog-page').isVisible(), false, 'home: catalog view should be hidden');

  // Establish a known history entry before testing browser Back from the drawer.
  await nav.locator('[data-mobile-route="listem"]').click();
  await phone.page.waitForFunction(() => location.hash.toLowerCase() === '#/listem');

  // Drawer route links must close the drawer and navigate to their intended destinations.
  await trigger.click();
  await drawer.locator('a[href="#/diziler"]').click();
  await phone.page.waitForFunction(() => location.hash.toLowerCase() === '#/diziler');
  assert.equal(await drawer.getAttribute('aria-hidden'), 'true', 'drawer: selecting a route should close it');
  assert.equal(await phone.page.locator('#catalog-page').isVisible(), true, 'drawer: series route should show catalog');
  await phone.page.goBack();
  await phone.page.waitForFunction(() => location.hash.toLowerCase() === '#/listem');
  assert.equal(await phone.page.locator('#catalog-page').isVisible(), true, 'browser back: should restore the previous Listem route');
  assert.equal(await nav.locator('[data-mobile-route="listem"]').getAttribute('aria-current'), 'page', 'browser back: active bottom-nav item should follow restored route');

  // Rotate the same phone context and ensure mobile chrome remains active and usable.
  await phone.page.setViewportSize({ width: 844, height: 390 });
  await phone.page.waitForTimeout(250);
  assert.equal(await phone.page.locator('.mobile-bottom-nav').isVisible(), true, 'rotated phone: bottom navigation should remain visible');
  assert.equal(await phone.page.locator('[data-mobile-drawer-open]').isVisible(), true, 'rotated phone: drawer trigger should remain visible');
  await phone.page.screenshot({ path: 'artifacts/phone-rotated-in-session.png' });
  await phone.page.setViewportSize({ width: 390, height: 844 });
  await phone.page.waitForTimeout(150);

  const phoneLandscape = await loadAndCheck('phone landscape', {
    viewport: { width: 844, height: 390 },
    screen: { width: 844, height: 390 },
    isMobile: true, hasTouch: true
  }, true);

  assert.equal(await phoneLandscape.page.locator('.mobile-bottom-nav').isVisible(), true, 'phone landscape: bottom navigation should be visible');
  await phoneLandscape.page.screenshot({ path: 'artifacts/phone-landscape.png' });

  const desktopMode = await loadAndCheck('phone with desktop site requested', {
    viewport: { width: 980, height: 844 },
    screen: { width: 390, height: 844 },
    isMobile: true, hasTouch: true
  }, false);

  assert.equal(desktopMode.state.desktopSiteRequested, true, 'desktop-site mode class should be active');
  assert.equal(await desktopMode.page.locator('.mobile-bottom-nav').isVisible(), false, 'desktop-site mode: mobile bottom navigation must be hidden');
  await desktopMode.page.screenshot({ path: 'artifacts/phone-desktop-site-mode.png' });

  const tablet = await loadAndCheck('tablet touch viewport', {
    viewport: { width: 1024, height: 1366 },
    screen: { width: 1024, height: 1366 },
    isMobile: true, hasTouch: true
  }, false);
  assert.equal(tablet.state.tablet, true);

  const tv = await loadAndCheck('smart TV browser', {
    viewport: { width: 1920, height: 1080 },
    screen: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.5) AppleWebKit/537.36 TV Safari/537.36'
  }, false);
  assert.equal(tv.state.tv, true);
  const tvHeroBox = await tv.page.locator('#dashboard-view .home-feature-row #hero-section').boundingBox();
  assert.ok(tvHeroBox && tvHeroBox.width >= 1800, 'smart TV: homepage hero must use the full desktop canvas');
  await tv.page.screenshot({ path: 'artifacts/smart-tv.png' });

  const desktop = await loadAndCheck('desktop browser', {
    viewport: { width: 1440, height: 900 },
    screen: { width: 1440, height: 900 }
  }, false);

  await desktop.page.screenshot({ path: 'artifacts/desktop.png' });

  console.log('Browser checks passed: phone portrait, phone landscape, drawer open/close, desktop-site mode, tablet, smart TV, desktop.');
  await Promise.all([phone.context.close(), phoneLandscape.context.close(), desktopMode.context.close(), tablet.context.close(), tv.context.close(), desktop.context.close()]);
} finally {
  await browser.close();
}
