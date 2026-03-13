/**
 * Normalisation des réponses nutritionnelles renvoyées par OpenAI.
 * Garantit un JSON stable et des valeurs cohérentes pour l'app iOS.
 */

/**
 * Arrondit une valeur numérique de manière sûre.
 * @param {number} value - Valeur à arrondir
 * @param {number} decimals - Nombre de décimales
 * @returns {number}
 */
function safeRound(value, decimals = 0) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return 0;
  }
  const n = Number(value);
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

/**
 * Clamp une valeur entre min et max.
 * @param {number} value - Valeur
 * @param {number} min - Minimum
 * @param {number} max - Maximum
 * @returns {number}
 */
function clampNumber(value, min, max) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return min;
  }
  const n = Number(value);
  return Math.max(min, Math.min(max, n));
}

/**
 * Parse une valeur en nombre non négatif, clamp à 0.
 * @param {*} value
 * @returns {number}
 */
function toNonNegativeNumber(value) {
  const n = Number(value);
  if (Number.isNaN(n) || n < 0) return 0;
  return safeRound(n, 0);
}

/**
 * Parse une valeur en confiance (0 à 1).
 * @param {*} value
 * @returns {number}
 */
function toConfidence(value) {
  return clampNumber(value, 0, 1);
}

/**
 * Normalise un item (aliment) du scan food.
 * @param {object} item - Item brut
 * @returns {object|null} - { name, grams } ou null si invalide
 */
function normalizeFoodItem(item) {
  if (!item || typeof item !== 'object') return null;
  const name = typeof item.name === 'string' && item.name.trim()
    ? item.name.trim()
    : null;
  if (!name) return null;
  const grams = toNonNegativeNumber(item.grams);
  return { name, grams };
}

/**
 * Normalise le résultat brut du scan food (réponse OpenAI).
 * @param {object} raw - Réponse brute (après parse JSON)
 * @returns {object} - Objet normalisé pour l'API
 */
function normalizeFoodScanResult(raw) {
  if (!raw || typeof raw !== 'object') {
    return {
      dishName: null,
      estimatedCalories: 0,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
      confidence: 0,
      items: [],
      notes: [],
    };
  }

  const items = Array.isArray(raw.items)
    ? raw.items.map(normalizeFoodItem).filter(Boolean)
    : [];

  const notes = Array.isArray(raw.notes)
    ? raw.notes.filter((n) => typeof n === 'string' && n.trim()).map((n) => n.trim())
    : [];

  return {
    dishName: typeof raw.dishName === 'string' && raw.dishName.trim()
      ? raw.dishName.trim()
      : null,
    estimatedCalories: toNonNegativeNumber(raw.estimatedCalories),
    proteinG: toNonNegativeNumber(raw.proteinG),
    carbsG: toNonNegativeNumber(raw.carbsG),
    fatG: toNonNegativeNumber(raw.fatG),
    confidence: toConfidence(raw.confidence),
    items,
    notes,
  };
}

/**
 * Normalise le résultat brut du scan label (étiquette nutritionnelle).
 * @param {object} raw - Réponse brute
 * @returns {object}
 */
function normalizeLabelScanResult(raw) {
  if (!raw || typeof raw !== 'object') {
    return {
      productName: null,
      servingSize: null,
      calories: 0,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
      confidence: 0,
    };
  }

  return {
    productName: typeof raw.productName === 'string' && raw.productName.trim()
      ? raw.productName.trim()
      : null,
    servingSize: typeof raw.servingSize === 'string' && raw.servingSize.trim()
      ? raw.servingSize.trim()
      : null,
    calories: toNonNegativeNumber(raw.calories),
    proteinG: toNonNegativeNumber(raw.proteinG),
    carbsG: toNonNegativeNumber(raw.carbsG),
    fatG: toNonNegativeNumber(raw.fatG),
    confidence: toConfidence(raw.confidence),
  };
}

module.exports = {
  safeRound,
  clampNumber,
  toNonNegativeNumber,
  toConfidence,
  normalizeFoodItem,
  normalizeFoodScanResult,
  normalizeLabelScanResult,
};
