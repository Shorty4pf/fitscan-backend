/**
 * Moteur de score santé pour le scan alimentaire FitScan.
 * Gère : whole food bonus, sucre naturel vs ajouté, fibres, niveau de transformation,
 * garde-fous anti-aberration (fruits/légumes jamais pénalisés bêtement).
 */

const FRUIT_KEYWORDS = [
  'pomme', 'banane', 'orange', 'poire', 'kiwi', 'raisin', 'fraise', 'framboise',
  'cerise', 'abricot', 'pêche', 'prune', 'melon', 'pastèque', 'pastèque', 'mangue',
  'ananas', 'citron', 'lime', 'myrtille', 'mûre', 'cranberry', 'grenade',
  'figue', 'datte', 'fruit', 'fruits', 'compote', 'salade de fruits',
];
const VEGETABLE_KEYWORDS = [
  'brocoli', 'brocoli', 'concombre', 'carotte', 'tomate', 'salade', 'épinard',
  'courgette', 'poivron', 'aubergine', 'chou', 'haricot vert', 'petit pois',
  'légume', 'légumes', 'céleri', 'asperge', 'artichaut', 'betterave', 'radis',
];
const WHOLE_PROTEIN_KEYWORDS = [
  'poulet', 'dinde', 'œuf', 'oeuf', 'saumon', 'truite', 'thon', 'tofu',
  'skyr', 'yaourt nature', 'yogourt nature', 'fromage blanc', 'blanc de poulet',
];
const WHOLE_GRAIN_KEYWORDS = [
  'riz', 'quinoa', 'avoine', 'flocon', 'patate', 'pomme de terre', 'pdt',
  'lentille', 'pois chiche', 'haricot rouge', 'légumineuse',
];
const ULTRA_PROCESSED_KEYWORDS = [
  'biscuit', 'gâteau', 'viennoiserie', 'croissant', 'soda', 'chips', 'burger',
  'pizza', 'barre chocolat', 'céréale sucrée', 'bonbon', 'glace', 'donut',
  'nutella', 'sauce industrielle', 'plats préparés', 'nugget', 'cordon bleu',
];
const HEALTHY_FAT_KEYWORDS = [
  'avocat', 'noix', 'amande', 'noisette', 'huile d\'olive', 'olive',
];

/**
 * Normalise une chaîne pour la recherche (minuscules, sans accents basiques).
 * @param {string} s
 * @returns {string}
 */
function normalizeForMatch(s) {
  if (!s || typeof s !== 'string') return '';
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim();
}

/**
 * Vérifie si une chaîne contient l'un des mots-clés.
 * @param {string} text
 * @param {string[]} keywords
 * @returns {boolean}
 */
function containsAny(text, keywords) {
  const n = normalizeForMatch(text);
  return keywords.some((k) => n.includes(normalizeForMatch(k)));
}

/**
 * Détecte si l'aliment est un "whole food" (peu transformé, brut).
 * @param {object} food - { dishName, foodType?, items?, processingLevel? }
 * @returns {{ isWholeFood: boolean, category: string }}
 */
function detectWholeFood(food) {
  const name = (food.dishName || food.name || '').trim();
  const foodType = (food.foodType || '').toLowerCase();
  const processingLevel = (food.processingLevel || '').toLowerCase();
  const items = Array.isArray(food.items) ? food.items : [];
  const itemNames = items.map((i) => (i && i.name) || '').join(' ');

  const searchText = `${name} ${itemNames}`.trim();

  if (containsAny(searchText, ULTRA_PROCESSED_KEYWORDS) && processingLevel.includes('ultra')) {
    return { isWholeFood: false, category: 'ultra_processed' };
  }

  if (foodType === 'single_food' || (items.length <= 1 && name)) {
    if (containsAny(searchText, HEALTHY_FAT_KEYWORDS)) return { isWholeFood: true, category: 'healthy_fat' };
    if (containsAny(searchText, FRUIT_KEYWORDS)) return { isWholeFood: true, category: 'fruit' };
    if (containsAny(searchText, VEGETABLE_KEYWORDS)) return { isWholeFood: true, category: 'vegetable' };
    if (containsAny(searchText, WHOLE_PROTEIN_KEYWORDS)) return { isWholeFood: true, category: 'protein' };
    if (containsAny(searchText, WHOLE_GRAIN_KEYWORDS)) return { isWholeFood: true, category: 'grain_legume' };
  }

  if (processingLevel === 'minimal' || processingLevel === 'low') {
    return { isWholeFood: true, category: 'minimal_processing' };
  }

  if (processingLevel === 'ultra' || processingLevel === 'high') {
    return { isWholeFood: false, category: 'processed' };
  }

  return { isWholeFood: false, category: 'unknown' };
}

