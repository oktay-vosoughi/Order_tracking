# Order_tracking
# Laboratuvar Malzeme Takip Sistemi
# Laboratory Equipment Tracking System

Modern React tabanlı laboratuvar malzeme stok ve satın alma takip uygulaması.

---

## Kurulum / Installation

```bash
# Bağımlılıkları yükle
npm install

# Geliştirme sunucusunu başlat
npm run dev

# API sunucusunu (Node + Express + SQLite) başlat
npm run server
```

Uygulama **http://localhost:3000** adresinde açılacaktır.
API varsayılan olarak **http://localhost:4000** üzerinde çalışır (Vite proxy otomatik bağlanır).

### Ortam değişkenleri / Environment variables

Projede örnek değerlerle gelen `.env` dosyası backend ve frontend için ortak kullanılır. Gerekirse aşağıdaki değişkenleri güncelleyebilirsiniz:

- `PORT`: Express API portu (varsayılan `4000`)
- `DATA_DIR`: SQLite veritabanı klasörü (varsayılan `server/data`)
- `DB_FILENAME`: SQLite dosya adı (varsayılan `lab-equipment.db`)
- `SCHEMA_PATH`: Şema dosyası yolu (varsayılan `server/schema.sql`)
- `VITE_API_URL`: Frontend'in kullandığı API tabanı (dev ortamında `/api` Vite proxy'si ile yönlenir)

`.env` dosyasını değiştirirseniz geliştirme/üretim sunucularını yeniden başlatın.

---

## 📋 Özellikler / Features

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

## 💾 Veri Saklama

Tüm uygulama verisi artık sunucu tarafında **SQLite** veritabanında tutulur:
- Veritabanı dosyası: `server/data/lab-equipment.db`
- Şema: `server/schema.sql`
- API uç noktası: `/api/state` (tam uygulama durumunu okur/yazar)

Tarayıcı yalnızca aktif kullanıcı bilgisini (`current_user`) localStorage'da saklar.
**"Tümünü Temizle"** butonu API tarafındaki tüm verileri sıfırlar (geri alınamaz).

---

## 🛠️ Teknolojiler / Tech Stack

- **React 18** - UI framework
- **Vite** - Build tool
- **TailwindCSS** - Styling (CDN)
- **Lucide React** - Icons
- **XLSX** - Excel import/export

---

## 📁 Dosya Yapısı / File Structure

```
order tracking/
├── index.html          # Ana HTML
├── package.json        # Bağımlılıklar
├── vite.config.js      # Vite yapılandırması
├── README.md           # Bu dosya
├── main.js             # Eski versiyon (referans)
├── lab_equipment_tracker.tsx  # TypeScript referans
└── src/
    ├── main.jsx        # React giriş noktası + storage API
    └── App.jsx         # Ana uygulama bileşeni
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

## ⚠️ Önemli Notlar

- Tarayıcı verileri temizlenirse tüm kayıtlar silinir
- Düzenli olarak "Excel'e Aktar" ile yedek alın
- Birden fazla kullanıcı aynı anda kullanamaz (tek kullanıcı modu)

---

## 📞 Destek

Sorularınız için geliştirici ile iletişime geçin.
