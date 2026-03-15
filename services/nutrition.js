/**
 * Normalisation des réponses nutritionnelles renvoyées par OpenAI.
 * Valeurs internes précises vs valeurs d'affichage arrondies.
 * Intégration du score santé (healthScore, healthScoreReasoning).
 */

let computeHealthScore;
try {
  computeHealthScore = require('./healthScore').computeHealthScore;
} catch (err) {
  console.warn('[nutrition] healthScore non chargé, utilisation des valeurs par défaut:', err?.message || err);
  computeHealthScore = () => ({
    healthScore: 5,
    healthScoreDisplay: 5,
    healthScoreReasoning: ['Score non calculé (module healthScore absent).'],
  });
}

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
 * Valeur interne précise (autorise décimales).
 * @param {*} value
 * @returns {number}
 */
function toNonNegativePrecise(value) {
  const n = Number(value);
  if (Number.isNaN(n) || n < 0) return 0;
  return safeRound(n, 2);
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
 * Arrondi "affichage" pour les macros : < 0.5 → 0, sinon entier le plus proche.
 * @param {number} value
 * @returns {number}
 */
function toDisplayMacro(value) {
  const n = Number(value);
  if (Number.isNaN(n) || n < 0) return 0;
  if (n < 0.5) return 0;
  return Math.round(n);
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

const VALID_FOOD_TYPES = ['single_food', 'multi_ingredient_meal', 'packaged_product'];
const VALID_PROCESSING_LEVELS = ['minimal', 'low', 'moderate', 'high', 'ultra'];

function normalizeFoodType(value) {
  const v = (value || '').toString().toLowerCase().trim();
  return VALID_FOOD_TYPES.includes(v) ? v : 'single_food';
}

function normalizeProcessingLevel(value) {
  const v = (value || '').toString().toLowerCase().trim();
  return VALID_PROCESSING_LEVELS.includes(v) ? v : 'moderate';
}

/**
 * Normalise le résultat brut du scan food (réponse OpenAI).
 * - Valeurs internes précises (proteinG, carbsG, fatG avec décimales).
 * - Valeurs d'affichage (displayProteinG, displayCarbsG, displayFatG).
 * - Score santé et reasoning.
 * @param {object} raw - Réponse brute (après parse JSON)
 * @returns {object} - Objet normalisé pour l'API
 */
function normalizeFoodScanResult(raw) {
  const empty = {
    dishName: '',
    name: '',
    foodType: 'single_food',
    estimatedCalories: 0,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    displayProteinG: 0,
    displayCarbsG: 0,
    displayFatG: 0,
    estimatedFiberG: 0,
    naturalSugarEstimate: 0,
    addedSugarEstimate: 0,
    processingLevel: 'moderate',
    confidence: 0,
    items: [],
    notes: [],
    healthScore: 5,
    healthScoreDisplay: 5,
    healthScoreReasoning: [],
  };

  if (!raw || typeof raw !== 'object') {
    return empty;
  }

  const items = Array.isArray(raw.items)
    ? raw.items.map(normalizeFoodItem).filter(Boolean)
    : [];

  const notes = Array.isArray(raw.notes)
    ? raw.notes.filter((n) => typeof n === 'string' && n.trim()).map((n) => n.trim())
    : [];

  const dishName = typeof raw.dishName === 'string' && raw.dishName.trim()
    ? raw.dishName.trim()
    : '';

  const proteinG = toNonNegativePrecise(raw.proteinG);
  const carbsG = toNonNegativePrecise(raw.carbsG);
  const fatG = toNonNegativePrecise(raw.fatG);

  const normalized = {
    dishName,
    name: dishName,
    foodType: normalizeFoodType(raw.foodType),
    estimatedCalories: toNonNegativeNumber(raw.estimatedCalories),
    proteinG,
    carbsG,
    fatG,
    displayProteinG: toDisplayMacro(proteinG),
    displayCarbsG: toDisplayMacro(carbsG),
    displayFatG: toDisplayMacro(fatG),
    estimatedFiberG: toNonNegativePrecise(raw.estimatedFiberG),
    naturalSugarEstimate: toNonNegativePrecise(raw.naturalSugarEstimate),
    addedSugarEstimate: toNonNegativePrecise(raw.addedSugarEstimate),
    processingLevel: normalizeProcessingLevel(raw.processingLevel),
    confidence: safeRound(toConfidence(raw.confidence), 2),
    items,
    notes,
  };

  const { healthScore, healthScoreDisplay, healthScoreReasoning } = computeHealthScore(normalized);
  normalized.healthScore = healthScore;
  normalized.healthScoreDisplay = healthScoreDisplay;
  normalized.healthScoreReasoning = Array.isArray(healthScoreReasoning) ? healthScoreReasoning : [];

  return normalized;
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