/**
 * Sous-scores (0–1 ou facteurs) pour le calcul du health score.
 * @param {object} f - Données alimentaires normalisées
 * @returns {object}
 */
function computeSubScores(f) {
  const calories = Number(f.estimatedCalories) || 0;
  const proteinG = Number(f.proteinG) || 0;
  const carbsG = Number(f.carbsG) || 0;
  const fatG = Number(f.fatG) || 0;
  const fiberG = Number(f.estimatedFiberG) || 0;
  const addedSugarG = Number(f.addedSugarEstimate) || 0;
  const naturalSugarG = Number(f.naturalSugarEstimate) || 0;
  const { isWholeFood, category } = detectWholeFood(f);
  const processingLevel = (f.processingLevel || '').toLowerCase();
  const foodType = (f.foodType || 'single_food').toLowerCase();

  const totalG = proteinG + carbsG + fatG || 1;
  const calorieDensity = totalG > 0 ? calories / totalG : 0;

  // Processing: minimal = bon, ultra = mauvais
  let processingScore = 0.7;
  if (processingLevel === 'minimal') processingScore = 1;
  else if (processingLevel === 'low') processingScore = 0.9;
  else if (processingLevel === 'moderate') processingScore = 0.6;
  else if (processingLevel === 'high') processingScore = 0.35;
  else if (processingLevel === 'ultra') processingScore = 0.15;

  // Nutrient density: fibres, protéines, pas trop de calories vides
  const fiberScore = Math.min(1, fiberG / 8);
  const proteinRatio = proteinG / Math.max(totalG, 1);
  const proteinSupportScore = Math.min(1, proteinRatio * 5);
  const calorieBalanceScore = calorieDensity <= 2.5 ? 1 : calorieDensity <= 3.5 ? 0.8 : calorieDensity <= 4.5 ? 0.6 : 0.4;
  const nutrientDensityScore = (fiberScore * 0.3 + (1 - addedSugarG / Math.max(carbsG, 1)) * 0.4 + calorieBalanceScore * 0.3);

  // Sucre ajouté: pénalité
  const addedSugarPenalty = Math.min(1, addedSugarG / 25);
  const naturalSugarPenalty = 0;

  // Qualité des lipides: avocat, noix pas pénalisés
  let fatQualityScore = 1;
  if (fatG > 15 && !containsAny((f.dishName || f.name || '').toLowerCase(), HEALTHY_FAT_KEYWORDS)) {
    fatQualityScore = 0.85 - (fatG - 15) * 0.01;
  }
  fatQualityScore = Math.max(0.5, Math.min(1, fatQualityScore));

  // Whole food bonus (socle minimum pour fruits/légumes)
  let wholeFoodBonus = 0;
  if (category === 'fruit' || category === 'vegetable') wholeFoodBonus = 2.5;
  else if (category === 'protein' || category === 'grain_legume' || category === 'healthy_fat') wholeFoodBonus = 1.5;
  else if (isWholeFood) wholeFoodBonus = 1;

  // Ultra-processed penalty
  let ultraProcessedPenalty = 0;
  if (processingLevel === 'ultra' || category === 'ultra_processed') ultraProcessedPenalty = -2;

  return {
    processingScore,
    nutrientDensityScore,
    fiberScore,
    addedSugarPenalty,
    naturalSugarPenalty,
    proteinSupportScore,
    fatQualityScore,
    calorieBalanceScore,
    wholeFoodBonus,
    ultraProcessedPenalty,
    isWholeFood,
    category,
  };
}

