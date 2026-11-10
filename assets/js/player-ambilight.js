/* Perde desktop player — extract four poster colors and paint a restrained ambilight. */
(function () {
  'use strict';
  const modal = document.getElementById('player-modal');
  const poster = document.getElementById('player-info-poster');
  const main = modal && modal.querySelector('.ny7-player-main-column');
  if (!modal || !poster || !main || window.__perdeFourColorAmbilight) return;
  window.__perdeFourColorAmbilight = true;

  const cssVars = ['--ambilight-one', '--ambilight-two', '--ambilight-three', '--ambilight-four'];
  let requestId = 0;
  let lastSource = '';

  function reset() {
    cssVars.forEach(name => main.style.removeProperty(name));
    main.removeAttribute('data-ambilight');
  }
  function rgbToHex(rgb) {
    return '#' + rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  }
  function rgbToHsl([r, g, b]) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (d) {
      s = d / (1 - Math.abs(2 * l - 1));
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    return [h, s, l];
  }
  function extractFourColors(image) {
    const canvas = document.createElement('canvas');
    const width = 48, height = 48;
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.drawImage(image, 0, 0, width, height);
    const pixels = ctx.getImageData(0, 0, width, height).data;
    const samples = [];
    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        const i = (y * width + x) * 4;
        if (pixels[i + 3] < 180) continue;
        const rgb = [pixels[i], pixels[i + 1], pixels[i + 2]];
        const [h, s, l] = rgbToHsl(rgb);
        if (l < .07 || l > .94) continue;
        samples.push({ rgb, h, s, l, weight: .45 + s * .85 });
      }
    }
    if (samples.length < 4) throw new Error('Not enough poster color samples');

    // Seed four hue-separated centers from the most colorful poster pixels.
    const vivid = samples.slice().sort((a, b) => b.weight - a.weight);
    const centers = [];
    for (const candidate of vivid) {
      if (!centers.length || centers.every(c => Math.min(Math.abs(c.h - candidate.h), 360 - Math.abs(c.h - candidate.h)) > 42)) {
        centers.push({ h: candidate.h, rgb: candidate.rgb.slice() });
        if (centers.length === 4) break;
      }
    }
    while (centers.length < 4) {
      const candidate = vivid[Math.floor((centers.length / 4) * (vivid.length - 1))];
      centers.push({ h: candidate.h, rgb: candidate.rgb.slice() });
    }

    // Lightweight weighted k-means in RGB space.
    let assignments = [];
    for (let iteration = 0; iteration < 7; iteration++) {
      const sums = centers.map(() => [0, 0, 0, 0]);
      assignments = samples.map(sample => {
        let best = 0, bestDistance = Infinity;
        centers.forEach((center, index) => {
          const d = sample.rgb.reduce((sum, value, channel) => sum + Math.pow(value - center.rgb[channel], 2), 0);
          if (d < bestDistance) { bestDistance = d; best = index; }
        });
        const sum = sums[best], w = sample.weight;
        sum[0] += sample.rgb[0] * w; sum[1] += sample.rgb[1] * w; sum[2] += sample.rgb[2] * w; sum[3] += w;
        return best;
      });
      centers.forEach((center, index) => {
        const sum = sums[index];
        if (sum[3]) center.rgb = [sum[0] / sum[3], sum[1] / sum[3], sum[2] / sum[3]];
        const [h] = rgbToHsl(center.rgb); center.h = h;
      });
    }
    const counts = centers.map((_, index) => assignments.filter(value => value === index).length);
    return centers
      .map((center, index) => ({ color: center.rgb, count: counts[index] }))
      .sort((a, b) => b.count - a.count)
      .map(entry => rgbToHex(entry.color));
  }

  function applyPalette(colors) {
    colors.forEach((color, index) => main.style.setProperty(cssVars[index], color));
    main.dataset.ambilight = 'ready';
  }

  function loadPosterPalette(source, id) {
    if (!source) { reset(); return; }
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onload = () => {
      if (id !== requestId) return;
      try { applyPalette(extractFourColors(image)); }
      catch (_) {
        // If the poster host blocks canvas access, don't show unrelated guessed colors.
        reset();
        main.dataset.ambilight = 'unavailable';
      }
    };
    image.onerror = () => {
      if (id === requestId) { reset(); main.dataset.ambilight = 'unavailable'; }
    };
    image.src = source;
  }

  function refresh() {
    const declaredSource = poster.getAttribute('src') || '';
    const source = poster.currentSrc || declaredSource;
    if (!source || source === lastSource) return;
    lastSource = source;
    const id = ++requestId;
    reset();
    loadPosterPalette(source, id);
  }

  const observer = new MutationObserver(refresh);
  observer.observe(poster, { attributes: true, attributeFilter: ['src', 'srcset'] });
  poster.addEventListener('load', refresh);
  const modalObserver = new MutationObserver(() => {
    if (!modal.classList.contains('hidden')) refresh();
  });
  modalObserver.observe(modal, { attributes: true, attributeFilter: ['class'] });
  refresh();
})();