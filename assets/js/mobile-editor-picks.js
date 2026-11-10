/* PERDE — mobile Editor Picks carousel controls */
(function(){
  'use strict';
  const section=document.getElementById('collection-featured');
  if(!section)return;
  section.classList.add('mobile-editor-picks');
  const heading=section.querySelector('.collection-heading');
  const rail=document.getElementById('featured-rail');
  if(!heading||!rail)return;

  if(!heading.querySelector('.editor-picks-controls')){
    const controls=document.createElement('div');
    controls.className='editor-picks-controls';
    controls.setAttribute('role','group');
    controls.setAttribute('aria-label','Editör seçkisi afişleri');
    controls.innerHTML='<button class="editor-picks-arrow" type="button" data-editor-picks-dir="-1" aria-label="Önceki afişler"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button><button class="editor-picks-arrow" type="button" data-editor-picks-dir="1" aria-label="Sonraki afişler"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>';
    heading.appendChild(controls);
  }

  function enhanceCards(){
    rail.querySelectorAll('.featured-number-card').forEach(card=>{
      const poster=card.querySelector('.featured-number-poster');
      if(!poster||poster.querySelector('.editor-picks-watch'))return;
      const button=document.createElement('button');
      button.type='button';
      button.className='editor-picks-watch';
      button.innerHTML='<i class="fa-solid fa-play" aria-hidden="true"></i><span>İzle</span>';
      button.setAttribute('aria-label',(card.querySelector('h3')?.textContent||'Yapımı')+' izle');
      button.addEventListener('click',event=>{
        event.stopPropagation();
        const id=card.getAttribute('data-detail-id');
        if(id&&typeof window.openDetailPage==='function')window.openDetailPage(id);
      });
      poster.appendChild(button);
    });
  }
  enhanceCards();
  new MutationObserver(enhanceCards).observe(rail,{childList:true,subtree:true});

  heading.addEventListener('click',event=>{
    const button=event.target.closest('[data-editor-picks-dir]');
    if(!button)return;
    const direction=Number(button.getAttribute('data-editor-picks-dir'))||1;
    const card=rail.querySelector('.featured-number-card');
    const gap=12;
    const amount=card?card.getBoundingClientRect().width+gap:150;
    rail.scrollBy({left:direction*amount*2,behavior:'smooth'});
  });
})();