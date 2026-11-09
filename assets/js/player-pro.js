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
  let choicePending = false, choiceOverlay = null;
  const nativeVideoPlay = video.play.bind(video);
  video.play = function () {
    // Kaynak yüklenirken oynatmaya izin ver; yalnızca devam/baştan seçimi ekranda açıkken engelle.
    if (choicePending && choiceOverlay && !choiceOverlay.hidden) return Promise.resolve();
    return nativeVideoPlay();
  };

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
    if (choicePending || !mediaId || !Number.isFinite(video.duration) || video.duration <= 0) return;
    const all = read(KEYS.progress), key = String(mediaId);
    if (video.ended || video.duration - video.currentTime < 25) delete all[key];
    else all[key] = { time: video.currentTime, duration: video.duration, savedAt: Date.now() };
    write(KEYS.progress, all);
  }
  function savedResumePoint() {
    if (!mediaId || !Number.isFinite(video.duration) || video.duration <= 0) return null;
    const saved = read(KEYS.progress)[String(mediaId)];
    if (!saved || saved.time < 15 || saved.time >= video.duration - 25) return null;
    if (Math.abs((saved.duration || 0) - video.duration) > Math.max(120, video.duration * 0.08)) return null;
    return saved;
  }
  function installPlaybackChoiceStyles() {
    if (document.getElementById('perde-playback-choice-styles')) return;
    const style = document.createElement('style');
    style.id = 'perde-playback-choice-styles';
    style.textContent = `
      .perde-playback-choice {
        position:absolute; inset:0; z-index:30; display:grid; place-items:center;
        padding:clamp(16px,4vw,30px); background:rgba(4,6,10,.78);
        -webkit-backdrop-filter:blur(8px); backdrop-filter:blur(8px);
      }
      .perde-playback-choice[hidden] { display:none!important; }
      .perde-playback-choice-card {
        width:min(460px,100%); padding:clamp(22px,4vw,34px);
        border:1px solid rgba(255,255,255,.14); border-radius:18px;
        background:linear-gradient(145deg,#20252e,#0e1118);
        color:#f7f8fa; text-align:center;
        box-shadow:0 24px 70px rgba(0,0,0,.48);
      }
      .perde-playback-choice-kicker {
        display:block; margin-bottom:10px; color:#e2b65d;
        font-size:10px; font-weight:800; letter-spacing:.2em;
      }
      .perde-playback-choice-card h3 {
        margin:0 0 8px; color:#fff; font-size:clamp(20px,3vw,26px);
        font-weight:800; letter-spacing:-.03em;
      }
      .perde-playback-choice-progress {
        margin:0 0 22px; color:#aeb6c2; font-size:12px; line-height:1.55;
      }
      .perde-playback-choice-actions { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
      .perde-playback-choice-actions button {
        display:flex; align-items:center; justify-content:center; gap:8px;
        min-height:46px; padding:10px 12px; border:1px solid rgba(255,255,255,.16);
        border-radius:10px; background:rgba(255,255,255,.07); color:#f3f4f6;
        font:600 12px/1.25 inherit; cursor:pointer; transition:background .18s,border-color .18s,transform .18s;
      }
      .perde-playback-choice-actions button:hover { transform:translateY(-1px); background:rgba(255,255,255,.12); }
      .perde-playback-choice-actions .perde-playback-continue {
        border-color:#d8ad55; background:#d8ad55; color:#17191e;
      }
      .perde-playback-choice-actions .perde-playback-continue:hover { background:#e5bd6b; }
      .perde-playback-choice-actions button:disabled { opacity:.42; cursor:not-allowed; transform:none; }
      @media(max-width:560px) {
        .perde-playback-choice-actions { grid-template-columns:1fr; }
        .perde-playback-choice-card { padding:22px 18px; }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureChoiceOverlay() {
    if (choiceOverlay) return choiceOverlay;
    const stage = $('player-stage');
    if (!stage) return null;
    choiceOverlay = document.createElement('section');
    choiceOverlay.className = 'perde-playback-choice';
    choiceOverlay.hidden = true;
    choiceOverlay.setAttribute('role', 'dialog');
    choiceOverlay.setAttribute('aria-label', 'İzleme seçimi');
    choiceOverlay.innerHTML = '<div class="perde-playback-choice-card"><span class="perde-playback-choice-kicker">PERDE SİNEMA</span><h3>Nasıl izlemek istersin?</h3><p class="perde-playback-choice-progress"></p><div class="perde-playback-choice-actions"><button type="button" class="perde-playback-start"><i class="fa-solid fa-backward-step" aria-hidden="true"></i><span>Baştan izle</span></button><button type="button" class="perde-playback-continue"><i class="fa-solid fa-play" aria-hidden="true"></i><span>Kaldığın yerden devam et</span></button></div></div>';
    stage.appendChild(choiceOverlay);
    choiceOverlay.querySelector('.perde-playback-start').addEventListener('click', () => {
      const all = read(KEYS.progress);
      delete all[String(mediaId)];
      write(KEYS.progress, all);
      video.currentTime = 0;
      beginChosenPlayback();
    });
    choiceOverlay.querySelector('.perde-playback-continue').addEventListener('click', () => {
      const saved = savedResumePoint();
      video.currentTime = saved ? saved.time : 0;
      beginChosenPlayback();
    });
    return choiceOverlay;
  }
  function showPlaybackChoice() {
    if (!choicePending || !mediaId || !Number.isFinite(video.duration) || video.duration <= 0) return;
    const overlay = ensureChoiceOverlay();
    if (!overlay) return;
    const saved = savedResumePoint();
    const continueButton = overlay.querySelector('.perde-playback-continue');
    const progressText = overlay.querySelector('.perde-playback-choice-progress');
    continueButton.disabled = !saved;
    progressText.textContent = saved
      ? 'Son izlediğin konum: ' + Math.floor(saved.time / 60) + ' dakika'
      : 'Bu film için kayıtlı bir izleme konumu bulunamadı.';
    overlay.hidden = false;
    resumedForSource = true;
    video.pause();
  }
  function beginChosenPlayback() {
    choicePending = false;
    if (choiceOverlay) choiceOverlay.hidden = true;
    nativeVideoPlay().catch(() => {});
  }
  function updateSkipButtons() {
    const m = markerData(), now = video.currentTime || 0;
    const intro = $('player-skip-intro'), credits = $('player-skip-credits');
    if (intro) intro.hidden = !(m.introStart != null && m.introEnd > m.introStart && now >= m.introStart && now < m.introEnd);
    if (credits) credits.hidden = !(m.creditsStart != null && Number.isFinite(video.duration) && now >= m.creditsStart && !video.ended);
  }
  function refreshTrackSelects() {
    const tracks = Array.from(video.textTracks || []);
    const trackNodes = Array.from(video.querySelectorAll('track[kind="subtitles"], track[kind="captions"]'));
    let selected = tracks.findIndex(track => track.mode === 'showing');
    if (selected < 0) selected = trackNodes.findIndex(node => node.default);
    setOptions('player-subtitle-track', tracks.map((track, index) => ({ value: index, label: track.label || track.language || ('Altyazı ' + (index + 1)) })), 'Altyazı kapalı');
    tracks.forEach((track, index) => { track.mode = index === selected ? 'showing' : 'disabled'; });
    const select = $('player-subtitle-track');
    if (select) select.value = selected >= 0 ? String(selected) : '-1';
  }

  // Native MP4 ses kanalları yalnızca tarayıcı AudioTrackList sunuyorsa seçilebilir.
  // HLS/DASH kanalları kendi adaptif oynatma motorları tarafından yönetilir.
  function refreshNativeAudioTracks() {
    if (hls || dash) return;
    const audioTracks = video.audioTracks;
    const tracks = audioTracks ? Array.from(audioTracks) : [];
    const select = $('player-audio-track');
    if (!tracks.length) {
      setOptions('player-audio-track', [], 'Bu tarayıcı MP4 ses seçimini desteklemiyor');
      return;
    }
    if (tracks.length < 2) {
      setOptions('player-audio-track', [], 'Tek ses kanalı mevcut');
      return;
    }
    const selected = tracks.findIndex(track => track.enabled);
    setOptions('player-audio-track', tracks.map((track, index) => ({
      value: index,
      label: track.label || track.language || ('Ses ' + (index + 1))
    })), 'Ses dili');
    if (select) select.value = String(selected >= 0 ? selected : 0);
  }
  function attachSavedSubtitleTracks() {
    if (typeof mediaDatabase === 'undefined' || !Array.isArray(mediaDatabase)) return;
    const episode = window.perdeEpisodeContext || null;
    const catalogItemId = episode?.seriesId || mediaId;
    const item = mediaDatabase.find(entry => String(entry.id) === String(catalogItemId));
    if (!item || !Array.isArray(item.subtitles)) return;
    const matchingTracks = item.subtitles.filter(track => track && track.url && (!track.season || (episode && Number(track.season) === Number(episode.season) && Number(track.episode) === Number(episode.episode))));
    const hasEpisodeDefault = !!episode && matchingTracks.some(track => track.season && track.default);
    matchingTracks.forEach(track => {
      const node = document.createElement('track');
      node.kind = 'subtitles';
      node.label = track.languageLabel || track.language || 'Altyazı';
      node.srclang = track.language === 'other' ? 'und' : (track.language || 'tr');
      node.src = track.url;
      node.default = !!track.default && !(hasEpisodeDefault && !track.season);
      video.appendChild(node);
    });
  }
  function attachAdaptive(url) {
    destroyAdaptive();
    video.pause();
    video.removeAttribute('src');
    video.replaceChildren();
    video.load();
    attachSavedSubtitleTracks();
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
        const audioSelect = $('player-audio-track');
        if (audioSelect && hls.audioTrack >= 0) audioSelect.value = String(hls.audioTrack);
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

      resumedForSource = false;
      choicePending = true;
      if (choiceOverlay) choiceOverlay.hidden = true;
      const source = String(url || '');
      if (/\.m3u8(?:$|[?#])|\.mpd(?:$|[?#])/i.test(source) && attachAdaptive(source)) return;
      destroyAdaptive();
      if ($('player-quality')) setOptions('player-quality', [], 'Tek kalite kaynağı');
      if ($('player-audio-track')) setOptions('player-audio-track', [], 'Ses kanalları algılanıyor…');
      const result = originalAttach.call(this, url, label);
      refreshNativeAudioTracks();
      return result;
    };
  }
  if (typeof originalOpen === 'function') {
    window.openPlayerForMedia = function (id) {

      mediaId = String(window.perdeEpisodeContext?.playerId || id);
      resumedForSource = false;
      choicePending = false;
      if (choiceOverlay) choiceOverlay.hidden = true;
      const result = originalOpen.apply(this, arguments);
      refreshStats();
      loadMarkers();
      return result;
    };
  }
  if (typeof originalClose === 'function') {
    window.closePlayer = function () {
      saveProgress();
      choicePending = false;
      if (choiceOverlay) choiceOverlay.hidden = true;

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

  $('player-quality')?.addEventListener('change', event => {
    const value = Number(event.target.value);
    if (hls) hls.currentLevel = value;
    else if (dash) {
      if (value < 0) dash.setAutoSwitchQualityFor('video', true);
      else { dash.setAutoSwitchQualityFor('video', false); dash.setQualityFor('video', value); }
    }
  });
  $('player-audio-track')?.addEventListener('change', event => {
    if (event.target.value === '') return;
    const value = Number(event.target.value);
    if (!Number.isInteger(value) || value < 0) return;
    if (hls) hls.audioTrack = value;
    else if (dash) {
      const tracks = dash.getTracksFor('audio') || [];
      if (tracks[value]) dash.setCurrentTrack(tracks[value]);
    } else if (video.audioTracks && video.audioTracks[value]) {
      Array.from(video.audioTracks).forEach((track, index) => { track.enabled = index === value; });
    }
  });
  video.addEventListener('loadedmetadata', refreshNativeAudioTracks);
  video.audioTracks?.addEventListener?.('addtrack', refreshNativeAudioTracks);
  video.audioTracks?.addEventListener?.('removetrack', refreshNativeAudioTracks);
  $('player-subtitle-track')?.addEventListener('change', event => {
    const selected = Number(event.target.value);
    Array.from(video.textTracks || []).forEach((track, index) => { track.mode = selected >= 0 && selected === index ? 'showing' : 'disabled'; });
  });
  installPlaybackChoiceStyles();
  $('player-settings-toggle')?.addEventListener('click', () => { $('player-settings-panel').hidden = !$('player-settings-panel').hidden; });
  $('player-settings-close')?.addEventListener('click', () => { $('player-settings-panel').hidden = true; });
  ['player-subtitle-size', 'player-subtitle-color', 'player-subtitle-bg'].forEach(id => $(id)?.addEventListener('change', applySubtitleStyle));
  $('player-save-markers')?.addEventListener('click', saveMarkers);
  $('player-skip-intro')?.addEventListener('click', () => { const end = markerData().introEnd; if (end != null) video.currentTime = end; });
  $('player-skip-credits')?.addEventListener('click', () => { if (Number.isFinite(video.duration)) video.currentTime = video.duration; });

  video.addEventListener('loadedmetadata', () => { showPlaybackChoice(); refreshTrackSelects(); updateSkipButtons(); });
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