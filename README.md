# Order_tracking
# Laboratuvar Malzeme Takip Sistemi
# Laboratory Equipment Tracking System

Modern React tabanlı laboratuvar malzeme stok ve satın alma takip uygulaması.

---
npm run server
Terminal 2 — Frontend:

bash
npm run dev
## Gereksinimler / Prerequisites

- **Node.js** v18+ ve npm
- **MySQL Server 8.0** (çalışır durumda olmalı)

---

## Yerel Kurulum / Local Setup

### 1. Bağımlılıkları yükle / Install dependencies

```bash
npm install
```

### 2. MySQL veritabanını oluştur / Create the database

MySQL çalışıyorken, şema dosyasını çalıştırarak veritabanını ve tabloları oluşturun:

```bash
mysql -u root -p < server/schema.sql
```

> ⚠️ `server/complete_database_schema.sql` dosyası var olan veritabanını **siler ve yeniden oluşturur**. Yalnızca sıfırdan kurulum için kullanın.

### 3. Ortam değişkenlerini ayarla / Configure environment variables

`server/.env` dosyası oluşturun (opsiyonel — aşağıdakiler zaten varsayılan değerlerdir):

```env
PORT=4000
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=0000
MYSQL_DATABASE=order_Tracking
JWT_SECRET=change-this-in-production
```

> Eğer MySQL root şifreniz farklıysa `MYSQL_PASSWORD` değerini güncelleyin.

### 4. Backend sunucusunu başlat / Start the backend

```bash
npm run server
```

Backend **http://localhost:4000** adresinde çalışır.

### 5. Frontend geliştirme sunucusunu başlat / Start the frontend

Ayrı bir terminalde:

```bash
npm run dev
```

Frontend **http://localhost:3000** adresinde açılır. Vite, `/api` isteklerini otomatik olarak `http://localhost:4000` adresine yönlendirir (proxy).

### 6. İlk giriş / First login

- Eğer veritabanında hiç kullanıcı yoksa, uygulama sizi otomatik olarak **bootstrap** (ilk admin oluşturma) ekranına yönlendirir.
- Kullanıcı adı ve şifre belirleyerek ilk ADMIN hesabını oluşturun.

---

### Ortam değişkenleri / Environment variables

| Değişken | Açıklama | Varsayılan |
|----------|----------|------------|
| `PORT` | Express API portu | `4000` |
| `MYSQL_HOST` | MySQL sunucu adresi | `localhost` |
| `MYSQL_PORT` | MySQL portu | `3306` |
| `MYSQL_USER` | MySQL kullanıcı adı | `root` |
| `MYSQL_PASSWORD` | MySQL şifresi | *(boş)* |
| `MYSQL_DATABASE` | Veritabanı adı | `order_Tracking` |
| `JWT_SECRET` | JWT token imzalama anahtarı | `change-this-in-production` |

`.env` dosyasını değiştirirseniz sunucuları yeniden başlatın.

---

## Özellikler / Features

### 1. Kullanıcı Yönetimi / User Management
- İlk girişte kullanıcı adı sorulur
- Tüm işlemler kullanıcı adıyla kaydedilir
- Kullanıcı değiştirme imkanı

### 2. Stok Yönetimi / Stock Management

| Özellik | Açıklama |
|---------|----------|
| **Malzeme Ekleme** | Kod, ad, kategori, marka, birim, stok miktarları, konum, tedarikçi bilgileri |
| **Otomatik Durum** | Stok ≤ Min Stok ise "SATIN AL" durumu |
| **Arama & Filtreleme** | İsim/kod ile arama, durum filtresi |
| **Silme** | Malzeme ve ilişkili tüm kayıtları siler |

**Malzeme Alanları:**
- Malzeme Kodu, Malzeme Adı
- Kategori, Marka, Birim
- Min Stok, Mevcut Stok
- Depo/Konum, Buzdolabı/Dolap
- Tedarikçi, Katalog No, Lot No

### 3. Satın Alma Talebi İş Akışı / Purchase Request Workflow

```
TALEP → ONAY/RED → TESLİM ALMA → STOK GÜNCELLEME
```

| Adım | Açıklama |
|------|----------|
| **1. Talep Oluştur** | Miktar, aciliyet (Normal/Acil), not girin |
| **2. Onay/Red** | Yetkili kişi talebi onaylar veya reddeder |
| **3. Teslim Al** | Gelen miktar, lot no, son kullanma tarihi, dağıtımcı firma kaydedilir |
| **4. Stok Güncelleme** | Teslim alınan miktar otomatik olarak stoka eklenir |

**Talep Durumları:**
- `TALEP_EDILDI` - Bekliyor (sarı)
- `ONAYLANDI` - Onaylandı, teslim bekleniyor (mavi)
- `GELDI` - Teslim alındı (yeşil)
- `REDDEDILDI` - Reddedildi (kırmızı)

### 4. Dağıtım Takibi / Distribution Tracking

Stoktan malzeme çıkışlarını takip eder.

| Alan | Açıklama |
|------|----------|
| **Miktar** | Verilen miktar |
| **Veren** | Malzemeyi veren kişi (otomatik - giriş yapan kullanıcı) |
| **Alan** | Malzemeyi alan kişi |
| **Amaç** | Kullanım amacı |
| **Tarih** | Çıkış tarihi |
| **Durum** | Bekliyor / Tamamlandı |

