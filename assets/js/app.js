
        let mediaDatabase = [];
;

        const liveTvChannels = [
            { name: 'Disney Channel', icon: 'fa-tv', tag: 'Çocuk 24/7' },
            { name: 'HBO HD Live', icon: 'fa-film', tag: 'Sinema Kuşağı' },
            { name: 'ESPN Sports', icon: 'fa-trophy', tag: 'Canlı Maç Yayını' },
            { name: 'Discovery HD', icon: 'fa-earth-americas', tag: 'Belgesel' }
        ];

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

        const heroItems = [...mediaDatabase].sort((a,b) => Number(b.year)-Number(a.year)).slice(0,10);
        let heroIndex = 0;
        let heroTimer = null;
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
            document.getElementById('hero-rating-count').innerText = item.ratingCount;
            document.getElementById('hero-meta').innerText = `${item.year} • ${item.category} • Yönetmen: ${item.director}`;
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
                <div onclick="openDetailPage('${m.id}')" class="movie-card group cursor-pointer" style="--theme-glow: ${m.themeColor}">
                    <div class="relative aspect-[2/3] rounded-2xl overflow-hidden border border-white/10 bg-slate-900 shadow-xl">
                        <img src="${m.image}" alt="${m.title}" class="w-full h-full object-cover">
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

        function showDashboard(bgColor = '#0b0c10') {
            document.getElementById('theme-body').style.backgroundColor = bgColor;
            document.getElementById('dashboard-view').classList.remove('hidden');
            document.getElementById('detail-page-view').classList.add('hidden');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        function openDetailPage(id) {
            const item = mediaDatabase.find(m => m.id === id) || mediaDatabase[0];

            document.getElementById('theme-body').style.backgroundColor = item.themeColor;
            document.getElementById('detail-backdrop').src = item.backdrop || item.image;
            document.getElementById('detail-poster').src = item.image;
            document.getElementById('detail-title').innerText = item.title;
            document.getElementById('detail-category').innerText = item.category;
            document.getElementById('detail-rating').innerHTML = `<i class="fa-solid fa-star"></i> ${item.rating} IMDb`;
            document.getElementById('detail-year').innerText = item.year;
            document.getElementById('detail-duration').innerText = item.duration;
            document.getElementById('detail-type-label').innerText = item.type === 'tv' ? 'Dizi' : 'Film';
            document.getElementById('detail-info-genre').innerText = item.category;
            document.getElementById('detail-info-year').innerText = item.year;
            document.getElementById('detail-desc').innerText = item.desc;
            document.getElementById('detail-director').innerText = item.director;

            updateDetailButtons(item.id);

            const castContainer = document.getElementById('detail-cast-list');
            castContainer.innerHTML = item.cast.map(c => `
                <div class="bg-white/5 border border-white/10 p-3 rounded-xl flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full bg-brand-yellow/20 text-brand-yellow flex items-center justify-center font-bold text-xs">
                        <i class="fa-solid fa-user"></i>
                    </div>
                    <span class="text-xs font-bold text-white">${c}</span>
                </div>
            `).join('');

            document.getElementById('detail-play-btn').onclick = () => launchPlayer(item.title);

            document.getElementById('dashboard-view').classList.add('hidden');
            document.getElementById('detail-page-view').classList.remove('hidden');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        function filterGenre(genre) {
            if (genre === 'all') renderMediaGrid(mediaDatabase);
            else renderMediaGrid(mediaDatabase.filter(m => m.genre === genre || m.category.includes(genre)));
        }

        function filterType(type) {
            if (type === 'all') renderMediaGrid(mediaDatabase);
            else renderMediaGrid(mediaDatabase.filter(m => m.type === type));
        }

        function switchTab(tab) {
            showDashboard();
            const heading = document.getElementById('catalog-heading');
            if (tab === 'movie') {
                heading.innerText = 'Filmler';
                renderMediaGrid(mediaDatabase.filter(m => m.type === 'movie'));
            } else if (tab === 'tv') {
                heading.innerText = 'Diziler';
                renderMediaGrid(mediaDatabase.filter(m => m.type === 'tv'));
            } else if (tab === 'favorites') {
                heading.innerText = 'Favorilerim';
                renderMediaGrid(mediaDatabase.filter(m => favorites.includes(m.id)));
            } else if (tab === 'watchlist') {
                heading.innerText = 'İzleme Listem';
                renderMediaGrid(mediaDatabase.filter(m => watchlist.includes(m.id)));
            } else {
                heading.innerText = 'Tüm İçerik Kataloğu (30+ Yapım)';
                renderMediaGrid(mediaDatabase);
            }
        }

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

        document.getElementById('search-input').addEventListener('input', function(e) {
            const query = e.target.value.toLowerCase();
            const filtered = mediaDatabase.filter(m => 
                m.title.toLowerCase().includes(query) || 
                m.category.toLowerCase().includes(query) ||
                m.genre.toLowerCase().includes(query)
            );
            renderMediaGrid(filtered);
        });

        window.onload = async function() {
            try {
                const response = await fetch('data/catalog.json');
                if (!response.ok) throw new Error('Katalog dosyası yüklenemedi: ' + response.status);
                mediaDatabase = await response.json();
                if (!Array.isArray(mediaDatabase) || mediaDatabase.length === 0) {
                    throw new Error('Katalog dosyası boş veya geçersiz.');
                }
                setHeroMedia(mediaDatabase[0].id);
                renderHeroThumbnails();
                renderMediaGrid();
                renderLiveTv();
            } catch (error) {
                console.error('Katalog yükleme hatası:', error);
                const grid = document.getElementById('media-grid');
                if (grid) grid.innerHTML = '<div class="col-span-full py-12 text-center text-red-400">Film ve dizi kataloğu yüklenemedi. Lütfen sayfayı yenileyin.</div>';
            }
        };
    