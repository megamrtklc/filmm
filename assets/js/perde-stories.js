/* Perde Hikayeleri — katalogdan otomatik üretilen kısa keşif hikayeleri */
(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const safe=value=>String(value??'').replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
 let activeItems=[],activeIndex=0,timer=null,startedAt=0;
 const duration=5600;
 const groups=[];
 function catalog(){return Array.isArray(window.mediaDatabase)?window.mediaDatabase.filter(x=>x&&x.id!=null&&x.title&&(x.tmdbPoster||x.image||x.poster)):[];}
 function buildGroups(){
  const all=catalog();if(!all.length)return [];
  const newest=all.slice(0,10);
  const day=Math.floor(Date.now()/86400000);
  const daily=[all[day%all.length]];
  const movies=all.filter(x=>x.type!=='tv').slice(0,10);
  const series=all.filter(x=>x.type==='tv').slice(0,10);
  const genres=['Aksiyon','Bilim Kurgu','Gerilim','Korku','Komedi','Dram','Macera','Gizem'];
  const genre=genres[day%genres.length];
  const genreItems=all.filter(x=>String(x.tmdbGenres||x.category||x.genre||'').toLocaleLowerCase('tr').includes(genre.toLocaleLowerCase('tr'))).slice(0,10);
  return [
   {label:'Yeni Eklenenler',items:newest,source:'PERDE ARŞİVİ'},
   {label:'Günün Seçimi',items:daily,source:'BUGÜNÜN ÖNERİSİ'},
   {label:'Filmler',items:movies,source:'FİLM SEÇKİSİ'},
   {label:'Diziler',items:series,source:'DİZİ SEÇKİSİ'},
   {label:genre+' Köşesi',items:genreItems,source:'TÜRÜNE GÖRE KEŞFET'}
  ].filter(g=>g.items.length);
 }
 function render(){
  const rail=$('perde-stories-rail');if(!rail)return;
  const data=buildGroups();if(!data.length){rail.innerHTML='';return;}
  rail.innerHTML=data.map((g,i)=>{
   const item=g.items[0],poster=item.tmdbPoster||item.image||item.poster;
   return '<button class="perde-story" type="button" data-story-group="'+i+'" aria-label="'+safe(g.label)+' hikayelerini aç"><span class="perde-story-ring"><img class="perde-story-image" src="'+safe(poster)+'" alt="" loading="lazy"></span><span class="perde-story-label">'+safe(g.label)+'</span></button>';
  }).join('');
  rail.querySelectorAll('[data-story-group]').forEach(button=>button.addEventListener('click',()=>open(data[Number(button.dataset.storyGroup)])));
 }
 function ensureViewer(){
  if($('perde-story-viewer'))return;
  const node=document.createElement('div');node.id='perde-story-viewer';node.className='perde-story-viewer';node.setAttribute('aria-hidden','true');
  node.innerHTML='<div class="perde-story-frame" role="dialog" aria-modal="true" aria-label="Perde Hikâyeleri"><img class="perde-story-backdrop" alt=""><img class="perde-story-poster" alt=""><div class="perde-story-progress"></div><div class="perde-story-top"><span class="perde-story-source">PERDE HİKÂYELERİ</span><button type="button" class="perde-story-close" aria-label="Hikâyeyi kapat">×</button></div><div class="perde-story-copy"><span class="perde-story-kind"></span><h3></h3><div class="perde-story-meta"></div><p class="perde-story-description"></p><button type="button" class="perde-story-open">İncele <i class="fa-solid fa-arrow-right"></i></button></div><div class="perde-story-nav"><button type="button" data-story-prev aria-label="Önceki hikâye"></button><button type="button" data-story-next aria-label="Sonraki hikâye"></button></div></div>';
  document.body.appendChild(node);
  node.querySelector('.perde-story-close').addEventListener('click',close);
  node.querySelector('[data-story-prev]').addEventListener('click',()=>show(activeIndex-1));
  node.querySelector('[data-story-next]').addEventListener('click',()=>show(activeIndex+1));
  node.querySelector('.perde-story-open').addEventListener('click',()=>{const item=activeItems[activeIndex];if(item&&typeof window.openDetailPage==='function'){close();window.openDetailPage(item.id);}});
  node.addEventListener('click',e=>{if(e.target===node)close();});
  document.addEventListener('keydown',e=>{if(!$('perde-story-viewer')?.classList.contains('is-open'))return;if(e.key==='Escape')close();if(e.key==='ArrowRight')show(activeIndex+1);if(e.key==='ArrowLeft')show(activeIndex-1);});
 }
 function open(group){if(!group||!group.items.length)return;ensureViewer();activeItems=group.items;activeIndex=0;$('perde-story-viewer').querySelector('.perde-story-source').textContent=group.source;show(0);$('perde-story-viewer').classList.add('is-open');$('perde-story-viewer').setAttribute('aria-hidden','false');document.body.style.overflow='hidden';}
 function close(){if(timer)clearInterval(timer);timer=null;const viewer=$('perde-story-viewer');if(!viewer)return;viewer.classList.remove('is-open');viewer.setAttribute('aria-hidden','true');document.body.style.overflow='';}
 function show(index){
  if(!activeItems.length)return;
  if(index>=activeItems.length){close();return;}
  activeIndex=Math.max(0,index);
  const item=activeItems[activeIndex],viewer=$('perde-story-viewer'),poster=item.tmdbPoster||item.image||item.poster||'',backdrop=item.tmdbBackdrop||item.backdrop||poster;
  viewer.querySelector('.perde-story-poster').src=poster;viewer.querySelector('.perde-story-poster').alt=item.title+' afişi';
  viewer.querySelector('.perde-story-backdrop').src=backdrop;
  viewer.querySelector('.perde-story-kind').textContent=item.type==='tv'?'DİZİ':'FİLM';
  viewer.querySelector('h3').textContent=item.title;
  viewer.querySelector('.perde-story-meta').textContent=[item.year,item.rating?'IMDb '+item.rating+' puan':'',item.category||item.tmdbGenres||''].filter(Boolean).join(' · ');
  viewer.querySelector('.perde-story-description').textContent=item.tmdbOverview||item.desc||'Bu yapımı Perde arşivinde keşfet.';
  const progress=viewer.querySelector('.perde-story-progress');progress.innerHTML=activeItems.map((_,i)=>'<span><i class="'+(i<activeIndex?'is-done':'')+'"></i></span>').join('');
  if(timer)clearInterval(timer);startedAt=Date.now();
  const fill=()=>{const bar=progress.children[activeIndex]?.firstElementChild;if(!bar)return;const pct=Math.min(100,((Date.now()-startedAt)/duration)*100);bar.style.width=pct+'%';if(pct>=100)show(activeIndex+1);};
  timer=setInterval(fill,60);
 }
 window.addEventListener('perde:catalog-ready',render);
 window.addEventListener('perde:homepage-refresh',render);
 window.addEventListener('pageshow',render);
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render,{once:true});else render();
})();
