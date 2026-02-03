# 📊 LOT Stok Yönetimi - Excel İçe Aktarma Kılavuzu

## Excel Şablonu Formatı

### 1. Malzeme Tanımları (Items) Sayfası
Aşağıdaki sütunları içermelidir:

| Sütun Adı | Zorunlu | Açıklama | Örnek |
|-----------|---------|----------|-------|
| code | ✅ Evet | Malzeme kodu (benzersiz) | PCR-001 |
| name | ✅ Evet | Malzeme adı | PCR Master Mix |
| category | ❌ Hayır | Kategori | Reagent |
| department | ❌ Hayır | Departman | Molecular |
| unit | ❌ Hayır | Birim | kutu |
| minStock | ❌ Hayır | Minimum stok | 5 |
| supplier | ❌ Hayır | Tedarikçi | Thermo Fisher |
| catalogNo | ❌ Hayır | Katalog no | AB-12345 |
| brand | ❌ Hayır | Marka | Applied Biosystems |
| storageLocation | ❌ Hayır | Depolama yeri | Dolap A-3 |
| storageTemp | ❌ Hayır | Saklama sıcaklığı | -20C, 4C, RT |
| chemicalType | ❌ Hayır | Kimyasal türü | ACID, BASE, FLAMMABLE |
| msdsUrl | ❌ Hayır | MSDS linki | https://... |
| notes | ❌ Hayır | Notlar | Işıktan korunmalı |

### 2. LOT Kayıtları (Lots) Sayfası
Aşağıdaki sütunları içermelidir:

| Sütun Adı | Zorunlu | Açıklama | Örnek |
|-----------|---------|----------|-------|
| itemCode | ✅ Evet | Malzeme kodu (Items sayfasındaki code ile eşleşmeli) | PCR-001 |
| lotNumber | ✅ Evet | LOT numarası | LOT-2024-001 |
| initialQuantity | ✅ Evet | Başlangıç miktarı | 10 |
| manufacturer | ❌ Hayır | Üretici | Thermo Fisher |
| catalogNo | ❌ Hayır | Katalog no | AB-12345 |
| expiryDate | ❌ Hayır | Son kullanma tarihi (YYYY-MM-DD) | 2025-12-31 |
| receivedDate | ❌ Hayır | Alım tarihi (YYYY-MM-DD) | 2024-01-15 |
| department | ❌ Hayır | Departman | Molecular |
| location | ❌ Hayır | Konum | Raf B-2 |
| storageLocation | ❌ Hayır | Depolama yeri | Dolap A-3 |
| invoiceNo | ❌ Hayır | Fatura no | INV-2024-001 |
| notes | ❌ Hayır | Notlar | İlk parti |

## 📝 Örnek Excel Dosyası

### Items Sayfası:
```
code        | name              | category | department | unit  | minStock | supplier       | brand
PCR-001     | PCR Master Mix    | Reagent  | Molecular  | kutu  | 5        | Thermo Fisher  | Applied Bio
DNA-002     | DNA Extraction Kit| Kit      | Molecular  | adet  | 3        | Qiagen         | Qiagen
BUFFER-003  | Tris Buffer       | Chemical | Cytogenetic| litre | 10       | Sigma          | Sigma-Aldrich
```

### Lots Sayfası:
```
itemCode   | lotNumber      | initialQuantity | manufacturer  | expiryDate  | receivedDate | department
PCR-001    | LOT-2024-001   | 10             | Thermo Fisher | 2025-12-31  | 2024-01-15   | Molecular
PCR-001    | LOT-2024-002   | 15             | Thermo Fisher | 2026-01-15  | 2024-02-01   | Molecular
DNA-002    | LOT-2024-003   | 5              | Qiagen        | 2025-06-30  | 2024-01-20   | Molecular
BUFFER-003 | LOT-2024-004   | 20             | Sigma         | 2026-12-31  | 2024-01-10   | Cytogenetic
```

## 🔄 Aynı Ürün İçin Birden Fazla LOT

**Önemli:** Aynı malzeme için birden fazla LOT ekleyebilirsiniz!

Örnek: PCR Master Mix için 3 farklı LOT
```
itemCode   | lotNumber      | initialQuantity | expiryDate  | receivedDate
PCR-001    | LOT-2024-001   | 10             | 2025-12-31  | 2024-01-15
PCR-001    | LOT-2024-002   | 15             | 2026-01-15  | 2024-02-01
PCR-001    | LOT-2024-003   | 8              | 2025-06-30  | 2024-03-10
```

Sistem otomatik olarak:
- Her LOT'u ayrı ayrı takip eder
- Toplam stoku hesaplar (10 + 15 + 8 = 33)
- Tüketimde FEFO (ilk süresi dolan önce) mantığı uygular
- LOT-2024-003 önce tüketilir (2025-06-30)
- Sonra LOT-2024-001 (2025-12-31)
- En son LOT-2024-002 (2026-01-15)

## 📥 Excel Dosyasını İçe Aktarma

1. **LOT Stok Yönetimi** sekmesine gidin
2. **Malzemeler** görünümünde **"Excel Yükle"** butonuna tıklayın
3. Excel dosyanızı seçin
4. Sistem otomatik olarak:
   - İlk sayfayı (Items) malzeme tanımları olarak okur
   - İkinci sayfayı (Lots) LOT kayıtları olarak okur
   - Mevcut kayıtlarla karşılaştırır
   - Yeni kayıtları ekler
   - Var olanları günceller

## ⚠️ Önemli Notlar

1. **Tarih Formatı**: Excel'de tarihler `YYYY-MM-DD` formatında olmalı (örn: 2025-12-31)
2. **Malzeme Kodu Eşleşmesi**: Lots sayfasındaki `itemCode` mutlaka Items sayfasındaki `code` ile eşleşmeli
3. **Benzersiz LOT**: Her LOT numarası benzersiz olmalı
4. **Sayısal Değerler**: Miktar alanları sayı olmalı (metin değil)
5. **Departman Değerleri**: Geçerli departmanlar: Cytogenetic, Molecular, Numune Kabul, Kalite Kontrol, Depo

## 🎯 İpuçları

- Excel'de ilk satır başlık satırı olmalı
- Boş satırlar otomatik atlanır
- Büyük/küçük harf duyarlı değil
- Türkçe karakter kullanabilirsiniz
- Toplu veri girişi için idealdir
