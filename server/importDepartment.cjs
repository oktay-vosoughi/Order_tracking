const names = [
  ['SİTOGENETİK', 'sitogentik', 'cytogenetic', 'cytogenetics'],
  ['Moleküler Genetik', 'molekuler geneitk', 'molecular genetic', 'molecular genetics'],
  ['Moleküler Mikro', 'molekuler mikor', 'molecular micro'],
  ['Numune Kabul', 'sample acceptance']
];

const key = (value) => String(value ?? '').normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i')
  .toLowerCase().replace(/[^a-z0-9]/g, '');
const aliases = new Map(names.flatMap(([canonical, ...variants]) =>
  [canonical, ...variants].map((variant) => [key(variant), canonical])));

function normalizeImportDepartment(value) {
  if (value == null || String(value).trim() === '') return '';
  return aliases.get(key(value)) ?? null;
}

module.exports = { normalizeImportDepartment };
