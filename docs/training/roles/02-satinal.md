# SATINAL eğitim videosu

## Video kimliği

- **Başlık:** GTMLIMS SATINAL Eğitimi — Talep, Onay, EBYS ve CEP DEPO
- **Hedef kitle:** Satın alma talep ve onay sorumluları
- **Amaç:** Stok ihtiyacını değerlendirmek, standart ve CEP taleplerini onaylamak/reddetmek, resmi EBYS formu oluşturmak ve yetkili dağıtım işlemlerini göstermek
- **Tahmini süre:** 14-15 dakika
- **Doğrulama:** SATINAL hesabı canlı doğrulandı. Mevcut hesapta Teslim Al ve Fiyat Görüntüleme ek yetkileri kapalıdır.

## Görev ve sorumluluklar

- Stok, kritik seviye ve açık talepleri izlemek
- Standart satın alma talebi oluşturmak
- Bekleyen talepleri gerekçeli biçimde onaylamak veya reddetmek
- Bekleyen kalemleri resmi EBYS formunda paketlemek
- Lab teknisyeni CEP taleplerini onaylamak/reddetmek
- Ana depodan dağıtım, atık ve CEP dağıtımı yapmak
- Kullanıcı, sistem ayarı, ISO formu ve fiyat sayfasını yönetmemek
- Ek Teslim Al yetkisi verilmedikçe mal kabul yapmamak

## Gösterilecek sayfalar

Stok, Talepler, Dağıtım, Atık, Genel Stok, LOT Stok, CEP DEPO ve Hesabım. Siparişler, Fiyatlar, ISO Formları ve Kullanıcılar mevcut hesapta görünmez.

## Örnek senaryo

`EGT-PCR-001` ürününün stok hedefinin altında olduğu görülür. SATINAL iki kutuluk talep açar, talebi inceler ve onaylar. İkinci bir talebi resmi EBYS formuna ekler. Ardından lab teknisyeninin CEP talebini onaylayıp doğru LOT'tan dağıtır ve kayıtları kontrol eder.

## Sahne planı ve seslendirme

### Sahne 1 — Giriş ve menü (00:00-00:50)

- **Tıklama:** Eğitim SATINAL hesabıyla giriş; kullanıcı kartı ve menü.
- **Vurgu:** Siparişler ve Kullanıcılar menüsünün olmaması.
- **Ekran yazısı:** `SATINAL — Talep ve onay sorumlusu`
- **Seslendirme:** “SATINAL hesabıyla giriş yaptığımızda stok, talep ve dağıtım süreçlerine erişiyoruz. Kullanıcı yönetimi ve sistem ayarları bu rolün sorumluluğunda değildir. Mevcut eğitim hesabında teslim alma ve fiyat görüntüleme ek yetkileri de kapalıdır.”

![Sol menü ve kullanıcı kartı](../screenshots/02-satinal/sahne1-menu.jpg)

### Sahne 2 — İhtiyacı değerlendirme (00:50-02:20)

- **Tıklama:** Stok > durum `Satın Al`; bölüm `SİTOGENETİK EĞİTİM`; arama `EGT-PCR-001`; satırı genişlet.
- **Vurgu:** Ana depo, ideal/min hedef, bekleyen sipariş, CEP DEPO ve SKT.
- **Ekran yazısı:** `Talep öncesi stok ve açık siparişi kontrol et`
- **Seslendirme:** “Stok ekranında önce Satın Al filtresini, ardından ilgili bölümü seçiyoruz. Talep açmadan önce ana depo miktarını, hedef stoğu, bekleyen sipariş miktarını ve bölüm CEP DEPO bakiyesini birlikte kontrol ediyoruz. Satırı genişleterek kullanılabilir LOT ve SKT bilgilerini de inceliyoruz. Aktif bir talep veya yeterli bekleyen miktar varsa ikinci bir talep oluşturmuyoruz.”

![Stok inceleme ve LOT ayrıntısı](../screenshots/02-satinal/sahne2-stok-inceleme.jpg)

### Sahne 3 — Standart talep oluşturma (02:20-03:30)

- **Tıklama/veri:** Talep; miktar `2`, aciliyet `Normal`, not `Eğitim stok tamamlama talebi`; Talep Oluştur.
- **Vurgu:** Miktar, aciliyet, not.
- **Ekran yazısı:** `Gerekçeli ve ölçülü talep`
- **Seslendirme:** “İhtiyaç doğrulandıktan sonra satırdaki Talep düğmesine tıklıyoruz. İki kutu giriyor, aciliyeti Normal bırakıyor ve talebin amacını kısa bir notla açıklıyoruz. Talep Oluştur’a bastığımızda sistem bir talep numarası üretir ve kayıt onay bekleyenler listesine geçer.”

