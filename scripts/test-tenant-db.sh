#!/usr/bin/env bash
# E2E: per-company dedicated database + module-deactivation resilience.
# Runs against the ISOLATED harness (API :4100, DB order_tracking_platform_test).
set -uo pipefail

B="http://127.0.0.1:4100/api"
TENANT_DB="zz_test_tenant_bir_db"
PASS=0; FAIL=0

cd /Users/oktay.vav/Documents/Order_tracking/Order_tracking
set -a; . server/.env.test; set +a
export MYSQL_PWD="$MYSQL_PASSWORD"
MYSQL_BIN="/usr/local/mysql/bin/mysql"; [ -x "$MYSQL_BIN" ] || MYSQL_BIN="$(command -v mysql)"
myq() { "$MYSQL_BIN" -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$MYSQL_USER" -N -e "$1"; }

json() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const j=JSON.parse(d);console.log(eval('j'+process.argv[1])??'')}catch{console.log('')}})" "$1"; }

check() { # check <desc> <actual> <expected>
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "  OK   $1"; else FAIL=$((FAIL+1)); echo "  FAIL $1  (got: '$2' want: '$3')"; fi
}
check_ne() { # check_ne <desc> <actual> <not-expected>
  if [ "$2" != "$3" ]; then PASS=$((PASS+1)); echo "  OK   $1"; else FAIL=$((FAIL+1)); echo "  FAIL $1  (got forbidden value '$2')"; fi
}

echo "== 0) cleanup leftovers from previous runs =="
myq "DROP DATABASE IF EXISTS \`$TENANT_DB\`;"
myq "DELETE FROM order_tracking_platform_test.users WHERE username IN ('tenant1admin','tenantuser2');" 2>/dev/null
myq "DELETE rp FROM order_tracking_platform_test.role_permissions rp JOIN order_tracking_platform_test.roles r ON rp.roleId=r.id JOIN order_tracking_platform_test.companies c ON r.companyId=c.id WHERE c.slug='tenant-bir';" 2>/dev/null
myq "DELETE r FROM order_tracking_platform_test.roles r JOIN order_tracking_platform_test.companies c ON r.companyId=c.id WHERE c.slug='tenant-bir';" 2>/dev/null
myq "DELETE FROM order_tracking_platform_test.companies WHERE slug='tenant-bir';" 2>/dev/null

echo "== 1) platform admin login =="
curl -s -X POST "$B/auth/bootstrap" -H 'Content-Type: application/json' -d '{"username":"platformadmin","password":"platform123"}' >/dev/null
TOKEN=$(curl -s -X POST "$B/auth/login" -H 'Content-Type: application/json' -d '{"username":"platformadmin","password":"platform123"}' | json .token)
check "platform admin token" "$([ -n "$TOKEN" ] && echo yes)" "yes"
A="Authorization: Bearer $TOKEN"

echo "== 2) create company WITH dedicated database =="
RES=$(curl -s -X POST "$B/admin/companies" -H "$A" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Tenant Bir A.Ş.\",\"slug\":\"tenant-bir\",\"adminUsername\":\"tenant1admin\",\"adminPassword\":\"tenant123!\",\"createDatabase\":true,\"dbName\":\"$TENANT_DB\"}")
check "company created" "$(echo "$RES" | json .status)" "OK"
check "dbName returned" "$(echo "$RES" | json .dbName)" "$TENANT_DB"
COMPANY_ID=$(echo "$RES" | json .companyId)

check "tenant DB exists on server" "$(myq "SHOW DATABASES LIKE '$TENANT_DB';")" "$TENANT_DB"
check "tenant item_definitions is a real table" "$(myq "SELECT TABLE_TYPE FROM information_schema.TABLES WHERE TABLE_SCHEMA='$TENANT_DB' AND TABLE_NAME='item_definitions';")" "BASE TABLE"
check "tenant users is a view" "$(myq "SELECT TABLE_TYPE FROM information_schema.TABLES WHERE TABLE_SCHEMA='$TENANT_DB' AND TABLE_NAME='users';")" "VIEW"
check "tenant cep_depo_balances created (self-heal)" "$(myq "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$TENANT_DB' AND TABLE_NAME='cep_depo_balances';")" "1"
check "companies.dbName stored" "$(myq "SELECT dbName FROM order_tracking_platform_test.companies WHERE slug='tenant-bir';")" "$TENANT_DB"

