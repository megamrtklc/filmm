(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $ = (selector, root = document) => [...root.querySelectorAll(selector)];
  // Resolve the catalog from the actual admin.js location, not the current route.
  const adminScriptUrl = document.currentScript?.src || new URL('assets/js/admin.js', window.location.href).href;
  let catalog = [];
  let toastTimer;
  const pageNames = {overview:'Genel Bakış',catalog:'Film ve Diziler',collections:'Koleksiyonlar',hero:'Manşet ve Slider',watch:'İzleme Günlüğü',analytics:'İstatistikler',sources:'Veri Kaynakları',subtitles:'Altyazı Merkezi',backups:'Yedekleme',settings:'Genel Ayarlar'};
  function toast(message) {
    const node = $('#admin-toast');
    node.innerHTML = '<i class="fa-solid fa-circle-info"></i>' + escapeHtml(message);
    node.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('show'), 2800);
  }
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  }
  function localArray(key) {
    try { const value = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(value) ? value : []; }
    catch (_) { return []; }
  }
  function navigate(page) {
    if (!pageNames[page]) return;
    $$('.page-view').forEach(view => view.classList.toggle('active', view.id === 'page-' + page));
    $$('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.page === page));
    $('#breadcrumb-current').textContent = pageNames[page];
    $('#admin-sidebar').classList.remove('open');
    window.scrollTo({top:0,behavior:'smooth'});
    history.replaceState(null, '', '#'+page);
  }
  function poster(item) {
    const url = item.poster || item.image || item.backdrop || '';
    return url ? escapeHtml(url) : '';
  }
  function renderOverview() {
    const movies = catalog.filter(item => item.type === 'movie');
    const series = catalog.filter(item => item.type === 'tv');
    const favorites = localArray('ny7_favorites');
    const watchlist = localArray('ny7_watchlist');
    $('#stat-movies').textContent = movies.length.toLocaleString('tr-TR');
    $('#stat-series').textContent = series.length.toLocaleString('tr-TR');
    $('#stat-favorites').textContent = favorites.length.toLocaleString('tr-TR');
    $('#stat-watchlist').textContent = watchlist.length.toLocaleString('tr-TR');
    $('#analytics-total').textContent = catalog.length.toLocaleString('tr-TR');
    $('#analytics-movie-share').textContent = catalog.length ? Math.round(movies.length/catalog.length*100)+'%' : '—';
    $('#analytics-tv-share').textContent = catalog.length ? Math.round(series.length/catalog.length*100)+'%' : '—';
    $('#legend-movies').textContent = movies.length;
    $('#legend-series').textContent = series.length;
    $('#movie-bar').style.width = (catalog.length ? movies.length/catalog.length*100 : 0)+'%';
    $('#tv-bar').style.width = (catalog.length ? series.length/catalog.length*100 : 0)+'%';
    const recent = [...catalog].sort((a,b) => Number(b.year||0)-Number(a.year||0)).slice(0,5);
    $('#recent-list').innerHTML = recent.length ? recent.map(item => '<article class="recent-poster-card">'+(poster(item)?'<img class="recent-poster-image" src="'+poster(item)+'" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">':'<div class="recent-poster-placeholder"><i class="fa-solid fa-film"></i></div>')+'<div class="recent-poster-overlay"><span>'+(item.type==='tv'?'DİZİ':'FİLM')+' · '+escapeHtml(item.year||'—')+'</span><b>'+escapeHtml(item.title)+'</b><small>'+(item.rating?'★ '+escapeHtml(item.rating):'Puan bilgisi yok')+'</small></div></article>').join('') : '<div class="loading-line">Katalogda kayıt bulunamadı.</div>';
    const stackItems = [...catalog].filter(item => poster(item)).sort((a,b) => Number(b.year||0)-Number(a.year||0)).slice(0,4);
    $('#welcome-poster-stack').innerHTML = stackItems.length ? stackItems.map(item => '<img src="'+poster(item)+'" alt="" loading="lazy" onerror="this.remove()">').join('') : '<span class="poster-stack-fallback"><i class="fa-solid fa-clapperboard"></i></span>';
    const movieShare = catalog.length ? movies.length / catalog.length * 100 : 0;
    $('#overview-donut').style.background = 'conic-gradient(var(--gold) 0% '+movieShare+'%, #68788e '+movieShare+'% 100%)';
    $('#donut-total').textContent = catalog.length.toLocaleString('tr-TR');
    $('#overview-movie-count').textContent = movies.length.toLocaleString('tr-TR');
    $('#overview-series-count').textContent = series.length.toLocaleString('tr-TR');
    const genreCounts = catalog.reduce((counts,item) => {
      const genre = String(item.genre || (item.category || '').split('/')[0] || 'Diğer').trim();
      if (genre) counts[genre] = (counts[genre] || 0) + 1;
      return counts;
    }, {});
    const topGenres = Object.entries(genreCounts).sort((a,b) => b[1]-a[1]).slice(0,5);
    const maxGenreCount = topGenres.length ? topGenres[0][1] : 1;
    $('#genre-insights').innerHTML = topGenres.length ? topGenres.map(([genre,count]) => '<div class="genre-row"><span>'+escapeHtml(genre)+'</span><div class="genre-track"><i style="width:'+(count/maxGenreCount*100)+'%"></i></div><b>'+count+'</b></div>').join('') : '<div class="loading-line">Tür bilgisi bulunamadı.</div>';
    $('#catalog-status').textContent = catalog.length+' kayıt başarıyla okundu';
  }
  let catalogView = 'grid';
  function catalogGenres() {
    return [...new Set(catalog.flatMap(item => String(item.category || item.genre || '').split('/').map(value => value.trim()).filter(Boolean)))].sort((a,b) => a.localeCompare(b,'tr'));
  }
  function initCatalogFilters() {
    const genreSelect = $('#catalog-genre');
    const yearSelect = $('#catalog-year');
    catalogGenres().forEach(genre => genreSelect.add(new Option(genre,genre)));
    [...new Set(catalog.map(item => String(item.year || '').trim()).filter(Boolean))].sort((a,b) => Number(b)-Number(a)).forEach(year => yearSelect.add(new Option(year,year)));
    $('#catalog-total').textContent = catalog.length.toLocaleString('tr-TR');
    $('#catalog-posters').textContent = catalog.filter(item => item.image || item.poster).length.toLocaleString('tr-TR');
    $('#catalog-incomplete').textContent = catalog.filter(item => !(item.image || item.poster) || !item.rating || !item.tmdbId).length.toLocaleString('tr-TR');
  }
  function catalogMatches() {
    const query = ($('#catalog-search').value || '').trim().toLocaleLowerCase('tr-TR');
    const type = $('#catalog-type').value;
    const genre = $('#catalog-genre').value;
    const year = $('#catalog-year').value;
    const ratingFilter = $('#catalog-rating').value;
    const sort = $('#catalog-sort').value;
    const rows = catalog.filter(item => {
      const matchesType = type === 'all' || item.type === type;
      const haystack = [item.title,item.director,item.genre,item.category,item.year,item.country].join(' ').toLocaleLowerCase('tr-TR');
      const matchesGenre = genre === 'all' || String(item.category || item.genre || '').split('/').map(value => value.trim()).includes(genre);
      const matchesYear = year === 'all' || String(item.year || '') === year;
      const rating = Number.parseFloat(item.rating);
      const hasRating = Number.isFinite(rating);
      const matchesRating = ratingFilter === 'all' || (ratingFilter === 'rated' && hasRating) || (ratingFilter === 'unrated' && !hasRating) || (ratingFilter === 'high' && hasRating && rating >= 8) || (ratingFilter === 'mid' && hasRating && rating >= 6 && rating < 8) || (ratingFilter === 'low' && hasRating && rating < 6);
      return matchesType && matchesGenre && matchesYear && matchesRating && haystack.includes(query);
    });
    rows.sort((a,b) => {
      if (sort === 'title-asc') return String(a.title || '').localeCompare(String(b.title || ''),'tr');
      if (sort === 'rating-desc') return (Number.parseFloat(b.rating)||-1) - (Number.parseFloat(a.rating)||-1);
      if (sort === 'year-asc') return (Number(a.year)||0) - (Number(b.year)||0);
      return (Number(b.year)||0) - (Number(a.year)||0);
    });
    return rows;
  }
  function catalogQuality(item) {
    const missing = [];
    if (!(item.image || item.poster)) missing.push('Afiş');
    if (!item.rating) missing.push('Puan');
    if (!item.tmdbId) missing.push('TMDB');
    return missing;
  }
  function renderCatalog() {
    const rows = catalogMatches();
    $('#catalog-count').textContent = rows.length.toLocaleString('tr-TR')+' / '+catalog.length.toLocaleString('tr-TR')+' kayıt';
    const grid = $('#catalog-poster-grid');
    const tableBody = $('#catalog-table-body');
    if (!rows.length) {
      grid.innerHTML = '<div class="catalog-empty"><i class="fa-solid fa-film"></i><b>Eşleşen yapım bulunamadı</b><span>Filtreleri değiştirmeyi veya aramanı temizlemeyi dene.</span></div>';
      tableBody.innerHTML = '<tr><td colspan="7" class="empty-cell">Aramanla eşleşen yapım bulunamadı.</td></tr>';
      return;
    }
    grid.innerHTML = rows.map(item => {
      const image = poster(item);
      const missing = catalogQuality(item);
      const rating = Number.parseFloat(item.rating);
      const typeLabel = item.type === 'tv' ? 'DİZİ' : 'FİLM';
      return '<article class="catalog-poster-card">'+
        '<div class="catalog-card-art">'+(image?'<img src="'+image+'" alt="'+escapeHtml(item.title)+' afişi" loading="lazy" onerror="this.closest(\'.catalog-card-art\').classList.add(\'poster-missing\');this.remove()">':'<div class="catalog-poster-fallback"><i class="fa-solid fa-clapperboard"></i><span>AFİŞ YOK</span></div>')+
        '<span class="catalog-type-badge">'+typeLabel+'</span>'+(Number.isFinite(rating)?'<span class="catalog-rating-badge"><i class="fa-solid fa-star"></i> '+rating.toFixed(1)+'</span>':'')+
        (missing.length?'<span class="catalog-warning-badge" title="Eksik: '+escapeHtml(missing.join(', '))+'"><i class="fa-solid fa-triangle-exclamation"></i> '+missing.length+' eksik</span>':'')+'</div>'+
        '<div class="catalog-card-copy"><b title="'+escapeHtml(item.title)+'">'+escapeHtml(item.title)+'</b><span>'+escapeHtml(item.year || 'Yıl bilinmiyor')+' · '+escapeHtml(item.genre || item.category || 'Tür belirtilmemiş')+'</span><div class="catalog-card-foot"><small>'+(item.tmdbId?'TMDB '+escapeHtml(item.tmdbId):'TMDB eşleşmesi yok')+'</small><button class="row-action" type="button" data-inspect="'+escapeHtml(item.id)+'">İncele</button></div></div></article>';
    }).join('');
    tableBody.innerHTML = rows.map(item => {
      const missing = catalogQuality(item);
      return '<tr><td><div class="catalog-name">'+(poster(item)?'<img src="'+poster(item)+'" alt="" loading="lazy" onerror="this.remove()">':'<span class="recent-poster"></span>')+'<span><b>'+escapeHtml(item.title)+'</b><small>'+escapeHtml(item.director||'Yönetmen bilgisi yok')+'</small></span></div></td><td><span class="type-pill">'+(item.type==='tv'?'Dizi':'Film')+'</span></td><td>'+escapeHtml(item.year||'—')+'</td><td>'+(item.rating?'★ '+escapeHtml(item.rating):'—')+'</td><td>'+escapeHtml(item.tmdbId||'—')+'</td><td>'+(missing.length?'<span class="catalog-quality-warning">'+escapeHtml(missing.join(' · '))+'</span>':'<span class="catalog-quality-good"><i class="fa-solid fa-check"></i> Tam</span>')+'</td><td><button class="row-action" type="button" data-inspect="'+escapeHtml(item.id)+'">İncele</button></td></tr>';
    }).join('');
    grid.hidden = catalogView !== 'grid';
    $('#catalog-table-view').hidden = catalogView !== 'table';
  }
  function setCatalogView(view) {
    catalogView = view === 'table' ? 'table' : 'grid';
    $$('[data-catalog-view]').forEach(button => {
      const active = button.dataset.catalogView === catalogView;
      button.classList.toggle('active',active);
      button.setAttribute('aria-pressed',String(active));
    });
    $('#catalog-poster-grid').hidden = catalogView !== 'grid';
    $('#catalog-table-view').hidden = catalogView !== 'table';
  }
  let heroSlides = [];
  let heroActiveIndex = 0;
  let heroPreviewMode = 'desktop';
  function heroImage(item) { return item.backdrop || item.image || item.poster || ''; }
  function heroSeed() {
    return [...catalog].filter(item => heroImage(item)).sort((a,b) => (Number.parseFloat(b.rating)||0)-(Number.parseFloat(a.rating)||0)).slice(0,5).map(item => ({id:String(item.id),active:true}));
  }
  function heroCurrentItem() {
    const slide = heroSlides[heroActiveIndex];
    return slide ? catalog.find(item => String(item.id) === slide.id) : null;
  }
  function renderHeroPreview() {
    const item = heroCurrentItem();
    const preview = $('#hero-live-preview');
    preview.classList.toggle('is-mobile',heroPreviewMode==='mobile');
    if (!item) {
      $('#hero-live-title').textContent='Henüz manşet seçilmedi';
      $('#hero-live-meta').textContent='';
      $('#hero-live-desc').textContent='Sağdaki katalog listesinden bir yapım ekleyerek ön izlemeyi oluştur.';
      $('#hero-live-backdrop').style.backgroundImage='';
      $('#hero-live-index').textContent='00 / 00';
      return;
    }
    const image=heroImage(item);
    $('#hero-live-backdrop').style.backgroundImage=image?'linear-gradient(90deg,rgba(7,9,13,.94) 0%,rgba(7,9,13,.62) 52%,rgba(7,9,13,.12) 100%),linear-gradient(0deg,rgba(7,9,13,.55),transparent 65%),url("'+image.replace(/["\\]/g,'')+'")':'linear-gradient(120deg,#202631,#0b0d11)';
    $('#hero-live-title').textContent=item.title||'Başlıksız yapım';
    $('#hero-live-meta').innerHTML='<span>'+(item.type==='tv'?'DİZİ':'FİLM')+'</span><i>•</i><span>'+escapeHtml(item.year||'—')+'</span>'+(item.duration?'<i>•</i><span>'+escapeHtml(item.duration)+'</span>':'')+(item.rating?'<i>•</i><b>★ '+escapeHtml(item.rating)+'</b>':'');
    $('#hero-live-desc').textContent=item.desc||'Bu yapım için katalogda tanıtım metni bulunmuyor.';
    $('#hero-live-index').textContent=String(heroActiveIndex+1).padStart(2,'0')+' / '+String(heroSlides.length).padStart(2,'0');
  }
  function renderHeroSlides() {
    const list=$('#hero-slide-list');
    $('#hero-slide-count').textContent=heroSlides.length+' yapım';
    if(!heroSlides.length){list.innerHTML='<div class="hero-slide-empty"><i class="fa-regular fa-images"></i><b>Slider henüz boş</b><span>Sağdaki alandan katalog yapımı ekleyebilirsin.</span></div>';renderHeroPreview();return;}
    list.innerHTML=heroSlides.map((slide,index)=>{
      const item=catalog.find(entry=>String(entry.id)===slide.id);
      if(!item)return '';
      const image=poster(item);
      return '<article class="hero-slide-row'+(index===heroActiveIndex?' selected':'')+(slide.active?'':' muted')+'" data-hero-index="'+index+'"><span class="hero-slide-number">'+String(index+1).padStart(2,'0')+'</span>'+(image?'<img src="'+image+'" alt="" loading="lazy">':'<span class="hero-slide-placeholder"><i class="fa-solid fa-film"></i></span>')+'<button class="hero-slide-select" type="button" data-hero-select="'+index+'"><b>'+escapeHtml(item.title)+'</b><small>'+(item.type==='tv'?'Dizi':'Film')+' · '+escapeHtml(item.year||'—')+'</small></button><span class="hero-slide-state">'+(slide.active?'Yayında':'Gizli')+'</span><div class="hero-slide-actions"><button type="button" data-hero-up="'+index+'" aria-label="Yukarı taşı" '+(index===0?'disabled':'')+'><i class="fa-solid fa-chevron-up"></i></button><button type="button" data-hero-down="'+index+'" aria-label="Aşağı taşı" '+(index===heroSlides.length-1?'disabled':'')+'><i class="fa-solid fa-chevron-down"></i></button><button type="button" data-hero-toggle="'+index+'" aria-label="Yayın durumunu değiştir"><i class="fa-solid '+(slide.active?'fa-eye':'fa-eye-slash')+'"></i></button><button type="button" data-hero-remove="'+index+'" aria-label="Slider listesinden çıkar"><i class="fa-solid fa-xmark"></i></button></div></article>';
    }).join('');
    renderHeroPreview();
  }
  function initHeroManager() {
    const select=$('#hero-content-select');
    [...catalog].sort((a,b)=>String(a.title||'').localeCompare(String(b.title||''),'tr')).forEach(item=>select.add(new Option((item.type==='tv'?'Dizi':'Film')+' · '+item.title+' ('+(item.year||'—')+')',String(item.id))));
    heroSlides=heroSeed();
    heroActiveIndex=0;
    renderHeroSlides();
  }
  function addHeroSlide() {
    const id=$('#hero-content-select').value;
    if(!id)return toast('Önce katalogdan bir yapım seç.');
    if(heroSlides.some(slide=>slide.id===id))return toast('Bu yapım zaten slider listesinde.');
    heroSlides.push({id,active:true});
    heroActiveIndex=heroSlides.length-1;
    renderHeroSlides();
    toast('Yapım yerel ön izleme listesine eklendi.');
  }
  function moveHeroSlide(index,direction) {
    const target=index+direction;
    if(target<0||target>=heroSlides.length)return;
    [heroSlides[index],heroSlides[target]]=[heroSlides[target],heroSlides[index]];
    heroActiveIndex=target;
    renderHeroSlides();
  }
  function handleHeroListClick(event) {
    const button=event.target.closest('button');
    if(!button)return;
    const index=Number(button.dataset.heroSelect??button.dataset.heroUp??button.dataset.heroDown??button.dataset.heroToggle??button.dataset.heroRemove);
    if(!Number.isInteger(index))return;
    if(button.hasAttribute('data-hero-select'))heroActiveIndex=index;
    else if(button.hasAttribute('data-hero-up'))return moveHeroSlide(index,-1);
    else if(button.hasAttribute('data-hero-down'))return moveHeroSlide(index,1);
    else if(button.hasAttribute('data-hero-toggle'))heroSlides[index].active=!heroSlides[index].active;
    else if(button.hasAttribute('data-hero-remove')){heroSlides.splice(index,1);heroActiveIndex=Math.max(0,Math.min(heroActiveIndex,heroSlides.length-1));}
    renderHeroSlides();
  }
  function downloadJson(filename, data) {
    const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url),1000);
  }
  async function init() {
    $('#today-label').textContent = new Intl.DateTimeFormat('tr-TR',{dateStyle:'full'}).format(new Date());
    try {
      const catalogUrls = [...new Set([
        new URL('../../data/catalog.json', adminScriptUrl).href,
        new URL('data/catalog.json', window.location.href).href,
        new URL('/data/catalog.json', window.location.origin).href
      ])];
      let data = null;
      const loadErrors = [];
      for (const url of catalogUrls) {
        try {
          const response = await fetch(url,{cache:'no-store'});
          if (!response.ok) throw new Error('HTTP '+response.status);
          const payload = await response.json();
          if (!Array.isArray(payload)) throw new Error('Katalog biçimi geçersiz');
          data = payload;
          break;
        } catch (loadError) {
          loadErrors.push(url+' ('+loadError.message+')');
        }
      }
      if (!data) throw new Error('Katalog dosyasına ulaşılamadı. Denenen yollar: '+loadErrors.join(' · '));
      catalog = data;
      renderOverview();
      initCatalogFilters();
      renderCatalog();
      initHeroManager();
    } catch (error) {
      $('#catalog-status').textContent = 'Veri bağlantısı kurulamadı';
      ['#stat-movies','#stat-series','#analytics-total','#overview-movie-count','#overview-series-count','#donut-total'].forEach(selector => {
        const node = $(selector);
        if (node) node.textContent = '—';
      });
      $('#recent-list').innerHTML = '<div class="loading-line">Katalog verisi yüklenemedi. '+escapeHtml(error.message)+'</div>';
      $('#catalog-table-body').innerHTML = '<tr><td colspan="6" class="empty-cell">Katalog yüklenemedi: '+escapeHtml(error.message)+'</td></tr>';
      $('#catalog-count').textContent = 'Bağlantı yok';
      console.warn('Perde yönetim taslağı katalog yükleme hatası:',error);
    }
    const hash = location.hash.replace('#','');
    if (pageNames[hash]) navigate(hash);
  }
  $$('.nav-item').forEach(button => button.addEventListener('click',() => navigate(button.dataset.page)));
  $$('[data-goto]').forEach(button => button.addEventListener('click',() => navigate(button.dataset.goto)));
  $('#mobile-menu').addEventListener('click',() => $('#admin-sidebar').classList.toggle('open'));
  ['#catalog-search','#catalog-type','#catalog-genre','#catalog-year','#catalog-rating','#catalog-sort'].forEach(selector => $(selector).addEventListener(selector==='#catalog-search'?'input':'change',renderCatalog));
  $('[data-catalog-view]').forEach(button => button.addEventListener('click',() => setCatalogView(button.dataset.catalogView)));
  $('#catalog-poster-grid').addEventListener('click',event => {
    const button = event.target.closest('[data-inspect]');
    if (!button) return;
    const item = catalog.find(entry => String(entry.id) === button.dataset.inspect);
    if (item) toast(item.title+' · '+(item.type==='tv'?'Dizi':'Film')+' · '+(item.year||'Yıl bilgisi yok')+' — salt okunur ön izleme');
  });
  $('#catalog-table-body').addEventListener('click',event => {
    const button = event.target.closest('[data-inspect]');
    if (!button) return;
    const item = catalog.find(entry => String(entry.id) === button.dataset.inspect);
    if (item) toast(item.title+' · '+(item.type==='tv'?'Dizi':'Film')+' · '+(item.year||'Yıl bilgisi yok')+' — salt okunur ön izleme');
  });
  $('#hero-add-button').addEventListener('click',addHeroSlide);
  $('#hero-slide-list').addEventListener('click',handleHeroListClick);
  $('[data-hero-preview]').forEach(button=>button.addEventListener('click',()=>{
    heroPreviewMode=button.dataset.heroPreview;
    $('[data-hero-preview]').forEach(item=>{const active=item===button;item.classList.toggle('active',active);item.setAttribute('aria-pressed',String(active));});
    renderHeroPreview();
  }));
  $('#add-content-button').addEventListener('click',() => toast('Yeni kayıt formu, güvenli kayıt altyapısı kurulduğunda etkinleştirilecek.'));
  $$('[data-demo]').forEach(button => button.addEventListener('click',() => toast(button.dataset.demo+' alanı veritabanı aşamasında etkinleştirilecek.')));
  $('#export-catalog').addEventListener('click',() => {
    if (!catalog.length) return toast('Dışa aktarılacak katalog verisi bulunamadı.');
    downloadJson('perde-katalog-yedegi.json',catalog);
    toast('Katalog JSON yedeği indirildi.');
  });
  $('#export-personal').addEventListener('click',() => {
    const data = {favorites:localArray('ny7_favorites'),watchlist:localArray('ny7_watchlist'),exportedAt:new Date().toISOString()};
    downloadJson('perde-kisisel-veriler.json',data);
    toast('Tarayıcıda bulunan kişisel kayıtlar indirildi.');
  });
  init();
})();