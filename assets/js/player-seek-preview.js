/* Desktop seek hover preview: capture real media URLs and support MP4, HLS and DASH. */
(() => {
  'use strict';
  if (!window.matchMedia('(min-width: 1024px)').matches) return;

  const video = document.getElementById('player-video');
  const seek = document.getElementById('player-seek');
  const controls = document.getElementById('player-controls');
  const preview = document.getElementById('player-seek-preview');
  const timeLabel = document.getElementById('player-seek-preview-time');
  const canvas = document.getElementById('player-seek-preview-canvas');
  if (!video || !seek || !controls || !preview || !timeLabel || !canvas) return;

  const ctx = canvas.getContext('2d');
  let previewVideo = null;
  let previewSource = '';
  let activeSource = '';
  let previewHls = null;
  let previewDash = null;
  let frameReady = false;
  let lastRequested = -1;
  let seekToken = 0;
  let raf = 0;
  let failedSource = '';

  const formatTime = value => {
    if (!Number.isFinite(value) || value < 0) return '00:00';
    const total = Math.floor(value);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return hours
      ? [hours, minutes, seconds].map(n => String(n).padStart(2, '0')).join(':')
      : [minutes, seconds].map(n => String(n).padStart(2, '0')).join(':');
  };

  function stopPreviewSource() {
    if (previewHls) {
      try { previewHls.destroy(); } catch (_) {}
      previewHls = null;
    }
    if (previewDash) {
      try { previewDash.reset(); } catch (_) {}
      previewDash = null;
    }
    if (previewVideo) {
      previewVideo.pause();
      previewVideo.removeAttribute('src');
      previewVideo.load();
    }
    previewVideo = null;
    previewSource = '';
    frameReady = false;
    lastRequested = -1;
    seekToken++;
    canvas.hidden = true;
  }

  function resolveSource() {
    const current = video.currentSrc || '';
    if (activeSource) return activeSource;
    if (current && !current.startsWith('blob:')) return current;
    const declared = video.getAttribute('src') || '';
    return declared && !declared.startsWith('blob:') ? declared : '';
  }

  function markReady() {
    if (previewVideo && previewVideo.readyState >= 2) frameReady = true;
  }

  function prepareFrameSource() {
    const source = resolveSource();
    if (!source || !/^https?:/i.test(source) || source === failedSource) return;
    if (previewVideo && previewSource === source) return;

    stopPreviewSource();
    previewSource = source;
    previewVideo = document.createElement('video');
    previewVideo.muted = true;
    previewVideo.playsInline = true;
    previewVideo.preload = 'auto';
    previewVideo.crossOrigin = 'anonymous';
    previewVideo.addEventListener('loadeddata', markReady);
    previewVideo.addEventListener('canplay', markReady);
    previewVideo.addEventListener('error', () => {
      frameReady = false;
      failedSource = source;
      canvas.hidden = true;
    });

    if (/\.m3u8(?:$|[?#])/i.test(source) && window.Hls && window.Hls.isSupported()) {
      previewHls = new window.Hls({
        enableWorker: true,
        capLevelToPlayerSize: true,
        startLevel: 0,
        maxBufferLength: 12,
        maxMaxBufferLength: 20
      });
      previewHls.on(window.Hls.Events.ERROR, (_event, data) => {
        if (data && data.fatal) {
          frameReady = false;
          failedSource = source;
          canvas.hidden = true;
        }
      });
      previewHls.loadSource(source);
      previewHls.attachMedia(previewVideo);
      return;
    }

    if (/\.mpd(?:$|[?#])/i.test(source) && window.dashjs) {
      previewDash = window.dashjs.MediaPlayer().create();
      previewDash.initialize(previewVideo, source, false);
      previewDash.on(window.dashjs.MediaPlayer.events.ERROR, () => {
        frameReady = false;
        failedSource = source;
        canvas.hidden = true;
      });
      return;
    }

    previewVideo.src = source;
    previewVideo.load();
  }

  function drawCurrentFrame(token) {
    if (token !== seekToken || !previewVideo || !ctx || previewVideo.readyState < 2) return;
    try {
      ctx.drawImage(previewVideo, 0, 0, canvas.width, canvas.height);
      canvas.hidden = false;
    } catch (_) {
      // The media host may deny cross-origin canvas access.
      canvas.hidden = true;
      failedSource = previewSource;
    }
  }

  function showFrameAt(seconds) {
    if (!previewVideo || !frameReady || !Number.isFinite(previewVideo.duration)) return;
    if (Math.abs(seconds - lastRequested) < 0.65) return;
    lastRequested = seconds;
    const token = ++seekToken;
    const target = Math.max(0, Math.min(seconds, Math.max(0, previewVideo.duration - 0.08)));

    if (Math.abs(previewVideo.currentTime - target) < 0.25 && previewVideo.readyState >= 2) {
      drawCurrentFrame(token);
      return;
    }

    const onSeeked = () => {
      previewVideo.removeEventListener('seeked', onSeeked);
      drawCurrentFrame(token);
    };
    previewVideo.addEventListener('seeked', onSeeked);
    try {
      previewVideo.currentTime = target;
    } catch (_) {
      previewVideo.removeEventListener('seeked', onSeeked);
      canvas.hidden = true;
    }
  }

  function updateFromPointer(clientX) {
    const rect = seek.getBoundingClientRect();
    if (!rect.width) return;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const seconds = ratio * duration;
    const controlRect = controls.getBoundingClientRect();
    const x = Math.max(88, Math.min(controls.clientWidth - 88, clientX - controlRect.left));
    preview.style.left = x + 'px';
    timeLabel.textContent = formatTime(seconds) + ' / ' + formatTime(duration);
    preview.classList.add('is-visible');
    prepareFrameSource();
    showFrameAt(seconds);
  }

  // player-pro.js wraps this function for adaptive streams; capture the original URL
  // before HLS.js/DASH.js replaces the media element's currentSrc with a blob URL.
  if (typeof window.attachPlayerSource === 'function' && !window.__perdeSeekSourceHooked) {
    const originalAttach = window.attachPlayerSource;
    window.attachPlayerSource = function (url) {
      activeSource = String(url || '');
      failedSource = '';
      stopPreviewSource();
      return originalAttach.apply(this, arguments);
    };
    window.__perdeSeekSourceHooked = true;
  }

  seek.addEventListener('pointerenter', event => updateFromPointer(event.clientX));
  seek.addEventListener('pointermove', event => {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      raf = 0;
      updateFromPointer(event.clientX);
    });
  });
  seek.addEventListener('pointerleave', () => {
    preview.classList.remove('is-visible');
    seekToken++;
  });
  seek.addEventListener('focus', () => {
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const seconds = duration * Number(seek.value) / 1000;
    const rect = seek.getBoundingClientRect();
    updateFromPointer(rect.left + rect.width * (duration ? seconds / duration : 0));
  });
  seek.addEventListener('blur', () => preview.classList.remove('is-visible'));
  video.addEventListener('emptied', () => {
    stopPreviewSource();
    failedSource = '';
  });
})();
