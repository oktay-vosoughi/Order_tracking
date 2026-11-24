'use strict';

// Pure planning for "reconcile an LY-F064 count against existing lots".
// For each material in the count, per department:
//   * a count lot whose expiry equals an existing lot's expiry updates THAT lot's
//     quantity (the real lot number is kept);
//   * existing lots with stock that match nothing are zeroed;
//   * count lots that match nothing become new LYF064-... lots;
//   * if an item has BOTH unmatched count lots and unmatched stocked lots, the
//     right pairing is unknown -> MANUEL (skipped unless the code is forced).

const q2 = (n) => Math.round(Number(n) * 100) / 100;
const key = (d) => (d ? String(d).slice(0, 10) : '');

function groupCountLots(lots) {
  const byCode = new Map();
  for (const l of lots) {
    if (!byCode.has(l.code)) byCode.set(l.code, new Map());
    const groups = byCode.get(l.code);
    const k = key(l.expiryDate);
    const g = groups.get(k) || { expiryDate: k, quantity: 0, sample: l };
    g.quantity = q2(g.quantity + Number(l.quantity));
    groups.set(k, g);
  }
  return byCode;
}

// countLots: [{code, expiryDate, quantity, ...}] ; db: Map code -> {id, lots:[{id,lotNumber,expiryDate,currentQuantity}]}
function planReconcile(countLots, db, { force = [], keep = [] } = {}) {
  const forced = new Set(force);
  const kept = new Set(keep);
  const byExpiry = (a, b) => (a.expiryDate === b.expiryDate ? 0 : !a.expiryDate ? 1 : !b.expiryDate ? -1 : a.expiryDate < b.expiryDate ? -1 : 1);
  const plan = [];
  for (const [code, groups] of groupCountLots(countLots)) {
    const item = db.get(code);
    if (!item) { plan.push({ code, state: 'ITEM_YOK', actions: [] }); continue; }
    const stocked = item.lots.filter((l) => q2(l.currentQuantity) > 0);
    const matched = []; const newGroups = []; const usedLotIds = new Set();
    let ambiguous = false;
    for (const g of groups.values()) {
      const hits = item.lots.filter((l) => key(l.expiryDate) === g.expiryDate && !usedLotIds.has(l.id));
      const stockedHits = hits.filter((l) => q2(l.currentQuantity) > 0);
      if (stockedHits.length > 1) {
        // Several stocked lots share this expiry: if they already add up to the
        // counted quantity there is nothing to change, otherwise a human decides.
        if (q2(stockedHits.reduce((sum, l) => sum + Number(l.currentQuantity), 0)) === q2(g.quantity)) {
          hits.forEach((l) => usedLotIds.add(l.id));
          continue;
        }
        ambiguous = true;
      }
      const hit = hits.sort((a, b) => q2(b.currentQuantity) - q2(a.currentQuantity))[0];
      if (hit) { usedLotIds.add(hit.id); matched.push({ g, lot: hit }); } else if (q2(g.quantity) > 0) newGroups.push(g); // a counted 0 needs no new lot
    }
    const leftovers = stocked.filter((l) => !usedLotIds.has(l.id));
    const actions = [];
    for (const { g, lot } of matched) {
      if (q2(lot.currentQuantity) !== q2(g.quantity)) actions.push({ type: 'SET_QTY', lot, from: q2(lot.currentQuantity), to: q2(g.quantity) });
    }
    let state = 'ESLESTI';
    // --keep-lots: pair unmatched count lots with unmatched stocked lots in expiry
    // order (only when the counts are equal) and update quantity only, so the real
    // lot numbers and their expiry dates stay as they are.
    if (!ambiguous && kept.has(code) && newGroups.length && newGroups.length === leftovers.length) {
      const gs = [...newGroups].sort(byExpiry); const ls = [...leftovers].sort(byExpiry);
      gs.forEach((g, i) => {
        const lot = ls[i];
        if (q2(lot.currentQuantity) !== q2(g.quantity) || key(lot.expiryDate) !== g.expiryDate) {
          actions.push({ type: 'SET_QTY', lot, from: q2(lot.currentQuantity), to: q2(g.quantity), note: key(lot.expiryDate) !== g.expiryDate ? `SKT farkli: sistem ${key(lot.expiryDate) || '-'} / sayim ${g.expiryDate || '-'}` : '' });
        }
      });
      newGroups.length = 0; leftovers.length = 0;
    }
    if (ambiguous) state = 'MANUEL';
    else if (newGroups.length && leftovers.length && !forced.has(code)) state = 'MANUEL';
    if (state === 'MANUEL') {
      plan.push({ code, state, actions: [], proposal: { zero: leftovers, create: newGroups, update: actions }, ambiguous });
      continue;
    }
    for (const l of leftovers) actions.push({ type: 'ZERO', lot: l, from: q2(l.currentQuantity), to: 0 });
    for (const g of newGroups) actions.push({ type: 'CREATE', group: g, to: q2(g.quantity) });
    if (!matched.length && newGroups.length && !leftovers.length) state = 'YENI_LOT';
    if (!actions.length) state = 'DEGISMEZ';
    plan.push({ code, itemId: item.id, state, actions });
  }
  return plan;
}

module.exports = { planReconcile, groupCountLots, key, q2 };
