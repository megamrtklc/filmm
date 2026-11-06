/* Perde Series Watch System — isolated from catalog rendering. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const STORAGE = 'perde_series_diary_v1';
  const API = 'https://api.tvmaze.com';
  let activeItem = null, activeSeason = 1, episodeRows = [], activeEpisode = null;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const norm = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('tr-TR').replace(/[^a-z0-9ığüşöç]+/g,' ').trim();
  const readDiary = () => { try { return JSON.parse(localStorage.getItem(STORAGE) || '{}') || {}; } catch (_) { return {}; } };
  const saveDiary = value => { try { localStorage.setItem(STORAGE, JSON.stringify(value)); } catch (e) { console.warn('Dizi günlüğü kaydedilemedi', e); } };
  const keyFor = item => String(item?.id ?? '');
  const getEntry = item => readDiary()[keyFor(item)] || { status:'watching', watched:[], rating:'', note:'' };
  function updateEntry(item, patch) {
    const all = readDiary(), key = keyFor(item), old = all[key] || {status:'watching',watched:[],rating:'',note:''};
    all[key] = {...old,...patch}; saveDiary(all); renderDiarySummary(item);
  }
  function watchedCount(item) { return getEntry(item).watched.length; }
  function renderDiarySummary(item) {
    const root = $('series-diary-summary'); if (!root) return;
    const entry = getEntry(item), watched = entry.watched.length;
    const total = Number(item.episodes) || episodeRows.length || 0;
    const percent = total ? Math.min(100, Math.round(watched / total * 100)) : 0;
    root.innerHTML = '<div class="series-progress-top"><span>İZLEME İLERLEMESİ</span><strong>'+watched+(total?' / '+total:'')+' bölüm</strong></div><div class="series-progress-track"><i style="width:'+percent+'%"></i></div><div class="series-progress-bottom"><span>'+percent+'% tamamlandı</span><span>'+esc(({watching:'İzliyorum',planned:'İzleme listemde',completed:'Tamamladım',paused:'Ara verdim',dropped:'Yarıda bıraktım'}[entry.status]||'İzliyorum'))+'</span></div>';\n    const all = Object.values(readDiary());\n    const totalWatched = all.reduce((sum,row)=>sum+(Array.isArray(row.watched)?row.watched.length:0),0);\n    const completed = all.filter(row=>row.status==='completed').length;\n    root.innerHTML += '<div class="series-global-stats"><span><strong>'+totalWatched+'</strong><small>İzlenen bölüm</small></span><span><strong>'+completed+'</strong><small>Tamamlanan dizi</small></span></div>';
  }
  function ensureGuide() {
    let guide = $('series-watch-system');
    if (guide) return guide;
    const main = document.querySelector('#detail-page-view .detail-main');
    if (!main) return null;
    guide = document.createElement('section');
    guide.id = 'series-watch-system'; guide.className = 'series-watch-system'; guide.hidden = true;
    guide.innerHTML = '<div class="series-guide-heading"><div><span>DİZİ REHBERİ</span><h2>Sezonlar ve bölümler</h2></div><span class="series-guide-count" id="series-guide-count">Bölümler yükleniyor</span></div><div class="series-diary-layout"><section class="series-episodes-column"><div class="series-season-toolbar"><label for="series-season-select">Sezon</label><select id="series-season-select" aria-label="Sezon seç"></select></div><div id="series-episodes" class="series-episodes"><div class="series-loading">Bölüm rehberi hazırlanıyor…</div></div></section><aside class="series-diary"><span class="series-diary-kicker">KİŞİSEL DİZİ GÜNLÜĞÜ</span><h3>İzleme durumun</h3><div id="series-diary-summary"></div><label class="series-field-label" for="series-status">Dizi durumu</label><select id="series-status"><option value="watching">İzliyorum</option><option value="planned">İzleme listemde</option><option value="completed">Tamamladım</option><option value="paused">Ara verdim</option><option value="dropped">Yarıda bıraktım</option></select><label class="series-field-label" for="series-rating">Kişisel puanın</label><select id="series-rating"><option value="">Puan vermedim</option>'+Array.from({length:10},(_,i)=>'<option value="'+(10-i)+'">'+(10-i)+'/10</option>').join('')+'</select><label class="series-field-label" for="series-note">Kişisel notun</label><textarea id="series-note" rows="4" placeholder="Dizi hakkındaki düşüncelerini yaz…"></textarea><button type="button" id="series-save-note" class="series-save-note">Günlüğü kaydet</button></aside></div>';
    main.appendChild(guide);
    $('series-season-select').addEventListener('change', e => { activeSeason = Number(e.target.value)||1; renderEpisodes(); });
    $('series-status').addEventListener('change', e => updateEntry(activeItem,{status:e.target.value}));
    $('series-rating').addEventListener('change', e => updateEntry(activeItem,{rating:e.target.value}));
    $('series-save-note').addEventListener('click', () => updateEntry(activeItem,{note:$('series-note').value}));
    return guide;
  }
  function markWatched(item, episode, watched) {
    const entry = getEntry(item), key = String(episode.id);
    const set = new Set(entry.watched || []);
    watched ? set.add(key) : set.delete(key);
    updateEntry(item,{watched:[...set]});
    renderEpisodes();
  }
  function renderEpisodes() {
    const host = $('series-episodes'); if (!host) return;
    const episodes = episodeRows.filter(ep => Number(ep.season) === activeSeason);
    host.innerHTML = episodes.length ? episodes.map(ep => {
      const done = getEntry(activeItem).watched.includes(String(ep.id));
      const image = ep.image?.medium || ep.image?.original || '';
      return '<article class="series-episode-row"><div class="series-episode-image">'+(image?'<img src="'+esc(image)+'" alt="" loading="lazy">':'<span><i class="fa-solid fa-clapperboard"></i></span>')+'</div><div class="series-episode-copy"><div class="series-episode-meta"><span>S'+String(ep.season).padStart(2,'0')+' · B'+String(ep.number||0).padStart(2,'0')+'</span><span>'+(ep.runtime?ep.runtime+' dk':'')+(ep.airdate?' · '+esc(ep.airdate):'')+'</span></div><h3>'+esc(ep.name||'Bölüm '+ep.number)+'</h3><p>'+esc(ep.summary?ep.summary.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim():'Bu bölüm için açıklama bulunmuyor.')+'</p><div class="series-episode-actions"><button type="button" data-play-episode="'+esc(ep.id)+'"><i class="fa-solid fa-play"></i> Bölümü izle</button><button type="button" class="series-watched-toggle '+(done?'is-watched':'')+'" data-watched-episode="'+esc(ep.id)+'"><i class="fa-solid '+(done?'fa-check':'fa-circle-check')+'"></i> '+(done?'İzlendi':'İzlendi olarak işaretle')+'</button></div></div></article>';
    }).join('') : '<p class="series-empty">Bu sezon için bölüm bilgisi bulunamadı.</p>';
    host.querySelectorAll('[data-play-episode]').forEach(button => button.addEventListener('click', () => {
      const ep = episodeRows.find(row => String(row.id) === button.dataset.playEpisode);
      if (ep) openEpisode(ep);
    }));
    host.querySelectorAll('[data-watched-episode]').forEach(button => button.addEventListener('click', () => {
      const ep = episodeRows.find(row => String(row.id) === button.dataset.watchedEpisode);
      if (ep) markWatched(activeItem,ep,!getEntry(activeItem).watched.includes(String(ep.id)));
    }));
    renderDiarySummary(activeItem);
  }
  function openEpisode(ep) {
    if (!activeItem || typeof window.openPlayerForMedia !== 'function') return;
    activeEpisode = ep;
    const playerId = 'series:'+keyFor(activeItem)+':s'+ep.season+'e'+ep.number;
    window.perdeEpisodeContext = {playerId, title:activeItem.title, season:ep.season, episode:ep.number, episodeTitle:ep.name, seriesId:keyFor(activeItem)};
    window.openPlayerForMedia(activeItem.id);
    const title = $('player-media-title');
    if (title) title.textContent = activeItem.title+' · S'+ep.season+' B'+ep.number+' — '+(ep.name||'Bölüm');
    const under = $('player-underbar-title'); if (under) under.textContent = activeItem.title+' · S'+ep.season+' B'+ep.number;
    showNextEpisodePrompt(ep);
  }
  function showNextEpisodePrompt(ep) {
    let prompt = $('series-next-episode');
    if (!prompt) {
      prompt = document.createElement('div'); prompt.id='series-next-episode'; prompt.className='series-next-episode'; prompt.hidden=true;
      $('player-stage')?.appendChild(prompt);
    }
    const list = episodeRows.slice().sort((a,b)=>a.season-b.season||a.number-b.number);
    const index = list.findIndex(row=>String(row.id)===String(ep.id)), next = list[index+1];
    prompt.innerHTML = next ? '<div><span>SIRADAKİ BÖLÜM</span><strong>'+esc(next.name||('Bölüm '+next.number))+'</strong><small>Sezon '+next.season+' · Bölüm '+next.number+'</small></div><button type="button" id="series-next-play"><i class="fa-solid fa-forward-step"></i> Sonraki bölümü oynat</button>' : '<div><span>SEZON / DİZİ SONU</span><strong>Bu listedeki son bölüm</strong></div>';
    if (next) $('series-next-play').onclick=()=>{prompt.hidden=true;openEpisode(next);};
  }
  async function loadEpisodes(item) {
    const title = item.originalTitle || item.title;
    const cacheKey = 'perde_tvmaze_episodes_v1_'+keyFor(item);
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey)||'null');
      if (Array.isArray(cached) && cached.length) return cached;
    } catch (_) {}
    const response = await fetch(API+'/search/shows?q='+encodeURIComponent(title),{headers:{Accept:'application/json'}});
    if (!response.ok) throw new Error('Bölüm servisine ulaşılamadı.');
    const results = await response.json();
    const target = norm(title);
    const ranked = results.map(row=>({show:row.show,score:row.score||0,exact:norm(row.show?.name)===target})).filter(row=>row.show?.id);
    ranked.sort((a,b)=>(Number(b.exact)-Number(a.exact))||b.score-a.score);
    if (!ranked.length || (!ranked[0].exact && ranked[0].score < 0.65)) throw new Error('Bu dizi için doğrulanmış bölüm eşleşmesi bulunamadı.');
    const episodesResponse = await fetch(API+'/shows/'+ranked[0].show.id+'/episodes?specials=0',{headers:{Accept:'application/json'}});
    if (!episodesResponse.ok) throw new Error('Bölüm listesi alınamadı.');
    const episodes = await episodesResponse.json();
    if (!Array.isArray(episodes)) throw new Error('Bölüm listesi geçersiz.');
    try { localStorage.setItem(cacheKey,JSON.stringify(episodes)); } catch (_) {}
    return episodes;
  }
  async function renderSeries(item) {
    activeItem = item; activeSeason = 1; episodeRows = [];
    const guide = ensureGuide(); if (!guide) return;
    guide.hidden = item.type !== 'tv';
    if (item.type !== 'tv') return;
    const entry = getEntry(item);
    $('series-status').value = entry.status || 'watching';
    $('series-rating').value = entry.rating || '';
    $('series-note').value = entry.note || '';
    $('series-diary-summary').innerHTML = '';
    renderDiarySummary(item);
    $('series-episodes').innerHTML = '<div class="series-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> Sezon ve bölümler getiriliyor…</div>';
    $('series-guide-count').textContent = 'Bölüm bilgileri yükleniyor';
    try {
      episodeRows = await loadEpisodes(item);
      if (activeItem !== item) return;
      const seasons = [...new Set(episodeRows.map(ep=>Number(ep.season)).filter(n=>n>0))].sort((a,b)=>a-b);
      if (!seasons.length) throw new Error('Bu dizi için sezon bilgisi bulunamadı.');
      activeSeason = seasons[0];
      $('series-season-select').innerHTML = seasons.map(n=>'<option value="'+n+'">Sezon '+n+'</option>').join('');
      $('series-guide-count').textContent = seasons.length+' sezon · '+episodeRows.length+' bölüm';
      renderEpisodes();
    } catch (error) {
      $('series-episodes').innerHTML = '<p class="series-empty">'+esc(error.message||'Bölümler yüklenemedi.')+'<br><small>Bu kayıt için bölüm bilgileri henüz mevcut değil.</small></p>';
      $('series-guide-count').textContent = 'Bölüm rehberi kullanılamıyor';
    }
  }
  const originalDetail = window.openDetailPage;
  if (typeof originalDetail === 'function') {
    window.openDetailPage = function(id) {
      const result = originalDetail.apply(this,arguments);
      const item = (window.mediaDatabase||[]).find(row=>String(row.id)===String(id)) || (typeof mediaDatabase!=='undefined' ? mediaDatabase.find(row=>String(row.id)===String(id)) : null);
      if (item) renderSeries(item);
      return result;
    };
  }
  const originalClose = window.closePlayer;
  if (typeof originalClose === 'function') {
    window.closePlayer = function() {
      const result = originalClose.apply(this,arguments);
      window.perdeEpisodeContext = null;
      const prompt = $('series-next-episode'); if (prompt) prompt.hidden = true;
      return result;
    };
  }
  $('player-video')?.addEventListener('ended', () => {
    if (!activeEpisode || !activeItem) return;
    markWatched(activeItem,activeEpisode,true);
    const prompt = $('series-next-episode'); if (prompt) prompt.hidden = false;
  });
  window.addEventListener('hashchange', () => { const prompt=$('series-next-episode'); if(prompt)prompt.hidden=true; });
  const statStyle = document.createElement('style'); statStyle.textContent = '.series-next-episode{position:absolute;z-index:9;right:22px;bottom:78px;display:flex;align-items:center;gap:20px;max-width:calc(100% - 44px);padding:16px 18px;border:1px solid rgba(255,255,255,.16);border-radius:14px;background:rgba(12,14,20,.94);box-shadow:0 14px 44px #0009;backdrop-filter:blur(12px)}.series-next-episode[hidden]{display:none}.series-next-episode div{display:grid;gap:4px}.series-next-episode span{font-size:9px;letter-spacing:.15em;color:#e5b94b;font-weight:800}.series-next-episode strong{font-size:14px;color:#fff}.series-next-episode small{font-size:11px;color:#a1a1aa}.series-next-episode button{border:0;border-radius:9px;background:#e5b94b;color:#151515;padding:11px 14px;font-weight:800;font-size:11px;white-space:nowrap;cursor:pointer}@media(max-width:600px){.series-next-episode{left:12px;right:12px;bottom:68px;max-width:none;flex-direction:column;align-items:stretch;gap:12px}.series-next-episode button{width:100%}}'; document.head.appendChild(statStyle);
})();
