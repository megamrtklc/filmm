/* Desktop seek hover preview: always show the target time; show a frame when the source permits canvas capture. */
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
  let lastRequested = -1;
  let frameReady = false;
  let seekToken = 0;
  let raf = 0;

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

  function prepareFrameSource() {
    const source = video.currentSrc || '';
    if (!source || source.startsWith('blob:') || source.startsWith('data:') || !/^https?:/i.test(source)) return;
    if (previewVideo && previewSource === source) return;
    if (previewVideo) {
      previewVideo.removeAttribute('src');
      previewVideo.load();
    }
    previewVideo = document.createElement('video');
    previewVideo.muted = true;
    previewVideo.playsInline = true;
    previewVideo.preload = 'auto';
    previewVideo.crossOrigin = 'anonymous';
    previewVideo.addEventListener('loadedmetadata', () => { frameReady = true; }, { once: true });
    previewVideo.addEventListener('error', () => { frameReady = false; }, { once: true });
    previewSource = source;
    frameReady = false;
    lastRequested = -1;
    previewVideo.src = source;
    previewVideo.load();
  }

  function showFrameAt(seconds) {
    if (!previewVideo || !frameReady || !Number.isFinite(previewVideo.duration)) return;
    if (Math.abs(seconds - lastRequested) < 0.8) return;
    lastRequested = seconds;
    const token = ++seekToken;
    const draw = () => {
      if (token !== seekToken || !ctx || previewVideo.readyState < 2) return;
      try {
        ctx.drawImage(previewVideo, 0, 0, canvas.width, canvas.height);
        canvas.hidden = false;
      } catch (_) {
        canvas.hidden = true;
      }
    };
    if (Math.abs(previewVideo.currentTime - seconds) < 0.25 && previewVideo.readyState >= 2) {
      draw();
      return;
    }
    const onSeeked = () => {
      previewVideo.removeEventListener('seeked', onSeeked);
      draw();
    };
    previewVideo.addEventListener('seeked', onSeeked);
    try {
      previewVideo.currentTime = Math.max(0, Math.min(seconds, Math.max(0, previewVideo.duration - 0.05)));
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
    const x = Math.max(88, Math.min(controls.clientWidth - 88, clientX - controls.getBoundingClientRect().left));
    preview.style.left = x + 'px';
    timeLabel.textContent = formatTime(seconds) + ' / ' + formatTime(duration);
    preview.classList.add('is-visible');
    prepareFrameSource();
    showFrameAt(seconds);
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
    if (previewVideo) {
      previewVideo.removeAttribute('src');
      previewVideo.load();
    }
    previewVideo = null;
    previewSource = '';
    frameReady = false;
    canvas.hidden = true;
    preview.classList.remove('is-visible');
  });
})();