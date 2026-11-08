// Favoriler ve izleme listesi yönetimi
function readNY7Storage(key,fallback=[]){try{const value=JSON.parse(localStorage.getItem(key)||'null');return Array.isArray(value)?value:fallback;}catch(_){return fallback;}}
function writeNY7Storage(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch(error){console.warn('NY7 yerel kayıt yapılamadı:',error);return false;}}
let favorites = readNY7Storage('ny7_favorites');
        let watchlist = readNY7Storage('ny7_watchlist');
        let heroCurrentId = 1;
        let heroCurrentTitle = 'THE BATMAN';
let heroImageSwapTimer = null;

// Orijinal/İngilizce yapım adları: TMDB kimlikleri üzerinden Wikidata'dan doğrulanarak yüklenir.
function normalizeMediaSearchText(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[ıİ]/g,'i').toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/g,' ').trim();}
function mediaSearchText(item){return [item?.title,item?.originalTitle,item?.englishTitle,item?.original_name,item?.original_title,...(item?.searchAliases||[]),...(item?.aliases||[])].filter(Boolean).map(normalizeMediaSearchText).join(' | ');}
function originalTitleMarkup(item,extraClass=''){const id=escapeCountryHtml(item?.id??'');return '<small class="media-original-title '+extraClass+'" data-original-title-for="'+id+'"'+(item?.originalTitle?'':' hidden')+'>'+escapeCountryHtml(item?.originalTitle||'')+'</small>';}
function syncOriginalTitleLabels(){
 document.querySelectorAll('[data-original-title-for]').forEach(node=>{const item=mediaDatabase.find(entry=>String(entry.id)===String(node.dataset.originalTitleFor));node.textContent=item?.originalTitle||'';node.hidden=!item?.originalTitle;});
 const heroItem=mediaDatabase.find(item=>String(item.id)===String(heroCurrentId)),heroOriginal=document.getElementById('hero-original-title');
 if(heroOriginal){heroOriginal.textContent=heroItem?.originalTitle||'';heroOriginal.hidden=!heroItem?.originalTitle;}
 const detailTitle=document.getElementById('detail-original-title');
 if(detailTitle){const item=mediaDatabase.find(entry=>String(entry.id)===String(detailTitle.dataset.mediaId));detailTitle.textContent=item?.originalTitle||'';detailTitle.hidden=!item?.originalTitle;}
}
async function loadOriginalTitles(){
 if(!Array.isArray(mediaDatabase)||!mediaDatabase.length)return;
 // v2 cache: eski Wikidata eşleşmeleri kullanılmaz; yalnızca eserin kendi dilindeki P1476 başlığı kabul edilir.
 const cacheKey='ny7_original_titles_v2';
 let cached={};try{cached=JSON.parse(localStorage.getItem(cacheKey)||'{}')||{};}catch(_){}
 const apply=(id,value)=>{
  const item=mediaDatabase.find(entry=>String(entry.tmdbId)===String(id));if(!item)return;
  const candidate=String(value?.title||'').trim();
  if(candidate&&normalizeMediaSearchText(candidate)!==normalizeMediaSearchText(item.title)){
   item.originalTitle=candidate;
   item.searchAliases=[...new Set([...(item.searchAliases||[]),candidate])];
  }else delete item.originalTitle;
 };
 Object.entries(cached).forEach(([id,value])=>apply(id,value));syncOriginalTitleLabels();
 const missing=mediaDatabase.filter(item=>item.tmdbId&&!Object.prototype.hasOwnProperty.call(cached,String(item.tmdbId)));
 for(let start=0;start<missing.length;start+=30){
  const ids=[...new Set(missing.slice(start,start+30).map(item=>String(item.tmdbId)))],values=ids.map(id=>'"'+id.replace(/[^0-9]/g,'')+'"').join(' ');
  // P407 eserin dili, P218 ISO 639-1 kodudur. P1476 yalnızca aynı dildeyse kabul edilir.
  const query='SELECT ?id ?title WHERE { VALUES ?id { '+values+' } ?item (wdt:P4947|wdt:P4983) ?id . ?item wdt:P407 ?workLanguage . ?workLanguage wdt:P218 ?langCode . ?item wdt:P1476 ?title . FILTER(LANG(?title)=?langCode) }';
  try{
   const response=await fetch('https://query.wikidata.org/sparql?query='+encodeURIComponent(query)+'&format=json',{headers:{Accept:'application/sparql-results+json'}});
   if(!response.ok)throw new Error('Wikidata HTTP '+response.status);
   const payload=await response.json(),grouped={};
   (payload.results?.bindings||[]).forEach(row=>{const id=row.id?.value;if(!id||!row.title?.value)return;const title=row.title.value.trim();if(title)(grouped[id]||(grouped[id]=[])).push(title);});
   ids.forEach(id=>{
    const titles=[...new Set(grouped[id]||[])];
    const chosen=titles.length===1?titles[0]:'';
    cached[id]=chosen?{title:chosen}:null;
    apply(id,cached[id]);
   });
   try{localStorage.setItem(cacheKey,JSON.stringify(cached));}catch(_){}
   syncOriginalTitleLabels();if(headerSearchInput?.value)renderHeaderSearchResults(headerSearchInput.value);
  }catch(error){console.warn('Doğrulanmış orijinal yapım adları yüklenemedi:',error);}
 }
}

        function toggleFavorite(id, e) {
            if (e) e.stopPropagation();
            if (favorites.includes(id)) {
                favorites = favorites.filter(favId => favId !== id);
            } else {
                favorites.push(id);
            }
            writeNY7Storage('ny7_favorites',favorites);
            renderMediaGrid();
            if (document.getElementById('detail-fav-btn')) updateDetailButtons(id);
        }

        function toggleWatchlist(id, e) {
            if (e) e.stopPropagation();
            if (watchlist.includes(id)) {
                watchlist = watchlist.filter(wId => wId !== id);
            } else {
                watchlist.push(id);
            }
            writeNY7Storage('ny7_watchlist',watchlist);
            renderMediaGrid();
            if (document.getElementById('detail-watch-btn')) updateDetailButtons(id);
        }

        function updateDetailButtons(id) {
            const isFav = favorites.includes(id);
            const isWatch = watchlist.includes(id);
            
            const favBtn = document.getElementById('detail-fav-btn');
            const watchBtn = document.getElementById('detail-watch-btn');

            favBtn.innerHTML = `<i class="${isFav ? 'fa-solid text-brand-red' : 'fa-regular'} fa-heart"></i>`;
            favBtn.onclick = (e) => toggleFavorite(id, e);

            watchBtn.innerHTML = `<i class="${isWatch ? 'fa-solid text-brand-yellow' : 'fa-regular'} fa-bookmark"></i>`;
            watchBtn.onclick = (e) => toggleWatchlist(id, e);
        }


