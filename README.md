# Perde

GitHub Pages üzerinde çalışan kişisel film ve dizi arşivi. Site arayüzü, yönetim merkezi ve kişisel izleme deneyimi tek depoda tutulur.

## Ana veri dosyaları

- `data/catalog.json`: Film ve dizi kayıtlarının ana kaynağı. TMDB kimliği, tür, görseller, izleme bağlantısı, platform bilgileri, kişisel notlar ve yapım altyazıları burada saklanır.
- `data/collections.json`: Ana sayfada gösterilen, yönetim panelinden oluşturulan özel koleksiyonlar.
- `assets/subtitles/`: Yönetim panelinden yüklenen altyazı dosyaları. SRT yüklemeleri WebVTT biçimine dönüştürülerek saklanır.
- `perde-archive-backup-2026-11-01.json`: Önceki arşiv yedeği; güncel katalog dosyasının yerine otomatik uygulanmaz.

## Uygulama dosyaları

- `index.html`: Ana site, detay görünümü ve sinema oynatıcısı.
- `admin.html`: Yönetim merkezi.
- `assets/js/bundle.js`: Katalog yükleme, arama, detay sayfası, oynatıcı kaynakları ve kayıtlı altyazıların oynatıcıya bağlanması.
- `assets/js/admin.js`: Katalog düzenleme, TMDB araması/eşitlemesi, koleksiyon yönetimi, izleme günlüğü ve yedekleme işlemleri.
- `assets/js/player-pro.js`: Oynatma ilerlemesi, kaldığın yerden devam etme, altyazı seçimi ve oynatıcı kontrolleri.
- `assets/js/series-pro.js`: Sezon/bölüm rehberi ve kişisel dizi günlüğü.
- `assets/js/homepage.js`: Ana sayfa koleksiyonlarının yüklenmesi ve görünümü.
- `assets/css/style.css`, `assets/css/admin.css`: Site ve yönetim merkezi stilleri.
- `service-worker.js`: Çevrimdışı uygulama kabuğu ve statik dosya önbelleği.

## Kayıt ve güvenlik

- Yönetim panelindeki katalog ve koleksiyon kayıtları GitHub Contents API üzerinden ilgili JSON dosyalarına yazılır.
- GitHub Fine-grained Personal Access Token yalnızca bu tarayıcının yerel depolamasında tutulur. Token'a yalnızca `megamrtklc/filmm` deposu için `Contents: Read and write` izni verilmelidir; token kaynak koda veya yedek dosyalarına eklenmez.
- Kişisel izleme günlüğü, favoriler, listeler, dizi ilerlemesi ve oynatıcı kayıtları bu cihazın tarayıcı depolamasında tutulur. Yönetim merkezindeki kişisel yedek bu verileri dışa aktarabilir ve uyumlu yedeklerden geri yükleyebilir.
- Katalog ve koleksiyon yedeği tek JSON dosyası olarak indirilebilir. Geri yükleme işlemi otomatik yapılmaz; katalog dosyasını değiştiren işlemler ayrıca kontrol edilmelidir.
- Altyazı dosyaları GitHub deposuna yüklenir ve ilgili yapımın `subtitles` alanında URL, dil, varsayılan seçimi ve varsa sezon/bölüm bilgisiyle ilişkilendirilir.
- Statik GitHub Pages mimarisinde kişisel veriler için sunucu taraflı kullanıcı hesabı veya bulut senkronizasyonu bulunmaz.

## Yayın

`main` dalına yapılan değişiklikler GitHub Pages dağıtımını tetikler. Yayın durumu GitHub Actions içindeki **pages build and deployment** iş akışından izlenir.
