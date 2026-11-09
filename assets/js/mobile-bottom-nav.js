/* PERDE — mobile app-style bottom navigation */
(function(){
  'use strict';
  function syncMobileNavigation(){
    var hash=(window.location.hash||'').toLowerCase();
    var route='home';
    if(hash.indexOf('#/filmler')===0) route='filmler';
    else if(hash.indexOf('#/diziler')===0) route='diziler';
    else if(hash.indexOf('#/kesfet')===0) route='kesfet';
    else if(hash.indexOf('#/listem')===0) route='listem';
    document.querySelectorAll('.mobile-bottom-nav [data-mobile-route]').forEach(function(item){
      var active=item.getAttribute('data-mobile-route')===route;
      item.classList.toggle('is-active',active);
      if(active) item.setAttribute('aria-current','page'); else item.removeAttribute('aria-current');
    });
  }
  document.addEventListener('click',function(event){
    var item=event.target.closest('.mobile-bottom-nav [data-mobile-route]');
    if(!item) return;
    if(item.getAttribute('data-mobile-route')==='home'){
      event.preventDefault();
      if(typeof window.showDashboard==='function') window.showDashboard();
      else window.location.hash='';
    }
    syncMobileNavigation();
  });
  window.addEventListener('hashchange',syncMobileNavigation);
  document.addEventListener('DOMContentLoaded',syncMobileNavigation);
  syncMobileNavigation();
})();
