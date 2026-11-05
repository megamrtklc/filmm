const CACHE_NAME='ny7-shell-v1';
const CORE=['./','./index.html','./manifest.json','./assets/css/style.css','./assets/js/bundle.js','./assets/icons/ny7-icon.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('ny7-')&&key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const request=event.request;if(request.method!=='GET')return;
 const url=new URL(request.url);if(url.origin!==self.location.origin)return;
 if(request.mode==='navigate'){
  event.respondWith(fetch(request).then(response=>{const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put('./index.html',copy));return response;}).catch(()=>caches.match('./index.html')));return;
 }
 if(url.pathname.endsWith('/data/catalog.json')){
  event.respondWith(fetch(request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(request,copy));}return response;}).catch(()=>caches.match(request)));return;
 }
 event.respondWith(caches.match(request).then(cached=>{
  const network=fetch(request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(request,copy));}return response;});
  return cached||network;
 }));
});
