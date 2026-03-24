/**
 * Normalisation des réponses nutritionnelles renvoyées par OpenAI.
 * Valeurs internes précises vs valeurs d'affichage arrondies.
 * Score santé intégré (aucune dépendance à healthScore.js pour le démarrage).
 */

const { sanitizeDishDescription } = require('../utils/response');

// --- Score santé (logique inline pour éviter MODULE_NOT_FOUND en conteneur) ---
const FRUITS = ['pomme', 'banane', 'orange', 'poire', 'kiwi', 'raisin', 'fraise', 'brocoli', 'concombre', 'carotte', 'tomate', 'salade', 'avocat', 'noix', 'amande', 'poulet', 'dinde', 'œuf', 'oeuf', 'saumon', 'riz', 'quinoa', 'avoine', 'flocon'];
const ULTRA = ['biscuit', 'gâteau', 'viennoiserie', 'soda', 'chips', 'burger', 'pizza', 'barre chocolat', 'bonbon', 'donut'];

function _norm(s) {
  if (!s || typeof s !== 'string') return '';
  return s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();
}

function _contains(text, keywords) {
  const n = _norm(text);
  return keywords.some((k) => n.includes(_norm(k)));
}

function _wholeCategory(f) {
  const name = (f.dishName || f.name || '').trim();
  const lvl = (f.processingLevel || '').toLowerCase();
  const items = Array.isArray(f.items) ? f.items : [];
  const text = `${name} ${items.map((i) => (i && i.name) || '').join(' ')}`.trim();
  if (_contains(text, ULTRA) && lvl.includes('ultra')) return { category: 'ultra_processed', isWhole: false };
  if (_contains(text, ['avocat', 'noix', 'amande'])) return { category: 'healthy_fat', isWhole: true };
  if (_contains(text, ['pomme', 'banane', 'orange', 'poire', 'kiwi', 'raisin', 'fraise', 'fruit'])) return { category: 'fruit', isWhole: true };
  if (_contains(text, ['brocoli', 'carotte', 'tomate', 'concombre', 'salade', 'légume'])) return { category: 'vegetable', isWhole: true };
  if (_contains(text, ['poulet', 'saumon', 'œuf', 'oeuf', 'tofu', 'skyr'])) return { category: 'protein', isWhole: true };
  if (_contains(text, ['riz', 'quinoa', 'avoine', 'flocon', 'patate', 'lentille'])) return { category: 'grain_legume', isWhole: true };
  if (lvl === 'minimal' || lvl === 'low') return { category: 'minimal', isWhole: true };
  if (lvl === 'ultra' || lvl === 'high') return { category: 'processed', isWhole: false };
  return { category: 'unknown', isWhole: false };
}

function computeHealthScore(foodAnalysis) {
  const f = foodAnalysis || {};
  const { category, isWhole } = _wholeCategory(f);
  const lvl = (f.processingLevel || '').toLowerCase();
  const cal = Number(f.estimatedCalories) || 0;
  const proteinG = Number(f.proteinG) || 0;
  const carbsG = Number(f.carbsG) || 0;
  const fatG = Number(f.fatG) || 0;
  const fiberG = Number(f.estimatedFiberG) || 0;
  const addedS = Number(f.addedSugarEstimate) || 0;

  let score = 5;
  if (lvl === 'minimal') score += 1.5; else if (lvl === 'low') score += 1.2; else if (lvl === 'ultra' || lvl === 'high') score -= 2;
  if (category === 'fruit' || category === 'vegetable') score += 2.5; else if (category === 'protein' || category === 'grain_legume' || category === 'healthy_fat') score += 1.5; else if (isWhole) score += 1;
  score += Math.min(0.8, fiberG / 10);
  score -= Math.min(1.2, addedS / 25);

  score = Math.max(0, Math.min(10, score));
  const display = Math.round(score * 10) / 10;
  const displayInt = Math.max(0, Math.min(10, Math.round(score)));

  const reasons = [];
  if (category === 'fruit') { reasons.push('Fruit entier peu transformé'); reasons.push('Sucre naturellement présent, non ajouté'); if (fiberG > 2) reasons.push('Bonne présence de fibres'); }
  else if (category === 'vegetable') { reasons.push('Légume brut peu transformé'); if (fiberG > 1) reasons.push('Apport en fibres'); }
  else if (category === 'protein') { reasons.push('Source de protéines de qualité'); if (proteinG >= 15) reasons.push('Riche en protéines'); }
  else if (category === 'healthy_fat') { reasons.push('Lipides de bonne qualité'); }
  else if (category === 'ultra_processed' || lvl === 'ultra') { reasons.push('Produit très transformé'); if (addedS > 10) reasons.push('Sucres ajoutés probables'); }
  if (reasons.length === 0) reasons.push('Estimation basée sur l\'analyse du plat');

  return { healthScore: display, healthScoreDisplay: displayInt, healthScoreReasoning: reasons.slice(0, 5) };
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
    dishDescription: '',
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

  try {
    if (!raw || typeof raw !== 'object') {
      return empty;
    }

    const items = Array.isArray(raw.items)
      ? raw.items.map((i) => normalizeFoodItem(i)).filter(Boolean)
      : [];

    const notes = Array.isArray(raw.notes)
      ? raw.notes.filter((n) => typeof n === 'string' && n.trim()).map((n) => n.trim())
      : [];

    const dishName = typeof raw.dishName === 'string' && raw.dishName.trim()
      ? raw.dishName.trim()
      : '';

    const dishDescription = sanitizeDishDescription(raw, dishName, items);

    const proteinG = toNonNegativePrecise(raw.proteinG);
    const carbsG = toNonNegativePrecise(raw.carbsG);
    const fatG = toNonNegativePrecise(raw.fatG);

    const normalized = {
      dishName,
      name: dishName,
      dishDescription,
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

    const health = computeHealthScore(normalized);
    normalized.healthScore = health?.healthScore ?? 5;
    normalized.healthScoreDisplay = health?.healthScoreDisplay ?? 5;
    normalized.healthScoreReasoning = Array.isArray(health?.healthScoreReasoning) ? health.healthScoreReasoning : [];

    return normalized;
  } catch (e) {
    const dn = (raw && typeof raw.dishName === 'string') ? raw.dishName.trim() : '';
    return { ...empty, dishName: dn, name: dn, dishDescription: sanitizeDishDescription(raw || {}, dn, []), estimatedCalories: toNonNegativeNumber(raw?.estimatedCalories), proteinG: toNonNegativePrecise(raw?.proteinG), carbsG: toNonNegativePrecise(raw?.carbsG), fatG: toNonNegativePrecise(raw?.fatG), displayProteinG: toDisplayMacro(toNonNegativePrecise(raw?.proteinG)), displayCarbsG: toDisplayMacro(toNonNegativePrecise(raw?.carbsG)), displayFatG: toDisplayMacro(toNonNegativePrecise(raw?.fatG)), confidence: safeRound(toConfidence(raw?.confidence), 2), items: [], notes: [] };
  }
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
