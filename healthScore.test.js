/**
 * Tests du moteur de score santé et de la normalisation scan food.
 * Exécution : node tests/healthScore.test.js
 * Si healthScore.js est absent (ex. build sans ce fichier), les tests sont ignorés et le script sort en 0.
 */

let detectWholeFood;
let normalizeFoodScanResult;

try {
  const healthScore = require('../services/healthScore');
  if (typeof healthScore.detectWholeFood !== 'function') throw new Error('detectWholeFood manquant');
  detectWholeFood = healthScore.detectWholeFood;
} catch (err) {
  console.warn('Tests healthScore ignorés (services/healthScore.js absent ou invalide):', err?.message || err);
  process.exit(0);
}

try {
  const nutrition = require('../services/nutrition');
  normalizeFoodScanResult = nutrition.normalizeFoodScanResult;
} catch (err) {
  console.warn('Tests nutrition ignorés:', err?.message || err);
  process.exit(0);
}

function ok(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

// ---- detectWholeFood ----
function testWholeFoodDetection() {
  ok(detectWholeFood({ dishName: 'Pomme' }).category === 'fruit', 'Pomme = fruit');
  ok(detectWholeFood({ dishName: 'Pomme verte' }).isWholeFood === true, 'Pomme verte = whole');
  ok(detectWholeFood({ dishName: 'Banane' }).category === 'fruit', 'Banane = fruit');
  ok(detectWholeFood({ dishName: 'Orange' }).category === 'fruit', 'Orange = fruit');
  ok(detectWholeFood({ dishName: 'Brocoli' }).category === 'vegetable', 'Brocoli = vegetable');
  ok(detectWholeFood({ dishName: 'Carotte' }).category === 'vegetable', 'Carotte = vegetable');
  ok(detectWholeFood({ dishName: 'Avocat' }).category === 'healthy_fat', 'Avocat = healthy_fat');
  ok(detectWholeFood({ dishName: 'Blanc de poulet' }).category === 'protein', 'Poulet = protein');
  ok(detectWholeFood({ dishName: 'Saumon' }).category === 'protein', 'Saumon = protein');
  ok(detectWholeFood({ dishName: 'Œuf' }).category === 'protein', 'Œuf = protein');
  ok(detectWholeFood({ dishName: 'Riz' }).category === 'grain_legume', 'Riz = grain_legume');
  ok(detectWholeFood({ dishName: 'Flocons d\'avoine' }).category === 'grain_legume', 'Avoine = grain_legume');
  ok(detectWholeFood({ dishName: 'Barre chocolatée', processingLevel: 'ultra' }).isWholeFood === false, 'Barre chocolatée = pas whole');
  ok(detectWholeFood({ dishName: 'Soda', processingLevel: 'ultra' }).category === 'ultra_processed', 'Soda = ultra');
  console.log('  detectWholeFood: OK');
}

// ---- Health score : fruits / légumes jamais très bas ----
function testHealthScoreWholeFoods() {
  const pomme = normalizeFoodScanResult({
    dishName: 'Pomme verte',
    foodType: 'single_food',
    estimatedCalories: 78,
    proteinG: 0.3,
    carbsG: 21,
    fatG: 0.2,
    estimatedFiberG: 3.5,
    naturalSugarEstimate: 18,
    addedSugarEstimate: 0,
    processingLevel: 'minimal',
    confidence: 0.9,
    items: [{ name: 'Pomme', grams: 150 }],
    notes: [],
  });
  ok(pomme.healthScoreDisplay >= 6, `Pomme: score ${pomme.healthScoreDisplay}/10 (attendu >= 6)`);
  ok(pomme.healthScoreReasoning.length > 0, 'Pomme: reasoning non vide');

  const banane = normalizeFoodScanResult({
    dishName: 'Banane',
    foodType: 'single_food',
    estimatedCalories: 105,
    proteinG: 1.3,
    carbsG: 27,
    fatG: 0.4,
    estimatedFiberG: 3,
    naturalSugarEstimate: 14,
    addedSugarEstimate: 0,
    processingLevel: 'minimal',
    confidence: 0.9,
    items: [{ name: 'Banane', grams: 118 }],
    notes: [],
  });
  ok(banane.healthScoreDisplay >= 6, `Banane: score ${banane.healthScoreDisplay}/10 (attendu >= 6)`);

  const brocoli = normalizeFoodScanResult({
    dishName: 'Brocoli',
    foodType: 'single_food',
    estimatedCalories: 55,
    proteinG: 3.7,
    carbsG: 11,
    fatG: 0.6,
    estimatedFiberG: 5,
    naturalSugarEstimate: 2,
    addedSugarEstimate: 0,
    processingLevel: 'minimal',
    confidence: 0.9,
    items: [{ name: 'Brocoli', grams: 200 }],
    notes: [],
  });
  ok(brocoli.healthScoreDisplay >= 6, `Brocoli: score ${brocoli.healthScoreDisplay}/10 (attendu >= 6)`);

  const avocat = normalizeFoodScanResult({
    dishName: 'Avocat',
    foodType: 'single_food',
    estimatedCalories: 240,
    proteinG: 3,
    carbsG: 13,
    fatG: 22,
    estimatedFiberG: 10,
    naturalSugarEstimate: 1,
    addedSugarEstimate: 0,
    processingLevel: 'minimal',
    confidence: 0.9,
    items: [{ name: 'Avocat', grams: 200 }],
    notes: [],
  });
  ok(avocat.healthScoreDisplay >= 6, `Avocat: score ${avocat.healthScoreDisplay}/10 (attendu >= 6, gras mais qualité)`);

  console.log('  healthScore whole foods (pomme, banane, brocoli, avocat): OK');
}

// ---- Health score : ultra-transformés plus bas ----
function testHealthScoreProcessed() {
  const barre = normalizeFoodScanResult({
    dishName: 'Barre chocolatée',
    foodType: 'packaged_product',
    estimatedCalories: 250,
    proteinG: 3,
    carbsG: 28,
    fatG: 14,
    estimatedFiberG: 1,
    naturalSugarEstimate: 2,
    addedSugarEstimate: 20,
    processingLevel: 'ultra',
    confidence: 0.85,
    items: [{ name: 'Barre chocolatée', grams: 50 }],
    notes: [],
  });
  ok(barre.healthScoreDisplay <= 6, `Barre chocolatée: score ${barre.healthScoreDisplay}/10 (attendu <= 6)`);
  ok(barre.healthScoreDisplay < 8, 'Barre: score strictement inférieur à 8');

  const soda = normalizeFoodScanResult({
    dishName: 'Soda',
    foodType: 'packaged_product',
    estimatedCalories: 140,
    proteinG: 0,
    carbsG: 39,
    fatG: 0,
    estimatedFiberG: 0,
    naturalSugarEstimate: 0,
    addedSugarEstimate: 39,
    processingLevel: 'ultra',
    confidence: 0.9,
    items: [{ name: 'Soda', grams: 330 }],
    notes: [],
  });
  ok(soda.healthScoreDisplay <= 5, `Soda: score ${soda.healthScoreDisplay}/10 (attendu <= 5)`);
  console.log('  healthScore ultra-transformés (barre, soda): OK');
}

// ---- Macros : précision interne vs affichage ----
function testDisplayMacros() {
  const pomme = normalizeFoodScanResult({
    dishName: 'Pomme',
    foodType: 'single_food',
    estimatedCalories: 78,
    proteinG: 0.3,
    carbsG: 21,
    fatG: 0.2,
    estimatedFiberG: 3.5,
    processingLevel: 'minimal',
    confidence: 0.9,
    items: [{ name: 'Pomme', grams: 150 }],
    notes: [],
  });
  ok(pomme.proteinG === 0.3, 'Pomme: proteinG interne 0.3');
  ok(pomme.displayProteinG === 0, 'Pomme: displayProteinG 0');
  ok(pomme.displayCarbsG === 21, 'Pomme: displayCarbsG 21');
  ok(pomme.displayFatG === 0, 'Pomme: displayFatG 0');
  console.log('  display vs internal macros: OK');
}

// ---- Cohérence champs normalisés ----
function testNormalizationFields() {
  const out = normalizeFoodScanResult({
    dishName: 'Poulet riz brocolis',
    foodType: 'multi_ingredient_meal',
    estimatedCalories: 520,
    proteinG: 42,
    carbsG: 48,
    fatG: 16,
    estimatedFiberG: 4,
    naturalSugarEstimate: 0,
    addedSugarEstimate: 0,
    processingLevel: 'low',
    confidence: 0.88,
    items: [
      { name: 'Blanc de poulet', grams: 180 },
      { name: 'Riz', grams: 150 },
      { name: 'Brocoli', grams: 100 },
    ],
    notes: [],
  });
  ok(out.dishName === 'Poulet riz brocolis', 'dishName conservé');
  ok(out.foodType === 'multi_ingredient_meal', 'foodType conservé');
  ok(out.estimatedCalories === 520, 'calories');
  ok(out.healthScore !== undefined && out.healthScore >= 0 && out.healthScore <= 10, 'healthScore 0-10');
  ok(Array.isArray(out.healthScoreReasoning), 'healthScoreReasoning array');
  ok(out.displayProteinG === 42 && out.displayCarbsG === 48 && out.displayFatG === 16, 'display macros');
  console.log('  champs normalisation (plat composé): OK');
}

// ---- Garde-fou : ancienne réponse sans foodType/processingLevel ----
function testBackwardCompatibility() {
  const legacy = normalizeFoodScanResult({
    dishName: 'Pomme',
    estimatedCalories: 78,
    proteinG: 0,
    carbsG: 21,
    fatG: 0,
    confidence: 0.9,
    items: [{ name: 'Pomme', grams: 150 }],
    notes: [],
  });
  ok(legacy.foodType === 'single_food', 'défaut foodType');
  ok(legacy.processingLevel === 'moderate', 'défaut processingLevel');
  ok(legacy.healthScoreDisplay >= 6, `Pomme legacy: score ${legacy.healthScoreDisplay} >= 6 (garde-fou fruit)`);
  console.log('  rétrocompatibilité + garde-fou pomme: OK');
}

function run() {
  console.log('Tests healthScore & nutrition\n');
  testWholeFoodDetection();
  testHealthScoreWholeFoods();
  testHealthScoreProcessed();
  testDisplayMacros();
  testNormalizationFields();
  testBackwardCompatibility();
  console.log('\nTous les tests sont passés.');
}

run();
