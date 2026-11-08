/* Perde Kişisel İzleme Merkezi — mevcut yerel kayıtları okuyarak çalışır. */
(function () {
  'use strict';
  const VIEW_ID = 'watch-center-view';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const read = (key, fallback) => { try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return value && typeof value === 'object' ? value : fallback; } catch (_) { return fallback; } };
  const list = key => { const value = read(key, []); return Array.isArray(value) ? value : []; };
  const catalog = () => typeof mediaDatabase !== 'undefined' && Array.isArray(mediaDatabase) ? mediaDatabase : [];
  const diary = () => read('perde_series_diary_v1', {});
  const progress = () => read('perde_player_progress_v3', {});
  const stats = () => read('perde_player_stats_v3', {});
  const manualDiary = () => list('perde_watch_diary_v1');
  function manualEntry(item) { return manualDiary().find(entry => String(entry.id) === String(item.id)) || null; }
  let activeTab = 'overview';
  let query = '';

  function mediaFor(id) { return catalog().find(item => String(item.id) === String(id)); }
  function poster(item) { return item?.tmdbPoster || item?.image || item?.poster || ''; }
  function year(item) { return String(item?.tmdbReleaseDate || item?.year || '').slice(0, 4); }
  function duration(item) { return item?.tmdbRuntime || item?.duration || ''; }
  function seriesEntry(item) { return diary()[String(item.id)] || {}; }
  function watchedEpisodeCount(item) { const value = seriesEntry(item).watched; return Array.isArray(value) ? value.length : 0; }
  function completedCount(item) { return Number(stats()[String(item.id)]?.completed) || 0; }
  function savedProgress(item) { const row = progress()[String(item.id)]; return row && Number(row.time) > 0 ? row : null; }
  function isWatched(item) { const manual = manualEntry(item); return manual?.status === 'watched' || (item.type === 'tv' ? (seriesEntry(item).status === 'completed' || watchedEpisodeCount(item) > 0) : completedCount(item) > 0); }
  function isUnfinished(item) {
    if (isWatched(item)) return false;
    const entry = seriesEntry(item);
    return !!savedProgress(item) || manualEntry(item)?.status === 'watching' || (item.type === 'tv' && ['paused','dropped'].includes(entry.status)) ||
      (item.type === 'tv' && entry.status === 'watching' && watchedEpisodeCount(item) > 0);
  }
  function formatTime(seconds) {
    const value = Math.max(0, Math.floor(Number(seconds) || 0));
    const hours = Math.floor(value / 3600), minutes = Math.floor((value % 3600) / 60);
    return hours ? hours + ' sa ' + minutes + ' dk' : minutes + ' dk';
  }
  function progressPercent(item) {
    const row = savedProgress(item);
    if (!row || !Number(row.duration)) return 0;
    return Math.max(0, Math.min(100, Math.round(Number(row.time) / Number(row.duration) * 100)));
  }
  function itemCard(item, mode) {
    const image = poster(item), percent = progressPercent(item);
    const itemYear = year(item), kind = item.type === 'tv' ? 'Dizi' : 'Film';
    const meta = [itemYear, kind, duration(item)].filter(Boolean).join(' · ');
    const rating = item.tmdbRating || item.rating || '';
    let status = '';
    if (mode === 'unfinished') status = item.type === 'tv' ? (watchedEpisodeCount(item) + ' bölüm izlendi') : (percent + '% tamamlandı');
    else if (mode === 'watched') status = item.type === 'tv' ? (watchedEpisodeCount(item) ? watchedEpisodeCount(item) + ' bölüm izlendi' : 'İzlendi') : (completedCount(item) ? completedCount(item) + ' kez tamamlandı' : 'İzlendi');
    else if (mode === 'watchlist') status = 'İzleme listende';
    return '<article class="wc-media-card"><button type="button" class="wc-poster-button" data-wc-open="' + esc(item.id) + '" aria-label="' + esc(item.title) + ' detayını aç">' +
      (image ? '<img class="wc-poster" src="' + esc(image) + '" alt="' + esc(item.title) + '" loading="lazy">' : '<span class="wc-poster-placeholder"><i class="fa-solid fa-film"></i></span>') +
      (percent ? '<span class="wc-poster-progress"><i style="width:' + percent + '%"></i></span>' : '') +
      '</button><div class="wc-card-copy"><button type="button" class="wc-card-title" data-wc-open="' + esc(item.id) + '">' + esc(item.title) + '</button>' +
      '<p class="wc-card-meta">' + esc(meta) + (rating ? ' <span>★ ' + esc(rating) + '</span>' : '') + '</p>' +
      (status ? '<p class="wc-card-status">' + esc(status) + '</p>' : '') +
      '<div class="wc-card-actions"><button type="button" class="wc-card-open" data-wc-open="' + esc(item.id) + '">Detayları gör</button>' +
      (mode === 'watchlist' || mode === 'unfinished' ? '<button type="button" class="wc-card-mark" data-wc-status="' + esc(item.id) + '" data-wc-next-status="watched">İzlendi</button>' : '') +
      (mode === 'watched' && manualEntry(item)?.status === 'watched' && completedCount(item) === 0 && !(item.type === 'tv' && seriesEntry(item).status === 'completed') ? '<button type="button" class="wc-card-mark" data-wc-status="' + esc(item.id) + '" data-wc-next-status="watching">İzlemeye devam</button>' : '') +
      (mode === 'watchlist' ? '<button type="button" class="wc-card-remove" data-wc-remove="' + esc(item.id) + '" aria-label="Listemden çıkar"><i class="fa-solid fa-bookmark"></i></button>' : '') +
      '</div></div></article>';
  }
  function emptyState(title, detail) {
    return '<div class="wc-empty"><span><i class="fa-solid fa-clapperboard"></i></span><strong>' + esc(title) + '</strong><p>' + esc(detail) + '</p><a href="#/kesfet">Keşfetmeye başla <i class="fa-solid fa-arrow-right"></i></a></div>';
  }
  function getNextEpisode(item) {
    const entry = seriesEntry(item);
    const cacheKey = 'perde_tvmaze_episodes_v1_' + String(item.id);
    const episodes = read(cacheKey, []);
    if (!Array.isArray(episodes) || !episodes.length) return null;
    const watched = new Set((Array.isArray(entry.watched) ? entry.watched : []).map(String));
    const ordered = episodes.filter(ep => Number(ep.season) > 0).slice().sort((a,b) => Number(a.season)-Number(b.season) || Number(a.number)-Number(b.number));
    const next = ordered.find(ep => !watched.has(String(ep.id)));
    return next ? {episode:next, total:ordered.length, watched:watched.size} : null;
  }
  function episodeCard(item, next) {
    const ep = next.episode;
    const title = ep.name && !/^(episode|ep\.?)[\s#-]*\d+$/i.test(ep.name) ? ep.name : 'Bölüm ' + ep.number;
    const image = ep.image?.medium || ep.image?.original || poster(item);
    return '<article class="wc-next-episode"><div class="wc-next-image">' + (image ? '<img src="' + esc(image) + '" alt="" loading="lazy">' : '<i class="fa-solid fa-tv"></i>') + '</div><div class="wc-next-copy"><span>SIRADAKİ BÖLÜM</span><strong>' + esc(item.title) + '</strong><p>Sezon ' + esc(ep.season) + ' · Bölüm ' + esc(ep.number) + ' — ' + esc(title) + '</p><small>' + next.watched + ' / ' + next.total + ' bölüm tamamlandı</small><button type="button" data-wc-series="' + esc(item.id) + '">Dizi rehberini aç <i class="fa-solid fa-arrow-right"></i></button></div></article>';
  }
  function episodeSetupCard(item) {
    const image = poster(item);
    return '<article class="wc-next-episode wc-episode-setup"><div class="wc-next-image">' + (image ? '<img src="' + esc(image) + '" alt="" loading="lazy">' : '<i class="fa-solid fa-tv"></i>') + '</div><div class="wc-next-copy"><span>DİZİ TAKİBİ</span><strong>' + esc(item.title) + '</strong><p>Bölüm listesini yükleyerek sıradaki bölümünü belirle.</p><button type="button" data-wc-series="' + esc(item.id) + '">Bölüm rehberini hazırla <i class="fa-solid fa-arrow-right"></i></button></div></article>';
  }
  function getCollections() {
    const all = catalog();
    const diaryEntries = manualDiary();
    const watchIds = new Set([...list('ny7_watchlist'), ...diaryEntries.filter(entry => entry.status === 'watchlist').map(entry => entry.id)].map(String));
    const watched = all.filter(isWatched);
    const unfinished = all.filter(isUnfinished);
    const watchlistItems = all.filter(item => watchIds.has(String(item.id)));
    const trackedSeries = all.filter(item => item.type === 'tv' && (['watching','paused'].includes(seriesEntry(item).status) || manualEntry(item)?.status === 'watching'));
    const nextEpisodes = trackedSeries.map(item => ({item, next:getNextEpisode(item)})).filter(row => row.next);
    const seriesNeedingGuide = trackedSeries.filter(item => { const cached = read('perde_tvmaze_episodes_v1_' + String(item.id), []); return !Array.isArray(cached) || !cached.length; });
    const totalSeconds = Object.values(stats()).reduce((sum,row) => sum + (Number(row?.seconds) || 0), 0);
    return {all,watched,unfinished,watchlistItems,nextEpisodes,seriesNeedingGuide,totalSeconds};
  }
  function filtered(items) {
    const q = query.trim().toLocaleLowerCase('tr-TR');
    return q ? items.filter(item => String(item.title || '').toLocaleLowerCase('tr-TR').includes(q)) : items;
  }
  function section(title, subtitle, items, mode, limit) {
    const rows = (limit ? items.slice(0,limit) : items);
    return '<section class="wc-section"><div class="wc-section-heading"><div><span>' + esc(subtitle) + '</span><h2>' + esc(title) + '</h2></div>' +
      (items.length > (limit || 0) && limit ? '<button type="button" data-wc-tab="' + mode + '">Tümünü gör <i class="fa-solid fa-arrow-right"></i></button>' : '') +
      '</div>' + (rows.length ? '<div class="wc-media-grid">' + rows.map(item => itemCard(item, mode)).join('') + '</div>' : emptyState('Henüz burada bir yapım yok', 'Bir yapımı izleme listene eklediğinde veya izlemeye başladığında burada görünecek.')) + '</section>';
  }
  function renderOverview(data) {
    const recent = data.unfinished.slice().sort((a,b) => (Number(savedProgress(b)?.savedAt)||0) - (Number(savedProgress(a)?.savedAt)||0));
    const upcoming = data.nextEpisodes.slice(0,3);
    return '<div class="wc-stats-grid">' +
      '<article class="wc-stat-card"><span><i class="fa-solid fa-eye"></i> İZLEDİKLERİM</span><strong>' + data.watched.length + '</strong><small>Tamamladığın veya bölüm izlediğin yapım</small></article>' +
      '<article class="wc-stat-card"><span><i class="fa-solid fa-bookmark"></i> İZLEME LİSTEM</span><strong>' + data.watchlistItems.length + '</strong><small>Daha sonra izlemek istediklerin</small></article>' +
      '<article class="wc-stat-card"><span><i class="fa-solid fa-clock-rotate-left"></i> YARIM KALANLAR</span><strong>' + data.unfinished.length + '</strong><small>Kaldığın yerden devam edebileceklerin</small></article>' +
      '<article class="wc-stat-card"><span><i class="fa-solid fa-hourglass-half"></i> İZLEME SÜRESİ</span><strong>' + esc(formatTime(data.totalSeconds)) + '</strong><small>Bu cihazda kaydedilen oynatma süresi</small></article></div>' +
      section('Kaldığın yerden devam et','DEVAM EDENLER',recent,'unfinished',4) +
      (upcoming.length ? '<section class="wc-section"><div class="wc-section-heading"><div><span>DİZİ TAKİBİ</span><h2>Sıradaki bölümlerin</h2></div><button type="button" data-wc-tab="episodes">Tümünü gör <i class="fa-solid fa-arrow-right"></i></button></div><div class="wc-episode-grid">' + upcoming.map(row => episodeCard(row.item,row.next)).join('') + '</div></section>' : (data.seriesNeedingGuide.length ? '<section class="wc-section"><div class="wc-section-heading"><div><span>DİZİ TAKİBİ</span><h2>Bölüm rehberini hazırla</h2></div><button type="button" data-wc-tab="episodes">Tümünü gör <i class="fa-solid fa-arrow-right"></i></button></div><div class="wc-episode-grid">' + data.seriesNeedingGuide.slice(0,2).map(episodeSetupCard).join('') + '</div></section>' : '')) +
      section('İzleme listenden','SONRA İZLE',data.watchlistItems,'watchlist',4);
  }
  function renderTab(data) {
    const title = {watched:'İzlediklerim',watchlist:'İzleme listem',unfinished:'Yarım bıraktıklarım',episodes:'Sıradaki bölümler'}[activeTab] || 'Genel Bakış';
    const subtitle = {watched:'TAMAMLADIKLARIN',watchlist:'SONRA İZLE',unfinished:'KALDIĞIN YERDEN',episodes:'DİZİ TAKİBİ'}[activeTab] || '';
    if (activeTab === 'episodes') {
      const rows = data.nextEpisodes;
      const setup = data.seriesNeedingGuide || [];
      return '<section class="wc-section"><div class="wc-section-heading"><div><span>' + subtitle + '</span><h2>' + title + '</h2><p>İzlediğin bölümler dikkate alınarak sıradaki bölümün gösterilir.</p></div></div>' +
        (rows.length ? '<div class="wc-episode-grid">' + rows.map(row => episodeCard(row.item,row.next)).join('') + '</div>' : (setup.length ? '<div class="wc-episode-grid">' + setup.map(episodeSetupCard).join('') + '</div>' : emptyState('Henüz sıradaki bölüm belirlenmedi','Bir diziyi izleme durumuna aldığında bölüm takibini burada görebilirsin.'))) + '</section>';
    }
    const sourceItems = activeTab === 'watchlist' ? data.watchlistItems : data[activeTab];
    const items = filtered(Array.isArray(sourceItems) ? sourceItems : []);
    return section(title,subtitle,items,activeTab,0);
  }
  function render() {
    const root = $(VIEW_ID);
    if (!root) return;
    const data = getCollections();
    root.querySelectorAll('[data-wc-tab]').forEach(button => {
      button.classList.toggle('is-active', button.dataset.wcTab === activeTab);
      button.setAttribute('aria-pressed', String(button.dataset.wcTab === activeTab));
    });
    const search = $('wc-search');
    if (search && search.value !== query) search.value = query;
    const content = $('wc-content');
    if (content) content.innerHTML = activeTab === 'overview' ? renderOverview(data) : renderTab(data);
    const heading = $('wc-page-title');
    if (heading) heading.textContent = activeTab === 'overview' ? 'İzleme yolculuğun' : ({watched:'İzlediklerin',watchlist:'İzleme listen',unfinished:'Yarım bıraktıkların',episodes:'Sıradaki bölümlerin'}[activeTab] || 'İzleme yolculuğun');
  }
  function openCenter() {
    const view = $(VIEW_ID);
    if (!view) return;
    $('dashboard-view')?.classList.add('hidden');
    $('detail-page-view')?.classList.add('hidden');
    $('actor-page-view')?.classList.add('hidden');
    $('detail-related')?.classList.add('hidden');
    view.hidden = false;
    view.classList.remove('hidden');
    document.body.classList.remove('ny7-detail-open');
    document.documentElement.classList.remove('ny7-modal-lock');
    const theme = $('theme-body'); if (theme) theme.style.backgroundColor = '#0b0c10';
    document.querySelectorAll('.main-nav a').forEach(link => link.classList.toggle('is-active', link.hasAttribute('data-watch-center-nav')));
    render();
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function closeCenter() {
    const view = $(VIEW_ID);
    if (view) { view.hidden = true; view.classList.add('hidden'); }
    document.querySelectorAll('.main-nav a[data-watch-center-nav]').forEach(link => link.classList.remove('is-active'));
  }
  function setTab(tab) {
    if (!['overview','watched','watchlist','unfinished','episodes'].includes(tab)) return;
    activeTab = tab;
    render();
  }
  document.addEventListener('click', event => {
    const tab = event.target.closest('[data-wc-tab]');
    if (tab) { setTab(tab.dataset.wcTab); return; }
    const open = event.target.closest('[data-wc-open]');
    if (open) {
      const id = open.dataset.wcOpen;
      closeCenter();
      if (typeof window.openDetailPage === 'function') window.openDetailPage(id);
      return;
    }
    const status = event.target.closest('[data-wc-status]');
    if (status) {
      const id = String(status.dataset.wcStatus), nextStatus = status.dataset.wcNextStatus;
      const entries = manualDiary();
      const index = entries.findIndex(entry => String(entry.id) === id);
      const previous = index >= 0 ? entries[index] : {id};
      const updated = {...previous, id, status: nextStatus, updatedAt: Date.now()};
      if (index >= 0) entries[index] = updated; else entries.push(updated);
      const savedList = list('ny7_watchlist').filter(value => String(value) !== id);
      try { localStorage.setItem('perde_watch_diary_v1', JSON.stringify(entries)); localStorage.setItem('ny7_watchlist', JSON.stringify(savedList)); } catch (_) {}
      if (typeof watchlist !== 'undefined') watchlist = savedList;
      render(); return;
    }
    const remove = event.target.closest('[data-wc-remove]');
    if (remove) {
      const id = String(remove.dataset.wcRemove);
      const saved = list('ny7_watchlist').filter(value => String(value) !== id);
      const diaryRows = manualDiary().filter(entry => !(String(entry.id) === id && entry.status === 'watchlist'));
      try { localStorage.setItem('ny7_watchlist', JSON.stringify(saved)); localStorage.setItem('perde_watch_diary_v1', JSON.stringify(diaryRows)); } catch (_) {}
      if (typeof watchlist !== 'undefined') { watchlist = saved; }
      render(); return;
    }
    const series = event.target.closest('[data-wc-series]');
    if (series) {
      const id = series.dataset.wcSeries;
      closeCenter();
      if (typeof window.openDetailPage === 'function') window.openDetailPage(id);
      window.setTimeout(() => $('series-episodes')?.scrollIntoView({behavior:'smooth',block:'start'}), 650);
    }
  });
  document.addEventListener('input', event => {
    if (event.target?.id === 'wc-search') { query = event.target.value; if (activeTab !== 'overview') render(); }
  });
  window.addEventListener('hashchange', () => {
    if (location.hash === '#/izleme-merkezi') openCenter();
    else closeCenter();
  });
  window.addEventListener('perde:homepage-refresh', () => { if (location.hash === '#/izleme-merkezi') openCenter(); else closeCenter(); });
  window.addEventListener('perde:catalog-ready', () => { if (location.hash === '#/izleme-merkezi') openCenter(); });
  window.addEventListener('load', () => { if (location.hash === '#/izleme-merkezi') openCenter(); });
  window.showWatchCenter = () => { if (location.hash !== '#/izleme-merkezi') location.hash = '#/izleme-merkezi'; else openCenter(); };
  if (location.hash === '#/izleme-merkezi') openCenter();
})();