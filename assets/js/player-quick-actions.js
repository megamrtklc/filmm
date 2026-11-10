/* Perde desktop player quick actions. Desktop-only UI; uses existing favorites/watchlist storage. */
(function () {
  'use strict';
  const modal = document.getElementById('player-modal');
  const card = modal && modal.querySelector('.ny7-player-media-card');
  if (!modal || !card || window.__perdePlayerQuickActions) return;
  window.__perdePlayerQuickActions = true;

  const KEYS = {
    favorites: 'ny7_favorites',
    watchlist: 'ny7_watchlist',
    watched: 'ny7_watched',
    ratings: 'ny7_personal_ratings'
  };
  let currentId = null;
  let currentEpisode = null;

  function read(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value == null ? fallback : value;
    } catch (_) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (_) { return false; }
  }
  function normalizedId(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : String(value);
  }
  function has(key) {
    return read(key, []).some(value => String(value) === String(currentId));
  }
  function ensureUI() {
    if (card.querySelector('.ny7-player-quick-actions')) return;
    const section = document.createElement('section');
    section.className = 'ny7-player-quick-actions';
    section.setAttribute('aria-label', 'Hızlı işlemler');
    section.innerHTML = `
      <div class="ny7-player-quick-heading"><span>HIZLI İŞLEMLER</span><i class="fa-solid fa-bolt" aria-hidden="true"></i></div>
      <div class="ny7-player-quick-grid">
        <button type="button" data-action="watchlist" aria-pressed="false"><i class="fa-regular fa-bookmark" aria-hidden="true"></i><span>İzleme listeme ekle</span></button>
        <button type="button" data-action="favorite" aria-pressed="false"><i class="fa-regular fa-heart" aria-hidden="true"></i><span>Favorilere ekle</span></button>
        <button type="button" data-action="watched" aria-pressed="false"><i class="fa-regular fa-circle-check" aria-hidden="true"></i><span>İzledim olarak işaretle</span></button>
      </div>
      <div class="ny7-player-rate-row">
        <label for="player-personal-rating">PUANIM</label>
        <select id="player-personal-rating" aria-label="Kişisel puan">
          <option value="">Puan seç</option>
          ${Array.from({length:10}, (_,i) => `<option value="${i+1}">${i+1} / 10</option>`).join('')}
        </select>
        <button type="button" data-action="rate">Kaydet</button>
      </div>
      <p class="ny7-player-quick-status" role="status" aria-live="polite"></p>`;
    const overview = card.querySelector('.ny7-player-overview');
    if (overview) overview.after(section);
    else card.appendChild(section);

    section.addEventListener('click', event => {
      const button = event.target.closest('button[data-action]');
      if (!button || !currentId) return;
      const action = button.dataset.action;
      const id = normalizedId(currentId);
      if (action === 'watchlist' || action === 'favorite') {
        const key = action === 'watchlist' ? KEYS.watchlist : KEYS.favorites;
        const fn = action === 'watchlist' ? window.toggleWatchlist : window.toggleFavorite;
        if (typeof fn === 'function') fn(id);
        else {
          const values = read(key, []);
          const next = values.some(value => String(value) === String(id))
            ? values.filter(value => String(value) !== String(id)) : [...values, id];
          write(key, next);
        }
        updateUI();
        announce(action === 'watchlist'
          ? (has(KEYS.watchlist) ? 'İzleme listene eklendi.' : 'İzleme listenden çıkarıldı.')
          : (has(KEYS.favorites) ? 'Favorilerine eklendi.' : 'Favorilerinden çıkarıldı.'));
      } else if (action === 'watched') {
        const values = read(KEYS.watched, []);
        const exists = values.some(value => String(value) === String(id));
        write(KEYS.watched, exists ? values.filter(value => String(value) !== String(id)) : [...values, id]);
        if (currentEpisode && typeof window.setDetailEpisodeWatched === 'function') {
          window.setDetailEpisodeWatched(currentEpisode.seriesId || id, currentEpisode.season, currentEpisode.episode, !exists);
        }
        updateUI();
        announce(exists ? 'İzlenme işareti kaldırıldı.' : 'İzlendi olarak işaretlendi.');
      } else if (action === 'rate') {
        const select = section.querySelector('#player-personal-rating');
        const score = Number(select && select.value);
        if (!score || score < 1 || score > 10) { announce('Önce 1–10 arasında bir puan seç.'); return; }
        const ratings = read(KEYS.ratings, {});
        ratings[String(id)] = score;
        write(KEYS.ratings, ratings);
        updateUI();
        announce('Puanın kaydedildi.');
      }
    });
  }
  function announce(message) {
    const node = card.querySelector('.ny7-player-quick-status');
    if (node) node.textContent = message;
  }
  function updateUI() {
    const section = card.querySelector('.ny7-player-quick-actions');
    if (!section || !currentId) return;
    const states = [
      ['watchlist', has(KEYS.watchlist), 'İzleme listemde', 'İzleme listeme ekle', 'fa-bookmark'],
      ['favorite', has(KEYS.favorites), 'Favorilerimde', 'Favorilere ekle', 'fa-heart'],
      ['watched', has(KEYS.watched), 'İzlendi', 'İzledim olarak işaretle', 'fa-circle-check']
    ];
    states.forEach(([action, active, onLabel, offLabel, icon]) => {
      const button = section.querySelector('[data-action="' + action + '"]');
      if (!button) return;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
      const i = button.querySelector('i');
      if (i) i.className = (active ? 'fa-solid ' : 'fa-regular ') + icon;
      const span = button.querySelector('span');
      if (span) span.textContent = active ? onLabel : offLabel;
    });
    const rating = read(KEYS.ratings, {})[String(currentId)];
    const select = section.querySelector('#player-personal-rating');
    if (select) select.value = rating ? String(rating) : '';
    const save = section.querySelector('[data-action="rate"]');
    if (save) save.textContent = rating ? 'Güncelle' : 'Kaydet';
  }

  const originalOpen = window.openPlayerForMedia;
  if (typeof originalOpen !== 'function') return;
  window.openPlayerForMedia = function (id) {
    const result = originalOpen.apply(this, arguments);
    currentEpisode = window.perdeEpisodeContext ? {
      seriesId: window.perdeEpisodeContext.seriesId || id,
      season: Number(window.perdeEpisodeContext.season),
      episode: Number(window.perdeEpisodeContext.episode)
    } : null;
    currentId = currentEpisode ? currentEpisode.seriesId : id;
    ensureUI();
    updateUI();
    return result;
  };
  const originalClose = window.closePlayer;
  if (typeof originalClose === 'function') {
    window.closePlayer = function () {
      const result = originalClose.apply(this, arguments);
      currentId = null;
      currentEpisode = null;
      return result;
    };
  }
})();