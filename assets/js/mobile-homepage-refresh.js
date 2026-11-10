/* PERDE — mobile smart chrome and right drawer; real phones only. */
(function(){
 'use strict';
 var mq=window.matchMedia('(max-width:767px), (orientation:landscape) and (max-height:600px) and (hover:none) and (pointer:coarse)');
 var header=document.querySelector('.site-header'), dock=document.querySelector('.mobile-bottom-nav');
 var drawer=document.getElementById('mobile-drawer'), backdrop=document.getElementById('mobile-drawer-backdrop');
 var lastY=window.scrollY||0, ticking=false, hidden=false;
 function phone(){return mq.matches && !document.documentElement.classList.contains('perde-touch-compact') && !document.documentElement.classList.contains('perde-tv-wide');}
 function chrome(hide){if(!phone()||!header||!dock)return;hidden=hide;header.classList.toggle('is-scroll-hidden',hide);dock.classList.toggle('is-scroll-hidden',hide);}
 function onScroll(){if(ticking)return;ticking=true;requestAnimationFrame(function(){var y=window.scrollY||0,delta=y-lastY;if(y<35)chrome(false);else if(delta>5)chrome(true);else if(delta< -5)chrome(false);lastY=y;ticking=false;});}
 function close(){if(!drawer||!backdrop)return;drawer.classList.remove('is-open');backdrop.classList.remove('is-open');drawer.setAttribute('aria-hidden','true');document.body.style.overflow='';}
 function open(){if(!phone()||!drawer||!backdrop)return;chrome(false);drawer.classList.add('is-open');backdrop.classList.add('is-open');drawer.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';}
 document.addEventListener('click',function(e){if(e.target.closest('[data-mobile-drawer-open]')){e.preventDefault();open();}if(e.target.closest('[data-mobile-drawer-close]')||e.target===backdrop)close();if(e.target.closest('.mobile-drawer a'))close();});
 document.addEventListener('keydown',function(e){if(e.key==='Escape')close();});
 window.addEventListener('scroll',onScroll,{passive:true});window.addEventListener('resize',function(){if(!phone()){chrome(false);close();}});
 if(header&&!header.querySelector('[data-mobile-drawer-open]')){var b=document.createElement('button');b.type='button';b.className='mobile-header-menu-trigger';b.setAttribute('data-mobile-drawer-open','');b.setAttribute('aria-label','Menüyü aç');b.innerHTML='<i class="fa-solid fa-bars" aria-hidden="true"></i>';header.querySelector('.header-actions')?.appendChild(b);}
})();