echo "== 3) refuse duplicate / existing database names =="
RES=$(curl -s -X POST "$B/admin/companies" -H "$A" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Kötü\",\"slug\":\"kotu-firma\",\"adminUsername\":\"kotuadmin\",\"adminPassword\":\"kotu1234!\",\"createDatabase\":true,\"dbName\":\"order_tracking_platform_test\"}")
check "central DB name refused" "$(echo "$RES" | json .error)" "INVALID_DB_NAME"
RES=$(curl -s -X POST "$B/admin/companies" -H "$A" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Kötü2\",\"slug\":\"kotu-firma2\",\"adminUsername\":\"kotuadmin2\",\"adminPassword\":\"kotu1234!\",\"createDatabase\":true,\"dbName\":\"$TENANT_DB\"}")
check "existing DB refused" "$(echo "$RES" | json .error)" "DB_EXISTS"
check "failed company rolled back" "$(myq "SELECT COUNT(*) FROM order_tracking_platform_test.companies WHERE slug IN ('kotu-firma','kotu-firma2');")" "0"

echo "== 4) tenant admin login + isolated business data =="
TTOKEN=$(curl -s -X POST "$B/auth/login" -H 'Content-Type: application/json' -d '{"username":"tenant1admin","password":"tenant123!"}' | json .token)
check "tenant admin token" "$([ -n "$TTOKEN" ] && echo yes)" "yes"
TA="Authorization: Bearer $TTOKEN"
check "tenant config company" "$(curl -s "$B/config" -H "$TA" | json '.company.id')" "$COMPANY_ID"

