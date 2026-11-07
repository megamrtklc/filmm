const CACHE_NAME='ny7-shell-v7';
const CORE=['./','./index.html','./manifest.json','./assets/css/style.css','./assets/js/bundle.js','./assets/icons/ny7-icon.svg','./data/catalog.json'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key.startsWith('ny7-')&&key!==CACHE_NAME).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;

  // HTML, JavaScript, CSS ve katalog önce ağdan alınır; ağ yoksa son sağlam kopya kullanılır.
  const isCatalog=url.pathname.endsWith('/data/catalog.json');
  const isAppAsset=request.mode==='navigate'||/\.(?:js|css|json|svg|webmanifest)$/.test(url.pathname);
  if(!isCatalog&&!isAppAsset)return;

  event.respondWith(
    fetch(request,{cache:'no-store'}).then(response=>{
      if(response.ok){
        const copy=response.clone();
        caches.open(CACHE_NAME).then(cache=>cache.put(request,copy));
      }
      return response;
    }).catch(async()=>{
      const cached=await caches.match(request,{ignoreSearch:isCatalog});
      if(cached)return cached;
      if(request.mode==='navigate')return caches.match('./index.html');
      return new Response('İçerik şu anda yüklenemiyor. Lütfen bağlantınızı kontrol edip yeniden deneyin.',{
        status:503,
        headers:{'Content-Type':'text/plain; charset=utf-8'}
      });
    })
  );
});
