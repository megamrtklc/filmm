(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const STORE = 'perde_series_video_sources_v1';
  const video = $('player-video');
  const stage = $('player-stage');
  if (!video || !stage || window.__perdeSeriesSourcesInstalled) return;
  window.__perdeSeriesSourcesInstalled = true;

  let episodeKey = '';
  let frame = null;
  let activeSourceId = '';

  function readAll() {
    try { return JSON.parse(localStorage.getItem(STORE) || '{}') || {}; }
    catch (_) { return {}; }
  }
  function writeAll(data) {
    try { localStorage.setItem(STORE, JSON.stringify(data)); return true; }
    catch (_) { status('Kaynaklar bu tarayıcıya kaydedilemedi. Depolama alanını kontrol et.', true); return false; }
  }
  function getSources() { return readAll()[episodeKey] || []; }
  function setSources(items) {
    const all = readAll();
    all[episodeKey] = items;
    return writeAll(all);
  }
  function status(message, error) {
    const el = document.querySelector('.series-source-status');
    if (el) { el.textContent = message; el.classList.toggle('is-error', !!error); }
  }
  function ensurePanel() {
    let panel = $('series-source-manager');
    if (panel) return panel;
    const host = document.querySelector('.ny7-player-source-panel');
    if (!host) return null;
    panel = document.createElement('section');
    panel.id = 'series-source-manager';
    panel.className = 'series-source-manager';
    panel.hidden = true;
    panel.innerHTML = '<div class="series-source-manager-heading"><span>BÖLÜM KAYNAKLARI</span><strong>Video kaynaklarını yönet</strong><small>Eklediğin bağlantılar yalnızca seçtiğin bölüm için kaydedilir.</small></div><form class="series-source-form"><label>Kaynak adı<input name="label" type="text" maxlength="60" placeholder="Örn. YouTube – 1080p"></label><label>Video bağlantısı<input name="url" type="url" required placeholder="https://..." autocomplete="url"></label><label>Kaynak türü<select name="kind"><option value="auto">Otomatik algıla</option><option value="direct">Doğrudan video (MP4 / HLS / DASH)</option><option value="embed">Gömülü oynatıcı / diğer site</option></select></label><button type="submit" class="series-source-add"><i class="fa-solid fa-plus"></i> Kaynağı ekle ve oynat</button></form><p class="series-source-status" role="status">Bu bölüm için henüz kaynak eklenmedi.</p><div class="series-source-list"></div><p class="series-source-help">YouTube, Vimeo ve Dailymotion bağlantıları gömülü oynatıcıda açılır. Diğer sitelerde sitenin sağladığı gömme bağlantısını kullan. MP4, M3U8 ve MPD bağlantıları Perde oynatıcısında açılır. Kaynağın paylaşım ve izleme iznine sahip olduğundan emin ol.</p>';
    const grid = host.querySelector('.ny7-player-source-grid');
    if (grid) grid.insertAdjacentElement('beforebegin', panel);
    else host.appendChild(panel);
    panel.querySelector('form').addEventListener('submit', addSource);
    return panel;
  }
  function hideNativeForEmbed() {
    video.pause();
    video.removeAttribute('src');
    video.replaceChildren();
    video.load();
    video.hidden = true;
    ['player-empty-state','player-big-play','player-controls','player-loading','player-skip-intro','player-skip-credits','player-resume-note'].forEach(id => { if ($(id)) $(id).hidden = true; });
    if (frame) frame.remove();
    frame = document.createElement('iframe');
    frame.className = 'series-source-frame';
    frame.title = 'Dizi bölümü video oynatıcısı';
    frame.src = 'about:blank';
    frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    frame.allowFullscreen = true;
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation allow-forms');
    stage.appendChild(frame);
  }
  function restoreNative() {
    if (frame) { frame.src = 'about:blank'; frame.remove(); frame = null; }
    video.hidden = false;
    ['player-controls'].forEach(id => { if ($(id)) $(id).hidden = false; });
    stage.querySelectorAll('.series-source-frame').forEach(el => el.remove());
  }
  function clearCurrent() {
    restoreNative();
    video.pause();
    video.removeAttribute('src');
    video.replaceChildren();
    video.load();
    if ($('player-empty-state')) $('player-empty-state').hidden = false;
    if ($('player-big-play')) $('player-big-play').hidden = true;
    if ($('player-loading')) $('player-loading').hidden = true;
  }
  function toEmbedUrl(raw, kind) {
    let url;
    try { url = new URL(raw); } catch (_) { throw new Error('Geçerli bir bağlantı gir.'); }
    if (url.protocol !== 'https:') throw new Error('Güvenlik nedeniyle yalnızca HTTPS bağlantıları kullanılabilir.');
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    let id = '';
    if (host === 'youtu.be' || (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtube-nocookie.com' || host.endsWith('.youtube-nocookie.com'))) {
      id = host === 'youtu.be' ? url.pathname.split('/').filter(Boolean)[0] : (url.searchParams.get('v') || (url.pathname.match(/\/(?:embed|shorts|live)\/([^/?]+)/) || [])[1]);
      if (!id || !/^[\w-]{6,}$/.test(id)) throw new Error('YouTube video bağlantısı tanınamadı.');
      return 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) + '?autoplay=1&rel=0';
    }
    if (host === 'vimeo.com' || host === 'player.vimeo.com') {
      id = (url.pathname.match(/\/(?:video\/)?(\d+)/) || [])[1];
      if (!id) throw new Error('Vimeo video numarası bulunamadı.');
      return 'https://player.vimeo.com/video/' + id + '?autoplay=1';
    }
    if (host === 'dai.ly' || (host === 'dailymotion.com' || host.endsWith('.dailymotion.com'))) {
      id = host === 'dai.ly' ? url.pathname.split('/').filter(Boolean)[0] : (url.pathname.match(/\/video\/([^_/?]+)/) || [])[1];
      if (!id) throw new Error('Dailymotion video numarası bulunamadı.');
      return 'https://www.dailymotion.com/embed/video/' + encodeURIComponent(id) + '?autoplay=1';
    }
    if (kind === 'auto' && /\.(mp4|webm|m4v|mov|m3u8|mpd)(?:$|[?#])/i.test(url.href)) return null;
    if (kind === 'direct') return null;
    return url.href;
  }
  function playSource(source) {
    if (!source) return;
    activeSourceId = source.id;
    let nav = $('series-episode-navigation');
    if (!nav) {
      nav = document.createElement('div');
      nav.id = 'series-episode-navigation';
      nav.className = 'series-episode-navigation';
      nav.innerHTML = '<button type="button" data-series-direction="-1" aria-label="Önceki bölüm"><i class="fa-solid fa-chevron-left"></i><span>Önceki bölüm</span></button><button type="button" data-series-direction="1" aria-label="Sonraki bölüm"><span>Sonraki bölüm</span><i class="fa-solid fa-chevron-right"></i></button>';
      stage.appendChild(nav);
      nav.querySelectorAll('[data-series-direction]').forEach(button => button.addEventListener('click', () => {
        const direction = Number(button.dataset.seriesDirection);
        if (typeof window.perdeNavigateEpisode === 'function') window.perdeNavigateEpisode(direction);
      }));
    }
    nav.hidden = false;
    const panel = ensurePanel();
    const grid = document.querySelector('.ny7-player-source-grid');
    if (grid) grid.hidden = true;
    const subtitle = document.querySelector('.ny7-player-subtitle');
    if (subtitle) subtitle.hidden = true;
    if (source.mode === 'embed') {
      clearCurrent();
      const embed = source.embedUrl || toEmbedUrl(source.url, 'embed');
      if (!frame) hideNativeForEmbed();
      frame.src = embed;
      if ($('player-empty-state')) $('player-empty-state').hidden = true;
      status('Şu anda oynatılıyor: ' + source.label, false);
      return;
    }
    restoreNative();
    if ($('player-empty-state')) $('player-empty-state').hidden = true;
    if (typeof window.attachPlayerSource === 'function') {
      status('Kaynak açılıyor: ' + source.label, false);
      window.attachPlayerSource(source.url, source.label);
    } else {
      status('Perde video oynatıcısı hazır değil.', true);
    }
  }
  function renderList() {
    const panel = ensurePanel();
    if (!panel) return;
    const list = panel.querySelector('.series-source-list');
    list.replaceChildren();
    const items = getSources();
    if (!items.length) {
      status('Bu bölüm için henüz kaynak eklenmedi. İlk bağlantıyı yukarıdan ekleyebilirsin.', false);
      return;
    }
    items.forEach(source => {
      const row = document.createElement('div');
      row.className = 'series-source-row' + (source.id === activeSourceId ? ' is-active' : '');
      const play = document.createElement('button');
      play.type = 'button';
      play.className = 'series-source-play';
      play.innerHTML = '<i class="fa-solid fa-play" aria-hidden="true"></i>';
      const copy = document.createElement('span');
      copy.className = 'series-source-row-copy';
      const name = document.createElement('strong');
      name.textContent = source.label;
      const type = document.createElement('small');
      type.textContent = source.mode === 'embed' ? 'Harici video sitesi' : 'Doğrudan video bağlantısı';
      copy.append(name, type);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'series-source-delete';
      remove.setAttribute('aria-label', source.label + ' kaynağını sil');
      remove.innerHTML = '<i class="fa-solid fa-trash-can" aria-hidden="true"></i>';
      play.addEventListener('click', () => playSource(source));
      copy.addEventListener('click', () => playSource(source));
      remove.addEventListener('click', () => {
        const next = getSources().filter(item => item.id !== source.id);
        setSources(next);
        if (activeSourceId === source.id) { activeSourceId = ''; clearCurrent(); }
        renderList();
        status('Kaynak silindi.', false);
      });
      row.append(play, copy, remove);
      list.appendChild(row);
    });
  }
  function addSource(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const raw = String(form.elements.url.value || '').trim();
    const labelInput = String(form.elements.label.value || '').trim();
    const kind = form.elements.kind.value;
    if (!raw) { status('Önce bir video bağlantısı gir.', true); return; }
    let parsed;
    try {
      const embedUrl = toEmbedUrl(raw, kind);
      const url = new URL(raw);
      const isEmbed = embedUrl !== null;
      parsed = { id: 'src-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7), label: labelInput || (url.hostname.replace(/^www\./, '') + ' kaynağı'), url: url.href, mode: isEmbed ? 'embed' : 'direct', embedUrl: isEmbed ? embedUrl : '' };
    } catch (error) { status(error.message || 'Kaynak bağlantısı geçersiz.', true); return; }
    const items = getSources();
    items.push(parsed);
    if (!setSources(items)) return;
    form.reset();
    renderList();
    playSource(parsed);
  }
  function openForEpisode(context) {
    episodeKey = String(context.playerId || '');
    activeSourceId = '';
    const panel = ensurePanel();
    const grid = document.querySelector('.ny7-player-source-grid');
    const subtitle = document.querySelector('.ny7-player-subtitle');
    if (panel) panel.hidden = false;
    if (grid) grid.hidden = true;
    if (subtitle) subtitle.hidden = true;
    clearCurrent();
    renderList();
    const sources = getSources();
    if (sources.length) {
      // Bölüm açıldığında ilk kayıtlı kaynağı otomatik başlat.
      renderList();
      playSource(sources[0]);
      if (sources.length > 1) {
        status('İlk kayıtlı kaynak otomatik başlatıldı. Diğer kaynaklara sağdaki listeden geçebilirsin.', false);
      }
    }
  }
  function closeForEpisode() {
    if (frame) { frame.src = 'about:blank'; frame.remove(); frame = null; }
    video.hidden = false;
    const nav = $('series-episode-navigation');
    if (nav) nav.hidden = true;
    const panel = $('series-source-manager');
    if (panel) panel.hidden = true;
    const grid = document.querySelector('.ny7-player-source-grid');
    if (grid) grid.hidden = false;
    const subtitle = document.querySelector('.ny7-player-subtitle');
    if (subtitle) subtitle.hidden = false;
    episodeKey = '';
    activeSourceId = '';
  }

  const originalOpen = window.openPlayerForMedia;
  if (typeof originalOpen === 'function') {
    window.openPlayerForMedia = function () {
      const result = originalOpen.apply(this, arguments);
      const context = window.perdeEpisodeContext;
      if (context && context.playerId) openForEpisode(context);
      else closeForEpisode();
      return result;
    };
  }
  const originalClose = window.closePlayer;
  if (typeof originalClose === 'function') {
    window.closePlayer = function () {
      const result = originalClose.apply(this, arguments);
      closeForEpisode();
      window.perdeEpisodeContext = null;
      return result;
    };
  }
})();