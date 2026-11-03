// İçerik detay görünümü
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
