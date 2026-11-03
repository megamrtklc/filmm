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
