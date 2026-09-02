# GTMLIMS eğitim videosu üretim paketi

## 1. İnceleme sonucu ve kanıt düzeyi

Bu paket 25 Ağustos 2026 tarihinde aşağıdaki kaynaklar karşılaştırılarak hazırlanmıştır:

- Güncel React arayüzü: `src/App.jsx`, `src/CepDepo.jsx`, `src/LotInventory.jsx`, `src/LabComponents.jsx`
- Güncel API ve rol korumaları: `server/index.js`, `src/api.js`
- Çalışan yerel uygulama: `http://localhost:3002`, API: `http://localhost:4000`
- Çalışan veritabanındaki rol ve modül ayarları
- Depodaki ekran görüntüleri ve eski eğitim sunumu (yalnızca yardımcı referans)
- Otomatik testler ve üretim derlemesi: 99/99 test geçti, `npm run build` başarılı

Kanıt etiketleri:

- **Canlı doğrulandı:** Mevcut kullanıcıyla giriş ve çalışan API yanıtı doğrulandı.
- **Kod/test doğrulandı:** Arayüz ve API kodu ile otomatik test doğrulandı; canlı rol hesabı yok.
- **Kapsam dışı:** Modül kapalı, arayüzden erişilemiyor veya işlem tutarsız/çalışmıyor.

25 Ağustos 2026'da her yedi rol için `egitim_*` eğitim hesabı oluşturuldu ve tarayıcı otomasyonuyla canlı arayüz provası yapıldı; her rol dosyasındaki sahnelere gerçek ekran görüntüleri eklendi (`screenshots/<rol>/`). `KURUMSAL` ve `KALITE` dahil tüm roller canlı doğrulandı. Bu prova sırasında bulunan ek tutarsızlıklar (OBSERVER'ın Stok listesinin boş dönmesi, KALITE için Kullanıcılar sayfasının arayüzü kilitlemesi, Hesabım sayfasında beklenmeyen "Tümünü Temizle" düğmesi) ilgili rol dosyalarına not edilmiştir. Eğitim hesapları ve örnek `EGT-PCR-001` malzemesi ayrı bir eğitim veritabanı yerine çalışan veritabanına eklendi; nihai kayıt öncesi bunların kaldırılıp kaldırılmayacağına karar verilmelidir.

## 2. Mevcut çalışma kapsamı

Çalışan veritabanında doğrulanan roller:

- `ADMIN`
- `SATINAL`
- `SATINAL_LOJISTIK`
- `OBSERVER`
- `LAB_TECHNICIAN`

Kodda ve kullanıcı oluşturma ekranında tanımlı, fakat çalışan veritabanında hesabı olmayan roller:

- `KURUMSAL`
- `KALITE`

Mevcut modül durumu:

| Özellik | Durum | Eğitim kararı |
|---|---|---|
| Talepler, Siparişler, Dağıtım, Atık | Açık | Dahil |
| Genel Stok, LOT Stok, CEP DEPO | Açık | Dahil |
| Fiyatlar, ISO Formları | Açık | Yetkili rollerde dahil |
| Barkodla Teslim Al / Barkod Eşleştirme | Kapalı | Kapsam dışı |
| Barkodla Dağıtım | Kapalı | Kapsam dışı |
| İki adımlı teslim onayı | Kapalı | Kapsam dışı |
| Bölüm bazlı depo havuzu ayrımı | Kapalı | Açıklama yapılır, iş akışında gösterilmez |

## 3. Roller ve yetkiler matrisi

Simgeler: **İ** işlem yapar, **G** görüntüler, **—** işlem veya menü gösterilmez.

