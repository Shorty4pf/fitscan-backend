/**
 * Tests du score santé sur la logique INLINE (celle réellement utilisée en prod dans routes/ai.js).
 * Exécution : node tests/healthScoreInline.test.js
 */

const aiRoutes = require('../routes/ai');
const norm = aiRoutes.normalizeFoodScanResultInline;

function ok(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function test(name, raw, assertions) {
  const out = norm(raw);
  assertions(out, name);
}

console.log('Tests health-score INLINE (flux production)\n');

test('pomme', {
  dishName: 'Pomme',
  foodType: 'single_food',
  estimatedCalories: 78,
  proteinG: 0.3,
  carbsG: 21,
  fatG: 0.2,
  estimatedFiberG: 3.5,
  naturalSugarEstimate: 18,
  addedSugarEstimate: 0,
  processingLevel: 'minimal',
  items: [{ name: 'Pomme', grams: 150 }],
  notes: [],
}, (out, name) => {
  ok(out.healthScoreDisplay >= 6, `${name}: score ${out.healthScoreDisplay}/10 (attendu >= 6)`);
  ok(out.healthScore >= 6, `${name}: healthScore décimal >= 6`);
  console.log(`  ${name}: score ${out.healthScoreDisplay}/10 (${out.healthScore}) - OK`);
});

test('banane', {
  dishName: 'Banane',
  foodType: 'single_food',
  estimatedCalories: 105,
  proteinG: 1.3,
  carbsG: 27,
  fatG: 0.4,
  estimatedFiberG: 3,
  addedSugarEstimate: 0,
  processingLevel: 'minimal',
  items: [{ name: 'Banane', grams: 118 }],
  notes: [],
}, (out, name) => {
  ok(out.healthScoreDisplay >= 6, `${name}: score ${out.healthScoreDisplay}/10 (attendu >= 6)`);
  console.log(`  ${name}: score ${out.healthScoreDisplay}/10 - OK`);
});

test('brocoli', {
  dishName: 'Brocoli',
  foodType: 'single_food',
  estimatedCalories: 55,
  proteinG: 3.7,
  carbsG: 11,
  fatG: 0.6,
  estimatedFiberG: 5,
  addedSugarEstimate: 0,
  processingLevel: 'minimal',
  items: [{ name: 'Brocoli', grams: 200 }],
  notes: [],
}, (out, name) => {
  ok(out.healthScoreDisplay >= 6, `${name}: score ${out.healthScoreDisplay}/10 (attendu >= 6)`);
  console.log(`  ${name}: score ${out.healthScoreDisplay}/10 - OK`);
});

test('avocat', {
  dishName: 'Avocat',
  foodType: 'single_food',
  estimatedCalories: 240,
  proteinG: 3,
  carbsG: 13,
  fatG: 22,
  estimatedFiberG: 10,
  addedSugarEstimate: 0,
  processingLevel: 'minimal',
  items: [{ name: 'Avocat', grams: 200 }],
  notes: [],
}, (out, name) => {
  ok(out.healthScoreDisplay >= 5, `${name}: score ${out.healthScoreDisplay}/10 (attendu >= 5)`);
  console.log(`  ${name}: score ${out.healthScoreDisplay}/10 - OK`);
});

test('saumon', {
  dishName: 'Saumon',
  foodType: 'single_food',
  estimatedCalories: 280,
  proteinG: 39,
  carbsG: 0,
  fatG: 12,
  estimatedFiberG: 0,
  addedSugarEstimate: 0,
  processingLevel: 'minimal',
  items: [{ name: 'Saumon', grams: 200 }],
  notes: [],
}, (out, name) => {
  ok(out.healthScoreDisplay >= 5, `${name}: score ${out.healthScoreDisplay}/10 (attendu >= 5)`);
  console.log(`  ${name}: score ${out.healthScoreDisplay}/10 - OK`);
});

test('flocons d\'avoine', {
  dishName: 'Flocons d\'avoine',
  foodType: 'single_food',
  estimatedCalories: 150,
  proteinG: 5,
  carbsG: 27,
  fatG: 3,
  estimatedFiberG: 4,
  addedSugarEstimate: 0,
  processingLevel: 'low',
  items: [{ name: 'Avoine', grams: 40 }],
  notes: [],
}, (out, name) => {
  ok(out.healthScoreDisplay >= 5, `${name}: score ${out.healthScoreDisplay}/10 (attendu >= 5)`);
  console.log(`  ${name}: score ${out.healthScoreDisplay}/10 - OK`);
});

test('yaourt nature', {
  dishName: 'Yaourt nature',
  foodType: 'single_food',
  estimatedCalories: 90,
  proteinG: 5,
  carbsG: 10,
  fatG: 3,
  estimatedFiberG: 0,
  addedSugarEstimate: 0,
  processingLevel: 'low',
  items: [{ name: 'Yaourt nature', grams: 125 }],
  notes: [],
}, (out, name) => {
  ok(out.healthScoreDisplay >= 5, `${name}: score ${out.healthScoreDisplay}/10 (attendu >= 5)`);
  console.log(`  ${name}: score ${out.healthScoreDisplay}/10 - OK`);
});

test('soda', {
  dishName: 'Soda',
  foodType: 'packaged_product',
  estimatedCalories: 140,
  proteinG: 0,
  carbsG: 39,
  fatG: 0,
  estimatedFiberG: 0,
  addedSugarEstimate: 39,
  processingLevel: 'ultra',
  items: [{ name: 'Soda', grams: 330 }],
  notes: [],
}, (out, name) => {
  ok(out.healthScoreDisplay <= 5, `${name}: score ${out.healthScoreDisplay}/10 (attendu <= 5)`);
  console.log(`  ${name}: score ${out.healthScoreDisplay}/10 - OK`);
});

test('chips', {
  dishName: 'Chips',
  foodType: 'packaged_product',
  estimatedCalories: 530,
  proteinG: 6,
  carbsG: 50,
  fatG: 34,
  estimatedFiberG: 4,
  addedSugarEstimate: 1,
  processingLevel: 'ultra',
  items: [{ name: 'Chips', grams: 100 }],
  notes: [],
}, (out, name) => {
  ok(out.healthScoreDisplay <= 6, `${name}: score ${out.healthScoreDisplay}/10 (attendu <= 6)`);
  console.log(`  ${name}: score ${out.healthScoreDisplay}/10 - OK`);
});

test('barre chocolatée', {
  dishName: 'Barre chocolatée',
  foodType: 'packaged_product',
  estimatedCalories: 250,
  proteinG: 3,
  carbsG: 28,
  fatG: 14,
  estimatedFiberG: 1,
  addedSugarEstimate: 20,
  processingLevel: 'ultra',
  items: [{ name: 'Barre chocolatée', grams: 50 }],
  notes: [],
}, (out, name) => {
  ok(out.healthScoreDisplay <= 6, `${name}: score ${out.healthScoreDisplay}/10 (attendu <= 6)`);
  console.log(`  ${name}: score ${out.healthScoreDisplay}/10 - OK`);
});

test('orange', {
  dishName: 'Orange',
  foodType: 'single_food',
  estimatedCalories: 62,
  proteinG: 1.2,
  carbsG: 15,
  fatG: 0.2,
  estimatedFiberG: 3,
  addedSugarEstimate: 0,
  processingLevel: 'minimal',
  items: [{ name: 'Orange', grams: 130 }],
  notes: [],
}, (out, name) => {
  ok(out.healthScoreDisplay >= 6, `${name}: score ${out.healthScoreDisplay}/10 (attendu >= 6)`);
  console.log(`  ${name}: score ${out.healthScoreDisplay}/10 - OK`);
});

test('kiwi', {
  dishName: 'Kiwi',
  foodType: 'single_food',
  estimatedCalories: 61,
  proteinG: 1.1,
  carbsG: 15,
  fatG: 0.5,
  estimatedFiberG: 3,
  addedSugarEstimate: 0,
  processingLevel: 'minimal',
  items: [{ name: 'Kiwi', grams: 75 }],
  notes: [],
}, (out, name) => {
  ok(out.healthScoreDisplay >= 6, `${name}: score ${out.healthScoreDisplay}/10 (attendu >= 6)`);
  console.log(`  ${name}: score ${out.healthScoreDisplay}/10 - OK`);
});

test('carotte', {
  dishName: 'Carotte',
  foodType: 'single_food',
  estimatedCalories: 41,
  proteinG: 0.9,
  carbsG: 10,
  fatG: 0.2,
  estimatedFiberG: 2.8,
  addedSugarEstimate: 0,
  processingLevel: 'minimal',
  items: [{ name: 'Carotte', grams: 120 }],
  notes: [],
}, (out, name) => {
  ok(out.healthScoreDisplay >= 6, `${name}: score ${out.healthScoreDisplay}/10 (attendu >= 6)`);
  console.log(`  ${name}: score ${out.healthScoreDisplay}/10 - OK`);
});

console.log('\nTous les tests INLINE sont passés.');