// Ana sayfa öne çıkan içerik ve slider işlemleri
function fitHeroTitleToWidth() {
            const title = document.getElementById('hero-title');
            if (!title) return;
            title.style.removeProperty('font-size');
            title.style.whiteSpace = 'normal';
        }
        window.addEventListener('resize', fitHeroTitleToWidth);

        function setHeroMedia(id, userAction = false) {
            const item = mediaDatabase.find(m => m.id === id) || mediaDatabase[0];
            const idx = heroItems.findIndex(m => m.id === item.id);
            if (idx >= 0) heroIndex = idx;
            heroCurrentId = item.id; heroCurrentTitle = item.title;
            const section = document.getElementById('hero-section');
            const bg = document.getElementById('hero-bg');
            if (heroImageSwapTimer) window.clearTimeout(heroImageSwapTimer);
            section.classList.add('is-changing');
            heroImageSwapTimer = window.setTimeout(() => { bg.src = item.tmdbBackdrop || item.backdrop || item.tmdbPoster || item.image; bg.alt = item.title; section.classList.remove('is-changing'); heroImageSwapTimer = null; }, 150);
            const typeBadge = document.getElementById('hero-type-badge');
            if (typeBadge) typeBadge.innerHTML = item.type === 'tv' ? '<i class="fa-solid fa-tv" aria-hidden="true"></i><span>DİZİ</span>' : '<i class="fa-solid fa-film" aria-hidden="true"></i><span>FİLM</span>';
            const heroPresentation = heroPresentationById[String(item.id)] || {};
            document.getElementById('hero-title').innerText = heroPresentation.headline || item.title;
            let heroOriginal = document.getElementById('hero-original-title');
            if (!heroOriginal) { heroOriginal = document.createElement('small'); heroOriginal.id = 'hero-original-title'; heroOriginal.className = 'media-original-title hero-original-title'; document.getElementById('hero-title').after(heroOriginal); }
            heroOriginal.textContent = item.originalTitle || ''; heroOriginal.hidden = !item.originalTitle;
            fitHeroTitleToWidth();
            const ratings = document.getElementById('hero-ratings');
            const ratingValue = value => value !== undefined && value !== null && String(value).trim() !== '' ? value : '—';
            ratings.innerHTML = `
                <span class="hero-rating-badge imdb"><b>IMDb</b><strong>${ratingValue(item.rating)}</strong></span>
                <span class="hero-rating-badge tmdb"><b class="tmdb-mark">TMDB</b><strong>${ratingValue(item.tmdbRating)}</strong></span>
`;
            const runtime = item.type === 'tv'
                ? [item.tmdbSeasons || item.seasons ? `${item.tmdbSeasons || item.seasons} sezon` : '', item.tmdbEpisodes || item.episodes ? `${item.tmdbEpisodes || item.episodes} bölüm` : '', item.tmdbRuntime || item.duration || ''].filter(Boolean).join(' • ')
                : (item.tmdbRuntime || item.duration || '');
            const meta = document.getElementById('hero-meta');
            meta.replaceChildren();
            const metaItems = [
                { icon: 'fa-calendar-days', value: String(item.tmdbReleaseDate || '').slice(0,4) || item.year },
                { icon: item.type === 'tv' ? 'fa-tv' : 'fa-film', value: item.type === 'tv' ? 'Dizi' : 'Film' },
                { icon: 'fa-clock', value: runtime },
                { icon: 'fa-tags', value: item.tmdbGenres || item.category }
            ].filter(entry => entry.value !== undefined && entry.value !== null && String(entry.value).trim() !== '');
            metaItems.forEach((entry, index) => {
                if (index) {
                    const separator = document.createElement('span');
                    separator.className = 'hero-meta-separator';
                    separator.setAttribute('aria-hidden', 'true');
                    separator.textContent = '·';
                    meta.appendChild(separator);
                }
                const part = document.createElement('span');
                part.className = 'hero-meta-item';
                const icon = document.createElement('i');
                icon.className = 'fa-solid ' + entry.icon;
                icon.setAttribute('aria-hidden', 'true');
                const label = document.createElement('span');
                label.textContent = String(entry.value);
                part.append(icon, label);
                meta.appendChild(part);
            });
            document.getElementById('hero-desc').innerText = heroPresentation.description || item.tmdbOverview || item.desc || '';
            document.querySelectorAll('.hero-thumb').forEach((el,i) => {
                const active = heroItems[i]?.id === item.id;
                el.classList.toggle('active',active); el.setAttribute('aria-pressed',String(active));
            });
            const activeThumb = document.querySelector('#hero-thumbnails-rail .hero-thumb.active');
            const thumbnailRail = document.getElementById('hero-thumbnails-rail');
            if (activeThumb && thumbnailRail) {
                const targetLeft = activeThumb.offsetLeft - (thumbnailRail.clientWidth - activeThumb.clientWidth) / 2;
                thumbnailRail.scrollTo({left:Math.max(0,targetLeft),behavior:'smooth'});
            }
            if (userAction) restartHeroTimer();
        }
        function getHeroTrailerId(url){
            const value=String(url||'');
            const match=value.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
            return match?match[1]:'';
        }
        function applyTrailerAmbilight(item){
            const frame=document.querySelector('.trailer-popup-poster-frame');
            const player=document.getElementById('trailer-popup-player');
            if(!frame||!player)return;
            const mediaId=String(item.id);
            [frame,player].forEach(el=>{
                el.dataset.ambilightMediaId=mediaId;
                el.dataset.ambilightReady='false';
                ['--trailer-tone-1','--trailer-tone-2','--trailer-tone-3'].forEach(name=>el.style.removeProperty(name));
            });
            const imageUrl=item.image||item.poster;
            if(!imageUrl)return;
            const source=String(imageUrl).replace(/^https?:\/\//,'');
            const sample=new Image();
            sample.crossOrigin='anonymous';
            sample.onload=()=>{
                if(frame.dataset.ambilightMediaId!==mediaId||player.dataset.ambilightMediaId!==mediaId)return;
                try{
                    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
                    if(!ctx)throw new Error('Canvas unavailable');
                    canvas.width=72;canvas.height=108;
                    const scale=Math.min(72/sample.naturalWidth,108/sample.naturalHeight);
                    const w=Math.max(1,Math.round(sample.naturalWidth*scale)),h=Math.max(1,Math.round(sample.naturalHeight*scale));
                    ctx.fillStyle='#555';ctx.fillRect(0,0,72,108);
                    ctx.drawImage(sample,Math.round((72-w)/2),Math.round((108-h)/2),w,h);
                    const pixels=ctx.getImageData(0,0,72,108).data,buckets=new Map();
                    for(let i=0;i<pixels.length;i+=4){
                        const r=pixels[i],g=pixels[i+1],b=pixels[i+2],max=Math.max(r,g,b),min=Math.min(r,g,b),light=(r+g+b)/3;
                        if(pixels[i+3]<180||light<12||light>248)continue;
                        const key=[r>>5,g>>5,b>>5].join(',');
                        let bucket=buckets.get(key);
                        if(!bucket){bucket={r:0,g:0,b:0,n:0};buckets.set(key,bucket);}
                        bucket.r+=r;bucket.g+=g;bucket.b+=b;bucket.n++;
                    }
                    const colors=[...buckets.values()].sort((a,b)=>b.n-a.n).map(v=>[Math.round(v.r/v.n),Math.round(v.g/v.n),Math.round(v.b/v.n)]);
                    const chosen=[];
                    for(const color of colors){
                        if(chosen.every(other=>Math.hypot(color[0]-other[0],color[1]-other[1],color[2]-other[2])>48))chosen.push(color);
                        if(chosen.length===3)break;
                    }
                    if(!chosen.length)throw new Error('No poster colors');
                    [frame,player].forEach(el=>{
                        chosen.forEach((color,index)=>el.style.setProperty('--trailer-tone-'+(index+1),color.join(',')));
                        el.dataset.ambilightReady='true';
                    });
                }catch(error){
                    [frame,player].forEach(el=>el.dataset.ambilightReady='false');
                }
            };
            sample.onerror=()=>[frame,player].forEach(el=>el.dataset.ambilightReady='false');
            sample.src='https://images.weserv.nl/?url='+encodeURIComponent(imageUrl.replace(/^https?:\/\//,''))+'&w=72&h=108&fit=inside&output=jpg';
        }
        function openTrailerPopup(id){
            const item=mediaDatabase.find(entry=>String(entry.id)===String(id));
            const popup=document.getElementById('trailer-popup'),player=document.getElementById('trailer-popup-player'),title=document.getElementById('trailer-popup-title');
            if(!item||!popup||!player)return;
            const setText=(elementId,value,fallback='—')=>{const el=document.getElementById(elementId);if(el)el.textContent=value!==undefined&&value!==null&&String(value).trim()!==''?String(value):fallback;};
            title.textContent=item.title+' — Fragman';
            const poster=document.getElementById('trailer-popup-poster');
            if(poster){poster.src=item.image||item.poster||'';poster.alt=item.title+' afişi';poster.onerror=()=>{poster.style.visibility='hidden';};poster.style.visibility='visible';}
            applyTrailerAmbilight(item);
            setText('trailer-popup-year',item.year);
            setText('trailer-popup-type',item.type==='tv'?'Dizi':'Film');
            setText('trailer-popup-duration',item.type==='tv'?[(item.seasons||item.tmdbSeasons)?(item.seasons||item.tmdbSeasons)+' sezon':'',(item.episodes||item.tmdbEpisodes)?(item.episodes||item.tmdbEpisodes)+' bölüm':''].filter(Boolean).join(' • '):(item.duration||item.tmdbRuntime));
            setText('trailer-popup-category',item.tmdbGenres||item.category||item.genre,'Kategori bilgisi yok');
            setText('trailer-popup-rating',item.rating,'—');
            setText('trailer-popup-desc',item.desc||item.tmdbOverview,'Bu yapım için konu özeti henüz eklenmemiş.');
            const credits=document.getElementById('trailer-popup-credits');
            if(credits){
                credits.innerHTML='';
                const addCredit=(label,names)=>{
                    const values=(Array.isArray(names)?names:[names]).filter(value=>value!==undefined&&value!==null&&String(value).trim()).slice(0,label==='OYUNCULAR'?5:1);
                    if(!values.length)return;
                    const row=document.createElement('div');row.className='trailer-popup-credit-row';
                    const heading=document.createElement('span');heading.textContent=label;row.appendChild(heading);
                    const value=document.createElement('p');value.textContent=values.join(' · ');row.appendChild(value);
                    credits.appendChild(row);
                };
                addCredit('YÖNETMEN',item.director||item.tmdbDirector);
                addCredit('OYUNCULAR',item.cast||item.tmdbCast);
                credits.hidden=!credits.children.length;
            }
            const videoId=getHeroTrailerId(item.trailerUrl||item.tmdbTrailerUrl);
            player.innerHTML=videoId?'<iframe title="'+escapeCountryHtml(item.title)+' fragmanı" src="https://www.youtube-nocookie.com/embed/'+videoId+'?autoplay=1&rel=0&modestbranding=1" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>':'<div class="trailer-popup-empty"><i class="fa-solid fa-circle-exclamation"></i><span>Bu yapım için kullanılabilir bir fragman bağlantısı bulunamadı.</span></div>';
            applyTrailerAmbilight(item);
            popup.classList.add('is-open');popup.setAttribute('aria-hidden','false');document.body.classList.add('trailer-popup-open');
            popup.querySelector('button[aria-label="Pencereyi kapat"]')?.focus();
        }
        function closeTrailerPopup(){
            const popup=document.getElementById('trailer-popup');if(!popup)return;
            popup.classList.remove('is-open');popup.setAttribute('aria-hidden','true');
            const player=document.getElementById('trailer-popup-player');if(player)player.innerHTML='';
            document.body.classList.remove('trailer-popup-open');
        }
        window.openTrailerPopup=openTrailerPopup;
        window.closeTrailerPopup=closeTrailerPopup;
        function renderHeroThumbnails() {
            const rail = document.getElementById('hero-thumbnails-rail');
            if (rail) {
                rail.onmouseenter = () => { if(!heroSettings.pauseOnHover)return; heroRailHovered = true; if (heroTimer) clearInterval(heroTimer); heroTimer = null; };
                rail.onmouseleave = () => { if(!heroSettings.pauseOnHover)return; heroRailHovered = false; restartHeroTimer(); };
            }
            applyHeroDisplaySettings();
            rail.innerHTML = heroItems.map((m,i) => `
                <button type="button" onclick="setHeroMedia('${m.id}',true)" onmouseenter="setHeroMedia('${m.id}',true)" class="hero-thumb ${i===heroIndex?'active':''}" aria-label="${m.title}" aria-pressed="${i===heroIndex}">
                    <img src="${m.tmdbPoster || m.image}" alt="${m.title}" loading="lazy"><span>${m.title}</span>${originalTitleMarkup(m,'hero-thumb-original')}
                </button>`).join('');
        }
        function stepHero(direction) {
            if (!Array.isArray(heroItems) || heroItems.length < 2) return;
            const step = Number(direction);
            if (step !== -1 && step !== 1) return;
            heroIndex = (heroIndex + step + heroItems.length) % heroItems.length;
            const nextItem = heroItems[heroIndex];
            if (nextItem) setHeroMedia(nextItem.id, true);
        }
        // Ok tıklamalarını belge seviyesinde yakala: DOM yeniden çizilse de olay bağlantısı kaybolmaz.
        window.stepHero = stepHero;
        if (!window.__heroArrowDelegationBound) {
            document.addEventListener('click', event => {
                const button = event.target.closest('#hero-section [data-hero-direction]');
                if (!button) return;
                event.preventDefault();
                event.stopPropagation();
                stepHero(button.getAttribute('data-hero-direction'));
            }, true);
            window.__heroArrowDelegationBound = true;
        }
        function restartHeroTimer() {
            if(heroTimer) clearInterval(heroTimer);
            heroTimer = null;
            if (!heroSettings.autoplay || (heroSettings.pauseOnHover && heroRailHovered)) return;
            heroTimer=setInterval(()=>{if((!heroSettings.pauseOnHover || !heroRailHovered) && !document.hidden && document.getElementById('detail-page-view').classList.contains('hidden')) stepHero(1);},heroSettings.interval*1000);
        }



// MODUNA GÖRE KEŞFET — sıfırdan minimal arayüz, tek ruh hali seçimi.
const moodCategoryOptions = [
    { value:'Aksiyon', label:'Aksiyon', icon:'fa-bolt', terms:['aksiyon'] },
    { value:'Komedi', label:'Komedi', icon:'fa-face-laugh', terms:['komedi','comedy'] },
    { value:'Romantik', label:'Romantik', icon:'fa-heart', terms:['romantik','romance'] },
    { value:'Korku', label:'Korku', icon:'fa-ghost', terms:['korku','horror'] },
    { value:'Gerilim', label:'Gerilim', icon:'fa-eye', terms:['gerilim','thriller'] },
    { value:'Gizem', label:'Gizem', icon:'fa-magnifying-glass', terms:['gizem','mystery'] },
    { value:'Bilim Kurgu', label:'Bilim Kurgu', icon:'fa-robot', terms:['bilim kurgu','bilim-kurgu','science fiction','sci-fi'] },
    { value:'Macera', label:'Macera', icon:'fa-compass', terms:['macera','adventure'] },
    { value:'Dram', label:'Dram', icon:'fa-masks-theater', terms:['dram','drama'] },
    { value:'Fantastik', label:'Fantastik', icon:'fa-wand-magic-sparkles', terms:['fantastik','fantasy','fantazi'] },
    { value:'Tarih', label:'Tarih', icon:'fa-landmark', terms:['tarih','history'] },
    { value:'Belgesel', label:'Belgesel', icon:'fa-clapperboard', terms:['belgesel','documentary'] },
    { value:'Animasyon', label:'Animasyon', icon:'fa-wand-magic', terms:['animasyon','animation'] },
    { value:'Aile', label:'Aile', icon:'fa-people-group', terms:['aile','family'] },
    { value:'Suç', label:'Suç', icon:'fa-user-secret', terms:['suç','crime'] },
    { value:'Savaş & Politik', label:'Savaş & Politik', icon:'fa-shield-halved', terms:['savaş','politik','war'] },
    { value:'Müzik', label:'Müzik', icon:'fa-music', terms:['müzik','music'] },
    { value:'Vahşi Batı', label:'Vahşi Batı', icon:'fa-hat-cowboy', terms:['vahşi batı','western'] }
];
let activeMoodCategory = '';
let lastMoodRecommendationId = null;
let moodShowAll = false;

function getMoodCandidates(category) {
    const valid = mediaDatabase.filter(item => item && item.id != null && item.title && item.image);
    const config = moodCategoryOptions.find(option => option.value === category);
    if (!config) return [];
    return valid.filter(item => {
        const tags = ((item.genre || '') + ' / ' + (item.category || '')).toLocaleLowerCase('tr-TR');
        return config.terms.some(term => tags.includes(term.toLocaleLowerCase('tr-TR')));
    });
}

function renderMoodDiscovery(recommendation = null) {
    const result = document.getElementById('mood-discovery-result');
    if (!result) return;
    const visibleOptions = moodShowAll ? moodCategoryOptions : moodCategoryOptions.slice(0,6);
    const choices = visibleOptions.map(option => {
        const selected = activeMoodCategory === option.value;
        return '<button type="button" class="mood-v2-choice'+(selected?' is-selected':'')+'" onclick="chooseMoodPick(\''+option.value.replace(/'/g,"\\'")+'\')" aria-pressed="'+selected+'"><i class="fa-solid '+option.icon+'" aria-hidden="true"></i><span>'+option.label+'</span><i class="fa-solid fa-check mood-v2-check" aria-hidden="true"></i></button>';
    }).join('');
    const selectedLabel = moodCategoryOptions.find(option => option.value === activeMoodCategory)?.label || '';
    let recommendationMarkup = '';
    if (recommendation) {
        const title = escapeCountryHtml(recommendation.title || 'İsimsiz yapım');
        const poster = escapeCountryHtml(recommendation.image || '');
        const id = String(recommendation.id).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
        const typeLabel = recommendation.type === 'tv' ? 'Dizi' : 'Film';
        const rating = escapeCountryHtml(recommendation.rating || '—');
        recommendationMarkup = '<article class="mood-v2-recommendation"><img class="mood-v2-poster" src="'+poster+'" alt="'+title+'" loading="lazy"><div class="mood-v2-recommendation-copy"><span class="mood-v2-result-label">SANA UYGUN ÖNERİ · '+typeLabel.toLocaleUpperCase('tr-TR')+'</span><h3>'+title+'</h3><p class="mood-v2-meta">'+escapeCountryHtml(recommendation.year||'—')+' <span>•</span> <i class="fa-solid fa-star"></i> '+rating+'</p><p class="mood-v2-description">'+escapeCountryHtml(recommendation.desc||'Bu yapımı keşfetmek için detaylarına göz at.')+'</p><div class="mood-v2-result-actions"><button type="button" class="mood-v2-open" onclick="openDetailPage(\''+id+'\')"><i class="fa-solid fa-arrow-up-right-from-square"></i> Detayları Gör</button><button type="button" class="mood-v2-again" onclick="generateMoodPick()"><i class="fa-solid fa-shuffle"></i> Başka Öner</button></div></div></article>';
    }
    result.innerHTML = '<div class="mood-v2-shell"><div class="mood-v2-heading"><div><span class="mood-v2-eyebrow">PERDE’DE KEŞFET</span><h2>Bugün nasıl bir şey izlemek istersin?</h2><p>Ruh halini seç, sana uygun film ve dizileri bulalım.</p></div><span class="mood-v2-mark" aria-hidden="true"><i class="fa-solid fa-wand-magic-sparkles"></i></span></div><div class="mood-v2-selector"><div class="mood-v2-label-row"><span>Bir ruh hali seç</span><span class="mood-v2-single-note">Tek seçim</span></div><div class="mood-v2-choices">'+choices+'</div>'+(moodCategoryOptions.length>6?'<button type="button" class="mood-v2-more" onclick="moodShowAll=!moodShowAll;renderMoodDiscovery()">'+(moodShowAll?'Daha az göster':'Tüm ruh hallerini gör')+' <i class="fa-solid fa-chevron-'+(moodShowAll?'up':'down')+'"></i></button>':'')+'<button type="button" class="mood-v2-submit" '+(activeMoodCategory?'':'disabled')+' onclick="generateMoodPick()"><span>Bana Yapım Öner</span><i class="fa-solid fa-arrow-right"></i></button></div>'+(recommendationMarkup|| (activeMoodCategory?'<p class="mood-v2-hint"><i class="fa-regular fa-circle-check"></i> '+selectedLabel+' seçildi. Sana uygun öneriyi görmek için butona dokun.</p>':''))+'</div>';
}

function chooseMoodPick(category) {
    activeMoodCategory = category || '';
    lastMoodRecommendationId = null;
    renderMoodDiscovery();
}

function generateMoodPick() {
    if (!activeMoodCategory) return;
    const candidates = getMoodCandidates(activeMoodCategory);
    if (!candidates.length) {
        const result = document.getElementById('mood-discovery-result');
        if (result) {
            renderMoodDiscovery();
            const notice = document.createElement('p');
            notice.className = 'mood-v2-empty';
            notice.textContent = 'Bu ruh halinde henüz önerilebilecek bir yapım bulunamadı. Başka bir ruh hali deneyebilirsin.';
            result.querySelector('.mood-v2-shell')?.appendChild(notice);
        }
        return;
    }
    let pool = candidates.filter(item => String(item.id) !== String(lastMoodRecommendationId));
    if (!pool.length) pool = candidates;
    const weights = pool.map(item => {
        const rating = Math.max(0,Math.min(10,Number.parseFloat(item.rating)||0));
        const year = Math.max(0,Math.min(2026,Number.parseInt(item.year,10)||0));
        return 1 + rating*0.18 + (year>=2020?0.7:0);
    });
    const total = weights.reduce((sum,value)=>sum+value,0);
    let ticket = Math.random()*total, chosen = pool[0];
    for(let i=0;i<pool.length;i++){ticket-=weights[i];if(ticket<=0){chosen=pool[i];break;}}
    lastMoodRecommendationId = chosen.id;
    renderMoodDiscovery(chosen);
}

function initializeMoodDiscovery() {
    activeMoodCategory = '';
    lastMoodRecommendationId = null;
    moodShowAll = false;
    renderMoodDiscovery();
}

async function renderSavedHomeCollections() {
    const host=document.getElementById('custom-collection-rails');
    if(!host)return;
    host.innerHTML='';
    try {
        const url=new URL('./data/collections.json?v=20261107-collections-v1',document.baseURI);
        const response=await fetch(url.href,{cache:'no-store'});
        if(!response.ok)throw new Error('Koleksiyon dosyası yüklenemedi.');
        const saved=await response.json();
        if(!Array.isArray(saved))return;
        const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
        saved.filter(collection=>collection&&collection.active!==false&&collection.title&&Array.isArray(collection.items)&&collection.items.length)
          .forEach((collection,index)=>{
            const entries=collection.items.map(id=>mediaDatabase.find(item=>String(item.id)===String(id))).filter(item=>item&&item.title&&item.image);
            if(!entries.length)return;
            const railId='saved-collection-rail-'+index;
            const section=document.createElement('section');
            section.className='collection-section saved-collection-section space-y-4';
            const controls=entries.length>8?'<div class="rail-controls" aria-label="'+esc(collection.title)+' rafı kaydırma kontrolleri"><button type="button" data-rail-target="'+railId+'" data-rail-direction="-1" aria-label="Önceki afişler"><i class="fa-solid fa-chevron-left"></i></button><button type="button" data-rail-target="'+railId+'" data-rail-direction="1" aria-label="Sonraki afişler"><i class="fa-solid fa-chevron-right"></i></button></div>':'';
            section.innerHTML='<div class="collection-heading"><div><p class="collection-eyebrow">ÖZEL KOLEKSİYON</p><h2>'+esc(collection.title)+'</h2></div>'+controls+'</div><div id="'+railId+'" class="collection-rail saved-collection-rail">'+entries.map(item=>'<article class="collection-card" data-detail-id="'+esc(item.id)+'" tabindex="0" role="button" aria-label="'+esc(item.title)+' detayını aç"><div class="collection-poster-wrap"><img src="'+esc(item.image)+'" alt="'+esc(item.title)+'" loading="lazy" decoding="async"><span class="collection-rating">★ '+esc(item.rating||'—')+'</span></div><div class="collection-card-copy"><h3>'+esc(item.title)+'</h3>'+originalTitleMarkup(item,'collection-original-title')+'<p>'+esc(item.year||'')+' <span>•</span> '+(item.type==='tv'?'Dizi':'Film')+'</p></div></article>').join('')+'</div>';
            host.appendChild(section);
          });
    } catch(error) { console.warn('Özel koleksiyon rafları yüklenemedi:',error); }
}

function renderHomeCollections() {
    const score = item => {
        const value = Number.parseFloat(item.rating);
        return Number.isFinite(value) ? value : 0;
    };
    const card = item => `
        <article class="collection-card" data-detail-id="${item.id}" tabindex="0" role="button" aria-label="${item.title} detayını aç">
            <div class="collection-poster-wrap">
                <img src="${item.image}" alt="${item.title}" loading="lazy" decoding="async">
                <span class="collection-rating">★ ${item.rating || '—'}</span>
            </div>
            <div class="collection-card-copy"><h3>${item.title}</h3>${originalTitleMarkup(item,'collection-original-title')}<p>${item.year || ''} <span>•</span> ${item.type === 'tv' ? 'Dizi' : 'Film'}</p></div>
        </article>`;
    const fill = (id, items) => {
        const rail = document.getElementById(id);
        if (!rail) return;
        rail.innerHTML = items.length ? items.map(card).join('') : '<p class="text-sm text-slate-500">Bu koleksiyonda henüz içerik yok.</p>';
    };
    const valid = mediaDatabase.filter(item => item.image && item.title);
    const featured = [...valid].sort((a,b) => score(b)-score(a)).slice(0,12);
    const movies = valid.filter(item => item.type === 'movie').sort((a,b) => score(b)-score(a)).slice(0,12);
    const series = valid.filter(item => item.type === 'tv').sort((a,b) => score(b)-score(a)).slice(0,12);
    fill('featured-rail', featured);
    const savedItems=valid.filter(item=>favorites.some(id=>String(id)===String(item.id)));
    const favoriteGenres=[...new Set(savedItems.flatMap(item=>[...(item.genre||'').split('/'),...(item.category||'').split('/')]).map(value=>value.trim().toLocaleLowerCase('tr-TR')).filter(Boolean))];
    const personalized=valid.filter(item=>!savedItems.some(saved=>String(saved.id)===String(item.id))).map(item=>{
        const tags=((item.genre||'')+' / '+(item.category||'')).toLocaleLowerCase('tr-TR');
        const affinity=favoriteGenres.reduce((sum,genre)=>sum+(tags.includes(genre)?5:0),0);
        const rating=Math.max(0,Math.min(10,Number.parseFloat(item.rating)||0));
        return {item,score:affinity+rating*.45+(item.type==='movie'?0.2:0)};
    }).sort((a,b)=>b.score-a.score).slice(0,12).map(row=>row.item);
    fill('personalized-rail',personalized.length?personalized:featured.slice(0,12));
    fill('top-movies-rail', movies);
    fill('top-series-rail', series);
    [['featured-rail','öne çıkan yapımlarda'],['personalized-rail','sana özel seçkilerde'],['top-movies-rail','yüksek puanlı filmlerde'],['top-series-rail','öne çıkan dizilerde']].forEach(([railId,label])=>{
        const rail=document.getElementById(railId),heading=rail?.previousElementSibling;
        if(!rail||!heading||heading.querySelector('.rail-controls'))return;
        const controls=document.createElement('div');controls.className='rail-controls';
        controls.innerHTML='<button type="button" data-rail-target="'+railId+'" data-rail-direction="-1" aria-label="Öncekiler" title="Öncekiler"><i class="fa-solid fa-chevron-left"></i></button><button type="button" data-rail-target="'+railId+'" data-rail-direction="1" aria-label="Sonrakiler" title="Sonrakiler"><i class="fa-solid fa-chevron-right"></i></button>';
        controls.setAttribute('aria-label',label+' kaydırma kontrolleri');
        heading.appendChild(controls);
    });
    document.getElementById('collection-movies').hidden = movies.length === 0;
    document.getElementById('collection-series').hidden = series.length === 0;
    renderSavedHomeCollections();
}

function updateHeaderActiveState(){
    const raw=decodeURIComponent((location.hash||'#/anasayfa').replace(/^#\/?/,''));
    const parts=raw.split('/');
    const route=parts[0]||'anasayfa';
    const routeMap={anasayfa:'.nav-home',filmler:'a[href="#/filmler"]',diziler:'a[href="#/diziler"]',kesfet:'a[href="#/kesfet"]',listem:'a[href="#/listem"]'};
    document.querySelectorAll('.main-nav a').forEach(link=>{
        const active=link.matches(routeMap[route]||'__no_match__');
        link.classList.toggle('is-active',active);
        if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
    });
    // Kategoriler tetikleyicisi diğer gezinme bağlantıları gibi aktif çizgi/parlama almaz.
    const categoryActive=route==='kategori';
    const category=document.querySelector('#categories-menu .nav-trigger');
    if(category)category.classList.remove('is-active');
    document.querySelectorAll('#categories-menu .nav-menu button').forEach(button=>{
        const selected=categoryActive && button.getAttribute('onclick')?.includes("filterGenre('"+(parts.slice(1).join('/')||'all')+"')");
        button.classList.toggle('is-selected',!!selected);
    });
}

function toggleHeaderMenu(id) {
    const target=document.getElementById(id); const wasOpen=target.classList.contains('open');
    closeHeaderMenus(); if(!wasOpen){target.classList.add('open');target.querySelector('.nav-trigger,.user-trigger')?.setAttribute('aria-expanded','true');}
}
function closeHeaderMenus(){document.querySelectorAll('.nav-dropdown.open').forEach(menu=>{menu.classList.remove('open');menu.querySelector('.nav-trigger,.user-trigger')?.setAttribute('aria-expanded','false');});}
document.addEventListener('click',event=>{if(!event.target.closest('.nav-dropdown'))closeHeaderMenus();});
function showProfileNotice(){window.alert('Profil alanı yakında kullanıma açılacak.');}
function showSettingsNotice(){window.alert('Ayarlar alanı yakında kullanıma açılacak.');}


const NY7_IMAGE_FALLBACK = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 900"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#242833"/><stop offset="1" stop-color="#090b10"/></linearGradient></defs><rect width="600" height="900" fill="url(#g)"/><text x="300" y="430" fill="#d9b24e" font-family="Arial" font-size="58" text-anchor="middle" font-weight="700">NY7</text><text x="300" y="490" fill="#aab0bb" font-family="Arial" font-size="22" text-anchor="middle">Görsel kullanılamıyor</text></svg>');
document.addEventListener('error', function(event) {
    const img = event.target;
    if (!img || img.tagName !== 'IMG' || img.dataset.ny7FallbackApplied === '1') return;
    img.dataset.ny7FallbackApplied = '1';
    img.src = NY7_IMAGE_FALLBACK;
}, true);

// Katalog listeleme, arama ve filtreleme
function renderMediaGrid(items = mediaDatabase) {
            const container = document.getElementById('media-grid');
            if (items.length === 0) {
                const isList = location.hash.startsWith('#/listem');
                container.innerHTML = `<div class="col-span-full ny7-empty-state">
                    <span class="ny7-empty-icon"><i class="fa-solid ${isList ? 'fa-bookmark' : 'fa-film'}"></i></span>
                    <h3>${isList ? 'Listen henüz boş' : 'Aradığın yapımı bulamadık'}</h3>
                    <p>${isList ? 'Beğendiğin film ve dizileri listene ekleyerek burada saklayabilirsin.' : 'Filtreleri değiştirebilir veya kataloğun tamamına göz atabilirsin.'}</p>
                    <button type="button" onclick="switchTab('all')"><i class="fa-solid fa-compass"></i> Keşfetmeye başla</button>
                </div>`;
                return;
            }

            container.innerHTML = items.map(m => {
                const isFav = favorites.includes(m.id) || favorites.includes(String(m.id));
                const isWatch = watchlist.includes(m.id) || watchlist.includes(String(m.id));
                return `
                <div data-detail-id="${m.id}" role="button" tabindex="0" aria-label="${m.title} detayını aç" class="movie-card group cursor-pointer" style="--theme-glow: ${m.themeColor}">
                    <div class="relative aspect-[2/3] rounded-2xl overflow-hidden border border-white/10 bg-slate-900 shadow-xl">
                        <img src="${m.image}" alt="${m.title}" loading="lazy" decoding="async" class="w-full h-full object-cover">
                        <div class="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent opacity-80 group-hover:opacity-95 transition-opacity"></div>
                        
                        <div class="absolute top-2.5 left-2.5 right-2.5 flex justify-between items-center z-10">
                            <span class="px-2 py-0.5 rounded text-[10px] font-black bg-black/80 text-brand-yellow border border-amber-400/30">
                                ★ ${m.rating}
                            </span>
                            <div class="flex gap-1">
                                <button onclick="toggleFavorite('${m.id}', event)" class="w-7 h-7 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center transition-all">
                                    <i class="${isFav ? 'fa-solid text-brand-red' : 'fa-regular'} fa-heart text-xs"></i>
                                </button>
                                <button onclick="toggleWatchlist('${m.id}', event)" class="w-7 h-7 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center transition-all">
                                    <i class="${isWatch ? 'fa-solid text-brand-yellow' : 'fa-regular'} fa-bookmark text-xs"></i>
                                </button>
                            </div>
                        </div>

                        <div class="absolute bottom-3 left-3 right-3 space-y-1">
                            <span class="text-[9px] font-extrabold uppercase tracking-widest text-brand-red">
                                ${m.tmdbGenres || m.category}
                            </span>
                            <h4 class="font-black text-white text-xs truncate group-hover:text-brand-yellow transition-colors">${m.title}</h4>
                            ${originalTitleMarkup(m,'grid-original-title')}
                            <p class="text-[10px] text-slate-400 font-medium">${m.year} • ${m.duration}</p>
                        </div>
                    </div>
                </div>
            `}).join('');
        }

        function renderLiveTv() {
            const container = document.getElementById('live-tv-grid');
            container.innerHTML = liveTvChannels.map(ch => `
                <div onclick="launchPlayer('${ch.name}')" class="bg-slate-900/80 p-4 rounded-2xl border border-white/10 hover:border-brand-yellow/60 cursor-pointer flex items-center justify-between shadow-lg hover:scale-105 transition-all">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-xl bg-brand-red/20 text-brand-red flex items-center justify-center font-bold text-base">
                            <i class="fa-solid ${ch.icon}"></i>
                        </div>
                        <div>
                            <h5 class="text-xs font-bold text-white">${ch.name}</h5>
                            <span class="text-[10px] text-slate-400">${ch.tag}</span>
                        </div>
                    </div>
                    <span class="w-2.5 h-2.5 rounded-full bg-red-500 live-dot"></span>
                </div>
            `).join('');
        }
let activeCatalogGenre = 'all';
        let activeCatalogType = 'all';
        let activeCatalogQuery = '';
        let activeCatalogCountry = '';
let activeCatalogDirector = '';
let activeCatalogGenreTag = '';

        
const countryAliases={
'Spain':['İspanya','🇪🇸'],'France':['Fransa','🇫🇷'],'Germany':['Almanya','🇩🇪'],
'United States of America':['ABD','🇺🇸'],'United States':['ABD','🇺🇸'],'USA':['ABD','🇺🇸'],'U.S.A.':['ABD','🇺🇸'],'US':['ABD','🇺🇸'],
'United Kingdom':['Birleşik Krallık','🇬🇧'],'Great Britain':['Büyük Britanya','🇬🇧'],'UK':['Birleşik Krallık','🇬🇧'],'U.K.':['Birleşik Krallık','🇬🇧'],
'England':['İngiltere','🏴'],'Scotland':['İskoçya','🏴'],'Wales':['Galler','🏴'],
'Italy':['İtalya','🇮🇹'],'Turkey':['Türkiye','🇹🇷'],'Türkiye':['Türkiye','🇹🇷'],'Canada':['Kanada','🇨🇦'],'Australia':['Avustralya','🇦🇺'],'Japan':['Japonya','🇯🇵'],'South Korea':['Güney Kore','🇰🇷'],'China':['Çin','🇨🇳'],'India':['Hindistan','🇮🇳'],'Russia':['Rusya','🇷🇺'],'Brazil':['Brezilya','🇧🇷'],'Mexico':['Meksika','🇲🇽'],'Argentina':['Arjantin','🇦🇷'],'Portugal':['Portekiz','🇵🇹'],'Netherlands':['Hollanda','🇳🇱'],'Belgium':['Belçika','🇧🇪'],'Switzerland':['İsviçre','🇨🇭'],'Sweden':['İsveç','🇸🇪'],'Norway':['Norveç','🇳🇴'],'Denmark':['Danimarka','🇩🇰'],'Finland':['Finlandiya','🇫🇮'],'Ireland':['İrlanda','🇮🇪'],'Poland':['Polonya','🇵🇱'],'Greece':['Yunanistan','🇬🇷'],'Ukraine':['Ukrayna','🇺🇦'],'New Zealand':['Yeni Zelanda','🇳🇿'],'South Africa':['Güney Afrika','🇿🇦'],'Egypt':['Mısır','🇪🇬'],'Morocco':['Fas','🇲🇦'],'Lebanon':['Lübnan','🇱🇧'],'Kuwait':['Kuveyt','🇰🇼'],'Libyan Arab Jamahiriya':['Libya','🇱🇾'],'United Arab Emirates':['Birleşik Arap Emirlikleri','🇦🇪'],'UAE':['BAE','🇦🇪'],'Czech Republic':['Çekya','🇨🇿'],'Romania':['Romanya','🇷🇴'],'Iceland':['İzlanda','🇮🇸'],'Thailand':['Tayland','🇹🇭'],'Indonesia':['Endonezya','🇮🇩'],'Colombia':['Kolombiya','🇨🇴'],'Chile':['Şili','🇨🇱'],'Peru':['Peru','🇵🇪'],'Serbia':['Sırbistan','🇷🇸'],'Croatia':['Hırvatistan','🇭🇷'],'Hungary':['Macaristan','🇭🇺'],'Bulgaria':['Bulgaristan','🇧🇬'],'Luxembourg':['Lüksemburg','🇱🇺']
};
function countryTokens(value){return String(value||'').split(/[,\u002f;|\n]+/).map(x=>x.trim()).filter(Boolean)}
function countryKey(value){return String(value||'').trim().toLocaleLowerCase('tr-TR').replace(/\s+/g,' ')}
const countryIsoLookup={
 'es':'ES','spain':'ES','ispanya':'ES',
 'fr':'FR','france':'FR','fransa':'FR',
 'de':'DE','germany':'DE','almanya':'DE',
 'us':'US','usa':'US','u.s.a.':'US','united states':'US','united states of america':'US','abd':'US',
 'gb':'GB','uk':'GB','u.k.':'GB','united kingdom':'GB','great britain':'GB','birleşik krallık':'GB','ingiltere':'GB','england':'GB',
 'it':'IT','italy':'IT','italya':'IT',
 'tr':'TR','turkey':'TR','türkiye':'TR',
 'ca':'CA','canada':'CA','kanada':'CA',
 'au':'AU','australia':'AU','avustralya':'AU',
 'jp':'JP','japan':'JP','japonya':'JP',
 'kr':'KR','south korea':'KR','korea, republic of':'KR','güney kore':'KR',
 'cn':'CN','china':'CN','çin':'CN',
 'in':'IN','india':'IN','hindistan':'IN',
 'ru':'RU','russia':'RU','rusya':'RU',
 'br':'BR','brazil':'BR','brezilya':'BR',
 'mx':'MX','mexico':'MX','meksika':'MX',
 'ar':'AR','argentina':'AR','arjantin':'AR',
 'pt':'PT','portugal':'PT','portekiz':'PT',
 'nl':'NL','netherlands':'NL','hollanda':'NL',
 'be':'BE','belgium':'BE','belçika':'BE',
 'ch':'CH','switzerland':'CH','isviçre':'CH',
 'se':'SE','sweden':'SE','isveç':'SE',
 'no':'NO','norway':'NO','norveç':'NO',
 'dk':'DK','denmark':'DK','danimarka':'DK',
 'fi':'FI','finland':'FI','finlandiya':'FI',
 'ie':'IE','ireland':'IE','irlanda':'IE',
 'pl':'PL','poland':'PL','polonya':'PL',
 'gr':'GR','greece':'GR','yunanistan':'GR',
 'ua':'UA','ukraine':'UA','ukrayna':'UA',
 'nz':'NZ','new zealand':'NZ','yeni zelanda':'NZ',
 'za':'ZA','south africa':'ZA','güney afrika':'ZA',
 'eg':'EG','egypt':'EG','mısır':'EG',
 'ma':'MA','morocco':'MA','fas':'MA',
 'lb':'LB','lebanon':'LB','lübnan':'LB',
 'kw':'KW','kuwait':'KW','kuveyt':'KW',
 'ly':'LY','libya':'LY','libyan arab jamahiriya':'LY',
 'ae':'AE','united arab emirates':'AE','uae':'AE','bae':'AE','birleşik arap emirlikleri':'AE',
 'cz':'CZ','czech republic':'CZ','czechia':'CZ','çekya':'CZ',
 'ro':'RO','romania':'RO','romanya':'RO',
 'is':'IS','iceland':'IS','izlanda':'IS',
 'th':'TH','thailand':'TH','tayland':'TH',
 'id':'ID','indonesia':'ID','endonezya':'ID',
 'co':'CO','colombia':'CO','kolombiya':'CO',
 'cl':'CL','chile':'CL','şili':'CL',
 'pe':'PE','peru':'PE',
 'rs':'RS','serbia':'RS','sırbistan':'RS',
 'hr':'HR','croatia':'HR','hırvatistan':'HR',
 'hu':'HU','hungary':'HU','macaristan':'HU',
 'bg':'BG','bulgaria':'BG','bulgaristan':'BG',
 'lu':'LU','luxembourg':'LU','lüksemburg':'LU',
 'ir':'IR','iran':'IR','iran, islamic republic of':'IR','iran':'IR','iran islamic republic':'IR',
 'hk':'HK','hong kong':'HK',
 'sg':'SG','singapore':'SG','singapur':'SG',
 'at':'AT','austria':'AT','avusturya':'AT',
 'ua':'UA','taiwan':'TW','tw':'TW'
};
function countryDisplay(value){
 const raw=String(value||'').trim();
 const key=countryKey(raw);
 const entry=Object.entries(countryAliases).find(([name,info])=>countryKey(name)===key||countryKey(info[0])===key);
 const iso=countryIsoLookup[key]||countryIsoLookup[key.replace(/\\./g,'')]||'';
 if(entry)return {name:entry[1][0],iso};
 if(iso){
  const names={IR:'İran',HK:'Hong Kong',SG:'Singapur',AT:'Avusturya',TW:'Tayvan'};
  return {name:names[iso]||raw,iso};
 }
 return {name:raw==='Bilinmiyor'?'Ülke bilgisi yok':raw,iso:''};
}
function countryFlagImage(iso,className){
 return iso?'<img class="'+className+'" src="https://flagcdn.com/w40/'+iso.toLowerCase()+'.png" srcset="https://flagcdn.com/w80/'+iso.toLowerCase()+'.png 2x" alt="'+iso+' bayrağı" loading="lazy" decoding="async">':'';
}
function escapeCountryHtml(value){return String(value||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
function countryIdentity(value){
 const info=countryDisplay(value);
 return info.iso||countryKey(value);
}
function filterByCountry(country,update=true){
 hideDirectorProfile();activeCatalogDirector='';activeCatalogGenreTag='';
 const selected=String(country||'').trim();
 if(!selected)return;
 activeCatalogCountry=countryIdentity(selected);
 activeCatalogGenre='all';
 activeCatalogType='all';
 activeCatalogQuery='';
 const search=document.getElementById('search-input');
 if(search){search.value='';}
 const dashboard=document.getElementById('dashboard-view');
 if(dashboard)dashboard.classList.remove('hidden');
 document.getElementById('detail-page-view').classList.add('hidden');
 document.getElementById('actor-page-view').classList.add('hidden');
 document.getElementById('detail-related').classList.add('hidden');
 document.getElementById('theme-body').style.backgroundColor='#0b0c10';
 const info=countryDisplay(selected);
 const heading=document.getElementById('catalog-heading');
 if(heading)heading.innerHTML=countryFlagImage(info.iso,'catalog-country-heading-flag')+'<span>'+escapeCountryHtml(info.name)+' Yapımları</span>';
 showCatalogView(info.name+' Yapımları');
 if(update)goRoute('#/ulke/'+encodeURIComponent(selected));
 updateHeaderActiveState();
 renderFilteredCatalog();
}
document.addEventListener('click',function(event){const chip=event.target.closest('.detail-country-chip');if(chip)filterByCountry(chip.dataset.country);});

let directorProfileRequest=0;
function ensureDirectorProfilePanel(){
 let panel=document.getElementById('director-profile-panel');
 if(panel)return panel;
 panel=document.createElement('section');
 panel.id='director-profile-panel';
 panel.className='director-profile-panel';
 panel.hidden=true;
 const catalog=document.getElementById('catalog-page');
 const genreBar=catalog?.querySelector('.catalog-genre-scroller');
 if(genreBar)catalog.insertBefore(panel,genreBar);
 else catalog?.prepend(panel);
 return panel;
}
function directorEntityValue(claims,property){
 return (claims[property]||[]).map(row=>row.mainsnak?.datavalue?.value).filter(Boolean);
}
async function fetchDirectorProfileData(name){
 const searchUrl='https://www.wikidata.org/w/api.php?action=wbsearchentities&search='+encodeURIComponent(name)+'&language=tr&uselang=tr&type=item&limit=10&format=json&origin=*';
 const searchResponse=await fetch(searchUrl);
 if(!searchResponse.ok)throw new Error('Yönetmen eşleştirmesi alınamadı');
 const searchData=await searchResponse.json();
 const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('tr-TR').replace(/[^a-z0-9]+/g,' ').trim();
 const exact=(searchData.search||[]).find(row=>normalize(row.label)===normalize(name)||normalize(row.label+' '+(row.description||''))===normalize(name));
 if(!exact)throw new Error('Tam isim eşleşmesi bulunamadı');
 const entityResponse=await fetch('https://www.wikidata.org/w/api.php?action=wbgetentities&ids='+encodeURIComponent(exact.id)+'&props=claims|labels|descriptions|sitelinks&languages=tr|en&sitefilter=trwiki|enwiki&format=json&origin=*');
 if(!entityResponse.ok)throw new Error('Yönetmen bilgileri alınamadı');
 const entityData=await entityResponse.json();
 const entity=entityData.entities?.[exact.id];
 if(!entity)throw new Error('Yönetmen kaydı bulunamadı');
 const claims=entity.claims||{};
 const getTime=prop=>directorEntityValue(claims,prop)[0]?.time||'';
 const dateLabel=value=>{
  if(!value)return '';
  const parts=String(value).replace(/^\+/,'').slice(0,10).split('-').map(Number);
  if(!parts[0])return '';
  return parts.length===3&&parts[1]&&parts[2]?[String(parts[2]).padStart(2,'0'),String(parts[1]).padStart(2,'0'),parts[0]].join('.'):String(parts[0]);
 };
 const birth=getTime('P569'),death=getTime('P570');
 const born=dateLabel(birth),died=dateLabel(death);
 let age='';
 if(birth){
  const b=new Date(birth.slice(1,11)+'T00:00:00Z'),e=death?new Date(death.slice(1,11)+'T00:00:00Z'):new Date();
  if(!Number.isNaN(b.getTime())&&!Number.isNaN(e.getTime())){
   age=e.getUTCFullYear()-b.getUTCFullYear();
   if(e.getUTCMonth()<b.getUTCMonth()||(e.getUTCMonth()===b.getUTCMonth()&&e.getUTCDate()<b.getUTCDate()))age--;
  }
 }
 const educationIds=directorEntityValue(claims,'P69').map(v=>v.id).filter(Boolean);
 const awardIds=directorEntityValue(claims,'P166').map(v=>v.id).filter(Boolean);
 const labelFor=async id=>{
  const response=await fetch('https://www.wikidata.org/w/api.php?action=wbgetentities&ids='+encodeURIComponent(id)+'&props=labels&languages=tr|en&format=json&origin=*');
  const json=await response.json(),labels=json.entities?.[id]?.labels||{};
  return labels.tr?.value||labels.en?.value||'';
 };
 const [education,awards]=await Promise.all([
  Promise.all(educationIds.slice(0,5).map(labelFor)),
  Promise.all(awardIds.slice(0,8).map(labelFor))
 ]);
 const imageFile=directorEntityValue(claims,'P18')[0];
 const image=imageFile?'https://commons.wikimedia.org/wiki/Special:FilePath/'+encodeURIComponent(imageFile.replace(/ /g,'_'))+'?width=520':'';
 const sitelink=entity.sitelinks?.trwiki?.title||entity.sitelinks?.enwiki?.title||'';
 let bio=entity.descriptions?.tr?.value||entity.descriptions?.en?.value||'Bu yönetmen için doğrulanmış kısa biyografi bulunamadı.';
 let wikiUrl='';
 if(sitelink){
  const params=new URLSearchParams({action:'query',titles:sitelink,prop:'extracts|info',explaintext:'1',exchars:'2400',inprop:'url',format:'json',origin:'*'});
  const wikiResponse=await fetch('https://'+(entity.sitelinks?.trwiki?'tr':'en')+'.wikipedia.org/w/api.php?'+params.toString());
  if(wikiResponse.ok){
   const wikiData=await wikiResponse.json(),page=Object.values(wikiData.query?.pages||{})[0];
   if(page?.extract){bio=cleanActorBiography(page.extract).replace(/\s+/g,' ').trim();wikiUrl=page.fullurl||'';}
  }
 }
 return {image,born,age,died,education:education.filter(Boolean),awards:awards.filter(Boolean),bio,wikiUrl};
}
async function loadDirectorProfile(name){
 const panel=ensureDirectorProfilePanel();if(!panel)return;
 const request=++directorProfileRequest;
 panel.hidden=false;
 panel.innerHTML='<div class="director-profile-loading"><span class="director-profile-avatar"><i class="fa-solid fa-clapperboard"></i></span><div><small>YÖNETMEN PROFİLİ</small><h2>'+escapeCountryHtml(name)+'</h2><p>Doğrulanmış bilgiler yükleniyor…</p></div></div>';
 try{
  const info=await fetchDirectorProfileData(name);
  if(request!==directorProfileRequest||activeCatalogDirector!==countryKey(name))return;
  const image=info.image?'<span class="director-profile-photo-wrap"><img class="director-profile-photo" src="'+escapeCountryHtml(info.image)+'" alt="'+escapeCountryHtml(name)+'" loading="eager"></span>':'<div class="director-profile-avatar"><i class="fa-solid fa-clapperboard"></i></div>';
  const birthValue=info.born?(info.died?info.born:(info.age!==''?info.born+' ('+info.age+' yaşında)':info.born)):'Bilgi bulunamadı';
  const compactFacts=[
   ['Eğitim',info.education.length?info.education.join(', '):'Bilgi bulunamadı'],
   ['Aldığı ödüller',info.awards.length?info.awards.join(' · '):'Kayıtlı ödül bilgisi bulunamadı']
  ];
  const deathMarkup=info.died?'<div class="director-profile-death"><i class="fa-regular fa-calendar"></i><span>VEFAT</span><b>'+escapeCountryHtml(info.died)+'</b></div>':'';
  panel.innerHTML='<div class="director-profile-content"><section class="director-profile-facts"><div class="director-profile-identity">'+image+'<div class="director-profile-heading"><h2>'+escapeCountryHtml(name)+'</h2><div class="director-profile-dates"><div class="director-profile-birth"><i class="fa-solid fa-cake-candles"></i><span>DOĞUM</span><b>'+escapeCountryHtml(birthValue)+'</b></div>'+deathMarkup+'</div>'+compactFacts.slice(0,1).map(([label,value])=>'<div class="director-profile-inline-fact"><i class="fa-solid fa-graduation-cap"></i><span>'+escapeCountryHtml(label)+'</span><b>'+escapeCountryHtml(value)+'</b></div>').join('')+'</div></div><div class="director-profile-fact-list">'+compactFacts.slice(1).map(([label,value])=>'<div class="director-profile-fact"><span><i class="fa-solid fa-award"></i>'+escapeCountryHtml(label)+'</span><b>'+escapeCountryHtml(value)+'</b></div>').join('')+'</div></section><section class="director-profile-biography"><small><i class="fa-solid fa-book-open"></i> HAYATI VE KARİYERİ</small><p>'+escapeCountryHtml(info.bio)+'</p>'+(info.wikiUrl?'<a href="'+escapeCountryHtml(info.wikiUrl)+'" target="_blank" rel="noopener">Kaynağı görüntüle <i class="fa-solid fa-arrow-up-right-from-square"></i></a>':'')+'</section></div>';
 }catch(error){
  if(request!==directorProfileRequest)return;
  panel.innerHTML='<div class="director-profile-loading"><span class="director-profile-avatar"><i class="fa-solid fa-circle-exclamation"></i></span><div><small>YÖNETMEN PROFİLİ</small><h2>'+escapeCountryHtml(name)+'</h2><p>Bu isim için güvenilir ve tam eşleşen bir yönetmen kaydı bulunamadı. Yanlış kişiye ait bilgi gösterilmedi.</p></div></div>';
 }
}
function hideDirectorProfile(){
 directorProfileRequest++;
 const panel=document.getElementById('director-profile-panel');
 if(panel)panel.hidden=true;
}
function filterByDirector(director,update=true){
 const selected=String(director||'').trim();if(!selected)return;
 activeCatalogCountry='';activeCatalogGenre='all';activeCatalogGenreTag='';activeCatalogDirector=countryKey(selected);activeCatalogType='all';activeCatalogQuery='';directorFilmographySort='newest';
 const search=document.getElementById('search-input');if(search)search.value='';
 document.getElementById('dashboard-view').classList.remove('hidden');
 document.getElementById('detail-page-view').classList.add('hidden');document.getElementById('actor-page-view').classList.add('hidden');document.getElementById('detail-related').classList.add('hidden');
 document.getElementById('theme-body').style.backgroundColor='#0b0c10';
 showCatalogView(selected+' — Yönetmen Filmografisi');
 loadDirectorProfile(selected);
 if(update)goRoute('#/yonetmen/'+encodeURIComponent(selected));
 updateHeaderActiveState();renderFilteredCatalog();
}
function filterByGenreTag(genre,update=true){
 hideDirectorProfile();const selected=String(genre||'').trim();if(!selected)return;
 activeCatalogCountry='';activeCatalogGenre='all';activeCatalogDirector='';activeCatalogGenreTag=countryKey(selected);activeCatalogType='all';activeCatalogQuery='';
 const search=document.getElementById('search-input');if(search)search.value='';
 document.getElementById('dashboard-view').classList.remove('hidden');
 document.getElementById('detail-page-view').classList.add('hidden');document.getElementById('actor-page-view').classList.add('hidden');document.getElementById('detail-related').classList.add('hidden');
 document.getElementById('theme-body').style.backgroundColor='#0b0c10';
 showCatalogView(selected+' Türündeki Yapımlar');
 if(update)goRoute('#/tur/'+encodeURIComponent(selected));
 updateHeaderActiveState();renderFilteredCatalog();
}
document.addEventListener('click',function(event){
 const director=event.target.closest('[data-director]');if(director){filterByDirector(director.dataset.director);return;}
 const genre=event.target.closest('[data-genre]');if(genre){filterByGenreTag(genre.dataset.genre);return;}
});

let directorFilmographySort='newest';
function ensureDirectorFilmographyToolbar(){
 const grid=document.getElementById('media-grid');
 if(!grid)return null;
 let toolbar=document.getElementById('director-filmography-toolbar');
 if(!toolbar){
  toolbar=document.createElement('div');
  toolbar.id='director-filmography-toolbar';
  toolbar.className='director-filmography-toolbar';
  toolbar.innerHTML='<div class="director-filmography-count"><i class="fa-solid fa-clapperboard" aria-hidden="true"></i><span id="director-filmography-count">Yönetmenin filmleri</span></div><label>Sıralama <select id="director-filmography-sort" aria-label="Filmografi sıralaması"><option value="newest">En yeni</option><option value="oldest">En eski</option><option value="az">A–Z</option></select></label>';
  grid.parentNode.insertBefore(toolbar,grid);
  toolbar.querySelector('select').addEventListener('change',event=>{directorFilmographySort=event.target.value;renderFilteredCatalog();});
 }
 toolbar.hidden=!activeCatalogDirector;
 const select=toolbar.querySelector('select');
 if(select)select.value=directorFilmographySort;
 return toolbar;
}
function renderFilteredCatalog() {
            const query = activeCatalogQuery.trim().toLocaleLowerCase('tr-TR');
            const filtered = mediaDatabase.filter(m => {
                const genre = (m.genre || '').toLocaleLowerCase('tr-TR');
                const category = (m.category || '').toLocaleLowerCase('tr-TR');
                const needle = activeCatalogGenre.toLocaleLowerCase('tr-TR');
                const genreMatch = activeCatalogGenre === 'all' || genre.includes(needle) || category.includes(needle);
                const typeMatch = activeCatalogType === 'all' || m.type === activeCatalogType;
                const countryMatch = !activeCatalogCountry || countryTokens(m.country).some(x=>countryIdentity(x)===activeCatalogCountry);
                const directorValue=m.tmdbDirector||m.director;
                const directorMatch = !activeCatalogDirector || countryKey(directorValue)===activeCatalogDirector || countryTokens(directorValue).some(x=>countryKey(x)===activeCatalogDirector);
                const itemGenres = [...new Set([...countryTokens(m.category),...countryTokens(m.genre)])];
                const genreTagMatch = !activeCatalogGenreTag || itemGenres.some(x=>countryKey(x)===activeCatalogGenreTag);
                const searchMatch = !query || mediaSearchText(m).includes(normalizeMediaSearchText(query)) || category.includes(query) || genre.includes(query);
                return genreMatch && typeMatch && searchMatch && countryMatch && directorMatch && genreTagMatch;
            });
            ensureDirectorFilmographyToolbar();
            if(activeCatalogDirector){
                const yearOf=m=>Number(String(m.tmdbReleaseDate||m.year||'').match(/\d{4}/)?.[0]||0);
                filtered.sort((a,b)=>{
                    if(directorFilmographySort==='oldest')return yearOf(a)-yearOf(b);
                    if(directorFilmographySort==='az')return String(a.title||'').localeCompare(String(b.title||''),'tr');
                    return yearOf(b)-yearOf(a);
                });
                const count=document.getElementById('director-filmography-count');
                if(count)count.textContent=filtered.length+' film bulundu';
            }else if (activeCatalogType === 'movie' || activeCatalogType === 'tv') filtered.reverse();
            renderMediaGrid(filtered);
        }

        function filterGenre(genre,update=true) {
            hideDirectorProfile();activeCatalogCountry='';activeCatalogDirector='';activeCatalogGenreTag='';
            activeCatalogGenre = genre;
            if(update)goRoute('#/kategori/'+encodeURIComponent(genre));
            updateHeaderActiveState();
            showCatalogView(genre==='all'?'Tüm Kategoriler':genre);
            activeCatalogType='all'; renderFilteredCatalog();
            document.querySelectorAll('.genre-pill').forEach(button => {
                const selected = button.getAttribute('onclick') === `filterGenre('${genre}')`;
                button.classList.toggle('bg-brand-red', selected);
                button.classList.toggle('text-white', selected);
                button.classList.toggle('font-bold', selected);
                button.classList.toggle('bg-slate-900', !selected);
                button.classList.toggle('text-slate-300', !selected);
            });
        }

        function filterType(type) {
            activeCatalogType = type;
            renderFilteredCatalog();
            document.querySelectorAll('.catalog-type-filter button').forEach(button => {
                const selected = button.getAttribute('onclick') === `filterType('${type}')`;
                button.classList.toggle('bg-brand-red', selected);
                button.classList.toggle('text-white', selected);
                button.classList.toggle('font-bold', selected);
                button.classList.toggle('text-slate-400', !selected);
            });
        }
        function updatePageContext(title){
            const card=document.getElementById('page-context-card');
            if(!card)return;
            const route=decodeURIComponent((location.hash||'').replace(/^#\/?/,'')).split('/')[0]||'kesfet';
            const configs={
                filmler:['fa-film','FİLMLER','Film arşivindeki yapımları keşfet.'],
                diziler:['fa-tv','DİZİLER','Dizi arşivini ve bölümlük hikâyeleri keşfet.'],
                kesfet:['fa-compass','KEŞFET','Perde kataloğundaki tüm yapımları keşfet.'],
                listem:['fa-bookmark','İZLEME LİSTEM','Kaydettiğin film ve diziler burada.'],
                kategori:['fa-layer-group',String(title||'KATEGORİ').toLocaleUpperCase('tr-TR'),'Seçtiğin kategoriye ait yapımları incele.'],
                ulke:['fa-globe','ÜLKE ARŞİVİ','Seçtiğin ülkeden yapımları keşfet.'],
                yonetmen:['fa-video','YÖNETMEN FİLMOGRAFİSİ','Yönetmenin Perde kataloğundaki yapımları.'],
                tur:['fa-tags','TÜR ARŞİVİ','Seçtiğin türe ait yapımları keşfet.']
            };
            const config=configs[route]||['fa-compass',String(title||'KEŞFET').toLocaleUpperCase('tr-TR'),'Perde arşivini keşfet.'];
            card.dataset.route=route;
            card.hidden=route==='yonetmen';
            const normalizeTheme=value=>String(value||'').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/ı/g,'i').replace(/[^a-z0-9]+/g,' ').trim();
            const categoryThemes=[
                {keys:['animasyon','animation'],id:'animation',icon:'fa-wand-magic-sparkles',desc:'Renkli dünyalara, sıra dışı karakterlere ve sınırsız hayal gücüne dal.'},
                {keys:['aksiyon','action'],id:'action',icon:'fa-bolt',desc:'Yüksek tempo, nefes kesen kovalamacalar ve unutulmaz mücadeleler.'},
                {keys:['komedi','comedy'],id:'comedy',icon:'fa-face-laugh',desc:'Modunu yükseltecek kahkaha dolu film ve dizileri keşfet.'},
                {keys:['dram','drama'],id:'drama',icon:'fa-masks-theater',desc:'Güçlü karakterler ve akılda kalan hikâyeler seni bekliyor.'},
                {keys:['korku','horror'],id:'horror',icon:'fa-ghost',desc:'Karanlığa adım at; gerilim ve korku dolu hikâyeleri keşfet.'},
                {keys:['gerilim','thriller'],id:'thriller',icon:'fa-eye',desc:'Gizem, tehlike ve beklenmedik dönemeçlerle dolu yapımlar.'},
                {keys:['bilim kurgu','science fiction','sci fi'],id:'scifi',icon:'fa-rocket',desc:'Geleceğe, uzak galaksilere ve hayal gücünün ötesine yolculuk.'},
                {keys:['fantastik','fantasy'],id:'fantasy',icon:'fa-dragon',desc:'Büyülü evrenler, efsaneler ve olağanüstü maceralar.'},
                {keys:['romantik','romance','ask','aşk'],id:'romance',icon:'fa-heart',desc:'Aşkın farklı hâllerini anlatan sıcak ve unutulmaz hikâyeler.'},
                {keys:['macera','adventure'],id:'adventure',icon:'fa-compass',desc:'Keşfedilmeyi bekleyen dünyalar ve heyecan dolu yolculuklar.'},
                {keys:['suç','crime'],id:'crime',icon:'fa-user-secret',desc:'Suç dünyasının karanlık sırlarını ve zekice kurguları keşfet.'},
                {keys:['gizem','mystery'],id:'mystery',icon:'fa-magnifying-glass',desc:'İpuçlarını takip et; sırları ve şaşırtıcı gerçekleri çöz.'},
                {keys:['belgesel','documentary'],id:'documentary',icon:'fa-earth-americas',desc:'Gerçek hikâyelerden, keşiflerden ve dünyadan ilham al.'},
                {keys:['tarih','history'],id:'history',icon:'fa-landmark',desc:'Geçmişin izinde, tarihe yön veren olaylara tanıklık et.'},
                {keys:['savas','war','savaş'],id:'war',icon:'fa-shield-halved',desc:'Tarihin ve insan hikâyelerinin iç içe geçtiği savaş filmleri.'},
                {keys:['muzik','music','müzik'],id:'music',icon:'fa-music',desc:'Müziğin ritmini ve sahne ışıklarının büyüsünü hisset.'},
                {keys:['aile','family'],id:'family',icon:'fa-people-roof',desc:'Birlikte izlemelik, her yaştan izleyiciye hitap eden hikâyeler.'},
                {keys:['spor','sport'],id:'sport',icon:'fa-trophy',desc:'Azim, rekabet ve zafer hikâyeleriyle ilham bul.'},
                {keys:['western'],id:'western',icon:'fa-hat-cowboy',desc:'Vahşi Batı’nın tozlu yollarında unutulmaz maceralar.'}
            ];
            const selectedCategory=normalizeTheme(title||'');
            const categoryTheme=['kategori','tur'].includes(route)?categoryThemes.find(theme=>theme.keys.some(key=>selectedCategory===normalizeTheme(key)||selectedCategory.includes(normalizeTheme(key)))):null;
            if(categoryTheme){card.dataset.theme=categoryTheme.id;config[0]=categoryTheme.icon;}
            else{delete card.dataset.theme;}
            const icon=document.getElementById('page-context-icon');
            const heading=document.getElementById('page-context-title');
            const description=document.getElementById('page-context-description');
            if(icon)icon.className='fa-solid '+config[0];
            if(heading)heading.textContent=config[1];
            if(description)description.textContent=categoryTheme?categoryTheme.desc:(['kategori','ulke','yonetmen','tur'].includes(route)?String(title||config[2]):config[2]);
        }
        function showCatalogView(title) {
            // Katalog rotasına geçerken detay/oyuncu görünümünü de kapat.
            const dashboard=document.getElementById('dashboard-view');
            const detail=document.getElementById('detail-page-view');
            const actor=document.getElementById('actor-page-view');
            if(dashboard)dashboard.classList.remove('hidden');
            if(detail)detail.classList.add('hidden');
            if(actor)actor.classList.add('hidden');
            document.body.classList.remove('ny7-detail-open');
            document.documentElement.classList.remove('ny7-modal-lock');
            const themeBody=document.getElementById('theme-body');
            if(themeBody)themeBody.style.backgroundColor='#0b0c10';
            const related=document.getElementById('detail-related');
            if(related)related.classList.add('hidden');
            const homeFeature=document.querySelector('.home-feature-row');
            if(dashboard)dashboard.dataset.homeActive='false';
            if(homeFeature){homeFeature.hidden=true;homeFeature.classList.add('hidden');}
            const context=document.getElementById('page-context-card');
            if(context)context.hidden=false;
            updatePageContext(title);
            document.getElementById('hero-section').classList.add('hidden');
            document.getElementById('home-collections').classList.add('hidden');
            const live = document.getElementById('live-tv-section'); if (live) live.classList.add('hidden');
            document.getElementById('catalog-page').classList.remove('hidden');
            document.getElementById('catalog-heading').innerText = title;
            window.scrollTo({top:0,behavior:history.state?.ny7ScrollY!=null?'auto':'smooth'});
        }
        function switchTab(tab,update=true) {
            hideDirectorProfile();closeHeaderMenus(); activeCatalogGenre='all'; activeCatalogQuery=''; activeCatalogCountry='';activeCatalogDirector='';activeCatalogGenreTag='';
            if(update)goRoute(tab==='movie'?'#/filmler':tab==='tv'?'#/diziler':tab==='watchlist'?'#/listem':'#/kesfet');
            updateHeaderActiveState();
            document.getElementById('search-input').value='';
            activeCatalogType = tab==='movie'?'movie':tab==='tv'?'tv':'all';
            const title = tab==='movie'?'Filmler':tab==='tv'?'Diziler':tab==='watchlist'?'İzleme Listem':'Keşfet';
            showCatalogView(title);
            const items = tab==='watchlist' ? mediaDatabase.filter(m=>watchlist.includes(m.id)||watchlist.includes(String(m.id))) : mediaDatabase.filter(m=>activeCatalogType==='all'||m.type===activeCatalogType);
            if (tab==='movie' || tab==='tv') items.reverse();
            renderMediaGrid(items);
        }
const headerSearchInput = document.getElementById('search-input');
const headerSearchCategory = document.getElementById('search-category');
const headerSearchResults = document.getElementById('header-search-results');
const searchCategoryHints={media:'Film veya dizi ara...',actor:'Oyuncu adı ara...',director:'Yönetmen adı ara...'};
headerSearchCategory?.addEventListener('change',()=>{
 const category=headerSearchCategory.value;
 const label=category==='actor'?'Oyuncu':category==='director'?'Yönetmen':'Film veya dizi';
 headerSearchInput.placeholder=searchCategoryHints[category]||searchCategoryHints.media;
 headerSearchInput.setAttribute('aria-label',label+' ara');
 if(headerSearchInput.value.trim())renderHeaderSearchResults(headerSearchInput.value);
 else {headerSearchResults.hidden=true;headerSearchResults.innerHTML='';}
 headerSearchInput.focus();
});
const searchCategoryPicker=document.getElementById('search-category-picker');
const searchCategoryTrigger=document.getElementById('search-category-trigger');
const searchCategoryMenu=document.getElementById('search-category-menu');
const searchCategoryCurrent=document.getElementById('search-category-current');
function closeSearchCategoryMenu(){
 if(!searchCategoryMenu||!searchCategoryTrigger)return;
 searchCategoryMenu.hidden=true;
 searchCategoryTrigger.setAttribute('aria-expanded','false');
}
function syncSearchCategoryMenu(){
 if(!searchCategoryMenu||!headerSearchCategory)return;
 const selected=headerSearchCategory.value;
 const selectedOption=searchCategoryMenu.querySelector('[data-value="'+selected+'"]');
 if(searchCategoryCurrent)searchCategoryCurrent.textContent=selectedOption?.querySelector('span')?.textContent||'Film / Dizi';
 searchCategoryMenu.querySelectorAll('.search-category-option').forEach(option=>{
  const active=option.dataset.value===selected;
  option.classList.toggle('is-selected',active);
  option.setAttribute('aria-selected',String(active));
 });
}
searchCategoryTrigger?.addEventListener('click',()=>{
 const opening=searchCategoryMenu?.hidden;
 if(!searchCategoryMenu)return;
 searchCategoryMenu.hidden=!opening;
 searchCategoryTrigger.setAttribute('aria-expanded',String(Boolean(opening)));
});
searchCategoryMenu?.querySelectorAll('.search-category-option').forEach(option=>option.addEventListener('click',()=>{
 if(!headerSearchCategory)return;
 headerSearchCategory.value=option.dataset.value||'media';
 headerSearchCategory.dispatchEvent(new Event('change',{bubbles:true}));
 syncSearchCategoryMenu();
 closeSearchCategoryMenu();
}));
headerSearchCategory?.addEventListener('change',syncSearchCategoryMenu);
document.addEventListener('click',event=>{
 if(searchCategoryPicker&&!searchCategoryPicker.contains(event.target))closeSearchCategoryMenu();
});
document.addEventListener('keydown',event=>{
 if(event.key==='Escape'&&searchCategoryMenu&&!searchCategoryMenu.hidden){
  closeSearchCategoryMenu();
  searchCategoryTrigger?.focus();
 }
});
syncSearchCategoryMenu();
let headerSearchRequest=0;
function renderHeaderSearchResults(value) {
 if (!headerSearchResults) return;
 const query=String(value||'').trim();
 ++headerSearchRequest;
 if(!query){headerSearchResults.hidden=true;headerSearchResults.innerHTML='';return;}
 const normalizedQuery=normalizeMediaSearchText(query);
 const catalogue=Array.isArray(mediaDatabase)?mediaDatabase:[];
 const searchCategory=document.getElementById('search-category')?.value||'media';
 const mediaMatches=searchCategory==='media'?catalogue.filter(item=>item.type!=='person'&&mediaSearchText(item).includes(normalizedQuery)).sort((a,b)=>{
  const exactA=normalizeMediaSearchText(a.title)===normalizedQuery||normalizeMediaSearchText(a.originalTitle)===normalizedQuery;
  const exactB=normalizeMediaSearchText(b.title)===normalizedQuery||normalizeMediaSearchText(b.originalTitle)===normalizedQuery;
  return Number(exactB)-Number(exactA);
 }).slice(0,8):[];
 const peopleMap=new Map();
 const addPerson=(name,type,profile='')=>{
  const clean=String(name||'').trim();
  if(!clean||!normalizeMediaSearchText(clean).includes(normalizedQuery))return;
  const key=type+':'+normalizeActorName(clean);
  const existing=peopleMap.get(key);
  if(!existing||(!existing.profile&&profile))peopleMap.set(key,{name:clean,type,profile:profile||existing?.profile||''});
 };
 catalogue.forEach(item=>{
  const castRows=Array.isArray(item.tmdbCast)?item.tmdbCast:[];
  castRows.forEach(person=>{
   if(person&&typeof person==='object')addPerson(person.name,'actor',person.profile||'');
  });
  (Array.isArray(item.cast)?item.cast:[]).forEach(name=>addPerson(typeof name==='string'?name:name?.name,'actor',name?.profile||''));
  [item.director,item.tmdbDirector].filter(Boolean).forEach(raw=>{
   String(raw).split(/[,;|]/).map(name=>name.trim()).filter(Boolean).forEach(name=>addPerson(name,'director'));
  });
 });
 const people=[...peopleMap.values()].filter(person=>searchCategory==='actor'?person.type==='actor':searchCategory==='director'?person.type==='director':false).slice(0,8);
 activeSearchResultIndex=-1;
 const mediaMarkup=mediaMatches.map(item=>{
  const title=escapeCountryHtml(item.title||'İsimsiz yapım');
  const image=escapeCountryHtml(item.image||item.tmdbPoster||'');
  const year=escapeCountryHtml(item.year||'Yıl bilgisi yok');
  const type=item.type==='tv'?'Dizi':'Film';
  return `<button type="button" class="header-search-result" role="option" data-search-result-id="${escapeCountryHtml(item.id)}">
   <img src="${image}" alt="" loading="lazy">
   <span class="header-search-result-copy"><strong>${title}</strong>${originalTitleMarkup(item,'search-original-title')}<small>${year} · ${type}</small></span>
   <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>
  </button>`;
 }).join('');
 const peopleMarkup=people.map(person=>{
  const name=escapeCountryHtml(person.name);
  const image=person.profile?'<img src="'+escapeCountryHtml(person.profile)+'" alt="" loading="lazy">':'<span class="header-search-person-placeholder" data-person-photo="'+escapeCountryHtml(person.type+':'+normalizeActorName(person.name))+'"><i class="fa-regular '+(person.type==='director'?'fa-clapperboard':'fa-user')+'"></i></span>';
  const label=person.type==='director'?'Yönetmen':'Oyuncu';
  return '<button type="button" class="header-search-result header-search-person" role="option" data-search-person-name="'+name+'" data-search-person-type="'+person.type+'">'+image+
   '<span class="header-search-result-copy"><strong>'+name+'</strong><small>'+label+'</small></span><i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></button>';
 }).join('');
 const directorPhotoRequest=headerSearchRequest;
 people.filter(person=>person.type==='director'&&!person.profile).forEach(async person=>{
  try{
   const info=await fetchDirectorProfileData(person.name);
   if(!info.image||directorPhotoRequest!==headerSearchRequest||headerSearchCategory?.value!=='director')return;
   const key=person.type+':'+normalizeActorName(person.name);
   const placeholder=[...headerSearchResults.querySelectorAll('[data-person-photo]')].find(node=>node.dataset.personPhoto===key);
   if(!placeholder)return;
   const photo=document.createElement('img');photo.src=info.image;photo.alt='';photo.loading='lazy';
   photo.onerror=()=>photo.remove();
   placeholder.replaceWith(photo);
  }catch(error){console.debug('Yönetmen arama fotoğrafı alınamadı:',person.name,error);}
  });
 const hasResults=mediaMarkup||peopleMarkup;
 const resultLabel=searchCategory==='actor'?'Oyuncular':searchCategory==='director'?'Yönetmenler':'Film ve diziler';
 const emptyHint=searchCategory==='actor'?'Perde kataloğunda eşleşen oyuncu bulunamadı.':searchCategory==='director'?'Perde kataloğunda eşleşen yönetmen bulunamadı.':'Perde kataloğunda eşleşen film veya dizi bulunamadı.';
 headerSearchResults.innerHTML=(hasResults?'<div class="header-search-group-label">'+resultLabel+'</div>'+(peopleMarkup||mediaMarkup):'')+
  (!hasResults?'<div class="header-search-empty"><span><i class="fa-solid fa-magnifying-glass"></i></span><b>Eşleşen sonuç bulunamadı</b><small>'+emptyHint+'</small></div>':'');
 headerSearchResults.hidden=false;
}
headerSearchInput.addEventListener('focus',()=>{
 headerSearchInput.closest('.glass-search')?.classList.add('is-expanded');
 renderHeaderSearchResults(headerSearchInput.value);
});
let headerSearchDebounce=null;
headerSearchInput.addEventListener('input',event=>{
 clearTimeout(headerSearchDebounce);
 const value=event.target.value||'';
 headerSearchDebounce=setTimeout(()=>renderHeaderSearchResults(value),180);
});
headerSearchResults.addEventListener('click',event=>{
 if(event.target.closest('[data-search-empty-action]')){
  headerSearchResults.hidden=true;headerSearchInput.value='';switchTab('all');return;
 }
 const person=event.target.closest('[data-search-person-name]');
 if(person){
  const name=person.dataset.searchPersonName,type=person.dataset.searchPersonType;
  headerSearchResults.hidden=true;headerSearchInput.blur();
  if(type==='director')filterByDirector(name);else openActorPage(name);
  return;
 }
 const result=event.target.closest('[data-search-result-id]');
 if(!result)return;
 const id=result.dataset.searchResultId;headerSearchResults.hidden=true;headerSearchInput.blur();openDetailPage(id);
});
document.addEventListener('click',event=>{
 if(!event.target.closest('.header-search-shell')&&headerSearchResults)headerSearchResults.hidden=true;
});
let activeSearchResultIndex=-1;
function setActiveSearchResult(index){
 const rows=[...headerSearchResults.querySelectorAll('[data-search-result-id],[data-search-person-name]')];
 if(!rows.length){activeSearchResultIndex=-1;return;}
 activeSearchResultIndex=Math.max(0,Math.min(index,rows.length-1));
 rows.forEach((row,i)=>{row.classList.toggle('is-keyboard-active',i===activeSearchResultIndex);row.setAttribute('aria-selected',String(i===activeSearchResultIndex));});
 rows[activeSearchResultIndex].scrollIntoView({block:'nearest'});
}
headerSearchInput.addEventListener('keydown',event=>{
 if(!headerSearchResults||headerSearchResults.hidden)return;
 const rows=headerSearchResults.querySelectorAll('[data-search-result-id],[data-search-person-name]');
 if(event.key==='ArrowDown'&&rows.length){event.preventDefault();setActiveSearchResult(activeSearchResultIndex+1);}
 else if(event.key==='ArrowUp'&&rows.length){event.preventDefault();setActiveSearchResult(activeSearchResultIndex<=0?0:activeSearchResultIndex-1);}
 else if(event.key==='Enter'&&activeSearchResultIndex>=0&&rows[activeSearchResultIndex]){event.preventDefault();rows[activeSearchResultIndex].click();}
 else if(event.key==='Escape'){headerSearchResults.hidden=true;activeSearchResultIndex=-1;}
});
headerSearchResults.addEventListener('mousemove',event=>{
 const row=event.target.closest('[data-search-result-id],[data-search-person-name]');
 if(row){const rows=[...headerSearchResults.querySelectorAll('[data-search-result-id],[data-search-person-name]')];setActiveSearchResult(rows.indexOf(row));}
});

// İçerik detay görünümü
function goRoute(path){ if(location.hash!==path) location.hash=path; else routeFromHash(); }
function routeFromHash(){
 updateHeaderActiveState();
 const p=decodeURIComponent(location.hash.replace(/^#\/?/,'' )).split('/');
 if(!p[0]||p[0]==='anasayfa'){showDashboard(false);return;}
 if(p[0]==='film'||p[0]==='dizi'){openDetailPage(p.slice(1).join('/'),false);return;}
 if(p[0]==='oyuncu'){openActorPage(p.slice(1).join('/'),false);return;}
 if(p[0]==='filmler'){switchTab('movie',false);return;}
 if(p[0]==='diziler'){switchTab('tv',false);return;}
 if(p[0]==='kesfet'){switchTab('all',false);return;}
 if(p[0]==='listem'){switchTab('watchlist',false);return;}
 if(p[0]==='kategori'){activeCatalogCountry='';filterGenre(p.slice(1).join('/')||'all',false);return;}
 if(p[0]==='ulke'){filterByCountry(p.slice(1).join('/'),false);return;}
 if(p[0]==='yonetmen'){filterByDirector(p.slice(1).join('/'),false);return;}
 if(p[0]==='tur'){filterByGenreTag(p.slice(1).join('/'),false);return;}
 showDashboard(false);
}
function showDashboard(update=true){
 hideDirectorProfile();
 closeTrailerPopup();
 document.body.classList.remove('ny7-detail-open');
 document.documentElement.classList.remove('ny7-modal-lock');
 document.getElementById('theme-body').style.backgroundColor='#0b0c10';
 document.getElementById('dashboard-view').classList.remove('hidden');
 document.getElementById('detail-page-view').classList.add('hidden');
 document.getElementById('actor-page-view').classList.add('hidden');
 const homeFeature=document.querySelector('.home-feature-row');
 const dashboard=document.getElementById('dashboard-view');if(dashboard)dashboard.dataset.homeActive='true';
 if(homeFeature){homeFeature.hidden=false;homeFeature.classList.remove('hidden');}
 const context=document.getElementById('page-context-card');if(context)context.hidden=true;
 document.getElementById('hero-section').classList.remove('hidden');
 document.getElementById('home-collections').classList.remove('hidden');
 const live=document.getElementById('live-tv-section');if(live)live.classList.remove('hidden');
 const catalog=document.getElementById('catalog-page');if(catalog)catalog.classList.add('hidden');
 document.getElementById('detail-related').classList.add('hidden');
 if(update&&location.hash!=='#/anasayfa')history.pushState(null,'','#/anasayfa');
 updateHeaderActiveState();
 window.dispatchEvent(new Event('perde:homepage-refresh'));
 window.scrollTo({top:0,behavior:!update&&history.state?.ny7ScrollY!=null?'auto':'smooth'});
}

function cleanActorBiography(text){
 let value=String(text||'').replace(/\r/g,'').replace(/\u00a0/g,' ');
 // Biyografi dışındaki ansiklopedik dizin/bağlantı bölümlerini tamamen çıkar.
 value=value.replace(/(?:^|\n)\s*={0,3}\s*(?:Filmografi|Filmography|Sinema|Televizyon|Müzik videoları|Kaynakça|Kaynaklar|Dış bağlantılar|External links|References|Film)\s*={0,3}\s*(?:\n|$)[\s\S]*$/i,'');
 value=value.replace(/^\s*={2,}.*?={2,}\s*$/gm,'');
 value=value.replace(/^\s*(?:IMDb['’]de|IMDb'de)\s+.*$/gim,'');
 value=value.replace(/^\s*(?:Kaynakça|Kaynaklar|Dış bağlantılar|External links|References)\s*$/gim,'');
 value=value.replace(/\n{3,}/g,'\n\n').trim();
 // Kaynak sayfadan kalan tek satırlık kategori/bağlantı kalıntılarını temizle.
 value=value.split('\n').filter(line=>!/^\s*(?:IMDb|Filmografi|Filmography|Sinema|Televizyon|Müzik videoları)\b/i.test(line.trim())).join('\n');
 return value.replace(/\s+/g,' ').trim();
}
function getRelatedMedia(item,limit=10){
 const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('tr-TR').trim();
 const tokens=value=>[...new Set(countryTokens(value).map(normalize).filter(Boolean))];
 const itemGenres=tokens([item.genre,item.category].filter(Boolean).join(' / '));
 const itemDirectors=tokens(item.director);
 const itemCountries=tokens(item.country);
 const itemCast=new Set((item.cast||[]).map(normalize).filter(Boolean));
 const itemYear=Number.parseInt(item.year,10);
 const sourceType=item.type;
 const candidates=mediaDatabase.filter(candidate=>String(candidate.id)!==String(item.id)&&candidate.title&&candidate.image);
 const ranked=candidates.map(candidate=>{
  const genres=tokens([candidate.genre,candidate.category].filter(Boolean).join(' / '));
  const sharedGenres=genres.filter(genre=>itemGenres.includes(genre));
  const sharedDirectors=tokens(candidate.director).filter(name=>itemDirectors.includes(name));
  const sharedCountries=tokens(candidate.country).filter(country=>itemCountries.includes(country));
  const sharedCast=(candidate.cast||[]).map(normalize).filter(name=>itemCast.has(name));
  const candidateYear=Number.parseInt(candidate.year,10);
  let score=0;
  score+=sharedGenres.reduce((sum,genre)=>sum+(genre.length>3?7:4),0);
  score+=sharedDirectors.length*15;
  score+=Math.min(sharedCast.length,4)*5;
  score+=sharedCountries.length*2;
  if(candidate.type===sourceType)score+=3;
  if(Number.isFinite(itemYear)&&Number.isFinite(candidateYear)){
   const gap=Math.abs(itemYear-candidateYear);
   if(gap<=5)score+=4;
   else if(gap<=12)score+=2;
  }
  const rating=Number.parseFloat(candidate.rating);
  if(Number.isFinite(rating))score+=Math.min(Math.max(rating,0),10)*.12;
  // Aynı puanlı sonuçlarda her yapım için farklı ama kararlı bir sıra oluştur.
  const seed=normalize(item.id)+'|'+normalize(candidate.id);
  let hash=2166136261;
  for(let i=0;i<seed.length;i++){hash^=seed.charCodeAt(i);hash=Math.imul(hash,16777619);}
  const tie=((hash>>>0)%1000)/100000;
  return {item:candidate,score:score+tie,sharedGenres:sharedGenres.length};
 }).filter(row=>row.score>0);
 ranked.sort((a,b)=>b.score-a.score);
 let selected=ranked.filter(row=>row.score>=3).slice(0,limit);
 // Katalogdaki az bulunan türlerde de benzer yapım alanı boş kalmasın.
 if(selected.length<Math.min(6,limit)){
  const used=new Set(selected.map(row=>String(row.item.id)));
  const fallback=ranked.filter(row=>!used.has(String(row.item.id))&&row.item.type===sourceType);
  selected=selected.concat(fallback.slice(0,Math.min(6,limit)-selected.length));
 }
 return selected.slice(0,limit).map(row=>row.item);
}

function resetPosterAtmosphere(){
 const posterColumn=document.querySelector('#detail-page-view .detail-poster-column');if(!posterColumn)return;
 ['--poster-tone-1-rgb','--poster-tone-2-rgb','--poster-tone-3-rgb'].forEach(name=>posterColumn.style.removeProperty(name));
}
function applyPosterAtmosphere(item){
 const posterColumn=document.querySelector('#detail-page-view .detail-poster-column');if(!posterColumn)return;
 const mediaId=String(item.id);
 posterColumn.dataset.atmosphereMediaId=mediaId;
 resetPosterAtmosphere();
 const imageUrl=item.tmdbPoster||item.image;
 if(!imageUrl)return;
 // Afişin tamamını, en-boy oranını koruyarak örnekle; kare kırpma baskın renkleri yanıltmasın.
 const source=imageUrl.replace(/^https?:\/\//,'');
 const sampleUrl='https://images.weserv.nl/?url='+encodeURIComponent(source)+'&w=96&h=144&fit=inside&output=jpg';
 const poster=new Image();
 poster.crossOrigin='anonymous';
 poster.onload=()=>{
  if(posterColumn.dataset.atmosphereMediaId!==mediaId)return;
  try{
   const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
   if(!ctx)throw new Error('Canvas context unavailable');
   const width=96,height=144;
   canvas.width=width;canvas.height=height;
   const scale=Math.min(width/poster.naturalWidth,height/poster.naturalHeight);
   const drawWidth=Math.max(1,Math.round(poster.naturalWidth*scale));
   const drawHeight=Math.max(1,Math.round(poster.naturalHeight*scale));
   ctx.fillStyle='#777';ctx.fillRect(0,0,width,height);
   ctx.drawImage(poster,Math.round((width-drawWidth)/2),Math.round((height-drawHeight)/2),drawWidth,drawHeight);
   const pixels=ctx.getImageData(0,0,width,height).data,buckets=new Map();
   // Her piksel hesaba katılır; sıralama doygunluğa değil, afişteki gerçek yaygınlığa dayanır.
   for(let i=0;i<pixels.length;i+=4){
    const r=pixels[i],g=pixels[i+1],b=pixels[i+2],a=pixels[i+3];
    if(a<180)continue;
    const max=Math.max(r,g,b),min=Math.min(r,g,b),brightness=(r+g+b)/3;
    if(brightness<13||brightness>247)continue;
    const saturation=max?((max-min)/max):0;
    const key=[r>>5,g>>5,b>>5].join(',');
    let bucket=buckets.get(key);
    if(!bucket){bucket={r:0,g:0,b:0,count:0,score:0};buckets.set(key,bucket);}
    bucket.r+=r;bucket.g+=g;bucket.b+=b;bucket.count++;
    bucket.score+=.88+saturation*.24;
   }
   const ranked=[...buckets.values()].sort((a,b)=>b.score-a.score),chosen=[];
   for(const bucket of ranked){
    const color={r:Math.round(bucket.r/bucket.count),g:Math.round(bucket.g/bucket.count),b:Math.round(bucket.b/bucket.count)};
    if(chosen.every(other=>Math.hypot(color.r-other.r,color.g-other.g,color.b-other.b)>42))chosen.push(color);
    if(chosen.length===3)break;
   }
   if(!chosen.length)throw new Error('No dominant poster colors found');
   chosen.forEach((color,index)=>posterColumn.style.setProperty('--poster-tone-'+(index+1)+'-rgb',[color.r,color.g,color.b].join(',')));
   posterColumn.dataset.atmosphereReady='true';
  }catch(error){
   if(posterColumn.dataset.atmosphereMediaId===mediaId){
    ['--poster-tone-1-rgb','--poster-tone-2-rgb','--poster-tone-3-rgb'].forEach(name=>posterColumn.style.removeProperty(name));
    posterColumn.dataset.atmosphereReady='false';
   }
  }
 };
 poster.onerror=()=>{
  if(posterColumn.dataset.atmosphereMediaId===mediaId){
   posterColumn.dataset.atmosphereReady='false';
   ['--poster-tone-1-rgb','--poster-tone-2-rgb','--poster-tone-3-rgb'].forEach(name=>posterColumn.style.removeProperty(name));
  }
 };
 poster.src=sampleUrl;
}

const DETAIL_EPISODE_PROGRESS_KEY='perde_episode_progress_v1';
let detailEpisodeRequest=0,detailEpisodeState={itemId:'',seasons:[]};
function getDetailTmdbAuth(){
 let token='';try{token=(localStorage.getItem('perde_tmdb_read_token_v1')||'').trim();}catch(_){}
 if(/^[a-z0-9]{32}$/i.test(token))return {query:'&api_key='+encodeURIComponent(token),headers:{Accept:'application/json'}};
 if(token.split('.').length===3&&token.startsWith('eyJ'))return {query:'',headers:{Accept:'application/json',Authorization:'Bearer '+token}};
 return null;
}
function getDetailEpisodeProgress(id){
 try{const all=JSON.parse(localStorage.getItem(DETAIL_EPISODE_PROGRESS_KEY)||'{}');return all[String(id)]||{};}catch(_){return {};}
}
function setDetailEpisodeWatched(id,season,episode,watched){
 try{const all=JSON.parse(localStorage.getItem(DETAIL_EPISODE_PROGRESS_KEY)||'{}');if(!all[String(id)]||typeof all[String(id)]!=='object')all[String(id)]={};all[String(id)][season+'_'+episode]={watched,updatedAt:Date.now()};localStorage.setItem(DETAIL_EPISODE_PROGRESS_KEY,JSON.stringify(all));return true;}catch(_){return false;}
}
function updateDetailSeriesDashboard(item){
 const dashboard=document.getElementById('detail-series-dashboard');if(!dashboard)return;
 const seasons=detailEpisodeState.seasons||[],total=seasons.reduce((sum,season)=>sum+(Number(season.episode_count)||0),0);
 const progress=getDetailEpisodeProgress(item.id);
 const watched=Object.values(progress).filter(entry=>entry&&entry.watched).length;
 const percent=total?Math.min(100,Math.round(watched/total*100)):0;
 const totalNode=dashboard.querySelector('.series-stat-card:nth-child(2) strong');if(totalNode)totalNode.textContent=total;
 const seasonNode=dashboard.querySelector('.series-stat-card:first-child strong');if(seasonNode)seasonNode.textContent=seasons.length;
 const watchedNode=dashboard.querySelector('.series-stat-card:nth-child(3) strong');if(watchedNode)watchedNode.textContent=watched;
 const pct=dashboard.querySelector('.series-progress-copy strong');if(pct)pct.textContent='%'+percent;
 const bar=dashboard.querySelector('.series-progress-track span');if(bar)bar.style.width=percent+'%';
 const note=dashboard.querySelector('.series-progress-card small');if(note)note.textContent=watched+' / '+total+' bölüm tamamlandı';
}
function renderDetailEpisodeCards(item,data,seasonNumber){
 const root=document.getElementById('detail-episodes-content');if(!root)return;
 const episodes=Array.isArray(data.episodes)?data.episodes:[];
 const progress=getDetailEpisodeProgress(item.id);
 const watchedCount=episodes.filter(ep=>progress[seasonNumber+'_'+ep.episode_number]?.watched).length;
 const PAGE_SIZE=6,pageKey='perde_last_episode_page_v1_'+String(item.id)+'_'+String(seasonNumber);
 let page=1;try{page=Math.max(1,Number(localStorage.getItem(pageKey))||1);}catch(_){}
 const cards=episodes.map(ep=>{
  const no=Number(ep.episode_number)||0,watched=!!progress[seasonNumber+'_'+no]?.watched;
  const still=ep.still_path?'https://image.tmdb.org/t/p/w780'+ep.still_path:(item.tmdbPoster||item.image||'');
  const meta=[Number(ep.runtime)>0?ep.runtime+' dk':'',ep.air_date?new Date(ep.air_date+'T12:00:00').toLocaleDateString('tr-TR',{day:'numeric',month:'short',year:'numeric'}):''].filter(Boolean).join(' · ');
  const overview=String(ep.overview||'').trim();
  return '<article class="detail-episode-card'+(watched?' is-watched':'')+'" data-episode-card data-episode-name="'+escapeCountryHtml((ep.name||'').toLocaleLowerCase('tr-TR'))+'" data-episode-number="'+no+'">'+
   '<div class="detail-episode-art"><img src="'+escapeCountryHtml(still)+'" alt="'+escapeCountryHtml(ep.name||('Bölüm '+no))+'" loading="lazy"><span class="detail-episode-number">'+String(no).padStart(2,'0')+'</span><span class="detail-episode-watched-badge"'+(watched?'':' hidden')+'><i class="fa-solid fa-check"></i> İzlendi</span><button type="button" class="detail-episode-play-overlay" data-episode-play data-season="'+seasonNumber+'" data-episode="'+no+'" aria-label="'+escapeCountryHtml(ep.name||('Bölüm '+no))+' bölümünü izle"><i class="fa-solid fa-play"></i></button></div>'+
   '<div class="detail-episode-copy"><div class="detail-episode-title-row"><h3>'+escapeCountryHtml(ep.name||('Bölüm '+no))+'</h3></div>'+
   (meta?'<small class="detail-episode-meta">'+escapeCountryHtml(meta)+'</small>':'')+
   (overview?'<p class="detail-episode-overview">'+escapeCountryHtml(overview)+'</p>':'<p class="detail-episode-overview is-empty">Bu bölüm için açıklama bulunmuyor.</p>')+
   (overview?'<button type="button" class="detail-episode-overview-toggle" aria-expanded="false">Devamını oku</button>':'')+
   '<div class="detail-episode-actions"><button type="button" class="detail-episode-play" data-episode-play data-season="'+seasonNumber+'" data-episode="'+no+'"><i class="fa-solid fa-play"></i><span>Bölümü izle</span></button><button type="button" class="detail-episode-toggle" data-episode-toggle data-season="'+seasonNumber+'" data-episode="'+no+'" aria-pressed="'+watched+'"><i class="fa-solid '+(watched?'fa-check':'fa-circle')+'"></i> '+(watched?'İzlendi':'İzledim olarak işaretle')+'</button></div></div></article>';
 }).join('');
 const percent=episodes.length?Math.round(watchedCount/episodes.length*100):0;
 const seasonProgress=detailEpisodeState.seasons.map(entry=>{const count=Number(entry.episode_count)||0;let seen=0;for(let n=1;n<=count;n++)if(progress[entry.season_number+'_'+n]?.watched)seen++;return {...entry,watched:seen,percent:count?Math.round(seen/count*100):0};});
 const options=seasonProgress.map(entry=>'<button type="button" class="detail-season-option'+(Number(entry.season_number)===Number(seasonNumber)?' is-active':'')+'" data-season-option="'+entry.season_number+'"><span class="detail-season-option-top"><strong>'+escapeCountryHtml(entry.name)+'</strong><small>'+entry.watched+' / '+entry.episode_count+' bölüm</small></span><span class="detail-season-option-track"><i style="width:'+entry.percent+'%"></i></span><span class="detail-season-option-status">'+(entry.percent===100?'Tamamlandı':entry.watched?'Devam ediyor':'Başlanmadı')+'</span></button>').join('');
 const seasonIndex=detailEpisodeState.seasons.findIndex(entry=>Number(entry.season_number)===Number(seasonNumber));
 const previous=detailEpisodeState.seasons[seasonIndex-1],next=detailEpisodeState.seasons[seasonIndex+1];
 root.innerHTML=
  '<div class="detail-episodes-heading"><div><span>DİZİ REHBERİ</span><h2>Bölümler</h2><p>Sezonunu seç, bölüm takibini kaldığın yerden sürdür.</p></div></div>'+
  '<div class="detail-season-picker"><button type="button" class="detail-season-step" data-season-step="'+(previous?previous.season_number:'')+'" '+(previous?'':'disabled')+' aria-label="Önceki sezon"><i class="fa-solid fa-chevron-left"></i></button><div class="detail-season-select-wrap"><span class="detail-season-eyebrow">SEZON SEÇİMİ</span><button type="button" id="detail-season-trigger" class="detail-season-trigger" aria-expanded="false" aria-controls="detail-season-menu"><span><strong>'+escapeCountryHtml(detailEpisodeState.seasons[seasonIndex]?.name||('Sezon '+seasonNumber))+'</strong><small>'+watchedCount+' / '+episodes.length+' bölüm izlendi</small></span><i class="fa-solid fa-chevron-down"></i></button><div id="detail-season-menu" class="detail-season-menu" hidden>'+options+'</div></div><button type="button" class="detail-season-step" data-season-step="'+(next?next.season_number:'')+'" '+(next?'':'disabled')+' aria-label="Sonraki sezon"><i class="fa-solid fa-chevron-right"></i></button><small class="detail-season-count">'+(seasonIndex+1)+' / '+detailEpisodeState.seasons.length+'</small></div>'+
  '<div class="detail-episode-toolbar"><label class="detail-episode-unwatched"><input id="detail-episode-unwatched" type="checkbox"><span>Sadece izlenmeyenler</span></label>'+
  '<button type="button" id="detail-season-mark-all" class="detail-season-mark-all"><i class="fa-solid fa-check-double"></i> Sezonu tamamla</button>'+
  '<span class="detail-episode-progress">'+watchedCount+' / '+episodes.length+' izlendi</span></div>'+
  '<div class="detail-episode-progress-track"><span style="width:'+percent+'%"></span></div>'+
  '<div class="detail-episode-list">'+cards+'</div>'+
  '<div class="detail-episode-pagination" aria-label="Bölüm sayfaları"><button type="button" data-page-prev aria-label="Önceki sayfa"><i class="fa-solid fa-chevron-left"></i></button><span data-page-label></span><button type="button" data-page-next aria-label="Sonraki sayfa"><i class="fa-solid fa-chevron-right"></i></button></div>'+
  '<p class="detail-episodes-filter-empty" hidden>Bu sezonda gösterilecek bölüm bulunamadı.</p>';
 const applyFilters=()=>{
  const onlyUnwatched=!!root.querySelector('#detail-episode-unwatched')?.checked;
  const all=[...root.querySelectorAll('[data-episode-card]')];
  const filtered=all.filter(card=>!onlyUnwatched||!card.classList.contains('is-watched'));
  const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));page=Math.min(page,pages);
  all.forEach(card=>{card.hidden=true;});
  filtered.forEach((card,index)=>{card.hidden=index<(page-1)*PAGE_SIZE||index>=page*PAGE_SIZE;});
  const empty=root.querySelector('.detail-episodes-filter-empty');if(empty)empty.hidden=filtered.length>0;
  const label=root.querySelector('[data-page-label]');if(label)label.textContent=filtered.length?((page-1)*PAGE_SIZE+1)+'–'+Math.min(page*PAGE_SIZE,filtered.length)+' / '+filtered.length+' bölüm':'0 bölüm';
  const prev=root.querySelector('[data-page-prev]'),nxt=root.querySelector('[data-page-next]');
  if(prev)prev.disabled=page<=1;if(nxt)nxt.disabled=page>=pages;
  try{localStorage.setItem(pageKey,String(page));}catch(_){}
 };
 const changeSeason=value=>{if(value)loadDetailEpisodeSeason(item,Number(value));};
 const seasonTrigger=root.querySelector('#detail-season-trigger'),seasonMenu=root.querySelector('#detail-season-menu');
 seasonTrigger?.addEventListener('click',()=>{const open=seasonTrigger.getAttribute('aria-expanded')==='true';seasonTrigger.setAttribute('aria-expanded',String(!open));if(seasonMenu)seasonMenu.hidden=open;});
 root.querySelectorAll('[data-season-option]').forEach(button=>button.addEventListener('click',()=>{if(seasonMenu)seasonMenu.hidden=true;seasonTrigger?.setAttribute('aria-expanded','false');changeSeason(button.dataset.seasonOption);}));
 root.addEventListener('click',event=>{if(seasonMenu&&!event.target.closest('.detail-season-select-wrap')){seasonMenu.hidden=true;seasonTrigger?.setAttribute('aria-expanded','false');}});
 root.querySelectorAll('[data-season-step]').forEach(button=>button.addEventListener('click',()=>changeSeason(button.dataset.seasonStep)));
 root.querySelector('#detail-episode-unwatched')?.addEventListener('change',()=>{page=1;applyFilters();});
 root.querySelector('[data-page-prev]')?.addEventListener('click',()=>{page=Math.max(1,page-1);applyFilters();});
 root.querySelector('[data-page-next]')?.addEventListener('click',()=>{page++;applyFilters();});
 root.querySelector('#detail-season-mark-all')?.addEventListener('click',()=>{
  episodes.forEach(ep=>setDetailEpisodeWatched(item.id,seasonNumber,Number(ep.episode_number),true));
  renderDetailEpisodeCards(item,data,seasonNumber);updateDetailSeriesDashboard(item);
 });
 root.querySelectorAll('[data-episode-play]').forEach(button=>button.addEventListener('click',()=>{
  const seasonNo=Number(button.dataset.season),episodeNo=Number(button.dataset.episode);
  const episode=episodes.find(entry=>Number(entry.episode_number)===episodeNo);
  if(!episode){setPlayerError('Bölüm bilgisi bulunamadı.');return;}
  window.perdeEpisodeContext={
   seriesId:String(item.id),
   playerId:String(item.id)+'::s'+seasonNo+'e'+episodeNo,
   season:seasonNo,
   episode:episodeNo,
   episodeTitle:String(episode.name||('Bölüm '+episodeNo))
  };
  openPlayerForMedia(item.id);
 }));
 root.querySelectorAll('[data-episode-toggle]').forEach(button=>button.addEventListener('click',()=>{
  const seasonNo=Number(button.dataset.season),episode=Number(button.dataset.episode),next=! (button.getAttribute('aria-pressed')==='true');
  setDetailEpisodeWatched(item.id,seasonNo,episode,next);
  button.setAttribute('aria-pressed',String(next));
  button.innerHTML='<i class="fa-solid '+(next?'fa-check':'fa-circle')+'"></i> '+(next?'İzlendi':'İzledim olarak işaretle');
  const card=button.closest('.detail-episode-card');card?.classList.toggle('is-watched',next);
  const badge=card?.querySelector('.detail-episode-watched-badge');if(badge)badge.hidden=!next;
  const fresh=getDetailEpisodeProgress(item.id),count=episodes.filter(ep=>fresh[seasonNo+'_'+ep.episode_number]?.watched).length;
  const label=root.querySelector('.detail-episode-progress'),bar=root.querySelector('.detail-episode-progress-track span');
  if(label)label.textContent=count+' / '+episodes.length+' izlendi';
  if(bar)bar.style.width=(episodes.length?Math.round(count/episodes.length*100):0)+'%';
  applyFilters();updateDetailSeriesDashboard(item);
 }));
 root.querySelectorAll('.detail-episode-overview-toggle').forEach(button=>button.addEventListener('click',()=>{
  const paragraph=button.parentElement.querySelector('.detail-episode-overview'),expanded=button.getAttribute('aria-expanded')==='true';
  button.setAttribute('aria-expanded',String(!expanded));button.textContent=expanded?'Devamını oku':'Daha az göster';paragraph?.classList.toggle('is-expanded',!expanded);
 }));
 applyFilters();updateDetailSeriesDashboard(item);
}
async function loadDetailEpisodeSeason(item,seasonNumber){
 const root=document.getElementById('detail-episodes-content'),request=++detailEpisodeRequest,auth=getDetailTmdbAuth();if(!root||!auth)return;
 try{localStorage.setItem('perde_last_series_season_v1_'+String(item.id),String(seasonNumber));}catch(_){}
 root.innerHTML='<div class="detail-episodes-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> Bölümler yükleniyor…</div>';
 try{
  const response=await fetch('https://api.themoviedb.org/3/tv/'+encodeURIComponent(item.tmdbId)+'/season/'+seasonNumber+'?language=tr-TR'+auth.query,{headers:auth.headers});
  if(!response.ok)throw new Error('TMDB HTTP '+response.status);
  const data=await response.json();if(request!==detailEpisodeRequest||String(detailEpisodeState.itemId)!==String(item.id))return;
  renderDetailEpisodeCards(item,data,seasonNumber);
 }catch(error){if(request!==detailEpisodeRequest)return;root.innerHTML='<p class="detail-episodes-empty">Bölüm bilgileri şu anda alınamadı. Biraz sonra tekrar deneyebilirsin.</p>';console.warn('Dizi bölüm bilgileri alınamadı:',error);}
}
async function renderDetailEpisodes(item){
 const panel=document.getElementById('detail-episodes'),root=document.getElementById('detail-episodes-content');if(!panel||!root)return;
 if(item.type!=='tv'){panel.hidden=true;root.innerHTML='';return;}
 panel.hidden=false;const request=++detailEpisodeRequest;detailEpisodeState={itemId:String(item.id),seasons:[]};
 const heading='<div class="detail-episodes-heading"><div><span>BÖLÜM KÜTÜPHANESİ</span><h2>Sezonlar ve bölümler</h2><p>Bir sezon seç, bölümlerini görüntüle ve izlediklerini işaretle.</p></div></div>';
 root.innerHTML=heading+'<div class="detail-episodes-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> Sezonlar yükleniyor…</div>';
 const auth=getDetailTmdbAuth();if(!auth||!item.tmdbId){root.innerHTML=heading+'<p class="detail-episodes-empty">Bölüm listesi için Yönetim Merkezi’ndeki TMDB erişim anahtarı gerekli.</p>';return;}
 try{
  const response=await fetch('https://api.themoviedb.org/3/tv/'+encodeURIComponent(item.tmdbId)+'?language=tr-TR'+auth.query,{headers:auth.headers});
  if(!response.ok)throw new Error('TMDB HTTP '+response.status);
  const data=await response.json();if(request!==detailEpisodeRequest||String(detailEpisodeState.itemId)!==String(item.id))return;
  detailEpisodeState.seasons=(Array.isArray(data.seasons)?data.seasons:[]).filter(season=>Number(season.season_number)>0&&Number(season.episode_count)>0);
  updateDetailSeriesDashboard(item);
  if(!detailEpisodeState.seasons.length){root.innerHTML=heading+'<p class="detail-episodes-empty">Bu dizi için sezon bilgisi bulunamadı.</p>';return;}
  root.innerHTML=heading+'<span class="detail-episodes-total">'+detailEpisodeState.seasons.length+' sezon</span><div class="detail-episodes-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> Bölümler hazırlanıyor…</div>';
  let preferredSeason=0;try{preferredSeason=Number(localStorage.getItem('perde_last_series_season_v1_'+String(item.id)))||0;}catch(_){};if(!detailEpisodeState.seasons.some(season=>Number(season.season_number)===preferredSeason))preferredSeason=Number(detailEpisodeState.seasons[0].season_number);await loadDetailEpisodeSeason(item,preferredSeason);
  if(request===detailEpisodeRequest&&!root.querySelector('.detail-episodes-heading'))root.insertAdjacentHTML('afterbegin',heading);
 }catch(error){if(request!==detailEpisodeRequest)return;root.innerHTML=heading+'<p class="detail-episodes-empty">Sezon bilgileri şu anda alınamadı. TMDB bağlantısını kontrol edip tekrar deneyebilirsin.</p>';console.warn('Dizi sezon bilgileri alınamadı:',error);}
}


const detailSeriesLayoutOrigins = new Map();
function moveDetailSeriesNode(node,target){
 if(!node||!target)return;
 if(!detailSeriesLayoutOrigins.has(node)){
  const placeholder=document.createComment('detail-series-origin');
  node.parentNode.insertBefore(placeholder,node);
  detailSeriesLayoutOrigins.set(node,placeholder);
 }
 target.appendChild(node);
}
function restoreDetailSeriesLayout(){
 detailSeriesLayoutOrigins.forEach((placeholder,node)=>{
  if(placeholder.parentNode)placeholder.parentNode.insertBefore(node,placeholder.nextSibling);
  placeholder.remove();
 });
 detailSeriesLayoutOrigins.clear();
 const root=document.getElementById('detail-page-view');
 const layout=document.getElementById('detail-series-layout');
 root?.classList.remove('is-series-redesign');
 if(layout)layout.hidden=true;
 const visual=root?.querySelector('.detail-visual'),main=root?.querySelector('.detail-main');
 if(visual)visual.hidden=false;
 if(main)main.hidden=false;
}
function mountDetailSeriesLayout(){
 const root=document.getElementById('detail-page-view');
 const layout=document.getElementById('detail-series-layout');
 if(!root||!layout)return;
 const visual=root.querySelector('.detail-visual'),main=root.querySelector('.detail-main');
 moveDetailSeriesNode(document.getElementById('detail-backdrop'),document.getElementById('series-backdrop-slot'));
 moveDetailSeriesNode(main?.querySelector('.detail-poster-column'),document.getElementById('series-poster-slot'));
 moveDetailSeriesNode(main?.querySelector('.detail-copy'),document.getElementById('series-copy-slot'));
 moveDetailSeriesNode(document.getElementById('detail-episodes'),document.getElementById('series-episodes-slot'));
 moveDetailSeriesNode(document.getElementById('detail-personal-info'),document.getElementById('series-personal-slot'));
 moveDetailSeriesNode(document.getElementById('detail-credits'),document.getElementById('series-credits-slot'));
 moveDetailSeriesNode(document.getElementById('detail-related'),document.getElementById('series-related-slot'));
 if(visual)visual.hidden=true;
 if(main)main.hidden=true;
 layout.hidden=false;
 root.classList.add('is-series-redesign');
}
function updateDetailSeriesDashboard(item){
 const dashboard=document.getElementById('detail-series-dashboard');
 if(dashboard){dashboard.hidden=true;dashboard.innerHTML='';}
}
function renderDetailSeries(item){
 const panel=document.getElementById('detail-series-panel');
 const stats=document.getElementById('detail-series-stats');
 const duration=document.getElementById('detail-duration');
 const durationSeparator=document.getElementById('detail-duration-separator');
 if(!panel||!stats)return;
 const isSeries=item.type==='tv';
 panel.hidden=true;
 if(duration)duration.hidden=isSeries||!item.duration;
 if(durationSeparator)durationSeparator.hidden=isSeries||!item.duration;
 stats.innerHTML='';
 if(isSeries)mountDetailSeriesLayout();else restoreDetailSeriesLayout();
 updateDetailSeriesDashboard(item);
}
function ensureDetailSynopsisPopup(){
 let popup=document.getElementById('detail-synopsis-popup');
 if(popup)return popup;
 popup=document.createElement('div');
 popup.id='detail-synopsis-popup';
 popup.className='detail-synopsis-popup';
 popup.hidden=true;
 popup.setAttribute('role','dialog');
 popup.setAttribute('aria-modal','true');
 popup.setAttribute('aria-labelledby','detail-synopsis-popup-title');
 popup.innerHTML='<div class="detail-synopsis-backdrop" data-synopsis-close></div><section class="detail-synopsis-dialog"><header><div><span>KONU DETAYI</span><h2 id="detail-synopsis-popup-title"></h2></div><button type="button" class="detail-synopsis-close" data-synopsis-close aria-label="Pencereyi kapat"><i class="fa-solid fa-xmark"></i></button></header><p id="detail-synopsis-popup-text"></p></section>';
 document.body.appendChild(popup);
 popup.addEventListener('click',event=>{if(event.target.closest('[data-synopsis-close]'))closeDetailSynopsisPopup();});
 return popup;
}
function closeDetailSynopsisPopup(){
 const popup=document.getElementById('detail-synopsis-popup');
 if(!popup)return;
 popup.hidden=true;
 document.body.classList.remove('detail-synopsis-open');
}
function openDetailSynopsisPopup(){
 const popup=ensureDetailSynopsisPopup();
 const title=document.getElementById('detail-title')?.textContent||'Yapım konusu';
 const description=document.getElementById('detail-desc')?.textContent||'';
 document.getElementById('detail-synopsis-popup-title').textContent=title;
 document.getElementById('detail-synopsis-popup-text').textContent=description;
 popup.hidden=false;
 document.body.classList.add('detail-synopsis-open');
 popup.querySelector('.detail-synopsis-close')?.focus();
}
function updateDetailSynopsis(item){
 const description=document.getElementById('detail-desc');
 if(!description)return;
 let button=document.getElementById('detail-synopsis-read-more');
 if(!button){
  button=document.createElement('button');
  button.type='button';button.id='detail-synopsis-read-more';button.className='detail-synopsis-read-more';
  button.textContent='Tamamını Oku';button.addEventListener('click',openDetailSynopsisPopup);
  description.insertAdjacentElement('afterend',button);
 }
 // Film ve dizi açıklamalarını aynı şekilde dört satırla sınırla.
 description.classList.add('detail-synopsis-clamped');
 button.hidden=true;
 requestAnimationFrame(()=>{
  if(!description.isConnected)return;
  const style=window.getComputedStyle(description);
  const lineHeight=parseFloat(style.lineHeight)||20;
  button.hidden=description.scrollHeight<=lineHeight*4+2;
 });
}
document.addEventListener('keydown',event=>{
 if(event.key==='Escape')closeDetailSynopsisPopup();
});
function renderDetailPersonalInfo(item){
 const panel=document.getElementById('detail-personal-info');
 if(!panel)return;
 const note=String(item.personalNote||'').trim();
 const platforms=(Array.isArray(item.platform)?item.platform:String(item.platform||'').split(/[,;|]/)).map(value=>String(value||'').trim()).filter(Boolean);
 const watchUrl=String(item.watchUrl||'').trim();
 const validUrl=(()=>{
  if(!watchUrl)return '';
  try{const parsed=new URL(watchUrl);return ['http:','https:'].includes(parsed.protocol)?parsed.href:'';}catch(_){return '';}
 })();
 const platformIcons={
  'netflix':['netflix','<path d="M7 4h5l8 24h-5L7 4zm13 0h5v24h-5V4zM7 4h5v24H7z"/>'],
  'prime video':['prime','<path d="M8 10h12a5 5 0 0 1 0 10h-4"/><path d="m17 16 4 4-4 4"/><path d="M5 25c6 3 14 3 21-1"/>'],
  'primevideo':['prime','<path d="M8 10h12a5 5 0 0 1 0 10h-4"/><path d="m17 16 4 4-4 4"/><path d="M5 25c6 3 14 3 21-1"/>'],
  'disney+':['disney','<path d="M4 17c5-10 19-13 25-6"/><path d="M17 5c2 3 3 6 3 10"/><path d="m24 4 1.2 2.5L28 7l-2 2 .5 2.8L24 10.5 21.5 12l.5-2.8-2-2 2.8-.5L24 4z"/>'],
  'disney plus':['disney','<path d="M4 17c5-10 19-13 25-6"/><path d="M17 5c2 3 3 6 3 10"/><path d="m24 4 1.2 2.5L28 7l-2 2 .5 2.8L24 10.5 21.5 12l.5-2.8-2-2 2.8-.5L24 4z"/>'],
  'max':['max','<path d="M4 25V8l8 10 8-10v17"/><path d="M20 8h3a5 5 0 0 1 0 10h-3"/>'],
  'apple tv+':['apple','<path d="M20.5 16.5c0-3 2.4-4.5 2.5-4.6-1.4-2-3.6-2.3-4.4-2.3-1.9-.2-3.7 1.1-4.7 1.1s-2.5-1.1-4.1-1.1c-2.1 0-4 1.2-5.1 3-2.2 3.8-.6 9.4 1.5 12.5 1 1.5 2.2 3.1 3.8 3 1.5-.1 2.1-1 4-1s2.5 1 4.1 1 2.7-1.5 3.7-3.1c1.2-1.8 1.7-3.5 1.7-3.6-.1 0-3-.9-3-4.9z"/><path d="M17.5 6.8c.8-1 1.3-2.4 1.2-3.8-1.2.1-2.7.8-3.6 1.8-.8.9-1.4 2.3-1.2 3.6 1.4.1 2.8-.6 3.6-1.6z"/>'],
  'apple tv':['apple','<path d="M20.5 16.5c0-3 2.4-4.5 2.5-4.6-1.4-2-3.6-2.3-4.4-2.3-1.9-.2-3.7 1.1-4.7 1.1s-2.5-1.1-4.1-1.1c-2.1 0-4 1.2-5.1 3-2.2 3.8-.6 9.4 1.5 12.5 1 1.5 2.2 3.1 3.8 3 1.5-.1 2.1-1 4-1s2.5 1 4.1 1 2.7-1.5 3.7-3.1c1.2-1.8 1.7-3.5 1.7-3.6-.1 0-3-.9-3-4.9z"/><path d="M17.5 6.8c.8-1 1.3-2.4 1.2-3.8-1.2.1-2.7.8-3.6 1.8-.8.9-1.4 2.3-1.2 3.6 1.4.1 2.8-.6 3.6-1.6z"/>'],
  'mubi':['mubi','<circle cx="16" cy="16" r="13"/><path d="M8 21V11l5 6 3-4 3 4 5-6v10" stroke="#111" stroke-width="2.2" fill="none"/>'],
  'blutv':['blutv','<rect x="4" y="4" width="24" height="24" rx="7"/><path d="M12 9v14m0-14h6a3 3 0 0 1 0 6h-6m0 0h7a4 4 0 0 1 0 8h-7" stroke="#fff" stroke-width="2" fill="none"/>'],
  'blu tv':['blutv','<rect x="4" y="4" width="24" height="24" rx="7"/><path d="M12 9v14m0-14h6a3 3 0 0 1 0 6h-6m0 0h7a4 4 0 0 1 0 8h-7" stroke="#fff" stroke-width="2" fill="none"/>'],
  'tod':['tod','<circle cx="16" cy="16" r="13"/><path d="m13 10 9 6-9 6z" fill="#fff" stroke="none"/>'],
  'tabii':['tabii','<path d="M7 8h18M16 5v18a4 4 0 0 0 4 4h3"/><circle cx="8" cy="24" r="3"/>'],
  'gain':['gain','<rect x="3" y="3" width="26" height="26" rx="8"/><path d="M23 11a9 9 0 1 0 1 8h-8" stroke="#f04452" stroke-width="3" fill="none"/>']
 };
 const platformMarkup=platforms.length?'<div class="detail-personal-platform"><span class="detail-personal-label">Yayın platformları</span><div class="detail-platform-brands">'+platforms.map(platform=>{
  const brand=platformIcons[platform.toLocaleLowerCase('tr-TR')];
  const icon=brand?'<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" focusable="false">'+brand[1]+'</svg>':'<span class="detail-platform-logo-fallback">'+escapeCountryHtml(platform.slice(0,1).toLocaleUpperCase('tr-TR'))+'</span>';
  const kind=brand?brand[0]:'other';
  return '<span class="detail-platform-brand detail-platform-brand-'+kind+'"><span class="detail-platform-logo" aria-hidden="true">'+icon+'</span><span class="detail-platform-name">'+escapeCountryHtml(platform)+'</span></span>';
 }).join('')+'</div></div>':'';
 const watchMarkup=validUrl?'<a class="detail-personal-watch" href="'+escapeCountryHtml(validUrl)+'" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-play" aria-hidden="true"></i> İzleme bağlantısını aç</a>':'';
 const noteMarkup=note?'<div class="detail-personal-note"><span class="detail-personal-label">Kişisel notun</span><p>'+escapeCountryHtml(note).replace(/\n/g,'<br>')+'</p></div>':'';
 const hasInfo=!!(note||platforms.length||validUrl);
 panel.hidden=!hasInfo;
 if(!hasInfo){panel.innerHTML='';return;}
 panel.innerHTML='<div class="detail-personal-card"><div class="detail-personal-heading"><h2>Senin notların</h2></div><div class="detail-personal-content">'+platformMarkup+noteMarkup+watchMarkup+'</div></div>';
}

const detailCastCacheKey='perde_tmdb_cast_cache_v2';
let detailCastRequestSequence=0;
function readDetailCastCache(key){
 try{const cache=JSON.parse(localStorage.getItem(detailCastCacheKey)||'{}');return Array.isArray(cache[key])?cache[key]:null;}catch(_){return null;}
}
function writeDetailCastCache(key,cast){
 try{const cache=JSON.parse(localStorage.getItem(detailCastCacheKey)||'{}');cache[key]=cast;localStorage.setItem(detailCastCacheKey,JSON.stringify(cache));}catch(_){}
}
async function loadTmdbDetailCast(item){
 const id=String(item.tmdbId||'').trim();
 if(!/^\\d+$/.test(id))return;
 const mediaType=item.type==='tv'?'tv':'movie';
 const cacheKey=mediaType+':'+id;
 const isRichCast=value=>Array.isArray(value)&&value.length>0&&value.every(person=>person&&typeof person==='object'&&person.name)&&value.some(person=>person.profile||person.character);
 const cached=readDetailCastCache(cacheKey);
 if(isRichCast(cached)){item.tmdbCast=cached;renderDetailCredits(item);return;}
 let token='';
 try{token=(localStorage.getItem('perde_tmdb_read_token_v1')||'').trim();}catch(_){}
 if(!token)return;
 let headers={Accept:'application/json'},query='?language=tr-TR';
 if(/^[a-z0-9]{32}$/i.test(token))query+='&api_key='+encodeURIComponent(token);
 else if(token.split('.').length===3&&token.startsWith('eyJ'))headers.Authorization='Bearer '+token;
 else{console.warn('TMDB oyuncu verisi: kayıtlı anahtar biçimi tanınmadı.');return;}
 const requestId=++detailCastRequestSequence;
 try{
  const response=await fetch('https://api.themoviedb.org/3/'+mediaType+'/'+encodeURIComponent(id)+'/credits'+query,{headers});
  if(!response.ok)throw new Error('TMDB HTTP '+response.status);
  const payload=await response.json();
  const cast=(payload.cast||[]).filter(person=>person&&person.name).slice(0,10).map(person=>({id:person.id||null,name:person.name,character:person.character||'',profile:person.profile_path?'https://image.tmdb.org/t/p/w500'+person.profile_path:'',order:Number.isFinite(Number(person.order))?Number(person.order):999}));
  if(!cast.length){console.warn('TMDB oyuncu verisi boş döndü:',mediaType,id);return;}
  writeDetailCastCache(cacheKey,cast);
  item.tmdbCast=cast;
  if(requestId===detailCastRequestSequence&&String(location.hash).includes(encodeURIComponent(String(item.id))))renderDetailCredits(item);
 }catch(error){console.warn('Oyuncu bilgileri TMDB üzerinden alınamadı:',error);}
}

function renderDetailCredits(item){
 const panel=document.getElementById('detail-credits');
 if(!panel)return;
 const rawCast=Array.isArray(item.tmdbCast)&&item.tmdbCast.length?item.tmdbCast:item.cast;
 const cast=(Array.isArray(rawCast)?rawCast.map(person=>typeof person==='string'?{name:person,character:'',profile:''}:({name:person?.name||'',character:person?.character||'',profile:person?.profile||''})):String(rawCast||'').split(/[,;|]/).map(x=>x.trim()).map(name=>({name,character:'',profile:''}))).filter(person=>person.name).slice(0,10);
 panel.hidden=!cast.length;
 if(!cast.length){panel.innerHTML='';return;}
 let page=0;
 const render=()=>{
  const visible=cast.slice(page*6,page*6+6);
  const rows=visible.map((person,index)=>{
   const photo=String(person.profile||'').replace('/w185/','/w500/').replace('/w342/','/w500/');
   const initials=person.name.split(/\\s+/).map(part=>part[0]||'').slice(0,2).join('').toLocaleUpperCase('tr-TR');
   return '<button type="button" class="perde-cast-entry" data-actor-name="'+escapeCountryHtml(person.name)+'" aria-label="'+escapeCountryHtml(person.name)+(person.character?' - '+escapeCountryHtml(person.character):'')+' oyuncu profilini aç">'+
    '<span class="perde-cast-portrait">'+(photo?'<img src="'+escapeCountryHtml(photo)+'" alt="'+escapeCountryHtml(person.name)+'" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false">':'')+'<span class="perde-cast-initials" '+(photo?'hidden':'')+'>'+escapeCountryHtml(initials)+'</span></span>'+
    '<span class="perde-cast-identity"><strong>'+escapeCountryHtml(person.name)+'</strong><small>'+(person.character?escapeCountryHtml(person.character):'Rol bilgisi bulunmuyor')+'</small></span>'+
    '<span class="perde-cast-number">'+String(page*6+index+1).padStart(2,'0')+'</span></button>';
  }).join('');
  panel.innerHTML='<div class="perde-cast-roster"><header class="perde-cast-header"><div><h2>Oyuncular</h2></div><div class="perde-cast-navigation" '+(cast.length<=6?'hidden':'')+'><span>'+String(page+1)+' / '+String(Math.ceil(cast.length/6))+'</span><button type="button" data-page="-1" '+(page===0?'disabled':'')+' aria-label="Önceki oyuncular">←</button><button type="button" data-page="1" '+((page+1)*6>=cast.length?'disabled':'')+' aria-label="Sonraki oyuncular">→</button></div></header><div class="perde-cast-list">'+rows+'</div></div>';
  panel.querySelectorAll('[data-page]').forEach(button=>button.addEventListener('click',()=>{const nextPage=Math.max(0,Math.min(Math.ceil(cast.length/6)-1,page+Number(button.dataset.page)));if(nextPage===page)return;const list=panel.querySelector('.perde-cast-list');if(list)list.classList.add('is-leaving');window.setTimeout(()=>{page=nextPage;render();},130);}));
 };
 render();
}

const filmAwardsCacheKey='perde_film_awards_wikidata_v1';
let filmAwardsRequestSequence=0;
function readFilmAwardsCache(key){
 try{const cache=JSON.parse(localStorage.getItem(filmAwardsCacheKey)||'{}');const entry=cache[key];if(!entry||!Number.isFinite(entry.at)||Date.now()-entry.at>30*24*60*60*1000)return null;return Array.isArray(entry.rows)?entry.rows:null;}catch(_){return null;}
}
function writeFilmAwardsCache(key,rows){
 try{const cache=JSON.parse(localStorage.getItem(filmAwardsCacheKey)||'{}');cache[key]={at:Date.now(),rows};localStorage.setItem(filmAwardsCacheKey,JSON.stringify(cache));}catch(_){}
}
function normalizeFilmAwardRows(rows){
 const seen=new Set();
 return (rows||[]).map(row=>{
  const award=String(row.award||row.label||'').trim();
  if(!award)return null;
  const result=String(row.result||'Ödül bilgisi').trim();
  const year=String(row.year||'').trim();
  const key=[award.toLocaleLowerCase('tr-TR'),result,year].join('|');
  if(seen.has(key))return null;seen.add(key);
  return {award,result,year,url:String(row.url||'')};
 }).filter(Boolean).slice(0,30);
}
function renderFilmAwardResults(item,rows,state='loaded'){
 const root=document.getElementById('detail-film-extras');
 if(!root||root.dataset.mediaId!==String(item.id))return;
 const content=root.querySelector('#detail-awards-content');
 if(!content)return;
 const normalized=normalizeFilmAwardRows(rows);
 if(state==='loading'){
  content.innerHTML='<div class="detail-award-loading"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i><span>Ödül ve adaylık bilgileri aranıyor…</span></div>';
  return;
 }
 if(!normalized.length){
  const manual=String(item.awards||item.tmdbAwards||item.awardSummary||item.nominations||item.oscars||'').split(/\r?\n/).map(value=>value.trim()).filter(Boolean).slice(0,12);
  if(manual.length){
   content.innerHTML='<ul class="detail-award-list">'+manual.map(row=>'<li><i class="fa-solid fa-award" aria-hidden="true"></i><span>'+escapeCountryHtml(row)+'</span></li>').join('')+'</ul><div class="detail-award-source">Elle doğrulanmış katalog bilgisi</div>';
  }else{
   content.innerHTML='<div class="detail-award-empty"><i class="fa-solid fa-trophy" aria-hidden="true"></i><p>Bu film için Wikidata üzerinde doğrulanmış ödül veya adaylık kaydı bulunamadı.</p></div>';
  }
  return;
 }
 const list=normalized.map(row=>'<li><i class="fa-solid fa-award" aria-hidden="true"></i><span class="detail-award-copy"><strong>'+escapeCountryHtml(row.award)+'</strong><small>'+escapeCountryHtml([row.result,row.year].filter(Boolean).join(' · '))+'</small></span>'+(row.url?'<a href="'+escapeCountryHtml(row.url)+'" target="_blank" rel="noopener noreferrer" aria-label="Ödül kaynağını aç"><i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></a>':'')+'</li>').join('');
 content.innerHTML='<ul class="detail-award-list">'+list+'</ul>'+(normalized.length>4?'<button type="button" class="detail-award-more" aria-expanded="false">Tüm ödül ve adaylıkları göster <i class="fa-solid fa-chevron-down" aria-hidden="true"></i></button>':'')+'<div class="detail-award-source">Kaynak: <a href="https://www.wikidata.org/" target="_blank" rel="noopener noreferrer">Wikidata</a> · Otomatik güncellenir</div>';
 const more=content.querySelector('.detail-award-more');
 if(more)more.addEventListener('click',()=>{
  const expanded=content.classList.toggle('is-expanded');
  more.setAttribute('aria-expanded',String(expanded));
  more.innerHTML=expanded?'Daha az göster <i class="fa-solid fa-chevron-up" aria-hidden="true"></i>':'Tüm ödül ve adaylıkları göster <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>';
 });
}
async function loadFilmAwards(item){
 const tmdbId=String(item.tmdbId||'').replace(/\D/g,'');
 const imdbId=String(item.imdbId||item.imdb_id||'').trim();
 if(!tmdbId&&!/^tt\d{7,10}$/i.test(imdbId)){
  renderFilmAwardResults(item,[],'loaded');return;
 }
 const cacheId=tmdbId?'tmdb:'+tmdbId:'imdb:'+imdbId;
 const cached=readFilmAwardsCache(cacheId);
 if(cached){renderFilmAwardResults(item,cached,'loaded');return;}
 renderFilmAwardResults(item,[],'loading');
 const clauses=[];
 if(tmdbId){
  clauses.push('{ ?film wdt:P4947 "'+tmdbId+'" . }');
  clauses.push('{ ?film wdt:P4983 "'+tmdbId+'" . }');
 }
 if(/^tt\d{7,10}$/i.test(imdbId))clauses.push('{ ?film wdt:P345 "'+imdbId+'" . }');
 const query='SELECT DISTINCT ?award ?awardLabel ?date ?result WHERE { { '+clauses.join(' UNION ')+' } { { ?film p:P166 ?statement . ?statement ps:P166 ?award . BIND("Kazandı" AS ?result) } UNION { ?film p:P1411 ?statement . ?statement ps:P1411 ?award . BIND("Aday gösterildi" AS ?result) } } OPTIONAL { ?statement pq:P585 ?date . } SERVICE wikibase:label { bd:serviceParam wikibase:language "tr,en" . } } ORDER BY DESC(?date) LIMIT 30';
 const requestId=++filmAwardsRequestSequence;
 try{
  const response=await fetch('https://query.wikidata.org/sparql?query='+encodeURIComponent(query)+'&format=json',{headers:{Accept:'application/sparql-results+json'}});
  if(!response.ok)throw new Error('Wikidata HTTP '+response.status);
  const payload=await response.json();
  const rows=(payload.results?.bindings||[]).map(row=>{
   const award=row.awardLabel?.value||'';
   const rawDate=row.date?.value||'';
   const year=(rawDate.match(/\d{4}/)||[])[0]||'';
   const uri=row.award?.value||'';
   return {award,result:row.result?.value||'',year,url:uri};
  });
  const normalized=normalizeFilmAwardRows(rows);
  writeFilmAwardsCache(cacheId,normalized);
  if(requestId===filmAwardsRequestSequence)renderFilmAwardResults(item,normalized,'loaded');
 }catch(error){
  console.warn('Film ödül bilgileri alınamadı:',error);
  if(requestId===filmAwardsRequestSequence)renderFilmAwardResults(item,[],'loaded');
 }
}
function renderFilmDetailExtras(item){
 const detailView=document.getElementById('detail-page-view');
 if(!detailView)return;
 let root=document.getElementById('detail-film-extras');
 if(!root){
  root=document.createElement('section');
  root.id='detail-film-extras';
  root.className='detail-film-extras';
  const related=document.getElementById('detail-related');
  if(related)related.insertAdjacentElement('afterend',root);
  else detailView.querySelector('.detail-main')?.appendChild(root);
 }
 if(item.type==='tv'){root.hidden=true;root.innerHTML='';return;}
 root.hidden=false;root.dataset.mediaId=String(item.id);
 const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('tr-TR').trim();
 const directors=countryTokens(item.tmdbDirector||item.director).map(normalize).filter(Boolean);
 const sameDirector=directors.length?mediaDatabase.filter(candidate=>{
  if(!candidate||String(candidate.id)===String(item.id)||candidate.type==='tv'||!candidate.title||!(candidate.tmdbPoster||candidate.image))return false;
  const names=countryTokens(candidate.tmdbDirector||candidate.director).map(normalize);
  return names.some(name=>directors.includes(name));
 }):[];
 const previewFilms=sameDirector.slice(0,6);
 const directorName=countryTokens(item.tmdbDirector||item.director)[0]||'';
 const directorMarkup=previewFilms.length
  ?'<div class="detail-director-film-grid">'+previewFilms.map(media=>'<button type="button" class="detail-director-film" data-detail-extra-id="'+escapeCountryHtml(media.id)+'"><img src="'+escapeCountryHtml(media.tmdbPoster||media.image)+'" alt="'+escapeCountryHtml(media.title)+'" loading="lazy"><span><strong>'+escapeCountryHtml(media.title)+'</strong><small>'+escapeCountryHtml(media.year||String(media.tmdbReleaseDate||'').slice(0,4)||'')+'</small></span></button>').join('')+'</div>'
  :'<p class="detail-extra-empty">Katalogda aynı yönetmene ait başka film bulunamadı.</p>';
 const directorMore=sameDirector.length
  ?'<button type="button" class="detail-director-more" data-director-filmography="'+escapeCountryHtml(directorName)+'"><span>'+(sameDirector.length>6?'Tümünü Gör':'Yönetmenin Filmografisini Gör')+'</span><strong>'+sameDirector.length+' Film</strong><i class="fa-solid fa-arrow-right"></i></button>'
  :'';
 root.innerHTML='<div class="detail-film-extra-grid"><article class="detail-film-extra-card detail-awards-card"><div class="detail-film-extra-heading"><span>ÖDÜLLER & ADAYLIKLAR</span><i class="fa-solid fa-trophy" aria-hidden="true"></i></div><h2>Başarıları</h2><div id="detail-awards-content" class="detail-awards-content"></div></article><article class="detail-film-extra-card detail-same-director-card"><div class="detail-film-extra-heading"><span>YÖNETMENİN DİĞER FİLMLERİ</span><i class="fa-solid fa-clapperboard" aria-hidden="true"></i></div><h2>Aynı yönetmenden</h2>'+directorMarkup+directorMore+'</article></div>';
 root.querySelectorAll('[data-detail-extra-id]').forEach(button=>button.addEventListener('click',()=>openDetailPage(button.dataset.detailExtraId)));
 root.querySelector('[data-director-filmography]')?.addEventListener('click',event=>filterByDirector(event.currentTarget.dataset.directorFilmography));
 loadFilmAwards(item);
}

function openDetailPage(id,update=true){
 const item=mediaDatabase.find(m=>String(m.id)===String(id))||mediaDatabase[0];if(!item)return;
 if(update){const prefix=item.type==='tv'?'dizi':'film';const path='#/'+prefix+'/'+encodeURIComponent(item.id);if(location.hash!==path)history.pushState(null,'',path);}
 document.getElementById('theme-body').style.backgroundColor='#050505';
 applyPosterAtmosphere(item);
 const posterImage=item.tmdbPoster||item.image||item.tmdbBackdrop||item.backdrop||'';
 const backdropImage=item.tmdbBackdrop||item.backdrop||posterImage;
 document.getElementById('detail-backdrop').src=backdropImage;
 const detailScene=backdropImage||posterImage;document.getElementById('detail-page-view').style.setProperty('--detail-scene-image',detailScene?'url("'+String(detailScene).replace(/"/g,'%22')+'")':'none');
 document.getElementById('detail-poster').src=posterImage;
 document.getElementById('detail-title').innerText=item.title;
 let detailOriginal=document.getElementById('detail-original-title');if(!detailOriginal){detailOriginal=document.createElement('small');detailOriginal.id='detail-original-title';detailOriginal.className='media-original-title detail-original-title';document.getElementById('detail-title').after(detailOriginal);}detailOriginal.dataset.mediaId=String(item.id);detailOriginal.textContent=item.originalTitle||'';detailOriginal.hidden=!item.originalTitle;
 document.getElementById('detail-category').innerText=item.tmdbGenres||item.category||item.genre||'';
 // IMDb puanı alt değerlendirme satırında tek kez gösterilir.
 document.getElementById('detail-year').innerText=String(item.tmdbReleaseDate||'').slice(0,4)||item.year||'';
 document.getElementById('detail-duration').innerText=item.tmdbRuntime||item.duration||'';
 const detailKind=item.type==='tv'?'Dizi':(['documentary','doc','belgesel'].includes(String(item.type||'').toLocaleLowerCase('tr-TR'))?'Belgesel':'Film');
 document.getElementById('detail-type-label').innerText=detailKind;
 const countries=countryTokens(item.tmdbCountries||item.country);
 const directors=countryTokens(item.tmdbDirector||item.director);
 const countryMarkup=countries.map(country=>{const info=countryDisplay(country);return '<button type="button" class="detail-country-chip" data-country="'+escapeCountryHtml(country)+'" aria-label="'+escapeCountryHtml(info.name)+' yapımlarını göster">'+countryFlagImage(info.iso,'flag-image')+'<span>'+escapeCountryHtml(info.name)+'</span></button>';}).join('');
 document.getElementById('detail-country').innerHTML=countryMarkup||'<span>Ülke bilgisi yok</span>';
 document.getElementById('detail-director-inline').innerHTML=directors.length?'<span class="detail-director-label">Yönetmen:</span> '+directors.map(director=>'<button type="button" class="detail-director-link" data-director="'+escapeCountryHtml(director)+'">'+escapeCountryHtml(director)+'</button>').join('<span class="detail-director-comma">, </span>'):'';
 document.getElementById('detail-desc').innerText=item.tmdbOverview||item.desc||'Açıklama henüz eklenmemiş.';
 updateDetailSynopsis(item);
 const readScore=(...values)=>{for(const value of values){const candidate=value&&typeof value==='object'?(value.value??value.score??value.rating):value;if(candidate!==undefined&&candidate!==null&&String(candidate).trim()!==''&&String(candidate).trim().toLowerCase()!=='n/a')return String(candidate).trim();}return '';};
 const scoreItems=[
  {key:'imdb',logo:'IMDb',value:readScore(item.rating,item.imdbRating,item.imdb_rating)},
  {key:'tmdb',logo:'TMDB',value:readScore(item.tmdbRating,item.tmdb_rating,item.tmdb?.value,item.tmdb?.rating,item.vote_average)}
 ];
 document.getElementById('detail-score-items').innerHTML=scoreItems.map(score=>'<span class="detail-score-pill score-'+score.key+(score.value?'':' is-unavailable')+'"><span class="score-brand score-brand-'+score.key+'" aria-label="'+score.logo+'">'+(score.key==='imdb'?'<b>IMDb</b>':'<i class="score-tmdb-symbol">T</i><b>TMDB</b>')+'</span><strong>'+(score.value?escapeCountryHtml(score.value):'Veri yok')+'</strong></span>').join('');
 updateDetailButtons(item.id);
 
 document.getElementById('detail-trailer-btn').onclick=()=>openTrailerPopup(item.id);
 const watchPlayButton=document.getElementById('detail-watch-play-btn');if(watchPlayButton){watchPlayButton.hidden=item.type==='tv'&&!item.watchUrl;watchPlayButton.onclick=()=>openPlayerForMedia(item.id);}
 const related=getRelatedMedia(item,10);
 document.getElementById('detail-related-rail').innerHTML=related.map(m=>'<article class="collection-card" onclick="openDetailPage(\''+m.id+'\')"><div class="collection-poster-wrap"><img src="'+m.image+'" alt="'+m.title+'" loading="lazy"><span class="collection-rating">★ '+(m.rating||'—')+'</span></div><div class="collection-card-copy"><h3>'+m.title+'</h3>'+originalTitleMarkup(m,'collection-original-title')+'<p>'+m.year+' • '+(m.type==='tv'?'Dizi':'Film')+'</p></div></article>').join('');
 renderDetailSeries(item);
 renderDetailEpisodes(item);
 renderDetailPersonalInfo(item);
 renderDetailCredits(item);
 renderFilmDetailExtras(item);
 loadTmdbDetailCast(item);
 document.getElementById('dashboard-view').classList.add('hidden');
 document.getElementById('actor-page-view').classList.add('hidden');
 const detailView=document.getElementById('detail-page-view');
 detailView.classList.remove('hidden');
 requestAnimationFrame(()=>{const main=detailView.querySelector('.detail-main'),trailer=detailView.querySelector('.detail-poster-trailer');if(main&&trailer){const top=trailer.getBoundingClientRect().top-main.getBoundingClientRect().top;main.style.setProperty('--detail-frame-top',Math.max(0,top)+'px');}});
 document.body.classList.remove('ny7-detail-open');
 document.documentElement.classList.remove('ny7-modal-lock');
 document.getElementById('detail-related').classList.remove('hidden');
 window.scrollTo({top:0,behavior:'smooth'});
}

let actorProfileRequestSequence=0;
function escapeCastHtml(value){return escapeCountryHtml(value);}
function normalizeActorName(value){
 return String(value||'').normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('tr-TR').replace(/ı/g,'i').trim().replace(/\s+/g,' ');
}
function looksLikeTurkishBiography(value){
 const text=String(value||'');
 return /[çğıöşü]/i.test(text)||/\b(ve|bir|ile|olarak|için|olan|daha|sonra|yılında|doğdu|oyuncu|yönetmen|kariyerine|başladı|tanınır)\b/i.test(text);
}
async function translateActorBiographyToTurkish(value){
 const source=String(value||'').trim();
 if(!source)return '';
 if(looksLikeTurkishBiography(source))return source;
 const url='https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=tr&dt=t&q='+encodeURIComponent(source);
 const response=await fetch(url,{headers:{Accept:'application/json'}});
 if(!response.ok)throw new Error('Biyografi çevirisi HTTP '+response.status);
 const data=await response.json();
 const translated=Array.isArray(data?.[0])?data[0].map(part=>part?.[0]||'').join('').trim():'';
 if(!translated)throw new Error('Türkçe çeviri alınamadı.');
 return translated;
}

async function fetchTmdbActorProfile(name){
 let token='';
 try{token=(localStorage.getItem('perde_tmdb_read_token_v1')||'').trim();}catch(_){}
 if(!token)throw new Error('TMDB Read Access Token yönetim panelinde kayıtlı değil.');
 const headers={Accept:'application/json'};
 let authQuery='?language=tr-TR';
 if(/^[a-z0-9]{32}$/i.test(token))authQuery+='&api_key='+encodeURIComponent(token);
 else if(token.split('.').length===3&&token.startsWith('eyJ'))headers.Authorization='Bearer '+token;
 else throw new Error('TMDB anahtar biçimi tanınmadı.');
 const wanted=normalizeActorName(name);
 let personId=null;
 for(const item of mediaDatabase){
  const credits=Array.isArray(item.tmdbCast)?item.tmdbCast:[];
  const match=credits.find(person=>person&&typeof person==='object'&&normalizeActorName(person.name)===wanted&&person.id);
  if(match){personId=Number(match.id);break;}
 }
 if(!personId){
  const search=await fetch('https://api.themoviedb.org/3/search/person'+authQuery+'&query='+encodeURIComponent(name),{headers});
  if(!search.ok)throw new Error('TMDB oyuncu araması HTTP '+search.status);
  const results=(await search.json()).results||[];
  const exact=results.find(person=>normalizeActorName(person.name)===wanted);
  if(!exact)throw new Error('TMDB üzerinde bu isimle kesin oyuncu eşleşmesi bulunamadı.');
  personId=Number(exact.id);
 }
 if(!Number.isFinite(personId)||personId<=0)throw new Error('Geçerli TMDB oyuncu kimliği bulunamadı.');
 const base='https://api.themoviedb.org/3/person/'+encodeURIComponent(personId);
 const response=await fetch(base+authQuery,{headers});
 if(!response.ok)throw new Error('TMDB oyuncu profili HTTP '+response.status);
 let person=await response.json();
 let biography=String(person.biography||'').trim();
 try{
  const translations=await fetch(base+'/translations'+authQuery,{headers});
  if(translations.ok){
   const data=await translations.json();
   const tr=(data.translations||[]).find(item=>String(item.iso_639_1||'').toLowerCase()==='tr');
   const translatedBio=String(tr?.data?.biography||'').trim();
   if(translatedBio)biography=translatedBio;
  }
 }catch(_){}
 if(!biography){
  try{const english=await fetch(base+'?language=en-US'+(authQuery.includes('api_key=')?'&api_key='+encodeURIComponent(token):''),{headers});if(english.ok){const data=await english.json();if(data.biography)biography=String(data.biography).trim();}}catch(_){}
 }
 if(biography){
  try{biography=await translateActorBiographyToTurkish(biography);}
  catch(error){
   console.warn('Perde oyuncu biyografisi Türkçeye çevrilemedi:',error);
   if(!looksLikeTurkishBiography(biography))biography='Bu oyuncunun biyografisi şu anda Türkçe olarak alınamıyor.';
  }
 }
 return {id:person.id,name:person.name,biography,birthday:person.birthday||'',deathday:person.deathday||'',placeOfBirth:person.place_of_birth||'',profile:person.profile_path?'https://image.tmdb.org/t/p/w500'+person.profile_path:'',department:person.known_for_department||'',headers};
}
let actorFilmographyItems=[];
let actorFilmographyFilter='all';
let actorFilmographySort='newest';
let actorFilmographyVisible=12;
function setActorFilmographyFilter(filter){
 actorFilmographyFilter=['all','movie','tv'].includes(filter)?filter:'all';
 actorFilmographyVisible=12;
 document.querySelectorAll('[data-actor-film-filter]').forEach(button=>button.classList.toggle('is-active',button.dataset.actorFilmFilter===actorFilmographyFilter));
 renderActorFilmographyGrid();
}
function setActorFilmographySort(sort){
 actorFilmographySort=['newest','oldest','popular'].includes(sort)?sort:'newest';
 actorFilmographyVisible=12;
 renderActorFilmographyGrid();
}
function showMoreActorFilmography(){
 actorFilmographyVisible+=12;
 renderActorFilmographyGrid();
}
function renderActorFilmographyGrid(){
 const grid=document.getElementById('actor-filmography-grid');
 const controls=document.getElementById('actor-filmography-controls');
 const more=document.getElementById('actor-filmography-more');
 const status=document.getElementById('actor-filmography-status');
 if(!grid)return;
 let items=actorFilmographyItems.filter(item=>actorFilmographyFilter==='all'||item.type===actorFilmographyFilter);
 items.sort((a,b)=>{
  if(actorFilmographySort==='popular'){
   return (Number(b.tmdbVoteCount)||0)-(Number(a.tmdbVoteCount)||0)||(Number(b.tmdbRating||b.rating)||0)-(Number(a.tmdbRating||a.rating)||0);
  }
  const ad=String(a.tmdbReleaseDate||a.year||'');
  const bd=String(b.tmdbReleaseDate||b.year||'');
  return actorFilmographySort==='oldest'?ad.localeCompare(bd):bd.localeCompare(ad);
 });
 const visible=items.slice(0,actorFilmographyVisible);
 grid.innerHTML=visible.map(item=>{
  const cast=Array.isArray(item.tmdbCast)?item.tmdbCast:[];
  const personCredit=cast.find(entry=>entry&&typeof entry==='object'&&((window.activeActorTmdbId&&String(entry.id)===String(window.activeActorTmdbId))||normalizeActorName(entry.name)===normalizeActorName(window.activeActorFilmographyName)));
  const role=personCredit?.character||'';
  const poster=item.image||item.tmdbPoster||item.poster||'';
  const date=String(item.tmdbReleaseDate||item.year||'').slice(0,4);
  const kind=item.type==='tv'?'Dizi':'Film';
  const content=(poster?'<img src="'+escapeCastHtml(poster)+'" alt="'+escapeCastHtml(item.title||'')+'" loading="lazy">':'<span class="actor-work-poster-empty"><i class="fa-solid fa-film"></i></span>')+
   '<span class="actor-work-copy"><b>'+escapeCastHtml(item.title||'Yapım adı yok')+'</b><small>'+escapeCastHtml(date)+' · '+kind+(role?' · '+escapeCastHtml(role):'')+'</small></span>';
  return '<button type="button" class="actor-work-card" onclick="openDetailPage(\''+String(item.id).replace(/'/g,"\\'")+'\')">'+content+'</button>';
 }).join('')||'<p class="actor-filmography-empty">Bu kategoride Perde kataloğunda kayıtlı yapım bulunmuyor.</p>';
 if(status)status.textContent=items.length+' yapımdan '+Math.min(visible.length,items.length)+' tanesi gösteriliyor';
 if(more)more.hidden=visible.length>=items.length;
 if(controls)controls.hidden=actorFilmographyItems.length===0;
}
function renderActorFilmography(person,name,localWorks){
 actorFilmographyItems=[...new Map((Array.isArray(localWorks)?localWorks:[]).filter(item=>item&&item.id).map(item=>[String(item.id),item])).values()];
 actorFilmographyFilter='all';
 actorFilmographySort='newest';
 actorFilmographyVisible=12;
 window.activeActorTmdbId=person?.id||null;
 window.activeActorFilmographyName=name;
 const films=actorFilmographyItems.filter(item=>item.type==='movie').length;
 const series=actorFilmographyItems.filter(item=>item.type==='tv').length;
 document.getElementById('actor-filmography-title').textContent=name+' — '+actorFilmographyItems.length+' yapım';
 document.getElementById('actor-education').textContent=films+' film · '+series+' dizi';
 const filterButtons=document.querySelectorAll('[data-actor-film-filter]');
 filterButtons.forEach(button=>button.classList.toggle('is-active',button.dataset.actorFilmFilter==='all'));
 const sortSelect=document.getElementById('actor-filmography-sort');
 if(sortSelect)sortSelect.value='newest';
 renderActorFilmographyGrid();
}
window.setActorFilmographyFilter=setActorFilmographyFilter;
window.setActorFilmographySort=setActorFilmographySort;
window.showMoreActorFilmography=showMoreActorFilmography;
function openActorPage(name,update=true){
 const profileRequestId=++actorProfileRequestSequence;
 document.body.classList.remove('ny7-detail-open');document.documentElement.classList.remove('ny7-modal-lock');
 const actorName=decodeURIComponent(String(name||'')).trim();if(!actorName)return;
 const normalized=normalizeActorName(actorName);
 const works=mediaDatabase.filter(m=>{const names=[...(Array.isArray(m.cast)?m.cast:[]),...(Array.isArray(m.tmdbCast)?m.tmdbCast.map(p=>typeof p==='string'?p:p?.name):[])];return names.some(v=>normalizeActorName(v)===normalized);});
 if(update){const path='#/oyuncu/'+encodeURIComponent(actorName);if(location.hash!==path)history.pushState(null,'',path);}
 document.getElementById('dashboard-view').classList.add('hidden');document.getElementById('detail-page-view').classList.add('hidden');document.getElementById('detail-related').classList.add('hidden');document.getElementById('actor-page-view').classList.remove('hidden');document.getElementById('theme-body').style.backgroundColor='#07080c';
document.getElementById('actor-biography-title').textContent=actorName;document.getElementById('actor-biography-text').textContent='TMDB oyuncu bilgileri yükleniyor…';
 ['actor-birth-date','actor-birth-place','actor-country','actor-education'].forEach(id=>document.getElementById(id).textContent='Bilgi bulunamadı');
 const deathInfoNode=document.getElementById('actor-death-info');if(deathInfoNode){deathInfoNode.hidden=true;deathInfoNode.textContent='';}
 const avatar='https://ui-avatars.com/api/?name='+encodeURIComponent(actorName)+'&background=252936&color=ffffff&size=512&bold=true';
 document.getElementById('actor-profile-image').src=avatar;
 document.getElementById('actor-filmography-title').textContent=actorName+' — filmografi yükleniyor';
 document.getElementById('actor-filmography-controls').hidden=true;
 document.getElementById('actor-filmography-more').hidden=true;
 document.getElementById('actor-filmography-status').textContent='';
 document.getElementById('actor-filmography-grid').innerHTML='<p>Perde kataloğundaki yapımlar kontrol ediliyor…</p>';
 window.scrollTo({top:0,behavior:'smooth'});
 fetchTmdbActorProfile(actorName).then(async person=>{
  if(profileRequestId!==actorProfileRequestSequence||document.getElementById('actor-page-view').classList.contains('hidden'))return;
  if(!person)throw new Error('TMDB oyuncu eşleşmesi bulunamadı.');
document.getElementById('actor-biography-title').textContent=person.name||actorName;
  document.getElementById('actor-biography-text').textContent=person.biography||'TMDB bu oyuncu için henüz biyografi bilgisi sağlamıyor.';
  const biographyNode=document.getElementById('actor-biography-text'),bioToggle=document.getElementById('actor-bio-toggle');
  biographyNode.classList.remove('is-expanded');
  bioToggle.hidden=biographyNode.textContent.length<320;
  bioToggle.innerHTML='Devamını oku <i class="fa-solid fa-chevron-down"></i>';
  bioToggle.onclick=()=>{const expanded=biographyNode.classList.toggle('is-expanded');bioToggle.innerHTML=expanded?'Daha az göster <i class="fa-solid fa-chevron-up"></i>':'Devamını oku <i class="fa-solid fa-chevron-down"></i>';};
  document.getElementById('actor-birth-date').textContent=person.birthday?new Date(person.birthday+'T00:00:00').toLocaleDateString('tr-TR',{day:'2-digit',month:'2-digit',year:'numeric'}):'Bilgi bulunamadı';
  if(deathInfoNode&&person.deathday&&person.birthday){
   const birthDate=new Date(person.birthday+'T00:00:00Z'),deathDate=new Date(person.deathday+'T00:00:00Z');
   if(!Number.isNaN(birthDate.getTime())&&!Number.isNaN(deathDate.getTime())&&deathDate>=birthDate){
    let age=deathDate.getUTCFullYear()-birthDate.getUTCFullYear();
    if(deathDate.getUTCMonth()<birthDate.getUTCMonth()||(deathDate.getUTCMonth()===birthDate.getUTCMonth()&&deathDate.getUTCDate()<birthDate.getUTCDate()))age--;
    deathInfoNode.textContent='Vefat: '+deathDate.toLocaleDateString('tr-TR',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'UTC'})+' ('+age+' yaşında)';
    deathInfoNode.hidden=false;
   }
  }
  document.getElementById('actor-birth-place').textContent=person.placeOfBirth||'Bilgi bulunamadı';
  const birthplaceCountry=String(person.placeOfBirth||'').split(',').map(part=>part.trim()).filter(Boolean).pop()||'';
  const nationality=countryDisplay(birthplaceCountry);
  document.getElementById('actor-country').innerHTML=nationality.iso?'<span class="actor-country-value">'+countryFlagImage(nationality.iso,'actor-country-flag')+'<span>'+escapeCastHtml(nationality.name)+'</span></span>':(birthplaceCountry?'<span class="actor-country-value">'+escapeCastHtml(nationality.name)+'</span>':'Bilgi bulunamadı');
  const link=document.getElementById('actor-wikipedia-link');link.href='https://www.themoviedb.org/person/'+person.id;link.innerHTML='TMDB üzerinde görüntüle <i class="fa-solid fa-arrow-up-right-from-square"></i>';
  document.getElementById('actor-profile-image').src=person.profile||avatar;
  renderActorFilmography(person,actorName,works);
 }).catch(error=>{
  if(profileRequestId!==actorProfileRequestSequence)return;
  console.error('Perde TMDB oyuncu profili:',error);
  document.getElementById('actor-biography-text').textContent='TMDB oyuncu bilgileri alınamadı: '+(error.message||'Bilinmeyen hata');
  document.getElementById('actor-filmography-title').textContent=actorName+' — filmografi yüklenemedi';
  document.getElementById('actor-filmography-grid').innerHTML='<p>Oyuncu bilgileri alınamadığı için profil tamamlanamadı. TMDB bağlantısını kontrol et.</p>';
  document.getElementById('actor-wikipedia-link').href='https://www.themoviedb.org/search?query='+encodeURIComponent(actorName);
 });
}
window.openActorPage=openActorPage;
window.openActorPage=openActorPage;
document.addEventListener('click',function(event){
 const actorCard=event.target.closest('[data-actor-name]');
 if(actorCard){openActorPage(actorCard.getAttribute('data-actor-name'));return;}
});

window.addEventListener('hashchange',routeFromHash);
window.addEventListener('scroll', function() {
    try {
        const state = history.state && typeof history.state === 'object' ? history.state : {};
        history.replaceState({...state, ny7ScrollY:window.scrollY}, '', location.href);
    } catch (_) {}
}, {passive:true});
window.addEventListener('popstate',function(event){
    routeFromHash();
    const savedY = Number(event.state?.ny7ScrollY);
    if (Number.isFinite(savedY)) requestAnimationFrame(() => {
        const root=document.documentElement, previous=root.style.scrollBehavior;
        root.style.scrollBehavior='auto';
        window.scrollTo(0,savedY);
        requestAnimationFrame(()=>{root.style.scrollBehavior=previous;});
    });
});

// Afiş tıklamalarını tek noktadan yakala; mobil ve masaüstünde detay ekranını aç.
window.openDetailPage = openDetailPage;
document.addEventListener('click', function(event) {
    const poster = event.target.closest('[data-detail-id]');
    if (!poster) return;
    const id = poster.getAttribute('data-detail-id');
    if (id) openDetailPage(id);
});
document.addEventListener('keydown', function(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const poster = event.target.closest('[data-detail-id]');
    if (!poster) return;
    event.preventDefault();
    const id = poster.getAttribute('data-detail-id');
    if (id) openDetailPage(id);
});


// Oynatıcı arayüzü kontrolleri
function launchPlayer(title) {
            const item = mediaDatabase.find(m => m.title === title) || { title: title, image: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=1200&q=80' };
            document.getElementById('player-media-title').innerText = item.title;
            document.getElementById('player-poster').src = item.image;
            document.getElementById('player-modal').classList.remove('hidden');
            document.getElementById('player-modal').classList.add('flex');
        }

        const NY7_PLAYER_STORAGE_KEY='ny7_player_sources_v1';
let activePlayerMediaId=null;
let activePlayerObjectUrl=null;
let activeSubtitleObjectUrl=null;
function readPlayerSources(){
 try{const value=JSON.parse(localStorage.getItem(NY7_PLAYER_STORAGE_KEY)||'{}');return value&&typeof value==='object'?value:{};}catch(_){return {};}
}
function writePlayerSource(id,source){
 const all=readPlayerSources();all[String(id)]=source;
 try{localStorage.setItem(NY7_PLAYER_STORAGE_KEY,JSON.stringify(all));return true;}catch(error){console.warn('Video kaynağı kaydedilemedi:',error);return false;}
}
function openNY7VideoDB(){
 return new Promise((resolve,reject)=>{
  if(!('indexedDB' in window)){reject(new Error('Bu tarayıcı yerel video depolamayı desteklemiyor.'));return;}
  const request=indexedDB.open('PerdeVideoLibrary',1);
  request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains('videos'))db.createObjectStore('videos');};
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error||new Error('Video deposu açılamadı.'));
 });
}
async function saveNY7LocalVideo(id,file){
 const db=await openNY7VideoDB();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('videos','readwrite');tx.objectStore('videos').put(file,String(id));
  tx.oncomplete=()=>{db.close();resolve(true);};tx.onerror=()=>{db.close();reject(tx.error||new Error('Video kaydedilemedi.'));};
 });
}
async function getNY7LocalVideo(id){
 const db=await openNY7VideoDB();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('videos','readonly'),request=tx.objectStore('videos').get(String(id));
  request.onsuccess=()=>{const file=request.result||null;db.close();resolve(file);};
  request.onerror=()=>{db.close();reject(request.error||new Error('Kayıtlı video okunamadı.'));};
 });
}
function setPlayerError(message){
 const error=document.getElementById('player-error');if(error){error.textContent=message||'';error.hidden=!message;}
}
function releasePlayerUrls(){
 if(activePlayerObjectUrl){URL.revokeObjectURL(activePlayerObjectUrl);activePlayerObjectUrl=null;}
 if(activeSubtitleObjectUrl){URL.revokeObjectURL(activeSubtitleObjectUrl);activeSubtitleObjectUrl=null;}
}
function clearYouTubePlayer(){
 const stage=document.getElementById('player-stage');
 stage?.querySelector('#player-youtube-frame')?.remove();
 stage?.classList.remove('is-youtube-playing');
}
function getYouTubeVideoId(value){
 try{
  const parsed=new URL(String(value||'').trim());
  const host=parsed.hostname.toLowerCase().replace(/^www\./,'');
  if(!['youtube.com','m.youtube.com','music.youtube.com','youtu.be','youtube-nocookie.com'].includes(host))return '';
  let id='';
  if(host==='youtu.be')id=parsed.pathname.split('/').filter(Boolean)[0]||'';
  else if(parsed.pathname==='/watch')id=parsed.searchParams.get('v')||'';
  else{
   const parts=parsed.pathname.split('/').filter(Boolean);
   if(['embed','shorts','live','v'].includes(parts[0]))id=parts[1]||'';
  }
  return /^[A-Za-z0-9_-]{11}$/.test(id)?id:'';
 }catch(_){return '';}
}
function getOKRuVideoId(value){
 try{
  const parsed=new URL(String(value||'').trim());
  const host=parsed.hostname.toLowerCase().replace(/^www\./,'');
  if(!(host==='ok.ru'||host.endsWith('.ok.ru')||host==='odnoklassniki.ru'||host.endsWith('.odnoklassniki.ru')))return '';
  const match=parsed.pathname.match(/\/(?:video|videoembed)\/(\d+)/i);
  return match?match[1]:'';
 }catch(_){return '';}
}
function attachOKRuPlayer(url){
 const stage=document.getElementById('player-stage'),video=document.getElementById('player-video');
 if(!stage||!video)return false;
 const videoId=getOKRuVideoId(url);
 if(!videoId)return false;
 clearYouTubePlayer();
 video.pause();video.removeAttribute('src');video.replaceChildren();video.load();
 const iframe=document.createElement('iframe');
 iframe.id='player-youtube-frame';
 iframe.className='ny7-youtube-frame';
 iframe.title=(document.getElementById('player-media-title')?.textContent||'Film')+' — OK.ru oynatıcı';
 iframe.src='https://ok.ru/videoembed/'+encodeURIComponent(videoId);
 iframe.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';
 iframe.allowFullscreen=true;
 iframe.referrerPolicy='strict-origin-when-cross-origin';
 stage.insertBefore(iframe,video);
 stage.classList.add('is-youtube-playing');
 const empty=document.getElementById('player-empty-state');if(empty)empty.hidden=true;
 ['player-big-play','player-controls','player-settings-panel','player-skip-intro','player-skip-credits'].forEach(id=>{const node=document.getElementById(id);if(node)node.hidden=true;});
 const loading=document.getElementById('player-loading');if(loading)loading.hidden=true;
 setPlayerError('');
 return true;
}
function attachYouTubePlayer(url){
 const stage=document.getElementById('player-stage'),video=document.getElementById('player-video');
 if(!stage||!video)return false;
 const videoId=getYouTubeVideoId(url);
 if(!videoId)return false;
 clearYouTubePlayer();
 video.pause();video.removeAttribute('src');video.replaceChildren();video.load();
 const iframe=document.createElement('iframe');
 iframe.id='player-youtube-frame';
 iframe.className='ny7-youtube-frame';
 iframe.title=(document.getElementById('player-media-title')?.textContent||'Film')+' — YouTube oynatıcı';
 iframe.src='https://www.youtube-nocookie.com/embed/'+encodeURIComponent(videoId)+'?autoplay=1&playsinline=1&rel=0&modestbranding=1';
 iframe.allow='autoplay; encrypted-media; picture-in-picture; web-share';
 iframe.allowFullscreen=true;
 iframe.referrerPolicy='strict-origin-when-cross-origin';
 stage.insertBefore(iframe,video);
 stage.classList.add('is-youtube-playing');
 const empty=document.getElementById('player-empty-state');if(empty)empty.hidden=true;
 ['player-big-play','player-controls','player-settings-panel','player-skip-intro','player-skip-credits'].forEach(id=>{const node=document.getElementById(id);if(node)node.hidden=true;});
 const loading=document.getElementById('player-loading');if(loading)loading.hidden=true;
 setPlayerError('');
 return true;
}
function attachPlayerSource(url,label){
 const video=document.getElementById('player-video'),empty=document.getElementById('player-empty-state');
 if(!video||!url)return;
 clearYouTubePlayer();
 ['player-big-play','player-controls'].forEach(id=>{const node=document.getElementById(id);if(node)node.hidden=false;});
 video.pause();video.removeAttribute('src');video.replaceChildren();
 const episodeContext=window.perdeEpisodeContext||null;
 const catalogItemId=episodeContext?.seriesId||activePlayerMediaId;
 const currentItem=mediaDatabase.find(entry=>String(entry.id)===String(catalogItemId));
 if(currentItem&&Array.isArray(currentItem.subtitles)){
  const episode=window.perdeEpisodeContext||null;
  const matchingTracks=currentItem.subtitles.filter(track=>track&&track.url&&(!track.season||(episode&&Number(track.season)===Number(episode.season)&&Number(track.episode)===Number(episode.episode))));
  const hasEpisodeDefault=!!episode&&matchingTracks.some(track=>track.season&&track.default);
  matchingTracks.forEach(track=>{
   const node=document.createElement('track');node.kind='subtitles';node.label=track.languageLabel||track.language||'Altyazı';node.srclang=track.language==='other'?'und':(track.language||'tr');node.src=track.url;node.default=!!track.default&&!(hasEpisodeDefault&&!track.season);video.appendChild(node);
  });
 }
 video.src=url;video.load();
 if(empty)empty.hidden=true;
 setPlayerError('');
 video.play().catch(()=>{});
}
function isDirectPlayablePlayerUrl(value){
 try{
  const url=new URL(String(value||''));
  if(!['http:','https:'].includes(url.protocol))return false;
  return /\.(?:mp4|m4v|webm|ogv|ogg|mov|m3u8|mpd)$/i.test(url.pathname);
 }catch(_){return false;}
}
async function loadSavedPlayerSource(id, catalogWatchUrl=''){
 const source=readPlayerSources()[String(id)];
 const watchUrl=String(catalogWatchUrl||'').trim();
 if(watchUrl){
  if(getYouTubeVideoId(watchUrl)){attachYouTubePlayer(watchUrl);return;}
  if(getOKRuVideoId(watchUrl)){attachOKRuPlayer(watchUrl);return;}
  if(isDirectPlayablePlayerUrl(watchUrl)){attachPlayerSource(watchUrl,'Yapım izleme bağlantısı');return;}
  setPlayerError('Bu bağlantı desteklenmiyor. YouTube, OK.ru veya doğrudan MP4, WebM, HLS ya da DASH bağlantısı kullan.');
  return;
 }
 if(source?.type==='local'){
  try{const file=await getNY7LocalVideo(id);if(file){activePlayerObjectUrl=URL.createObjectURL(file);attachPlayerSource(activePlayerObjectUrl,file.name);return;}}
  catch(error){setPlayerError(error.message||'Kayıtlı video açılamadı.');}
 }
 if((source?.type==='youtube'||source?.type==='url')&&source.url){
  if(getYouTubeVideoId(source.url)){attachYouTubePlayer(source.url);return;}
  if(getOKRuVideoId(source.url)){attachOKRuPlayer(source.url);return;}
  attachPlayerSource(source.url,'Harici yayın');
 }
}
function openPlayerForMedia(id){
 const item=mediaDatabase.find(entry=>String(entry.id)===String(id));
 if(!item)return;
 if(item.type==='tv'&&!window.perdeEpisodeContext&&!item.watchUrl){return;}
 activePlayerMediaId=String(window.perdeEpisodeContext?.playerId||item.id);
 const modal=document.getElementById('player-modal'),video=document.getElementById('player-video');
 const playerTitle=window.perdeEpisodeContext ? item.title+' · S'+window.perdeEpisodeContext.season+' B'+window.perdeEpisodeContext.episode+' — '+(window.perdeEpisodeContext.episodeTitle||'Bölüm') : item.title+' · '+(item.year||'');
 document.getElementById('player-media-title').textContent=playerTitle;
 const infoPoster=document.getElementById('player-info-poster'),infoTitle=document.getElementById('player-info-title'),infoType=document.getElementById('player-info-type'),infoMeta=document.getElementById('player-info-meta'),infoOverview=document.getElementById('player-info-overview');
 if(infoPoster){infoPoster.src=item.image||item.tmdbPoster||'';infoPoster.alt=item.title||'Yapım afişi';}
 if(infoTitle)infoTitle.textContent=window.perdeEpisodeContext?(window.perdeEpisodeContext.episodeTitle||'Bölüm')+' — '+item.title:item.title;
 if(infoType)infoType.textContent=window.perdeEpisodeContext?'DİZİ · SEZON '+window.perdeEpisodeContext.season+' · BÖLÜM '+window.perdeEpisodeContext.episode:(item.type==='tv'?'DİZİ':'FİLM');
 if(infoMeta)infoMeta.textContent=[item.year,item.tmdbGenres||item.category,item.tmdbRuntime||item.duration].filter(Boolean).join(' · ')||'Perde arşivi';
 if(infoOverview)infoOverview.textContent=window.perdeEpisodeContext?(window.perdeEpisodeContext.episodeOverview||item.tmdbOverview||item.desc||'Bu bölüm için özet bilgisi bulunmuyor.'):item.tmdbOverview||item.desc||'Bu yapım için açıklama bilgisi bulunmuyor.';
 const sessionStatus=document.getElementById('player-session-status');if(sessionStatus)sessionStatus.textContent='Bağlantı kontrol ediliyor';
 modal.classList.remove('hidden');modal.setAttribute('aria-hidden','false');
 document.documentElement.classList.add('ny7-modal-lock');
 clearYouTubePlayer();
 if(video){video.style.display='';video.pause();video.removeAttribute('src');video.innerHTML='';video.poster=item.image||'';video.load();}
 ['player-big-play','player-controls'].forEach(id=>{const node=document.getElementById(id);if(node)node.hidden=false;});
 document.getElementById('player-empty-state').hidden=false;
 setPlayerError('');
 const episodeContext=window.perdeEpisodeContext||null;
 let episodeWatchUrl='';
 if(episodeContext&&item.watchUrl){
  let sourceName=String(item.watchUrl);
  try{sourceName=decodeURIComponent(sourceName);}catch(_){}
  const season=Number(episodeContext.season),episode=Number(episodeContext.episode);
  if(season>0&&episode>0){
   const episodePattern=new RegExp('s0*'+season+'[\\s._-]*e0*'+episode+'(?:\\D|$)','i');
   if(episodePattern.test(sourceName))episodeWatchUrl=String(item.watchUrl).trim();
  }
 }
 const emptyState=document.getElementById('player-empty-state');
 if(episodeContext&&emptyState){
  const heading=emptyState.querySelector('strong'),message=emptyState.querySelector('span:last-child');
  if(heading)heading.textContent='Bölüm izlemeye hazır';
  if(message)message.textContent=episodeWatchUrl?'Bağlantı yükleniyor…':'Bu bölüm için henüz izleme bağlantısı eklenmemiş. Oynatıcıya bağlantı ekleyebilir veya yönetim panelinden bu bölümün kaynağını tanımlayabilirsin.';
 }else if(emptyState){
  const heading=emptyState.querySelector('strong'),message=emptyState.querySelector('span:last-child');
  if(heading)heading.textContent='Film keyfin başlasın.';
  if(message)message.textContent='Bu yapım için izleme bağlantısı henüz tanımlanmamış. Bağlantıyı yönetim panelindeki yapım kaydından ekleyebilirsin.';
 }
 loadSavedPlayerSource(activePlayerMediaId,episodeContext?episodeWatchUrl:item.watchUrl);
 const playerStatus=document.getElementById('player-session-status');if(playerStatus)playerStatus.textContent=episodeContext?(episodeWatchUrl?'Bölüm kaynağı bulundu':'Kaynak bekleniyor'):(item.watchUrl?'Kaynak bulundu':'Kaynak bekleniyor');
}
function saveAndPlayStream(){
 if(!activePlayerMediaId)return;
 const input=document.getElementById('player-stream-url'),raw=String(input?.value||'').trim();
 let url;try{url=new URL(raw);}catch(_){setPlayerError('Geçerli bir http veya https video bağlantısı gir.');return;}
 if(!['http:','https:'].includes(url.protocol)){setPlayerError('Yalnızca http veya https bağlantıları kullanılabilir.');return;}
 const youtube=!!getYouTubeVideoId(url.href);
 if(!youtube&&!isDirectPlayablePlayerUrl(url.href)){setPlayerError('YouTube bağlantısı veya doğrudan .mp4, .webm, .m3u8 ya da .mpd video bağlantısı kullan.');return;}
 if(!writePlayerSource(activePlayerMediaId,{type:youtube?'youtube':'url',url:url.href})){setPlayerError('Bağlantı bu tarayıcıya kaydedilemedi.');return;}
 releasePlayerUrls();
 if(youtube)attachYouTubePlayer(url.href);else attachPlayerSource(url.href,'Harici yayın');
}
function closePlayer(){
 const modal=document.getElementById('player-modal'),video=document.getElementById('player-video');
 clearYouTubePlayer();
 if(video){video.style.display='';video.pause();video.removeAttribute('src');video.innerHTML='';video.load();}
 ['player-big-play','player-controls'].forEach(id=>{const node=document.getElementById(id);if(node)node.hidden=false;});
 releasePlayerUrls();activePlayerMediaId=null;window.perdeEpisodeContext=null;
 if(modal){modal.classList.add('hidden');modal.setAttribute('aria-hidden','true');}
 document.documentElement.classList.remove('ny7-modal-lock');
}
document.getElementById('player-video')?.addEventListener('error',()=>setPlayerError('Bu video kaynağı açılamadı. Bağlantıyı, dosya biçimini veya erişim iznini kontrol et.'));




        let mediaDatabase = [];
;

        const liveTvChannels = [
            { name: 'Disney Channel', icon: 'fa-tv', tag: 'Çocuk 24/7' },
            { name: 'HBO HD Live', icon: 'fa-film', tag: 'Sinema Kuşağı' },
            { name: 'ESPN Sports', icon: 'fa-trophy', tag: 'Canlı Maç Yayını' },
            { name: 'Discovery HD', icon: 'fa-earth-americas', tag: 'Belgesel' }
        ];

        let heroItems = [];
        let heroAllItems = [];
        let heroPresentationById = {};
        let heroIndex = 0;
        let heroTimer = null;
        let heroRailHovered = false;
        let heroSettings = {desktopCount:6,mobileCount:4,interval:6,autoplay:true,pauseOnHover:true};
        let catalogInitialized = false;
        function applyHeroDisplaySettings(){const rail=document.getElementById('hero-thumbnails-rail');if(!rail)return;const mobile=window.matchMedia('(max-width:767px)').matches;const count=mobile?heroSettings.mobileCount:heroSettings.desktopCount;const gap=parseFloat(getComputedStyle(rail).columnGap)||10;const width=Math.max(42,(rail.clientWidth-gap*(count-1))/count);rail.style.setProperty('--hero-visible-count',String(count));rail.style.setProperty('--hero-card-width',width+'px');}
        function syncHeroItemLimit(){
            if(!Array.isArray(heroAllItems)||!heroAllItems.length)return;
            const mobile=window.matchMedia('(max-width:767px)').matches;
            const limit=mobile?heroSettings.mobileCount:heroSettings.desktopCount;
            const currentId=heroItems[heroIndex]?.id;
            heroItems=heroAllItems.slice(0,limit);
            const currentIndex=heroItems.findIndex(item=>String(item.id)===String(currentId));
            heroIndex=currentIndex>=0?currentIndex:0;
            applyHeroDisplaySettings();
            if(heroItems.length){
                setHeroMedia(heroItems[heroIndex].id);
                renderHeroThumbnails();
                restartHeroTimer();
            }
        }
        window.addEventListener('resize',()=>{syncHeroItemLimit();applyHeroDisplaySettings();},{passive:true});
        function showCatalogSkeletons() {
            const skeleton = '<div class="ny7-skeleton-card"><span></span><i></i><b></b></div>';
            ['media-grid','featured-rail','personalized-rail','top-movies-rail','top-series-rail'].forEach(id => {
                const target = document.getElementById(id);
                if (target) target.innerHTML = Array.from({length:id==='media-grid'?8:5},()=>skeleton).join('');
            });
        }
        async function initializeCatalog() {
            if (catalogInitialized) return;
            catalogInitialized = true;
            showCatalogSkeletons();
            const parseCatalogResponse = async (response, source) => {
                if (!response.ok) throw new Error(source + ' HTTP ' + response.status);
                const payload = await response.json();
                let candidate = payload;
                if (!Array.isArray(payload) && typeof payload?.content === 'string') {
                    const binary = atob(payload.content.replace(/\s/g, ''));
                    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
                    candidate = JSON.parse(new TextDecoder().decode(bytes));
                }
                if (!Array.isArray(candidate) || candidate.length === 0) throw new Error(source + ': katalog boş veya geçersiz.');
                return candidate;
            };
            const fetchCatalog = async (url, source) => {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 12000);
                try {
                    const response = await fetch(url, {cache:'no-store',mode:'cors',credentials:'omit',signal:controller.signal});
                    return await parseCatalogResponse(response, source);
                } finally { clearTimeout(timeout); }
            };
            try {
                const localUrl = new URL('./data/catalog.json?v=20261107-personal-info-v1', document.baseURI).href;
                const rootUrl = new URL('/data/catalog.json?v=20261107-personal-info-v1', location.origin).href;
                const rawUrl = 'https://raw.githubusercontent.com/megamrtklc/filmm/main/data/catalog.json?v=20261107-personal-info-v1';
                const apiUrl = 'https://api.github.com/repos/megamrtklc/filmm/contents/data/catalog.json?ref=main';
                const sources = [[localUrl,'Yayınlanan katalog'],[rootUrl,'Kök katalog yolu'],[rawUrl,'GitHub ham katalog'],[apiUrl,'GitHub API kataloğu']];
                let loadedCatalog = null;
                const errors = [];
                for (const [url,label] of sources) {
                    try {
                        loadedCatalog = await fetchCatalog(url,label);
                        console.info('Katalog yüklendi:',label,loadedCatalog.length+' kayıt');
                        break;
                    } catch (requestError) {
                        errors.push(label+': '+(requestError?.message||requestError));
                        console.warn('Katalog kaynağı denenemedi:',label,requestError);
                    }
                }
                if (!loadedCatalog) throw new Error(errors.join(' | ')||'Hiçbir katalog kaynağı yanıt vermedi.');
                mediaDatabase = loadedCatalog;
                heroPresentationById = {};
                let savedHeroConfig = null;
                try {
                    const configResponse = await fetch(new URL('./data/homepage-config.json?v=20261107-home-hero-v1', document.baseURI).href,{cache:'no-store',credentials:'omit'});
                    if (configResponse.ok) savedHeroConfig = await configResponse.json();
                } catch (configError) { console.warn('Manşet ayarları yüklenemedi; varsayılan vitrin kullanılacak.',configError); }
                const rawHeroSettings=savedHeroConfig?.settings||{};
                const desktop=[4,5,6,8,10],mobile=[3,4,5,6],intervals=[4,6,8,10];
                heroSettings={desktopCount:desktop.includes(Number(rawHeroSettings.desktopCount))?Number(rawHeroSettings.desktopCount):6,mobileCount:mobile.includes(Number(rawHeroSettings.mobileCount))?Number(rawHeroSettings.mobileCount):4,interval:intervals.includes(Number(rawHeroSettings.interval))?Number(rawHeroSettings.interval):6,autoplay:rawHeroSettings.autoplay!==false,pauseOnHover:rawHeroSettings.pauseOnHover!==false};
                const heroCandidates = mediaDatabase.filter(item => item && item.id != null && item.title && (item.tmdbBackdrop || item.backdrop || item.image || item.tmdbPoster || item.poster));
                const savedSlides = Array.isArray(savedHeroConfig?.heroSlides) ? savedHeroConfig.heroSlides : [];
                const configuredSlides = savedSlides.filter(slide => slide && slide.active !== false && mediaDatabase.some(item => String(item.id) === String(slide.id)));
                if (configuredSlides.length) {
                    heroAllItems = configuredSlides.map(slide => mediaDatabase.find(item => String(item.id) === String(slide.id))).filter(Boolean);
                    heroPresentationById = Object.fromEntries(configuredSlides.map(slide => [String(slide.id),{
                        headline: typeof slide.headline === 'string' ? slide.headline.trim() : '',
                        description: typeof slide.description === 'string' ? slide.description.trim() : ''
                    }]));
                } else {
                    // Henüz yayın ayarı yoksa mevcut varsayılan vitrin düzeni korunur.
                    heroAllItems = heroCandidates.slice(-10).reverse();
                }
                const initialHeroLimit=window.matchMedia('(max-width:767px)').matches?heroSettings.mobileCount:heroSettings.desktopCount;
                heroItems=heroAllItems.slice(0,initialHeroLimit);
                setHeroMedia(heroItems[0]?.id ?? mediaDatabase[0].id);
                renderHeroThumbnails();
                restartHeroTimer();
                renderHomeCollections();
                try {
                    initializeMoodDiscovery();
                } catch (moodError) {
                    console.error('Moduna göre keşfet alanı başlatılamadı; katalog yüklemesi sürdürülecek:', moodError);
                    const moodResult = document.getElementById('mood-discovery-result');
                    if (moodResult) moodResult.innerHTML = '<div class="mood-discovery-empty">Keşif önerisi şu anda hazırlanamadı.</div>';
                }
                renderMediaGrid();
                renderLiveTv();
                window.dispatchEvent(new Event('perde:catalog-ready'));
                renderHeaderSearchResults(headerSearchInput?.value||'');
                loadOriginalTitles();
                if (location.hash) routeFromHash();
            } catch (error) {
                catalogInitialized = false;
                console.error('Katalog yükleme hatası:',error);
                const detail = escapeCountryHtml(error?.message || 'Bilinmeyen yükleme hatası');
                const message = '<div class="col-span-full ny7-error-state"><i class="fa-solid fa-triangle-exclamation"></i><b>İçerikler şu anda yüklenemedi</b><p>Katalog yükleme ayrıntısı: '+detail+'</p><button type="button" onclick="initializeCatalog()"><i class="fa-solid fa-rotate-right"></i> Yeniden dene</button></div>';
                ['media-grid','featured-rail','top-movies-rail','top-series-rail'].forEach(id=>{const target=document.getElementById(id);if(target)target.innerHTML=message;});
            }
        }
        // Script sayfanin en altinda yuklendigi icin katalogu beklemeden baslat.
        // Boylece load olayi kacirilsa bile ana sayfa koleksiyonlari bos kalmaz.
        initializeCatalog();
    
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register(new URL('service-worker.js', document.baseURI).href, {scope:new URL('./',document.baseURI).pathname})
            .catch(error => console.warn('NY7 çevrimdışı desteği etkinleştirilemedi:',error));
    });
}


// NY7 interaction layer: carousels, modal dismissal and keyboard focus behavior.
document.addEventListener('click',event=>{
 const control=event.target.closest('[data-rail-target][data-rail-direction]');
 if(control){
  const rail=document.getElementById(control.dataset.railTarget);
  if(rail){const page=rail.classList.contains('saved-collection-rail')?rail.clientWidth:Math.max(260,rail.clientWidth*.82);rail.scrollBy({left:Number(control.dataset.railDirection)*page,behavior:'smooth'});}
  return;
 }
 if(event.target.matches('[data-detail-dismiss]')&&document.body.classList.contains('ny7-detail-open'))showDashboard();
});
document.addEventListener('keydown',event=>{
 if(event.key==='Escape'&&document.body.classList.contains('ny7-detail-open')){showDashboard();return;}
 if((event.key==='ArrowRight'||event.key==='ArrowLeft')&&!event.target.closest('input,textarea,select,button,[contenteditable="true"]')){
  const rail=document.activeElement?.closest('.collection-rail');
  if(rail)rail.scrollBy({left:(event.key==='ArrowRight'?1:-1)*Math.max(180,rail.clientWidth*.65),behavior:'smooth'});
 }
});

document.addEventListener('click',event=>{
 if(event.target.matches('[data-trailer-dismiss]'))closeTrailerPopup();
});
document.addEventListener('keydown',event=>{
 if(event.key==='Escape'&&document.getElementById('trailer-popup')?.classList.contains('is-open'))closeTrailerPopup();
});


// Perde Cinema Player custom controls
(function initPerdeCinemaControls(){
 const video=document.getElementById('player-video'),stage=document.getElementById('player-stage');
 if(!video||!stage)return;
 const $=id=>document.getElementById(id);
 let hideTimer=null,seeking=false;
 const fmt=value=>{if(!Number.isFinite(value))return '00:00';const s=Math.floor(value),h=Math.floor(s/3600),m=Math.floor((s%3600)/60),r=s%60;return h?[h,m,r].map(n=>String(n).padStart(2,'0')).join(':'):[m,r].map(n=>String(n).padStart(2,'0')).join(':');};
 const syncPlay=()=>{const paused=video.paused;stage.classList.toggle('is-paused',paused);stage.classList.toggle('has-source',!!video.currentSrc);const icon=paused?'fa-play':'fa-pause';['player-play-toggle','player-big-play'].forEach(id=>{const b=$(id);if(b){b.innerHTML='<i class="fa-solid '+icon+'"></i>';b.setAttribute('aria-label',paused?'Oynat':'Duraklat');}});};
 const syncTime=()=>{const duration=Number.isFinite(video.duration)?video.duration:0,current=video.currentTime||0;if($('player-current-time'))$('player-current-time').textContent=fmt(current);if($('player-duration'))$('player-duration').textContent=fmt(duration);if(!seeking&&$('player-seek'))$('player-seek').value=duration?Math.round(current/duration*1000):0;const pct=duration?current/duration*100:0;if($('player-seek'))$('player-seek').style.setProperty('--player-progress',pct+'%');};
 const syncVolume=()=>{const v=video.muted?0:video.volume;if($('player-volume'))$('player-volume').value=v;const b=$('player-volume-toggle');if(b)b.innerHTML='<i class="fa-solid '+(v===0?'fa-volume-xmark':v<.5?'fa-volume-low':'fa-volume-high')+'"></i>';};
 const reveal=()=>{stage.classList.remove('controls-hidden');clearTimeout(hideTimer);if(!video.paused&&!stage.matches(':fullscreen'))hideTimer=setTimeout(()=>stage.classList.add('controls-hidden'),2600);};
 const toggle=()=>{if(!video.currentSrc)return;if(video.paused)video.play().catch(()=>{});else video.pause();};
 const seekBy=seconds=>{if(Number.isFinite(video.duration))video.currentTime=Math.max(0,Math.min(video.duration,video.currentTime+seconds));reveal();};
 $('player-play-toggle')?.addEventListener('click',toggle);$('player-big-play')?.addEventListener('click',toggle);
 $('player-rewind')?.addEventListener('click',()=>seekBy(-10));$('player-forward')?.addEventListener('click',()=>seekBy(10));
 $('player-volume-toggle')?.addEventListener('click',()=>{video.muted=!video.muted;syncVolume();});
 $('player-volume')?.addEventListener('input',e=>{video.volume=Number(e.target.value);video.muted=video.volume===0;syncVolume();});
 $('player-seek')?.addEventListener('input',e=>{seeking=true;const d=Number.isFinite(video.duration)?video.duration:0;if(d){const t=d*Number(e.target.value)/1000;if($('player-current-time'))$('player-current-time').textContent=fmt(t);e.target.style.setProperty('--player-progress',Number(e.target.value)/10+'%');}});
 $('player-seek')?.addEventListener('change',e=>{const d=Number.isFinite(video.duration)?video.duration:0;if(d)video.currentTime=d*Number(e.target.value)/1000;seeking=false;});
 $('player-speed')?.addEventListener('change',e=>{video.playbackRate=Number(e.target.value)||1;reveal();});
 $('player-fullscreen')?.addEventListener('click',()=>{if(document.fullscreenElement)document.exitFullscreen?.();else stage.requestFullscreen?.();});
 $('player-pip')?.addEventListener('click',async()=>{try{if(document.pictureInPictureElement)await document.exitPictureInPicture();else if(document.pictureInPictureEnabled&&video.requestPictureInPicture)await video.requestPictureInPicture();}catch(error){setPlayerError('Resim içinde resim bu tarayıcıda kullanılamıyor.');}});
 video.addEventListener('play',()=>{syncPlay();reveal();});video.addEventListener('pause',()=>{syncPlay();reveal();});video.addEventListener('timeupdate',syncTime);video.addEventListener('loadedmetadata',()=>{syncTime();syncPlay();});video.addEventListener('durationchange',syncTime);video.addEventListener('volumechange',syncVolume);
 video.addEventListener('waiting',()=>$('player-loading')?.classList.add('is-visible'));video.addEventListener('playing',()=>$('player-loading')?.classList.remove('is-visible'));video.addEventListener('canplay',()=>$('player-loading')?.classList.remove('is-visible'));
 stage.addEventListener('mousemove',reveal);stage.addEventListener('touchstart',reveal,{passive:true});stage.addEventListener('click',e=>{if(e.target===video)reveal();});
 video.addEventListener('dblclick',()=>{if(document.fullscreenElement)document.exitFullscreen?.();else stage.requestFullscreen?.();});
 document.addEventListener('keydown',e=>{const modal=$('player-modal');if(!modal||modal.classList.contains('hidden')||e.target.matches('input,textarea,select,button'))return;if(e.code==='Space'){e.preventDefault();toggle();}else if(e.key==='ArrowLeft')seekBy(-10);else if(e.key==='ArrowRight')seekBy(10);else if(e.key.toLowerCase()==='f')$('player-fullscreen')?.click();else if(e.key.toLowerCase()==='m')$('player-volume-toggle')?.click();});
 const observer=new MutationObserver(()=>{if(!$('player-modal')||$('player-modal').classList.contains('hidden')){clearTimeout(hideTimer);stage.classList.remove('controls-hidden');}else{syncPlay();syncVolume();}});
 observer.observe($('player-modal'),{attributes:true,attributeFilter:['class']});
 const title=$('player-media-title'),under=$('player-underbar-title');if(title&&under){new MutationObserver(()=>under.textContent=title.textContent).observe(title,{childList:true,subtree:true,characterData:true});under.textContent=title.textContent;}
 syncPlay();syncVolume();syncTime();
})();


// Konu metnini slider afiş şeridinin görünür genişliğine göre sınırla.
function fitHeroDescriptionToRail() {
    const rail = document.getElementById('hero-thumbnails-rail');
    const section = document.getElementById('hero-section');
    if (!rail || !section) return;
    const width = Math.floor(rail.getBoundingClientRect().width);
    if (width > 0) section.style.setProperty('--hero-desc-rail-width', width + 'px');
}
window.addEventListener('resize', fitHeroDescriptionToRail, { passive: true });
if (typeof ResizeObserver !== 'undefined') {
    const heroRailResizeObserver = new ResizeObserver(fitHeroDescriptionToRail);
    const observeHeroRail = () => {
        const rail = document.getElementById('hero-thumbnails-rail');
        if (rail) heroRailResizeObserver.observe(rail);
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', observeHeroRail, { once: true });
    } else {
        observeHeroRail();
    }
}


// Sayfa değişimlerini ağır animasyonlar yerine kısa ve GPU-dostu bir geçişle sun.
(function(){
 const targets=['dashboard-view','detail-page-view','actor-page-view','catalog-page']
  .map(id=>document.getElementById(id)).filter(Boolean);
 const animate=element=>{
  if(element.classList.contains('hidden'))return;
  element.classList.remove('perde-view-enter');
  void element.offsetWidth;
  element.classList.add('perde-view-enter');
 };
 if(typeof MutationObserver!=='undefined'){
  const observer=new MutationObserver(records=>{
   // Yalnızca gizli görünüm açıldığında animasyon uygula.
   // Animasyonun kendi class değişiklikleri yeniden animasyon başlatmamalı.
   const entering=new Set(records
    .filter(record=>(record.oldValue||'').split(/\s+/).includes('hidden')&&!record.target.classList.contains('hidden'))
    .map(record=>record.target));
   entering.forEach(animate);
  });
  targets.forEach(element=>observer.observe(element,{attributes:true,attributeOldValue:true,attributeFilter:['class']}));
 }
})();