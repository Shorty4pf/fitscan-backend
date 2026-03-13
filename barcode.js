/**
 * Recherche produit par code-barres via Open Food Facts (gratuit, sans clé API).
 * Retourne name, calories, protein, carbs, fats (pour 100 g).
 */

const OFF_API_BASE = 'https://world.openfoodfacts.org/api/v2/product';
const FIELDS = 'product_name,nutriments,serving_quantity,serving_size';
const REQUEST_TIMEOUT_MS = 10000;

/**
 * Convertit kJ en kcal (1 kcal ≈ 4,184 kJ).
 */
function kjToKcal(kj) {
  if (kj == null || Number.isNaN(Number(kj))) return 0;
  return Math.round(Number(kj) / 4.184);
}

/**
 * Récupère un nombre depuis les nutriments OFF (peut être string ou number).
 */
function toNumber(val) {
  if (val == null) return 0;
  const n = Number(val);
  return Number.isNaN(n) ? 0 : Math.max(0, Math.round(n * 10) / 10);
}

/**
 * Recherche un produit par code-barres.
 * @param {string} barcode - Code EAN-13, EAN-8, UPC, etc.
 * @returns {Promise<{ ok: true, data: { name, calories, protein, carbs, fats, servingSize? } } | { ok: false, error: string }>}
 */
async function lookupBarcode(barcode) {
  const code = String(barcode).trim().replace(/\D/g, '');
  if (code.length < 8) {
    return { ok: false, error: 'invalid_barcode' };
  }

  const url = `${OFF_API_BASE}/${code}.json?fields=${FIELDS}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) {
      return { ok: false, error: 'barcode_not_found' };
    }

    const json = await res.json();
    if (json.status !== 1 || !json.product) {
      return { ok: false, error: 'barcode_not_found' };
    }

    const p = json.product;
    const nut = p.nutriments || {};
    const name = p.product_name || 'Produit inconnu';

    // OFF : energy_100g en kJ ; protéines/glucides/lipides en g pour 100 g
    const energyKj = nut.energy_100g ?? nut.energy ?? 0;
    const calories = kjToKcal(energyKj);
    const protein = toNumber(nut.proteins_100g ?? nut.proteins ?? 0);
    const carbs = toNumber(nut.carbohydrates_100g ?? nut.carbohydrates ?? 0);
    const fats = toNumber(nut.fat_100g ?? nut.fat ?? 0);

    let servingSize = '100 g';
    if (p.serving_quantity && p.serving_size) {
      servingSize = `${p.serving_quantity} ${p.serving_size}`.trim();
    } else if (p.serving_size) {
      servingSize = String(p.serving_size);
    }

    return {
      ok: true,
      data: {
        name: name.trim() || 'Produit inconnu',
        calories,
        protein,
        carbs,
        fats,
        servingSize,
      },
    };
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      return { ok: false, error: 'timeout' };
    }
    console.error('[barcode] lookup error:', err?.message ?? err);
    return { ok: false, error: 'barcode_not_found' };
  }
}

module.exports = {
  lookupBarcode,
};
