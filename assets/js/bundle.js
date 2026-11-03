// Favoriler ve izleme listesi yönetimi
let favorites = JSON.parse(localStorage.getItem('ny7_favorites') || '[]');
        let watchlist = JSON.parse(localStorage.getItem('ny7_watchlist') || '[]');
        let heroCurrentId = 1;
        let heroCurrentTitle = 'THE BATMAN';

        function toggleFavorite(id, e) {
            if (e) e.stopPropagation();
            if (favorites.includes(id)) {
                favorites = favorites.filter(favId => favId !== id);
            } else {
                favorites.push(id);
            }
            localStorage.setItem('ny7_favorites', JSON.stringify(favorites));
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
            localStorage.setItem('ny7_watchlist', JSON.stringify(watchlist));
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
function setHeroMedia(id, userAction = false) {
            const item = mediaDatabase.find(m => m.id === id) || mediaDatabase[0];
            const idx = heroItems.findIndex(m => m.id === item.id);
            if (idx >= 0) heroIndex = idx;
            heroCurrentId = item.id; heroCurrentTitle = item.title;
            const section = document.getElementById('hero-section');
            const bg = document.getElementById('hero-bg');
            section.classList.add('is-changing');
            window.setTimeout(() => { bg.src = item.backdrop || item.image; bg.alt = item.title; section.classList.remove('is-changing'); }, 150);
            document.getElementById('hero-title').innerText = item.title;
            const ratings = document.getElementById('hero-ratings');
            const ratingValue = value => value !== undefined && value !== null && String(value).trim() !== '' ? value : '—';
            ratings.innerHTML = `
                <span class="hero-rating-badge imdb"><b>IMDb</b><strong>${ratingValue(item.rating)}</strong></span>
                <span class="hero-rating-badge tmdb"><b class="tmdb-mark">TMDB</b><strong>${ratingValue(item.tmdbRating)}</strong></span>
                <span class="hero-rating-badge tomato"><b class="tomato-mark">🍅 RT</b><strong>${ratingValue(item.rottenTomatoes)}</strong></span>
                <span class="hero-rating-badge popcorn"><b class="popcorn-mark">🍿</b><strong>${ratingValue(item.popcornmeter)}</strong></span>`;
            const runtime = item.type === 'tv'
                ? [item.seasons ? `${item.seasons} sezon` : '', item.episodes ? `${item.episodes} bölüm` : '', item.duration || ''].filter(Boolean).join(' • ')
                : (item.duration || '');
            document.getElementById('hero-meta').innerText = [item.year, item.type === 'tv' ? 'Dizi' : 'Film', runtime, item.category].filter(Boolean).join(' • ');
            document.getElementById('hero-desc').innerText = item.desc;
            document.querySelectorAll('.hero-thumb').forEach((el,i) => {
                const active = heroItems[i]?.id === item.id;
                el.classList.toggle('active',active); el.setAttribute('aria-pressed',String(active));
            });
            if (userAction) restartHeroTimer();
        }
        function renderHeroThumbnails() {
            document.getElementById('hero-thumbnails-rail').innerHTML = heroItems.map((m,i) => `
                <button type="button" onclick="setHeroMedia('${m.id}',true)" onmouseenter="setHeroMedia('${m.id}',true)" class="hero-thumb ${i===heroIndex?'active':''}" aria-label="${m.title}" aria-pressed="${i===heroIndex}">
                    <img src="${m.image}" alt="${m.title}" loading="lazy"><span>${m.title}</span>
                </button>`).join('');
        }
        function stepHero(direction) {
            heroIndex=(heroIndex+direction+heroItems.length)%heroItems.length;
            setHeroMedia(heroItems[heroIndex].id,true);
        }
        function restartHeroTimer() {
            if(heroTimer) clearInterval(heroTimer);
            heroTimer=setInterval(()=>{if(!document.hidden && document.getElementById('detail-page-view').classList.contains('hidden')) stepHero(1);},6500);
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
            <div class="collection-card-copy"><h3>${item.title}</h3><p>${item.year || ''} <span>•</span> ${item.type === 'tv' ? 'Dizi' : 'Film'}</p></div>
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
    fill('top-movies-rail', movies);
    fill('top-series-rail', series);
    document.getElementById('collection-movies').hidden = movies.length === 0;
    document.getElementById('collection-series').hidden = series.length === 0;
}

function toggleHeaderMenu(id) {
    const target=document.getElementById(id); const wasOpen=target.classList.contains('open');
    closeHeaderMenus(); if(!wasOpen){target.classList.add('open');target.querySelector('.nav-trigger,.user-trigger')?.setAttribute('aria-expanded','true');}
}
function closeHeaderMenus(){document.querySelectorAll('.nav-dropdown.open').forEach(menu=>{menu.classList.remove('open');menu.querySelector('.nav-trigger,.user-trigger')?.setAttribute('aria-expanded','false');});}
document.addEventListener('click',event=>{if(!event.target.closest('.nav-dropdown'))closeHeaderMenus();});
function showProfileNotice(){window.alert('Profil alanı yakında kullanıma açılacak.');}
function showSettingsNotice(){window.alert('Ayarlar alanı yakında kullanıma açılacak.');}

// Katalog listeleme, arama ve filtreleme
function renderMediaGrid(items = mediaDatabase) {
            const container = document.getElementById('media-grid');
            if (items.length === 0) {
                container.innerHTML = `<div class="col-span-full py-12 text-center text-slate-500 font-medium text-sm">Bu filtreye uygun içerik bulunmuyor.</div>`;
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
                                ${m.category}
                            </span>
                            <h4 class="font-black text-white text-xs truncate group-hover:text-brand-yellow transition-colors">${m.title}</h4>
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

        
const countryAliases={
'Spain':['İspanya','🇪🇸'],'France':['Fransa','🇫🇷'],'Germany':['Almanya','🇩🇪'],
'United States of America':['ABD','🇺🇸'],'United States':['ABD','🇺🇸'],'USA':['ABD','🇺🇸'],'U.S.A.':['ABD','🇺🇸'],'US':['ABD','🇺🇸'],
'United Kingdom':['Birleşik Krallık','🇬🇧'],'Great Britain':['Büyük Britanya','🇬🇧'],'UK':['Birleşik Krallık','🇬🇧'],'U.K.':['Birleşik Krallık','🇬🇧'],
'England':['İngiltere','🏴'],'Scotland':['İskoçya','🏴'],'Wales':['Galler','🏴'],
'Italy':['İtalya','🇮🇹'],'Turkey':['Türkiye','🇹🇷'],'Türkiye':['Türkiye','🇹🇷'],'Canada':['Kanada','🇨🇦'],'Australia':['Avustralya','🇦🇺'],'Japan':['Japonya','🇯🇵'],'South Korea':['Güney Kore','🇰🇷'],'China':['Çin','🇨🇳'],'India':['Hindistan','🇮🇳'],'Russia':['Rusya','🇷🇺'],'Brazil':['Brezilya','🇧🇷'],'Mexico':['Meksika','🇲🇽'],'Argentina':['Arjantin','🇦🇷'],'Portugal':['Portekiz','🇵🇹'],'Netherlands':['Hollanda','🇳🇱'],'Belgium':['Belçika','🇧🇪'],'Switzerland':['İsviçre','🇨🇭'],'Sweden':['İsveç','🇸🇪'],'Norway':['Norveç','🇳🇴'],'Denmark':['Danimarka','🇩🇰'],'Finland':['Finlandiya','🇫🇮'],'Ireland':['İrlanda','🇮🇪'],'Poland':['Polonya','🇵🇱'],'Greece':['Yunanistan','🇬🇷'],'Ukraine':['Ukrayna','🇺🇦'],'New Zealand':['Yeni Zelanda','🇳🇿'],'South Africa':['Güney Afrika','🇿🇦'],'Egypt':['Mısır','🇪🇬'],'Morocco':['Fas','🇲🇦'],'Lebanon':['Lübnan','🇱🇧'],'Kuwait':['Kuveyt','🇰🇼'],'Libyan Arab Jamahiriya':['Libya','🇱🇾'],'United Arab Emirates':['Birleşik Arap Emirlikleri','🇦🇪'],'UAE':['BAE','🇦🇪'],'Czech Republic':['Çekya','🇨🇿'],'Romania':['Romanya','🇷🇴'],'Iceland':['İzlanda','🇮🇸'],'Thailand':['Tayland','🇹🇭'],'Indonesia':['Endonezya','🇮🇩'],'Colombia':['Kolombiya','🇨🇴'],'Chile':['Şili','🇨🇱'],'Peru':['Peru','🇵🇪'],'Serbia':['Sırbistan','🇷🇸'],'Croatia':['Hırvatistan','🇭🇷'],'Hungary':['Macaristan','🇭🇺'],'Bulgaria':['Bulgaristan','🇧🇬'],'Luxembourg':['Lüksemburg','🇱🇺']
};
function countryTokens(value){return String(value||'').split(/[,\u002f;|\n]+/).map(x=>x.trim()).filter(Boolean)}
function countryKey(value){return String(value||'').trim().toLocaleLowerCase('tr-TR').replace(/\s+/g,' ')}
function countryDisplay(value){
 const key=countryKey(value);
 const entry=Object.entries(countryAliases).find(([name,info])=>countryKey(name)===key||countryKey(info[0])===key);
 return entry?{name:entry[1][0],flag:entry[1][1]}:{name:String(value||'').trim(),flag:'🌐'};
}
function escapeCountryHtml(value){return String(value||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
function filterByCountry(country,update=true){
 activeCatalogCountry=countryKey(country);activeCatalogGenre='all';activeCatalogType='all';activeCatalogQuery='';
 const search=document.getElementById('search-input');if(search)search.value='';
 showCatalogView(countryDisplay(country).name+' Yapımları');
 if(update)goRoute('#/ulke/'+encodeURIComponent(country));
 renderFilteredCatalog();
}
document.addEventListener('click',function(event){const chip=event.target.closest('.detail-country-chip');if(chip)filterByCountry(chip.dataset.country);});

function renderFilteredCatalog() {
            const query = activeCatalogQuery.trim().toLocaleLowerCase('tr-TR');
            const filtered = mediaDatabase.filter(m => {
                const genre = (m.genre || '').toLocaleLowerCase('tr-TR');
                const category = (m.category || '').toLocaleLowerCase('tr-TR');
                const needle = activeCatalogGenre.toLocaleLowerCase('tr-TR');
                const genreMatch = activeCatalogGenre === 'all' || genre.includes(needle) || category.includes(needle);
                const typeMatch = activeCatalogType === 'all' || m.type === activeCatalogType;
                const countryMatch = !activeCatalogCountry || countryTokens(m.country).some(x=>countryKey(x)===activeCatalogCountry);
                const searchMatch = !query || (m.title || '').toLocaleLowerCase('tr-TR').includes(query) || category.includes(query) || genre.includes(query);
                return genreMatch && typeMatch && searchMatch && countryMatch;
            });
            renderMediaGrid(filtered);
        }

        function filterGenre(genre,update=true) {
            activeCatalogGenre = genre;
            if(update)goRoute('#/kategori/'+encodeURIComponent(genre));
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
        function showCatalogView(title) {
            document.getElementById('hero-section').classList.add('hidden');
            document.getElementById('home-collections').classList.add('hidden');
            const live = document.getElementById('live-tv-section'); if (live) live.classList.add('hidden');
            document.getElementById('catalog-page').classList.remove('hidden');
            document.getElementById('catalog-heading').innerText = title;
            window.scrollTo({top:0,behavior:'smooth'});
        }
        function switchTab(tab,update=true) {
            closeHeaderMenus(); activeCatalogGenre='all'; activeCatalogQuery='';
            if(update)goRoute(tab==='movie'?'#/filmler':tab==='tv'?'#/diziler':tab==='watchlist'?'#/listem':'#/kesfet');
            document.getElementById('search-input').value='';
            activeCatalogType = tab==='movie'?'movie':tab==='tv'?'tv':'all';
            const title = tab==='movie'?'Filmler':tab==='tv'?'Diziler':tab==='watchlist'?'İzleme Listem':'Keşfet';
            showCatalogView(title);
            const items = tab==='watchlist' ? mediaDatabase.filter(m=>watchlist.includes(m.id)||watchlist.includes(String(m.id))) : mediaDatabase.filter(m=>activeCatalogType==='all'||m.type===activeCatalogType);
            renderMediaGrid(items);
        }
document.getElementById('search-input').addEventListener('input', function(e) {
            activeCatalogQuery = e.target.value || '';
            if (activeCatalogQuery.trim()) showCatalogView('Arama Sonuçları');
            renderFilteredCatalog();
        });


// İçerik detay görünümü
function goRoute(path){ if(location.hash!==path) location.hash=path; else routeFromHash(); }
function routeFromHash(){
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
 showDashboard(false);
}
function showDashboard(update=true){
 document.getElementById('theme-body').style.backgroundColor='#0b0c10';
 document.getElementById('dashboard-view').classList.remove('hidden');
 document.getElementById('detail-page-view').classList.add('hidden');
 document.getElementById('actor-page-view').classList.add('hidden');
 document.getElementById('hero-section').classList.remove('hidden');
 document.getElementById('home-collections').classList.remove('hidden');
 const live=document.getElementById('live-tv-section');if(live)live.classList.remove('hidden');
 const catalog=document.getElementById('catalog-page');if(catalog)catalog.classList.add('hidden');
 document.getElementById('detail-related').classList.add('hidden');
 if(update&&location.hash!=='#/anasayfa')history.pushState(null,'','#/anasayfa');
 window.scrollTo({top:0,behavior:'smooth'});
}

let activeCastPage=0;
let currentCastNames=[];
function escapeCastHtml(value){return String(value||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
function renderCastPage(){
 const list=document.getElementById('detail-cast-list');
 const controls=document.getElementById('detail-cast-controls');
 const label=document.getElementById('detail-cast-page-label');
 const firstPage=currentCastNames.slice(0,6);
 const secondPage=currentCastNames.slice(6,15);
 const visible=activeCastPage===0?firstPage:secondPage;
 list.innerHTML=visible.map(n=>{const safe=escapeCastHtml(n);return '<button type="button" class="detail-cast-person" data-actor-name="'+safe+'"><img data-cast-name="'+safe+'" src="https://ui-avatars.com/api/?name='+encodeURIComponent(n)+'&background=252936&color=ffffff&size=256&bold=true" alt="'+safe+'" loading="lazy"><b>'+safe+'</b><small>Karakter bilgisi katalogda yok</small></button>';}).join('')||'<p>Oyuncu bilgisi bulunmuyor.</p>';
 controls.classList.toggle('hidden',currentCastNames.length<=6);
 label.textContent=activeCastPage===0?'1 / 2':'2 / 2';
 controls.querySelector('button:first-child').disabled=activeCastPage===0;
 controls.querySelector('button:last-child').disabled=activeCastPage===1||secondPage.length===0;
 loadCastPortraits();
}
function changeCastPage(direction){
 const hasSecondPage=currentCastNames.length>6;
 if(!hasSecondPage)return;
 activeCastPage=direction>0?1:0;
 renderCastPage();
}
async function fetchActorSummary(name){
 const url='https://en.wikipedia.org/api/rest_v1/page/summary/'+encodeURIComponent(name.replace(/ /g,'_'));
 const response=await fetch(url,{headers:{'Accept':'application/json'}});
 if(!response.ok)throw new Error('Oyuncu profili bulunamadı');
 const data=await response.json();
 if(data.type==='disambiguation')throw new Error('Birden fazla eşleşme');
 return data;
}
async function loadCastPortraits(){
 const imgs=[...document.querySelectorAll('#detail-cast-list img[data-cast-name]')];
 await Promise.all(imgs.map(async img=>{
  const name=img.dataset.castName;
  try{const data=await fetchActorSummary(name);if(data.thumbnail?.source)img.src=data.thumbnail.source;}
  catch(e){img.classList.add('cast-photo-fallback');}
 }));
}
function openDetailPage(id,update=true){
 const item=mediaDatabase.find(m=>String(m.id)===String(id))||mediaDatabase[0];if(!item)return;
 if(update){const prefix=item.type==='tv'?'dizi':'film';const path='#/'+prefix+'/'+encodeURIComponent(item.id);if(location.hash!==path)history.pushState(null,'',path);}
 document.getElementById('theme-body').style.backgroundColor='#050505';
 document.getElementById('detail-backdrop').src=item.backdrop||item.image;
 document.getElementById('detail-poster').src=item.image;
 document.getElementById('detail-title').innerText=item.title;
 document.getElementById('detail-category').innerText=item.category||item.genre||'';
 document.getElementById('detail-rating').innerHTML='<i class="fa-solid fa-star"></i> '+(item.rating||'—')+' IMDb';
 document.getElementById('detail-year').innerText=item.year||'';
 document.getElementById('detail-duration').innerText=item.duration||'';
 document.getElementById('detail-type-label').innerText=item.type==='tv'?'Dizi':'Film';
 const countries=countryTokens(item.country);
 document.getElementById('detail-country').innerText=countries.map(country=>countryDisplay(country).name).join(', ')||'Ülke bilgisi yok';
 document.getElementById('detail-country-list').innerHTML=countries.map(country=>{const info=countryDisplay(country);return '<button type="button" class="detail-country-chip" data-country="'+escapeCountryHtml(country)+'"><span class="flag">'+info.flag+'</span><span>'+escapeCountryHtml(info.name)+'</span></button>';}).join('')||'<span>—</span>';
 document.getElementById('detail-info-genre').innerText=item.category||item.genre||'—';
 document.getElementById('detail-info-year').innerText=item.year||'—';
 document.getElementById('detail-desc').innerText=item.desc||'Açıklama henüz eklenmemiş.';
 document.getElementById('detail-director').innerText=item.director||'—';
 document.getElementById('detail-score-row').innerHTML='<span class="detail-score-pill"><b>IMDb</b><strong>★ '+(item.rating||'—')+'</strong></span><span class="detail-score-pill"><b>TMDB</b><strong>'+(item.tmdbRating||'—')+'</strong></span><span class="detail-score-pill"><b>RT</b><strong>'+(item.rottenTomatoes||'—')+'</strong></span><span class="detail-score-pill"><b>Popcorn</b><strong>'+(item.popcornmeter||'—')+'</strong></span>';
 updateDetailButtons(item.id);
 currentCastNames=(item.cast||[]).slice(0,15);activeCastPage=0;renderCastPage();
 document.getElementById('detail-play-btn').onclick=()=>launchPlayer(item.title);
 document.getElementById('detail-trailer-btn').onclick=()=>item.trailerUrl?window.open(item.trailerUrl,'_blank','noopener'):window.alert('Fragman bağlantısı bulunmuyor.');
 const related=mediaDatabase.filter(m=>m.id!==item.id&&(m.type===item.type||m.genre===item.genre)).sort((x,y)=>Number(y.rating||0)-Number(x.rating||0)).slice(0,10);
 document.getElementById('detail-related-rail').innerHTML=related.map(m=>'<article class="collection-card" onclick="openDetailPage(\''+m.id+'\')"><div class="collection-poster-wrap"><img src="'+m.image+'" alt="'+m.title+'" loading="lazy"><span class="collection-rating">★ '+(m.rating||'—')+'</span></div><div class="collection-card-copy"><h3>'+m.title+'</h3><p>'+m.year+' • '+(m.type==='tv'?'Dizi':'Film')+'</p></div></article>').join('');
 document.getElementById('dashboard-view').classList.add('hidden');
 document.getElementById('actor-page-view').classList.add('hidden');
 document.getElementById('detail-page-view').classList.remove('hidden');
 document.getElementById('detail-related').classList.remove('hidden');
 window.scrollTo({top:0,behavior:'smooth'});
}

function openActorPage(name,update=true){
 const actorName=decodeURIComponent(String(name||'')).trim();
 if(!actorName)return;
 const actorKey=actorName.toLocaleLowerCase('tr-TR');
 const works=mediaDatabase.filter(m=>(m.cast||[]).some(c=>String(c).toLocaleLowerCase('tr-TR')===actorKey));
 if(update){const path='#/oyuncu/'+encodeURIComponent(actorName);if(location.hash!==path)history.pushState(null,'',path);}
 document.getElementById('dashboard-view').classList.add('hidden');
 document.getElementById('detail-page-view').classList.add('hidden');
 document.getElementById('detail-related').classList.add('hidden');
 document.getElementById('actor-page-view').classList.remove('hidden');
 document.getElementById('theme-body').style.backgroundColor='#07080c';
 document.getElementById('actor-profile-name').textContent=actorName;
 document.getElementById('actor-biography-title').textContent=actorName;
 document.getElementById('actor-biography-text').textContent='Oyuncu biyografisi yükleniyor…';
 document.getElementById('actor-birth-date').textContent='Bilgi bulunamadı';
 document.getElementById('actor-country').textContent='Bilgi bulunamadı';
 const avatar='https://ui-avatars.com/api/?name='+encodeURIComponent(actorName)+'&background=252936&color=ffffff&size=512&bold=true';
 document.getElementById('actor-profile-image').src=avatar;
 const featured=works.slice().sort((a,b)=>Number(b.year||0)-Number(a.year||0)).slice(0,6);
 document.getElementById('actor-featured-films').innerHTML=featured.map(m=>'<button type="button" class="actor-featured-poster" onclick="openDetailPage(\''+String(m.id).replace(/'/g,"\\'")+'\')"><img src="'+m.image+'" alt="'+escapeCastHtml(m.title)+'" loading="lazy"><span>'+escapeCastHtml(m.title)+'</span></button>').join('')||'<p>Bu oyuncu için katalogda yapım bulunamadı.</p>';
 document.getElementById('actor-filmography-title').textContent=actorName+' — '+works.length+' yapım';
 document.getElementById('actor-filmography-grid').innerHTML=works.map(m=>'<button type="button" class="actor-work-card" onclick="openDetailPage(\''+String(m.id).replace(/'/g,"\\'")+'\')"><img src="'+m.image+'" alt="'+escapeCastHtml(m.title)+'" loading="lazy"><span><b>'+escapeCastHtml(m.title)+'</b><small>'+escapeCastHtml(m.year||'')+' · '+(m.type==='tv'?'Dizi':'Film')+'</small></span></button>').join('')||'<p>Bu oyuncunun yer aldığı bir yapım henüz katalogda bulunmuyor.</p>';
 window.scrollTo({top:0,behavior:'smooth'});
 fetchActorSummary(actorName).then(async data=>{
  if(!document.getElementById('actor-page-view').classList.contains('hidden')&&document.getElementById('actor-profile-name').textContent===actorName){
   document.getElementById('actor-biography-text').textContent=data.extract||'Oyuncu hakkında biyografi bilgisi bulunamadı.';
   document.getElementById('actor-profile-image').src=data.thumbnail?.source||avatar;
   document.getElementById('actor-wikipedia-link').href=data.content_urls?.desktop?.page||'https://en.wikipedia.org/wiki/'+encodeURIComponent(actorName.replace(/ /g,'_'));
   try{
    if(data.wikibase_item){
     const entityResponse=await fetch('https://www.wikidata.org/w/api.php?action=wbgetentities&ids='+encodeURIComponent(data.wikibase_item)+'&props=claims&format=json&origin=*');
     const entityData=await entityResponse.json();
     const claims=entityData.entities?.[data.wikibase_item]?.claims||{};
     const birth=claims.P569?.[0]?.mainsnak?.datavalue?.value?.time;
     const citizenship=claims.P27?.[0]?.mainsnak?.datavalue?.value?.id;
     const birthName=claims.P1477?.[0]?.mainsnak?.datavalue?.value?.text;
     if(birth)document.getElementById('actor-birth-date').textContent=birth.slice(1,11);
     if(birthName)document.getElementById('actor-profile-name').textContent=birthName;
     if(citizenship){
      const countryResponse=await fetch('https://www.wikidata.org/w/api.php?action=wbgetentities&ids='+encodeURIComponent(citizenship)+'&props=labels&languages=tr|en&format=json&origin=*');
      const countryData=await countryResponse.json();
      const countryEntity=countryData.entities?.[citizenship];
      document.getElementById('actor-country').textContent=countryEntity?.labels?.tr?.value||countryEntity?.labels?.en?.value||'Bilgi bulunamadı';
     }
    }
   }catch(e){}
  }
 }).catch(()=>{
  document.getElementById('actor-biography-text').textContent='Bu oyuncu için çevrimiçi biyografi bilgisi şu anda alınamadı. Filmografisi sitenin mevcut kataloğundan listelenmiştir.';
  document.getElementById('actor-wikipedia-link').href='https://en.wikipedia.org/w/index.php?search='+encodeURIComponent(actorName);
 });
}
window.openActorPage=openActorPage;
document.addEventListener('click',function(event){
 const actorCard=event.target.closest('[data-actor-name]');
 if(actorCard){openActorPage(actorCard.getAttribute('data-actor-name'));return;}
});

window.addEventListener('hashchange',routeFromHash);

window.addEventListener('popstate',routeFromHash);

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

        function closePlayer() {
            document.getElementById('player-modal').classList.add('hidden');
            document.getElementById('player-modal').classList.remove('flex');
        }

        let isPlaying = true;
        function togglePlayState() {
            isPlaying = !isPlaying;
            const centerIcon = document.getElementById('player-play-icon');
            const barIcon = document.getElementById('player-bar-icon');
            if (isPlaying) {
                centerIcon.className = 'fa-solid fa-pause text-brand-red text-3xl';
                barIcon.className = 'fa-solid fa-pause';
            } else {
                centerIcon.className = 'fa-solid fa-play text-brand-red text-3xl ml-1';
                barIcon.className = 'fa-solid fa-play';
            }
        }



        let mediaDatabase = [];
;

        const liveTvChannels = [
            { name: 'Disney Channel', icon: 'fa-tv', tag: 'Çocuk 24/7' },
            { name: 'HBO HD Live', icon: 'fa-film', tag: 'Sinema Kuşağı' },
            { name: 'ESPN Sports', icon: 'fa-trophy', tag: 'Canlı Maç Yayını' },
            { name: 'Discovery HD', icon: 'fa-earth-americas', tag: 'Belgesel' }
        ];

        let heroItems = [];
        let heroIndex = 0;
        let heroTimer = null;
        window.onload = async function() {
            try {
                const response = await fetch('data/catalog.json');
                if (!response.ok) throw new Error('Katalog dosyası yüklenemedi: ' + response.status);
                mediaDatabase = await response.json();
                heroItems = [...mediaDatabase].sort((a,b) => Number(b.year)-Number(a.year)).slice(0,10);
                if (!Array.isArray(mediaDatabase) || mediaDatabase.length === 0) {
                    throw new Error('Katalog dosyası boş veya geçersiz.');
                }
                setHeroMedia(mediaDatabase[0].id);
                renderHeroThumbnails();
                renderHomeCollections();
                renderMediaGrid();
                renderLiveTv();
                if(location.hash)routeFromHash();
            } catch (error) {
                console.error('Katalog yükleme hatası:', error);
                const grid = document.getElementById('media-grid');
                if (grid) grid.innerHTML = '<div class="col-span-full py-12 text-center text-red-400">Film ve dizi kataloğu yüklenemedi. Lütfen sayfayı yenileyin.</div>';
            }
        };
    