![Talep oluşturma formu](../screenshots/02-satinal/sahne3-talep-olustur.jpg)

### Sahne 4 — Talep filtreleri ve inceleme (03:30-05:00)

- **Tıklama:** Talepler; durum `Bekleyen`; başlangıç/bitiş tarihi; EBYS arama alanını göster; satırı incele.
- **Vurgu:** Talep eden, bölüm, miktar, acil etiketi, mevcut paket bilgisi.
- **Ekran yazısı:** `Onaydan önce kim, ne, ne kadar?`
- **Seslendirme:** “Talepler sayfasında durum filtresini Bekleyen olarak seçiyoruz. Tarih alanları belirli bir dönemi, EBYS alanı ise dış referans veya web paketini bulmak için kullanılır. Onaydan önce malzeme adı, bölüm, talep eden kişi, miktar ve varsa ACİL etiketi mutlaka kontrol edilmelidir.”

![Bekleyen talepler listesi](../screenshots/02-satinal/sahne4-bekleyen-liste.jpg)

### Sahne 5 — Onay ve red (05:00-06:40)

- **Tıklama/veri:** Örnek satır > Onayla; not `Stok ihtiyacı doğrulandı`; Onayla. Başka eğitim satırında Reddet; neden `Mevcut açık sipariş yeterli`; onaylamadan önce red uyarısını göster.
- **Vurgu:** Durum rozetinin değişmesi; red gerekçesinin kaydı.
- **Ekran yazısı:** `Kararı açıklayan kısa not bırakın`
- **Seslendirme:** “Uygun talepte Onayla düğmesini açıyor, ihtiyacın doğrulandığını belirten kısa notu yazıyoruz. Güncel standart akışta bu işlem kaydı doğrudan sipariş verilmiş durumuna taşır. Talep gereksizse Reddet’i seçiyoruz ve mutlaka açık bir gerekçe yazıyoruz. Örneğin mevcut açık sipariş yeterliyse bunu red nedeni olarak kaydediyoruz.”

![Talebi onaylama](../screenshots/02-satinal/sahne5-onayla.jpg)

### Sahne 6 — Resmi EBYS formu (06:40-08:40)

- **Tıklama:** Bekleyen iki eğitim talebini işaretle; Resmi EBYS Formu; tarih ve bölüm; İndir.
- **Vurgu:** Toplu seçim, 343 satır sınırı, web paket kimliği ve resmi Talep No.
- **Ekran yazısı:** `Form indir → EBYS'ye manuel yükle`
- **Seslendirme:** “Resmi EBYS işlemi için bekleyen satırları seçim kutularıyla işaretliyoruz. Resmi EBYS Formu düğmesindeki sayı seçilen kalemleri gösterir. Tarih ve gerekirse bölüm seçip İndir’e tıklıyoruz. Sistem resmi Talep No’yu üretir; makrolu dosyaya ve paket satırlarına kaydeder. Dosya kurumun EBYS sistemine manuel yüklenir. Dış onay tamamlandığında lojistik veya yönetici aynı kayıtlı Talep No ile paketi onaylar.”

![Resmi EBYS Formu İndir](../screenshots/02-satinal/sahne6-ebys-form.jpg)

### Sahne 7 — CEP talebini onaylama (08:40-10:40)

- **Tıklama:** CEP DEPO > Onay Bekleyen Lab Teknisyeni Talepleri; talebi incele; Onayla; not `Bölüm bakiyesi doğrulandı`.
- **Vurgu:** Talep eden/teknisyen, bölüm, miktar, stok kuralı.
- **Ekran yazısı:** `CEP talebi bölüm bakiyesine bağlıdır`
- **Seslendirme:** “CEP DEPO sayfasında onay bekleyen lab teknisyeni taleplerini görüyoruz. Ürün, miktar, hedef teknisyen ve bölümü kontrol ediyoruz. Normal ürünlerde teknisyen bölüm stoğu sıfırlanmadan yeni talep açamaz; reaksiyon ürünlerinde eşik kuralı uygulanır. Uygun talebi Onayla ile dağıtım bekleyen duruma geçiriyoruz.”

![CEP DEPO override talep ve onay bekleyenler](../screenshots/02-satinal/sahne7-cep-override.jpg)

![Onay bekleyen lab teknisyeni talepleri](../screenshots/02-satinal/sahne7-onay-bekleyen.jpg)

