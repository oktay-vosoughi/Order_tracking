from __future__ import annotations

import os
import sys
from datetime import date
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / "server" / ".env"
OUTPUT_PATH = ROOT / f"cep_depo_birim_raporu_{date.today().isoformat()}.xlsx"


ALL_ROWS_SQL = """
SELECT
  i.code AS `Kod`,
  i.name AS `Malzeme`,
  i.brand AS `Marka`,
  i.department AS `Departman`,
  i.category AS `Kategori`,
  i.unit AS `Ana Depo Birimi`,
  i.packageUnit AS `Paket Birimi`,
  i.consumptionUnit AS `CEP DEPO Harcama Birimi`,
  i.unitsPerPackage AS `1 Paket Kaç Alt Birim`,
  i.consumptionUnitType AS `Tüketim Tipi`,
  COALESCE(stock.totalStock, 0) AS `Ana Depo Stok`,
  i.ideal_stock AS `Ideal Stok`,
  CONCAT(
    COALESCE(stock.totalStock, 0),
    ' / ',
    COALESCE(i.ideal_stock, i.minStock),
    ' ',
    COALESCE(i.unit, 'birim')
  ) AS `Ana Depoda Görünüm`,
  COALESCE(cep.labTechnicianUsername, '-') AS `CEP DEPO Kullanıcı`,
  cep.packQty AS `CEP Paket Miktarı`,
  cep.unitQty AS `CEP Alt Birim Miktarı`,
  CASE
    WHEN cep.id IS NULL THEN 'CEP DEPO yok'
    WHEN i.consumptionUnitType <> 'PACK' AND i.consumptionUnit IS NOT NULL
      THEN CONCAT(cep.unitQty, ' ', i.consumptionUnit)
    ELSE CONCAT(cep.packQty, ' ', COALESCE(i.packageUnit, i.unit, 'birim'))
  END AS `CEP DEPOda Görünüm`,
  CASE
    WHEN i.consumptionUnitType <> 'PACK' AND i.consumptionUnit IS NOT NULL
      THEN i.consumptionUnit
    ELSE COALESCE(i.packageUnit, i.unit, 'birim')
  END AS `Harcanırken Seçilecek Birim`,
  CASE
    WHEN i.consumptionUnitType <> 'PACK'
      AND i.unitsPerPackage IS NOT NULL
      AND cep.id IS NOT NULL
      THEN ROUND(cep.packQty * i.unitsPerPackage, 2)
    ELSE NULL
  END AS `Beklenen Alt Birim`,
  CASE
    WHEN i.consumptionUnitType = 'PACK' THEN 'OK - Paket tüketimi'
    WHEN i.consumptionUnitType <> 'PACK' AND i.consumptionUnit IS NULL THEN 'HATA - Alt birim yok'
    WHEN i.consumptionUnitType <> 'PACK' AND (i.unitsPerPackage IS NULL OR i.unitsPerPackage <= 0) THEN 'HATA - Çarpan yok'
    WHEN cep.id IS NULL THEN 'OK - CEP DEPO bakiyesi yok'
    WHEN ABS(cep.unitQty - (cep.packQty * i.unitsPerPackage)) > 0.01 THEN 'UYARI - packQty/unitQty tutarsız'
    ELSE 'OK'
  END AS `Kontrol`
FROM item_definitions i
LEFT JOIN (
  SELECT
    itemId,
    SUM(CASE WHEN status = 'ACTIVE' AND currentQuantity > 0 THEN currentQuantity ELSE 0 END) AS totalStock
  FROM lots
  GROUP BY itemId
) stock ON stock.itemId = i.id
LEFT JOIN cep_depo_balances cep
  ON cep.itemId = i.id
  AND cep.status = 'ACTIVE'
WHERE i.status = 'ACTIVE'
ORDER BY
  i.department,
  i.category,
  i.code,
  cep.labTechnicianUsername
"""


