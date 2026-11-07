(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  // Resolve the catalog from the actual admin.js location, not the current route.
  const adminScriptUrl = document.currentScript?.src || new URL('assets/js/admin.js', window.location.href).href;
  let catalog = [];
  let toastTimer;
  let editorType = 'movie';
  let editorDrafts = [];
  let editorEditingId = null;
  let tmdbSearchResults = [];
  let tmdbRequestSequence = 0;
  let editorSubtitles = [];
  let editorTmdbCast = [];
  const tmdbTokenStorageKey = 'perde_tmdb_read_token_v1';
  const pageNames = {overview:'Genel Bakış',catalog:'Film ve Diziler',editor:'Yapım Ekle / Düzenle',collections:'Koleksiyon Rafları',hero:'Manşet ve Slider',health:'İçerik Kontrolü',watchlinks:'İzleme Bağlantıları',watch:'İzleme Günlüğü',analytics:'İstatistikler',sources:'Veri Kaynakları',backups:'Yedekleme',settings:'Genel Ayarlar'};
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
  const editorFields = {
    title:'editor-title',originalTitle:'editor-original-title',year:'editor-year',category:'editor-category',
    genre:'editor-genre',rating:'editor-rating',duration:'editor-duration',country:'editor-country',
    director:'editor-director',tmdbId:'editor-tmdb',seasons:'editor-seasons',episodes:'editor-episodes',
    desc:'editor-desc',image:'editor-image',backdrop:'editor-backdrop',trailerUrl:'editor-trailer',imdbId:'editor-imdb',
    watchUrl:'editor-watch-url',platform:'editor-platform',personalNote:'editor-personal-note'
  };
  function editorValue(id) { return document.getElementById(id).value.trim(); }
  function getSelectedPlatforms() { return Array.from(document.querySelectorAll('#editor-platform-picker input[name="editor-platform"]:checked')).map(input=>input.value); }
  function setSelectedPlatforms(value) {
    const selected=Array.isArray(value)?value:String(value||'').split(/[,;|]/).map(item=>item.trim()).filter(Boolean);
    Array.from(document.querySelectorAll('#editor-platform-picker input[name="editor-platform"]')).forEach(input=>{input.checked=selected.some(item=>item.toLocaleLowerCase('tr-TR')===input.value.toLocaleLowerCase('tr-TR'));});
    updatePlatformPickerLabel();
  }
  function updatePlatformPickerLabel() {
    const selected=getSelectedPlatforms();
    $('#editor-platform-summary').textContent=selected.length?selected.join(' · '):'Platform seç';
  }
  function setEditorType(type) {
    editorType = type === 'tv' ? 'tv' : 'movie';
    $$('[data-editor-type]').forEach(button => button.classList.toggle('active',button.dataset.editorType===editorType));
    $$('.editor-series-field').forEach(field => field.hidden = editorType !== 'tv');
    $('#editor-duration-field').querySelector('input').placeholder = editorType === 'tv' ? '45 dk / bölüm' : '120 dk';
    $('#editor-page-title').textContent = editorEditingId ? 'Yapımı Düzenle' : (editorType === 'tv' ? 'Dizi Ekle' : 'Film Ekle');
    if (tmdbSearchResults.length) renderTmdbResults(tmdbSearchResults);
    renderEditorPreview();
  }
  function resetEditor() {
    $('#content-editor-form').reset();
    $('#editor-record-id').value = '';
    editorEditingId = null;
    $('#editor-tmdb-query').value = '';
    tmdbSearchResults = [];
    $('#editor-tmdb-results').innerHTML = '';
    $('#editor-tmdb-search-status').textContent = 'Aramaya başlamak için bir yapım adı yaz.';
    editorSubtitles = []; editorTmdbCast = []; renderEditorSubtitles();
    $('#editor-subtitle-file').value = ''; $('#editor-subtitle-season').value = ''; $('#editor-subtitle-episode').value = ''; $('#editor-subtitle-default').checked = true;
    $('#editor-subtitle-status').textContent = 'Henüz altyazı eklenmedi.';
    setEditorType('movie');
    $('#editor-page-title').textContent = 'Film / Dizi Ekle';
    $('#editor-preview-status').innerHTML = '<i class="fa-solid fa-circle-info"></i> Henüz taslak oluşturulmadı.';
    renderEditorPreview();
  }
  function editorPayload() {
    const value = {};
    Object.entries(editorFields).forEach(([key,id]) => {
      const raw = key === 'platform' ? getSelectedPlatforms().join(', ') : editorValue(id);
      // Perde'ye özel alanları boş bırakıldıklarında da açıkça kaydet:
      // düzenleme sırasında eski notun/bağlantının yanlışlıkla geri gelmesini önler.
      if (key === 'platform') value[key] = getSelectedPlatforms();
      else if (['watchUrl','personalNote'].includes(key)) value[key] = raw;
      else if (raw) value[key] = ['year','tmdbId','seasons','episodes'].includes(key) ? Number(raw) : raw;
    });
    value.type = editorType;
    value.subtitles = editorSubtitles.map(item=>({...item}));
    value.cast = editorValue('editor-cast').split(',').map(name=>name.trim()).filter(Boolean);
    if(editorTmdbCast.length) value.tmdbCast = editorTmdbCast.map(person=>({...person}));
    value.themeColor = '#101014';
    value.id = editorEditingId || ('draft-'+Date.now());
    if (editorType === 'movie') { value.seasons = null; value.episodes = null; }
    return value;
  }
  function renderEditorPreview() {
    const title = editorValue('editor-title') || 'Yapım adı';
    const image = editorValue('editor-image');
    const year = editorValue('editor-year') || 'YIL';
    const type = editorType === 'tv' ? 'DİZİ' : 'FİLM';
    $('#editor-preview-title').textContent = title;
    $('#editor-preview-type').textContent = type+' · '+year;
    $('#editor-preview-meta').textContent = [editorValue('editor-category')||editorValue('editor-genre')||'Tür belirtilmedi',editorValue('editor-duration')||'Süre belirtilmedi',editorValue('editor-rating')?'★ '+editorValue('editor-rating'):'Puan yok'].join(' · ');
    $('#editor-preview-desc').textContent = editorValue('editor-desc') || 'Konu metni burada görünecek.';
    const art = $('#editor-poster-preview');
    art.innerHTML = image ? '<img src="'+escapeHtml(image)+'" alt="'+escapeHtml(title)+' afiş ön izlemesi" onerror="this.parentElement.innerHTML=\'<div><i class=&quot;fa-solid fa-image&quot;></i><span>GÖRSEL YÜKLENEMEDİ</span></div>\'">' : '<div><i class="fa-solid fa-clapperboard"></i><span>AFİŞ ÖN İZLEMESİ</span></div>';
  }
  function renderEditorDrafts() {
    $('#editor-draft-count').textContent = editorDrafts.length;
    $('#editor-draft-list').innerHTML = editorDrafts.length ? editorDrafts.map((draft,index)=>'<button type="button" class="editor-draft-item" data-editor-draft="'+index+'"><span class="editor-draft-icon"><i class="fa-solid '+(draft.type==='tv'?'fa-tv':'fa-film')+'"></i></span><span><b>'+escapeHtml(draft.title||'İsimsiz yapım')+'</b><small>'+(draft.type==='tv'?'Dizi':'Film')+' · '+escapeHtml(draft.year||'Yıl yok')+'</small></span><i class="fa-solid fa-chevron-right"></i></button>').join('') : '<div class="editor-draft-empty">Henüz taslak yok.</div>';
  }
  function openEditor(item=null) {
    resetEditor();
    if (item) {
      editorEditingId = String(item.id);
      setEditorType(item.type);
      Object.entries(editorFields).forEach(([key,id]) => { if(key==='platform'){setSelectedPlatforms(item.platform);return;} document.getElementById(id).value = item[key] ?? ''; });
      $('#editor-cast').value = Array.isArray(item.cast) ? item.cast.join(', ') : '';
      editorTmdbCast = Array.isArray(item.tmdbCast) ? item.tmdbCast.map(person=>typeof person==='string'?{name:person,character:'',profile:''}:{...person}) : [];
      editorSubtitles = Array.isArray(item.subtitles) ? item.subtitles.map(entry=>({...entry})) : [];
      renderEditorSubtitles();
      $('#editor-record-id').value = editorEditingId;
      $('#editor-page-title').textContent = 'Yapımı Düzenle';
    }
    navigate('editor');
    renderEditorPreview();
  }
  const githubTokenStorageKey = 'perde_github_contents_token_v1';
  const githubRepo = 'megamrtklc/filmm';
  function getGithubToken() { try { return localStorage.getItem(githubTokenStorageKey) || ''; } catch (_) { return ''; } }
  function setGithubTokenStatus(message, good=false) { const node=$('#editor-github-status'); node.textContent=message; node.classList.toggle('is-ready',good); }
  function saveGithubToken() {
    const token=$('#editor-github-token').value.trim();
    if (!token) return toast('GitHub erişim anahtarını gir.');
    if (!/^(github_pat_|ghp_)[A-Za-z0-9_]+$/.test(token)) return setGithubTokenStatus('GitHub token biçimi tanınmadı. Fine-grained token kullan.');
    try { localStorage.setItem(githubTokenStorageKey,token); $('#editor-github-token').value=''; setGithubTokenStatus('GitHub kayıt bağlantısı bu tarayıcıya kaydedildi.',true); toast('GitHub kayıt bağlantısı hazır.'); }
    catch (_) { setGithubTokenStatus('Anahtar tarayıcıya kaydedilemedi.'); }
  }
  function decodeGithubContent(value) {
    const binary=atob(String(value||'').replace(/\s/g,''));
    const bytes=Uint8Array.from(binary,char=>char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  function encodeGithubContent(value) {
    const bytes=new TextEncoder().encode(value); let binary='';
    for(let i=0;i<bytes.length;i+=8192) binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    return btoa(binary);
  }
  async function githubCatalogRequest(method, body) {
    const token=getGithubToken(); if(!token) throw new Error('Önce GitHub kayıt anahtarını kaydet.');
    const response=await fetch('https://api.github.com/repos/'+githubRepo+'/contents/data/catalog.json',{
      method, headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28',...(body?{'Content-Type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error('GitHub HTTP '+response.status+': '+(data.message||'İstek başarısız.'));
    return data;
  }
  const subtitleLanguages={tr:'Türkçe',en:'İngilizce',de:'Almanca',fr:'Fransızca',es:'İspanyolca',it:'İtalyanca',ar:'Arapça',ja:'Japonca',ko:'Korece',other:'Diğer'};
  function renderEditorSubtitles(){
    const host=$('#editor-subtitle-list');if(!host)return;
    host.innerHTML=editorSubtitles.length?editorSubtitles.map((item,index)=>'<div class="editor-subtitle-item"><span class="subtitle-language-tag">'+escapeHtml(item.languageLabel||subtitleLanguages[item.language]||item.language||'Altyazı')+'</span><span class="editor-subtitle-name">'+escapeHtml(item.fileName||'Altyazı dosyası')+'</span><small>'+(item.season&&item.episode?'S'+item.season+' · B'+item.episode:'Tüm yapım')+(item.default?' · Varsayılan':'')+'</small><button type="button" data-remove-subtitle="'+index+'" aria-label="Altyazıyı listeden kaldır"><i class="fa-solid fa-trash"></i></button></div>').join(''):'<div class="editor-subtitle-empty">Bu yapım için henüz altyazı kaydı yok.</div>';
  }
  function convertSrtToVtt(source){
    let value=String(source||'').replace(/^\uFEFF/,'').replace(/\r/g,'').trim();
    value=value.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g,'$1.$2');
    return 'WEBVTT\n\n'+value+'\n';
  }
  async function githubUploadSubtitle(path,content){
    const token=getGithubToken();if(!token)throw new Error('Önce GitHub bağlantısını kur.');
    const response=await fetch('https://api.github.com/repos/'+githubRepo+'/contents/'+path,{method:'PUT',headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},body:JSON.stringify({message:'Add Perde subtitle: '+path.split('/').pop(),content:encodeGithubContent(content),branch:'main'})});
    const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error('Altyazı yüklenemedi (HTTP '+response.status+'): '+(result.message||'GitHub isteği başarısız.'));
    return 'https://megamrtklc.github.io/filmm/'+path;
  }
  async function addEditorSubtitle(){
    const file=$('#editor-subtitle-file').files?.[0];if(!file)return toast('Önce bir .srt veya .vtt dosyası seç.');
    if(file.size>1024*1024)return toast('Altyazı dosyası 1 MB sınırını aşmamalı.');
    if(!getGithubToken())return toast('Altyazı yüklemek için GitHub bağlantısı gerekli.');
    const language=$('#editor-subtitle-language').value,season=Number($('#editor-subtitle-season').value)||null,episode=Number($('#editor-subtitle-episode').value)||null;
    if((season&&!episode)||(!season&&episode))return toast('Sezon ve bölüm numarasını birlikte gir.');
    if(editorType==='movie'&&(season||episode))return toast('Sezon ve bölüm bilgisi yalnızca diziler için kullanılabilir.');
    const button=$('#editor-subtitle-add'),status=$('#editor-subtitle-status');button.disabled=true;button.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Yükleniyor…';status.textContent='Altyazı GitHub deposuna yükleniyor…';
    try{
      const raw=await file.text(),srt=/\.srt$/i.test(file.name),vtt=srt?convertSrtToVtt(raw):(/^WEBVTT/m.test(raw.trim())?raw:'WEBVTT\n\n'+raw);
      const key=editorEditingId||('tmdb-'+(editorValue('editor-tmdb')||Date.now()));
      const safe=file.name.replace(/\.[^.]+$/,'').normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,50)||'subtitle';
      const episodeTag=season&&episode?'-s'+season+'e'+episode:'',path='assets/subtitles/'+key+'/'+language+episodeTag+'-'+safe+'-'+Date.now()+'.vtt';
      const url=await githubUploadSubtitle(path,vtt);
      if($('#editor-subtitle-default').checked)editorSubtitles=editorSubtitles.map(item=>({...item,default:(Number(item.season)||0)!==season||(Number(item.episode)||0)!==episode?item.default:false}));
      editorSubtitles.push({language,languageLabel:subtitleLanguages[language]||language,fileName:file.name,url,default:$('#editor-subtitle-default').checked,season,episode});
      renderEditorSubtitles();$('#editor-subtitle-file').value='';status.textContent='Altyazı yüklendi. Yapım kaydını kaydettiğinde kataloğa bağlanacak.';toast('Altyazı GitHub’a yüklendi; şimdi yapımı kaydet.');
    }catch(error){status.textContent='Yükleme başarısız: '+error.message;toast(error.message);}
    finally{button.disabled=false;button.innerHTML='<i class="fa-solid fa-cloud-arrow-up"></i> Altyazıyı yükle ve ekle';}
  }
  async function githubCollectionsRequest(method, body) {
    const token=getGithubToken(); if(!token) throw new Error('Önce Veri Kaynakları bölümünden GitHub kayıt bağlantısını kur.');
    const response=await fetch('https://api.github.com/repos/'+githubRepo+'/contents/data/collections.json',{
      method,headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28',...(body?{'Content-Type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error('GitHub HTTP '+response.status+': '+(data.message||'Koleksiyon isteği başarısız.'));
    return data;
  }
  let collectionsSaveQueue=Promise.resolve();
  function persistCollections() {
    const normalized=collections.map(item=>({...item,items:item.items.map(String)}));
    const operation=collectionsSaveQueue.then(async()=>{
      const current=await githubCollectionsRequest('GET');
      if(!current.sha||!current.content) throw new Error('Koleksiyon dosyası okunamadı; mevcut kayıt korunuyor.');
      const latest=JSON.parse(decodeGithubContent(current.content));
      if(!Array.isArray(latest)) throw new Error('Koleksiyon dosyasının biçimi geçersiz.');
      await githubCollectionsRequest('PUT',{message:'Update Perde homepage collections',content:encodeGithubContent(JSON.stringify(normalized,null,2)+'\n'),sha:current.sha,branch:'main'});
      toast('Koleksiyonlar GitHub’a kalıcı olarak kaydedildi.');
    });
    collectionsSaveQueue=operation.catch(()=>{});
    return operation;
  }
  async function saveEditorDraft(event) {
    event.preventDefault(); const payload=editorPayload();
    if(!payload.title) return toast('Lütfen önce TMDB’den bir yapım seç.');
    if(!getGithubToken()) { setGithubTokenStatus('Kayıt için GitHub bağlantısı gerekli.'); return toast('Önce GitHub kayıt anahtarını ekle.'); }
    const submit=$('#content-editor-form').querySelector('[type="submit"]');
    submit.disabled=true; submit.textContent='GitHub’a kaydediliyor…';
    try {
      const current=await githubCatalogRequest('GET');
      if(!current.sha||!current.content) throw new Error('GitHub katalog dosyası okunamadı.');
      const latest=JSON.parse(decodeGithubContent(current.content));
      if(!Array.isArray(latest)) throw new Error('Katalog biçimi geçersiz.');
      const editing=!!editorEditingId;
      if(!editing && payload.tmdbId && latest.some(item=>item.type===payload.type && String(item.tmdbId)===String(payload.tmdbId))) throw new Error('Bu TMDB yapımı katalogda zaten var.');
      if(editing) {
        const index=latest.findIndex(item=>String(item.id)===String(editorEditingId));
        if(index<0) throw new Error('Düzenlenecek kayıt bulunamadı; katalog korunarak işlem durduruldu.');
        payload.id=latest[index].id; latest[index]={...latest[index],...payload};
      } else { payload.id='perde-'+Date.now().toString(36); latest.push(payload); }
      await githubCatalogRequest('PUT',{message:(editing?'Update':'Add')+' Perde catalog item: '+payload.title,content:encodeGithubContent(JSON.stringify(latest,null,2)+'\n'),sha:current.sha,branch:'main'});
      catalog=latest; editorEditingId=null; $('#editor-record-id').value='';
      renderOverview(); initCatalogFilters(); renderCatalog(); renderCatalogHealth(); renderWatchLinks(); initHeroManager(); initCollections(); initDiary();
      $('#editor-preview-status').textContent=payload.title+' GitHub kataloğuna kalıcı olarak kaydedildi.';
      toast('Yapım kaydedildi. Katalogda '+catalog.length+' kayıt var.');
    } catch(error) { $('#editor-preview-status').textContent='Kayıt başarısız: '+error.message+' Mevcut katalog değiştirilmedi.'; toast('Katalog kaydedilemedi: '+error.message); }
    finally { submit.disabled=false; submit.innerHTML='<i class="fa-solid fa-cloud-arrow-up"></i> Kataloğa kaydet'; }
  }
  function getTmdbToken() {
    try { return localStorage.getItem(tmdbTokenStorageKey) || ''; } catch (_) { return ''; }
  }
  function setTmdbTokenStatus(message, good=false) {
    const node = $('#editor-token-status');
    node.textContent = message;
    node.classList.toggle('is-ready',good);
  }
  function tmdbCredential() {
    const value = getTmdbToken().trim();
    if (!value) throw new Error('Önce TMDB API anahtarını kaydetmelisin.');
    if (/^[a-z0-9]{32}$/i.test(value)) return { type:'v3', value };
    if (value.split('.').length === 3 && value.startsWith('eyJ')) return { type:'bearer', value };
    throw new Error('Anahtar biçimi tanınmadı. TMDB API Key (v3) veya API Read Access Token kullan.');
  }
  async function tmdbRequest(path) {
    const credential = tmdbCredential();
    const separator = path.includes('?') ? '&' : '?';
    const url = 'https://api.themoviedb.org/3'+path+
      (credential.type === 'v3' ? separator+'api_key='+encodeURIComponent(credential.value) : '');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let response;
    try {
      response = await fetch(url, {
        headers: { ...(credential.type === 'bearer' ? { Authorization:'Bearer '+credential.value } : {}), Accept:'application/json' },
        signal: controller.signal
      });
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('TMDB yanıt vermedi (15 saniye zaman aşımı).');
      throw new Error('TMDB bağlantısı kurulamadı. Ağ veya tarayıcı engelini kontrol et ('+(error.message || 'bağlantı hatası')+').');
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      let detail = '';
      try { const body = await response.json(); detail = body.status_message || ''; } catch (_) {}
      if (response.status === 401 || response.status === 403) {
        throw new Error('TMDB kimlik doğrulaması reddedildi (HTTP '+response.status+'). '+(detail || 'Anahtar türünü ve TMDB API izinlerini kontrol et.'));
      }
      if (response.status === 429) throw new Error('TMDB istek sınırına ulaşıldı (HTTP 429). Biraz sonra tekrar dene.');
      throw new Error('TMDB isteği başarısız oldu (HTTP '+response.status+'). '+detail);
    }
    return response.json();
  }
  function tmdbImage(path, size='w500') {
    return path ? 'https://image.tmdb.org/t/p/'+size+path : '';
  }
  function renderTmdbResults(results) {
    const host = $('#editor-tmdb-results');
    tmdbSearchResults = results;
    const filtered = results.map((item,index)=>({item,index})).filter(entry=>entry.item.media_type===editorType);
    $('#editor-tmdb-search-status').textContent = filtered.length+' '+(editorType==='tv'?'dizi':'film')+' eşleşmesi gösteriliyor.';
    host.innerHTML = filtered.length ? filtered.map(({item,index}) => {
      const name = item.title || item.name || 'İsimsiz yapım';
      const year = String(item.release_date || item.first_air_date || '').slice(0,4);
      const image = tmdbImage(item.poster_path,'w185');
      const duplicate = !!(item.id && catalog.some(record=>record.type===editorType && String(record.tmdbId)===String(item.id)));
      return '<button type="button" class="tmdb-result-item'+(duplicate?' is-duplicate':'')+'" data-tmdb-result="'+index+'" '+(duplicate?'disabled aria-disabled="true"':'')+'>'+
        (image ? '<img src="'+escapeHtml(image)+'" alt="" loading="lazy">' : '<span class="tmdb-result-placeholder"><i class="fa-solid fa-clapperboard"></i></span>')+
        '<span class="tmdb-result-copy"><b>'+escapeHtml(name)+'</b><small>'+(item.media_type==='tv'?'Dizi':'Film')+' · '+escapeHtml(year||'Yıl bilinmiyor')+'</small><em>'+escapeHtml(item.overview||'Konu bilgisi bulunmuyor.')+'</em></span>'+
        (duplicate?'<span class="tmdb-result-state"><i class="fa-solid fa-check"></i> Katalogda mevcut</span>':'<i class="fa-solid fa-chevron-right"></i>')+'</button>';
    }).join('') : '<div class="tmdb-result-empty">Bu aramada '+(editorType==='tv'?'dizi':'film')+' bulunamadı. Diğer türü seçerek tekrar kontrol edebilirsin.</div>';
  }
  async function searchTmdb() {
    const query = $('#editor-tmdb-query').value.trim();
    if (!query) return toast('Aramak için yapım adını veya IMDb ID yaz.');
    const sequence = ++tmdbRequestSequence;
    const status = $('#editor-tmdb-search-status');
    status.textContent = 'TMDB kataloğunda aranıyor…';
    $('#editor-tmdb-results').innerHTML = '';
    try {
      let results = [];
      if (/^tt\d{5,}$/i.test(query)) {
        const found = await tmdbRequest('/find/'+encodeURIComponent(query)+'?external_source=imdb_id&language=tr-TR');
        results = [
          ...(found.movie_results || []).map(item=>({...item,media_type:'movie'})),
          ...(found.tv_results || []).map(item=>({...item,media_type:'tv'}))
        ];
      } else {
        // Search both media types so results do not depend on the selected editor tab.
        const encodedQuery = encodeURIComponent(query);
        const [movies, series] = await Promise.all([
          tmdbRequest('/search/movie?query='+encodedQuery+'&language=tr-TR&include_adult=false'),
          tmdbRequest('/search/tv?query='+encodedQuery+'&language=tr-TR&include_adult=false')
        ]);
        results = [
          ...(movies.results || []).map(item=>({...item,media_type:'movie'})),
          ...(series.results || []).map(item=>({...item,media_type:'tv'}))
        ].sort((a,b)=>(b.popularity || 0)-(a.popularity || 0));
      }
      if (sequence !== tmdbRequestSequence) return;
      status.textContent = results.length+' eşleşme bulundu. Doğru yapımı seç.';
      renderTmdbResults(results);
    } catch (error) {
      if (sequence !== tmdbRequestSequence) return;
      status.textContent = 'TMDB araması tamamlanamadı: '+error.message;
      tmdbSearchResults = [];
      $('#editor-tmdb-results').innerHTML = '<div class="tmdb-result-empty">'+escapeHtml(error.message)+'</div>';
    }
  }
  async function selectTmdbResult(index) {
    const result = tmdbSearchResults[index];
    if (!result) return;
    const type = result.media_type === 'tv' ? 'tv' : 'movie';
    const duplicate = catalog.find(record=>record.type===type && String(record.tmdbId)===String(result.id));
    if (duplicate) {
      $('#editor-tmdb-search-status').textContent = 'Bu yapım katalogda zaten kayıtlı: '+(duplicate.title||'İsimsiz yapım')+'. Düzenlemek için Film ve Diziler bölümünü kullan.';
      return toast('Bu yapım zaten Perde kataloğunda.');
    }
    const status = $('#editor-tmdb-search-status');
    status.textContent = 'Yapımın tüm bilgileri TMDB’den alınıyor…';
    try {
      const details = await tmdbRequest('/'+(type==='tv'?'tv':'movie')+'/'+encodeURIComponent(result.id)+'?language=tr-TR&append_to_response=credits,videos,external_ids');
      const releaseDate = details.release_date || details.first_air_date || '';
      const genres = (details.genres || []).map(item=>item.name).filter(Boolean);
      const crew = details.credits?.crew || [];
      const director = type === 'tv'
        ? (details.created_by || []).map(item=>item.name).join(', ')
        : (crew.find(item=>item.job==='Director')?.name || '');
      const castCredits = (details.credits?.cast || []).slice(0,12).filter(item=>item?.name);
      const cast = castCredits.map(item=>item.name);
      editorTmdbCast = castCredits.map(item=>({id:item.id||null,name:item.name,character:item.character||'',profile:item.profile_path?tmdbImage(item.profile_path,'w185'):'',order:item.order??0}));
      const countries = type === 'tv'
        ? (details.origin_country || []).join(', ')
        : (details.production_countries || []).map(item=>item.name).join(', ');
      const trailer = (details.videos?.results || []).find(item=>item.site==='YouTube' && item.type==='Trailer') ||
        (details.videos?.results || []).find(item=>item.site==='YouTube');
      const duration = type === 'tv'
        ? ((details.episode_run_time || [])[0] ? (details.episode_run_time[0]+' dk / bölüm') : 'Bilinmiyor')
        : (details.runtime ? (details.runtime+' dk') : 'Bilinmiyor');
      const values = {
        title:details.title || details.name || '',
        originalTitle:details.original_title || details.original_name || '',
        year:releaseDate.slice(0,4),
        category:genres.join(' / '),
        genre:genres[0] || '',
        rating:Number.isFinite(Number(details.vote_average)) ? Number(details.vote_average).toFixed(1) : '',
        duration,
        country:countries,
        director,
        tmdbId:details.id || '',
        imdbId:details.external_ids?.imdb_id || details.imdb_id || '',
        seasons:type==='tv' ? (details.number_of_seasons ?? '') : '',
        episodes:type==='tv' ? (details.number_of_episodes ?? '') : '',
        desc:details.overview || '',
        image:tmdbImage(details.poster_path,'w500'),
        backdrop:tmdbImage(details.backdrop_path,'w1280'),
        trailerUrl:trailer?.key ? 'https://www.youtube.com/watch?v='+trailer.key : ''
      };
      setEditorType(type);
      Object.entries(editorFields).forEach(([key,id]) => {
        if (['watchUrl','platform','personalNote'].includes(key)) return;
        const node = document.getElementById(id);
        if (node) node.value = values[key] ?? '';
      });
      $('#editor-cast').value = cast.join(', ');
      $('#editor-record-id').value = '';
      editorEditingId = null;
      $('#editor-page-title').textContent = type==='tv' ? 'Dizi Ekle' : 'Film Ekle';
      $('#editor-preview-status').innerHTML = '<i class="fa-solid fa-check"></i> TMDB bilgileri otomatik yüklendi.';
      status.textContent = 'Seçildi: '+(values.title || 'Yapım')+' · TMDB ID '+details.id;
      renderEditorPreview();
      $('#content-editor-form').scrollIntoView({behavior:'smooth',block:'start'});
    } catch (error) {
      status.textContent = error.message;
    }
  }
  function saveTmdbToken() {
    const token = $('#editor-tmdb-token').value.trim();
    if (!token) return toast('TMDB API Key (v3) veya Read Access Token alanını doldur.');
    try {
      localStorage.setItem(tmdbTokenStorageKey,token);
      $('#editor-tmdb-token').value = '';
      setTmdbTokenStatus(/^[a-z0-9]{32}$/i.test(token) ? 'TMDB API Key (v3) bu tarayıcıya kaydedildi.' : 'Read Access Token bu tarayıcıya kaydedildi.',true);
      toast('TMDB bağlantı anahtarı kaydedildi.');
    } catch (_) {
      setTmdbTokenStatus('Tarayıcı depolamasına kaydedilemedi.');
    }
  }

  async function syncCatalogWithTmdb() {
    const button=$('#tmdb-sync-catalog'),status=$('#tmdb-sync-status'),progress=$('#tmdb-sync-progress');
    if(!getTmdbToken()) { status.textContent='Önce TMDB anahtarını kaydet.'; return toast('TMDB bağlantısı gerekli.'); }
    if(!getGithubToken()) { status.textContent='Kalıcı kayıt için GitHub bağlantısı gerekli.'; return toast('Önce GitHub kayıt anahtarını kaydet.'); }
    if(!window.confirm('TMDB ID bilgisi bulunan tüm film ve diziler yenilensin mi? Elle girilmiş açıklama, başlık ve kişisel alanlar korunur.')) return;
    button.disabled=true;
    const original=button.innerHTML;
    button.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Katalog eşitleniyor…';
    let succeeded=0,failed=0,skipped=0,stopError='';
    try {
      const current=await githubCatalogRequest('GET');
      if(!current.sha||!current.content) throw new Error('GitHub katalog dosyası okunamadı.');
      const latest=JSON.parse(decodeGithubContent(current.content));
      if(!Array.isArray(latest)) throw new Error('Katalog biçimi geçersiz.');
      const targets=latest.filter(item=>item&&item.tmdbId&&['movie','tv'].includes(item.type));
      skipped=latest.length-targets.length;
      if(!targets.length) throw new Error('TMDB ID bulunan kayıt yok.');
      for(let index=0;index<targets.length;index++) {
        const item=targets[index];
        progress.textContent=(index+1)+' / '+targets.length+' · '+(item.title||'İsimsiz yapım')+' yükleniyor…';
        try {
          const type=item.type==='tv'?'tv':'movie';
          const details=await tmdbRequest('/'+type+'/'+encodeURIComponent(item.tmdbId)+'?language=tr-TR&append_to_response=credits,videos,external_ids');
          const releaseDate=details.release_date||details.first_air_date||'';
          const genres=(details.genres||[]).map(row=>row.name).filter(Boolean);
          const crew=details.credits?.crew||[];
          const director=type==='tv'?(details.created_by||[]).map(row=>row.name).filter(Boolean).join(', '):(crew.find(row=>row.job==='Director')?.name||'');
          const castCredits=(details.credits?.cast||[]).slice(0,12).filter(row=>row?.name);
          const cast=castCredits.map(row=>row.name);
          const castDetails=castCredits.map(row=>({id:row.id||null,name:row.name,character:row.character||'',profile:row.profile_path?tmdbImage(row.profile_path,'w185'):'',order:row.order??0}));
          const trailer=(details.videos?.results||[]).find(row=>row.site==='YouTube'&&row.type==='Trailer')||(details.videos?.results||[]).find(row=>row.site==='YouTube');
          const countries=type==='tv'?(details.origin_country||[]).join(', '):(details.production_countries||[]).map(row=>row.name).filter(Boolean).join(', ');
          const runtime=type==='tv'?((details.episode_run_time||[])[0]?(details.episode_run_time[0]+' dk / bölüm'):''):(details.runtime?(details.runtime+' dk'):'');
          const posterUrl=tmdbImage(details.poster_path,'w500'),backdropUrl=tmdbImage(details.backdrop_path,'w1280');
          const first=(...values)=>values.find(value=>value!==undefined&&value!==null&&String(value).trim()!=='');
          item.tmdbRating=Number.isFinite(Number(details.vote_average))?Number(details.vote_average).toFixed(1):'';
          item.tmdbVoteCount=Number(details.vote_count)||0;
          item.tmdbTitle=details.title||details.name||'';
          item.tmdbOriginalTitle=details.original_title||details.original_name||'';
          item.tmdbReleaseDate=releaseDate;
          item.tmdbGenres=genres.join(' / ');
          item.tmdbRuntime=runtime;
          item.tmdbCountries=countries;
          item.tmdbDirector=director;
          item.tmdbCast=castDetails;
          item.tmdbOverview=details.overview||'';
          item.tmdbPoster=posterUrl;
          item.tmdbBackdrop=backdropUrl;
          item.tmdbTrailerUrl=trailer?.key?'https://www.youtube.com/watch?v='+trailer.key:'';
          item.tmdbImdbId=details.external_ids?.imdb_id||details.imdb_id||'';
          item.tmdbSyncedAt=new Date().toISOString();
          if(!item.originalTitle)item.originalTitle=first(item.tmdbOriginalTitle);
          if(!item.year)item.year=releaseDate.slice(0,4);
          if(!item.category)item.category=genres.join(' / ');
          if(!item.genre)item.genre=genres[0]||'';
          if(!item.duration)item.duration=runtime;
          if(!item.country)item.country=countries;
          if(!item.director)item.director=director;
          if(!Array.isArray(item.cast)||!item.cast.length)item.cast=cast;
          if(!item.desc)item.desc=details.overview||'';
          if(posterUrl)item.image=posterUrl;
          if(backdropUrl)item.backdrop=backdropUrl;
          if(!item.trailerUrl)item.trailerUrl=item.tmdbTrailerUrl;
          if(!item.imdbId)item.imdbId=item.tmdbImdbId;
          if(type==='tv') {
            item.tmdbSeasons=Number(details.number_of_seasons)||0;
            item.tmdbEpisodes=Number(details.number_of_episodes)||0;
            if(!item.seasons)item.seasons=item.tmdbSeasons;
            if(!item.episodes)item.episodes=item.tmdbEpisodes;
          }
          succeeded++;
        } catch(error) {
          failed++;
          if(/HTTP 401|HTTP 403|HTTP 429|kimlik doğrulaması/i.test(error.message)) { stopError=error.message; break; }
          console.warn('TMDB katalog kaydı güncellenemedi:',item.title,error);
        }
      }
      if(!succeeded) throw new Error(stopError||'TMDB’den güncellenebilen kayıt bulunamadı.');
      progress.textContent='GitHub kataloğuna kaydediliyor…';
      await githubCatalogRequest('PUT',{message:'Sync Perde catalog metadata from TMDB ('+succeeded+' items)',content:encodeGithubContent(JSON.stringify(latest,null,2)+'\n'),sha:current.sha,branch:'main'});
      catalog=latest;
      renderOverview();initCatalogFilters();renderCatalog();renderCatalogHealth();renderWatchLinks();initHeroManager();initCollections();initDiary();
      const summary=succeeded+' kayıt güncellendi · '+failed+' hata · '+skipped+' TMDB kimliği olmayan kayıt atlandı.';
      status.textContent=summary;
      progress.textContent=stopError?'Kısmi eşitleme tamamlandı. '+stopError:summary;
      toast(succeeded+' yapımın TMDB verileri kataloğa kaydedildi.');
    } catch(error) {
      status.textContent='Eşitleme başarısız: '+error.message;
      progress.textContent='Katalog korunarak işlem durduruldu.';
      toast('TMDB eşitlemesi tamamlanamadı: '+error.message);
    } finally {
      button.disabled=false;
      button.innerHTML=original;
    }
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
    const recent = [...catalog].reverse().slice(0,5);
    $('#recent-list').innerHTML = recent.length ? recent.map(item => '<article class="recent-poster-card">'+(poster(item)?'<img class="recent-poster-image" src="'+poster(item)+'" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">':'<div class="recent-poster-placeholder"><i class="fa-solid fa-film"></i></div>')+'<div class="recent-poster-overlay"><span>'+(item.type==='tv'?'DİZİ':'FİLM')+' · '+escapeHtml(item.year||'—')+'</span><b>'+escapeHtml(item.title)+'</b><small>'+(item.rating?'★ '+escapeHtml(item.rating):'Puan bilgisi yok')+'</small></div></article>').join('') : '<div class="loading-line">Katalogda kayıt bulunamadı.</div>';
    const stackItems = [...catalog].reverse().filter(item => poster(item)).slice(0,4);
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
  const healthLabels={poster:'Afiş',description:'Konu',year:'Yıl',genre:'Tür',rating:'Puan',tmdb:'TMDB',director:'Yönetmen',cast:'Oyuncu'};
  let healthFilter='all';
  function catalogIssues(item){
    const issues=[];
    if(!(item.image||item.poster||item.tmdbPoster))issues.push('poster');
    if(!(item.desc||item.overview||item.tmdbOverview))issues.push('description');
    if(!(item.year||item.tmdbReleaseDate))issues.push('year');
    if(!(item.genre||item.category||item.tmdbGenres))issues.push('genre');
    if(!(item.rating||item.tmdbRating))issues.push('rating');
    if(!item.tmdbId)issues.push('tmdb');
    if(!(item.director||item.tmdbDirector))issues.push('director');
    if(!((Array.isArray(item.cast)&&item.cast.length)||(Array.isArray(item.tmdbCast)&&item.tmdbCast.length)))issues.push('cast');
    return issues;
  }
  function duplicateCatalogIds(){
    const groups=new Map();
    catalog.forEach(item=>{
      const tmdb=item.tmdbId?String(item.type||'')+':tmdb:'+String(item.tmdbId):'';
      const title=String(item.title||'').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
      const titleYear=title&&item.year?String(item.type||'')+':title:'+title+':'+item.year:'';
      [tmdb,titleYear].filter(Boolean).forEach(key=>{if(!groups.has(key))groups.set(key,[]);groups.get(key).push(String(item.id));});
    });
    const ids=new Set();groups.forEach(rows=>{if(rows.length>1)rows.forEach(id=>ids.add(id));});return ids;
  }
  function renderCatalogHealth(){
    const duplicates=duplicateCatalogIds();
    const incomplete=catalog.filter(item=>catalogIssues(item).length);
    const noWatch=catalog.filter(item=>!item.watchUrl);
    $('#health-total').textContent=catalog.length.toLocaleString('tr-TR');
    $('#health-incomplete').textContent=incomplete.length.toLocaleString('tr-TR');
    $('#health-duplicates').textContent=duplicates.size.toLocaleString('tr-TR');
    $('#health-no-watch').textContent=noWatch.length.toLocaleString('tr-TR');
    const rows=[];
    catalog.forEach(item=>{
      const issues=catalogIssues(item);
      if(healthFilter==='duplicate'){
        if(duplicates.has(String(item.id)))rows.push({item,labels:['Olası tekrar']});
      }else{
        const selected=healthFilter==='all'?issues:issues.filter(key=>key===healthFilter);
        if(selected.length)rows.push({item,labels:selected.map(key=>healthLabels[key])});
      }
    });
    $('#health-result-count').textContent=rows.length.toLocaleString('tr-TR')+' kayıt';
    $('#health-issue-list').innerHTML=rows.length?rows.map(({item,labels})=>'<article class="health-issue-row"><div class="health-issue-poster">'+(poster(item)?'<img src="'+poster(item)+'" alt="" loading="lazy" onerror="this.remove()">':'<i class="fa-solid fa-clapperboard"></i>')+'</div><div class="health-issue-copy"><b>'+escapeHtml(item.title)+'</b><small>'+(item.type==='tv'?'Dizi':'Film')+' · '+escapeHtml(item.year||'Yıl yok')+' · '+escapeHtml(item.id)+'</small><div class="health-tags">'+labels.map(label=>'<span>'+escapeHtml(label)+'</span>').join('')+'</div></div><button type="button" class="row-action" data-health-edit="'+escapeHtml(item.id)+'">Düzenle</button></article>').join(''):'<div class="health-empty"><i class="fa-solid fa-circle-check"></i><b>Bu filtrede sorun görünmüyor</b><span>Seçili kontrol başlığı için katalog kayıtları tamam.</span></div>';
  }
  function isYoutubeSource(url){const host=String(url||'').split('://').pop().split('/')[0].toLowerCase();return host==='youtu.be'||host==='youtube.com'||host.endsWith('.youtube.com');}
  function renderWatchLinks(){
    const search=($('#watchlink-search').value||'').trim().toLocaleLowerCase('tr-TR');
    const filter=$('#watchlink-filter').value,type=$('#watchlink-type').value;
    const linked=catalog.filter(item=>item.watchUrl);
    const youtube=linked.filter(item=>isYoutubeSource(item.watchUrl));
    const direct=linked.filter(item=>!isYoutubeSource(item.watchUrl));
    $('#watchlink-total').textContent=catalog.length.toLocaleString('tr-TR');
    $('#watchlink-has').textContent=linked.length.toLocaleString('tr-TR');
    $('#watchlink-youtube').textContent=youtube.length.toLocaleString('tr-TR');
    $('#watchlink-direct').textContent=direct.length.toLocaleString('tr-TR');
    const rows=catalog.filter(item=>{
      const has=!!item.watchUrl,yt=has&&isYoutubeSource(item.watchUrl);
      return (type==='all'||item.type===type)&&(filter==='all'||(filter==='has'&&has)||(filter==='missing'&&!has)||(filter==='youtube'&&yt)||(filter==='direct'&&has&&!yt))&&String(item.title||'').toLocaleLowerCase('tr-TR').includes(search);
    });
    $('#watchlink-list').innerHTML=rows.length?rows.map(item=>{
      const url=String(item.watchUrl||'');const valid=url.startsWith('https://')||url.startsWith('http://');const yt=valid&&isYoutubeSource(url);
      const kind=!url?'Bağlantı eklenmemiş':yt?'YouTube bağlantısı':'Doğrudan / harici video';
      return '<article class="watchlink-row"><div class="watchlink-poster">'+(poster(item)?'<img src="'+poster(item)+'" alt="" loading="lazy" onerror="this.remove()">':'<i class="fa-solid fa-film"></i>')+'</div><div class="watchlink-copy"><b>'+escapeHtml(item.title)+'</b><small>'+(item.type==='tv'?'Dizi':'Film')+' · '+escapeHtml(item.year||'—')+'</small><span class="'+(url?'watchlink-present':'watchlink-missing')+'"><i class="fa-solid '+(yt?'fa-brands fa-youtube':url?'fa-link':'fa-circle-minus')+'"></i> '+kind+'</span>'+(valid?'<a href="'+escapeHtml(url)+'" target="_blank" rel="noopener noreferrer" class="watchlink-url">'+escapeHtml(url)+'</a>':'')+'</div><button type="button" class="row-action" data-watch-edit="'+escapeHtml(item.id)+'">'+(url?'Düzenle':'Bağlantı ekle')+'</button></article>';
    }).join(''):'<div class="health-empty"><i class="fa-solid fa-circle-info"></i><b>Sonuç bulunamadı</b><span>Arama veya filtre ölçütlerini değiştirebilirsin.</span></div>';
  }

  let catalogView = 'grid';
  let catalogPage = 1;
  const catalogPageSize = 15;
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
    $('#catalog-incomplete').textContent = catalog.filter(item => catalogIssues(item).length).length.toLocaleString('tr-TR');
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
      if (sort === 'added-desc') return catalog.indexOf(b) - catalog.indexOf(a);
      if (sort === 'title-asc') return String(a.title || '').localeCompare(String(b.title || ''),'tr');
      if (sort === 'rating-desc') return (Number.parseFloat(b.rating)||-1) - (Number.parseFloat(a.rating)||-1);
      if (sort === 'year-asc') return (Number(a.year)||0) - (Number(b.year)||0);
      return (Number(b.year)||0) - (Number(a.year)||0);
    });
    return rows;
  }
  function catalogQuality(item) {
    return catalogIssues(item).map(key=>healthLabels[key]);
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
  let heroSettings = {desktopCount:6,mobileCount:4,interval:6,autoplay:true,pauseOnHover:true};
  function normalizeHeroSettings(settings={}) {
    const desktop=[4,5,6,8,10],mobile=[3,4,5,6],intervals=[4,6,8,10];
    return {desktopCount:desktop.includes(Number(settings.desktopCount))?Number(settings.desktopCount):6,mobileCount:mobile.includes(Number(settings.mobileCount))?Number(settings.mobileCount):4,interval:intervals.includes(Number(settings.interval))?Number(settings.interval):6,autoplay:settings.autoplay!==false,pauseOnHover:settings.pauseOnHover!==false};
  }
  function syncHeroSettingsForm(){
    $('#hero-desktop-count').value=String(heroSettings.desktopCount);$('#hero-mobile-count').value=String(heroSettings.mobileCount);$('#hero-interval').value=String(heroSettings.interval);$('#hero-autoplay').checked=heroSettings.autoplay;$('#hero-pause-hover').checked=heroSettings.pauseOnHover;
  }
  function readHeroSettingsForm(){heroSettings=normalizeHeroSettings({desktopCount:$('#hero-desktop-count').value,mobileCount:$('#hero-mobile-count').value,interval:$('#hero-interval').value,autoplay:$('#hero-autoplay').checked,pauseOnHover:$('#hero-pause-hover').checked});}
  function heroImage(item) { return item.tmdbBackdrop || item.backdrop || item.image || item.poster || ''; }
  function heroSeed() {
    return [...catalog].filter(item => heroImage(item)).sort((a,b) => (Number.parseFloat(b.rating)||0)-(Number.parseFloat(a.rating)||0)).slice(0,5).map(item => ({id:String(item.id),active:true,headline:'',description:''}));
  }
  async function githubHeroConfigRequest(method,body) {
    const token=getGithubToken();
    if(!token) throw new Error('Kalıcı yayın için önce Veri Kaynakları / GitHub bağlantısına erişim anahtarını kaydet.');
    const response=await fetch('https://api.github.com/repos/'+githubRepo+'/contents/data/homepage-config.json',{
      method,headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28',...(body?{'Content-Type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error('GitHub HTTP '+response.status+': '+(data.message||'Yayın ayarları okunamadı.'));
    return data;
  }
  async function loadHeroConfig() {
    let config=null;
    if(getGithubToken()) {
      try { const saved=await githubHeroConfigRequest('GET'); config=JSON.parse(decodeGithubContent(saved.content)); }
      catch(error) { console.warn('GitHub manşet ayarları okunamadı, yayınlanan dosya deneniyor:',error); }
    }
    if(!config) {
      try { const response=await fetch('data/homepage-config.json?ts='+Date.now(),{cache:'no-store'}); if(response.ok)config=await response.json(); }
      catch(error) { console.warn('Manşet ayar dosyası okunamadı:',error); }
    }
    heroSettings=normalizeHeroSettings(config?.settings||{});
    syncHeroSettingsForm();
    if(config&&Array.isArray(config.heroSlides)&&config.heroSlides.length) {
      const validIds=new Set(catalog.map(item=>String(item.id)));
      heroSlides=config.heroSlides.filter(slide=>slide&&validIds.has(String(slide.id))).map(slide=>({
        id:String(slide.id),active:slide.active!==false,
        headline:String(slide.headline||''),description:String(slide.description||'')
      }));
      $('#hero-save-status-title').textContent='Kayıtlı yayın ayarları';
      $('#hero-save-status').textContent='GitHub dosyasından yüklendi.';
    } else {
      heroSlides=heroSeed();
      $('#hero-save-status-title').textContent='Henüz özel yayın ayarı yok';
      $('#hero-save-status').textContent='İlk düzenlemeni yapıp kaydedebilirsin.';
    }
    heroActiveIndex=0;
    renderHeroSlides();
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
      $('#hero-headline-input').value=''; $('#hero-description-input').value='';
      $('#hero-live-backdrop').style.backgroundImage='';
      $('#hero-live-index').textContent='00 / 00';
      return;
    }
    const image=heroImage(item);
    $('#hero-live-backdrop').style.backgroundImage=image?'linear-gradient(90deg,rgba(7,9,13,.94) 0%,rgba(7,9,13,.62) 52%,rgba(7,9,13,.12) 100%),linear-gradient(0deg,rgba(7,9,13,.55),transparent 65%),url("'+image.replace(/["\\]/g,'')+'")':'linear-gradient(120deg,#202631,#0b0d11)';
    const slide=heroSlides[heroActiveIndex]||{};
    $('#hero-live-title').textContent=slide.headline||item.title||'Başlıksız yapım';
    $('#hero-headline-input').value=slide.headline||'';
    $('#hero-description-input').value=slide.description||'';
    $('#hero-live-meta').innerHTML='<span>'+(item.type==='tv'?'DİZİ':'FİLM')+'</span><i>•</i><span>'+escapeHtml(item.year||'—')+'</span>'+(item.duration?'<i>•</i><span>'+escapeHtml(item.duration)+'</span>':'')+(item.rating?'<i>•</i><b>★ '+escapeHtml(item.rating)+'</b>':'');
    $('#hero-live-desc').textContent=slide.description||item.tmdbOverview||item.desc||'Bu yapım için katalogda tanıtım metni bulunmuyor.';
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
    setupCatalogPicker('hero-catalog-picker','hero-content-select','hero-catalog-results','hero-catalog-selected',()=>heroSlides.map(slide=>slide.id));
    heroSlides=heroSeed();
    heroActiveIndex=0;
    renderHeroSlides();
    loadHeroConfig();
  }
  function addHeroSlide() {
    const id=$('#hero-content-select').value;
    if(!id)return toast('Önce katalogdan bir yapım seç.');
    if(heroSlides.some(slide=>slide.id===id))return toast('Bu yapım zaten slider listesinde.');
    heroSlides.push({id,active:true,headline:'',description:''});
    resetCatalogPicker('hero-catalog-picker');
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
  async function saveHeroConfig() {
    const button=$('#hero-save-button');
    if(!heroSlides.length)return toast('Yayınlamak için slider listesine en az bir yapım ekle.');
    if(!heroSlides.some(slide=>slide.active))return toast('En az bir yapımı yayında bırakmalısın.');
    const validSlides=heroSlides.filter(slide=>catalog.some(item=>String(item.id)===slide.id)).map(slide=>({
      id:slide.id,active:slide.active!==false,
      headline:String(slide.headline||'').trim().slice(0,90),
      description:String(slide.description||'').trim().slice(0,360)
    }));
    button.disabled=true;button.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Kaydediliyor…';
    $('#hero-save-status').textContent='GitHub deposuna kaydediliyor…';
    try {
      const current=await githubHeroConfigRequest('GET');
      if(!current.sha)throw new Error('Yayın ayar dosyasının sürümü okunamadı.');
      readHeroSettingsForm();
      const payload={version:2,updatedAt:new Date().toISOString(),settings:heroSettings,heroSlides:validSlides};
      await githubHeroConfigRequest('PUT',{
        message:'Update Perde homepage hero and slider settings',
        content:encodeGithubContent(JSON.stringify(payload,null,2)+'\n'),
        sha:current.sha,branch:'main'
      });
      heroSlides=validSlides;renderHeroSlides();
      $('#hero-save-status-title').textContent='Yayında';
      $('#hero-save-status').textContent=new Date().toLocaleString('tr-TR')+' · GitHub’a kaydedildi.';
      toast('Manşet ve slider ayarları kaydedildi. Ana sayfa yayınlanıyor.');
    } catch(error) {
      $('#hero-save-status-title').textContent='Kayıt başarısız';
      $('#hero-save-status').textContent=error.message;
      toast('Yayın ayarları kaydedilemedi: '+error.message);
    } finally {
      button.disabled=false;button.innerHTML='<i class="fa-solid fa-cloud-arrow-up"></i> Değişiklikleri kaydet ve yayınla';
    }
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
  const catalogPickerState = {};
  function setupCatalogPicker(rootId,selectId,resultsId,selectedId,getExcluded) {
    const root=$('#'+rootId), select=$('#'+selectId);
    if(!root||!select)return;
    select.innerHTML='<option value="">Yapım seç…</option>';
    [...catalog].sort((a,b)=>String(a.title||'').localeCompare(String(b.title||''),'tr')).forEach(item=>select.add(new Option((item.type==='tv'?'Dizi':'Film')+' · '+item.title+' ('+(item.year||'—')+')',String(item.id))));
    catalogPickerState[rootId]={rootId,selectId,resultsId,selectedId,getExcluded,filter:'all'};
    const search=root.querySelector('input[type="search"]');
    search.addEventListener('input',()=>renderCatalogPicker(rootId));
    root.addEventListener('click',event=>{
      const filter=event.target.closest('[data-picker-filter]');
      if(filter){catalogPickerState[rootId].filter=filter.dataset.pickerFilter;root.querySelectorAll('[data-picker-filter]').forEach(button=>button.classList.toggle('active',button===filter));renderCatalogPicker(rootId);return;}
      const choose=event.target.closest('[data-picker-item]');
      if(choose){const state=catalogPickerState[rootId];const item=catalog.find(entry=>String(entry.id)===choose.dataset.pickerItem);if(!item)return;
        if((state.getExcluded?.()||[]).map(String).includes(String(item.id)))return;
        select.value=String(item.id);$('#'+selectedId).innerHTML='<i class="fa-solid fa-check-circle"></i> Seçildi: <b>'+escapeHtml(item.title)+'</b> <span>· '+(item.type==='tv'?'Dizi':'Film')+' · '+escapeHtml(item.year||'—')+'</span>';
        root.querySelectorAll('[data-picker-item]').forEach(button=>button.classList.toggle('chosen',button===choose));
      }
    });
    renderCatalogPicker(rootId);
  }
  function renderCatalogPicker(rootId) {
    const state=catalogPickerState[rootId];if(!state)return;
    const root=$('#'+rootId),query=(root.querySelector('input[type="search"]').value||'').trim().toLocaleLowerCase('tr-TR');
    const excluded=new Set((state.getExcluded?.()||[]).map(String));
    const results=catalog.filter(item=>(state.filter==='all'||(state.filter==='tv'?item.type==='tv':item.type!=='tv'))&&(!query||[item.title,item.originalTitle,item.original_title,item.director,item.year].some(value=>String(value||'').toLocaleLowerCase('tr-TR').includes(query)))).slice(0,80);
    const target=$('#'+state.resultsId);
    if(!results.length){target.innerHTML='<div class="catalog-picker-empty"><i class="fa-solid fa-magnifying-glass"></i><span>Aramana uygun yapım bulunamadı.</span></div>';return;}
    if(!query&&state.filter==='all'){target.innerHTML='<div class="catalog-picker-hint"><i class="fa-solid fa-keyboard"></i> Arşivde arama yapmak için yapım adını yaz.</div>';return;}
    target.innerHTML=results.map(item=>{
      const id=String(item.id),image=poster(item),already=excluded.has(id),selected=$('#'+state.selectId).value===id;
      return '<button type="button" class="catalog-picker-result'+(already?' already-added':'')+(selected?' chosen':'')+'" data-picker-item="'+escapeHtml(id)+'" '+(already?'disabled':'')+'>'+(image?'<img src="'+escapeHtml(image)+'" alt="" loading="lazy" onerror="this.style.display=\'none\'">':'<span class="catalog-picker-poster-placeholder"><i class="fa-solid fa-film"></i></span>')+'<span class="catalog-picker-result-copy"><b>'+escapeHtml(item.title)+'</b><small>'+(item.type==='tv'?'Dizi':'Film')+' · '+escapeHtml(item.year||'—')+'</small></span><span class="catalog-picker-result-state">'+(already?'<i class="fa-solid fa-check"></i> Eklendi':selected?'<i class="fa-solid fa-check"></i> Seçildi':'Seç')+'</span></button>';
    }).join('');
  }
  function resetCatalogPicker(rootId) {
    const state=catalogPickerState[rootId];if(!state)return;
    $('#'+state.selectId).value='';
    const root=$('#'+rootId);root.querySelector('input[type="search"]').value='';
    $('#'+state.selectedId).textContent='Henüz yapım seçilmedi.';
    renderCatalogPicker(rootId);
  }
  function renderCollections() {
    $('#collection-total').textContent=collections.length.toLocaleString('tr-TR');
    $('#collection-item-total').textContent=collections.reduce((sum,item)=>sum+item.items.length,0).toLocaleString('tr-TR');
    $('#collection-active-total').textContent=collections.filter(item=>item.active).length.toLocaleString('tr-TR');
    $('#collection-list').innerHTML=collections.map(item=>'<button type="button" class="collection-list-item'+(item.id===activeCollectionId?' selected':'')+'" data-collection-select="'+escapeHtml(item.id)+'"><span class="collection-list-icon"><i class="fa-solid fa-layer-group"></i></span><span class="collection-list-copy"><b>'+escapeHtml(item.title)+'</b><small>'+item.items.length+' yapım · '+(item.active?'Görünür':'Gizli')+'</small></span><i class="fa-solid fa-chevron-right"></i></button>').join('')||'<div class="collection-editor-empty">Henüz koleksiyon yok.</div>';
    renderCollectionEditor();
    renderCatalogPicker('collection-catalog-picker');
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
  async function initCollections() {
    setupCatalogPicker('collection-catalog-picker','collection-item-select','collection-catalog-results','collection-catalog-selected',()=>selectedCollection()?.items||[]);
    try {
      const saved=await githubCollectionsRequest('GET');
      if(!saved.content) throw new Error('Koleksiyon dosyası boş.');
      const parsed=JSON.parse(decodeGithubContent(saved.content));
      if(!Array.isArray(parsed)) throw new Error('Koleksiyon dosyasının biçimi geçersiz.');
      collections=parsed.filter(item=>item&&item.id&&item.title&&Array.isArray(item.items)).map(item=>({...item,items:item.items.map(String),active:item.active!==false}));
    } catch(error) {
      collections=[];
      if(getGithubToken()) toast('Koleksiyonlar yüklenemedi: '+error.message);
    }
    activeCollectionId=collections[0]?.id||'';
    renderCollections();
  }
  async function handleCollectionClick(event) {
    const button=event.target.closest('button');
    if(!button)return;
    if(button.hasAttribute('data-collection-select')){activeCollectionId=button.dataset.collectionSelect;renderCollections();return;}
    const item=selectedCollection();
    if(!item)return;
    if(!getGithubToken())return toast('Önce Veri Kaynakları bölümünden GitHub kayıt bağlantısını kur.');
    if(button.hasAttribute('data-collection-up')||button.hasAttribute('data-collection-down')){
      const index=Number(button.dataset.collectionUp??button.dataset.collectionDown);
      const target=index+(button.hasAttribute('data-collection-up')?-1:1);
      if(target<0||target>=item.items.length)return;
      [item.items[index],item.items[target]]=[item.items[target],item.items[index]];
    }else if(button.hasAttribute('data-collection-remove')){
      item.items.splice(Number(button.dataset.collectionRemove),1);
    }
    renderCollections();
    try { await persistCollections(); } catch(error) { toast('Değişiklik kaydedilemedi: '+error.message); }
  }
  async function addCollectionItem() {
    const item=selectedCollection();
    const id=$('#collection-item-select').value;
    if(!item)return toast('Önce bir koleksiyon seç.');
    if(!id)return toast('Önce katalogdan bir yapım seç.');
    if(!getGithubToken())return toast('Önce Veri Kaynakları bölümünden GitHub kayıt bağlantısını kur.');
    if(item.items.includes(id))return toast('Bu yapım koleksiyonda zaten var.');
    item.items.push(id);
    resetCatalogPicker('collection-catalog-picker');
    renderCollections();
    try { await persistCollections(); } catch(error) { toast('Yapım eklendi ancak kaydedilemedi: '+error.message); }
  }
  async function createCollection(event) {
    event.preventDefault();
    const input=$('#collection-new-title');
    const title=input.value.trim();
    if(!title)return;
    if(!getGithubToken())return toast('Önce Veri Kaynakları bölümünden GitHub kayıt bağlantısını kur.');
    if(collections.some(item=>item.title.toLocaleLowerCase('tr-TR')===title.toLocaleLowerCase('tr-TR')))return toast('Bu isimde bir koleksiyon zaten var.');
    const id='custom-'+Date.now().toString(36);
    collections.push({id,title,description:'',active:true,items:[]});
    activeCollectionId=id;
    input.value='';
    renderCollections();
    try { await persistCollections(); } catch(error) { toast('Raf oluşturuldu ancak kaydedilemedi: '+error.message); }
  }
  async function toggleCollectionVisibility() {
    const item=selectedCollection();
    if(!item)return;
    if(!getGithubToken())return toast('Önce Veri Kaynakları bölümünden GitHub kayıt bağlantısını kur.');
    item.active=!item.active;
    renderCollections();
    try { await persistCollections(); } catch(error) { toast('Yayın durumu kaydedilemedi: '+error.message); }
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
      let data = null;
      const loadErrors = [];
      // GitHub'a kaydedilen son katalog, Pages dağıtımını beklemeden yönetim paneline yüklenir.
      if (getGithubToken()) {
        try {
          const saved = await githubCatalogRequest('GET');
          if (!saved.content) throw new Error('GitHub katalog içeriği boş.');
          const latest = JSON.parse(decodeGithubContent(saved.content));
          if (!Array.isArray(latest)) throw new Error('GitHub katalog biçimi geçersiz.');
          data = latest;
        } catch (loadError) {
          loadErrors.push('GitHub kayıtlı katalog ('+loadError.message+')');
        }
      }
      const catalogUrls = [...new Set([
        new URL('../../data/catalog.json', adminScriptUrl).href,
        new URL('data/catalog.json', window.location.href).href,
        new URL('/data/catalog.json', window.location.origin).href
      ])];
      for (const url of catalogUrls) {
        if (data) break;
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
      renderCatalogHealth();
      renderWatchLinks();
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
  $('#health-filters').addEventListener('click',event=>{
    const button=event.target.closest('[data-health-filter]');if(!button)return;
    healthFilter=button.dataset.healthFilter;
    $('#health-filters').querySelectorAll('[data-health-filter]').forEach(item=>item.classList.toggle('active',item===button));
    renderCatalogHealth();
  });
  $('#health-refresh').addEventListener('click',()=>{renderCatalogHealth();toast('Katalog yeniden tarandı.');});
  $('#health-issue-list').addEventListener('click',event=>{
    const button=event.target.closest('[data-health-edit]');if(!button)return;
    const item=catalog.find(row=>String(row.id)===button.dataset.healthEdit);if(item)openEditor(item);
  });
  ['#watchlink-search','#watchlink-filter','#watchlink-type'].forEach(selector=>$(selector).addEventListener(selector==='#watchlink-search'?'input':'change',renderWatchLinks));
  $('#watchlink-list').addEventListener('click',event=>{
    const button=event.target.closest('[data-watch-edit]');if(!button)return;
    const item=catalog.find(row=>String(row.id)===button.dataset.watchEdit);if(item)openEditor(item);
  });
  $('.nav-item').forEach(button => button.addEventListener('click',() => navigate(button.dataset.page)));
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
    if (item) openEditor(item);
  });
  $('#catalog-table-body').addEventListener('click',event => {
    const button = event.target.closest('[data-inspect]');
    if (!button) return;
    const item = catalog.find(entry => String(entry.id) === button.dataset.inspect);
    if (item) openEditor(item);
  });
  $('#hero-add-button').addEventListener('click',addHeroSlide);
  $('#hero-save-button').addEventListener('click',saveHeroConfig);
  $('#hero-headline-input').addEventListener('input',event=>{const slide=heroSlides[heroActiveIndex];if(!slide)return;slide.headline=event.target.value;$('#hero-live-title').textContent=slide.headline||heroCurrentItem()?.title||'Başlıksız yapım';});
  $('#hero-description-input').addEventListener('input',event=>{const slide=heroSlides[heroActiveIndex];if(!slide)return;slide.description=event.target.value;const item=heroCurrentItem();$('#hero-live-desc').textContent=slide.description||item?.tmdbOverview||item?.desc||'Bu yapım için tanıtım metni bulunmuyor.';});
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
  ['#hero-desktop-count','#hero-mobile-count','#hero-interval','#hero-autoplay','#hero-pause-hover'].forEach(selector=>$(selector).addEventListener('change',readHeroSettingsForm));
  $$('[data-hero-preview]').forEach(button=>button.addEventListener('click',()=>{
    heroPreviewMode=button.dataset.heroPreview;
    $$('[data-hero-preview]').forEach(item=>{const active=item===button;item.classList.toggle('active',active);item.setAttribute('aria-pressed',String(active));});
    renderHeroPreview();
  }));
  $('#editor-save-token').addEventListener('click',saveTmdbToken);
  $('#tmdb-sync-catalog').addEventListener('click',syncCatalogWithTmdb);
  $('#editor-save-github-token').addEventListener('click',saveGithubToken);
  if(getGithubToken())setGithubTokenStatus('GitHub kayıt anahtarı bu tarayıcıda kayıtlı.',true);
  $('#editor-tmdb-search').addEventListener('click',searchTmdb);
  $('#editor-tmdb-query').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();searchTmdb();}});
  $('#editor-tmdb-results').addEventListener('click',event=>{
    const button=event.target.closest('[data-tmdb-result]');
    if(button)selectTmdbResult(Number(button.dataset.tmdbResult));
  });
  if(getTmdbToken())setTmdbTokenStatus('TMDB anahtarı bu tarayıcıda kayıtlı.',true);
  $('#add-content-button').addEventListener('click',() => openEditor());
  $('#content-editor-form').addEventListener('submit',saveEditorDraft);
  $('#editor-subtitle-add').addEventListener('click',addEditorSubtitle);
  $('#editor-subtitle-list').addEventListener('click',event=>{const button=event.target.closest('[data-remove-subtitle]');if(!button)return;editorSubtitles.splice(Number(button.dataset.removeSubtitle),1);renderEditorSubtitles();$('#editor-subtitle-status').textContent='Altyazı katalog kaydından çıkarıldı. Depodaki dosya güvenlik için silinmedi.';});
  $('#editor-platform-picker').addEventListener('change',updatePlatformPickerLabel);
  $('#editor-reset').addEventListener('click',resetEditor);
  $$('[data-editor-type]').forEach(button=>button.addEventListener('click',()=>setEditorType(button.dataset.editorType)));
  Object.values(editorFields).concat(['editor-cast']).forEach(id=>{const node=document.getElementById(id);if(node)node.addEventListener('input',renderEditorPreview);});
  $('#editor-draft-list').addEventListener('click',event=>{
    const button=event.target.closest('[data-editor-draft]');
    if(!button)return;
    const draft=editorDrafts[Number(button.dataset.editorDraft)];
    if(draft)openEditor(draft);
  });
  $$('[data-demo]').forEach(button => button.addEventListener('click',() => toast(button.dataset.demo+' alanı veritabanı aşamasında etkinleştirilecek.')));
  $('#export-catalog').addEventListener('click',() => {
    if (!catalog.length) return toast('Dışa aktarılacak katalog verisi bulunamadı.');
    const data = {app:'Perde',backupType:'archive-data',version:2,catalog,collections,homepageConfig:{version:2,settings:heroSettings,heroSlides},exportedAt:new Date().toISOString()};
    downloadJson('perde-arsiv-yedegi-'+new Date().toISOString().slice(0,10)+'.json',data);
    toast('Katalog, koleksiyonlar ve ana sayfa ayarları yedeklendi.');
  });
  $('#export-personal').addEventListener('click',() => {
    const keys=['perde_watch_diary_v1','ny7_favorites','ny7_watchlist','perde_series_diary_v1','perde_player_progress_v3','perde_player_stats_v3','perde_player_markers_v2','perde_series_video_sources_v1','ny7_player_sources_v1'];
    const deviceData={};
    keys.forEach(key=>{try{const raw=localStorage.getItem(key);if(raw!==null)deviceData[key]=JSON.parse(raw);}catch(error){console.warn('Yedeklenemeyen yerel kayıt:',key,error);}});
    const data = {
      app:'Perde',backupType:'personal-data',version:2,
      diary:localArray('perde_watch_diary_v1'),
      favorites:localArray('ny7_favorites'),
      watchlist:localArray('ny7_watchlist'),
      deviceData,
      exportedAt:new Date().toISOString()
    };
    downloadJson('perde-kisisel-yedek-'+new Date().toISOString().slice(0,10)+'.json',data);
    toast('Kişisel veriler ve cihazdaki izleme ilerlemeleri yedeklendi.');
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
      if(!catalog.length)throw new Error('Katalog henüz yüklenmedi. Sayfayı yenileyip tekrar dene.');
      const allowedStatuses=['watching','watched','favorite','watchlist'];
      const restoredDiary=parsed.diary.filter(entry=>entry&&typeof entry==='object'&&catalog.some(item=>String(item.id)===String(entry.id))&&allowedStatuses.includes(entry.status)).map(entry=>({
        ...entry,id:String(entry.id),
        ...(Number.isFinite(Number(entry.personalRating))?{personalRating:Math.min(10,Math.max(1,Number(entry.personalRating)))}:{})
      }));
      const allowedKeys=['perde_series_diary_v1','perde_player_progress_v3','perde_player_stats_v3','perde_player_markers_v2','perde_series_video_sources_v1','ny7_player_sources_v1'];
      const deviceData=parsed.deviceData&&typeof parsed.deviceData==='object'&&!Array.isArray(parsed.deviceData)?parsed.deviceData:{};
      const restoredValues={
        'perde_watch_diary_v1':restoredDiary,
        'ny7_favorites':parsed.favorites,
        'ny7_watchlist':parsed.watchlist
      };
      allowedKeys.forEach(key=>{
        if(!Object.prototype.hasOwnProperty.call(deviceData,key))return;
        const value=deviceData[key];
        if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Yedekte '+key+' verisinin biçimi geçersiz.');
        restoredValues[key]=value;
      });
      if(!window.confirm('İzleme günlüğü, favoriler, listeler ve yedekte bulunan cihaz ilerlemeleri mevcut kayıtların yerine yüklensin mi? Önceki kayıtların yerine geçecek.')) {
        hint.textContent='Geri yükleme iptal edildi.';
        return;
      }
      const storageKeys=Object.keys(restoredValues);
      const previousValues=storageKeys.map(key=>localStorage.getItem(key));
      try {
        storageKeys.forEach(key=>localStorage.setItem(key,JSON.stringify(restoredValues[key])));
      } catch(storageError) {
        storageKeys.forEach((key,index)=>{try{previousValues[index]===null?localStorage.removeItem(key):localStorage.setItem(key,previousValues[index]);}catch(_){}});
        throw new Error('Tarayıcı depolamasına yazılamadı; önceki kayıtlar geri alınmaya çalışıldı.');
      }
      diaryEntries=restoredDiary;
      renderDiary();
      renderOverview();
      if(typeof renderPersonalAnalytics==='function')renderPersonalAnalytics();
      hint.textContent=restoredDiary.length+' günlük kaydı ve yedekte bulunan diğer kişisel veriler geri yüklendi.';
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