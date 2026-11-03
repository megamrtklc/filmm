
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
                renderMediaGrid();
                renderLiveTv();
            } catch (error) {
                console.error('Katalog yükleme hatası:', error);
                const grid = document.getElementById('media-grid');
                if (grid) grid.innerHTML = '<div class="col-span-full py-12 text-center text-red-400">Film ve dizi kataloğu yüklenemedi. Lütfen sayfayı yenileyin.</div>';
            }
        };
    