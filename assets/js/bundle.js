// Favoriler ve izleme listesi yönetimi
let favorites = JSON.parse(localStorage.getItem('ny7_favorites') || '[]');
        let watchlist = JSON.parse(localStorage.getItem('ny7_watchlist') || '[]');
        let heroCurrentId = 1;
        let heroCurrentTitle = 'THE BATMAN';
let heroImageSwapTimer = null;

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
function fitHeroTitleToWidth() {
            const title = document.getElementById('hero-title');
            if (!title) return;
            title.style.removeProperty('font-size');
            title.style.whiteSpace = 'nowrap';
            const baseSize = parseFloat(window.getComputedStyle(title).fontSize) || 36;
            let size = baseSize;
            while (title.scrollWidth > title.clientWidth && size > 16) {
                size -= 1;
                title.style.fontSize = size + 'px';
            }
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
            heroImageSwapTimer = window.setTimeout(() => { bg.src = item.backdrop || item.image; bg.alt = item.title; section.classList.remove('is-changing'); heroImageSwapTimer = null; }, 150);
            document.getElementById('hero-title').innerText = item.title;
            fitHeroTitleToWidth();
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
            heroTimer=setInterval(()=>{if(!document.hidden && document.getElementById('detail-page-view').classList.contains('hidden')) stepHero(1);},6500);
        }



