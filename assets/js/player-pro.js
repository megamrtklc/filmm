/* Perde Pro Player - isolated enhancement layer. Keeps catalog code untouched. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const video = $('player-video');
  if (!video || window.__perdeProPlayerInstalled) return;
  window.__perdeProPlayerInstalled = true;

  const KEYS = {
    progress: 'perde_player_progress_v3',
    stats: 'perde_player_stats_v3',
    markers: 'perde_player_markers_v2'
  };
  let mediaId = null, hls = null, dash = null, lastTick = 0, resumedForSource = false;
  let originalAttach = window.attachPlayerSource;
  let originalOpen = window.openPlayerForMedia;
  let originalClose = window.closePlayer;

  function read(key) {
    try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; }
    catch (_) { return {}; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch (error) { console.warn('Perde oynatıcı kaydı yapılamadı:', error); }
  }
  function setOptions(id, items, placeholder) {
    const select = $(id);
    if (!select) return;
    select.replaceChildren();
    const first = document.createElement('option');
    first.value = id === 'player-subtitle-track' ? '-1' : '';
    first.textContent = placeholder;
    select.appendChild(first);
    items.forEach(item => {
      const option = document.createElement('option');
      option.value = String(item.value);
      option.textContent = item.label;
      select.appendChild(option);
    });
    select.disabled = items.length === 0;
  }
  function destroyAdaptive() {
    if (hls) { try { hls.destroy(); } catch (_) {} hls = null; }
    if (dash) { try { dash.reset(); } catch (_) {} dash = null; }
  }
  function markerData() { return read(KEYS.markers)[String(mediaId)] || {}; }
  function refreshStats() {
    const stat = read(KEYS.stats)[String(mediaId)] || { seconds: 0, completed: 0 };
    if ($('player-stat-minutes')) $('player-stat-minutes').textContent = Math.floor((stat.seconds || 0) / 60) + ' dk';
    if ($('player-stat-completed')) $('player-stat-completed').textContent = String(stat.completed || 0);
  }
  function addWatchTime(delta) {
    if (!mediaId || !Number.isFinite(delta) || delta <= 0 || delta > 8) return;
    const all = read(KEYS.stats), key = String(mediaId);
    const stat = all[key] || { seconds: 0, completed: 0 };
    stat.seconds = (stat.seconds || 0) + delta;
    all[key] = stat;
    write(KEYS.stats, all);
    refreshStats();
  }
  function saveProgress() {
    if (!mediaId || !Number.isFinite(video.duration) || video.duration <= 0) return;
    const all = read(KEYS.progress), key = String(mediaId);
    if (video.ended || video.duration - video.currentTime < 25) delete all[key];
    else all[key] = { time: video.currentTime, duration: video.duration, savedAt: Date.now() };
    write(KEYS.progress, all);
  }
  function resumeProgress() {
    if (resumedForSource || !mediaId || !Number.isFinite(video.duration) || video.duration <= 0) return;
    resumedForSource = true;
    const saved = read(KEYS.progress)[String(mediaId)];
    if (!saved || saved.time < 15 || saved.time >= video.duration - 25) return;
    if (Math.abs((saved.duration || 0) - video.duration) > Math.max(120, video.duration * 0.08)) return;
    video.currentTime = saved.time;
    const note = $('player-resume-note');
    if (note) {
      note.textContent = 'Kaldığın yerden devam ediyorsun · ' + Math.floor(saved.time / 60) + ' dk';
      note.hidden = false;
      window.setTimeout(() => { note.hidden = true; }, 4500);
    }
  }
  function updateSkipButtons() {
    const m = markerData(), now = video.currentTime || 0;
    const intro = $('player-skip-intro'), credits = $('player-skip-credits');
    if (intro) intro.hidden = !(m.introStart != null && m.introEnd > m.introStart && now >= m.introStart && now < m.introEnd);
    if (credits) credits.hidden = !(m.creditsStart != null && Number.isFinite(video.duration) && now >= m.creditsStart && !video.ended);
  }
  function refreshTrackSelects() {
    const tracks = Array.from(video.textTracks || []);
    setOptions('player-subtitle-track', tracks.map((t, i) => ({ value: i, label: t.label || t.language || ('Altyazı ' + (i + 1)) })), 'Altyazı kapalı');
    tracks.forEach(t => { t.mode = 'disabled'; });
  }
  function attachAdaptive(url) {
    destroyAdaptive();
    video.pause();
    video.removeAttribute('src');
    video.replaceChildren();
    video.load();
    if ($('player-empty-state')) $('player-empty-state').hidden = true;
    if ($('player-error')) { $('player-error').hidden = true; $('player-error').textContent = ''; }
    setOptions('player-quality', [], 'Kalite');
    setOptions('player-audio-track', [], 'Ses parçası');

    if (/\.m3u8(?:$|[?#])/i.test(url) && window.Hls && window.Hls.isSupported()) {
      hls = new window.Hls({ enableWorker: true, capLevelToPlayerSize: true, startLevel: -1 });
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
        const levels = hls.levels.map((level, index) => ({
          value: index, label: level.height ? level.height + 'p' : Math.round((level.bitrate || 0) / 1000) + ' kbps'
        }));
        setOptions('player-quality', [{ value: -1, label: 'Otomatik' }, ...levels], 'Görüntü kalitesi');
        const tracks = hls.audioTracks.map((track, index) => ({
          value: index, label: track.name || track.lang || ('Ses ' + (index + 1))
        }));
        setOptions('player-audio-track', tracks, 'Ses dili');
        video.play().catch(() => {});
      });
      hls.on(window.Hls.Events.ERROR, (_event, data) => {
        if (data.fatal && $('player-error')) {
          $('player-error').textContent = 'HLS yayını açılamadı. Kaynağın erişim ve yayın izinlerini kontrol et.';
          $('player-error').hidden = false;
        }
      });
      return true;
    }
    if (/\.mpd(?:$|[?#])/i.test(url) && window.dashjs) {
      dash = window.dashjs.MediaPlayer().create();
      dash.initialize(video, url, true);
      dash.on(window.dashjs.MediaPlayer.events.STREAM_INITIALIZED, () => {
        const levels = dash.getBitrateInfoListFor('video') || [];
        setOptions('player-quality', [{ value: -1, label: 'Otomatik' }, ...levels.map((level, index) => ({
          value: index, label: level.height ? level.height + 'p' : Math.round((level.bitrate || 0) / 1000) + ' kbps'
        }))], 'Görüntü kalitesi');
        const tracks = dash.getTracksFor('audio') || [];
        setOptions('player-audio-track', tracks.map((track, index) => ({
          value: index, label: track.lang || track.labels?.[0]?.text || ('Ses ' + (index + 1))
        })), 'Ses dili');
      });
      dash.on(window.dashjs.MediaPlayer.events.ERROR, () => {
        if ($('player-error')) {
          $('player-error').textContent = 'DASH yayını yüklenemedi. Kaynağı ve erişim izinlerini kontrol et.';
          $('player-error').hidden = false;
        }
      });
      return true;
    }
    return false;
  }

  if (typeof originalAttach === 'function') {
    window.attachPlayerSource = function (url, label) {
      clearOnlineSubtitles();
      resumedForSource = false;
      const source = String(url || '');
      if (/\.m3u8(?:$|[?#])|\.mpd(?:$|[?#])/i.test(source) && attachAdaptive(source)) return;
      destroyAdaptive();
      if ($('player-quality')) setOptions('player-quality', [], 'Tek kalite kaynağı');
      if ($('player-audio-track')) setOptions('player-audio-track', [], 'Ek ses parçası yok');
      return originalAttach.call(this, url, label);
    };
  }
  if (typeof originalOpen === 'function') {
    window.openPlayerForMedia = function (id) {
      clearOnlineSubtitles();
      mediaId = String(id);
      resumedForSource = false;
      const result = originalOpen.apply(this, arguments);
      refreshStats();
      loadMarkers();
      return result;
    };
  }
  if (typeof originalClose === 'function') {
    window.closePlayer = function () {
      saveProgress();
      clearOnlineSubtitles();
      destroyAdaptive();
      lastTick = 0;
      const result = originalClose.apply(this, arguments);
      mediaId = null;
      return result;
    };
  }

  function loadMarkers() {
    const m = markerData();
    [['player-intro-start', m.introStart], ['player-intro-end', m.introEnd], ['player-credits-start', m.creditsStart]]
      .forEach(([id, value]) => { if ($(id)) $(id).value = value == null ? '' : value; });
    updateSkipButtons();
  }
  function saveMarkers() {
    if (!mediaId) return;
    const get = id => {
      const raw = $(id)?.value;
      if (raw === '' || raw == null) return null;
      const value = Number(raw);
      return Number.isFinite(value) && value >= 0 ? value : null;
    };
    const all = read(KEYS.markers);
    all[String(mediaId)] = {
      introStart: get('player-intro-start'),
      introEnd: get('player-intro-end'),
      creditsStart: get('player-credits-start')
    };
    write(KEYS.markers, all);
    if ($('player-error')) {
      $('player-error').textContent = 'Atlama zamanları bu film için bu cihazda kaydedildi.';
      $('player-error').hidden = false;
    }
    updateSkipButtons();
  }
  function applySubtitleStyle() {
    const size = $('player-subtitle-size')?.value || '22px';
    const color = $('player-subtitle-color')?.value || '#ffffff';
    const bg = $('player-subtitle-bg')?.value || '0.65';
    let style = $('player-subtitle-dynamic-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'player-subtitle-dynamic-style';
      document.head.appendChild(style);
    }
    style.textContent = '#player-video::cue{font-size:' + size + ';color:' + color + ';background:rgba(0,0,0,' + bg + ');}';
  }

  // OpenSubtitles online subtitle search (isolated from catalog/player core).
  const SUBTITLE_WORKER = 'https://perde-subtitles.oyunmrtklc.workers.dev';
  let onlineSubtitleUrls = [];
  let onlineSubtitleRequest = 0;

  function clearOnlineSubtitles() {
    onlineSubtitleRequest++;
    video.querySelectorAll('track[data-perde-online="true"]').forEach(track => track.remove());
    onlineSubtitleUrls.forEach(url => URL.revokeObjectURL(url));
    onlineSubtitleUrls = [];
    refreshTrackSelects();
  }

  function subtitlePanel() {
    let panel = document.querySelector('.perde-online-subtitles');
    if (panel) return panel;
    const anchor = document.querySelector('.ny7-player-subtitle');
    if (!anchor) return null;
    panel = document.createElement('section');
    panel.className = 'perde-online-subtitles';
    panel.innerHTML = '<div class="perde-online-subtitles-head"><div><strong>Çevrim içi altyazı</strong><small>OpenSubtitles üzerinden ara</small></div><button type="button" class="perde-subtitle-search">Altyazı ara</button></div><p class="perde-subtitle-status" role="status">Film açıldığında Türkçe altyazı arayabilirsin.</p><div class="perde-subtitle-results"></div>';
    anchor.insertAdjacentElement('afterend', panel);
    panel.querySelector('.perde-subtitle-search').addEventListener('click', searchOnlineSubtitles);
    return panel;
  }

  function subtitleStatus(message, isError) {
    const panel = subtitlePanel();
    if (!panel) return;
    const status = panel.querySelector('.perde-subtitle-status');
    status.textContent = message;
    status.classList.toggle('is-error', !!isError);
  }

  function mediaSearchDetails() {
    const raw = String($('player-media-title')?.textContent || '').trim();
    const match = raw.match(/^(.*?)\s*[·|–-]\s*(\d{4})$/);
    return { title: (match?.[1] || raw).trim(), year: match?.[2] || '' };
  }

  function renderOnlineSubtitleResults(items, requestId) {
    if (requestId !== onlineSubtitleRequest) return;
    const panel = subtitlePanel();
    if (!panel) return;
    const results = panel.querySelector('.perde-subtitle-results');
    results.replaceChildren();
    const entries = [];
    (Array.isArray(items) ? items : []).forEach(item => {
      const attrs = item?.attributes || {};
      (Array.isArray(attrs.files) ? attrs.files : []).forEach(file => {
        if (file?.file_id) entries.push({ fileId: file.file_id, language: attrs.language || '', release: attrs.release || attrs.feature_details?.title || 'Altyazı', downloads: Number(attrs.download_count) || 0, rating: attrs.ratings });
      });
    });
    if (!entries.length) {
      subtitleStatus('Bu yapım için altyazı bulunamadı. Başka bir kaynak veya başlık deneyebilirsin.', false);
      return;
    }
    subtitleStatus(entries.length + ' altyazı bulundu. Türkçe sonuçlar üstte listelenir.', false);
    entries.slice(0, 12).forEach(entry => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'perde-subtitle-result';
      const language = entry.language === 'tr' ? 'Türkçe' : entry.language.toUpperCase();
      button.textContent = language + ' · ' + entry.release + (entry.downloads ? ' · ' + entry.downloads.toLocaleString('tr-TR') + ' indirme' : '');
      button.addEventListener('click', () => downloadOnlineSubtitle(entry, button));
      results.appendChild(button);
    });
  }

  function srtToVtt(source) {
    let text = String(source || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
    if (/^WEBVTT(?:\s|$)/i.test(text)) return text;
    text = text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
    return 'WEBVTT\n\n' + text;
  }

  async function searchOnlineSubtitles() {
    const panel = subtitlePanel();
    if (!panel) return;
    const details = mediaSearchDetails();
    if (!details.title) { subtitleStatus('Önce bir film açmalısın.', true); return; }
    clearOnlineSubtitles();
    // clearOnlineSubtitles invalidates the previous request; use the new request id.
    const activeRequest = onlineSubtitleRequest;
    panel.querySelector('.perde-subtitle-results').replaceChildren();
    const searchButton = panel.querySelector('.perde-subtitle-search');
    searchButton.disabled = true;
    searchButton.textContent = 'Aranıyor…';
    subtitleStatus('Türkçe altyazılar aranıyor…', false);
    try {
      const params = new URLSearchParams({ query: details.title, type: 'movie', languages: 'tr,en' });
      if (details.year) params.set('year', details.year);
      const response = await fetch(SUBTITLE_WORKER + '/subtitles?' + params.toString(), { headers: { Accept: 'application/json' } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Altyazı araması başarısız oldu (' + response.status + ').');
      renderOnlineSubtitleResults(payload.data, activeRequest);
    } catch (error) {
      if (activeRequest === onlineSubtitleRequest) subtitleStatus(error.message || 'Altyazı aranırken bir hata oluştu.', true);
    } finally {
      searchButton.disabled = false;
      searchButton.textContent = 'Yeniden ara';
    }
  }

  async function downloadOnlineSubtitle(entry, button) {
    const panel = subtitlePanel();
    if (!panel) return;
    const label = button.textContent;
    button.disabled = true;
    button.textContent = 'İndiriliyor…';
    subtitleStatus('Altyazı indiriliyor ve oynatıcıya ekleniyor…', false);
    try {
      const response = await fetch(SUBTITLE_WORKER + '/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/plain' },
        body: JSON.stringify({ file_id: entry.fileId })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Altyazı indirilemedi (' + response.status + ').');
      }
      const source = await response.text();
      if (!source || /<html[\s>]/i.test(source.slice(0, 300))) throw new Error('İndirilen altyazı dosyası geçerli görünmüyor.');
      const blob = new Blob([srtToVtt(source)], { type: 'text/vtt;charset=utf-8' });
      const objectUrl = URL.createObjectURL(blob);
      onlineSubtitleUrls.push(objectUrl);
      const track = document.createElement('track');
      track.dataset.perdeOnline = 'true';
      track.kind = 'subtitles';
      track.label = entry.language === 'tr' ? 'Türkçe (OpenSubtitles)' : entry.language.toUpperCase() + ' (OpenSubtitles)';
      track.srclang = entry.language || 'tr';
      track.src = objectUrl;
      track.default = true;
      track.addEventListener('load', () => {
        const tracks = Array.from(video.textTracks || []);
        tracks.forEach((item, index) => { item.mode = item === track.track ? 'showing' : 'disabled'; });
        refreshTrackSelects();
        const select = $('player-subtitle-track');
        if (select) {
          const index = tracks.indexOf(track.track);
          if (index >= 0) { select.value = String(index); track.track.mode = 'showing'; }
        }
      }, { once: true });
      video.appendChild(track);
      refreshTrackSelects();
      subtitleStatus('Altyazı yüklendi. Altyazı seçeneğinden açıp kapatabilirsin.', false);
    } catch (error) {
      subtitleStatus(error.message || 'Altyazı yüklenemedi.', true);
      button.disabled = false;
      button.textContent = label;
    }
  }

  function installOnlineSubtitleStyles() {
    if (document.getElementById('perde-online-subtitle-style')) return;
    const style = document.createElement('style');
    style.id = 'perde-online-subtitle-style';
    style.textContent = '.perde-online-subtitles{display:block;width:100%;max-width:100%;min-width:0;box-sizing:border-box;overflow:hidden;margin-top:12px;padding:13px 14px;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:rgba(255,255,255,.035)}.perde-online-subtitles-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;min-width:0}.perde-online-subtitles-head>div{display:grid;gap:3px;min-width:0;flex:1 1 140px}.perde-online-subtitles-head strong{font-size:13px;color:#f4f4f5}.perde-online-subtitles-head small,.perde-subtitle-status{font-size:11px;color:#9ca3af}.perde-subtitle-search{flex:0 1 auto;max-width:100%;border:0;border-radius:8px;padding:8px 12px;background:#e5b94b;color:#171717;font-size:12px;font-weight:700;cursor:pointer;white-space:normal}.perde-subtitle-search:disabled,.perde-subtitle-result:disabled{opacity:.55;cursor:wait}.perde-subtitle-status{margin:10px 0 0;line-height:1.5;overflow-wrap:anywhere}.perde-subtitle-status.is-error{color:#fca5a5}.perde-subtitle-results{display:grid;grid-template-columns:minmax(0,1fr);gap:6px;margin-top:9px;width:100%;min-width:0;max-width:100%}.perde-subtitle-result{display:block;width:100%;min-width:0;max-width:100%;box-sizing:border-box;text-align:left;white-space:normal;overflow-wrap:anywhere;word-break:break-word;hyphens:auto;border:1px solid rgba(255,255,255,.09);border-radius:8px;padding:9px 10px;background:rgba(255,255,255,.045);color:#e5e7eb;font-size:11px;line-height:1.5;cursor:pointer}.perde-subtitle-result:hover{background:rgba(229,185,75,.12);border-color:rgba(229,185,75,.4)}@media(max-width:560px){.perde-online-subtitles{padding:11px}.perde-online-subtitles-head{align-items:stretch}.perde-subtitle-search{width:100%}}';
    document.head.appendChild(style);
  }

  function addSubtitleFiles() {
    const files = Array.from($('player-subtitle-file')?.files || []);
    if (!files.length) return;
    Array.from(video.querySelectorAll('track')).forEach(track => track.remove());
    files.forEach((file, index) => {
      const isVtt = /\.vtt$/i.test(file.name) || file.type === 'text/vtt';
      const isSrt = /\.srt$/i.test(file.name);
      if (!isVtt && !isSrt) return;
      const finish = content => {
        const blob = new Blob([content], { type: 'text/vtt' });
        const url = URL.createObjectURL(blob);
        const track = document.createElement('track');
        track.dataset.perdeUser = 'true';
        track.kind = 'subtitles';
        track.label = file.name.replace(/\.(vtt|srt)$/i, '') || ('Altyazı ' + (index + 1));
        track.srclang = 'tr';
        track.src = url;
        track.addEventListener('load', refreshTrackSelects, { once: true });
        video.appendChild(track);
        refreshTrackSelects();
      };
      if (isSrt) {
        const reader = new FileReader();
        reader.onload = () => finish('WEBVTT\n\n' + String(reader.result || '').replace(/^\uFEFF/, '').replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2').replace(/\r?\n/g, '\n'));
        reader.readAsText(file);
      } else {
        const reader = new FileReader();
        reader.onload = () => finish(String(reader.result || '').replace(/^\uFEFF/, ''));
        reader.readAsText(file);
      }
    });
    applySubtitleStyle();
  }

  $('player-quality')?.addEventListener('change', event => {
    const value = Number(event.target.value);
    if (hls) hls.currentLevel = value;
    else if (dash) {
      if (value < 0) dash.setAutoSwitchQualityFor('video', true);
      else { dash.setAutoSwitchQualityFor('video', false); dash.setQualityFor('video', value); }
    }
  });
  $('player-audio-track')?.addEventListener('change', event => {
    const value = Number(event.target.value);
    if (value < 0) return;
    if (hls) hls.audioTrack = value;
    else if (dash) {
      const tracks = dash.getTracksFor('audio') || [];
      if (tracks[value]) dash.setCurrentTrack(tracks[value]);
    }
  });
  $('player-subtitle-track')?.addEventListener('change', event => {
    const selected = Number(event.target.value);
    Array.from(video.textTracks || []).forEach((track, index) => { track.mode = selected >= 0 && selected === index ? 'showing' : 'disabled'; });
  });
  $('player-subtitle-file')?.addEventListener('change', addSubtitleFiles);
  installOnlineSubtitleStyles();
  subtitlePanel();
  $('player-settings-toggle')?.addEventListener('click', () => { $('player-settings-panel').hidden = !$('player-settings-panel').hidden; });
  $('player-settings-close')?.addEventListener('click', () => { $('player-settings-panel').hidden = true; });
  ['player-subtitle-size', 'player-subtitle-color', 'player-subtitle-bg'].forEach(id => $(id)?.addEventListener('change', applySubtitleStyle));
  $('player-save-markers')?.addEventListener('click', saveMarkers);
  $('player-skip-intro')?.addEventListener('click', () => { const end = markerData().introEnd; if (end != null) video.currentTime = end; });
  $('player-skip-credits')?.addEventListener('click', () => { if (Number.isFinite(video.duration)) video.currentTime = video.duration; });

  video.addEventListener('loadedmetadata', () => { resumeProgress(); refreshTrackSelects(); updateSkipButtons(); });
  video.addEventListener('timeupdate', () => {
    saveProgress();
    updateSkipButtons();
    const now = Date.now();
    if (lastTick) {
      const delta = (now - lastTick) / 1000;
      if (delta >= 1) addWatchTime(Math.min(delta, 5));
    }
    lastTick = now;
  });
  video.addEventListener('play', () => { lastTick = Date.now(); });
  video.addEventListener('pause', () => { saveProgress(); lastTick = 0; });
  video.addEventListener('ended', () => {
    if (!mediaId) return;
    const all = read(KEYS.stats), key = String(mediaId);
    const stat = all[key] || { seconds: 0, completed: 0 };
    stat.completed = (stat.completed || 0) + 1;
    all[key] = stat;
    write(KEYS.stats, all);
    refreshStats();
    saveProgress();
  });
  applySubtitleStyle();
})();