| Sayfa/işlem | ADMIN | SATINAL | SATINAL_LOJISTIK | LAB_TECHNICIAN | OBSERVER | KURUMSAL* | KALITE* |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Stok listesini görüntüleme/arama/filtre | G | G | G | G (bölüm kapsamı) | G (kapsamlı) | G | G |
| Stok Excel dışa aktarma | İ | İ | İ | G/İ | İ | İ | İ |
| Malzeme tanımı ekleme | İ | İ | İ | — | — | İ | — |
| Malzeme birim/departman düzenleme | İ | İ | Sınırlı | — | — | İ | — |
| Stok düzeltme ve LOT bölme | İ | — | — | — | — | — | — |
| Malzeme silme / tüm veriyi temizleme | İ | — | — | — | — | — | — |
| Standart satın alma talebi oluşturma | İ | İ | İ | CEP talebi | — | — | — |
| Talep onaylama/reddetme | İ | İ | — | — | — | İ | — |
| Resmi EBYS formu oluşturma | İ | İ | İ | — | — | İ | — |
| EBYS paketini onaylayıp siparişe alma | İ | — | İ | — | — | — | — |
| Sipariş/teslim alma | İ | Yalnız ek yetkiyle | İ | — | — | — | — |
| Dağıtım ve atık kaydı | İ | İ | İ | — | — | İ | — |
| Dağıtım kayıtları | G (tümü) | G (tümü) | G (tümü) | G (kendisine) | G (kendisine) | G (tümü) | G (tümü) |
| CEP DEPO talep onayı | İ | İ | — | — | — | — | — |
| CEP DEPOya dağıtım | İ | İ | İ | — | — | İ | — |
| CEP DEPO tüketim/iade | Arayüzde yok | Arayüzde yok | Arayüzde yok | İ (kendi bölümü) | — | — | — |
| Fiyatlar ve kullanım raporu | İ | Ek yetkiyle | Ek yetkiyle | Ek yetkiyle | Ek yetkiyle | İ | G |
| ISO LY-F064 / MG-F069 indirme | İ | — | İ | — | — | — | İ |
| Kullanıcı/bölüm/ayar yönetimi | İ | — | — | — | — | — | — |
| Hesap ve şifre değiştirme | İ | İ | İ | İ | İ | İ | İ |

\* `KURUMSAL` ve `KALITE` canlı hesapla doğrulandı. `KALITE` operasyonel olarak salt-okunurdur; başarısız olacak yazma düğmeleri arayüzde gösterilmez.

Ek kullanıcı yetkileri:

- `SATINAL` kullanıcısına **Teslim Al Yetkisi** verilebilir.
- `ADMIN` ve `KURUMSAL` fiyatları varsayılan olarak görür; diğer rollere **Fiyat Görüntüleme Yetkisi** verilebilir.
- Kullanıcılar bir veya birden fazla bölüme atanabilir. `LAB_TECHNICIAN` için bölüm ataması CEP DEPO kullanımının ön koşuludur.

## 4. Erişilebilen sayfalar

| Rol | Varsayılan açık modüllerle sol menü |
|---|---|
| ADMIN | Stok, Talepler, Siparişler, Dağıtım, Atık, Genel Stok, LOT Stok, CEP DEPO, Fiyatlar, ISO Formları, Kullanıcılar, Hesabım |
| SATINAL | Stok, Satın Alma İşleri, Dağıtım, Atık, Genel Stok, LOT Stok, CEP DEPO, Hesabım |
| SATINAL_LOJISTIK | Stok, EBYS İşleri, Mal Kabul, Dağıtım, Atık, Genel Stok, LOT Stok, CEP DEPO, ISO Formları, Hesabım |
| LAB_TECHNICIAN | Ürünleri Gör, Dağıtımlarım, Genel Stok, Günlük İşlerim, Hesabım |
| OBSERVER | Stok, Dağıtım, Genel Stok, CEP DEPO, Hesabım |
| KURUMSAL | Stok, Talepler, Dağıtım, Atık, Genel Stok, LOT Stok, CEP DEPO, Fiyatlar, Hesabım |
| KALITE | Stok, Talepler, Siparişler, Dağıtım, Atık, Genel Stok, LOT Stok, CEP DEPO, Fiyatlar, ISO Formları, Hesabım; işlem düğmeleri gizlidir |

Üst arama yalnız Stok sayfasında görünür; durum ve bölüm filtreleri, FEFO anahtarı, Excel ve rol uygunsa Malzeme Ekle aynı alandadır. Sol alt kullanıcı kartı kullanıcı adını, anlaşılır rol adını ve çıkış düğmesini gösterir.

