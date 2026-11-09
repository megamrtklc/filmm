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
  const pageNames = {overview:'Genel Bakış',catalog:'Film ve Diziler',editor:'Yapım Ekle / Düzenle',collections:'Koleksiyon Rafları',homeRails:'Anasayfa Rafları',hero:'Manşet ve Slider',health:'İçerik Kontrolü',watchlinks:'İzleme Bağlantıları',watch:'İzleme Günlüğü',analytics:'İstatistikler',sources:'Veri Kaynakları',backups:'Yedekleme',history:'Değişiklik Geçmişi',settings:'Genel Ayarlar'};
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
    $$$('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.page === page));
    $('#breadcrumb-current').textContent = pageNames[page];
    $('#admin-sidebar').classList.remove('open');
    if (typeof syncSidebarToggle === 'function') syncSidebarToggle();
    window.scrollTo({top:0,behavior:'smooth'});
    history.replaceState(null, '', '#'+page);
    if(page==='backups') loadAutomaticBackupStatus();
  }
  const editorFields = {
    title:'editor-title',originalTitle:'editor-original-title',year:'editor-year',category:'editor-category',
    genre:'editor-genre',rating:'editor-rating',duration:'editor-duration',country:'editor-country',
    director:'editor-director',tmdbId:'editor-tmdb',seasons:'editor-seasons',episodes:'editor-episodes',
    desc:'editor-desc',image:'editor-image',backdrop:'editor-backdrop',trailerUrl:'editor-trailer',imdbId:'editor-imdb',
    watchUrl:'editor-watch-url',awards:'editor-awards',platform:'editor-platform',personalNote:'editor-personal-note'
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
      else if (['watchUrl','personalNote','awards'].includes(key)) value[key] = raw;
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
  const subtitleWorkerUrl='https://perde-subtitles.oyunmrtklc.workers.dev';
  function subtitleSearchStatus(message){const node=$('#editor-subtitle-search-status');if(node)node.textContent=message;}
  function subtitleResultRows(items){
    const host=$('#editor-subtitle-search-results');if(!host)return;
    if(!items.length){host.innerHTML='<div class="subtitle-online-empty">Bu arama için altyazı bulunamadı.</div>';return;}
    host._subtitleItems=items.slice(0,20);
    host.innerHTML=host._subtitleItems.map((item,index)=>{const a=item.attributes||{},f=item.file||{},lang=a.language||'other',label=subtitleLanguages[lang]||lang.toUpperCase(),release=a.release||a.feature_details?.movie_name||a.movie_name||'Sürüm bilgisi yok',se=a.season_number&&a.episode_number?' · S'+a.season_number+' B'+a.episode_number:'';return '<article class="subtitle-online-result"><div class="subtitle-online-result-copy"><b>'+escapeHtml(label)+' · '+escapeHtml(release)+'</b><small>'+escapeHtml(f.file_name||'Altyazı dosyası')+se+' · '+(Number(a.download_count)||0).toLocaleString('tr-TR')+' indirme</small></div><button type="button" class="outline-button" data-online-subtitle="'+index+'"><i class="fa-solid fa-download"></i> İndir ve ekle</button></article>';}).join('');
  }
  async function searchOnlineSubtitles(){
    const title=editorValue('editor-title'),imdb=editorValue('editor-imdb').replace(/^tt/i,''),tmdb=editorValue('editor-tmdb');
    if(!title&&!imdb&&!tmdb){subtitleSearchStatus('Önce yapım adını veya IMDb/TMDB kimliğini gir.');return;}
    const season=Number($('#editor-subtitle-season').value)||0,episode=Number($('#editor-subtitle-episode').value)||0;
    if(editorType==='tv'&&(!season||!episode)){subtitleSearchStatus('Dizi altyazısı aramak için sezon ve bölüm numarasını birlikte gir.');$('#editor-subtitle-season').focus();return;}
    const button=$('#editor-subtitle-search'),host=$('#editor-subtitle-search-results');button.disabled=true;button.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Aranıyor…';host.innerHTML='';subtitleSearchStatus('OpenSubtitles kataloğu aranıyor…');
    try{
      const params=new URLSearchParams({languages:'tr,en',type:editorType==='tv'?'episode':'movie',order_by:'download_count'});
      if(title)params.set('query',title);if(editorType==='tv'){if(imdb)params.set('parent_imdb_id',imdb);if(tmdb)params.set('parent_tmdb_id',tmdb);}else{if(imdb)params.set('imdb_id',imdb);if(tmdb)params.set('tmdb_id',tmdb);}if(editorValue('editor-year'))params.set('year',editorValue('editor-year'));
      if(editorType==='tv'){params.set('season_number',String(season));params.set('episode_number',String(episode));}
      const response=await fetch(subtitleWorkerUrl+'/subtitles?'+params.toString(),{headers:{Accept:'application/json'},signal:AbortSignal.timeout(20000)}),body=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(body.error||('Altyazı servisi HTTP '+response.status));
      let items=[];(Array.isArray(body.data)?body.data:[]).forEach(entry=>(entry.attributes?.files||[]).forEach(file=>items.push({id:entry.id,attributes:entry.attributes||{},file})));
      if(editorType==='tv')items=items.filter(item=>{const s=Number(item.attributes.season_number)||0,e=Number(item.attributes.episode_number)||0;return(!s&&!e)||(s===season&&e===episode);});
      items.sort((a,b)=>(a.attributes.language==='tr'?0:1)-(b.attributes.language==='tr'?0:1)||(Number(b.attributes.download_count)||0)-(Number(a.attributes.download_count)||0));
      subtitleResultRows(items);subtitleSearchStatus(items.length+' altyazı dosyası bulundu. Türkçe sonuçlar önceliklendirildi.');
    }catch(error){subtitleSearchStatus('Arama başarısız: '+error.message);host.innerHTML='<div class="subtitle-online-empty">Servis yanıt vermedi. Biraz sonra tekrar deneyebilirsin.</div>';}
    finally{button.disabled=false;button.innerHTML='<i class="fa-solid fa-cloud-arrow-down"></i> Altyazı ara';}
  }
  async function downloadOnlineSubtitle(index){
    const host=$('#editor-subtitle-search-results'),item=(host?host._subtitleItems||[]:[])[Number(index)];if(!item)return;
    if(!getGithubToken())return toast('Altyazıyı eklemek için GitHub bağlantısı gerekli.');
    const button=host.querySelector('[data-online-subtitle="'+index+'"]');if(button){button.disabled=true;button.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Ekleniyor…';}
    try{
      const response=await fetch(subtitleWorkerUrl+'/download',{method:'POST',headers:{'Content-Type':'application/json',Accept:'text/plain'},body:JSON.stringify({file_id:item.file.file_id}),signal:AbortSignal.timeout(30000)});
      if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.error||('İndirme HTTP '+response.status));}
      const raw=await response.text();if(!raw.trim())throw new Error('İndirilen altyazı boş.');
      const vtt=/^WEBVTT/m.test(raw.trim())?raw:convertSrtToVtt(raw),a=item.attributes||{},language=a.language||'other';
      const season=Number(a.season_number)||Number($('#editor-subtitle-season').value)||null,episode=Number(a.episode_number)||Number($('#editor-subtitle-episode').value)||null;
      if(editorType==='tv'&&(!season||!episode))throw new Error('Dizi altyazısını doğru bölüme bağlamak için sezon ve bölüm numarasını gir.');
      const key=editorEditingId||('tmdb-'+(editorValue('editor-tmdb')||Date.now())),safe=String(item.file.file_name||'opensubtitles').replace(/.[^.]+$/,'').normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,50)||'subtitle';
      const path='assets/subtitles/'+key+'/'+language+(season&&episode?'-s'+season+'e'+episode:'')+'-'+safe+'-'+Date.now()+'.vtt',url=await githubUploadSubtitle(path,vtt),isDefault=$('#editor-subtitle-default').checked;
      if(isDefault)editorSubtitles=editorSubtitles.map(entry=>({...entry,default:(Number(entry.season)||0)!==(season||0)||(Number(entry.episode)||0)!==(episode||0)?entry.default:false}));
      editorSubtitles.push({language,languageLabel:subtitleLanguages[language]||language,fileName:item.file.file_name||'OpenSubtitles altyazısı',url,default:isDefault,season,episode});
      renderEditorSubtitles();$('#editor-subtitle-status').textContent='Çevrim içi altyazı GitHub’a yüklendi. Kalıcı olması için yapım kaydını kaydet.';
      subtitleSearchStatus('Altyazı indirildi ve depoya eklendi. Yapım kaydını kaydetmeyi unutma.');toast('Altyazı indirildi; yapımı kaydet.');
      if(button){button.disabled=true;button.innerHTML='<i class="fa-solid fa-check"></i> Eklendi';}
    }catch(error){subtitleSearchStatus('İşlem başarısız: '+error.message);toast(error.message);if(button){button.disabled=false;button.innerHTML='<i class="fa-solid fa-download"></i> Tekrar dene';}}
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
      renderOverview(); initCatalogFilters(); renderCatalog(); renderCatalogHealth(); renderWatchLinks(); initHomepageRailsManager(); initHeroManager(); initCollections(); initDiary();
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
    $('#health-issue-list').innerHTML=rows.length?rows.map(({item,labels})=>'<article class="health-issue-row"><div class="health-issue-poster">'+(poster(item)?'<img src="'+poster(item)+'" alt="" loading="lazy" onerror="this.remove()">':'<i class="fa-solid fa-clapperboard"></i>')+'</div><div class="health-issue-copy"><b>'+escapeHtml(item.title)+'</b><small>'+(item.type==='tv'?'Dizi':'Film')+' · '+escapeHtml(item.year||'Yıl yok')+' · '+escapeHtml(item.id)+'</small><div class="health-tags">'+labels.map(label=>'<span>'+escapeHtml(label)+'</span>').join('')+'</div></div><div class="health-issue-actions"><button type="button" class="row-action" data-health-edit="'+escapeHtml(item.id)+'">Düzenle</button><button type="button" class="row-action row-action-danger" data-health-delete="'+escapeHtml(item.id)+'"><i class="fa-regular fa-trash-can"></i> Sil</button></div></article>').join(''):'<div class="health-empty"><i class="fa-solid fa-circle-check"></i><b>Bu filtrede sorun görünmüyor</b><span>Seçili kontrol başlığı için katalog kayıtları tamam.</span></div>';
  }
  async function deleteHealthCatalogItem(id,button){
    const item=catalog.find(row=>String(row.id)===String(id));
    if(!item)return toast('Silinecek yapım katalogda bulunamadı.');
    const title=String(item.title||'İsimsiz yapım');
    if(!window.confirm('"'+title+'" yapımını Perde kataloğundan kalıcı olarak silmek istiyor musun? Bu işlem geri alınamaz.'))return;
    if(!getGithubToken()){setGithubTokenStatus('Silme işlemi için GitHub bağlantısı gerekli.');return toast('Önce Veri Kaynakları bölümünden GitHub bağlantısını kur.');}
    const original=button.innerHTML;button.disabled=true;button.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Siliniyor…';
    try{
      const current=await githubCatalogRequest('GET');
      if(!current.sha||!current.content)throw new Error('GitHub katalog dosyası okunamadı.');
      const latest=JSON.parse(decodeGithubContent(current.content));
      if(!Array.isArray(latest))throw new Error('Katalog dosyasının biçimi geçersiz.');
      const index=latest.findIndex(row=>String(row.id)===String(id));
      if(index<0)throw new Error('Yapım GitHub kataloğunda bulunamadı; başka bir işlemle silinmiş olabilir.');
      const deleted=latest[index];
      latest.splice(index,1);
      await githubCatalogRequest('PUT',{
        message:'Delete Perde catalog item: '+String(deleted.title||id),
        content:encodeGithubContent(JSON.stringify(latest,null,2)+'\n'),
        sha:current.sha,branch:'main'
      });
      catalog=latest;
      renderOverview();initCatalogFilters();renderCatalog();renderCatalogHealth();renderWatchLinks();initHeroManager();initCollections();
      toast('"'+title+'" katalogdan silindi.');
    }catch(error){
      button.disabled=false;button.innerHTML=original;
      toast('Yapım silinemedi: '+error.message);
    }
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

  const selectedCatalogIds = new Set();
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
      return '<tr><td><div class="catalog-name"><input class="catalog-row-check" type="checkbox" data-catalog-select="'+escapeHtml(item.id)+'" aria-label="'+escapeHtml(item.title)+' seç" '+(selectedCatalogIds.has(String(item.id))?'checked':'')+'>'+(poster(item)?'<img src="'+poster(item)+'" alt="" loading="lazy" onerror="this.remove()">':'<span class="recent-poster"></span>')+'<span><b>'+escapeHtml(item.title)+'</b><small>'+escapeHtml(item.director||'Yönetmen bilgisi yok')+'</small></span></div></td><td><span class="type-pill">'+(item.type==='tv'?'Dizi':'Film')+'</span></td><td>'+escapeHtml(item.year||'—')+'</td><td>'+(item.rating?'★ '+escapeHtml(item.rating):'—')+'</td><td>'+escapeHtml(item.tmdbId||'—')+'</td><td>'+(missing.length?'<span class="catalog-quality-warning">'+escapeHtml(missing.join(' · '))+'</span>':'<span class="catalog-quality-good"><i class="fa-solid fa-check"></i> Tam</span>')+'</td><td><button class="row-action" type="button" data-inspect="'+escapeHtml(item.id)+'">İncele</button></td></tr>';
    }).join('');
    grid.hidden = catalogView !== 'grid';
    $('#catalog-table-view').hidden = catalogView !== 'table';
    renderCatalogPagination(rows.length);
    const pageIds=pageRows.map(item=>String(item.id));
    const selectedOnPage=pageIds.filter(id=>selectedCatalogIds.has(id)).length;
    const selectPage=$('#catalog-select-page');
    if(selectPage){selectPage.checked=pageIds.length>0&&selectedOnPage===pageIds.length;selectPage.indeterminate=selectedOnPage>0&&selectedOnPage<pageIds.length;}
    renderBulkToolbar();
  }
  function renderBulkToolbar(){
    const toolbar=$('#catalog-bulk-toolbar');
    const count=selectedCatalogIds.size;
    toolbar.hidden=count===0;
    $('#catalog-bulk-count').textContent=count.toLocaleString('tr-TR')+' yapım seçildi';
    const select=$('#bulk-collection-select');
    const previous=select.value;
    select.innerHTML='<option value="">Koleksiyon seç…</option>'+collections.map(item=>'<option value="'+escapeHtml(item.id)+'">'+escapeHtml(item.title)+'</option>').join('');
    if(collections.some(item=>String(item.id)===previous))select.value=previous;
    $('#bulk-add-to-collection').disabled=!count||!select.value||!collections.length;
  }
  async function addBulkSelectionToCollection(){
    if(!selectedCatalogIds.size)return toast('Önce katalog listesinden yapım seç.');
    if(!getGithubToken())return toast('Toplu işlem için GitHub bağlantısını kurmalısın.');
    const target=collections.find(item=>String(item.id)===$('#bulk-collection-select').value);
    if(!target)return toast('Önce hedef koleksiyonu seç.');
    const validIds=[...selectedCatalogIds].filter(id=>catalog.some(item=>String(item.id)===id));
    const before=target.items.length;
    target.items=[...target.items,...validIds.filter(id=>!target.items.includes(id))];
    if(target.items.length===before){toast('Seçtiğin yapımlar zaten bu rafta.');return;}
    const button=$('#bulk-add-to-collection');button.disabled=true;button.textContent='Kaydediliyor…';
    try{await persistCollections();selectedCatalogIds.clear();renderCollections();renderCatalog();toast('Seçilen yapımlar koleksiyona eklendi.');}
    catch(error){toast('Toplu işlem kaydedilemedi: '+error.message);}
    finally{button.innerHTML='<i class="fa-solid fa-layer-group"></i> Rafa ekle';renderBulkToolbar();}
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
    homepageRails=normalizeHomepageRails(config?.homeRails);
    renderHomepageRails();
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

  const homepageRailKeys=['featured','movies','series'];
  const homepageRailLabels={featured:'Öne Çıkan Yapımlar',movies:'Yüksek Puanlı Filmler',series:'Öne Çıkan Diziler'};
  let homepageRails={};
  let homepageRailPickersReady=false;
  const homepageRailReplaceIndex={featured:null,movies:null,series:null};
  function homepageRailDefaults(records=catalog){
    const score=item=>Number.parseFloat(item.rating)||0;
    const valid=records.filter(item=>item&&item.id!=null&&item.title&&item.image);
    return {
      order:[...homepageRailKeys],
      featured:{title:'Öne Çıkan Yapımlar',active:true,displayCount:5,itemIds:[...valid].sort((a,b)=>score(b)-score(a)).slice(0,5).map(item=>String(item.id))},
      movies:{title:'Yüksek Puanlı Filmler',active:true,displayCount:12,itemIds:valid.filter(item=>item.type==='movie').sort((a,b)=>score(b)-score(a)).slice(0,12).map(item=>String(item.id))},
      series:{title:'Öne Çıkan Diziler',active:true,displayCount:12,itemIds:valid.filter(item=>item.type==='tv').sort((a,b)=>score(b)-score(a)).slice(0,12).map(item=>String(item.id))}
    };
  }
  function normalizeHomepageRails(saved,records=catalog){
    const defaults=homepageRailDefaults(records),validIds=new Set(records.map(item=>String(item.id))),normalized={};
    const savedOrder=Array.isArray(saved?.order)?saved.order.filter(key=>homepageRailKeys.includes(key)):[];
    normalized.order=[...new Set([...savedOrder,...homepageRailKeys])];
    homepageRailKeys.forEach(key=>{
      const source=saved&&saved[key]&&typeof saved[key]==='object'?saved[key]:null;
      let ids=source&&Array.isArray(source.itemIds)?source.itemIds.map(String).filter(id=>validIds.has(id)):defaults[key].itemIds;
      if(key==='movies')ids=ids.filter(id=>records.find(item=>String(item.id)===id)?.type==='movie');
      if(key==='series')ids=ids.filter(id=>records.find(item=>String(item.id)===id)?.type==='tv');
      const maxItems=key==='featured'?10:15,minDisplay=key==='featured'?5:6;
      const unique=[...new Set(ids)].slice(0,maxItems);
      const requested=Number(source?.displayCount)||(key==='featured'?5:Math.min(12,Math.max(6,unique.length)));
      normalized[key]={title:String(source?.title||defaults[key].title).slice(0,64),active:source?source.active!==false:true,displayCount:Math.min(maxItems,Math.max(minDisplay,requested)),itemIds:unique};
    });
    return normalized;
  }
  function renderHomepageRailOrder(){
    const host=$('#home-rail-order-list');if(!host)return;
    host.innerHTML=homepageRails.order.map((key,index)=>'<div class="home-rail-order-item" draggable="true" data-home-rail-order-item="'+key+'"><span class="home-rail-order-grip" aria-hidden="true"><i class="fa-solid fa-grip-vertical"></i></span><span class="home-rail-order-number">'+String(index+1).padStart(2,'0')+'</span><b>'+escapeHtml(homepageRails[key]?.title||homepageRailLabels[key])+'</b><span class="home-rail-order-actions"><button type="button" data-home-rail-order-up="'+key+'" '+(index===0?'disabled':'')+' aria-label="'+escapeHtml(homepageRailLabels[key])+' rafını yukarı taşı"><i class="fa-solid fa-chevron-up"></i></button><button type="button" data-home-rail-order-down="'+key+'" '+(index===homepageRails.order.length-1?'disabled':'')+' aria-label="'+escapeHtml(homepageRailLabels[key])+' rafını aşağı taşı"><i class="fa-solid fa-chevron-down"></i></button></span></div>').join('');
  }
  function renderHomepageRails(){
    if(!homepageRails||!homepageRails.featured)return;
    renderHomepageRailOrder();
    homepageRailKeys.forEach(key=>{
      const rail=homepageRails[key],list=$('#home-rail-'+key+'-list');if(!list)return;
      $('#home-rail-'+key+'-title').value=rail.title;
      const visibility=$('#home-rail-'+key+'-visibility');if(visibility){visibility.textContent=rail.active?'Gizle':'Yayınla';visibility.classList.toggle('is-published',rail.active);visibility.setAttribute('aria-pressed',String(rail.active));}
      const status=$('#home-rail-'+key+'-visibility-status');if(status)status.textContent=rail.active?'Anasayfada yayında':'Anasayfada gizli';
      $('#home-rail-'+key+'-display-count').value=String(rail.displayCount);
      const maxItems=key==='featured'?10:15;
      $('#home-rail-'+key+'-count').textContent=rail.itemIds.length+' / '+maxItems+' kart';
      const warning=$('#home-rail-'+key+'-warning');
      if(key==='featured'&&rail.itemIds.length<5&&rail.active)warning.textContent='Öne Çıkan Yapımlar rafında en az 5 yapım seçmelisin. Şu anda '+rail.itemIds.length+' yapım seçili.';
      else if(key!=='featured'&&rail.itemIds.length<6&&rail.active)warning.textContent='Yayınlamak için en az 6 yapım eklemelisin. Şu anda '+rail.itemIds.length+' yapım seçili.';
      else if(rail.itemIds.length>rail.displayCount)warning.textContent='Gösterilecek kart sayısı '+rail.displayCount+' olarak ayarlı. Fazla yapımları kaldırmalısın; yeni yapım ekleyemezsin.';
      else if(rail.active&&rail.itemIds.length<rail.displayCount)warning.textContent='Gösterilecek kart sayısı '+rail.displayCount+'. Bu sayıya ulaşmak için '+(rail.displayCount-rail.itemIds.length)+' yapım daha ekle.';
      else warning.textContent='';
      warning.classList.toggle('is-warning',!!warning.textContent);
      const add=$('#home-rail-'+key+'-add');if(add)add.disabled=rail.itemIds.length>=rail.displayCount;
      if(!rail.itemIds.length){list.innerHTML='<div class="home-rail-empty">Henüz yapım eklenmedi.</div>';return;}
      list.innerHTML=rail.itemIds.map((id,index)=>{
        const item=catalog.find(entry=>String(entry.id)===id);if(!item)return '';
        const image=poster(item);
        return '<article class="home-rail-item"><img class="home-rail-item-bg" src="'+escapeHtml(image||'')+'" alt="" loading="lazy"><span class="home-rail-item-number">'+String(index+1).padStart(2,'0')+'</span><img class="home-rail-item-poster" src="'+escapeHtml(image||'')+'" alt="'+escapeHtml(item.title)+' afişi" loading="lazy"><span class="home-rail-item-copy"><b>'+escapeHtml(item.title)+'</b><span class="home-rail-item-meta"><em>'+(item.type==='tv'?'DİZİ':'FİLM')+'</em><span>'+escapeHtml(item.year||'Yıl bilgisi yok')+'</span><span class="home-rail-item-rating">★ '+escapeHtml(item.rating||'—')+'</span></span><span class="home-rail-item-overview">'+escapeHtml(item.overview||item.plot||item.description||item.desc||item.synopsis||item.summary||'Konu bilgisi bulunmuyor.')+'</span></span><span class="home-rail-item-order"><button type="button" data-home-rail-up="'+key+':'+index+'" '+(index===0?'disabled':'')+' aria-label="Yukarı taşı"><i class="fa-solid fa-chevron-up"></i></button><button type="button" data-home-rail-down="'+key+':'+index+'" '+(index===rail.itemIds.length-1?'disabled':'')+' aria-label="Aşağı taşı"><i class="fa-solid fa-chevron-down"></i></button></span><span class="home-rail-item-actions"><button type="button" class="home-rail-remove" data-home-rail-remove="'+key+':'+index+'"><i class="fa-solid fa-trash"></i> Kaldır</button></span></article>';
      }).join('');
    });
  }
  function renderHomepageRailSearch(key){
    const input=$('#home-rail-'+key+'-search'),select=$('#home-rail-'+key+'-catalog-select'),host=$('#home-rail-'+key+'-results');
    if(!input||!select||!host)return;
    const query=input.value.trim().toLocaleLowerCase('tr-TR');
    const allowed=catalog.filter(item=>key==='movies'?item.type==='movie':key==='series'?item.type==='tv':true);
    const matches=allowed.filter(item=>!query||String(item.title||'').toLocaleLowerCase('tr-TR').includes(query)||String(item.originalTitle||'').toLocaleLowerCase('tr-TR').includes(query));
    const selectedIds=homepageRails[key].itemIds;
    select.innerHTML='<option value="">Katalogdan yapım seç…</option>'+matches.map(item=>'<option value="'+escapeHtml(String(item.id))+'">'+escapeHtml(item.title)+' — '+(item.type==='tv'?'Dizi':'Film')+'</option>').join('');
    const wrap=select.parentElement;
    let picker=wrap.querySelector('.home-rail-visual-picker');
    if(!picker){picker=document.createElement('div');picker.className='home-rail-visual-picker';picker.innerHTML='<button type="button" class="home-rail-picker-trigger"><span>＋</span> Yapım seç <i class="fa-solid fa-chevron-down"></i></button><div class="home-rail-picker-menu" hidden></div>';select.insertAdjacentElement('afterend',picker);}
    select.hidden=true;
    const trigger=picker.querySelector('.home-rail-picker-trigger'),menu=picker.querySelector('.home-rail-picker-menu');
    trigger.disabled=!matches.length;
    trigger.innerHTML='<span>＋</span> Yapım seç <i class="fa-solid fa-chevron-down"></i>';
    menu.innerHTML=matches.slice(0,60).map(item=>{const id=String(item.id),image=poster(item),chosen=selectedIds.includes(id);return '<button type="button" class="home-rail-picker-option'+(chosen?' is-selected':'')+'" data-home-rail-pick="'+key+':'+escapeHtml(id)+'">'+(image?'<img src="'+image+'" alt="" loading="lazy">':'<span class="home-rail-picker-placeholder"><i class="fa-solid fa-film"></i></span>')+'<span><b>'+escapeHtml(item.title)+'</b><small>'+(item.type==='tv'?'DİZİ':'FİLM')+' · IMDb '+escapeHtml(item.rating||'—')+'</small></span>'+(chosen?'<em>Seçili</em>':'')+'</button>';}).join('')||'<div class="home-rail-picker-empty">Eşleşen yapım bulunamadı.</div>';
    const replaceIndex=homepageRailReplaceIndex[key];
    host.innerHTML=replaceIndex!==null?'<div class="home-rail-replace-note"><span>Seçili kartı değiştirmek için arama sonuçlarından yeni yapımı seç.</span><button type="button" data-home-rail-cancel-replace="'+key+'">Vazgeç</button></div>':'';
    if(query){host.innerHTML+=matches.slice(0,30).map(item=>{const id=String(item.id),image=poster(item),chosen=selectedIds.includes(id);return '<article class="home-rail-search-result">'+(image?'<img src="'+image+'" alt="" loading="lazy">':'<span class="home-rail-picker-placeholder"><i class="fa-solid fa-film"></i></span>')+'<span class="home-rail-search-result-title"><b>'+escapeHtml(item.title)+'</b><small>IMDb '+escapeHtml(item.rating||'—')+'</small></span><em class="home-rail-search-result-type">'+(item.type==='tv'?'DİZİ':'FİLM')+'</em><button type="button" data-home-rail-pick="'+key+':'+escapeHtml(id)+'" '+(chosen?'disabled':'')+'>'+(chosen?'Seçili':'Ekle')+'</button></article>';}).join('')+(matches.length>30?'<small class="home-rail-search-more">İlk 30 sonuç gösteriliyor.</small>':'');}
    host.hidden=!query&&replaceIndex===null;
    select.disabled=!matches.length;
    select.setAttribute('aria-label',key==='movies'?'Film seç':key==='series'?'Dizi seç':'Film veya dizi seç');
    trigger.onclick=()=>{menu.hidden=!menu.hidden;trigger.classList.toggle('is-open',!menu.hidden);};
    menu.querySelectorAll('[data-home-rail-pick]').forEach(button=>button.addEventListener('click',()=>{if(button.disabled)return;const id=button.dataset.homeRailPick.split(':').slice(1).join(':');select.value=id;select.dispatchEvent(new Event('change',{bubbles:true}));menu.hidden=true;trigger.classList.remove('is-open');}));

  }
  function initHomepageRailsManager(){
    homepageRails=normalizeHomepageRails(homepageRails);
    if(!homepageRailPickersReady){
      $('#home-rail-order-list').addEventListener('click',event=>{
        const button=event.target.closest('[data-home-rail-order-up],[data-home-rail-order-down]');if(!button)return;
        const key=button.dataset.homeRailOrderUp||button.dataset.homeRailOrderDown;const index=homepageRails.order.indexOf(key);if(index<0)return;
        const target=index+(button.hasAttribute('data-home-rail-order-up')?-1:1);if(target<0||target>=homepageRails.order.length)return;
        [homepageRails.order[index],homepageRails.order[target]]=[homepageRails.order[target],homepageRails.order[index]];renderHomepageRailOrder();
      });
      let draggedRailKey='';
      $('#home-rail-order-list').addEventListener('dragstart',event=>{
        const item=event.target.closest('[data-home-rail-order-item]');if(!item)return;
        draggedRailKey=item.dataset.homeRailOrderItem;item.classList.add('is-dragging');
        if(event.dataTransfer){event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',draggedRailKey);}
      });
      $('#home-rail-order-list').addEventListener('dragover',event=>{
        const target=event.target.closest('[data-home-rail-order-item]');if(!target||!draggedRailKey)return;
        event.preventDefault();target.classList.add('is-drop-target');
      });
      $('#home-rail-order-list').addEventListener('dragleave',event=>event.target.closest('[data-home-rail-order-item]')?.classList.remove('is-drop-target'));
      $('#home-rail-order-list').addEventListener('drop',event=>{
        const target=event.target.closest('[data-home-rail-order-item]');if(!target||!draggedRailKey)return;
        event.preventDefault();const from=homepageRails.order.indexOf(draggedRailKey),to=homepageRails.order.indexOf(target.dataset.homeRailOrderItem);
        if(from>=0&&to>=0&&from!==to){const [moved]=homepageRails.order.splice(from,1);homepageRails.order.splice(to,0,moved);}
        draggedRailKey='';renderHomepageRailOrder();
      });
      $('#home-rail-order-list').addEventListener('dragend',()=>{draggedRailKey='';$('#home-rail-order-list').querySelectorAll('.is-dragging,.is-drop-target').forEach(item=>item.classList.remove('is-dragging','is-drop-target'));});
      homepageRailKeys.forEach(key=>{
        $('#home-rail-'+key+'-search').addEventListener('input',()=>renderHomepageRailSearch(key));
        $('#home-rail-'+key+'-catalog-select').addEventListener('change',event=>{
          const id=event.target.value;if(!id)return;
          const rail=homepageRails[key],replaceIndex=homepageRailReplaceIndex[key];
          if(replaceIndex!==null){
            if(rail.itemIds.includes(id)&&rail.itemIds[replaceIndex]!==id){toast('Bu yapım zaten bu rafta seçili.');event.target.value='';return;}
            rail.itemIds[replaceIndex]=id;homepageRailReplaceIndex[key]=null;
          }else{
            if(rail.itemIds.includes(id)){toast('Bu yapım zaten seçili.');event.target.value='';return;}
            const max=rail.displayCount;
            if(rail.itemIds.length>=max){toast('Gösterilecek kart sayısı '+max+'. Bu rafa daha fazla yapım ekleyemezsin. Önce kart sayısını artır veya bir yapımı kaldır.');event.target.value='';return;}
            rail.itemIds.push(id);
          }
          event.target.value='';renderHomepageRails();renderHomepageRailSearch(key);
        });
        $('#home-rail-'+key+'-results').addEventListener('click',event=>{
          const cancel=event.target.closest('[data-home-rail-cancel-replace]');if(cancel){const targetKey=cancel.dataset.homeRailCancelReplace;homepageRailReplaceIndex[targetKey]=null;renderHomepageRailSearch(targetKey);return;}
          const button=event.target.closest('[data-home-rail-pick]');if(!button)return;
          const [targetKey,id]=button.dataset.homeRailPick.split(':');
          const rail=homepageRails[targetKey];if(!rail)return;
          const replaceIndex=homepageRailReplaceIndex[targetKey];
          if(replaceIndex!==null){
            if(rail.itemIds.includes(id)&&rail.itemIds[replaceIndex]!==id)return;
            rail.itemIds[replaceIndex]=id;homepageRailReplaceIndex[targetKey]=null;
            $('#home-rail-'+targetKey+'-search').placeholder=targetKey==='movies'?'Film adı yaz…':targetKey==='series'?'Dizi adı yaz…':'Film veya dizi adı yaz…';
          }else{
            if(rail.itemIds.includes(id))return;
            if(rail.itemIds.length>=rail.displayCount){toast('Gösterilecek kart sayısı '+rail.displayCount+'. Bu rafa daha fazla yapım ekleyemezsin. Önce kart sayısını artır veya bir yapımı kaldır.');return;}
            rail.itemIds.push(id);
          }
          renderHomepageRails();renderHomepageRailSearch(targetKey);
        });
        $('#home-rail-'+key+'-title').addEventListener('input',event=>{homepageRails[key].title=event.target.value.slice(0,64);renderHomepageRailOrder();});
        $('#home-rail-'+key+'-visibility').addEventListener('click',()=>{homepageRails[key].active=!homepageRails[key].active;renderHomepageRails();});
        $('#home-rail-'+key+'-display-count').addEventListener('change',event=>{const min=key==='featured'?5:6,max=key==='featured'?10:15;homepageRails[key].displayCount=Math.min(max,Math.max(min,Number(event.target.value)||min));renderHomepageRails();});
        $('#home-rail-'+key+'-list').addEventListener('click',event=>{
          const button=event.target.closest('button');if(!button)return;
          if(button.hasAttribute('data-home-rail-change')){
            const [targetKey,indexText]=button.dataset.homeRailChange.split(':');const idx=Number(indexText);if(!homepageRails[targetKey]||!Number.isInteger(idx))return;
            homepageRailReplaceIndex[targetKey]=idx;const input=$('#home-rail-'+targetKey+'-search');input.placeholder='Yeni yapım ara…';input.focus();renderHomepageRailSearch(targetKey);return;
          }
          const action=['up','down','remove'].find(name=>button.hasAttribute('data-home-rail-'+name));if(!action)return;
          const [targetKey,indexText]=button.getAttribute('data-home-rail-'+action).split(':');
          const rail=homepageRails[targetKey],idx=Number(indexText);if(!rail||!Number.isInteger(idx))return;
          if(action==='remove'){rail.itemIds.splice(idx,1);if(homepageRailReplaceIndex[targetKey]===idx)homepageRailReplaceIndex[targetKey]=null;else if(homepageRailReplaceIndex[targetKey]>idx)homepageRailReplaceIndex[targetKey]--;}
          else{const target=idx+(action==='up'?-1:1);if(target<0||target>=rail.itemIds.length)return;[rail.itemIds[idx],rail.itemIds[target]]=[rail.itemIds[target],rail.itemIds[idx]];if(homepageRailReplaceIndex[targetKey]===idx)homepageRailReplaceIndex[targetKey]=target;else if(homepageRailReplaceIndex[targetKey]===target)homepageRailReplaceIndex[targetKey]=idx;}
          renderHomepageRails();renderHomepageRailSearch(targetKey);
        });
      });
      homepageRailPickersReady=true;
    }
    renderHomepageRails();
    homepageRailKeys.forEach(renderHomepageRailSearch);
  }
  async function saveHomepageRails(){
    const button=$('#home-rails-save');
    const invalid=homepageRailKeys.filter(key=>homepageRails[key].active&&(key==='featured'?homepageRails[key].itemIds.length<5||homepageRails[key].itemIds.length>10||homepageRails[key].itemIds.length!==homepageRails[key].displayCount:homepageRails[key].itemIds.length<6||homepageRails[key].itemIds.length>15||homepageRails[key].itemIds.length!==homepageRails[key].displayCount));
    if(invalid.length){toast('Her raftaki seçili yapım sayısı, “Gösterilecek kart sayısı” ile aynı olmalı. Fazla yapımları kaldır veya gösterim sayısını ayarla. Gizli raflar yayın kontrolüne dahil edilmez.');return;}
    if(!getGithubToken())return toast('Önce Veri Kaynakları bölümünden GitHub kayıt bağlantısını kur.');
    button.disabled=true;button.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Kaydediliyor…';
    $('#home-rails-save-status').textContent='GitHub deposuna kaydediliyor…';
    try{
      const current=await githubHeroConfigRequest('GET');
      if(!current.sha||!current.content)throw new Error('Anasayfa ayar dosyası okunamadı.');
      const config=JSON.parse(decodeGithubContent(current.content));
      const payload={...config,version:Math.max(2,Number(config.version)||2),updatedAt:new Date().toISOString(),homeRails:normalizeHomepageRails(homepageRails)};
      await githubHeroConfigRequest('PUT',{message:'Simplify Perde homepage rails manager',content:encodeGithubContent(JSON.stringify(payload,null,2)+'\n'),sha:current.sha,branch:'main'});
      homepageRails=payload.homeRails;renderHomepageRails();
      $('#home-rails-save-title').textContent='Yayında';
      $('#home-rails-save-status').textContent=new Date().toLocaleString('tr-TR')+' · GitHub’a kaydedildi.';
      toast('Anasayfa vitrinleri kaydedildi. Yayın hazırlanıyor.');
    }catch(error){
      $('#home-rails-save-title').textContent='Kayıt başarısız';
      $('#home-rails-save-status').textContent=error.message;
      toast('Anasayfa vitrinleri kaydedilemedi: '+error.message);
    }finally{button.disabled=false;button.innerHTML='<i class="fa-solid fa-cloud-arrow-up"></i> Değişiklikleri kaydet ve yayınla';}
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
    $('#collection-list').innerHTML=collections.map((item,index)=>'<button type="button" class="collection-list-item'+(item.id===activeCollectionId?' selected':'')+'" data-collection-select="'+escapeHtml(item.id)+'"><span class="collection-list-icon"><i class="fa-solid fa-layer-group"></i></span><span class="collection-list-copy"><b>'+escapeHtml(item.title)+'</b><small>'+item.items.length+' yapım · '+(item.active?'Yayında':'Gizli')+' · '+(index+1)+'. sıra</small></span><i class="fa-solid fa-chevron-right"></i></button>').join('')||'<div class="collection-editor-empty">Henüz koleksiyon yok.</div>';
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
    $('#collection-rename-input').value=item.title;
    const orderSelect=$('#collection-home-order');
    orderSelect.innerHTML=collections.map((entry,index)=>'<option value="'+index+'">'+(index+1)+'. sırada</option>').join('');
    orderSelect.value=String(collections.findIndex(entry=>entry.id===item.id));
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
    renderBulkToolbar();
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
  async function renameCollection() {
    const item=selectedCollection(), input=$('#collection-rename-input');
    if(!item)return;
    const title=input.value.trim();
    if(!title)return toast('Raf adı boş bırakılamaz.');
    if(collections.some(entry=>entry.id!==item.id&&entry.title.toLocaleLowerCase('tr-TR')===title.toLocaleLowerCase('tr-TR')))return toast('Bu isimde başka bir raf zaten var.');
    if(title===item.title)return toast('Raf adı değişmedi.');
    if(!getGithubToken())return toast('Önce GitHub kayıt bağlantısını kur.');
    const previous=item.title; item.title=title; renderCollections();
    try { await persistCollections(); toast('Raf adı güncellendi.'); }
    catch(error) { item.title=previous; renderCollections(); toast('Raf adı kaydedilemedi: '+error.message); }
  }
  async function deleteCollection() {
    const item=selectedCollection();
    if(!item)return;
    if(!getGithubToken())return toast('Önce GitHub kayıt bağlantısını kur.');
    if(!window.confirm('“'+item.title+'” rafı ve rafın içindeki '+item.items.length+' yapım koleksiyon kaydından silinsin mi? Katalogdaki yapımlar silinmez.'))return;
    const previous=[...collections], previousId=activeCollectionId;
    const index=collections.findIndex(entry=>entry.id===item.id);
    collections.splice(index,1);
    activeCollectionId=collections[Math.min(index,collections.length-1)]?.id||'';
    renderCollections();
    try { await persistCollections(); toast('Koleksiyon rafı silindi.'); }
    catch(error) { collections=previous; activeCollectionId=previousId; renderCollections(); toast('Raf silinemedi: '+error.message); }
  }
  async function changeCollectionHomeOrder() {
    const item=selectedCollection();
    if(!item)return;
    if(!getGithubToken())return toast('Önce GitHub kayıt bağlantısını kur.');
    const oldIndex=collections.findIndex(entry=>entry.id===item.id);
    const newIndex=Number($('#collection-home-order').value);
    if(!Number.isInteger(newIndex)||newIndex===oldIndex)return;
    const previous=[...collections];
    collections.splice(oldIndex,1); collections.splice(Math.max(0,Math.min(newIndex,collections.length)),0,item);
    renderCollections();
    try { await persistCollections(); toast('Ana sayfa raf sırası güncellendi.'); }
    catch(error) { collections=previous; renderCollections(); toast('Sıralama kaydedilemedi: '+error.message); }
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
      initHomepageRailsManager();
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
  $('#home-rails-save').addEventListener('click',saveHomepageRails);
  $('#health-filters').addEventListener('click',event=>{
    const button=event.target.closest('[data-health-filter]');if(!button)return;
    healthFilter=button.dataset.healthFilter;
    $('#health-filters').querySelectorAll('[data-health-filter]').forEach(item=>item.classList.toggle('active',item===button));
    renderCatalogHealth();
  });
  $('#health-refresh').addEventListener('click',()=>{renderCatalogHealth();toast('Katalog yeniden tarandı.');});
  $('#health-issue-list').addEventListener('click',event=>{
    const deleteButton=event.target.closest('[data-health-delete]');
    if(deleteButton){deleteHealthCatalogItem(deleteButton.dataset.healthDelete,deleteButton);return;}
    const button=event.target.closest('[data-health-edit]');if(!button)return;
    const item=catalog.find(row=>String(row.id)===button.dataset.healthEdit);if(item)openEditor(item);
  });
  ['#watchlink-search','#watchlink-filter','#watchlink-type'].forEach(selector=>$(selector).addEventListener(selector==='#watchlink-search'?'input':'change',renderWatchLinks));
  $('#watchlink-list').addEventListener('click',event=>{
    const button=event.target.closest('[data-watch-edit]');if(!button)return;
    const item=catalog.find(row=>String(row.id)===button.dataset.watchEdit);if(item)openEditor(item);
  });
  $$('.nav-item').forEach(button => button.addEventListener('click',() => navigate(button.dataset.page)));
  $$('[data-goto]').forEach(button => button.addEventListener('click',() => navigate(button.dataset.goto)));
  const sidebarToggle = $('#mobile-menu');
  const adminSidebar = $('#admin-sidebar');
  const syncSidebarToggle = () => {
    const isMobile = window.matchMedia('(max-width: 900px)').matches;
    const expanded = isMobile ? adminSidebar.classList.contains('open') : !document.body.classList.contains('sidebar-collapsed');
    document.body.classList.toggle('admin-sidebar-open', isMobile && expanded);
    sidebarToggle.setAttribute('aria-expanded', String(expanded));
    sidebarToggle.setAttribute('aria-label', expanded ? 'Sol menüyü daralt' : 'Sol menüyü genişlet');
    sidebarToggle.title = expanded ? 'Sol menüyü daralt' : 'Sol menüyü genişlet';
    sidebarToggle.innerHTML = '<i class="fa-solid ' + (expanded ? 'fa-bars' : 'fa-bars-staggered') + '"></i>';
  };
  sidebarToggle.addEventListener('click', () => {
    if (window.matchMedia('(max-width: 900px)').matches) adminSidebar.classList.toggle('open');
    else document.body.classList.toggle('sidebar-collapsed');
    syncSidebarToggle();
  });
  window.addEventListener('resize', syncSidebarToggle, {passive:true});
  syncSidebarToggle();
  ['#catalog-search','#catalog-type','#catalog-genre','#catalog-year','#catalog-rating','#catalog-sort'].forEach(selector => $(selector).addEventListener(selector==='#catalog-search'?'input':'change',() => {catalogPage=1;renderCatalog();}));
  $('#catalog-table-body').addEventListener('change',event=>{
    const checkbox=event.target.closest('[data-catalog-select]');if(!checkbox)return;
    const id=String(checkbox.dataset.catalogSelect);if(checkbox.checked)selectedCatalogIds.add(id);else selectedCatalogIds.delete(id);
    renderBulkToolbar();
    const pageRows=catalogMatches().slice((catalogPage-1)*catalogPageSize,catalogPage*catalogPageSize);
    const selectedOnPage=pageRows.filter(item=>selectedCatalogIds.has(String(item.id))).length;
    const selectPage=$('#catalog-select-page');selectPage.checked=pageRows.length>0&&selectedOnPage===pageRows.length;selectPage.indeterminate=selectedOnPage>0&&selectedOnPage<pageRows.length;
  });
  $('#catalog-select-page').addEventListener('change',event=>{
    const pageRows=catalogMatches().slice((catalogPage-1)*catalogPageSize,catalogPage*catalogPageSize);
    pageRows.forEach(item=>{const id=String(item.id);if(event.target.checked)selectedCatalogIds.add(id);else selectedCatalogIds.delete(id);});
    renderCatalog();
  });
  $('#bulk-collection-select').addEventListener('change',renderBulkToolbar);
  $('#bulk-add-to-collection').addEventListener('click',addBulkSelectionToCollection);
  $('#bulk-clear-selection').addEventListener('click',()=>{selectedCatalogIds.clear();renderCatalog();});
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
  $('#collection-rename-save').addEventListener('click',renameCollection);
  $('#collection-delete').addEventListener('click',deleteCollection);
  $('#collection-rename-input').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();renameCollection();}});
  $('#collection-home-order').addEventListener('change',changeCollectionHomeOrder);
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
  $('#editor-subtitle-search').addEventListener('click',searchOnlineSubtitles);
  $('#editor-subtitle-search-results').addEventListener('click',event=>{const button=event.target.closest('[data-online-subtitle]');if(button)downloadOnlineSubtitle(button.dataset.onlineSubtitle);});
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
  async function fetchBackupApi(url,timeoutMs=12000){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    const token=getGithubToken();
    const headers={Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
    if(token)headers.Authorization='Bearer '+token;
    try{
      return await fetch(url,{headers,signal:controller.signal,cache:'no-store'});
    }catch(error){
      if(error&&error.name==='AbortError')throw new Error('GitHub yanıtı zaman aşımına uğradı. İnternet bağlantını kontrol edip yeniden dene.');
      throw error;
    }finally{clearTimeout(timer);}
  }
  async function loadAutomaticBackupStatus(){
    const host=$('#auto-backup-status'),historyHost=$('#auto-backup-history'),button=$('#auto-backup-refresh');
    if(!host)return;
    if(button){button.disabled=true;button.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Kontrol ediliyor';}
    host.innerHTML='<span class="auto-backup-status-icon"><i class="fa-solid fa-spinner fa-spin"></i></span><span><b>Yedek durumu kontrol ediliyor</b><small>GitHub Actions bilgileri alınıyor…</small></span>';
    if(historyHost)historyHost.innerHTML='<div class="auto-backup-history-heading">SON YEDEKLER</div><div class="loading-line">Yedek geçmişi yükleniyor…</div>';
    try{
      const url='https://api.github.com/repos/'+githubRepo+'/actions/workflows/perde-daily-backup.yml/runs?per_page=5';
      const response=await fetchBackupApi(url,15000);
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error('GitHub HTTP '+response.status+': '+(data.message||'Yedek geçmişi okunamadı.'));
      const runs=Array.isArray(data.workflow_runs)?data.workflow_runs:[],run=runs[0];
      const dateLabel=value=>{const date=value?new Date(value):null;return date&&!Number.isNaN(date.getTime())?new Intl.DateTimeFormat('tr-TR',{dateStyle:'medium',timeStyle:'short'}).format(date):'Tarih bilinmiyor';};
      if(!run){
        host.innerHTML='<span class="auto-backup-status-icon pending"><i class="fa-solid fa-clock"></i></span><span><b>İlk otomatik yedek henüz çalışmadı</b><small>GitHub Actions sayfasından ilk çalıştırmayı başlatabilirsin.</small></span>';
        if(historyHost)historyHost.innerHTML='<div class="auto-backup-history-heading">SON YEDEKLER</div><div class="auto-backup-history-empty">Henüz bir yedekleme çalıştırması bulunmuyor.</div>';
        return;
      }
      const running=run.status!=='completed',success=run.conclusion==='success',failed=['failure','cancelled','timed_out','action_required'].includes(run.conclusion);
      const stateLabel=running?'ÇALIŞIYOR':success?'BAŞARILI':failed?'BAŞARISIZ':String(run.conclusion||run.status||'BİLİNMİYOR').toLocaleUpperCase('tr-TR');
      const icon=running?'fa-spinner fa-spin':success?'fa-circle-check':failed?'fa-triangle-exclamation':'fa-circle-info',tone=running?'pending':success?'good':'failed';
      const detail=running?'Yedekleme işlemi devam ediyor.':success?'Son otomatik arşiv başarıyla oluşturuldu.':'Son çalıştırma tamamlanmadı: '+(run.conclusion||run.status)+'.';
      host.innerHTML='<span class="auto-backup-status-icon '+tone+'"><i class="fa-solid '+icon+'"></i></span><span class="auto-backup-status-copy"><b>'+escapeHtml(stateLabel)+' · #'+escapeHtml(run.run_number||run.id)+'</b><small>'+escapeHtml(dateLabel(run.updated_at||run.created_at))+' · '+escapeHtml(detail)+'</small></span><a class="auto-backup-run-link" href="'+escapeHtml(run.html_url||'https://github.com/'+githubRepo+'/actions/workflows/perde-daily-backup.yml')+'" target="_blank" rel="noopener noreferrer" aria-label="Son yedekleme çalıştırmasını aç"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>';
      if(historyHost){
        const rows=await Promise.all(runs.map(async item=>{
          const ok=item.status==='completed'&&item.conclusion==='success';let hasArtifact=false;
          if(ok&&item.artifacts_url){
            try{const ar=await fetchBackupApi(item.artifacts_url,8000);const ad=await ar.json().catch(()=>({}));hasArtifact=ar.ok&&Array.isArray(ad.artifacts)&&ad.artifacts.some(artifact=>String(artifact.name||'').startsWith('perde-otomatik-yedek-')&&!artifact.expired);}
            catch(_){hasArtifact=false;}
          }
          const state=item.status!=='completed'?'Devam ediyor':item.conclusion==='success'?'Başarılı':'Başarısız',statusClass=item.status!=='completed'?'pending':item.conclusion==='success'?'good':'failed';
          const artifactText=ok?(hasArtifact?'Arşiv dosyası hazır':'Arşiv dosyası kontrol edilemedi / bulunamadı'):'Yedek henüz hazır değil';
          return '<article class="auto-backup-history-row"><span class="auto-backup-history-dot '+statusClass+'"><i class="fa-solid '+(ok?'fa-check':item.status!=='completed'?'fa-spinner fa-spin':'fa-xmark')+'"></i></span><span class="auto-backup-history-copy"><b>'+escapeHtml('#'+(item.run_number||item.id)+' · '+state)+'</b><small>'+escapeHtml(dateLabel(item.updated_at||item.created_at))+' · '+escapeHtml(artifactText)+'</small></span><a href="'+escapeHtml(item.html_url||'#')+'" target="_blank" rel="noopener noreferrer" class="auto-backup-history-link" aria-label="Yedek çalıştırmasını aç"><i class="fa-solid fa-arrow-up-right-from-square"></i></a></article>';
        }));
        historyHost.innerHTML='<div class="auto-backup-history-heading">SON YEDEKLER</div>'+(rows.length?rows.join(''):'<div class="auto-backup-history-empty">Henüz yedek geçmişi bulunmuyor.</div>');
      }
    }catch(error){
      const message=error&&error.message?error.message:'Bilinmeyen bağlantı hatası';
      host.innerHTML='<span class="auto-backup-status-icon pending"><i class="fa-solid fa-circle-exclamation"></i></span><span><b>Yedek durumu alınamadı</b><small>'+escapeHtml(message)+' · Yenile düğmesiyle tekrar deneyebilirsin.</small></span>';
      if(historyHost)historyHost.innerHTML='<div class="auto-backup-history-heading">SON YEDEKLER</div><div class="auto-backup-history-empty">GitHub yedek geçmişine ulaşılamadı. GitHub Actions sayfasından da kontrol edebilirsin.</div>';
    }finally{
      if(button){button.disabled=false;button.innerHTML='<i class="fa-solid fa-rotate"></i> Durumu yenile';}
    }
  }
  async function loadChangeHistory() {
    const host=$('#history-list'),status=$('#history-status'),total=$('#history-total'),button=$('#history-refresh');
    if(!host||!status||!total)return;
    if(!getGithubToken()){status.textContent='GITHUB BAĞLANTISI GEREKLİ';host.innerHTML='<div class="health-empty"><i class="fa-solid fa-key"></i><b>GitHub bağlantısı gerekli</b><span>Veri Kaynakları bölümünden GitHub erişim anahtarını kaydet, ardından yeniden dene.</span></div>';total.textContent='—';return;}
    if(button){button.disabled=true;button.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Yükleniyor';}
    status.textContent='KAYITLAR ALINIYOR';
    host.innerHTML='<div class="loading-line">GitHub değişiklik geçmişi yükleniyor…</div>';
    try{
      const token=getGithubToken();
      const paths=['data/catalog.json','data/collections.json','data/homepage-config.json'];
      const results=await Promise.all(paths.map(async path=>{
        const response=await fetch('https://api.github.com/repos/'+githubRepo+'/commits?path='+encodeURIComponent(path)+'&per_page=15',{
          headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28'}
        });
        const data=await response.json().catch(()=>[]);
        if(!response.ok)throw new Error('GitHub HTTP '+response.status+': '+(data.message||'Geçmiş okunamadı.'));
        if(!Array.isArray(data))throw new Error('GitHub geçmiş yanıtı geçersiz.');
        return {path,data};
      }));
      const records=new Map();
      const labels={'data/catalog.json':'Katalog','data/collections.json':'Koleksiyonlar','data/homepage-config.json':'Ana sayfa / Slider'};
      results.forEach(({path,data})=>data.forEach(commit=>{
        if(!commit||!commit.sha)return;
        const row=records.get(commit.sha)||{sha:commit.sha,message:commit.commit?.message||'İsimsiz kayıt',author:commit.commit?.author?.name||commit.author?.login||'Bilinmeyen kullanıcı',date:commit.commit?.author?.date||commit.commit?.committer?.date||'',url:commit.html_url,files:[]};
        row.files.push(labels[path]||path);records.set(commit.sha,row);
      }));
      const sorted=[...records.values()].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,30);
      total.textContent=String(sorted.length);
      if(!sorted.length){host.innerHTML='<div class="health-empty"><i class="fa-solid fa-inbox"></i><b>Henüz kayıt bulunamadı</b><span>Takip edilen dosyalarda GitHub commit geçmişi görünmüyor.</span></div>';status.textContent='KAYIT BULUNAMADI';return;}
      host.innerHTML=sorted.map(row=>{
        const date=row.date?new Date(row.date):null;
        const dateLabel=date&&!Number.isNaN(date.getTime())?new Intl.DateTimeFormat('tr-TR',{dateStyle:'medium',timeStyle:'short'}).format(date):'Tarih bilinmiyor';
        return '<article class="history-row"><span class="history-icon"><i class="fa-solid fa-code-commit"></i></span><div class="history-copy"><b>'+escapeHtml(row.message.split('\\n')[0])+'</b><small>'+escapeHtml(row.author)+' · '+escapeHtml(dateLabel)+'</small><div class="history-tags">'+[...new Set(row.files)].map(label=>'<span>'+escapeHtml(label)+'</span>').join('')+'</div></div><a class="history-link" href="'+escapeHtml(row.url||'#')+'" target="_blank" rel="noopener noreferrer" aria-label="GitHub kaydını aç"><i class="fa-solid fa-arrow-up-right-from-square"></i></a></article>';
      }).join('');
      status.textContent='GÜNCEL · '+sorted.length+' KAYIT';
    }catch(error){
      total.textContent='—';status.textContent='YÜKLEME BAŞARISIZ';
      host.innerHTML='<div class="health-empty"><i class="fa-solid fa-triangle-exclamation"></i><b>Geçmiş yüklenemedi</b><span>'+escapeHtml(error.message)+'</span></div>';
    }finally{
      if(button){button.disabled=false;button.innerHTML='<i class="fa-solid fa-rotate"></i> Yenile';}
    }
  }
  $('#history-refresh').addEventListener('click',loadChangeHistory);
  $('#auto-backup-refresh').addEventListener('click',loadAutomaticBackupStatus);
    let pendingArchiveRestore=null;
  const archivePreview=$('#archive-restore-preview');
  function archiveDiff(current,incoming){
    const byId=new Map(current.map(item=>[String(item.id),item]));
    const nextIds=new Set(incoming.map(item=>String(item.id)));
    let added=0,changed=0;
    incoming.forEach(item=>{
      const old=byId.get(String(item.id));
      if(!old)added++;
      else if(JSON.stringify(old)!==JSON.stringify(item))changed++;
    });
    const removed=current.filter(item=>!nextIds.has(String(item.id))).length;
    return {added,changed,removed};
  }
  function showArchivePreview(parsed,safeCollections,safeConfig,fileName){
    const catalogDiff=archiveDiff(catalog,parsed.catalog);
    const collectionDiff=archiveDiff(collections,safeCollections);
    const currentSlideIds=new Set(heroSlides.map(slide=>String(slide.id)));
    const nextSlideIds=new Set(safeConfig.heroSlides.map(slide=>String(slide.id)));
    const slideAdded=[...nextSlideIds].filter(id=>!currentSlideIds.has(id)).length;
    const slideRemoved=[...currentSlideIds].filter(id=>!nextSlideIds.has(id)).length;
    const changedSettings=JSON.stringify(heroSettings)!==JSON.stringify(safeConfig.settings);
    const stat=(label,value)=>'<div class="archive-diff-stat"><small>'+label+'</small><b>'+value+'</b></div>';
    archivePreview.innerHTML=
      '<div class="archive-preview-heading"><span><i class="fa-solid fa-clipboard-list"></i> GERİ YÜKLEME ÖN İZLEMESİ</span><small>'+escapeHtml(fileName)+'</small></div>'+
      '<div class="archive-preview-warning"><i class="fa-solid fa-triangle-exclamation"></i><span><b>Bu işlem mevcut yayın verilerinin yerine geçecek.</b><small>Onay vermeden GitHub deposunda hiçbir değişiklik yapılmaz.</small></span></div>'+
      '<div class="archive-preview-section"><b>Katalog</b><div class="archive-diff-grid">'+stat('Yedekteki toplam',parsed.catalog.length)+stat('Eklenecek',catalogDiff.added)+stat('Değişecek',catalogDiff.changed)+stat('Kaldırılacak',catalogDiff.removed)+'</div></div>'+
      '<div class="archive-preview-section"><b>Koleksiyon rafları</b><div class="archive-diff-grid">'+stat('Yedekteki toplam',safeCollections.length)+stat('Eklenecek',collectionDiff.added)+stat('Değişecek',collectionDiff.changed)+stat('Kaldırılacak',collectionDiff.removed)+'</div></div>'+
      '<div class="archive-preview-section"><b>Ana sayfa</b><div class="archive-diff-grid">'+stat('Manşet slaytı',safeConfig.heroSlides.length)+stat('Yeni slayt',slideAdded)+stat('Kaldırılacak slayt',slideRemoved)+stat('Genel ayarlar',changedSettings?'Değişecek':'Aynı')+'</div></div>'+
      '<div class="archive-preview-actions"><button type="button" class="gold-button" id="confirm-archive-restore"><i class="fa-solid fa-shield-check"></i> Geri yüklemeyi onayla</button><button type="button" class="outline-button" id="cancel-archive-restore">Vazgeç</button></div>'+
      '<small class="archive-preview-footnote">İşlem öncesinde mevcut katalog ve ayarlar ayrıca JSON güvenlik yedeği olarak indirilecek.</small>';
    archivePreview.hidden=false;
    $('#confirm-archive-restore').addEventListener('click',restorePendingArchive);
    $('#cancel-archive-restore').addEventListener('click',()=>{
      pendingArchiveRestore=null;archivePreview.hidden=true;
      $('#archive-restore-hint').textContent='Geri yükleme iptal edildi. Mevcut veriler korunuyor.';
      $('#archive-backup-file').value='';
    });
  }
  async function restorePendingArchive(){
    if(!pendingArchiveRestore)return;
    const button=$('#confirm-archive-restore'),hint=$('#archive-restore-hint');
    button.disabled=true;button.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Geri yükleniyor…';
    const {parsed,safeCollections,safeConfig}=pendingArchiveRestore;
    try{
      if(!getGithubToken())throw new Error('GitHub bağlantısı bulunamadı. Veri Kaynakları bölümünden bağlantıyı kur.');
      const before={app:'Perde',backupType:'archive-data',version:2,catalog,collections,homepageConfig:{version:2,settings:heroSettings,heroSlides,homeRails:homepageRails},exportedAt:new Date().toISOString(),safetySnapshot:true};
      downloadJson('perde-geri-yukleme-oncesi-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json',before);
      hint.textContent='Güvenlik yedeği indirildi. GitHub dosyaları güncelleniyor…';
      const catalogCurrent=await githubCatalogRequest('GET');
      const collectionsCurrent=await githubCollectionsRequest('GET');
      const heroCurrent=await githubHeroConfigRequest('GET');
      if(!catalogCurrent.sha||!collectionsCurrent.sha||!heroCurrent.sha)throw new Error('GitHub dosyalarının sürüm bilgisi alınamadı; hiçbir dosya değiştirilmedi.');
      await githubCatalogRequest('PUT',{message:'Restore Perde catalog from archive backup',content:encodeGithubContent(JSON.stringify(parsed.catalog,null,2)+'\n'),sha:catalogCurrent.sha,branch:'main'});
      await githubCollectionsRequest('PUT',{message:'Restore Perde collections from archive backup',content:encodeGithubContent(JSON.stringify(safeCollections,null,2)+'\n'),sha:collectionsCurrent.sha,branch:'main'});
      await githubHeroConfigRequest('PUT',{message:'Restore Perde homepage settings from archive backup',content:encodeGithubContent(JSON.stringify(safeConfig,null,2)+'\n'),sha:heroCurrent.sha,branch:'main'});
      catalog=parsed.catalog;collections=safeCollections;heroSettings=safeConfig.settings;heroSlides=safeConfig.heroSlides;homepageRails=safeConfig.homeRails;
      renderOverview();initCatalogFilters();renderCatalog();renderCatalogHealth();renderWatchLinks();initHeroManager();initCollections();initDiary();
      hint.textContent='Tam arşiv başarıyla geri yüklendi. '+catalog.length+' yapım ve '+collections.length+' koleksiyon yayın ayarlarıyla birlikte kaydedildi.';
      toast('Tam arşiv geri yüklendi.');
      pendingArchiveRestore=null;archivePreview.hidden=true;
    }catch(error){
      hint.textContent='Geri yükleme tamamlanamadı: '+error.message+' İşlem öncesi indirilen güvenlik yedeğini sakla.';
      toast('Tam arşiv geri yüklenemedi.');
      button.disabled=false;button.innerHTML='<i class="fa-solid fa-shield-check"></i> Yeniden dene';
    }
  }
  $('#import-archive').addEventListener('click',()=>$('#archive-backup-file').click());
  $('#archive-backup-file').addEventListener('change',async event=>{
    const file=event.target.files&&event.target.files[0];if(!file)return;
    const hint=$('#archive-restore-hint');const button=$('#import-archive');
    button.disabled=true;hint.textContent='Arşiv yedeği doğrulanıyor…';archivePreview.hidden=true;pendingArchiveRestore=null;
    try{
      if(file.size>15*1024*1024)throw new Error('Arşiv yedeği 15 MB sınırını aşıyor.');
      const parsed=JSON.parse(await file.text());
      if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||parsed.app!=='Perde'||parsed.backupType!=='archive-data')throw new Error('Bu dosya geçerli bir Perde tam arşiv yedeği değil.');
      if(!Array.isArray(parsed.catalog)||!parsed.catalog.length)throw new Error('Yedekte katalog bulunamadı.');
      if(!Array.isArray(parsed.collections))throw new Error('Yedekte koleksiyon listesi bulunamadı.');
      if(!parsed.homepageConfig||typeof parsed.homepageConfig!=='object'||!Array.isArray(parsed.homepageConfig.heroSlides)||!parsed.homepageConfig.settings)throw new Error('Yedekte ana sayfa ayarları eksik.');
      const ids=new Set();
      for(const item of parsed.catalog){
        if(!item||typeof item!=='object'||!String(item.id||'').trim()||!String(item.title||'').trim())throw new Error('Katalogda kimliği veya adı eksik bir kayıt var.');
        const id=String(item.id);if(ids.has(id))throw new Error('Yedekte yinelenen yapım kimliği bulundu: '+id);ids.add(id);
      }
      const safeCollections=parsed.collections.filter(item=>item&&typeof item==='object'&&String(item.id||'').trim()&&String(item.title||'').trim()).map(item=>({...item,items:Array.isArray(item.items)?item.items.map(String).filter(id=>ids.has(id)):[]}));
      const safeConfig={version:2,updatedAt:new Date().toISOString(),settings:normalizeHeroSettings(parsed.homepageConfig.settings),heroSlides:parsed.homepageConfig.heroSlides.filter(slide=>slide&&ids.has(String(slide.id))).map(slide=>({id:String(slide.id),active:slide.active!==false,headline:String(slide.headline||''),description:String(slide.description||'')})),homeRails:normalizeHomepageRails(parsed.homepageConfig.homeRails,parsed.catalog)};
      if(!getGithubToken())throw new Error('Tam arşivi geri yüklemek için Veri Kaynakları bölümünden GitHub bağlantısını kurmalısın.');
      pendingArchiveRestore={parsed,safeCollections,safeConfig};
      showArchivePreview(parsed,safeCollections,safeConfig,file.name);
      hint.textContent='Yedek doğrulandı. Farkları incele; devam etmek için ayrıca onay ver.';
    }catch(error){hint.textContent='Yedek doğrulanamadı: '+error.message;toast('Arşiv yedeği geçersiz.');}
    finally{button.disabled=false;}
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
  if(location.hash==='#history')loadChangeHistory();
  $$('.nav-item[data-page="history"]').forEach(item=>item.addEventListener('click',loadChangeHistory));
  init();
})();