/**
 * Calcule le score santé sur 10 et les raisons.
 * @param {object} foodAnalysis - Données normalisées (dishName, foodType, macros, estimatedFiberG, etc.)
 * @returns {{ healthScore: number, healthScoreDisplay: number, healthScoreReasoning: string[] }}
 */
function computeHealthScore(foodAnalysis) {
  const f = foodAnalysis || {};
  const sub = computeSubScores(f);

  let score = 5;
  score += sub.processingScore * 1.5;
  score += sub.nutrientDensityScore * 1.2;
  score += sub.fiberScore * 0.8;
  score -= sub.addedSugarPenalty * 1.2;
  score += sub.proteinSupportScore * 0.5;
  score += sub.fatQualityScore * 0.3;
  score += sub.wholeFoodBonus;
  score += sub.ultraProcessedPenalty;

  score = Math.max(0, Math.min(10, score));

  const reasoning = buildHealthScoreReasoning(f, sub, score);
  const display = Math.round(score * 10) / 10;
  const displayInt = Math.max(0, Math.min(10, Math.round(score)));

  return {
    healthScore: display,
    healthScoreDisplay: displayInt,
    healthScoreReasoning: reasoning,
  };
}

/**
 * Construit les libellés d'explication du score.
 * @param {object} f
 * @param {object} sub
 * @param {number} score
 * @returns {string[]}
 */
function buildHealthScoreReasoning(f, sub, score) {
  const reasons = [];
  const name = (f.dishName || f.name || '').toLowerCase();

  if (sub.category === 'fruit') {
    reasons.push('Fruit entier peu transformé');
    reasons.push('Sucre naturellement présent, non ajouté');
    if ((f.estimatedFiberG || 0) > 2) reasons.push('Bonne présence de fibres');
    reasons.push('Faible densité calorique');
  } else if (sub.category === 'vegetable') {
    reasons.push('Légume brut peu transformé');
    reasons.push('Bonne densité nutritionnelle');
    if ((f.estimatedFiberG || 0) > 1) reasons.push('Apport en fibres');
  } else if (sub.category === 'protein') {
    reasons.push('Source de protéines de qualité');
    if ((f.proteinG || 0) >= 15) reasons.push('Riche en protéines');
  } else if (sub.category === 'healthy_fat') {
    reasons.push('Lipides de bonne qualité (acides gras insaturés)');
    reasons.push('Aliment nutritif');
  } else if (sub.category === 'grain_legume') {
    reasons.push('Féculent ou légumineuse peu transformé(e)');
    if ((f.estimatedFiberG || 0) > 2) reasons.push('Apport en fibres');
  } else if (sub.isWholeFood) {
    reasons.push('Aliment brut peu transformé');
    if ((f.estimatedFiberG || 0) > 1) reasons.push('Présence de fibres');
  }

  if (sub.category === 'ultra_processed' || sub.processingScore < 0.4) {
    reasons.push('Produit très transformé');
    if ((f.addedSugarEstimate || 0) > 10) reasons.push('Présence probable de sucres ajoutés');
  }

  if ((f.estimatedFiberG || 0) >= 3 && !reasons.some((r) => r.includes('fibre')) && reasons.length < 4) {
    reasons.push('Bonne présence de fibres');
  }
  if ((f.proteinG || 0) >= 20 && !reasons.some((r) => r.includes('protéine'))) {
    reasons.push('Riche en protéines');
  }
  if (score >= 7 && reasons.length === 0) {
    reasons.push('Profil nutritionnel équilibré');
  }
  if (reasons.length === 0) {
    reasons.push('Estimation basée sur l\'analyse du plat');
  }

  return reasons.slice(0, 5);
}

module.exports = {
  detectWholeFood,
  computeHealthScore,
  computeSubScores,
  buildHealthScoreReasoning,
  FRUIT_KEYWORDS,
  VEGETABLE_KEYWORDS,
  WHOLE_PROTEIN_KEYWORDS,
  ULTRA_PROCESSED_KEYWORDS,
};
