/* Perde homepage interactions: continue watching. Existing watch data is read-only. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const safe=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 function read(key,fallback){try{const value=JSON.parse(localStorage.getItem(key)||'null');return value&&typeof value==='object'?value:fallback;}catch(_){return fallback;}}
 function render(){
  const section=$('continue-watching-section'),rail=$('continue-watching-rail');
  if(!section||!rail||typeof mediaDatabase==='undefined'||!Array.isArray(mediaDatabase))return;
  const progress=read('perde_player_progress_v3',{});
  const diary=read('perde_series_diary_v1',{});
  const items=[];
  mediaDatabase.forEach(item=>{
   if(!item||item.id==null||!item.title)return;
   if(item.type==='movie'){
    const saved=progress[String(item.id)];
    if(!saved||!(Number(saved.time)>10)||!(Number(saved.duration)>0))return;
    const percent=Math.max(1,Math.min(99,Math.round(Number(saved.time)/Number(saved.duration)*100)));
    if(percent>=96)return;
    items.push({item,type:'movie',savedAt:Number(saved.savedAt)||0,percent,meta:Math.floor(Number(saved.time)/60)+' dk / '+Math.floor(Number(saved.duration)/60)+' dk',action:'movie'});
   }else if(item.type==='tv'){
    const entry=diary[String(item.id)];
    if(!entry||!['watching','paused'].includes(entry.status))return;
    const watched=Array.isArray(entry.watched)?entry.watched.length:0;
    const episodeRows=Object.entries(progress).filter(([key,value])=>key.startsWith('series:'+String(item.id)+':')&&Number(value?.time)>10&&Number(value?.duration)>0).sort((a,b)=>(Number(b[1].savedAt)||0)-(Number(a[1].savedAt)||0));
    const latest=episodeRows[0];
    if(!latest&&!watched)return;
    const match=latest?.[0].match(/:s(\d+)e(\d+)$/);
    const total=Math.max(0,Number(item.episodes)||0);
    const percent=total?Math.min(99,Math.round(watched/total*100)):0;
    const meta=match?'S'+match[1]+' · B'+match[2]+'  /  '+watched+' bölüm izlendi':watched+' bölüm izlendi';
    items.push({item,type:'tv',savedAt:Number(latest?.[1]?.savedAt)||0,percent,meta,action:'series'});
   }
  });
  items.sort((a,b)=>b.savedAt-a.savedAt);
  const visible=items.slice(0,10);
  if(!visible.length){section.hidden=true;rail.replaceChildren();return;}
  section.hidden=false;
  rail.innerHTML=visible.map(row=>{
   const image=safe(row.item.backdrop||row.item.image||'');
   const title=safe(row.item.title);
   const label=row.type==='movie'?'FİLM':'DİZİ';
   return '<button type="button" class="continue-card" data-continue-action="'+row.action+'" data-media-id="'+safe(row.item.id)+'" aria-label="'+title+' içeriğine devam et">'+
    '<img class="continue-card-bg" src="'+image+'" alt="" loading="lazy">'+
    '<span class="continue-card-copy"><span class="continue-card-type">'+label+'</span><h3>'+title+'</h3><span class="continue-card-meta">'+safe(row.meta)+'</span>'+
    (row.percent?'<span class="continue-progress" aria-label="%'+row.percent+' tamamlandı"><i style="width:'+row.percent+'%"></i></span>':'')+
    '<span class="continue-card-action"><i class="fa-solid fa-play"></i>'+(row.action==='movie'?'Kaldığın yerden izle':'Diziye dön')+'</span></span></button>';
  }).join('');
 }
 document.addEventListener('click',event=>{
  const card=event.target.closest('[data-continue-action]');
  if(!card)return;
  const id=card.dataset.mediaId;
  if(card.dataset.continueAction==='movie'&&typeof window.openPlayerForMedia==='function')window.openPlayerForMedia(id);
  else if(typeof window.openDetailPage==='function')window.openDetailPage(id);
 });
 window.addEventListener('perde:catalog-ready',render);
 window.addEventListener('perde:homepage-refresh',render);
 window.addEventListener('storage',event=>{if(!event.key||event.key.startsWith('perde_'))render();});
 window.addEventListener('pageshow',render);
})();