## 5. Sayfa ve arayüz envanteri

### Giriş

- Kullanıcı Adı, Şifre
- Giriş Yap
- İlk kurulum modunu aç / normal girişe dön
- Hata bildirimi

İlk kurulum yalnızca hiç kullanıcı bulunmayan yeni veritabanı içindir; normal eğitimde gösterilmemelidir.

### Stok

- Üst arama: kod, ad ve metin eşleşmesi
- Durum filtresi: Tümü, Stokta, Satın Al
- Bölüm filtresi: Tüm Departmanlar ve aktif bölümler
- FEFO Açık/Kapalı
- Excel Yükle: yalnız ADMIN arayüzünde; KALITE'de görünse de çalışmaz
- Excel dışa aktarma
- Malzeme Ekle
- Özet kartları: toplam malzeme, satın alınacak, bekleyen, onaylı, siparişte, tamamlanan, reddedilen, SKT uyarısı
- Tablo: kod, malzeme ve etiketleri, ana depo stoğu, ideal/min hedef, CEP DEPO toplamı, en yakın SKT, durum, işlemler
- Satır genişletme: LOT numarası, üretici, miktar, başlangıç miktarı, SKT, alım tarihi, bölüm ve durum
- İşlemler: Talep, Dağıt, Atık, Birim, Düzelt, Sil, Belge; rol ve API yetkisine göre değişir

Malzeme Ekle alanları:

- Malzeme kodu ve adı (zorunlu)
- Kategori
- Tüm departmanlara açık veya bölüm seçimleri
- Birim, ana/paket birimi, alt tüketim birimi
- Bir paketteki alt birim sayısı
- Tüketim tipi: PACK, UNIT veya TEST
- Minimum reaksiyon/talep eşiği
- Min, ideal ve maksimum stok
- Depo ve buzdolabı/dolap konumu
- Saklama sıcaklığı ve kimyasal türü
- Tedarikçi, katalog numarası, marka
- LOT bilgisi, SKT/açılış tarihi alanları (form sürümüne bağlı)
- MSDS bağlantısı ve notlar
- Kaydet / İptal

### Talepler ve Siparişler

- SATINAL ve SATINAL_LOJISTIK için görev merkezi: Yeni Talep Aç, EBYS Formu Hazırla, Dış EBYS Onayı Geldi, Malzeme Teslim Al/Siparişleri İzle ve Dağıtım Yap
- Yeni talep iki adımda tamamlanır: malzeme ara/seç; miktar, bölüm, aciliyet ve kısa açıklamayı gir
- Yeni talep EBYS formu için otomatik seçilir
- Talep durum filtresi: tümü, bekleyen, onaylanan, siparişte/kısmi, tamamlanan, reddedilen
- Başlangıç/bitiş tarihi ve temizleme
- EBYS referansı veya web paketi araması
- Excel'e Aktar
- Seçim kutuları ve görünenleri toplu seçme
- Resmi EBYS Formu: tarih, isteğe bağlı bölüm, İndir/İptal
- Tablo: Talep No, Malzeme, Miktar, Talep Eden, Durum, İşlem
- İşlem düğmeleri: EBYS Formu Oluştur, Dış EBYS Onayı Geldi, Onayla, Reddet, Siparişe Al, Teslim Al, Sil; rol ve duruma bağlıdır
- Teslim formu: gelen miktar, teslim alan, LOT/parti, SKT, fatura no, tedarikçi, birim fiyat, PDF/resim belge, Teslim Al/İptal

Güncel standart onay düğmesi talebi doğrudan `SIPARIS_VERILDI` durumuna geçirir. Ayrı bir tedarikçi sipariş formu yoktur. Resmi EBYS paket akışında GTMLIMS `YYMMDD-HHMMSS` biçimindeki Talep No'yu üretip makrolu forma ve paket satırlarına kaydeder. Form kurumun EBYS sistemine manuel yüklenir; dış onay tamamlandıktan sonra paket aynı kayıtlı Talep No ile onaylanır.

### Dağıtım

