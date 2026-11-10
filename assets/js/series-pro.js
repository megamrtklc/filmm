/* Perde Series Watch System — isolated from catalog rendering. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const STORAGE = 'perde_series_diary_v1';
  const API = 'https://api.tvmaze.com';
  let activeItem = null, activeSeason = 1, episodeRows = [], activeEpisode = null, episodeFilter = 'all', episodePage = 1;
  const EPISODES_PER_PAGE = 6;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const norm = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('tr-TR').replace(/[^a-z0-9ığüşöç]+/g,' ').trim();
  const TRANSLATION_CACHE = 'perde_series_tr_translations_v1';
  const readTranslations = () => { try { return JSON.parse(localStorage.getItem(TRANSLATION_CACHE) || '{}') || {}; } catch (_) { return {}; } };
  async function translateToTurkish(value) {
    const source = String(value || '').trim();
    if (!source) return '';
    const cache = readTranslations();
    if (Object.prototype.hasOwnProperty.call(cache, source)) return cache[source];
    const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=tr&dt=t&q=' + encodeURIComponent(source);
    const response = await fetch(url);
    if (!response.ok) throw new Error('Çeviri servisi yanıt vermedi.');
    const data = await response.json();
    const translated = Array.isArray(data?.[0]) ? data[0].map(part => part?.[0] || '').join('').trim() : '';
    if (!translated) throw new Error('Çeviri alınamadı.');
    cache[source] = translated;
    try { localStorage.setItem(TRANSLATION_CACHE, JSON.stringify(cache)); } catch (_) {}
    return translated;
  }
  function episodeTitle(ep) {
    const name = String(ep.name || '').trim();
    const generic = name.match(/^(?:episode|ep\.?)[\s#-]*(\d+)$/i);
    return generic ? generic[1] + '. Bölüm' : (name || 'Bölüm ' + ep.number);
  }
  async function translateEpisodeCards(episodes) {
    const jobs = [];
    episodes.forEach(ep => {
      const titleNode = document.querySelector('[data-episode-title="' + CSS.escape(String(ep.id)) + '"]');
      const summaryNode = document.querySelector('[data-episode-summary="' + CSS.escape(String(ep.id)) + '"]');
      if (titleNode && ep.name && !/^(?:episode|ep\.?)[\s#-]*\d+$/i.test(ep.name.trim())) jobs.push({node:titleNode,text:ep.name});
      if (summaryNode && ep.summary) jobs.push({node:summaryNode,text:ep.summary.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim()});
    });
    let cursor = 0;
    async function worker() {
      while (cursor < jobs.length) {
        const job = jobs[cursor++];
        if (!job.node.isConnected) continue;
        try {
          const translated = await translateToTurkish(job.text);
          if (job.node.isConnected) job.node.textContent = translated;
        } catch (_) {
          if (job.node.isConnected) job.node.textContent = job.text;
        }
      }
    }
    await Promise.all(Array.from({length:Math.min(4,jobs.length)},worker));
  }
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
    root.innerHTML = '<div class="series-progress-top"><span>İZLEME İLERLEMESİ</span><strong>'+watched+(total?' / '+total:'')+' bölüm</strong></div><div class="series-progress-track"><i style="width:'+percent+'%"></i></div><div class="series-progress-bottom"><span>'+percent+'% tamamlandı</span><span>'+esc(({watching:'İzliyorum',planned:'İzleme listemde',completed:'Tamamladım',paused:'Ara verdim',dropped:'Yarıda bıraktım'}[entry.status]||'İzliyorum'))+'</span></div>';
    const all = Object.values(readDiary());
    const totalWatched = all.reduce((sum,row)=>sum+(Array.isArray(row.watched)?row.watched.length:0),0);
    const completed = all.filter(row=>row.status==='completed').length;
    let playerStats = {}; try { playerStats = JSON.parse(localStorage.getItem('perde_player_stats_v3') || '{}') || {}; } catch (_) {}
    const seconds = Object.entries(playerStats).filter(([id])=>id.startsWith('series:')).reduce((sum,[,row])=>sum+(Number(row.seconds)||0),0);
    const watchTime = seconds >= 3600 ? Math.floor(seconds/3600)+' sa '+Math.floor((seconds%3600)/60)+' dk' : Math.floor(seconds/60)+' dk';
    root.innerHTML += '<div class="series-global-stats"><span><strong>'+totalWatched+'</strong><small>İzlenen bölüm</small></span><span><strong>'+completed+'</strong><small>Tamamlanan dizi</small></span><span><strong>'+watchTime+'</strong><small>Toplam izleme süresi</small></span></div>';
  }
  function ensureGuide() {
    let guide = $('series-watch-system');
    const redesignedHost = document.querySelector('#detail-page-view.is-series-redesign #series-episodes-slot');
    const legacyMain = document.querySelector('#detail-page-view .detail-main');
    if (guide) {
      if (redesignedHost && guide.parentNode !== redesignedHost) redesignedHost.insertBefore(guide, redesignedHost.firstChild);
      return guide;
    }
    const main = redesignedHost || legacyMain;
    if (!main) return null;
    guide = document.createElement('section');
    guide.id = 'series-watch-system'; guide.className = 'series-watch-system'; guide.hidden = true;
    guide.innerHTML = '<section class="series-season-stage"><div class="series-season-stage-head"><div><span class="series-section-kicker">HİKÂYENİN BÖLÜMLERİ</span><h3>Sezonunu keşfet</h3></div></div><div class="series-season-toolbar" id="series-season-toolbar" aria-label="Sezon seçimi"></div><div id="series-season-progress" class="series-season-progress"></div></section><section class="series-episode-library"><div class="series-episode-library-head"><div><span class="series-section-kicker">BÖLÜM ARŞİVİ</span><h3>İzleme listesi</h3></div><div class="series-episode-filter" id="series-episode-filter" aria-label="Bölüm filtresi"><button type="button" data-episode-filter="all" class="is-active">Tümü</button><button type="button" data-episode-filter="unwatched">İzlenmedi</button><button type="button" data-episode-filter="watched">İzlendi</button></div></div><div id="series-episodes" class="series-episodes"><div class="series-loading">Bölüm rehberi hazırlanıyor…</div></div></section><aside class="series-diary series-diary-bottom"><div class="series-diary-intro"><span class="series-diary-kicker">KİŞİSEL DİZİ GÜNLÜĞÜ</span><h3>Bu dizi hakkında notların</h3><p>İzleme durumunu, puanını ve kendine özel notlarını burada sakla.</p><div id="series-diary-summary"></div></div><div class="series-diary-fields"><div><label class="series-field-label" for="series-status">Dizi durumu</label><select id="series-status"><option value="watching">İzliyorum</option><option value="planned">İzleme listemde</option><option value="completed">Tamamladım</option><option value="paused">Ara verdim</option><option value="dropped">Yarıda bıraktım</option></select></div><div><label class="series-field-label" for="series-rating">Kişisel puanın</label><select id="series-rating"><option value="">Puan vermedim</option>'+Array.from({length:10},(_,i)=>'<option value="'+(10-i)+'">'+(10-i)+'/10</option>').join('')+'</select></div><div class="series-diary-note"><label class="series-field-label" for="series-note">Kişisel notun</label><textarea id="series-note" rows="3" placeholder="Dizi hakkındaki düşüncelerini yaz…"></textarea><button type="button" id="series-save-note" class="series-save-note">Notlarımı kaydet <i class="fa-solid fa-arrow-right"></i></button></div></div></aside>';
    const related = $('detail-related');
    if (redesignedHost) redesignedHost.insertBefore(guide, redesignedHost.firstChild);
    else if (related?.parentNode === main) main.insertBefore(guide, related);
    else main.appendChild(guide);
    $('series-season-toolbar').addEventListener('click', e => { const button=e.target.closest('[data-season]'); if(button){ activeSeason=Number(button.dataset.season)||1; episodeFilter='all'; episodePage=1; renderEpisodes(); } });
    $('series-episode-filter').addEventListener('click', e => { const button=e.target.closest('[data-episode-filter]'); if(button){ episodeFilter=button.dataset.episodeFilter; episodePage=1; renderEpisodes(); } });
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
    const host = $('series-episodes'); if (!host || !activeItem) return;
    const allSeasonEpisodes = episodeRows.filter(ep => Number(ep.season) === activeSeason);
    const watched = new Set(getEntry(activeItem).watched || []);
    const doneCount = allSeasonEpisodes.filter(ep => watched.has(String(ep.id))).length;
    const total = allSeasonEpisodes.length;
    const percent = total ? Math.round(doneCount / total * 100) : 0;
    const nextEpisode = allSeasonEpisodes.find(ep => !watched.has(String(ep.id)));
    const seasons = [...new Set(episodeRows.map(ep => Number(ep.season)).filter(n => n > 0))].sort((a,b)=>a-b);
    const seasonToolbar = $('series-season-toolbar');
    if (seasonToolbar) {
      seasonToolbar.innerHTML = seasons.map(n => {
        const rows=episodeRows.filter(ep=>Number(ep.season)===n), count=rows.length, seen=rows.filter(ep=>watched.has(String(ep.id))).length;
        const poster=rows.find(ep=>ep.image?.original||ep.image?.medium)?.image;
        const bg=poster?.original||poster?.medium||'';
        return '<button type="button" data-season="'+n+'" class="series-season-tile '+(n===activeSeason?'is-active':'')+'" aria-pressed="'+(n===activeSeason)+'" '+(bg?'style="--season-art:url(&quot;'+esc(bg)+'&quot;)"':'')+'><span class="series-season-tile-shade"></span><span class="series-season-tile-content"><small>SEZON</small><strong>'+String(n).padStart(2,'0')+'</strong><em>'+count+' bölüm</em><i class="series-season-tile-progress"><b style="width:'+(count?Math.round(seen/count*100):0)+'%"></b></i></span><span class="series-season-tile-check">'+(seen===count&&count?'<i class="fa-solid fa-check"></i>':'')+'</span></button>';
      }).join('');
    }
    const totalLabel=$('series-season-total'); if(totalLabel) totalLabel.textContent=seasons.length+' sezon · '+episodeRows.length+' bölüm';
    const progress=$('series-season-progress');
    if(progress) progress.innerHTML='<div class="series-progress-orbit" style="--progress:'+percent+'%"><div><strong>'+percent+'<small>%</small></strong><span>TAMAMLANDI</span></div></div><div class="series-progress-details"><span class="series-section-kicker">ŞU AN SEÇİLİ</span><h4>Sezon '+activeSeason+'</h4><p>'+doneCount+' / '+total+' bölüm izledin. '+(nextEpisode?'Sıradaki bölüm seni bekliyor.':'Bu sezonun tüm bölümlerini tamamladın.')+'</p><div class="series-progress-line"><i style="width:'+percent+'%"></i></div><div class="series-progress-meta"><span><b>'+doneCount+'</b> izlendi</span><span><b>'+(total-doneCount)+'</b> kaldı</span></div></div><div class="series-progress-next">'+(nextEpisode?'<span>SIRADAKİ BÖLÜM</span><strong>'+esc(episodeTitle(nextEpisode))+'</strong><small>Bölüm '+nextEpisode.number+(nextEpisode.runtime?' · '+nextEpisode.runtime+' dk':'')+'</small><button type="button" data-continue-episode="'+esc(nextEpisode.id)+'"><i class="fa-solid fa-play"></i> Devam et</button>':'<span class="series-season-complete"><i class="fa-solid fa-trophy"></i> SEZON TAMAMLANDI</span>')+'</div>';
    progress?.querySelector('[data-continue-episode]')?.addEventListener('click',()=>openEpisode(nextEpisode));
    const filter=$('series-episode-filter');
    if(filter) filter.querySelectorAll('[data-episode-filter]').forEach(button=>{const active=button.dataset.episodeFilter===episodeFilter;button.classList.toggle('is-active',active);button.setAttribute('aria-pressed',String(active));});
    const episodes=allSeasonEpisodes.filter(ep=>episodeFilter==='all'||(episodeFilter==='watched'?watched.has(String(ep.id)):!watched.has(String(ep.id))));
    const pageCount=Math.max(1,Math.ceil(episodes.length/EPISODES_PER_PAGE));
    episodePage=Math.min(Math.max(1,episodePage),pageCount);
    const visibleEpisodes=episodes.slice((episodePage-1)*EPISODES_PER_PAGE,episodePage*EPISODES_PER_PAGE);
    host.innerHTML=episodes.length?visibleEpisodes.map(ep=>{
      const done=watched.has(String(ep.id)), image=ep.image?.original||ep.image?.medium||'', title=episodeTitle(ep), summary=ep.summary?'Türkçeye çevriliyor…':'Bu bölüm için açıklama bulunmuyor.';
      return '<article class="series-episode-card '+(done?'is-watched':'')+'"><div class="series-episode-art">'+(image?'<img src="'+esc(image)+'" alt="'+esc(title)+'" loading="lazy">':'<div class="series-episode-art-empty"><i class="fa-solid fa-film"></i></div>')+'<span class="series-episode-index">BÖLÜM '+String(ep.number||0).padStart(2,'0')+'</span><span class="series-episode-runtime">'+(ep.runtime?ep.runtime+' DK':'')+'</span><button type="button" class="series-episode-play" data-play-episode="'+esc(ep.id)+'" aria-label="'+esc(title)+' bölümünü oynat"><i class="fa-solid fa-play"></i></button>'+(done?'<span class="series-episode-watched-flag"><i class="fa-solid fa-check"></i> İZLENDİ</span>':'')+'</div><div class="series-episode-card-copy"><div class="series-episode-card-meta"><span>SEZON '+String(ep.season).padStart(2,'0')+'</span><span>'+(ep.airdate?esc(ep.airdate):'YAYIN TARİHİ YOK')+'</span></div><h4 data-episode-title="'+esc(ep.id)+'">'+esc(title)+'</h4><p data-episode-summary="'+esc(ep.id)+'">'+esc(summary)+'</p><button type="button" class="series-episode-mark '+(done?'is-watched':'')+'" data-watched-episode="'+esc(ep.id)+'"><i class="fa-solid '+(done?'fa-circle-check':'fa-check')+'"></i> '+(done?'İzlendi':'İzlendi olarak işaretle')+'</button></div></article>';
    }).join('')+(pageCount>1?'<nav class="series-episode-pagination" aria-label="Bölüm sayfaları"><button type="button" data-episode-page="prev" '+(episodePage===1?'disabled':'')+' aria-label="Önceki sayfa"><i class="fa-solid fa-chevron-left"></i></button>'+Array.from({length:pageCount},(_,i)=>'<button type="button" data-episode-page="'+(i+1)+'" class="'+(episodePage===i+1?'is-active':'')+'" aria-current="'+(episodePage===i+1?'page':'false')+'">'+(i+1)+'</button>').join('')+'<button type="button" data-episode-page="next" '+(episodePage===pageCount?'disabled':'')+' aria-label="Sonraki sayfa"><i class="fa-solid fa-chevron-right"></i></button></nav>':''):'<div class="series-empty series-empty-new"><i class="fa-solid fa-clapperboard"></i><strong>'+(episodeFilter==='watched'?'Henüz izlediğin bölüm yok':episodeFilter==='unwatched'?'Bu sezondaki tüm bölümler tamamlandı':'Bölüm bulunamadı')+'</strong><span>Başka bir filtre seçerek listeyi görüntüleyebilirsin.</span></div>';
    host.querySelectorAll('[data-episode-page]').forEach(button=>button.addEventListener('click',()=>{const target=button.dataset.episodePage;episodePage=target==='prev'?Math.max(1,episodePage-1):target==='next'?Math.min(pageCount,episodePage+1):Number(target)||1;renderEpisodes();}));
    host.querySelectorAll('[data-play-episode]').forEach(button=>button.addEventListener('click',()=>{const ep=episodeRows.find(row=>String(row.id)===button.dataset.playEpisode);if(ep)openEpisode(ep);}));
    host.querySelectorAll('[data-watched-episode]').forEach(button=>button.addEventListener('click',()=>{const ep=episodeRows.find(row=>String(row.id)===button.dataset.watchedEpisode);if(ep)markWatched(activeItem,ep,!getEntry(activeItem).watched.includes(String(ep.id)));}));
    renderDiarySummary(activeItem);
    translateEpisodeCards(episodes);
  }
  window.perdeNavigateEpisode = function(direction) {
    if (!activeEpisode || !activeItem) return false;
    const list = episodeRows.slice().sort((a,b)=>a.season-b.season||a.number-b.number);
    const index = list.findIndex(row=>String(row.id)===String(activeEpisode.id));
    const target = list[index + (direction < 0 ? -1 : 1)];
    if (!target) return false;
    openEpisode(target);
    return true;
  };
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
    activeItem = item; activeSeason = 1; episodeFilter = 'all'; episodePage = 1; episodeRows = [];
    const guide = ensureGuide(); if (!guide) return;
    guide.hidden = item.type !== 'tv';
    const legacyEpisodes = $('detail-episodes');
    if (legacyEpisodes) legacyEpisodes.hidden = item.type === 'tv';
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
      episodeFilter = 'all';
      episodePage = 1;
      renderEpisodes();
    } catch (error) {
      $('series-episodes').innerHTML = '<p class="series-empty">'+esc(error.message||'Bölümler yüklenemedi.')+'<br><small>Bu kayıt için bölüm bilgileri henüz mevcut değil.</small></p>';

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
