/*
 * Perde theme controller
 * Loaded only after explicit integration. No theme is applied by default,
 * so existing dark mode remains visually and behaviorally unchanged.
 */
(() => {
  'use strict';

  const STORAGE_KEY = 'perde_theme_preference_v1';
  const LIGHT_STYLESHEET = 'assets/css/themes/light.css';
  const rootInitiallyHadDarkClass = document.documentElement.classList.contains('dark');
  const originalThemeColor = document.querySelector('meta[name="theme-color"]')?.getAttribute('content') || '#0b0c10';

  function ensureLightStylesheet() {
    let link = document.getElementById('perde-light-theme-css');
    if (!link) {
      link = document.createElement('link');
      link.id = 'perde-light-theme-css';
      link.rel = 'stylesheet';
      link.href = LIGHT_STYLESHEET;
      document.head.appendChild(link);
    }
    return link;
  }

  function apply(theme, persist = true) {
    const next = theme === 'light' ? 'light' : 'dark';
    const root = document.documentElement;

    if (next === 'light') {
      ensureLightStylesheet();
      root.setAttribute('data-theme', 'light');
      if (rootInitiallyHadDarkClass) root.classList.remove('dark');
    } else {
      root.removeAttribute('data-theme');
      if (rootInitiallyHadDarkClass) root.classList.add('dark');
    }

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', next === 'light' ? '#f4f5f7' : originalThemeColor);

    if (persist) {
      try { localStorage.setItem(STORAGE_KEY, next); } catch (_) {}
    }

    document.dispatchEvent(new CustomEvent('perde:themechange', { detail: { theme: next } }));
    return next;
  }

  function get() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }

  function toggle() {
    return apply(get() === 'light' ? 'dark' : 'light');
  }

  function init() {
    let saved = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch (_) {}
    if (saved === 'light') apply('light', false);
  }

  window.PerdeTheme = Object.freeze({ apply, get, toggle, init });
  init();
})();
