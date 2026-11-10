/* PERDE — mobile smart chrome and right drawer; real phones only. */
(function(){
 'use strict';
 var mq=window.matchMedia('(max-width:767px), (orientation:landscape) and (max-height:600px) and (hover:none) and (pointer:coarse)');
 var header=document.querySelector('.site-header'), dock=document.querySelector('.mobile-bottom-nav');
 var drawer=document.getElementById('mobile-drawer'), backdrop=document.getElementById('mobile-drawer-backdrop');
 function menuTrigger(){return document.querySelector('[data-mobile-drawer-open]');}
 var lastY=window.scrollY||0, ticking=false, hidden=false, lastFocus=null, previousBodyOverflow='';
 function phone(){var root=document.documentElement;var screenWidth=window.screen&&window.screen.width||0;var viewportWidth=Math.max(window.innerWidth||0,root.clientWidth||0);var desktopRequested=screenWidth>0&&viewportWidth>screenWidth+48;return mq.matches && root.classList.contains('perde-phone-device') && !desktopRequested && !root.classList.contains('perde-touch-compact') && !root.classList.contains('perde-tv-wide');}
 function syncMode(){document.documentElement.classList.toggle('perde-mobile-refresh-active',phone());if(!phone()){chrome(false);close();}}
 function chrome(hide){if(!phone()||!header||!dock)return;hidden=hide;header.classList.toggle('is-scroll-hidden',hide);dock.classList.toggle('is-scroll-hidden',hide);}
 function onScroll(){if(ticking)return;ticking=true;requestAnimationFrame(function(){var y=window.scrollY||0,delta=y-lastY;if(y<35)chrome(false);else if(delta>5)chrome(true);else if(delta< -5)chrome(false);lastY=y;ticking=false;});}
 function close(){
  if(!drawer||!backdrop)return;
  var wasOpen=drawer.classList.contains('is-open');
  drawer.classList.remove('is-open');backdrop.classList.remove('is-open');
  drawer.setAttribute('aria-hidden','true');drawer.removeAttribute('aria-modal');
  var trigger=menuTrigger();if(trigger)trigger.setAttribute('aria-expanded','false');
  if(wasOpen){document.body.style.overflow=previousBodyOverflow;if(lastFocus&&typeof lastFocus.focus==='function')lastFocus.focus();}
 }
 function open(){
  if(!phone()||!drawer||!backdrop)return;
  chrome(false);lastFocus=document.activeElement;previousBodyOverflow=document.body.style.overflow;
  drawer.classList.add('is-open');backdrop.classList.add('is-open');
  drawer.setAttribute('aria-hidden','false');drawer.setAttribute('aria-modal','true');
  var trigger=menuTrigger();if(trigger)trigger.setAttribute('aria-expanded','true');
  document.body.style.overflow='hidden';
  var first=drawer.querySelector('button,a');if(first)first.focus();
 }
 document.addEventListener('click',function(e){if(e.target.closest('[data-mobile-drawer-open]')){e.preventDefault();open();}if(e.target.closest('[data-mobile-drawer-close]')||e.target===backdrop)close();if(e.target.closest('.mobile-drawer a')||e.target.closest('.mobile-drawer button'))close();});
 document.addEventListener('keydown',function(e){if(e.key==='Escape')close();});
 window.addEventListener('scroll',onScroll,{passive:true});window.addEventListener('resize',syncMode);window.addEventListener('orientationchange',syncMode);
 syncMode();
 if(header&&!header.querySelector('[data-mobile-drawer-open]')){var b=document.createElement('button');b.type='button';b.className='mobile-header-menu-trigger';b.setAttribute('data-mobile-drawer-open','');b.setAttribute('aria-label','Menüyü aç');b.setAttribute('aria-controls','mobile-drawer');b.setAttribute('aria-expanded','false');b.innerHTML='<i class="fa-solid fa-bars" aria-hidden="true"></i>';header.querySelector('.header-actions')?.appendChild(b);}
})();