- Yetkili roller için bekleyen lab teknisyeni/CEP talepleri
- Bölüm ve teknisyen filtreleri
- Tekli veya toplu seçim
- Verilecek miktar, LOT/parti satırları, parti ekleme/çıkarma ve toplam kontrolü
- Onayla & Dağıt
- Dağıtım kayıtları: malzeme, miktar, veren, alan, amaç, tarih, durum
- Excel'e Aktar
- Alıcı roller yalnız kendilerine yapılan dağıtımları görür

Stoktan genel dağıtım formunda: CEP talebi seçimi, parti/SKT, miktar, bölüm, alan kişi, kullanım amacı, Dağıt/İptal bulunur. Seçilen parti toplamı ile dağıtım miktarı eşleşmeden düğme etkinleşmez.

### Atık

- Kayıt tablosu: Atık ID, malzeme, miktar, tip, sebep, bertaraf yöntemi, bertaraf eden, tarih
- Excel'e Aktar
- Yeni kayıt Stok satırındaki Atık düğmesinden açılır
- Alanlar: miktar, LOT, atık tipi (miadı dolmuş/kontamine/hasarlı/geri çağrılmış), sebep, bertaraf yöntemi, sertifika no

### Genel Stok

- Yenile
- Toplam malzeme, toplam stok, 30 günlük SKT uyarısı ve kritik stok kartları
- Departman bazlı malzeme çeşidi/toplam stok
- Son 7 gün aktiviteleri
- Son atık kayıtları

### LOT Stok

- Alt görünümler: Malzemeler, LOT'lar, Raporlar
- Arama, bölüm filtresi; LOT görünümünde durum filtresi
- Şablon İndir, Excel içe aktar, Yeni Malzeme
- Malzeme tablosu ve açılır LOT ayrıntıları
- LOT Ekle, Tüket, Sil; SKT Düzenle; ADMIN için LOT Böl
- Raporlar: kritik stok, 60 gün içinde SKT, departman stok özeti

Bu sayfanın buton görünürlüğü rol izinleriyle tam uyumlu değildir. Eğitimde yalnız API tarafından izin verilen rol/işlemler gösterilmelidir.

### CEP DEPO

LAB_TECHNICIAN görünümü:

- Benim bölüm bakiyem; ürün arama
- Tüketim: ürün, tüketim tipi, miktar, not, Tüketimi Kaydet
- İade: ürün, koli/paket miktarı, not, İade Et
- Yeni Stok Talebi: ürün, koli adedi, not, Talep Oluştur
- Bölüm talepleri: miktarı düzenleme, kaydet/vazgeç, iptal
- Hareket geçmişi

Yetkili depo/satın alma görünümü:

- Tüm CEP DEPO bakiyeleri ve ürün arama
- Ana Depodan CEP DEPOya Dağıt: teknisyen, ürün, koli, not; FEFO dağıtım
- SATINAL/ADMIN için teknisyen adına gerekçeli override talep
- Onay bekleyen talepler: Onayla/Reddet
- Dağıtım bekleyen onaylı talepler: Dağıt
- Genel stok hareketleri: tarih, tip, ürün arama ve temizleme filtreleri
- Birim ayarları: paket/alt birim, dönüşüm katsayısı ve tüketim tipi

Lab teknisyeni normal ürünlerde bölüm CEP stoğu sıfırlanmadan yeni talep açamaz. Reaksiyon ürünlerinde kalan alt birim, malzemenin minimum reaksiyon eşiğinin altına indiğinde talep açılabilir.

### Fiyatlar

- Fiyat geçmişi filtreleri: malzeme, tedarikçi, başlangıç/bitiş tarihi, Filtrele
- Tablo: tarih, talep no, malzeme, tedarikçi, miktar, birim fiyat, toplam, LOT, teslim alan
- Fiyat Güncelle: tedarikçi ve birim fiyat
- Kullanım raporu filtreleri: malzeme, bölüm, tarih
- Görünümler: Detay, Aylık, Departman
- Özet kartları ve ilgili tablolar

### ISO Formları

