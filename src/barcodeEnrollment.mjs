import { matchesItemSearch } from './itemSearch.mjs';

function hasIdentifiers(byItem, itemId) {
  return (byItem[itemId] || []).length > 0;
}

function matchesEnrollmentSearch(item, search, byItem) {
  return matchesItemSearch(item, search, byItem[item.id] || []);
}

function filterEnrollmentItems({ items, byItem, search, onlyMissing, selectedId }) {
  return items.filter((item) => {
    // Keep the selected product visible after its first identifier is added so
    // staff can scan its other package variants without selecting it again.
    if (onlyMissing && hasIdentifiers(byItem, item.id) && item.id !== selectedId) return false;
    return matchesEnrollmentSearch(item, search, byItem);
  });
}

function findNextMissingItemId({ items, byItem, search, currentId }) {
  const candidates = items.filter((item) => (
    !hasIdentifiers(byItem, item.id) && matchesEnrollmentSearch(item, search, byItem)
  ));
  if (!candidates.length) return null;

  const currentIndex = items.findIndex((item) => item.id === currentId);
  return candidates.find((item) => items.indexOf(item) > currentIndex)?.id || candidates[0].id;
}

export { filterEnrollmentItems, findNextMissingItemId, hasIdentifiers, matchesEnrollmentSearch };
