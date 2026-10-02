const { normalizeImportDepartment } = require('./importDepartment.cjs');

const fail = (message, error = 'DEPARTMENT_FORBIDDEN', status = 403) => {
  throw { status, error, message };
};

function createStockWriteScope({ all, pool }) {
  return async (req, res, next) => {
    try {
      const admin = req.user.role === 'ADMIN';
      const memberships = admin ? null : (await all(pool,
        'SELECT department FROM user_departments WHERE userId = ?', [req.user.id])).map((r) => r.department);
      const check = (department) => {
        if (!department || normalizeImportDepartment(department) !== department) {
          fail('İşlem için geçerli bir departman seçin.', 'DEPARTMENT_REQUIRED', 400);
        }
        if (!admin && !memberships.includes(department)) fail('Bu departmanın stoklarında işlem yetkiniz yok.');
        return department;
      };
      const one = async (sql, params) => {
        const rows = await all(pool, sql, params);
        if (!rows.length) fail('İşlem kaydı bulunamadı.', 'NOT_FOUND', 404);
        return rows[0];
      };
      const body = req.body || (req.body = {});
      const path = req.route.path;
      req.assertStockDepartment = check;
      req.assertStockLot = (lot, department = req.stockDepartment, itemId = body.itemId) => {
        if (!lot || (itemId && String(lot.itemId) !== String(itemId))) fail('LOT seçilen malzemeye ait değil.', 'LOT_NOT_FOUND', 404);
        // Untagged legacy stock may only be repaired by ADMIN, never silently
        // consumed as another department's stock.
        if (lot.department || !admin) check(lot.department);
        if (department && lot.department !== department) fail('LOT ve işlem departmanı aynı olmalıdır.', 'LOT_DEPARTMENT_MISMATCH', 409);
      };
      const checkMaster = async (item) => {
        if (admin) return;
        const tags = await all(pool, 'SELECT department FROM item_departments WHERE itemDefinitionId = ?', [item.id]);
        const departments = [...new Set([item.department, ...tags.map((r) => r.department)].filter(Boolean))];
        if (item.isGlobal || !departments.length || departments.some((d) => !memberships.includes(d))) {
          fail('Ortak veya başka departmana ait malzeme tanımını yalnızca admin güncelleyebilir.');
        }
      };
      if (path === '/api/import-items') {
        for (const row of body.items || []) {
          const department = check(normalizeImportDepartment(row.department));
          const existing = await all(pool, 'SELECT * FROM item_definitions WHERE code = ?', [String(row.code ?? '').trim()]);
          if (existing[0]) {
            await checkMaster(existing[0]);
            const lots = await all(pool, `
              SELECT * FROM lots
              WHERE itemId = ? AND lotNumber = ?
                AND (department = ? OR department IS NULL OR department = '')
              ORDER BY CASE WHEN department = ? THEN 0 ELSE 1 END
              LIMIT 1
            `, [existing[0].id, String(row.lotNumber || row.lotNo || '').trim(), department, department]);
            if (lots[0]) {
              const repairsUntaggedLot = admin && !lots[0].department;
              if (!repairsUntaggedLot) {
                req.assertStockLot(lots[0], department, existing[0].id);
              }
            }
          }
        }
        return next();
      }
      if (path.startsWith('/api/item-definitions')) {
        if (req.params.id) await checkMaster(await one('SELECT * FROM item_definitions WHERE id = ?', [req.params.id]));
        if (body.department !== undefined || !req.params.id) check(body.department || (memberships?.length === 1 ? (body.department = memberships[0]) : ''));
        for (const department of body.departments || []) check(department);
        if (!admin && body.isGlobal) fail('Ortak malzeme tanımını yalnızca admin değiştirebilir.');
        return next();
      }
      if (path === '/api/barcodes' || path === '/api/barcodes/:id') {
        const itemId = body.itemId || (await one('SELECT itemId FROM item_barcodes WHERE id = ?', [req.params.id])).itemId;
        await checkMaster(await one('SELECT * FROM item_definitions WHERE id = ?', [itemId]));
        return next();
      }
      if (path === '/api/distribute/:id/confirm' || path === '/api/cep-depo/distributions/:id/confirm') {
        const table = path.startsWith('/api/cep-depo') ? 'cep_depo_distributions' : 'distributions';
        check((await one(`SELECT department FROM ${table} WHERE id = ?`, [req.params.id])).department);
        return next();
      }
      if (path === '/api/receipts/:receiptId') {
        check((await one('SELECT p.department FROM receipts r JOIN purchases p ON p.id = r.purchaseId WHERE r.receiptId = ?', [req.params.receiptId])).department);
        return next();
      }
      if (path.startsWith('/api/purchases')) {
        if (req.params.batchId) {
          const purchases = await all(pool, 'SELECT department FROM purchases WHERE ebysBatchId = ?', [req.params.batchId]);
          for (const purchase of purchases) check(purchase.department);
        } else if (req.params.id) {
          check((await one('SELECT department FROM purchases WHERE id = ?', [req.params.id])).department);
        } else {
          let department = body.department;
          if (body.requestedFor) {
            const tech = await one('SELECT department FROM users WHERE username = ?', [body.requestedFor]);
            if (department && department !== tech.department) fail('Talep ve alıcı departmanı eşleşmiyor.', 'DEPARTMENT_MISMATCH', 409);
            department = tech.department;
          } else if (req.user.role === 'LAB_TECHNICIAN') {
            const tech = await one('SELECT department FROM users WHERE id = ?', [req.user.id]);
            if (department && department !== tech.department) fail('Talep departmanı kullanıcıyla eşleşmiyor.', 'DEPARTMENT_MISMATCH', 409);
            department = tech.department;
          }
          body.department = check(department || (memberships?.length === 1 ? memberships[0] : ''));
        }
        return next();
      }

      let department = body.department;
      const adopt = (candidate) => {
        check(candidate);
        if (department && department !== candidate) fail('İşlem, alıcı ve sipariş departmanları aynı olmalıdır.', 'DEPARTMENT_MISMATCH', 409);
        department = candidate;
      };
      if (body.purchaseId) {
        const purchase = await one('SELECT * FROM purchases WHERE id = ?', [body.purchaseId]);
        if (body.itemId && String(purchase.itemId) !== String(body.itemId)) fail('Sipariş ve malzeme eşleşmiyor.', 'ITEM_MISMATCH', 409);
        adopt(purchase.department);
      }
      if (path === '/api/cep-depo/consume' || path === '/api/cep-depo/return') {
        const techId = admin && body.labTechnicianId ? body.labTechnicianId : req.user.id;
        const tech = await one('SELECT department FROM users WHERE id = ?', [techId]);
        adopt(admin && body.department ? body.department : tech.department);
      } else if (body.labTechnicianId) {
        adopt((await one('SELECT department FROM users WHERE id = ?', [body.labTechnicianId])).department);
      } else if (path === '/api/distribute' && body.receivedBy) {
        const techs = await all(pool, "SELECT department FROM users WHERE username = ? AND role = 'LAB_TECHNICIAN'", [body.receivedBy]);
        if (techs[0]) adopt(techs[0].department);
      }
      const lotIds = [...new Set([body.lotId, ...(Array.isArray(body.lots) ? body.lots.map((r) => r.lotId) : []), path === '/api/lots/:id' ? req.params.id : null].filter(Boolean))];
      for (const id of lotIds) {
        const lot = await one('SELECT * FROM lots WHERE id = ?', [id]);
        if (path === '/api/lots/:id' && admin) {
          req.assertStockLot(lot, null);
          if (body.department !== undefined) check(body.department);
          continue;
        }
        if (!department) department = lot.department;
        req.assertStockLot(lot, department);
      }
      department ||= memberships?.length === 1 ? memberships[0] : '';
      if (path !== '/api/lots/:id' || !admin) check(department);
      req.stockDepartment = department;
      if (path !== '/api/lots/:id') body.department = department;

      // Receiving must never add another department's purchase to an existing
      // same-number lot, even when the actor is ADMIN.
      if (path === '/api/receive-goods') {
        const lots = await all(pool, 'SELECT * FROM lots WHERE itemId = ? AND lotNumber = ?', [body.itemId, body.lotNumber]);
        if (lots[0]) req.assertStockLot(lots[0]);
      }
      next();
    } catch (error) {
      if (!error.status) console.error('Stock department authorization failed', error);
      res.status(error.status || 500).json({ error: error.error || 'SERVER_ERROR', message: error.message || 'Departman yetkisi doğrulanamadı.' });
    }
  };
}

module.exports = { createStockWriteScope };