- LY-F064: bölüm seçimi, İndir
- MG-F069: bölüm veya tüm bölümler, yıl, İndir

### Kullanıcılar ve Hesabım

Kullanıcılar:

- Kullanıcı adı, şifre, rol
- Birden fazla bölüm seçimi
- SATINAL için Teslim Al Yetkisi
- Uygun roller için Fiyat Görüntüleme Yetkisi
- Oluştur/Güncelle/İptal/Yenile/Düzenle
- Bölüm ekleme, aktif/pasif yapma
- Giriş kilitleri: yenile, tek IP kilidini veya tüm kilitleri kaldırma

Hesabım:

- Kullanıcı adı, rol, 7 günlük token bilgisi
- Mevcut şifre, yeni şifre, tekrar; Şifremi Güncelle/Temizle
- ADMIN: teslim onayı, bölüm bazlı depo ayrımı ve modül aç/kapat ayarları

## 6. Uçtan uca iş akışları ve görev devri

### Standart satın alma

1. ADMIN veya SATINAL, Stok satırından Talep açar.
2. SATINAL/ADMIN talebi inceler; Onayla veya Reddet seçer.
3. Güncel Onayla işlemi talebi doğrudan sipariş verilmiş durumuna taşır.
4. SATINAL_LOJISTIK, Siparişler'de ilgili satırdan Teslim Al'ı açar.
5. Gelen miktar, LOT, SKT, teslim alan ve varsa fatura/fiyat kaydedilir.
6. Kısmi teslimde talep açık kalır; toplam sipariş miktarı tamamlanınca tamamlanır ve yeni LOT stoka eklenir.

### Resmi EBYS paketi

1. Yetkili kullanıcı bekleyen talep satırlarını seçer.
2. Resmi EBYS Formu ile makrolu Medipol formu indirilir.
3. GTMLIMS resmi Talep No'yu üretir ve dosya adına, forma ve paket satırlarına kaydeder.
4. Dosya kurumun EBYS sistemine manuel yüklenir; GTMLIMS bu dış işlemi yapmaz.
5. Dış onay tamamlandıktan sonra SATINAL_LOJISTIK/ADMIN, kayıtlı Talep No'yu kontrol ederek EBYS Onayla'yı tamamlar; yeni referans girişi yapılmaz.
6. Paketteki tüm kalemler sipariş verilmiş durumuna geçer.
7. Lojistik teslimleri tek tek veya kısmi olarak kaydeder.

### CEP DEPO

1. LAB_TECHNICIAN kendi bölüm bakiyesini kontrol eder.
2. Uygun stok yoksa ürün ve miktarla talep açar.
3. SATINAL/ADMIN talebi onaylar; gerekli değilse reddeder.
4. SATINAL_LOJISTIK/SATINAL/ADMIN, ana depodan LOT seçip teknisyenin bölüm CEP DEPOsuna dağıtır. Dağıtım ekranındaki Onayla & Dağıt yolu iki adımı tek işlemde de tamamlayabilir.
5. LAB_TECHNICIAN tüketimi PACK/UNIT/TEST biriminde kaydeder veya kullanılmayan tam paketleri ana depoya iade eder.
6. Bakiyeler ve genel hareket defteri otomatik güncellenir.

### Dağıtım ve atık

- Dağıtımda fiziksel parti mutlaka ekrandaki LOT/SKT ile eşleştirilir; FEFO rehberdir.
- Mevcut ayarda iki adımlı teslim onayı kapalı olduğundan dağıtım anında tamamlanır.
- Atık kaydı seçilen LOT'tan düşer ve atık defterine eklenir; sertifika numarası varsa kaydedilir.

## 7. Eksik, belirsiz veya tutarsız özellikler

