/* PERDE — mobile app-style bottom navigation */
(function(){
  'use strict';
  function getPanel(){ return document.getElementById('mobile-category-panel'); }
  function getTrigger(){ return document.querySelector('[data-mobile-categories-toggle]'); }
  function closeMobileCategories(){
    var panel=getPanel(), trigger=getTrigger();
    if(panel) panel.hidden=true;
    if(trigger){trigger.setAttribute('aria-expanded','false');trigger.classList.remove('is-active');}
  }
  function syncMobileNavigation(forcedRoute){
    var hash=(window.location.hash||'').toLowerCase(), route=forcedRoute || 'home';
    if(!forcedRoute){
    if(hash.indexOf('#/filmler')===0) route='filmler';
    else if(hash.indexOf('#/diziler')===0) route='diziler';
    else if(hash.indexOf('#/kesfet')===0) route='kesfet';
    else if(hash.indexOf('#/listem')===0) route='listem';
    }
    document.querySelectorAll('.mobile-bottom-nav [data-mobile-route]').forEach(function(item){
      var active=item.getAttribute('data-mobile-route')===route;
      item.classList.toggle('is-active',active);
      if(active) item.setAttribute('aria-current','page'); else item.removeAttribute('aria-current');
    });
  }
  document.addEventListener('click',function(event){
    var toggle=event.target.closest && event.target.closest('[data-mobile-categories-toggle]');
    if(toggle){
      event.preventDefault();
      var panel=getPanel(), opening=panel && panel.hidden;
      closeMobileCategories();
      if(opening){panel.hidden=false;toggle.setAttribute('aria-expanded','true');toggle.classList.add('is-active');}
      return;
    }
    var option=event.target.closest && event.target.closest('.mobile-category-option');
    if(option){
      closeMobileCategories();
      var trigger=getTrigger();
      if(trigger) trigger.classList.add('is-active');
      return;
    }
    if(!event.target.closest || !event.target.closest('#mobile-category-panel')) closeMobileCategories();
    var item=event.target.closest && event.target.closest('.mobile-bottom-nav [data-mobile-route]');
    var drawerLink=event.target.closest && event.target.closest('.mobile-drawer a[href^="#/"]');
    var routeLink=item && item.matches('a[href^="#/"]') ? item : drawerLink;
    if(!item && !drawerLink) return;
    closeMobileCategories();
    if(item && item.getAttribute('data-mobile-route')==='home'){
      event.preventDefault();
      if(typeof window.showDashboard==='function') window.showDashboard(); else window.location.hash='';
      syncMobileNavigation('home');
      return;
    }
    if(routeLink){
      var nextRoute=routeLink.getAttribute('href');
      event.preventDefault();
      if(window.location.hash===nextRoute){
        if(typeof window.routeFromHash==='function') window.routeFromHash();
      }else{
        window.location.hash=nextRoute;
      }
      if(item) syncMobileNavigation(item.getAttribute('data-mobile-route'));
      return;
    }
    if(item) syncMobileNavigation(item.getAttribute('data-mobile-route'));
  });
  document.addEventListener('keydown',function(event){if(event.key==='Escape') closeMobileCategories();});
  window.addEventListener('hashchange',function(){closeMobileCategories();syncMobileNavigation();});
  window.addEventListener('popstate',function(){closeMobileCategories();syncMobileNavigation();});
  document.addEventListener('DOMContentLoaded',syncMobileNavigation);
  syncMobileNavigation();
})();