// Moduna göre keşfet: ilk açılışta tüm katalogdan, kategori seçilince ilgili türden rastgele öneri.
const moodCategoryOptions = [
    { value:'', label:'Tüm kategoriler', icon:'fa-layer-group', terms:[] },
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

function getMoodCandidates(category) {
    const valid = mediaDatabase.filter(item => item && item.id != null && item.title && item.image);
    if (!category) return valid;
    const config = moodCategoryOptions.find(option => option.value === category);
    if (!config) return [];
    return valid.filter(item => {
        const tags = ((item.genre || '') + ' / ' + (item.category || '')).toLocaleLowerCase('tr-TR');
        return config.terms.some(term => tags.includes(term.toLocaleLowerCase('tr-TR')));
    });
}

function renderMoodRecommendation(item, category) {
    const result = document.getElementById('mood-discovery-result');
    if (!result || !item) return;
    const title = escapeCountryHtml(item.title || 'İsimsiz yapım');
    const backdrop = escapeCountryHtml(item.backdrop || item.image || '');
    const poster = escapeCountryHtml(item.image || item.backdrop || '');
    const typeLabel = item.type === 'tv' ? 'Dizi' : 'Film';
    const categoryLabel = category || (item.genre || (item.type === 'tv' ? 'Dizi' : 'Film'));
    const rating = escapeCountryHtml(item.rating || '—');
    const description = escapeCountryHtml(item.desc || 'Bu yapımı keşfetmek için detaylarına göz at.');
    const id = String(item.id).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const options = moodCategoryOptions.map(option =>
        '<button type="button" class="mood-category-option' + (category === option.value ? ' is-active' : '') + '" onclick="chooseMoodPick(\'' + option.value.replace(/'/g, "\\\\'") + '\')">' +
        '<i class="fa-solid ' + option.icon + '" aria-hidden="true"></i><span>' + option.label + '</span></button>'
    ).join('');
    result.innerHTML = `
        <div class="mood-discovery-backdrop" style="background-image:url('${backdrop}')"></div>
        <div class="mood-discovery-overlay"></div>
        <div class="mood-discovery-head">
            <div class="mood-discovery-heading">
                <span class="mood-discovery-eyebrow"><i class="fa-solid fa-clapperboard"></i> MODUNA GÖRE KEŞFET</span>
                <h2>Bir ruh hali seç</h2>
                <p>Sana uygun yapımı bulalım</p>
            </div>
            <div class="mood-category-select">
                <button type="button" class="mood-category-trigger" aria-expanded="false" aria-controls="mood-category-menu" onclick="toggleMoodCategoryMenu()">
                    <i class="fa-solid fa-layer-group" aria-hidden="true"></i>
                    <span>${category || 'Tüm kategoriler'}</span>
                    <i class="fa-solid fa-chevron-down mood-select-chevron" aria-hidden="true"></i>
                </button>
                <div id="mood-category-menu" class="mood-category-menu" hidden>${options}</div>
            </div>
        </div>
        <div class="mood-discovery-feature">
            <div class="mood-discovery-poster"><img src="${poster}" alt="${title}" loading="eager"></div>
            <div class="mood-discovery-copy">
                <span class="mood-discovery-tag">${escapeCountryHtml(categoryLabel)} <b>•</b> ${typeLabel}</span>
                <h3>${title}</h3>
                <div class="mood-discovery-meta"><span><i class="fa-regular fa-calendar"></i> ${escapeCountryHtml(item.year || '—')}</span>${item.duration ? '<span><i class="fa-regular fa-clock"></i> ' + escapeCountryHtml(item.duration) + '</span>' : ''}<span class="mood-discovery-imdb mood-discovery-imdb-inline"><i class="fa-solid fa-star" aria-hidden="true"></i><strong>${rating}</strong><span>IMDb</span></span></div>
                <p class="mood-discovery-description">${description}</p>
                <div class="mood-discovery-actions">
                    <button type="button" class="mood-discovery-primary" onclick="openDetailPage('${id}')"><i class="fa-solid fa-circle-info"></i> Detayları Gör</button>
                    <button type="button" class="mood-discovery-again" onclick="chooseMoodPick(activeMoodCategory)" aria-label="Başka öner"><i class="fa-solid fa-shuffle"></i> Başka Öner</button>
                </div>
            </div>
        </div>`;
}

function toggleMoodCategoryMenu() {
    const menu = document.getElementById('mood-category-menu');
    const trigger = document.querySelector('.mood-category-trigger');
    if (!menu || !trigger) return;
    const opening = menu.hidden;
    menu.hidden = !opening;
    trigger.setAttribute('aria-expanded', String(opening));
    const chevron = trigger.querySelector('.mood-select-chevron');
    if (chevron) chevron.style.transform = opening ? 'rotate(180deg)' : 'rotate(0deg)';
}

function chooseMoodPick(category) {
    activeMoodCategory = category || '';
    const result = document.getElementById('mood-discovery-result');
    if (!result) return;
    const categoryMenu = document.getElementById('mood-category-menu');
    const categoryTrigger = document.querySelector('.mood-category-trigger');
    if (categoryMenu) categoryMenu.hidden = true;
    if (categoryTrigger) categoryTrigger.setAttribute('aria-expanded', 'false');
    const candidates = getMoodCandidates(activeMoodCategory);
    if (!candidates.length) {
        result.innerHTML = '<div class="mood-discovery-empty">Bu kategoride henüz önerilebilecek bir yapım bulunamadı. Başka bir kategori deneyebilirsin.</div>';
        return;
    }
    let pool = candidates.filter(item => String(item.id) !== String(lastMoodRecommendationId));
    if (!pool.length) pool = candidates;
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    lastMoodRecommendationId = chosen.id;
    renderMoodRecommendation(chosen, activeMoodCategory);
}

function initializeMoodDiscovery() {
    activeMoodCategory = '';
    chooseMoodPick('');
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
  const image=info.image?'<img class="director-profile-photo" src="'+escapeCountryHtml(info.image)+'" alt="'+escapeCountryHtml(name)+'" loading="eager">':'<div class="director-profile-avatar"><i class="fa-solid fa-clapperboard"></i></div>';
  const birthValue=info.born?(info.age!==''?info.born+' ('+info.age+' yaşında)':info.born):'Bilgi bulunamadı';
  const compactFacts=[
   ['Eğitim',info.education.length?info.education.join(', '):'Bilgi bulunamadı'],
   ...(info.died?[['Vefat',info.died]]:[]),
   ['Aldığı ödüller',info.awards.length?info.awards.join(' · '):'Kayıtlı ödül bilgisi bulunamadı']
  ];
  panel.innerHTML='<div class="director-profile-content"><section class="director-profile-facts"><div class="director-profile-identity">'+image+'<div class="director-profile-heading"><h2>'+escapeCountryHtml(name)+'</h2><div class="director-profile-birth"><span>DOĞUM</span><b>'+escapeCountryHtml(birthValue)+'</b></div>'+compactFacts.slice(0,1).map(([label,value])=>'<div class="director-profile-inline-fact"><span>'+escapeCountryHtml(label)+'</span><b>'+escapeCountryHtml(value)+'</b></div>').join('')+'</div></div><div class="director-profile-fact-list">'+compactFacts.slice(1).map(([label,value])=>'<div class="director-profile-fact"><span>'+escapeCountryHtml(label)+'</span><b>'+escapeCountryHtml(value)+'</b></div>').join('')+'</div></section><section class="director-profile-biography"><small>HAYATI VE KARİYERİ</small><p>'+escapeCountryHtml(info.bio)+'</p>'+(info.wikiUrl?'<a href="'+escapeCountryHtml(info.wikiUrl)+'" target="_blank" rel="noopener">Kaynağı görüntüle <i class="fa-solid fa-arrow-up-right-from-square"></i></a>':'')+'</section></div>';
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
 activeCatalogCountry='';activeCatalogGenre='all';activeCatalogGenreTag='';activeCatalogDirector=countryKey(selected);activeCatalogType='all';activeCatalogQuery='';
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

function renderFilteredCatalog() {
            const query = activeCatalogQuery.trim().toLocaleLowerCase('tr-TR');
            const filtered = mediaDatabase.filter(m => {
                const genre = (m.genre || '').toLocaleLowerCase('tr-TR');
                const category = (m.category || '').toLocaleLowerCase('tr-TR');
                const needle = activeCatalogGenre.toLocaleLowerCase('tr-TR');
                const genreMatch = activeCatalogGenre === 'all' || genre.includes(needle) || category.includes(needle);
                const typeMatch = activeCatalogType === 'all' || m.type === activeCatalogType;
                const countryMatch = !activeCatalogCountry || countryTokens(m.country).some(x=>countryIdentity(x)===activeCatalogCountry);
                const directorMatch = !activeCatalogDirector || countryKey(m.director)===activeCatalogDirector || countryTokens(m.director).some(x=>countryKey(x)===activeCatalogDirector);
                const itemGenres = [...new Set([...countryTokens(m.category),...countryTokens(m.genre)])];
                const genreTagMatch = !activeCatalogGenreTag || itemGenres.some(x=>countryKey(x)===activeCatalogGenreTag);
                const searchMatch = !query || (m.title || '').toLocaleLowerCase('tr-TR').includes(query) || category.includes(query) || genre.includes(query);
                return genreMatch && typeMatch && searchMatch && countryMatch && directorMatch && genreTagMatch;
            });
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
        function showCatalogView(title) {
            document.getElementById('hero-section').classList.add('hidden');
            document.getElementById('home-collections').classList.add('hidden');
            const live = document.getElementById('live-tv-section'); if (live) live.classList.add('hidden');
            document.getElementById('catalog-page').classList.remove('hidden');
            document.getElementById('catalog-heading').innerText = title;
            window.scrollTo({top:0,behavior:'smooth'});
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
            renderMediaGrid(items);
        }
const headerSearchInput = document.getElementById('search-input');
const headerSearchResults = document.getElementById('header-search-results');
function renderHeaderSearchResults(value) {
    if (!headerSearchResults) return;
    const query = String(value || '').trim().toLocaleLowerCase('tr-TR');
    if (!query) {
        headerSearchResults.hidden = true;
        headerSearchResults.innerHTML = '';
        return;
    }
    const matches = mediaDatabase.filter(item =>
        String(item.title || '').toLocaleLowerCase('tr-TR').includes(query)
    ).slice(0, 8);
    headerSearchResults.innerHTML = matches.length ? matches.map(item => {
        const title = escapeCountryHtml(item.title || 'İsimsiz yapım');
        const image = escapeCountryHtml(item.image || '');
        const year = escapeCountryHtml(item.year || 'Yıl bilgisi yok');
        const type = item.type === 'tv' ? 'Dizi' : 'Film';
        return `<button type="button" class="header-search-result" role="option" data-search-result-id="${escapeCountryHtml(item.id)}">
            <img src="${image}" alt="" loading="lazy">
            <span class="header-search-result-copy"><strong>${title}</strong><small>${year} · ${type}</small></span>
            <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>
        </button>`;
    }).join('') : '<div class="header-search-empty">Eşleşen film veya dizi bulunamadı.</div>';
    headerSearchResults.hidden = false;
}
headerSearchInput.addEventListener('focus', () => {
    headerSearchInput.closest('.glass-search')?.classList.add('is-expanded');
    renderHeaderSearchResults(headerSearchInput.value);
});
headerSearchInput.addEventListener('input', function(e) {
    // Arama yalnızca üst menüdeki sonuç panelini günceller; katalog görünümünü değiştirmez.
    renderHeaderSearchResults(e.target.value || '');
});
headerSearchResults.addEventListener('click', event => {
    const result = event.target.closest('[data-search-result-id]');
    if (!result) return;
    const id = result.dataset.searchResultId;
    headerSearchResults.hidden = true;
    headerSearchInput.blur();
    openDetailPage(id);
});
document.addEventListener('click', event => {
    if (!event.target.closest('.header-search-shell') && headerSearchResults) headerSearchResults.hidden = true;
});
headerSearchInput.addEventListener('keydown', event => {
    if (event.key === 'Escape' && headerSearchResults) headerSearchResults.hidden = true;
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
 updateHeaderActiveState();
 window.scrollTo({top:0,behavior:'smooth'});
}

let activeCastPage=0;
let currentCastNames=[];
let currentCastItemId='';
function escapeCastHtml(value){return String(value||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
function renderCastPage(){
 const list=document.getElementById('detail-cast-list');
 const controls=document.getElementById('detail-cast-controls');
 const label=document.getElementById('detail-cast-page-label');
 const firstPage=currentCastNames.slice(0,6);
 const secondPage=currentCastNames.slice(6,15);
 const visible=activeCastPage===0?firstPage:secondPage;
 list.innerHTML=visible.map(member=>{
  const name=typeof member==='string'?member:member.name;
  const photo=typeof member==='string'?'':member.image||'';
  const safe=escapeCastHtml(name);
  const src=photo?escapeCastHtml(photo):'https://ui-avatars.com/api/?name='+encodeURIComponent(name)+'&background=252936&color=ffffff&size=256&bold=true';
  return '<button type="button" class="detail-cast-person" data-actor-name="'+safe+'"><img src="'+src+'" alt="'+safe+'" loading="lazy"><b>'+safe+'</b><small>'+(photo?'Oyuncu':'Fotoğraf doğrulanamadı')+'</small></button>';
 }).join('')||'<p>Oyuncu bilgisi bulunmuyor.</p>';
 controls.classList.toggle('hidden',currentCastNames.length<=6);
 label.textContent=activeCastPage===0?'1 / 2':'2 / 2';
 controls.querySelector('button:first-child').disabled=activeCastPage===0;
 controls.querySelector('button:last-child').disabled=activeCastPage===1||secondPage.length===0;
}
function changeCastPage(direction){
 if(currentCastNames.length<=6)return;
 activeCastPage=direction>0?1:0;
 renderCastPage();
}
// Oyuncu kimliği isimden tahmin edilmez: yapımın TMDB kimliğiyle Wikidata'daki
// doğrudan oyuncu kadrosu (P161) alınır. Böylece aynı isimli kişiler karışmaz.
async function loadVerifiedCast(item){
 const requestId=String(item.id);
 currentCastItemId=requestId;
 const fallback=(item.cast||[]).slice(0,15).map(name=>({name,image:''}));
 if(!item.tmdbId){currentCastNames=fallback;renderCastPage();return;}
 const property=item.type==='tv'?'P4983':'P4947';
 const query='SELECT ?actor ?actorLabel ?image ?order WHERE { ?work wdt:'+property+' "'+String(item.tmdbId).replace(/[^0-9]/g,'')+'". ?work p:P161 ?statement. ?statement ps:P161 ?actor. OPTIONAL { ?statement pq:P1545 ?order. } OPTIONAL { ?actor wdt:P18 ?image. } SERVICE wikibase:label { bd:serviceParam wikibase:language "tr,en". } } ORDER BY (IF(BOUND(?order), xsd:integer(?order), 999)) LIMIT 30';
 try{
  const response=await fetch('https://query.wikidata.org/sparql?query='+encodeURIComponent(query)+'&format=json',{headers:{'Accept':'application/sparql-results+json'}});
  if(!response.ok)throw new Error('Doğrulanmış oyuncu listesi alınamadı');
  const data=await response.json();
  const rows=data.results?.bindings||[];
  const verified=rows.map(row=>({name:row.actorLabel?.value||'',qid:(row.actor?.value||'').split('/').pop(),image:row.image?.value||''})).filter(person=>person.name);
  if(currentCastItemId!==requestId)return;
  currentCastNames=verified.length?verified.slice(0,15):fallback;
  activeCastPage=0;
  renderCastPage();
 }catch(error){
  if(currentCastItemId!==requestId)return;
  currentCastNames=fallback;
  activeCastPage=0;
  renderCastPage();
 }
}
function cleanActorBiography(text){
 return String(text||'')
  .replace(/\\r/g,'')
  .replace(/(?:^|\\n)(Kaynakça|Kaynaklar|Dış bağlantılar|Ayrıca bakınız|Notlar|Dipnotlar)\\s*\\n[\\s\\S]*$/i,'')
  .replace(/\\n{3,}/g,'\\n\\n')
  .trim();
}
async function fetchActorSummary(name,fullBiography=true){
 const title=String(name||'').trim().replace(/_/g,' ');
 const params=new URLSearchParams({
  action:'query',titles:title,redirects:'1',
  prop:'extracts|pageimages|info|pageprops',
  explaintext:'1',exchars:fullBiography?'20000':'1200',
  piprop:'thumbnail',pithumbsize:'1200',inprop:'url',
  format:'json',origin:'*'
 });
 if(!fullBiography)params.set('exintro','1');
 let page=null;
 try{
  const response=await fetch('https://tr.wikipedia.org/w/api.php?'+params.toString(),{headers:{'Accept':'application/json'}});
  if(response.ok){
   const data=await response.json();
   page=Object.values(data.query?.pages||{}).find(item=>item.extract);
  }
 }catch(e){}
 // Başlık eşleşmezse Türkçe Wikipedia aramasından ilgili oyuncu sayfasını bul.
 if(!page){
  const searchParams=new URLSearchParams({
   action:'query',generator:'search',gsrsearch:title,gsrlimit:'5',
   prop:'extracts|pageimages|info|pageprops',
   explaintext:'1',exchars:fullBiography?'20000':'1200',
   piprop:'thumbnail',pithumbsize:'1200',inprop:'url',
   format:'json',origin:'*'
  });
  if(!fullBiography)searchParams.set('exintro','1');
  const response=await fetch('https://tr.wikipedia.org/w/api.php?'+searchParams.toString(),{headers:{'Accept':'application/json'}});
  if(!response.ok)throw new Error('Türkçe oyuncu profili bulunamadı');
  const data=await response.json();
  const pages=Object.values(data.query?.pages||{});
  const wanted=title.toLocaleLowerCase('tr-TR');
  page=pages.find(item=>String(item.title||'').toLocaleLowerCase('tr-TR')===wanted)||pages.find(item=>item.extract);
 }
 if(!page?.extract)throw new Error('Türkçe biyografi bulunamadı');
 return {
  extract:fullBiography?cleanActorBiography(page.extract):page.extract,
  thumbnail:page.thumbnail?{source:page.thumbnail.source}:undefined,
  content_urls:{desktop:{page:page.fullurl||('https://tr.wikipedia.org/wiki/'+encodeURIComponent(page.title.replace(/ /g,'_')))}},
  wikibase_item:page.pageprops?.wikibase_item,
  title:page.title
 };
}
async function loadCastPortraits(){
 const imgs=[...document.querySelectorAll('#detail-cast-list img[data-cast-name]')];
 await Promise.all(imgs.map(async img=>{
  const name=img.dataset.castName;
  try{const data=await fetchActorSummary(name,false);if(data.thumbnail?.source)img.src=data.thumbnail.source;}
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
 const directors=countryTokens(item.director);
 const genres=[...new Set([...countryTokens(item.category),...countryTokens(item.genre)])];
 document.getElementById('detail-country').innerText=countries.map(country=>countryDisplay(country).name).join(', ')||'Ülke bilgisi yok';
 document.getElementById('detail-country-list').innerHTML=countries.map(country=>{const info=countryDisplay(country);return '<button type="button" class="detail-country-chip" data-country="'+escapeCountryHtml(country)+'">'+countryFlagImage(info.iso,'flag-image')+'<span>'+escapeCountryHtml(info.name)+'</span></button>';}).join('')||'<span>—</span>';
 document.getElementById('detail-info-genre').innerHTML=genres.map(genre=>'<button type="button" class="detail-taxonomy-chip" data-genre="'+escapeCountryHtml(genre)+'">'+escapeCountryHtml(genre)+'</button>').join('')||'<span>—</span>';
 document.getElementById('detail-info-year').innerText=item.year||'—';
 document.getElementById('detail-desc').innerText=item.desc||'Açıklama henüz eklenmemiş.';
 document.getElementById('detail-director').innerHTML=directors.map(director=>'<button type="button" class="detail-taxonomy-chip" data-director="'+escapeCountryHtml(director)+'">'+escapeCountryHtml(director)+'</button>').join('')||'<span>—</span>';
 document.getElementById('detail-score-row').innerHTML='<span class="detail-score-pill"><b>IMDb</b><strong>★ '+(item.rating||'—')+'</strong></span><span class="detail-score-pill"><b>TMDB</b><strong>'+(item.tmdbRating||'—')+'</strong></span><span class="detail-score-pill"><b>RT</b><strong>'+(item.rottenTomatoes||'—')+'</strong></span><span class="detail-score-pill"><b>Popcorn</b><strong>'+(item.popcornmeter||'—')+'</strong></span>';
 updateDetailButtons(item.id);
 currentCastNames=(item.cast||[]).slice(0,15).map(name=>({name,image:''}));currentCastItemId=String(item.id);activeCastPage=0;renderCastPage();loadVerifiedCast(item);
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

let actorGalleryPhotos=[];
let actorGalleryPage=0;
let actorGalleryVisibleCount=5;
let activeActorPhoto=0;
let activeActorPhotoName='';
function renderActorGallery(){
 const grid=document.getElementById('actor-gallery-grid');
 const visible=actorGalleryPhotos.slice(0,actorGalleryVisibleCount);
 grid.innerHTML=visible.map((photo,index)=>'<button type="button" class="actor-gallery-photo'+(index===0?' actor-gallery-photo-featured':'')+'" data-gallery-index="'+index+'" aria-label="Fotoğrafı büyüt"><img src="'+escapeCastHtml(photo.thumb||photo.url)+'" alt="'+escapeCastHtml(activeActorPhotoName)+' fotoğraf '+(index+1)+'" loading="'+(index<5?'eager':'lazy')+'"><span><i class="fa-solid fa-expand"></i></span><small>'+(index+1).toString().padStart(2,'0')+'</small></button>').join('')||'<p class="actor-gallery-empty">Bu oyuncu için fotoğraf bulunamadı.</p>';
 document.getElementById('actor-gallery-count').textContent=actorGalleryPhotos.length?Math.min(actorGalleryVisibleCount,actorGalleryPhotos.length)+' / '+actorGalleryPhotos.length+' fotoğraf gösteriliyor':'Fotoğraf bulunamadı';
 const more=document.getElementById('actor-gallery-more');
 if(more){more.hidden=actorGalleryVisibleCount>=actorGalleryPhotos.length;more.textContent='Daha fazla fotoğraf göster';}
}
function changeActorGalleryPage(){
 actorGalleryVisibleCount=Math.min(actorGalleryVisibleCount+5,actorGalleryPhotos.length);
 renderActorGallery();
}
async function loadActorGallery(name){
 actorGalleryPhotos=[];actorGalleryPage=0;actorGalleryVisibleCount=5;activeActorPhotoName=name;
 renderActorGallery();
 try{
  const query='filetype:bitmap "'+name.replace(/"/g,'')+'"';
  const url='https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch='+encodeURIComponent(query)+'&gsrnamespace=6&gsrlimit=20&prop=imageinfo&iiprop=url%7Cextmetadata&iiextmetadatafilter=LicenseShortName%7CArtist%7CCredit&iiurlwidth=900&format=json&origin=*';
  const response=await fetch(url);
  if(!response.ok)throw new Error('Görseller alınamadı');
  const data=await response.json();
  const pages=Object.values(data.query?.pages||{});
  actorGalleryPhotos=pages.map(p=>{const info=p.imageinfo?.[0];return info?.thumburl?{url:info.url,thumb:info.thumburl,title:p.title,page:info.descriptionurl,width:info.width||0,height:info.height||0,license:info.extmetadata?.LicenseShortName?.value||'Lisans bilgisi sayfada',artist:info.extmetadata?.Artist?.value||info.extmetadata?.Credit?.value||''}:null;}).filter(Boolean).slice(0,20);
  renderActorGallery();
  const hero=document.getElementById('actor-featured-photos');
  if(actorGalleryPhotos.length){
   const collagePhotos=actorGalleryPhotos.slice(0,5);
   const collage=collagePhotos.map((photo,index)=>'<div class="actor-banner-tile actor-banner-tile-'+(index+1)+'"><img src="'+escapeCastHtml(photo.thumb||photo.url)+'" alt="'+escapeCastHtml(name)+' fotoğraf '+(index+1)+'" loading="'+(index===0?'eager':'lazy')+'"></div>').join('');
   hero.innerHTML='<div class="actor-banner-collage" aria-label="'+escapeCastHtml(name)+' fotoğraf kolajı">'+collage+'</div><div class="actor-banner-shade"></div><div class="actor-banner-copy"><span>OYUNCU PROFİLİ</span><h1 id="actor-banner-name">'+escapeCastHtml(name)+'</h1></div>';
  }else{
   hero.innerHTML='<div class="actor-banner-placeholder">Bu oyuncu için yatay görsel bulunamadı</div><div class="actor-banner-shade"></div><div class="actor-banner-copy"><span>OYUNCU PROFİLİ</span><h1 id="actor-banner-name">'+escapeCastHtml(name)+'</h1></div>';
  }
 }catch(error){
  document.getElementById('actor-gallery-count').textContent='Fotoğraf galerisi şu anda yüklenemedi.';
  document.getElementById('actor-featured-photos').innerHTML='<div class="actor-hero-empty">Oyuncu fotoğrafları yüklenemedi</div>';
 }
}
function openActorPhoto(index){
 if(!actorGalleryPhotos.length)return;
 activeActorPhoto=(index+actorGalleryPhotos.length)%actorGalleryPhotos.length;
 const photo=actorGalleryPhotos[activeActorPhoto];
 document.getElementById('actor-photo-modal-image').src=photo.url||photo.thumb;
 const caption=document.getElementById('actor-photo-modal-caption');caption.innerHTML=(activeActorPhoto+1)+' / '+actorGalleryPhotos.length+(photo.page?' · <a href=\"'+escapeCastHtml(photo.page)+'\" target=\"_blank\" rel=\"noopener\">Kaynak / lisans</a>':'');
 document.getElementById('actor-photo-modal').classList.remove('hidden');
 document.body.classList.add('actor-modal-open');
}
function stepActorPhoto(direction){openActorPhoto(activeActorPhoto+direction)}
function closeActorPhoto(){
 document.getElementById('actor-photo-modal').classList.add('hidden');
 document.body.classList.remove('actor-modal-open');
}
window.closeActorPhoto=closeActorPhoto;
window.stepActorPhoto=stepActorPhoto;
window.changeActorGalleryPage=changeActorGalleryPage;
document.addEventListener('click',function(event){
 const photo=event.target.closest('[data-gallery-index]');
 if(photo&&document.getElementById('actor-page-view').contains(photo)){openActorPhoto(Number(photo.dataset.galleryIndex));return;}
 if(event.target.id==='actor-photo-modal')closeActorPhoto();
});
document.addEventListener('keydown',function(event){
 if(document.getElementById('actor-photo-modal').classList.contains('hidden'))return;
 if(event.key==='Escape')closeActorPhoto();
 if(event.key==='ArrowLeft')stepActorPhoto(-1);
 if(event.key==='ArrowRight')stepActorPhoto(1);
});
async function fetchWikidataLabel(id){
 if(!id)return '';
 try{
  const response=await fetch('https://www.wikidata.org/w/api.php?action=wbgetentities&ids='+encodeURIComponent(id)+'&props=labels&languages=tr|en&format=json&origin=*');
  const data=await response.json();
  const entity=data.entities?.[id];
  return entity?.labels?.tr?.value||entity?.labels?.en?.value||'';
 }catch(e){return ''}
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
 document.getElementById('actor-banner-name').textContent=actorName;
 document.getElementById('actor-biography-title').textContent=actorName;
 document.getElementById('actor-biography-text').textContent='Oyuncu biyografisi yükleniyor…';
 document.getElementById('actor-birth-date').textContent='Bilgi bulunamadı';
 document.getElementById('actor-birth-place').textContent='Bilgi bulunamadı';
 document.getElementById('actor-country').textContent='Bilgi bulunamadı';
 document.getElementById('actor-education').textContent='Bilgi bulunamadı';
 const avatar='https://ui-avatars.com/api/?name='+encodeURIComponent(actorName)+'&background=252936&color=ffffff&size=512&bold=true';
 document.getElementById('actor-profile-image').src=avatar;
 document.getElementById('actor-featured-photos').innerHTML='<div class="actor-banner-placeholder">Oyuncu görseli yükleniyor…</div><div class="actor-banner-shade"></div><div class="actor-banner-copy"><span>OYUNCU PROFİLİ</span><h1 id="actor-banner-name">'+escapeCastHtml(actorName)+'</h1></div>';
 document.getElementById('actor-gallery-grid').innerHTML='';
 document.getElementById('actor-filmography-title').textContent=actorName+' — '+works.length+' yapım';
 document.getElementById('actor-filmography-grid').innerHTML=works.map(m=>'<button type="button" class="actor-work-card" onclick="openDetailPage(\''+String(m.id).replace(/'/g,"\\'")+'\')"><img src="'+m.image+'" alt="'+escapeCastHtml(m.title)+'" loading="lazy"><span><b>'+escapeCastHtml(m.title)+'</b><small>'+escapeCastHtml(m.year||'')+' · '+(m.type==='tv'?'Dizi':'Film')+'</small></span></button>').join('')||'<p>Bu oyuncunun yer aldığı bir yapım henüz katalogda bulunmuyor.</p>';
 closeActorPhoto();
 loadActorGallery(actorName);
 window.scrollTo({top:0,behavior:'smooth'});
 fetchActorSummary(actorName).then(async data=>{
  if(document.getElementById('actor-page-view').classList.contains('hidden')||document.getElementById('actor-banner-name').textContent!==actorName)return;
  document.getElementById('actor-biography-text').textContent=data.extract||'Oyuncu hakkında biyografi bilgisi bulunamadı.';
  document.getElementById('actor-profile-image').src=data.thumbnail?.source||avatar;
  document.getElementById('actor-wikipedia-link').href=data.content_urls?.desktop?.page||'https://en.wikipedia.org/wiki/'+encodeURIComponent(actorName.replace(/ /g,'_'));
  try{
   if(data.wikibase_item){
    const entityResponse=await fetch('https://www.wikidata.org/w/api.php?action=wbgetentities&ids='+encodeURIComponent(data.wikibase_item)+'&props=claims&format=json&origin=*');
    const entityData=await entityResponse.json();
    const claims=entityData.entities?.[data.wikibase_item]?.claims||{};
    const birth=claims.P569?.[0]?.mainsnak?.datavalue?.value?.time;
    const death=claims.P570?.[0]?.mainsnak?.datavalue?.value?.time;
    const citizenship=claims.P27?.[0]?.mainsnak?.datavalue?.value?.id;
    const birthplace=claims.P19?.[0]?.mainsnak?.datavalue?.value?.id;
    const birthName=claims.P1477?.[0]?.mainsnak?.datavalue?.value?.text;
    const formatActorDate=value=>{
     const parts=String(value||'').slice(1,11).split('-').map(Number);
     return parts.length===3&&parts.every(Number.isFinite)?{year:parts[0],month:parts[1],day:parts[2],label:[String(parts[2]).padStart(2,'0'),String(parts[1]).padStart(2,'0'),parts[0]].join('.')} : null;
    };
    if(birth){
     const born=formatActorDate(birth);
     const died=death?formatActorDate(death):null;
     if(born){
      const ageEnd=died?new Date(Date.UTC(died.year,died.month-1,died.day)):new Date();
      let age=ageEnd.getUTCFullYear()-born.year;
      if(ageEnd.getUTCMonth()<born.month-1||(ageEnd.getUTCMonth()===born.month-1&&ageEnd.getUTCDate()<born.day))age--;
      const deathLine=died?'<small class="actor-death-date">Vefat: '+died.label+'</small>':'';
      document.getElementById('actor-birth-date').innerHTML=born.label+' ('+age+' yaşında)'+deathLine;
     }
    }
    if(birthName)document.getElementById('actor-banner-name').textContent=birthName;
    const educationIds=[...new Set((claims.P69||[]).map(item=>item.mainsnak?.datavalue?.value?.id).filter(Boolean))];
    const [countryLabel,placeLabel,educationLabels]=await Promise.all([
     fetchWikidataLabel(citizenship),
     fetchWikidataLabel(birthplace),
     Promise.all(educationIds.map(fetchWikidataLabel))
    ]);
    if(countryLabel){const country=countryDisplay(countryLabel);document.getElementById('actor-country').innerHTML='<span class="actor-country-value">'+countryFlagImage(country.iso,'actor-country-flag')+'<span>'+escapeCastHtml(country.name)+'</span></span>';}
    if(placeLabel)document.getElementById('actor-birth-place').textContent=placeLabel;
    const education=educationLabels.filter(Boolean);
    if(education.length)document.getElementById('actor-education').textContent=education.join(', ');
   }
  }catch(e){}
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
        let catalogInitialized = false;
        async function initializeCatalog() {
            if (catalogInitialized) return;
            catalogInitialized = true;
            try {
                const catalogUrl = new URL('data/catalog.json?v=20261105-mood-hero', document.baseURI);
                let response = await fetch(catalogUrl.href, { cache: 'no-store' });
                if (!response.ok) {
                    response = await fetch('https://raw.githubusercontent.com/megamrtklc/filmm/main/data/catalog.json?v=20261105-mood-hero', { cache: 'no-store' });
                }
                if (!response.ok) throw new Error('Katalog isteği başarısız: ' + response.status);
                const loadedCatalog = await response.json();
                if (!Array.isArray(loadedCatalog) || loadedCatalog.length === 0) throw new Error('Katalog dosyası boş veya geçersiz.');
                mediaDatabase = loadedCatalog;
                heroItems = [...mediaDatabase].sort((a,b) => Number(b.year)-Number(a.year)).slice(0,10);
                setHeroMedia(mediaDatabase[0].id);
                renderHeroThumbnails();
                renderHomeCollections();
                initializeMoodDiscovery();
                renderMediaGrid();
                renderLiveTv();
                renderHeaderSearchResults(headerSearchInput?.value || '');
                if(location.hash) routeFromHash();
            } catch (error) {
                catalogInitialized = false;
                console.error('Katalog yükleme hatası:', error);
                const message = '<div class="col-span-full py-12 text-center text-red-400">Film ve dizi kataloğu yüklenemedi. Lütfen biraz sonra yeniden deneyin.</div>';
                ['media-grid','featured-rail','top-movies-rail','top-series-rail'].forEach(id => {
                    const target = document.getElementById(id);
                    if (target) target.innerHTML = message;
                });
            }
        }
        // Script sayfanin en altinda yuklendigi icin katalogu beklemeden baslat.
        // Boylece load olayi kacirilsa bile ana sayfa koleksiyonlari bos kalmaz.
        initializeCatalog();
    