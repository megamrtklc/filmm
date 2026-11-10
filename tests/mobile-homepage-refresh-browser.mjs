import { chromium } from 'playwright';
import assert from 'node:assert/strict';

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

  const phoneLandscape = await loadAndCheck('phone landscape', {
    viewport: { width: 844, height: 390 },
    screen: { width: 844, height: 390 },
    isMobile: true, hasTouch: true
  }, true);

  const desktopMode = await loadAndCheck('phone with desktop site requested', {
    viewport: { width: 980, height: 844 },
    screen: { width: 390, height: 844 },
    isMobile: true, hasTouch: true
  }, false);

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

  const desktop = await loadAndCheck('desktop browser', {
    viewport: { width: 1440, height: 900 },
    screen: { width: 1440, height: 900 }
  }, false);

  console.log('Browser checks passed: phone portrait, phone landscape, drawer open/close, desktop-site mode, tablet, smart TV, desktop.');
  await Promise.all([phone.context.close(), phoneLandscape.context.close(), desktopMode.context.close(), tablet.context.close(), tv.context.close(), desktop.context.close()]);
} finally {
  await browser.close();
}
