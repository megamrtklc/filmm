(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
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
  let catalogPage = 1;
  const catalogPageSize = 10;
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
  function renderCatalogPagination(totalRows) {
    const pagination = $('#catalog-pagination');
    const pageCount = Math.max(1,Math.ceil(totalRows/catalogPageSize));
    catalogPage = Math.min(Math.max(1,catalogPage),pageCount);
    if (totalRows <= catalogPageSize) {
      pagination.hidden = true;
      pagination.innerHTML = '';
      return;
    }
    const first = (catalogPage-1)*catalogPageSize+1;
    const last = Math.min(catalogPage*catalogPageSize,totalRows);
    const pages = [];
    for (let page=1; page<=pageCount; page++) {
      if (pageCount > 7 && page > 2 && page < pageCount-1 && Math.abs(page-catalogPage)>1) {
        if (page === 3 || page === pageCount-2) pages.push('<span class="pagination-ellipsis" aria-hidden="true">…</span>');
        continue;
      }
      pages.push('<button type="button" class="pagination-page'+(page===catalogPage?' active':'')+'" data-catalog-page="'+page+'"'+(page===catalogPage?' aria-current="page"':'')+'>'+page+'</button>');
    }
    pagination.hidden = false;
    pagination.innerHTML = '<span class="pagination-summary">'+first.toLocaleString('tr-TR')+'–'+last.toLocaleString('tr-TR')+' / '+totalRows.toLocaleString('tr-TR')+' kayıt</span>'+
      '<div class="pagination-controls"><button type="button" class="pagination-step" data-catalog-step="-1"'+(catalogPage===1?' disabled':'')+'><i class="fa-solid fa-chevron-left"></i> Önceki</button>'+
      '<div class="pagination-pages">'+pages.join('')+'</div>'+
      '<button type="button" class="pagination-step" data-catalog-step="1"'+(catalogPage===pageCount?' disabled':'')+'>Sonraki <i class="fa-solid fa-chevron-right"></i></button></div>';
  }
  function renderCatalog() {
    const rows = catalogMatches();
    $('#catalog-count').textContent = rows.length.toLocaleString('tr-TR')+' / '+catalog.length.toLocaleString('tr-TR')+' kayıt';
    const grid = $('#catalog-poster-grid');
    const tableBody = $('#catalog-table-body');
    if (!rows.length) {
      grid.innerHTML = '<div class="catalog-empty"><i class="fa-solid fa-film"></i><b>Eşleşen yapım bulunamadı</b><span>Filtreleri değiştirmeyi veya aramanı temizlemeyi dene.</span></div>';
      tableBody.innerHTML = '<tr><td colspan="7" class="empty-cell">Aramanla eşleşen yapım bulunamadı.</td></tr>';
      renderCatalogPagination(0);
      return;
    }
    const pageCount = Math.max(1,Math.ceil(rows.length/catalogPageSize));
    catalogPage = Math.min(Math.max(1,catalogPage),pageCount);
    const pageRows = rows.slice((catalogPage-1)*catalogPageSize,catalogPage*catalogPageSize);
    grid.innerHTML = pageRows.map(item => {
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
    tableBody.innerHTML = pageRows.map(item => {
      const missing = catalogQuality(item);
      return '<tr><td><div class="catalog-name">'+(poster(item)?'<img src="'+poster(item)+'" alt="" loading="lazy" onerror="this.remove()">':'<span class="recent-poster"></span>')+'<span><b>'+escapeHtml(item.title)+'</b><small>'+escapeHtml(item.director||'Yönetmen bilgisi yok')+'</small></span></div></td><td><span class="type-pill">'+(item.type==='tv'?'Dizi':'Film')+'</span></td><td>'+escapeHtml(item.year||'—')+'</td><td>'+(item.rating?'★ '+escapeHtml(item.rating):'—')+'</td><td>'+escapeHtml(item.tmdbId||'—')+'</td><td>'+(missing.length?'<span class="catalog-quality-warning">'+escapeHtml(missing.join(' · '))+'</span>':'<span class="catalog-quality-good"><i class="fa-solid fa-check"></i> Tam</span>')+'</td><td><button class="row-action" type="button" data-inspect="'+escapeHtml(item.id)+'">İncele</button></td></tr>';
    }).join('');
    grid.hidden = catalogView !== 'grid';
    $('#catalog-table-view').hidden = catalogView !== 'table';
    renderCatalogPagination(rows.length);
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
  let collections = [];
  let activeCollectionId = '';
  function collectionSeed() {
    const rated = [...catalog].sort((a,b)=>(Number.parseFloat(b.rating)||0)-(Number.parseFloat(a.rating)||0));
    const newest = [...catalog].sort((a,b)=>(Number(b.year)||0)-(Number(a.year)||0));
    const firstGenre = catalogGenres()[0];
    const genreItems = firstGenre ? catalog.filter(item=>String(item.category||item.genre||'').split('/').map(value=>value.trim()).includes(firstGenre)) : [];
    return [
      {id:'trending',title:'Trend Yapımlar',description:'Puanı yüksek, öne çıkan film ve diziler.',active:true,items:rated.slice(0,8).map(item=>String(item.id))},
      {id:'editors',title:'Editörün Seçimi',description:'Arşivden özenle seçilmiş güçlü yapımlar.',active:true,items:rated.slice(8,16).map(item=>String(item.id))},
      {id:'newest',title:'Yeni Eklenenler',description:'Yıl bilgisine göre en yeni yapımlar.',active:true,items:newest.slice(0,8).map(item=>String(item.id))},
      {id:'genre',title:firstGenre ? firstGenre+' Seçkisi' : 'Türe Göre Keşfet',description:'Aynı türde buluşan yapımlar.',active:false,items:genreItems.slice(0,8).map(item=>String(item.id))}
    ];
  }
  function selectedCollection() { return collections.find(item=>item.id===activeCollectionId)||null; }
  function renderCollections() {
    $('#collection-total').textContent=collections.length.toLocaleString('tr-TR');
    $('#collection-item-total').textContent=collections.reduce((sum,item)=>sum+item.items.length,0).toLocaleString('tr-TR');
    $('#collection-active-total').textContent=collections.filter(item=>item.active).length.toLocaleString('tr-TR');
    $('#collection-list').innerHTML=collections.map(item=>'<button type="button" class="collection-list-item'+(item.id===activeCollectionId?' selected':'')+'" data-collection-select="'+escapeHtml(item.id)+'"><span class="collection-list-icon"><i class="fa-solid fa-layer-group"></i></span><span class="collection-list-copy"><b>'+escapeHtml(item.title)+'</b><small>'+item.items.length+' yapım · '+(item.active?'Görünür':'Gizli')+'</small></span><i class="fa-solid fa-chevron-right"></i></button>').join('')||'<div class="collection-editor-empty">Henüz koleksiyon yok.</div>';
    renderCollectionEditor();
  }
  function renderCollectionEditor() {
    const item=selectedCollection();
    $('#collection-editor-empty').hidden=!!item;
    $('#collection-editor-content').hidden=!item;
    if(!item){
      $('#collection-preview').innerHTML='<div class="collection-preview-empty"><i class="fa-regular fa-images"></i><span>Ön izleme burada görünecek.</span></div>';
      return;
    }
    $('#collection-editor-name').textContent=item.title;
    $('#collection-editor-description').textContent=item.description||'Özel koleksiyon rafı.';
    $('#collection-visibility').innerHTML=item.active?'<i class="fa-solid fa-eye"></i> Yayında':'<i class="fa-solid fa-eye-slash"></i> Gizli';
    $('#collection-visibility').classList.toggle('is-muted',!item.active);
    $('#collection-items-count').textContent=item.items.length+' yapım';
    $('#collection-items-list').innerHTML=item.items.map((id,index)=>{
      const entry=catalog.find(row=>String(row.id)===id);
      if(!entry)return '';
      const image=poster(entry);
      return '<div class="collection-item-row">'+(image?'<img src="'+image+'" alt="" loading="lazy" onerror="this.remove()">':'<span class="collection-item-placeholder"><i class="fa-solid fa-film"></i></span>')+'<span class="collection-item-copy"><b>'+escapeHtml(entry.title)+'</b><small>'+(entry.type==='tv'?'Dizi':'Film')+' · '+escapeHtml(entry.year||'—')+'</small></span><span class="collection-item-actions"><button type="button" data-collection-up="'+index+'" aria-label="Yukarı taşı" '+(index===0?'disabled':'')+'><i class="fa-solid fa-chevron-up"></i></button><button type="button" data-collection-down="'+index+'" aria-label="Aşağı taşı" '+(index===item.items.length-1?'disabled':'')+'><i class="fa-solid fa-chevron-down"></i></button><button type="button" data-collection-remove="'+index+'" aria-label="Koleksiyondan çıkar"><i class="fa-solid fa-xmark"></i></button></span></div>';
    }).join('')||'<div class="collection-editor-empty compact"><i class="fa-solid fa-film"></i><span>Bu koleksiyonda henüz yapım yok. Yukarıdan katalogdan ekleyebilirsin.</span></div>';
    $('#collection-preview').innerHTML='<div class="collection-preview-heading"><b>'+escapeHtml(item.title)+'</b><span>'+item.items.length+' yapım</span></div><div class="collection-preview-rail">'+item.items.slice(0,6).map(id=>{
      const entry=catalog.find(row=>String(row.id)===id);
      if(!entry)return '';
      const image=poster(entry);
      return '<div class="collection-preview-card">'+(image?'<img src="'+image+'" alt="" loading="lazy" onerror="this.remove()">':'<span class="collection-item-placeholder"><i class="fa-solid fa-film"></i></span>')+'<b>'+escapeHtml(entry.title)+'</b></div>';
    }).join('')+'</div>';
  }
  function initCollections() {
    collections=collectionSeed();
    activeCollectionId=collections[0]?.id||'';
    const select=$('#collection-item-select');
    [...catalog].sort((a,b)=>String(a.title||'').localeCompare(String(b.title||''),'tr')).forEach(item=>select.add(new Option((item.type==='tv'?'Dizi':'Film')+' · '+item.title+' ('+(item.year||'—')+')',String(item.id))));
    renderCollections();
  }
  function handleCollectionClick(event) {
    const button=event.target.closest('button');
    if(!button)return;
    if(button.hasAttribute('data-collection-select')){activeCollectionId=button.dataset.collectionSelect;renderCollections();return;}
    const item=selectedCollection();
    if(!item)return;
    if(button.hasAttribute('data-collection-up')||button.hasAttribute('data-collection-down')){
      const index=Number(button.dataset.collectionUp??button.dataset.collectionDown);
      const target=index+(button.hasAttribute('data-collection-up')?-1:1);
      if(target<0||target>=item.items.length)return;
      [item.items[index],item.items[target]]=[item.items[target],item.items[index]];
    }else if(button.hasAttribute('data-collection-remove')){
      item.items.splice(Number(button.dataset.collectionRemove),1);
    }
    renderCollections();
  }
  function addCollectionItem() {
    const item=selectedCollection();
    const id=$('#collection-item-select').value;
    if(!item)return toast('Önce bir koleksiyon seç.');
    if(!id)return toast('Önce katalogdan bir yapım seç.');
    if(item.items.includes(id))return toast('Bu yapım koleksiyonda zaten var.');
    item.items.push(id);
    renderCollections();
    toast('Yapım koleksiyon taslağına eklendi.');
  }
  function createCollection(event) {
    event.preventDefault();
    const input=$('#collection-new-title');
    const title=input.value.trim();
    if(!title)return;
    if(collections.some(item=>item.title.toLocaleLowerCase('tr-TR')===title.toLocaleLowerCase('tr-TR')))return toast('Bu isimde bir koleksiyon zaten var.');
    const id='custom-'+Date.now().toString(36);
    collections.push({id,title,description:'Yeni oluşturulan özel koleksiyon.',active:true,items:[]});
    activeCollectionId=id;
    input.value='';
    renderCollections();
    toast('Yeni koleksiyon taslağı oluşturuldu.');
  }
  function toggleCollectionVisibility() {
    const item=selectedCollection();
    if(!item)return;
    item.active=!item.active;
    renderCollections();
    toast(item.active?'Koleksiyon ön izlemede görünür.':'Koleksiyon ön izlemede gizlendi.');
  }
  const DIARY_STORAGE_KEY = 'perde_watch_diary_v1';
  let diaryEntries = [];
  let diaryActiveTab = 'all';
  function loadDiary() {
    try {
      const parsed=JSON.parse(localStorage.getItem(DIARY_STORAGE_KEY)||'[]');
      diaryEntries=Array.isArray(parsed)?parsed.filter(entry=>entry&&catalog.some(item=>String(item.id)===String(entry.id))):[];
    } catch (_) { diaryEntries=[]; }
  }
  function saveDiary() {
    try { localStorage.setItem(DIARY_STORAGE_KEY,JSON.stringify(diaryEntries)); }
    catch (_) { toast('Tarayıcı depolaması kullanılamıyor. Kayıt saklanamadı.'); }
  }
  function diaryItem(id) { return catalog.find(item=>String(item.id)===String(id)); }
  function diaryStatusLabel(status) {
    return ({watching:'İzlemeye devam',watched:'İzlendi',favorite:'Favori',watchlist:'İzleme listesi'})[status]||'İzleme listesi';
  }
  function renderDiary() {
    const counts={watching:0,watched:0,favorite:0,watchlist:0};
    diaryEntries.forEach(entry=>{if(counts[entry.status]!==undefined)counts[entry.status]++;});
    $('#diary-watching-count').textContent=counts.watching;
    $('#diary-watched-count').textContent=counts.watched;
    $('#diary-favorite-count').textContent=counts.favorite;
    $('#diary-watchlist-count').textContent=counts.watchlist;
    $('#diary-total-count').textContent=diaryEntries.length;
    $('#diary-insight-watched').textContent=counts.watched;
    $('#diary-insight-watching').textContent=counts.watching;
    const rated=diaryEntries.filter(entry=>Number(entry.personalRating)>0);
    $('#diary-average-rating').textContent=rated.length?(rated.reduce((sum,entry)=>sum+Number(entry.personalRating),0)/rated.length).toFixed(1).replace('.',',')+'/10':'—';
    $('#diary-tab-all').textContent=diaryEntries.length;
    Object.keys(counts).forEach(key=>$('#diary-tab-'+key).textContent=counts[key]);
    const query=$('#diary-list-search').value.trim().toLocaleLowerCase('tr-TR');
    const visible=diaryEntries.filter(entry=>{
      const item=diaryItem(entry.id);
      return item&&(diaryActiveTab==='all'||entry.status===diaryActiveTab)&&(!query||String(item.title).toLocaleLowerCase('tr-TR').includes(query));
    });
    $$('#diary-tabs [data-diary-tab]').forEach(button=>button.classList.toggle('active',button.dataset.diaryTab===diaryActiveTab));
    $('#diary-entry-list').innerHTML=visible.length?visible.map(entry=>{
      const item=diaryItem(entry.id),image=poster(item);
      return '<article class="diary-entry" data-diary-entry="'+escapeHtml(entry.id)+'">'+(image?'<img class="diary-entry-poster" src="'+image+'" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">':'<span class="diary-entry-poster diary-poster-empty"><i class="fa-solid fa-film"></i></span>')+'<div class="diary-entry-main"><div class="diary-entry-title"><b>'+escapeHtml(item.title)+'</b><span>'+(item.type==='tv'?'Dizi':'Film')+' · '+escapeHtml(item.year||'—')+'</span></div><span class="diary-status-pill status-'+entry.status+'">'+diaryStatusLabel(entry.status)+'</span><div class="diary-entry-fields"><label>Durum<select data-diary-field="status" data-id="'+escapeHtml(entry.id)+'"><option value="watchlist" '+(entry.status==='watchlist'?'selected':'')+'>İzleme listesi</option><option value="watching" '+(entry.status==='watching'?'selected':'')+'>İzlemeye devam</option><option value="watched" '+(entry.status==='watched'?'selected':'')+'>İzlendi</option><option value="favorite" '+(entry.status==='favorite'?'selected':'')+'>Favori</option></select></label><label>İzleme tarihi<input type="date" data-diary-field="date" data-id="'+escapeHtml(entry.id)+'" value="'+escapeHtml(entry.date||'')+'"></label><label>Benim puanım<input type="number" min="1" max="10" step="0.5" placeholder="—" data-diary-field="personalRating" data-id="'+escapeHtml(entry.id)+'" value="'+escapeHtml(entry.personalRating||'')+'"></label></div></div><button class="diary-remove-button" type="button" data-diary-remove="'+escapeHtml(entry.id)+'" aria-label="Günlükten çıkar"><i class="fa-solid fa-trash-can"></i></button></article>';
    }).join(''):'<div class="diary-empty"><i class="fa-solid fa-film"></i><b>'+(diaryEntries.length?'Bu listede henüz yapım yok':'Günlüğün hazır')+'</b><span>'+(diaryEntries.length?'Başka bir sekme seç veya katalogdan yeni yapım ekle.':'Katalogdan ilk yapımını ekleyerek başlayabilirsin.')+'</span></div>';
    renderPersonalAnalytics();
  }
  function initDiary() {
    loadDiary();
    const select=$('#diary-catalog-select');
    [...catalog].sort((a,b)=>String(a.title||'').localeCompare(String(b.title||''),'tr')).forEach(item=>select.add(new Option((item.type==='tv'?'Dizi':'Film')+' · '+item.title+' ('+(item.year||'—')+')',String(item.id))));
    renderDiary();
  }
  function filterDiaryCatalog() {
    const query=$('#diary-catalog-search').value.trim().toLocaleLowerCase('tr-TR');
    const select=$('#diary-catalog-select');
    const previous=select.value;
    [...select.options].forEach((option,index)=>{
      if(index===0)return;
      const item=diaryItem(option.value);
      option.hidden=!!query&&item&&!String(item.title||'').toLocaleLowerCase('tr-TR').includes(query);
    });
    if(previous&&select.selectedOptions[0]?.hidden)select.value='';
  }
  function addDiaryEntry() {
    const id=$('#diary-catalog-select').value;
    const status=$('#diary-new-status').value;
    if(!id)return toast('Önce katalogdan bir yapım seç.');
    const selectedDate=$('#diary-new-date').value;
    const today=new Date().toISOString().slice(0,10);
    const existing=diaryEntries.find(entry=>String(entry.id)===id);
    if(existing){
      existing.status=status;
      if(selectedDate)existing.date=selectedDate;
      else if(status==='watched'&&!existing.date)existing.date=today;
      toast('Yapımın günlük durumu güncellendi.');
    }else{
      diaryEntries.unshift({id,status,date:selectedDate||(status==='watched'?today:''),personalRating:'',addedAt:new Date().toISOString()});
      toast('Yapım kişisel günlüğüne eklendi.');
    }
    saveDiary();renderDiary();$('#diary-catalog-select').value='';$('#diary-new-date').value='';
  }
  function handleDiaryClick(event) {
    const tab=event.target.closest('[data-diary-tab]');
    if(tab){diaryActiveTab=tab.dataset.diaryTab;renderDiary();return;}
    const remove=event.target.closest('[data-diary-remove]');
    if(remove){diaryEntries=diaryEntries.filter(entry=>String(entry.id)!==remove.dataset.diaryRemove);saveDiary();renderDiary();toast('Yapım günlüğünden çıkarıldı.');}
  }
  function handleDiaryChange(event) {
    const control=event.target.closest('[data-diary-field]');
    if(!control)return;
    const entry=diaryEntries.find(item=>String(item.id)===control.dataset.id);
    if(!entry)return;
    const field=control.dataset.diaryField;
    if(field==='personalRating'){
      const value=control.value===''?'':Number(control.value);
      if(value!==''&&(value<1||value>10||!Number.isFinite(value))){control.value=entry.personalRating||'';return toast('Kişisel puan 1 ile 10 arasında olmalı.');}
      entry.personalRating=value;
    }else{entry[field]=control.value;if(field==='status'&&control.value==='watched'&&!entry.date)entry.date=new Date().toISOString().slice(0,10);}
    saveDiary();renderDiary();
    toast('Kişisel günlük güncellendi.');
  }
  function renderCatalogAnalytics() {
    const movies=catalog.filter(item=>item.type==='movie');
    const series=catalog.filter(item=>item.type==='tv');
    const ratings=catalog.map(item=>Number.parseFloat(item.rating)).filter(value=>Number.isFinite(value)&&value>0&&value<=10);
    const average=ratings.length?ratings.reduce((sum,value)=>sum+value,0)/ratings.length:0;
    $('#archive-stat-total').textContent=catalog.length.toLocaleString('tr-TR');
    $('#archive-stat-movies').textContent=movies.length.toLocaleString('tr-TR');
    $('#archive-stat-series').textContent=series.length.toLocaleString('tr-TR');
    $('#archive-stat-rating').textContent=ratings.length?average.toFixed(1).replace('.',',')+'/10':'—';
    $('#archive-stat-rated').textContent=ratings.length.toLocaleString('tr-TR')+' puanlı yapım';

    const years={};
    catalog.forEach(item=>{const year=Number.parseInt(item.year,10);if(year>=1880&&year<=new Date().getFullYear()+2)years[year]=(years[year]||0)+1;});
    const yearRows=Object.entries(years).sort((a,b)=>Number(b[0])-Number(a[0])).slice(0,8).reverse();
    const maxYear=Math.max(1,...yearRows.map(row=>row[1]));
    $('#archive-year-chart').innerHTML=yearRows.length?'<div class="year-chart-bars">'+yearRows.map(([year,count])=>'<div class="year-chart-column"><b>'+count+'</b><div class="year-chart-track"><i style="height:'+Math.max(5,count/maxYear*100)+'%"></i></div><span>'+escapeHtml(year)+'</span></div>').join('')+'</div><div class="year-chart-foot">'+Object.values(years).reduce((sum,count)=>sum+count,0).toLocaleString('tr-TR')+' tarih bilgili katalog kaydı · Son 8 yıl grubu</div>':'<div class="analytics-empty">Yapım yılı bilgisi bulunamadı.</div>';

    const genres={};
    catalog.forEach(item=>{
      const values=String(item.category||item.genre||'Diğer').split('/').map(value=>value.trim()).filter(Boolean);
      [...new Set(values)].forEach(genre=>{genres[genre]=(genres[genre]||0)+1;});
    });
    const top=Object.entries(genres).sort((a,b)=>b[1]-a[1]).slice(0,7);
    const maxGenre=Math.max(1,...top.map(row=>row[1]));
    $('#archive-genre-list').innerHTML=top.length?top.map(([genre,count])=>'<div class="personal-genre-row"><span>'+escapeHtml(genre)+'</span><div class="personal-genre-track"><i style="width:'+(count/maxGenre*100)+'%"></i></div><b>'+count+'</b></div>').join(''):'<div class="analytics-empty">Tür bilgisi bulunamadı.</div>';
  }
  function renderPersonalAnalytics() {
    renderCatalogAnalytics();
    const counts={watching:0,watched:0,favorite:0,watchlist:0};
    diaryEntries.forEach(entry=>{if(counts[entry.status]!==undefined)counts[entry.status]++;});
    const rated=diaryEntries.filter(entry=>Number.isFinite(Number(entry.personalRating))&&Number(entry.personalRating)>=1&&Number(entry.personalRating)<=10&&entry.personalRating!=='');
    const average=rated.length?rated.reduce((sum,entry)=>sum+Number(entry.personalRating),0)/rated.length:0;
    $('#personal-stat-watched').textContent=counts.watched.toLocaleString('tr-TR');
    $('#personal-stat-rating').textContent=rated.length?average.toFixed(1).replace('.',',')+'/10':'—';
    $('#personal-stat-rated-count').textContent=rated.length? rated.length.toLocaleString('tr-TR')+' puanlı yapım':'Puanlanan kayıt yok';
    $('#personal-stat-watching').textContent=counts.watching.toLocaleString('tr-TR');
    $('#personal-stat-favorites').textContent=counts.favorite.toLocaleString('tr-TR');

    const movies=diaryEntries.filter(entry=>diaryItem(entry.id)?.type==='movie').length;
    const series=diaryEntries.filter(entry=>diaryItem(entry.id)?.type==='tv').length;
    const total=movies+series;
    const movieShare=total?movies/total*100:0;
    $('#personal-type-total').textContent=total.toLocaleString('tr-TR');
    $('#personal-type-movies').textContent=movies.toLocaleString('tr-TR');
    $('#personal-type-series').textContent=series.toLocaleString('tr-TR');
    $('#personal-type-donut').style.background=total?'conic-gradient(var(--gold) 0% '+movieShare+'%, #68788e '+movieShare+'% 100%)':'conic-gradient(#343b47 0% 100%)';

    const dated=diaryEntries.filter(entry=>entry.status==='watched'&&/^\d{4}-\d{2}-\d{2}$/.test(String(entry.date||''))&&!Number.isNaN(new Date(entry.date+'T12:00:00').getTime()));
    const yearCounts={};
    dated.forEach(entry=>{const year=entry.date.slice(0,4);yearCounts[year]=(yearCounts[year]||0)+1;});
    const allYears=Object.keys(yearCounts).sort();
    const currentYear=new Date().getFullYear();
    const visibleYears=Array.from({length:6},(_,index)=>String(currentYear-5+index));
    const olderCount=allYears.filter(year=>Number(year)<currentYear-5).reduce((sum,year)=>sum+yearCounts[year],0);
    const chartRows=visibleYears.map(year=>({year,count:yearCounts[year]||0}));
    if(olderCount)chartRows.unshift({year:'Önce',count:olderCount});
    const maxYearCount=Math.max(1,...chartRows.map(row=>row.count));
    $('#personal-year-chart').innerHTML=dated.length?'<div class="year-chart-bars">'+chartRows.map(row=>'<div class="year-chart-column"><b>'+row.count+'</b><div class="year-chart-track"><i style="height:'+Math.max(row.count?5:0,row.count/maxYearCount*100)+'%"></i></div><span>'+escapeHtml(row.year)+'</span></div>').join('')+'</div><div class="year-chart-foot">'+dated.length.toLocaleString('tr-TR')+' tarihli izleme kaydı</div>':'<div class="analytics-empty"><i class="fa-regular fa-calendar"></i><b>Henüz izleme geçmişi yok</b><span>Günlüğünde bir yapımı “İzlendi” olarak işaretleyip tarih eklediğinde yıllık grafiğin burada oluşacak.</span></div>';

    const genreCounts={};
    diaryEntries.forEach(entry=>{
      const item=diaryItem(entry.id);
      if(!item)return;
      const values=String(item.category||item.genre||'Diğer').split('/').map(value=>value.trim()).filter(Boolean);
      [...new Set(values)].forEach(genre=>{genreCounts[genre]=(genreCounts[genre]||0)+1;});
    });
    const genres=Object.entries(genreCounts).sort((a,b)=>b[1]-a[1]).slice(0,6);
    const maxGenre=Math.max(1,...genres.map(row=>row[1]));
    $('#personal-genre-list').innerHTML=genres.length?genres.map(([genre,count])=>'<div class="personal-genre-row"><span>'+escapeHtml(genre)+'</span><div class="personal-genre-track"><i style="width:'+(count/maxGenre*100)+'%"></i></div><b>'+count+'</b></div>').join(''):'<div class="analytics-empty">Günlüğüne yapım eklediğinde tür tercihlerin burada görünecek.</div>';

    const ratingBuckets=[{label:'9–10',min:9,max:10},{label:'7–8,5',min:7,max:8.5},{label:'5–6,5',min:5,max:6.5},{label:'1–4,5',min:1,max:4.5}];
    const ratingCounts=ratingBuckets.map(bucket=>({...bucket,count:rated.filter(entry=>Number(entry.personalRating)>=bucket.min&&Number(entry.personalRating)<=bucket.max).length}));
    const maxRating=Math.max(1,...ratingCounts.map(row=>row.count));
    $('#personal-rating-list').innerHTML=rated.length?ratingCounts.map(row=>'<div class="personal-rating-row"><span>'+row.label+'</span><div class="personal-rating-track"><i style="width:'+(row.count/maxRating*100)+'%"></i></div><b>'+row.count+'</b></div>').join(''):'<div class="analytics-empty"><i class="fa-solid fa-star"></i><b>Henüz puanlama yok</b><span>İzleme Günlüğü bölümünden yapımlara 1–10 arasında kişisel puan verebilirsin.</span></div>';
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
      initCollections();
      initDiary();
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
  ['#catalog-search','#catalog-type','#catalog-genre','#catalog-year','#catalog-rating','#catalog-sort'].forEach(selector => $(selector).addEventListener(selector==='#catalog-search'?'input':'change',() => {catalogPage=1;renderCatalog();}));
  $('#catalog-pagination').addEventListener('click',event => {
    const pageButton = event.target.closest('[data-catalog-page]');
    const stepButton = event.target.closest('[data-catalog-step]');
    if (pageButton) catalogPage = Number(pageButton.dataset.catalogPage);
    else if (stepButton && !stepButton.disabled) catalogPage += Number(stepButton.dataset.catalogStep);
    else return;
    renderCatalog();
    $('#catalog-poster-grid').scrollIntoView({behavior:'smooth',block:'start'});
  });
  $$('[data-catalog-view]').forEach(button => button.addEventListener('click',() => setCatalogView(button.dataset.catalogView)));
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
  $('#collection-list').addEventListener('click',handleCollectionClick);
  $('#collection-items-list').addEventListener('click',handleCollectionClick);
  $('#collection-add-item').addEventListener('click',addCollectionItem);
  $('#collection-visibility').addEventListener('click',toggleCollectionVisibility);
  $('#collection-create-form').addEventListener('submit',createCollection);
  $('#diary-tabs').addEventListener('click',handleDiaryClick);
  $('#diary-entry-list').addEventListener('click',handleDiaryClick);
  $('#diary-entry-list').addEventListener('change',handleDiaryChange);
  $('#diary-catalog-search').addEventListener('input',filterDiaryCatalog);
  $('#diary-add-button').addEventListener('click',addDiaryEntry);
  $('#diary-new-status').addEventListener('change',event=>{if(event.target.value==='watched'&&!$('#diary-new-date').value)$('#diary-new-date').value=new Date().toISOString().slice(0,10);});
  $('#diary-list-search').addEventListener('input',renderDiary);
  $('#hero-slide-list').addEventListener('click',handleHeroListClick);
  $$('[data-hero-preview]').forEach(button=>button.addEventListener('click',()=>{
    heroPreviewMode=button.dataset.heroPreview;
    $$('[data-hero-preview]').forEach(item=>{const active=item===button;item.classList.toggle('active',active);item.setAttribute('aria-pressed',String(active));});
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
    const data = {
      app:'Perde',
      backupType:'personal-data',
      version:1,
      diary:localArray('perde_watch_diary_v1'),
      favorites:localArray('ny7_favorites'),
      watchlist:localArray('ny7_watchlist'),
      exportedAt:new Date().toISOString()
    };
    downloadJson('perde-kisisel-yedek-'+new Date().toISOString().slice(0,10)+'.json',data);
    toast('Kişisel verilerin yedeği indirildi.');
  });
  $('#import-personal').addEventListener('click',() => $('#personal-backup-file').click());
  $('#personal-backup-file').addEventListener('change',async event => {
    const file=event.target.files&&event.target.files[0];
    if(!file)return;
    const hint=$('#backup-restore-hint');
    hint.textContent='Yedek dosyası kontrol ediliyor…';
    try {
      if(file.size>5*1024*1024)throw new Error('Yedek dosyası 5 MB sınırını aşıyor.');
      const parsed=JSON.parse(await file.text());
      if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('JSON yedek biçimi geçersiz.');
      if(parsed.backupType&&parsed.backupType!=='personal-data')throw new Error('Bu dosya kişisel Perde yedeği değil.');
      if(!Array.isArray(parsed.diary)||!Array.isArray(parsed.favorites)||!Array.isArray(parsed.watchlist))throw new Error('Yedekte günlük, favoriler veya izleme listesi eksik.');
      const allowedStatuses=['watching','watched','favorite','watchlist'];
      const restoredDiary=parsed.diary.filter(entry=>entry&&typeof entry==='object'&&catalog.some(item=>String(item.id)===String(entry.id))&&allowedStatuses.includes(entry.status)).map(entry=>({
        ...entry,
        id:String(entry.id),
        ...(Number.isFinite(Number(entry.personalRating))?{personalRating:Math.min(10,Math.max(1,Number(entry.personalRating)))}:{})
      }));
      if(!catalog.length)throw new Error('Katalog henüz yüklenmedi. Sayfayı yenileyip tekrar dene.');
      if(!window.confirm('Mevcut izleme günlüğü, favoriler ve izleme listesi bu yedekteki verilerle değiştirilsin mi? Bu işlem geri alınamaz.')) {
        hint.textContent='Geri yükleme iptal edildi.';
        return;
      }
      const storageKeys=['perde_watch_diary_v1','ny7_favorites','ny7_watchlist'];
      const previousValues=storageKeys.map(key=>localStorage.getItem(key));
      try {
        localStorage.setItem(storageKeys[0],JSON.stringify(restoredDiary));
        localStorage.setItem(storageKeys[1],JSON.stringify(parsed.favorites));
        localStorage.setItem(storageKeys[2],JSON.stringify(parsed.watchlist));
      } catch(storageError) {
        storageKeys.forEach((key,index)=>previousValues[index]===null?localStorage.removeItem(key):localStorage.setItem(key,previousValues[index]));
        throw new Error('Tarayıcı depolamasına yazılamadı; önceki kayıtlar korundu.');
      }
      diaryEntries=restoredDiary;
      renderDiary();
      renderOverview();
      if(typeof renderPersonalAnalytics==='function')renderPersonalAnalytics();
      hint.textContent=restoredDiary.length+' günlük kaydı geri yüklendi.';
      toast('Kişisel yedek başarıyla geri yüklendi.');
    } catch(error) {
      hint.textContent='Geri yükleme yapılamadı: '+error.message;
      toast('Yedek dosyası geçersiz veya okunamadı.');
    } finally {
      event.target.value='';
    }
  });
  init();
})();