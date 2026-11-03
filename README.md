# Filmm

Film ve dizi kataloğu için GitHub Pages üzerinde çalışan web uygulaması.

## Proje yapısı

```text
filmm/
├── index.html
├── data/
│   └── catalog.json
└── assets/
    ├── css/
    │   └── style.css
    └── js/
        ├── app.js
        └── modules/
            ├── user-lists.js
            ├── hero.js
            ├── catalog.js
            ├── detail.js
            └── player.js
```

## JavaScript sorumlulukları

- `app.js`: Uygulama başlangıcı, ortak katalog durumu ve JSON yükleme.
- `modules/user-lists.js`: Favoriler ve izleme listesi; mevcut localStorage kayıtlarını kullanır.
- `modules/hero.js`: Ana sayfa öne çıkan içerik alanı, küçük afişler ve otomatik slider.
- `modules/catalog.js`: Katalog kartları, canlı TV kartları, arama, tür/tip filtreleri ve sekmeler.
- `modules/detail.js`: Film/dizi detay görünümü.
- `modules/player.js`: Oynatıcı penceresi ve oynat/duraklat arayüzü.
- `data/catalog.json`: 125 film ve dizi kaydı.

## Veri yükleme

Uygulama açılışında `data/catalog.json` dosyası alınır. Katalog yüklendikten sonra ana sayfa slider'ı, içerik kartları ve canlı TV alanı oluşturulur.

## Not

JavaScript dosyaları klasik script olarak, bağımlılık sırasına göre yüklenir. Bu sayede HTML içindeki mevcut inline olay çağrıları (ör. `onclick`) geriye dönük uyumlu kalır.