**İş Akışı:**
1. Stok sekmesinde "Dağıt" butonuna tıkla
2. Miktar, alan kişi, amaç gir
3. Stok otomatik düşer
4. Dağıtım sekmesinde "Tamamla" ile işlemi kapat

### 5. Excel İşlemleri / Excel Operations

| Özellik | Açıklama |
|---------|----------|
| **Şablon İndir** | Örnek Excel formatı indirir |
| **Excel Yükle** | Mevcut Excel dosyasından malzeme içe aktarır |
| **Excel'e Aktar** | 3 sayfalı Excel dosyası oluşturur |

**Excel Yükleme Desteklenen Sütunlar:**
- Malzeme Kodu / Kod / Code / MALZEME KODU
- Malzeme Adı / Ad / Name / MALZEME ADI
- Kategori / Category / Grup
- Birim / Unit
- Min Stok / Minimum Stok / Kritik Stok
- Mevcut Stok / Stok / Miktar
- Konum / Location / Depo
- Tedarikçi / Supplier / Firma
- Katalog No / Cat No
- Lot No / Parti No
- Marka / Brand
- Buzdolabı/Dolap / Saklama

**Excel Dışa Aktarma Sayfaları:**
1. **Stok Takip** - Tüm malzemeler
2. **Satın Alma Talepleri** - Tüm talepler ve durumları
3. **Dağıtım Kayıtları** - Tüm çıkış kayıtları

### 6. Dashboard / Özet İstatistikler

| Metrik | Açıklama |
|--------|----------|
| **Toplam Malzeme** | Sistemdeki toplam malzeme sayısı |
| **Satın Alınacak** | Stok seviyesi kritik olan malzemeler |
| **Bekleyen Talepler** | Onay bekleyen satın alma talepleri |
| **Onay Bekleyen** | Onaylanmış, teslim bekleyen talepler |

---

## 🔗 Stok-Talep Bağlantısı

- Bir malzeme için aktif talep varsa stok tablosunda **"Talep var"** uyarısı gösterilir
- Mükerrer talep oluşturmayı önler
- Talep durumları: TALEP_EDILDI veya ONAYLANDI

---

## Veri Saklama / Data Storage

Tüm uygulama verisi sunucu tarafında **MySQL** veritabanında tutulur:
- Veritabanı: `order_Tracking` (MySQL 8.0)
- Şema: `server/schema.sql`
- Tüm API uç noktaları `/api/` altında çalışır
- Kimlik doğrulama: JWT token tabanlı (bcrypt ile şifreleme)

---

## Teknolojiler / Tech Stack

**Frontend:**
- **React 18** - UI framework
- **Vite 5** - Build tool & dev server
- **TailwindCSS** - Styling (CDN)
- **Lucide React** - Icons
- **XLSX** - Excel import/export

**Backend:**
- **Node.js + Express** - REST API
- **MySQL 8.0** - Veritabanı
- **mysql2** - MySQL driver
- **bcryptjs** - Şifre hashleme
- **jsonwebtoken** - JWT kimlik doğrulama

---

## Dosya Yapısı / File Structure

```
order tracking/
├── index.html              # Ana HTML
├── package.json            # Bağımlılıklar
├── vite.config.js          # Vite yapılandırması (proxy ayarları)
├── README.md               # Bu dosya
├── src/
│   ├── main.jsx            # React giriş noktası
│   ├── App.jsx             # Ana uygulama bileşeni
│   ├── LabComponents.jsx   # Lab bileşenleri
│   ├── LotInventory.jsx    # Lot envanter yönetimi
│   ├── api.js              # API istemci fonksiyonları
│   └── utils/              # Yardımcı araçlar
└── server/
    ├── index.js            # Express API sunucusu
    ├── schema.sql          # Veritabanı şeması
    ├── complete_database_schema.sql  # Tam şema (sıfırdan kurulum)
    ├── run-migration.js    # Migration çalıştırıcı
    ├── database/           # Tablo tanım dosyaları
    └── migrations/         # Veritabanı migration dosyaları
```

---

## 📝 Kullanım Senaryoları / Use Cases

### Senaryo 1: Yeni Malzeme Ekleme
1. "Yeni" butonuna tıkla
2. Malzeme bilgilerini gir
3. "Ekle" ile kaydet

### Senaryo 2: Toplu Malzeme Yükleme
1. "Şablon" ile örnek Excel indir
2. Excel'i doldur
3. "Excel Yükle" ile içe aktar

### Senaryo 3: Satın Alma Süreci
1. Stok sekmesinde "Talep" tıkla
2. Miktar ve aciliyet seç
3. Yetkili "Onayla" veya "Reddet" yapar
4. Malzeme gelince "Teslim Al" ile kaydet

### Senaryo 4: Malzeme Dağıtımı
1. Stok sekmesinde "Dağıt" tıkla
2. Miktar, alan kişi, amaç gir
3. Dağıtım sekmesinde işlemi takip et
4. İş bitince "Tamamla" ile kapat

---

## Önemli Notlar / Important Notes

- Veriler MySQL veritabanında saklanır, tarayıcı temizlense bile kaybolmaz
- Düzenli olarak "Excel'e Aktar" ile yedek alın
- Çok kullanıcılı sistem: ADMIN, SATINAL, SATINAL_LOJISTIK, OBSERVER rolleri desteklenir
- Migration dosyaları `server/migrations/` klasöründe bulunur, `node server/run-migration.js <dosya.sql>` ile çalıştırılır

---

## Destek

Sorularınız için geliştirici ile iletişime geçin.