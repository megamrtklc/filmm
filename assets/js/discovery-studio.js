/* Perde Discovery Studio — local catalog discovery filters */
(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const root=()=> $('perde-discovery');
 const catalog=()=>typeof mediaDatabase!=='undefined'&&Array.isArray(mediaDatabase)?mediaDatabase:[];
 const norm=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[ıİ]/g,'i').toLocaleLowerCase('en-US').replace(/[ıİ]/g,'i').trim();
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const titleOf=item=>item.title||item.tmdbTitle||'İsimsiz yapım';
 const posterOf=item=>item.tmdbPoster||item.image||item.poster||item.tmdbBackdrop||item.backdrop||'';
 const yearOf=item=>Number(String(item.tmdbReleaseDate||item.year||'').match(/\d{4}/)?.[0]||0);
 const castOf=item=>Array.isArray(item.tmdbCast)&&item.tmdbCast.length?item.tmdbCast.map(person=>typeof person==='string'?person:person?.name).filter(Boolean):Array.isArray(item.cast)?item.cast.map(person=>typeof person==='string'?person:person?.name).filter(Boolean):[];
 const directorOf=item=>item.tmdbDirector||item.director||'';
 const genresOf=item=>[...new Set([item.tmdbGenres,item.category,item.genre].filter(Boolean).flatMap(value=>String(value).split(/[\/|,;]/).map(x=>x.trim()).filter(Boolean)))];
 let active='genre',genre='all',yearFrom='',yearTo='',person='',director='',type='all',sort='popular',limit=12,ready=false;
 function uniquePeople(key){const values=new Map();catalog().forEach(item=>{const raw=key==='actor'?castOf(item):[directorOf(item)];raw.forEach(name=>{const clean=String(name||'').trim();if(clean&&clean.length>1&&!values.has(norm(clean)))values.set(norm(clean),clean);});});return [...values.values()].sort((a,b)=>a.localeCompare(b,'tr'));}
 function genreOptions(){const values=new Map();catalog().forEach(item=>genresOf(item).forEach(name=>{if(name&&!values.has(norm(name)))values.set(norm(name),name);}));return [...values.values()].sort((a,b)=>a.localeCompare(b,'tr'));}
 function populateDatalists(){const actors=$('pd-actor-options'),directors=$('pd-director-options');if(actors)actors.innerHTML=uniquePeople('actor').map(name=>'<option value="'+esc(name)+'"></option>').join('');if(directors)directors.innerHTML=uniquePeople('director').map(name=>'<option value="'+esc(name)+'"></option>').join('');}
 function renderGenreChips(){const host=$('pd-genre-options');if(!host)return;const options=genreOptions();host.innerHTML=['Tüm türler',...options].map((name,index)=>{const value=index===0?'all':name;return '<button type="button" class="pd-genre-chip'+(genre===value?' is-active':'')+'" data-pd-genre="'+esc(value)+'">'+esc(name)+'</button>';}).join('');}
 function renderResults(){
  const host=$('pd-results'),count=$('pd-result-count');if(!host)return;
  const q=active==='actor'?norm(person):active==='director'?norm(director):'';
  let rows=catalog().filter(item=>{
   const kind=type==='all'||item.type===type;
   if(!kind)return false;
   if(active==='genre')return genre==='all'||genresOf(item).some(value=>norm(value)===norm(genre));
   if(active==='year'){const y=yearOf(item);return !!y&&(!yearFrom||y>=Number(yearFrom))&&(!yearTo||y<=Number(yearTo));}
   if(active==='actor')return !!q&&castOf(item).some(name=>norm(name).includes(q));
   if(active==='director')return !!q&&norm(directorOf(item)).includes(q);
   return true;
  });
  const score=item=>Number.parseFloat(item.tmdbRating||item.rating)||0;
  if(sort==='newest')rows.sort((a,b)=>yearOf(b)-yearOf(a)||score(b)-score(a));
  else if(sort==='oldest')rows.sort((a,b)=>yearOf(a)-yearOf(b)||score(b)-score(a));
  else rows.sort((a,b)=>score(b)-score(a));
  if(count)count.textContent=rows.length+' yapım bulundu';
  const visible=rows.slice(0,limit);
  const emptyTitle=active==='actor'&&!q?'Oyuncu adını yaz veya listeden seç.':active==='director'&&!q?'Yönetmen adını yaz veya listeden seç.':'Bu kriterlere uygun yapım bulunamadı.';
  const emptyHint=active==='actor'&&!q?'Oyuncunun adını girdiğinde yer aldığı yapımlar listelenecek.':active==='director'&&!q?'Yönetmenin adını girdiğinde filmografisi listelenecek.':'Filtreleri değiştirerek yeniden deneyebilirsin.';
  host.innerHTML=visible.length?visible.map(item=>{
   const poster=posterOf(item),year=yearOf(item),kind=item.type==='tv'?'Dizi':'Film',rating=item.tmdbRating||item.rating||'—';
   return '<button type="button" class="pd-result-card" data-pd-open="'+esc(item.id)+'"><span class="pd-result-poster">'+(poster?'<img src="'+esc(poster)+'" alt="'+esc(titleOf(item))+'" loading="lazy" decoding="async">':'<i class="fa-solid fa-film"></i>')+'<span class="pd-result-rating"><i class="fa-solid fa-star"></i> '+esc(rating)+'</span></span><span class="pd-result-copy"><strong>'+esc(titleOf(item))+'</strong><small>'+esc([year||'',kind].filter(Boolean).join(' · '))+'</small></span></button>';
  }).join(''):'<div class="pd-empty"><i class="fa-solid fa-magnifying-glass"></i><strong>'+esc(emptyTitle)+'</strong><span>'+esc(emptyHint)+'</span></div>';
  const more=$('pd-load-more');if(more)more.hidden=rows.length<=limit;
 }
 function setMode(mode){
  active=mode;limit=12;
  document.querySelectorAll('[data-pd-mode]').forEach(button=>{const selected=button.dataset.pdMode===mode;button.classList.toggle('is-active',selected);button.setAttribute('aria-pressed',String(selected));});
  document.querySelectorAll('[data-pd-panel]').forEach(panel=>panel.hidden=panel.dataset.pdPanel!==mode);
  renderResults();
 }
 function populateYears(){
  const years=[...new Set(catalog().map(yearOf).filter(Boolean))].sort((a,b)=>b-a);
  ['pd-year-from','pd-year-to'].forEach(id=>{const select=$(id);if(!select)return;const previous=select.value;select.innerHTML='<option value="">'+(id.endsWith('from')?'Başlangıç yılı':'Bitiş yılı')+'</option>'+years.map(y=>'<option value="'+y+'">'+y+'</option>').join('');if(previous)select.value=previous;});
  const latest=years[0]||new Date().getFullYear();if(!$('pd-year-to')?.value)$('pd-year-to').value=String(latest);
 }
 function init(){
  if(ready||!root()||!catalog().length)return false;
  ready=true;populateYears();populateDatalists();renderGenreChips();renderResults();return true;
 }
 document.addEventListener('click',event=>{
  const mode=event.target.closest('[data-pd-mode]');if(mode){setMode(mode.dataset.pdMode);return;}
  const chip=event.target.closest('[data-pd-genre]');if(chip){genre=chip.dataset.pdGenre;renderGenreChips();renderResults();return;}
  const open=event.target.closest('[data-pd-open]');if(open){if(typeof openDetailPage==='function')openDetailPage(open.dataset.pdOpen);return;}
  if(event.target.closest('#pd-load-more')){limit+=12;renderResults();}
  if(event.target.closest('#pd-reset')){genre='all';yearFrom='';yearTo='';person='';director='';type='all';sort='popular';limit=12;['pd-year-from','pd-year-to','pd-actor-input','pd-director-input'].forEach(id=>{if($(id))$(id).value='';});if($('pd-type'))$('pd-type').value='all';if($('pd-sort'))$('pd-sort').value='popular';renderGenreChips();renderResults();}
 });
 document.addEventListener('change',event=>{
  if(event.target.id==='pd-year-from'){yearFrom=event.target.value;renderResults();}
  if(event.target.id==='pd-year-to'){yearTo=event.target.value;renderResults();}
  if(event.target.id==='pd-type'){type=event.target.value;renderResults();}
  if(event.target.id==='pd-sort'){sort=event.target.value;renderResults();}
 });
 document.addEventListener('input',event=>{
  if(event.target.id==='pd-actor-input'){person=event.target.value.trim();renderResults();}
  if(event.target.id==='pd-director-input'){director=event.target.value.trim();renderResults();}
 });
 function start(){if(init())return;let attempts=0;const timer=setInterval(()=>{attempts++;if(init()||attempts>80)clearInterval(timer);},250);}
 window.addEventListener('load',start);
 start();
 window.addEventListener('perde:catalog-ready',()=>{ready=false;start();});
})();