1. 27 Ağustos 2026 görev-odaklı rol tasarımından sonra eğitim ekran görüntülerinin yeniden çekilmesi gerekir.
2. Barkod modülleri kapalıdır. Kodda bulunmasına rağmen mevcut eğitimde gösterilmemelidir.
3. Teslim Onayı menüsü ve iki adımlı akış kapalıdır; mevcut eğitimde gösterilmemelidir.
4. Üst SKT uyarı sayacı eski `items` durumundan hesaplanmaktadır; LOT tabanlı stokla farklı sonuç verebilir. Eğitimde kesin rapor olarak LOT Stok > Raporlar kullanılmalıdır.
5. Talep Onayla mesajı “sipariş bekleniyor” derken işlem doğrudan `SIPARIS_VERILDI` durumuna geçer.
6. Kodda hem `KISMI_TESLIM` hem eski `KISMEN_GELDI` durum adları bulunur. Yeni kayıtlar için `KISMI_TESLIM` esas alınmalıdır.
7. README ve geliştirici dokümanlarında port ve eski rol isimleriyle ilgili çelişkiler vardır; çalışan servisler 3002/4000 ve güncel yedi rol esas alınmıştır.
8. Eski eğitim sunumu ve ekran görüntülerinde Fiyatlar, ISO Formları, bölüm üyelikleri ve güncel EBYS/CEP ayrıntıları eksiktir.

Bu maddeler düzeltilmeden videoda başarısız düğmeye tıklanmamalı; gerekli yerlerde “bu sayfadaki işlem yalnız yetkili rol tarafından yapılır” açıklaması kullanılmalıdır.

## 8. Hazırlanacak videolar ve yayın sırası

Önerilen liste:

1. Ortak Başlangıç: Giriş, menü, arama, durumlar, hesabım ve güvenli kullanım — 6 dk
2. LAB_TECHNICIAN: CEP DEPO, tüketim, iade ve talep — 13 dk
3. SATINAL: Talep, onay/red, EBYS formu ve CEP onayı — 15 dk
4. SATINAL_LOJISTIK: EBYS paket onayı, teslim alma, LOT ve dağıtım — 18 dk
5. ADMIN: Sistem kurulumu, kullanıcılar, malzeme/LOT, düzeltme, ayarlar ve raporlar — 24 dk
6. KURUMSAL: Onay, dağıtım, fiyat ve raporlama — 12 dk (canlı hesap sonrası)
7. KALITE: Salt-okunur denetim, izlenebilirlik ve ISO çıktıları — 10 dk (canlı hesap sonrası)
8. OBSERVER: Stok, kişisel dağıtımlar ve genel raporlar — 7 dk

Ortak video hazırlanması uygundur. Giriş, sol menü, üst arama, tablo açma, durum renkleri, Excel indirme, Hesabım ve çıkış bütün rollerde benzerdir. Rol videolarında bu bölüm 30-45 saniyelik hatırlatma olarak bırakılabilir.

Ayrı videoya ihtiyaç duyan işlemler:

- ADMIN: kullanıcı/bölüm/modül yönetimi, stok düzeltme, LOT bölme, tüm veriyi temizleme
- SATINAL: talep onayı/red ve CEP onayı
- SATINAL_LOJISTIK: EBYS paket onayı, mal kabul ve ISO formları
- LAB_TECHNICIAN: bölüm CEP stoğu, tüketim, iade, talep düzenleme/iptal
- KURUMSAL: fiyat/rapor ile onay-dağıtım birleşimi
- KALITE: salt-okunur denetim ve işlem yapmama sınırı

## 9. Güvenli örnek kullanıcı ve veriler

Gerçek hesapları ve mevcut operasyon verisini videoda kullanmayın. Ayrı bir eğitim veritabanı oluşturun.

| Rol | Örnek kullanıcı |
|---|---|
| ADMIN | `egitim_admin` |
| SATINAL | `egitim_satinal` |
| SATINAL_LOJISTIK | `egitim_lojistik` |
| LAB_TECHNICIAN | `egitim_tekniker` |
| OBSERVER | `egitim_izleyici` |
| KURUMSAL | `egitim_kurumsal` |
| KALITE | `egitim_kalite` |

Örnek malzeme:

- Kod: `EGT-PCR-001`
- Ad: `Eğitim PCR Kontrol Kiti`
- Kategori: `Reaktif`
- Bölüm: `SİTOGENETİK`
- Ana/paket birimi: `Kutu`
- Alt birim: `Reaksiyon`
- Bir kutu: `50` reaksiyon
- Tüketim tipi: `TEST`
- Minimum reaksiyon eşiği: `3`
- Min/ideal/maks: `2 / 4 / 8`
- LOT: `EGT-LOT-260825`
- SKT: `25.08.2027`
- Tedarikçi: `Eğitim Medikal A.Ş.`
- Fatura: `EGT-FTR-0001`
- Not: `Eğitim kaydıdır; gerçek sipariş değildir.`

Hasta adı, protokol numarası, gerçek fatura, gerçek fiyat sözleşmesi, gerçek çalışan şifresi veya kurum dışına çıkmaması gereken belge kullanılmamalıdır.

## 10. Çekim öncesi kontrol listesi

- Eğitim veritabanı üretim verisinden ayrıldı.
- Yedi eğitim hesabı ve bölüm üyelikleri doğrulandı.
- Barkod ve teslim onayı gibi gösterilmeyecek modüller kapalı.
- Tarayıcı 1920x1080, yüzde 100 yakınlaştırma ve bildirimler kapalı.
- Kişisel yer imleri, parola yöneticisi ve masaüstü bildirimleri gizli.
- Örnek ürün, iki LOT, bir bekleyen talep, bir sipariş, bir dağıtım ve bir atık kaydı hazır.
- Kayıt öncesi her sahnenin başlangıç durumu yedekten geri yüklenebilir.
- Mikrofon/AI ses örneği, telaffuz listesi ve ses seviyesi kontrol edildi.
- “GTMLIMS”, “CEP DEPO”, “EBYS”, “FEFO”, “LOT”, “SKT”, “LY-F064”, “MG-F069” telaffuzları sabitlendi.
- Ekran kaydı sırasında gerçek şifre yazımı kesildi veya maske alanında hazırlandı.
- Her işlemden sonra beklenen durum etiketi ve stok değişimi kontrol edildi.
- Son kurguda başarısız/yanlış tıklamalar ve bekleme süreleri çıkarıldı.

## 11. Üretim yöntemi ve mevcut araç sınırı

Bu çalışma ortamında doğrudan masaüstü ekran kaydı alma, çok kanallı video düzenleme ve yapay zekâ sesiyle tamamlanmış MP4 üretme aracı bulunmuyor. Mevcut araçlarla eksiksiz senaryo, çekim listesi, doğal seslendirme metni, SRT altyazısı ve kurgu talimatı üretilebilir. Kullanıcı bir ham video yüklerse mevcut Adobe Quick Cut bağlantısı kısa bir özet kurguya yardımcı olabilir; bu, rol bazlı ayrıntılı ekran kaydını sıfırdan üretmez.

Önerilen üretim hattı:

1. Her sahneyi ayrı klip olarak 1920x1080, 30 fps kaydedin.
2. Tıklama öncesi 0,5 saniye, işlem sonucu sonrası 1,5 saniye bekleyin.
3. Seslendirmeyi 145-155 kelime/dakika hızında, sahne bazında üretin.
4. Kurgu sırasında gereksiz yükleme beklemelerini kesin; yüzde 110-130 bölgesel yakınlaştırma ve kısa imleç vurgusu kullanın.
5. Ekran başlıklarını en fazla 6-8 kelime tutun; alt yazıyı iki satır ve satır başına yaklaşık 42 karakterle sınırlayın.
6. Sistem uyarı seslerini kısın; anlatımın altında müzik kullanmayın veya çok düşük seviyede tutun.
7. SRT zamanlarını son kurguya göre yeniden hizalayın ve Türkçe yazım kontrolü yapın.
8. Son QA'da rol menüsü, veri gizliliği, stok sonucu, durum etiketi ve altyazı-ses eşleşmesini kontrol edin.

## 12. Dosyalar

- `roles/01-admin.md`
- `roles/02-satinal.md`
- `roles/03-satinal-lojistik.md`
- `roles/04-lab-technician.md`
- `roles/05-observer.md`
- `roles/06-kurumsal.md`
- `roles/07-kalite.md`
- `subtitles/*.srt`
