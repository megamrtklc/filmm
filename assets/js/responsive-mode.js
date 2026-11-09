/* PERDE — viewport / touch responsive mode helper (homepage only) */
(function () {
  'use strict';
  var root = document.documentElement;
  if (!root) return;

  function updateResponsiveMode() {
    var width = Math.max(
      window.innerWidth || 0,
      document.documentElement.clientWidth || 0
    );
    var touchCapable = (
      (navigator.maxTouchPoints || 0) > 0 ||
      ('ontouchstart' in window)
    );
    var compactDesktopViewport = touchCapable && width >= 768 && width <= 1100;
    root.classList.toggle('perde-touch-compact', compactDesktopViewport);
  }

  updateResponsiveMode();
  window.addEventListener('resize', updateResponsiveMode, { passive: true });
  window.addEventListener('orientationchange', updateResponsiveMode, { passive: true });
})();
