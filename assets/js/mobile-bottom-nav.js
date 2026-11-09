/* PERDE — mobile app-style bottom navigation */
(function(){
  'use strict';
  function closeMobileCategories(){
    var panel=document.getElementById('mobile-category-panel');
    var trigger=document.querySelector('[data-mobile-categories-toggle]');
    if(panel) panel.hidden=true;
    if(trigger) trigger.setAttribute('aria-expanded','false');
  }
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
    var toggle=event.target.closest('[data-mobile-categories-toggle]');
    if(toggle){
      event.preventDefault();
      var panel=document.getElementById('mobile-category-panel');
      var open=panel && panel.hidden;
      closeMobileCategories();
      if(panel && open){ panel.hidden=false; toggle.setAttribute('aria-expanded','true'); }
      return;
    }
    var option=event.target.closest('.mobile-category-option');
    if(option){
      closeMobileCategories();
      document.querySelectorAll('.mobile-bottom-nav .mobile-nav-item').forEach(function(item){item.classList.remove('is-active');item.removeAttribute('aria-current');});
      var categoryTrigger=document.querySelector('[data-mobile-categories-toggle]');
      if(categoryTrigger) categoryTrigger.classList.add('is-active');
      return;
    }
    if(!event.target.closest('.mobile-category-panel')) closeMobileCategories();
    var item=event.target.closest('.mobile-bottom-nav [data-mobile-route]');
    if(!item) return;
    closeMobileCategories();
    if(item.getAttribute('data-mobile-route')==='home'){
      event.preventDefault();
      if(typeof window.showDashboard==='function') window.showDashboard();
      else window.location.hash='';
    }
    syncMobileNavigation();
  });
  window.addEventListener('hashchange',function(){closeMobileCategories();syncMobileNavigation();});
  document.addEventListener('DOMContentLoaded',syncMobileNavigation);
  syncMobileNavigation();
})();