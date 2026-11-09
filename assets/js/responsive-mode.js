/* PERDE — viewport / touch / TV responsive mode helper */
(function () {
  'use strict';
  var root = document.documentElement;
  if (!root) return;

  function updateResponsiveMode() {
    var width = Math.max(window.innerWidth || 0, root.clientWidth || 0);
    var screenWidth = (window.screen && window.screen.width) || 0;
    var screenHeight = (window.screen && window.screen.height) || 0;
    var touchCapable = (
      (navigator.maxTouchPoints || 0) > 0 ||
      ('ontouchstart' in window)
    );
    var userAgent = navigator.userAgent || '';
    var smartTvBrowser = /SMART-TV|SMARTTV|Tizen|Web0S|WebOS|NetCast|HbbTV|BRAVIA|AFT[A-Z0-9]*/i.test(userAgent);
    var widePhysicalDisplay = screenWidth >= 1400 ||
      (screenWidth >= 1200 && screenHeight >= 650 &&
       screenWidth / Math.max(screenHeight, 1) >= 1.55 && !touchCapable);
    var tvWide = smartTvBrowser || (widePhysicalDisplay && width <= 1100);
    var phoneDevice = touchCapable && screenWidth > 0 && screenHeight > 0 && Math.min(screenWidth, screenHeight) <= 600;
    var compactDesktopViewport = !tvWide && !phoneDevice && touchCapable && width >= 768 && width <= 1100;

    root.classList.toggle('perde-tv-wide', tvWide);
    root.classList.toggle('perde-phone-device', phoneDevice);
    root.classList.toggle('perde-touch-compact', compactDesktopViewport);
  }

  updateResponsiveMode();
  window.addEventListener('resize', updateResponsiveMode, { passive: true });
  window.addEventListener('orientationchange', updateResponsiveMode, { passive: true });
})();
