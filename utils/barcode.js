/**
 * Recherche produit par code-barres via Open Food Facts (gratuit, sans clé API).
 */

const OFF_API_BASE = 'https://world.openfoodfacts.org/api/v2/product';
const OFF_IMAGES_BASE = 'https://images.openfoodfacts.org/images/products';
const FIELDS = 'product_name,nutriments,serving_quantity,serving_size,image_front_url,image_front_small_url,selected_images,images';
const REQUEST_TIMEOUT_MS = 10000;

function barcodeToPath(code) {
  const s = String(code).replace(/\D/g, '').padStart(13, '0').slice(-13);
  return s.length >= 4 ? `${s.slice(0, 3)}/${s.slice(3, 6)}/${s.slice(6, 9)}/${s.slice(9)}` : null;
}

function getProductImageUrl(p, barcode) {
  const ok = (v) => (v && typeof v === 'string' && v.startsWith('http') ? v.trim() : null);
  const url = ok(p.image_front_url) || ok(p.image_front_small_url);
  if (url) return url;
  const display = p.selected_images?.front?.display;
  if (display && typeof display === 'object') {
    const u = ok(display.en) || ok(display.fr) || ok(display.de) || Object.values(display).find((v) => ok(v));
    if (u) return u;
  }
  const imgs = p.images;
  if (imgs && barcode) {
    const path = barcodeToPath(barcode);
    const key = ['front_fr', 'front_en', 'front_de'].find((k) => imgs[k]?.rev != null) || Object.keys(imgs).find((k) => /^front_/.test(k) && imgs[k]?.rev != null);
    if (path && key && imgs[key].rev) return `${OFF_IMAGES_BASE}/${path}/${key}.${imgs[key].rev}.400.jpg`;
  }
  return null;
}

function kjToKcal(kj) {
  if (kj == null || Number.isNaN(Number(kj))) return 0;
  return Math.round(Number(kj) / 4.184);
}

function toNumber(val) {
  if (val == null) return 0;
  const n = Number(val);
  return Number.isNaN(n) ? 0 : Math.max(0, Math.round(n * 10) / 10);
}

async function lookupBarcode(barcode) {
  const code = String(barcode).trim().replace(/\D/g, '');
  if (code.length < 8) return { ok: false, error: 'invalid_barcode' };

  const controller = new AbortController();
  let timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${OFF_API_BASE}/${code}.json?fields=${FIELDS}`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return { ok: false, error: 'barcode_not_found' };

    const json = await res.json();
    if (json.status !== 1 || !json.product) return { ok: false, error: 'barcode_not_found' };

    const p = json.product;
    const nut = p.nutriments || {};
    const servingSize = (p.serving_quantity && p.serving_size) ? `${p.serving_quantity} ${p.serving_size}`.trim() : (p.serving_size ? String(p.serving_size) : '100 g');
    const imageUrl = getProductImageUrl(p, json.code || code);

    return {
      ok: true,
      data: {
        name: (p.product_name || 'Produit inconnu').trim() || 'Produit inconnu',
        calories: kjToKcal(nut.energy_100g ?? nut.energy ?? 0),
        protein: toNumber(nut.proteins_100g ?? nut.proteins ?? 0),
        carbs: toNumber(nut.carbohydrates_100g ?? nut.carbohydrates ?? 0),
        fats: toNumber(nut.fat_100g ?? nut.fat ?? 0),
        servingSize,
        image_url: imageUrl,
        imageUrl: imageUrl,
      },
    };
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') return { ok: false, error: 'timeout' };
    console.error('[barcode] lookup error:', err?.message ?? err);
    return { ok: false, error: 'barcode_not_found' };
  }
}

module.exports = {
  lookupBarcode,
};