ISSUE_ROWS_SQL = """
SELECT *
FROM (
  SELECT
    i.code AS `Kod`,
    i.name AS `Malzeme`,
    i.unit AS `Ana Depo Birimi`,
    i.packageUnit AS `Paket Birimi`,
    i.consumptionUnit AS `CEP DEPO Harcama Birimi`,
    i.unitsPerPackage AS `1 Paket Kaç Alt Birim`,
    i.consumptionUnitType AS `Tüketim Tipi`,
    b.labTechnicianUsername AS `CEP DEPO Kullanıcı`,
    b.packQty AS `CEP Paket Miktarı`,
    b.unitQty AS `CEP Alt Birim Miktarı`,
    CASE
      WHEN i.consumptionUnitType <> 'PACK' AND i.consumptionUnit IS NULL THEN 'HATA - Alt birim yok'
      WHEN i.consumptionUnitType <> 'PACK' AND (i.unitsPerPackage IS NULL OR i.unitsPerPackage <= 0) THEN 'HATA - Çarpan yok'
      WHEN b.id IS NOT NULL AND i.consumptionUnitType <> 'PACK'
        AND ABS(b.unitQty - (b.packQty * i.unitsPerPackage)) > 0.01 THEN 'UYARI - packQty/unitQty tutarsız'
      ELSE 'OK'
    END AS `Kontrol`
  FROM item_definitions i
  LEFT JOIN cep_depo_balances b ON b.itemId = i.id AND b.status = 'ACTIVE'
  WHERE i.status = 'ACTIVE'
) x
WHERE `Kontrol` <> 'OK'
ORDER BY `Kod`
"""


def load_env(path: Path) -> None:
  if not path.exists():
    return

  for raw_line in path.read_text(encoding="utf-8").splitlines():
    line = raw_line.strip()
    if not line or line.startswith("#") or "=" not in line:
      continue
    key, value = line.split("=", 1)
    os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def require_packages():
  try:
    import pymysql  # type: ignore
  except ImportError:
    print("Eksik paket: pymysql")
    print("Kurulum: python -m pip install pymysql openpyxl")
    sys.exit(1)

  try:
    from openpyxl import Workbook  # type: ignore
  except ImportError:
    print("Eksik paket: openpyxl")
    print("Kurulum: python -m pip install pymysql openpyxl")
    sys.exit(1)

  return pymysql, Workbook


def db_config() -> dict:
  return {
    "host": os.getenv("MYSQL_HOST", "localhost"),
    "port": int(os.getenv("MYSQL_PORT", "3306")),
    "user": os.getenv("MYSQL_USER", "root"),
    "password": os.getenv("MYSQL_PASSWORD", ""),
    "database": os.getenv("MYSQL_DATABASE", "order_Tracking"),
    "charset": "utf8mb4",
    "cursorclass": None,
  }


def fetch_rows(connection, sql: str) -> list[dict]:
  with connection.cursor() as cursor:
    cursor.execute(sql)
    columns = [desc[0] for desc in cursor.description]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


def write_sheet(workbook, title: str, rows: list[dict]) -> None:
  sheet = workbook.create_sheet(title=title)

  if not rows:
    sheet.append(["Bilgi"])
    sheet.append(["Kayıt bulunmadı"])
    return

  headers = list(rows[0].keys())
  sheet.append(headers)
  for row in rows:
    sheet.append([row.get(header) for header in headers])

  for column_cells in sheet.columns:
    max_length = max(len(str(cell.value or "")) for cell in column_cells)
    sheet.column_dimensions[column_cells[0].column_letter].width = min(max(max_length + 2, 12), 45)


def main() -> int:
  load_env(ENV_PATH)
  pymysql, Workbook = require_packages()
  config = db_config()
  config["cursorclass"] = pymysql.cursors.Cursor

  connection = pymysql.connect(**config)
  try:
    all_rows = fetch_rows(connection, ALL_ROWS_SQL)
    issue_rows = fetch_rows(connection, ISSUE_ROWS_SQL)
  finally:
    connection.close()

  workbook = Workbook()
  default_sheet = workbook.active
  workbook.remove(default_sheet)
  write_sheet(workbook, "Tüm Malzemeler", all_rows)
  write_sheet(workbook, "Sorunlu Kayıtlar", issue_rows)
  workbook.save(OUTPUT_PATH)

  print(f"Excel oluşturuldu: {OUTPUT_PATH}")
  print(f"Tüm malzemeler: {len(all_rows)}")
  print(f"Sorunlu kayıtlar: {len(issue_rows)}")
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