RES=$(curl -s -X POST "$B/item-definitions" -H "$TA" -H 'Content-Type: application/json' -d '{"code":"TNT-001","name":"Tenant Malzeme"}')
check "tenant item created" "$([ -n "$(echo "$RES" | json '.item?.id')" ] || [ "$(echo "$RES" | json .status)" = "OK" ] && echo yes)" "yes"
check "item row in TENANT db" "$(myq "SELECT COUNT(*) FROM \`$TENANT_DB\`.item_definitions WHERE code='TNT-001';")" "1"
check "item row NOT in central db" "$(myq "SELECT COUNT(*) FROM order_tracking_platform_test.item_definitions WHERE code='TNT-001';")" "0"

# purchases go through withTransaction — proves transactions work on the tenant pool
ITEM_ID=$(myq "SELECT id FROM \`$TENANT_DB\`.item_definitions WHERE code='TNT-001';")
RES=$(curl -s -X POST "$B/purchases" -H "$TA" -H 'Content-Type: application/json' \
  -d "{\"itemId\":\"$ITEM_ID\",\"itemCode\":\"TNT-001\",\"itemName\":\"Tenant Malzeme\",\"requestedQty\":5}")
check "tenant purchase request (transaction)" "$([ -n "$(echo "$RES" | json '.purchase?.id')" ] && echo yes)" "yes"
check "purchase row in TENANT db" "$(myq "SELECT COUNT(*) FROM \`$TENANT_DB\`.purchases;")" "1"
check "purchase NOT in central db" "$(myq "SELECT COUNT(*) FROM order_tracking_platform_test.purchases WHERE itemCode='TNT-001';")" "0"

echo "== 5) identity stays central (views) =="
check "tenant admin user row in CENTRAL users" "$(myq "SELECT companyId FROM order_tracking_platform_test.users WHERE username='tenant1admin';")" "$COMPANY_ID"
RES=$(curl -s -X POST "$B/users" -H "$TA" -H 'Content-Type: application/json' -d '{"username":"tenantuser2","password":"tenant456!","role":"LAB_TECHNICIAN"}')
check "tenant creates user through view" "$(echo "$RES" | json '.users?.length>0')" "true"
check "new user in CENTRAL users with tenant companyId" "$(myq "SELECT companyId FROM order_tracking_platform_test.users WHERE username='tenantuser2';")" "$COMPANY_ID"
RES=$(curl -s -X POST "$B/departments" -H "$TA" -H 'Content-Type: application/json' -d '{"name":"Tenant Lab"}')
check "tenant creates department" "$([ -n "$(echo "$RES" | json '.department?.id')" ] && echo yes)" "yes"
check "department in CENTRAL with tenant companyId" "$(myq "SELECT companyId FROM order_tracking_platform_test.departments WHERE name='Tenant Lab';")" "$COMPANY_ID"
check "tenant user list works" "$(curl -s "$B/users" -H "$TA" | json '.users.length')" "2"

echo "== 6) central company data untouched & isolated =="
RES=$(curl -s -X POST "$B/item-definitions" -H "$A" -H 'Content-Type: application/json' -d '{"code":"CNT-001","name":"Merkez Malzeme"}')
check "central item created" "$(myq "SELECT COUNT(*) FROM order_tracking_platform_test.item_definitions WHERE code='CNT-001';")" "1"
check "central item NOT in tenant db" "$(myq "SELECT COUNT(*) FROM \`$TENANT_DB\`.item_definitions WHERE code='CNT-001';")" "0"
check "tenant stock list only tenant items" "$(curl -s "$B/unified-stock" -H "$TA" | json '.items.map(i=>i.code).join()')" "TNT-001"

echo "== 7) disable ALL non-core modules for tenant — nothing may 500 =="
for M in requests orders distributions waste total_stock lot_inventory cep_depo prices; do
  curl -s -X PUT "$B/admin/modules/$M" -H "$TA" -H 'Content-Type: application/json' -d '{"enabled":false}' >/dev/null
done
for EP in config unified-stock purchases distributions state departments users item-definitions analytics/overview lab-technicians; do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' "$B/$EP" -H "$TA")
  check_ne "GET /$EP with all modules off (no 500)" "$CODE" "500"
done
check "waste-records returns 403 MODULE_DISABLED" "$(curl -s "$B/waste-records" -H "$TA" | json .error)" "MODULE_DISABLED"
check "cep-depo balances returns 403 MODULE_DISABLED" "$(curl -s "$B/cep-depo/balances" -H "$TA" | json .error)" "MODULE_DISABLED"
check "price-history returns 403 MODULE_DISABLED" "$(curl -s "$B/price-history" -H "$TA" | json .error)" "MODULE_DISABLED"
check "core module cannot be disabled" "$(curl -s -X PUT "$B/admin/modules/stock" -H "$TA" -H 'Content-Type: application/json' -d '{"enabled":false}' | json .error)" "CORE_MODULE"
# central company unaffected by tenant's toggles
check "central waste module still enabled" "$(curl -s "$B/waste-records" -H "$A" -o /dev/null -w '%{http_code}')" "200"
for M in requests orders distributions waste total_stock lot_inventory cep_depo prices; do
  curl -s -X PUT "$B/admin/modules/$M" -H "$TA" -H 'Content-Type: application/json' -d '{"enabled":true}' >/dev/null
done
check "waste re-enabled for tenant" "$(curl -s "$B/waste-records" -H "$TA" -o /dev/null -w '%{http_code}')" "200"

echo "== 8) per-company custom fields (customData) =="
# Define custom fields for the tenant's item + request forms
RES=$(curl -s -X PUT "$B/admin/custom-fields" -H "$TA" -H 'Content-Type: application/json' \
  -d '{"formKey":"itemForm","fields":[{"key":"proje_kodu","label":"Proje Kodu","type":"text","required":true},{"key":"iso_sinifi","label":"ISO Sınıfı","type":"select","options":["ISO-A","ISO-B"]}]}')
check "tenant defines item custom fields" "$(echo "$RES" | json .status)" "OK"
RES=$(curl -s -X PUT "$B/admin/custom-fields" -H "$TA" -H 'Content-Type: application/json' \
  -d '{"formKey":"requestForm","fields":[{"key":"butce_kalemi","label":"Bütçe Kalemi","type":"text","required":false}]}')
check "tenant defines request custom fields" "$(echo "$RES" | json .status)" "OK"
check "invalid field type rejected" "$(curl -s -X PUT "$B/admin/custom-fields" -H "$TA" -H 'Content-Type: application/json' \
  -d '{"formKey":"itemForm","fields":[{"key":"kotu","label":"Kötü","type":"blob"}]}' | json .error)" "INVALID_FIELD_TYPE"
check "invalid field key rejected" "$(curl -s -X PUT "$B/admin/custom-fields" -H "$TA" -H 'Content-Type: application/json' \
  -d '{"formKey":"itemForm","fields":[{"key":"1kotu","label":"Kötü","type":"text"}]}' | json .error)" "INVALID_FIELD_KEY"
check "config exposes custom fields" "$(curl -s "$B/config" -H "$TA" | json '.customFields.itemForm.length')" "2"

# Item with customData: unknown keys and invalid select values must be dropped
RES=$(curl -s -X POST "$B/item-definitions" -H "$TA" -H 'Content-Type: application/json' \
  -d '{"code":"TNT-002","name":"Özel Alanlı Malzeme","customData":{"proje_kodu":"PRJ-7","iso_sinifi":"ISO-A","bilinmeyen":"x"}}')
check "item with customData created" "$(echo "$RES" | json '.item.code')" "TNT-002"
check "customData kept known keys" "$(echo "$RES" | json '.item.customData.proje_kodu')" "PRJ-7"
check "customData select value kept" "$(echo "$RES" | json '.item.customData.iso_sinifi')" "ISO-A"
check "customData unknown key dropped" "$(echo "$RES" | json '.item.customData.bilinmeyen===undefined')" "true"
check "customData stored in TENANT db" "$(myq "SELECT JSON_UNQUOTE(JSON_EXTRACT(customData,'\$.proje_kodu')) FROM \`$TENANT_DB\`.item_definitions WHERE code='TNT-002';")" "PRJ-7"
RES=$(curl -s -X POST "$B/item-definitions" -H "$TA" -H 'Content-Type: application/json' \
  -d '{"code":"TNT-003","name":"Geçersiz Seçim","customData":{"iso_sinifi":"ISO-YOK"}}')
check "invalid select value dropped" "$(echo "$RES" | json '.item.customData===null')" "true"

# Update replaces the whole customData object
ITEM2_ID=$(myq "SELECT id FROM \`$TENANT_DB\`.item_definitions WHERE code='TNT-002';")
RES=$(curl -s -X PUT "$B/item-definitions/$ITEM2_ID" -H "$TA" -H 'Content-Type: application/json' \
  -d '{"customData":{"proje_kodu":"PRJ-9"}}')
check "item customData updated" "$(echo "$RES" | json '.item.customData.proje_kodu')" "PRJ-9"
check "update replaced whole object" "$(echo "$RES" | json '.item.customData.iso_sinifi===undefined')" "true"

# Request with customData; unified stock returns customData
RES=$(curl -s -X POST "$B/purchases" -H "$TA" -H 'Content-Type: application/json' \
  -d "{\"itemId\":\"$ITEM2_ID\",\"itemCode\":\"TNT-002\",\"itemName\":\"Özel Alanlı Malzeme\",\"requestedQty\":2,\"customData\":{\"butce_kalemi\":\"BK-2026\",\"yok\":\"x\"}}")
check "purchase with customData" "$(echo "$RES" | json '.purchase.customData.butce_kalemi')" "BK-2026"
check "purchase unknown key dropped" "$(echo "$RES" | json '.purchase.customData.yok===undefined')" "true"
check "unified-stock returns customData" "$(curl -s "$B/unified-stock" -H "$TA" | json '.items.find(i=>i.code==="TNT-002").customData.proje_kodu')" "PRJ-9"

# Custom fields are per company: central admin sees none, central items unaffected
check "central config has no custom fields" "$(curl -s "$B/config" -H "$A" | json '.customFields.itemForm?.length??0')" "0"
RES=$(curl -s -X POST "$B/item-definitions" -H "$A" -H 'Content-Type: application/json' \
  -d '{"code":"CNT-002","name":"Merkez Özel Deneme","customData":{"proje_kodu":"PRJ-X"}}')
check "central item ignores tenant fields" "$(echo "$RES" | json '.item.customData===null')" "true"

echo ""
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" = "0" ]
