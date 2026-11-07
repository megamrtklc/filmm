(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
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
    $('#recent-list').innerHTML = recent.length ? recent.map(item => '<div class="recent-row"><img class="recent-poster" src="'+poster(item)+'" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'"><div class="recent-meta"><b>'+escapeHtml(item.title)+'</b><small>'+escapeHtml(item.year||'Yıl bilgisi yok')+' · '+(item.type==='tv'?'Dizi':'Film')+'</small></div><span class="rating-tag">'+(item.rating ? '★ '+escapeHtml(item.rating) : 'Puan yok')+'</span></div>').join('') : '<div class="loading-line">Katalogda kayıt bulunamadı.</div>';
    $('#catalog-status').textContent = catalog.length+' kayıt başarıyla okundu';
  }
  function renderCatalog() {
    const query = ($('#catalog-search').value || '').trim().toLocaleLowerCase('tr-TR');
    const type = $('#catalog-type').value;
    const rows = catalog.filter(item => {
      const matchesType = type === 'all' || item.type === type;
      const haystack = [item.title,item.director,item.genre,item.category,item.year].join(' ').toLocaleLowerCase('tr-TR');
      return matchesType && haystack.includes(query);
    });
    $('#catalog-count').textContent = rows.length+' / '+catalog.length+' kayıt';
    $('#catalog-table-body').innerHTML = rows.slice(0,150).map(item => '<tr><td><div class="catalog-name">'+(poster(item)?'<img src="'+poster(item)+'" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">':'<span class="recent-poster"></span>')+'<span><b>'+escapeHtml(item.title)+'</b><small>'+escapeHtml(item.director||'Yönetmen bilgisi yok')+'</small></span></div></td><td><span class="type-pill">'+(item.type==='tv'?'Dizi':'Film')+'</span></td><td>'+escapeHtml(item.year||'—')+'</td><td>'+(item.rating?'★ '+escapeHtml(item.rating):'—')+'</td><td>'+escapeHtml(item.tmdbId||'—')+'</td><td><button class="row-action" type="button" data-inspect="'+escapeHtml(item.id)+'">İncele</button></td></tr>').join('') || '<tr><td colspan="6" class="empty-cell">Aramanla eşleşen yapım bulunamadı.</td></tr>';
    if (rows.length > 150) $('#catalog-count').textContent += ' · İlk 150 kayıt gösteriliyor';
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
      const response = await fetch('data/catalog.json',{cache:'no-store'});
      if (!response.ok) throw new Error('HTTP '+response.status);
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error('Katalog biçimi geçersiz');
      catalog = data;
      renderOverview();
      renderCatalog();
    } catch (error) {
      $('#catalog-status').textContent = 'Katalog yüklenemedi';
      $('#recent-list').innerHTML = '<div class="loading-line">Katalog okunamadı. Perde ana sayfasının yayınlandığı dizinde data/catalog.json dosyasını kontrol et.</div>';
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
  $('#catalog-search').addEventListener('input',renderCatalog);
  $('#catalog-type').addEventListener('change',renderCatalog);
  $('#catalog-table-body').addEventListener('click',event => {
    const button = event.target.closest('[data-inspect]');
    if (!button) return;
    const item = catalog.find(entry => String(entry.id) === button.dataset.inspect);
    if (item) toast(item.title+' · '+(item.type==='tv'?'Dizi':'Film')+' · '+(item.year||'Yıl bilgisi yok')+' — salt okunur ön izleme');
  });
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