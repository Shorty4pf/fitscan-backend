/**
 * Recherche produit par code-barres via Open Food Facts (gratuit, sans clé API).
 * Retourne name, calories, protein, carbs, fats (pour 100 g).
 */

const OFF_API_BASE = 'https://world.openfoodfacts.org/api/v2/product';
const FIELDS = 'product_name,nutriments,serving_quantity,serving_size,image_front_url,image_front_small_url,selected_images,images';
/** Délai max pour la réponse Open Food Facts (client app doit prévoir ~15–20 s à cause du cold start possible). */
const REQUEST_TIMEOUT_MS = 10000;

const OFF_IMAGES_BASE = 'https://images.openfoodfacts.org/images/products';

/** Construit le chemin barcode pour les URLs OFF (ex. 3017620422003 → 301/762/042/2003). */
function barcodeToPath(code) {
  const s = String(code).replace(/\D/g, '').padStart(13, '0').slice(-13);
  if (s.length < 4) return null;
  const a = s.slice(0, 3);
  const b = s.slice(3, 6);
  const c = s.slice(6, 9);
  const d = s.slice(9);
  return `${a}/${b}/${c}/${d}`;
}

/**
 * Extrait une URL d'image depuis le produit OFF :
 * 1) image_front_url / image_front_small_url
 * 2) selected_images.front.display (en, fr, de, etc.)
 * 3) construction depuis images (front_xx.rev) + barcode si présent
 */
function getProductImageUrl(p, barcode) {
  const fromField = (val) => (val && typeof val === 'string' && val.startsWith('http') ? val.trim() : null);
  let url = fromField(p.image_front_url) || fromField(p.image_front_small_url);
  if (url) return url;
  const sel = p.selected_images && p.selected_images.front;
  if (sel && sel.display && typeof sel.display === 'object') {
    const display = sel.display;
    url = fromField(display.en) || fromField(display.fr) || fromField(display.de) || Object.values(display).find((v) => fromField(v));
  }
  if (url) return url;
  // Fallback : construire l'URL à partir de product.images (front_fr, front_en, etc. + rev)
  const imgs = p.images;
  if (imgs && typeof imgs === 'object' && barcode) {
    const path = barcodeToPath(barcode);
    if (path) {
      const preferred = ['front_fr', 'front_en', 'front_de', 'front_es', 'front_it'];
      let frontKey = preferred.find((k) => imgs[k] && (imgs[k].rev != null));
      if (!frontKey) frontKey = Object.keys(imgs).find((k) => /^front_/.test(k) && imgs[k] && (imgs[k].rev != null));
      if (frontKey) {
        const rev = String(imgs[frontKey].rev);
        if (rev) return `${OFF_IMAGES_BASE}/${path}/${frontKey}.${rev}.400.jpg`;
      }
    }
  }
  return null;
}

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

    const imageUrl = getProductImageUrl(p, json.code || code);

    return {
      ok: true,
      data: {
        name: name.trim() || 'Produit inconnu',
        calories,
        protein,
        carbs,
        fats,
        servingSize,
        image_url: imageUrl,
        imageUrl: imageUrl,
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