### Sahne 8 — CEP dağıtımı (10:40-12:20)

- **Tıklama:** Dağıtım bekleyen onaylı talep > Dağıt; veya Dağıtım sayfası > LOT seç > miktar; Onayla & Dağıt.
- **Vurgu:** Fiziksel LOT/SKT ile ekrandaki seçimin eşleşmesi.
- **Ekran yazısı:** `Doğru kutu, doğru LOT, doğru bölüm`
- **Seslendirme:** “Onaylı talebi dağıtırken ekrandaki ürünle elimizdeki fiziksel kutuyu karşılaştırıyoruz. Parti numarası ve SKT aynı olan LOT’u seçiyor, verilecek miktarı giriyor ve Onayla ve Dağıt’a tıklıyoruz. İşlem ana depodan düşer, hedef bölümün CEP DEPO bakiyesine eklenir ve hareket defterine kimin yaptığı kaydedilir.”

![Dağıtım bekleyen onaylı talepler](../screenshots/02-satinal/sahne8-dagitim-bekleyen.jpg)

![CEP DEPO dağıtım formu](../screenshots/02-satinal/sahne8-cep-dagit-form.jpg)

### Sahne 9 — Genel dağıtım ve atık (12:20-13:40)

- **Tıklama:** Stok satırı > Dağıt formunda bölüm, alan kişi, amaç; iptal. Stok > Atık formunda alanları göster; iptal. Atık > Excel.
- **Vurgu:** LOT toplam kontrolü ve atık gerekçesi.
- **Ekran yazısı:** `Stok çıkışı iz bırakmalıdır`
- **Seslendirme:** “Talep dışı genel dağıtımda bölüm, alan kişi ve kullanım amacı boş bırakılmamalıdır. Parti satırlarının toplamı dağıtım miktarıyla eşleşmeden düğme etkinleşmez. Kullanılamayan malzeme için Atık formunda doğru LOT, atık tipi, sebep ve bertaraf yöntemi seçilir. Kayıtlar Atık sayfasından Excel’e aktarılabilir.”

![Genel dağıtım formu](../screenshots/02-satinal/sahne9-genel-dagitim.jpg)

![Atık kaydı formu](../screenshots/02-satinal/sahne9-atik-form.jpg)

### Sahne 10 — Rapor, hesap ve kapanış (13:40-15:00)

- **Tıklama:** Genel Stok > Yenile; Hesabım > şifre alanları; çıkış.
- **Vurgu:** SATINAL'ın ISO/Fiyat/Kullanıcı erişiminin olmaması.
- **Ekran yazısı:** `Talebi izleyin, sonucu doğrulayın`
- **Seslendirme:** “Genel Stok ekranında kritik stok ve son hareketleri kontrol ederek açtığımız taleplerin operasyonel sonucunu izliyoruz. Hesabım sayfasından şifremizi değiştirebiliriz; yeni şifre en az sekiz karakter olmalıdır. SATINAL rolü kullanıcı ve sistem ayarı yapmaz, mevcut ek yetkiler olmadan teslim veya fiyat işlemi gerçekleştirmez. İşimiz bittiğinde güvenli şekilde çıkış yapıyoruz.”

![Genel Stok](../screenshots/02-satinal/sahne10-genel-stok.jpg)

![Hesabım](../screenshots/02-satinal/sahne10-hesabim.jpg)

## Dikkat noktaları ve hatalar

- Onay, standart akışta doğrudan sipariş verilmiş durumuna geçer; “ayrıca siparişe alacağım” diye beklemeyin.
- Aynı ürün için açık talep ve bekleyen sipariş varken mükerrer kayıt açmayın.
- Resmi EBYS formunu indirmek EBYS'ye gönderim veya dış onay anlamına gelmez.
- LOT Stok'taki LOT Ekle düğmesi ek Teslim Al yetkisi olmayan SATINAL için API tarafından reddedilir; videoda kullanılmaz.
- Stok satırındaki Sil düğmesi görünse bile malzeme silme ADMIN işlemidir.
- Fiyatlar ve ISO sayfası bu eğitim hesabında yoktur.
- Red gerekçesini boş veya kişisel yorum şeklinde yazmayın; ölçülebilir nedeni belirtin.

## Kapanış metni

“SATINAL rolüyle stok ihtiyacını doğruladık, talep oluşturduk, onay ve red kararlarını kaydettik, resmi EBYS formunu hazırladık ve CEP DEPO dağıtımını izledik. Doğru karar için her zaman mevcut stok, açık sipariş, bölüm bakiyesi ve LOT bilgisini birlikte değerlendirin.”
