/**
 * Texte « Aperçu » (dishDescription) — aucune dépendance projet (évite cycles require).
 */

const DISH_DESC_MAX = 280;

/**
 * @param {object} raw
 * @param {string} dishName
 * @param {Array<{name?: string, grams?: number}>} items
 * @returns {string}
 */
function sanitizeDishDescription(raw, dishName, items) {
  let s = '';
  if (raw && typeof raw.dishDescription === 'string' && raw.dishDescription.trim()) {
    s = raw.dishDescription.trim();
  } else if (raw && typeof raw.description === 'string' && raw.description.trim()) {
    s = raw.description.trim();
  } else if (raw && typeof raw.summary === 'string' && raw.summary.trim()) {
    s = raw.summary.trim();
  }
  if (s.length > DISH_DESC_MAX) {
    s = s.slice(0, DISH_DESC_MAX);
    const lastSpace = s.lastIndexOf(' ');
    if (lastSpace > DISH_DESC_MAX - 50) s = s.slice(0, lastSpace).trim();
  }
  if (!s && dishName && Array.isArray(items) && items.length) {
    const parts = items.filter((i) => i && i.name).map((i) => {
      const g = i.grams != null && Number(i.grams) > 0 ? ` ~${Math.round(Number(i.grams))} g` : '';
      return String(i.name).trim() + g;
    });
    if (parts.length) s = parts.slice(0, 4).join(' · ');
  }
  return s;
}

module.exports = { sanitizeDishDescription, DISH_DESC_MAX };
