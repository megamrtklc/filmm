import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const base = 'http://127.0.0.1:4173';
const output = 'artifacts';
await fs.mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const report = { checks: [], routeChecks: [], imageDiagnostics: [], pageErrors: [] };

async function checkPage(file, label, viewport, mobile) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await context.addInitScript(() => {
    try { localStorage.setItem('perde_theme_preference_v1', 'light'); } catch (_) {}
  });
  const page = await context.newPage();
  page.on('pageerror', error => report.pageErrors.push({ page: label, message: error.message }));

  const cssResponses = [];
  page.on('response', response => {
    if (response.url().includes('/assets/css/themes/light.css')) {
      cssResponses.push({ status: response.status(), url: response.url() });
    }
  });

  await page.goto(`${base}/${file}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const link = document.getElementById('perde-light-theme-css');
    return document.documentElement.dataset.theme === 'light' && link && link.sheet;
  }, null, { timeout: 15000 });
  await page.waitForTimeout(1800);

  // Trigger native lazy-loading before taking full-page screenshots.
  await page.evaluate(async () => {
    const step = Math.max(400, Math.floor(innerHeight * 0.75));
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise(resolve => setTimeout(resolve, 110));
    }
    const images = [...document.images];
    await Promise.race([
      Promise.all(images.map(img => img.complete ? Promise.resolve() : new Promise(resolve => {
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
        setTimeout(resolve, 4500);
      }))),
      new Promise(resolve => setTimeout(resolve, 9000))
    ]);
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(650);

  const imageDiagnostics = await page.evaluate(() => [...document.images].map(img => ({
    src: img.currentSrc || img.src,
    loaded: img.complete && img.naturalWidth > 0,
    naturalWidth: img.naturalWidth,
    loading: img.loading || 'eager',
    alt: img.alt || ''
  })));
  report.imageDiagnostics.push({
    page: label,
    total: imageDiagnostics.length,
    loaded: imageDiagnostics.filter(x => x.loaded).length,
    failed: imageDiagnostics.filter(x => !x.loaded).slice(0, 30)
  });

  const state = await page.evaluate(() => {
    const header = document.querySelector('.site-header, .admin-sidebar');
    const main = document.querySelector('#dashboard-view, .admin-main');
    const rect = element => {
      if (!element) return null;
      const r = element.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
    };
    return {
      theme: document.documentElement.dataset.theme,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      bodyPaddingLeft: getComputedStyle(document.body).paddingLeft,
      header: rect(header),
      main: rect(main),
      viewport: { width: innerWidth, height: innerHeight },
      scrollWidth: document.documentElement.scrollWidth,
      themeController: typeof window.PerdeTheme,
      homepageMainBackground: getComputedStyle(document.querySelector('.homepage-main') || document.body).backgroundColor,
      hero: (() => {
        const hero = document.querySelector('#hero-section');
        const title = document.querySelector('#hero-title');
        const copy = document.querySelector('#hero-section .hero-copy');
        return {
          backgroundColor: hero ? getComputedStyle(hero).backgroundColor : null,
          backgroundImage: hero ? getComputedStyle(hero).backgroundImage : null,
          titleText: title?.textContent?.trim() || '',
          titleOpacity: title ? getComputedStyle(title).opacity : null

        };
      })(),
      rankingNumberColor: (() => {
        const node = document.querySelector('#collection-featured .featured-number');
        return node ? getComputedStyle(node).color : null;
      })(),
      rankingSurfaceBackground: (() => {
        const node = document.querySelector('#collection-featured');
        return node ? getComputedStyle(node).backgroundColor : null;
      })(),
      discoverySurfaceBackground: (() => {
        const node = document.querySelector('#daily-pick-section .mood-gallery-recommendation');
        return node ? getComputedStyle(node).backgroundColor : null;
      })(),
      controlSurfaces: (() => {
        const fixture = document.createElement('div');
        fixture.style.display = 'none';
        fixture.id = 'dashboard-view';
        fixture.innerHTML = `
          <div class="home-mood-continue-row">
          <table class="admin-table"><thead><tr><th>Başlık</th></tr></thead><tbody><tr><td>İçerik</td></tr></tbody></table>
          <select><option>Seçenek</option></select>
          <div class="nav-menu">Menü</div>
          <div class="search-category-menu">Arama</div>
          <section id="daily-pick-section"><div class="mood-gallery-options">Ruh hali</div></section>
          </div>
          <div class="catalog-picker">Katalog</div>
          <div class="modal-content">Pencere</div>
        `;
        document.body.appendChild(fixture);
        const selectors = ['th', 'td', 'select', 'option', '.nav-menu', '.search-category-menu', '.mood-gallery-options', '.catalog-picker', '.modal-content'];
        const values = Object.fromEntries(selectors.map(selector => {
          const node = fixture.querySelector(selector);
          const style = getComputedStyle(node);
          return [selector, { background: style.backgroundColor, color: style.color, colorScheme: style.colorScheme }];
        }));
        fixture.remove();
        return values;
      })(),
      layout: (() => {
        const selectors = [
          'body', '.site-header', '.main-nav', '.homepage-main',
          '.home-feature-row', '#hero-section', '.hero-layout',
          '.home-mood-continue-row', '#collection-featured',
          '.collection-rail', '#catalog-page', '#detail-page-view',
          '#actor-page-view', '.admin-shell', '.admin-sidebar',
          '.admin-main', '.admin-topbar', '.admin-content'
        ];
        const properties = [
          'display', 'position', 'boxSizing', 'width', 'height',
          'minWidth', 'maxWidth', 'minHeight', 'maxHeight',
          'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
          'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
          'gap', 'rowGap', 'columnGap', 'gridTemplateColumns',
          'gridTemplateRows', 'flexDirection', 'alignItems',
          'justifyContent', 'fontFamily', 'fontSize', 'lineHeight',
          'letterSpacing', 'fontWeight', 'textAlign', 'whiteSpace',
          'borderTopWidth', 'borderRightWidth', 'borderBottomWidth',
          'borderLeftWidth', 'borderTopLeftRadius', 'borderTopRightRadius',
          'borderBottomLeftRadius', 'borderBottomRightRadius'
        ];
        return selectors.map(selector => {
          const node = document.querySelector(selector);
          if (!node) return [selector, null];
          const style = getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          return [selector, {
            rect: [rect.x, rect.y, rect.width, rect.height].map(Math.round),
            style: Object.fromEntries(properties.map(property => [property, style[property]]))
          }];
        }).filter(([, value]) => value !== null);
      })()
    };
  });

  if (state.theme !== 'light') throw new Error(`${label}: light theme did not initialize`);
  if (state.themeController !== 'object') throw new Error(`${label}: theme controller is unavailable`);
  if (!cssResponses.some(response => response.status === 200)) {
    throw new Error(`${label}: light stylesheet did not return HTTP 200: ${JSON.stringify(cssResponses)}`);
  }
  if (state.bodyBackground !== 'rgb(243, 244, 246)') {
    throw new Error(`${label}: unexpected light canvas color ${state.bodyBackground}`);
  }
  if (file === 'index.html' && state.homepageMainBackground !== 'rgb(243, 244, 246)') {
    throw new Error(`${label}: homepage content canvas is not light (${state.homepageMainBackground})`);
  }
  if (file === 'index.html' && state.hero.backgroundColor !== 'rgb(255, 255, 255)') {
    throw new Error(`${label}: hero surface is not light (${state.hero.backgroundColor})`);
  }
  if (file === 'index.html' && state.rankingSurfaceBackground !== 'rgb(255, 255, 255)') {
    throw new Error(`${label}: ranking rail is not light (${state.rankingSurfaceBackground})`);
  }
  if (file === 'index.html' && state.discoverySurfaceBackground !== 'rgb(248, 249, 251)') {
    throw new Error(`${label}: mood recommendation card is not light (${state.discoverySurfaceBackground})`);
  }
  if (file === 'index.html' && state.hero.titleText && state.hero.titleOpacity !== '1') {
    throw new Error(`${label}: hero title is visually hidden (opacity ${state.hero.titleOpacity})`);
  }
  if (mobile && file === 'index.html' && state.bodyPaddingLeft !== '0px') {
    throw new Error(`${label}: mobile layout retained desktop sidebar offset (${state.bodyPaddingLeft})`);
  }
  if (file === 'index.html' && state.bodyPaddingLeft !== '0px') {
    throw new Error(`${label}: original horizontal Perde layout should not have a sidebar offset (${state.bodyPaddingLeft})`);
  }
  const surfaces = state.controlSurfaces;
  if (surfaces['th'].background !== 'rgb(243, 244, 246)' ||
      surfaces['td'].background !== 'rgb(255, 255, 255)') {
    throw new Error(`${label}: table surfaces are not using the light palette`);
  }
  for (const selector of ['select', 'option', '.nav-menu', '.search-category-menu',
    '.mood-gallery-options', '.catalog-picker', '.modal-content']) {
    if (surfaces[selector].background !== 'rgb(255, 255, 255)') {
      throw new Error(`${label}: ${selector} surface is not light (${surfaces[selector].background})`);
    }
  }
  if (surfaces['select'].colorScheme !== 'light') {
    throw new Error(`${label}: native form controls are not using light color-scheme`);
  }

  const safeName = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  await page.screenshot({ path: `${output}/${safeName}.png`, fullPage: true, animations: 'disabled' });

  const darkResult = await page.evaluate(() => {
    window.PerdeTheme.apply('dark');
    const selectors = [
      'body', '.site-header', '.main-nav', '.homepage-main',
      '.home-feature-row', '#hero-section', '.hero-layout',
      '.home-mood-continue-row', '#collection-featured',
      '.collection-rail', '#catalog-page', '#detail-page-view',
      '#actor-page-view', '.admin-shell', '.admin-sidebar',
      '.admin-main', '.admin-topbar', '.admin-content'
    ];
    const properties = [
      'display', 'position', 'boxSizing', 'width', 'height',
      'minWidth', 'maxWidth', 'minHeight', 'maxHeight',
      'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
      'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
      'gap', 'rowGap', 'columnGap', 'gridTemplateColumns',
      'gridTemplateRows', 'flexDirection', 'alignItems',
      'justifyContent', 'fontFamily', 'fontSize', 'lineHeight',
      'letterSpacing', 'fontWeight', 'textAlign', 'whiteSpace',
      'borderTopWidth', 'borderRightWidth', 'borderBottomWidth',
      'borderLeftWidth', 'borderTopLeftRadius', 'borderTopRightRadius',
      'borderBottomLeftRadius', 'borderBottomRightRadius'
    ];
    const layout = selectors.map(selector => {
      const node = document.querySelector(selector);
      if (!node) return [selector, null];
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return [selector, {
        rect: [rect.x, rect.y, rect.width, rect.height].map(Math.round),
        style: Object.fromEntries(properties.map(property => [property, style[property]]))
      }];
    }).filter(([, value]) => value !== null);
    return {
      dataTheme: document.documentElement.getAttribute('data-theme'),
      darkClass: document.documentElement.classList.contains('dark'),
      layout
    };
  });
  if (darkResult.dataTheme !== null) throw new Error(`${label}: dark switch left data-theme enabled`);
  if (file === 'index.html' && !darkResult.darkClass) throw new Error(`${label}: homepage dark class was not restored`);
  if (JSON.stringify(state.layout) !== JSON.stringify(darkResult.layout)) {
    throw new Error(`${label}: layout/typography changed when switching theme`);
  }

  report.checks.push({
    page: label,
    viewport,
    mobile,
    stylesheet: cssResponses,
    lightState: state,
    darkRestore: darkResult,
    result: 'passed'
  });

  if (file === 'index.html') {
    const routes = ['#/filmler', '#/diziler', '#/kesfet', '#/listem', '#/kategori/Aksiyon'];
    for (const route of routes) {
      await page.evaluate(value => { location.hash = value; }, route);
      await page.waitForTimeout(900);
      await page.evaluate(async () => {
        const step = Math.max(400, Math.floor(innerHeight * 0.75));
        for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
          window.scrollTo(0, y);
          await new Promise(resolve => setTimeout(resolve, 90));
        }
        await Promise.race([
          Promise.all([...document.images].map(img => img.complete ? Promise.resolve() : new Promise(resolve => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
            setTimeout(resolve, 2500);
          }))),
          new Promise(resolve => setTimeout(resolve, 6000))
        ]);
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(250);
      const routeState = await page.evaluate(() => ({
        hash: location.hash,
        title: document.querySelector('#catalog-page h1, #detail-title, #dashboard-view h1, main h1')?.textContent?.trim() || '',
        visibleViews: [...document.querySelectorAll('#dashboard-view, #catalog-page, #detail-page-view, #actor-page-view')]
          .filter(el => !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none')
          .map(el => el.id),
        scrollWidth: document.documentElement.scrollWidth,
        viewportWidth: innerWidth,
        imageCount: document.images.length,
        brokenImages: [...document.images].filter(img => img.src && img.complete && img.naturalWidth === 0).length
      }));
      report.routeChecks.push({ page: label, route, ...routeState });
      const routeName = route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
      await page.screenshot({ path: `${output}/${label}-${routeName}.png`, fullPage: true, animations: 'disabled' });
      if (routeState.scrollWidth > routeState.viewportWidth) {
        throw new Error(`${label} ${route}: horizontal overflow ${routeState.scrollWidth}px > ${routeState.viewportWidth}px`);
      }
    }
    const firstPoster = page.locator('[data-detail-id]').first();
    if (await firstPoster.count()) {
      await firstPoster.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(900);
      const detailState = await page.evaluate(() => ({
        hash: location.hash,
        title: document.querySelector('#detail-title')?.textContent?.trim() || '',
        visible: !!document.querySelector('#detail-page-view') && !document.querySelector('#detail-page-view').classList.contains('hidden')
      }));
      report.routeChecks.push({ page: label, route: 'detail-card-click', ...detailState });
      if (detailState.visible) {
        await page.screenshot({ path: `${output}/${label}-detail.png`, fullPage: true, animations: 'disabled' });
      }
    }
  }

  if (file === 'admin.html') {
    for (const button of await page.locator('.admin-nav [data-page]').all()) {
      const key = await button.getAttribute('data-page');
      await button.click();
      await page.waitForTimeout(350);
      const active = await page.evaluate(() => ({
        page: document.querySelector('.page-view.active')?.id || '',
        heading: document.querySelector('.page-view.active h1')?.textContent?.trim() || '',
        scrollWidth: document.documentElement.scrollWidth,
        viewportWidth: innerWidth
      }));
      report.routeChecks.push({ page: label, adminTab: key, ...active });
      await page.screenshot({ path: `${output}/${label}-${key}.png`, fullPage: true, animations: 'disabled' });
      if (active.scrollWidth > active.viewportWidth) {
        throw new Error(`${label} admin tab ${key}: horizontal overflow ${active.scrollWidth}px > ${active.viewportWidth}px`);
      }
    }
  }
  await context.close();
}

try {
  await checkPage('index.html', 'homepage-desktop', { width: 1440, height: 1000 }, false);
  await checkPage('index.html', 'homepage-mobile', { width: 390, height: 844 }, true);
  await checkPage('admin.html', 'admin-desktop', { width: 1440, height: 1000 }, false);
  await checkPage('admin.html', 'admin-mobile', { width: 390, height: 844 }, true);
  await fs.writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await fs.writeFile(`${output}/report.json`, JSON.stringify({ ...report, failure: error.message }, null, 2));
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
