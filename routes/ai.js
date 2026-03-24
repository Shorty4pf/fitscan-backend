/**
 * Routes API pour l'analyse IA (scan food, scan label, scan barcode).
 * Toutes les images sont reçues en multipart/form-data.
 * La normalisation scan-food est inline pour garantir le fonctionnement en déploiement.
 */

const express = require('express');
const multer = require('multer');
const { sendError } = require('../utils/errors');
const { sendScanFoodSuccess, sendScanLabelSuccess, sanitizeDishDescription } = require('../utils/response');
const { prepareImageForOpenAI } = require('../utils/image');
const { analyzeFoodImage, analyzeNutritionLabelImage, fixFoodScanResult, getClient } = require('../services/openai');
const { lookupBarcode } = require('../services/barcode');

// --- Normalisation scan-food inline (indépendante du module nutrition pour fiabilité déploiement) ---
// Fruits uniquement (pas de légumes ici pour éviter mauvaise catégorisation)
const FRUIT_KEYWORDS = ['pomme', 'banane', 'orange', 'poire', 'kiwi', 'raisin', 'fraise', 'framboise', 'cerise', 'mangue', 'ananas', 'citron', 'fruit', 'fruits'];
const VEGETABLE_KEYWORDS = ['brocoli', 'carotte', 'tomate', 'concombre', 'salade', 'légume', 'légumes', 'épinard', 'courgette', 'poivron', 'aubergine', 'chou', 'haricot vert'];
const HEALTHY_FAT_KEYWORDS = ['avocat', 'noix', 'amande', 'noisette'];
const PROTEIN_KEYWORDS = ['poulet', 'dinde', 'œuf', 'oeuf', 'saumon', 'thon', 'tofu', 'skyr', 'yaourt nature', 'yogourt'];
const GRAIN_KEYWORDS = ['riz', 'quinoa', 'avoine', 'flocon', 'patate', 'lentille', 'pois chiche', 'flocons'];
const ULTRA_KEYWORDS = ['biscuit', 'gâteau', 'viennoiserie', 'soda', 'chips', 'burger', 'pizza', 'barre chocolat', 'bonbon', 'donut', 'nutella', 'céréale sucrée'];
const FOOD_TYPES = ['single_food', 'multi_ingredient_meal', 'packaged_product'];
const PROCESSING = ['minimal', 'low', 'moderate', 'high', 'ultra'];

function _norm(s) {
  if (!s || typeof s !== 'string') return '';
  return s.toLowerCase().normalize('NFD').replace(/\u0300-\u036f/g, '').trim();
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
  if (_contains(text, ULTRA_KEYWORDS) && (lvl.includes('ultra') || lvl.includes('high'))) return { category: 'ultra_processed', isWhole: false };
  if (_contains(text, HEALTHY_FAT_KEYWORDS)) return { category: 'healthy_fat', isWhole: true };
  if (_contains(text, FRUIT_KEYWORDS)) return { category: 'fruit', isWhole: true };
  if (_contains(text, VEGETABLE_KEYWORDS)) return { category: 'vegetable', isWhole: true };
  if (_contains(text, PROTEIN_KEYWORDS)) return { category: 'protein', isWhole: true };
  if (_contains(text, GRAIN_KEYWORDS)) return { category: 'grain_legume', isWhole: true };
  if (lvl === 'minimal' || lvl === 'low') return { category: 'minimal', isWhole: true };
  if (lvl === 'ultra' || lvl === 'high') return { category: 'processed', isWhole: false };
  return { category: 'unknown', isWhole: false };
}
function _safeRound(v, d) {
  if (v == null || Number.isNaN(Number(v))) return 0;
  const f = 10 ** (d || 0);
  return Math.round(Number(v) * f) / f;
}
function _toNum(v) { const n = Number(v); return (Number.isNaN(n) || n < 0) ? 0 : _safeRound(n, 0); }
function _toPrecise(v) { const n = Number(v); return (Number.isNaN(n) || n < 0) ? 0 : _safeRound(n, 2); }
function _toConf(v) { const n = Number(v); return Number.isNaN(n) ? 0 : Math.max(0, Math.min(1, n)); }
function _toDisp(v) { const n = Number(v); if (Number.isNaN(n) || n < 0) return 0; return n < 0.5 ? 0 : Math.round(n); }
function _foodType(v) { const t = (v || '').toString().toLowerCase().trim(); return FOOD_TYPES.includes(t) ? t : 'single_food'; }
function _procLvl(v) { const t = (v || '').toString().toLowerCase().trim(); return PROCESSING.includes(t) ? t : 'moderate'; }

function _healthScore(f) {
  const { category, isWhole } = _wholeCategory(f);
  const lvl = (f.processingLevel || '').toLowerCase();
  const fiberG = Number(f.estimatedFiberG) || 0;
  const addedS = Number(f.addedSugarEstimate) || 0;
  const proteinG = Number(f.proteinG) || 0;
  let score = 5;
  if (lvl === 'minimal') score += 1.5; else if (lvl === 'low') score += 1.2; else if (lvl === 'ultra' || lvl === 'high') score -= 2;
  if (category === 'fruit' || category === 'vegetable') score += 2.5; else if (category === 'protein' || category === 'grain_legume' || category === 'healthy_fat') score += 1.5; else if (isWhole) score += 1;
  score += Math.min(0.8, fiberG / 10);
  score -= Math.min(1.2, addedS / 25);
  score = Math.max(0, Math.min(10, score));
  if (category === 'fruit' || category === 'vegetable') score = Math.max(score, 6);
  if (category === 'healthy_fat') score = Math.max(score, 5.5);
  const displayInt = Math.max(0, Math.min(10, Math.round(score)));
  const reasons = [];
  if (category === 'fruit') { reasons.push('Fruit entier peu transformé'); reasons.push('Sucre naturellement présent'); if (fiberG > 2) reasons.push('Bonne présence de fibres'); }
  else if (category === 'vegetable') { reasons.push('Légume brut peu transformé'); if (fiberG > 1) reasons.push('Apport en fibres'); }
  else if (category === 'protein') { reasons.push('Source de protéines de qualité'); if (proteinG >= 15) reasons.push('Riche en protéines'); }
  else if (category === 'healthy_fat') reasons.push('Lipides de bonne qualité');
  else if (category === 'ultra_processed' || lvl === 'ultra') { reasons.push('Produit très transformé'); if (addedS > 10) reasons.push('Sucres ajoutés probables'); }
  if (reasons.length === 0) reasons.push('Estimation basée sur l\'analyse du plat');
  return { healthScore: _safeRound(score, 1), healthScoreDisplay: displayInt, healthScoreReasoning: reasons.slice(0, 5) };
}
function normalizeFoodScanResultInline(raw) {
  const empty = { dishName: '', name: '', dishDescription: '', foodType: 'single_food', estimatedCalories: 0, proteinG: 0, carbsG: 0, fatG: 0, displayProteinG: 0, displayCarbsG: 0, displayFatG: 0, estimatedFiberG: 0, naturalSugarEstimate: 0, addedSugarEstimate: 0, processingLevel: 'moderate', confidence: 0, items: [], notes: [], healthScore: 5, healthScoreDisplay: 5, healthScoreReasoning: [] };
  if (!raw || typeof raw !== 'object') return empty;
  try {
    const items = Array.isArray(raw.items) ? raw.items.filter((i) => i && i.name).map((i) => ({ name: String(i.name).trim(), grams: _toNum(i.grams) })) : [];
    const notes = Array.isArray(raw.notes) ? raw.notes.filter((n) => typeof n === 'string' && n.trim()).map((s) => s.trim()) : [];
    const dishName = (raw.dishName && String(raw.dishName).trim()) || '';
    const dishDescription = sanitizeDishDescription(raw, dishName, items);
    const proteinG = _toPrecise(raw.proteinG);
    const carbsG = _toPrecise(raw.carbsG);
    const fatG = _toPrecise(raw.fatG);
    const normalized = { dishName, name: dishName, dishDescription, foodType: _foodType(raw.foodType), estimatedCalories: _toNum(raw.estimatedCalories), proteinG, carbsG, fatG, displayProteinG: _toDisp(proteinG), displayCarbsG: _toDisp(carbsG), displayFatG: _toDisp(fatG), estimatedFiberG: _toPrecise(raw.estimatedFiberG), naturalSugarEstimate: _toPrecise(raw.naturalSugarEstimate), addedSugarEstimate: _toPrecise(raw.addedSugarEstimate), processingLevel: _procLvl(raw.processingLevel), confidence: _safeRound(_toConf(raw.confidence), 2), items, notes };
    const h = _healthScore(normalized);
    normalized.healthScore = h.healthScore;
    normalized.healthScoreDisplay = h.healthScoreDisplay;
    normalized.healthScoreReasoning = h.healthScoreReasoning || [];
    const { category, isWhole } = _wholeCategory(normalized);
    console.log('[health-score]', JSON.stringify({ dishName: normalized.dishName, category, isWhole, processingLevel: normalized.processingLevel, healthScore: normalized.healthScore, healthScoreDisplay: normalized.healthScoreDisplay, reasons: normalized.healthScoreReasoning?.length }));
    return normalized;
  } catch (e) {
    const dn = (raw.dishName && String(raw.dishName).trim()) || '';
    return { ...empty, dishName: dn, name: dn, dishDescription: sanitizeDishDescription(raw, dn, []), estimatedCalories: _toNum(raw.estimatedCalories), proteinG: _toPrecise(raw.proteinG), carbsG: _toPrecise(raw.carbsG), fatG: _toPrecise(raw.fatG), displayProteinG: _toDisp(raw.proteinG), displayCarbsG: _toDisp(raw.carbsG), displayFatG: _toDisp(raw.fatG), confidence: _safeRound(_toConf(raw.confidence), 2), items: [], notes: [] };
  }
}

function getNutrition() {
  if (typeof global.__fitscanNutrition === 'object' && global.__fitscanNutrition !== null) {
    return global.__fitscanNutrition;
  }
  return require('../services/nutrition');
}

const router = express.Router();

// Diagnostic : vérifier que le module nutrition est chargé (pour debug déploiement)
router.get('/ready', (req, res) => {
  try {
    const nutrition = getNutrition();
    const hasNorm = typeof nutrition.normalizeFoodScanResult === 'function';
    const body = { ok: true, nutrition: hasNorm };
    if (!hasNorm) {
      body.hasGlobal = typeof global.__fitscanNutrition !== 'undefined';
      body.nutritionKeys = nutrition && typeof nutrition === 'object' ? Object.keys(nutrition) : (nutrition === undefined ? 'undefined' : typeof nutrition);
    }
    res.status(200).json(body);
  } catch (e) {
    res.status(200).json({ ok: true, nutrition: false, loadError: (e && e.message) || 'unknown' });
  }
});

const { MAX_SIZE_BYTES, ALLOWED_MIME_TYPES } = require('../utils/image');

// Multer : stockage en mémoire, validation taille et type
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE_BYTES },
  fileFilter: (req, file, cb) => {
    const mime = (file.mimetype || '').toLowerCase();
    if (ALLOWED_MIME_TYPES.includes(mime)) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  },
});

// Gestion des erreurs Multer (taille, type) → invalid_image
function handleMulterError(err, req, res, next) {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return sendError(res, 400, 'invalid_image');
  }
  if (err && err.code === 'LIMIT_UNEXPECTED_FILE') {
    return sendError(res, 400, 'invalid_image');
  }
  if (err) {
    return sendError(res, 400, 'invalid_image');
  }
  next();
}

/**
 * POST /ai/scan-food
 * Body: multipart/form-data, champ "image"
 * Réponse: JSON structuré (dishName, estimatedCalories, proteinG, carbsG, fatG, confidence, items, notes).
 */
router.post('/scan-food', (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      handleMulterError(err, req, res, next);
      return;
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) {
      return sendError(res, 400, 'invalid_image');
    }
    const prepared = prepareImageForOpenAI(req.file);
    if (!prepared.valid) {
      return sendError(res, 400, prepared.error ?? 'invalid_image');
    }

    if (!getClient()) {
      console.error('[ai] OPENAI_API_KEY manquante');
      return sendError(res, 503, 'missing_api_key');
    }

    const result = await analyzeFoodImage(prepared.dataUrl);
    if (!result.ok) {
      const status = result.error === 'missing_api_key' ? 503 : 502;
      return sendError(res, status, result.error ?? 'ai_failed');
    }

    const raw = result.data != null ? result.data : {};
    const normalized = normalizeFoodScanResultInline(raw);
    sendScanFoodSuccess(res, normalized);
  } catch (err) {
    console.error('[ai] scan-food error:', err?.message ?? err);
    if (err?.stack) console.error('[ai] stack:', err.stack);
    return sendError(res, 500, 'internal_error');
  }
});

/**
 * POST /ai/fix-scan-food
 * Body: JSON { currentResult: { ... }, instruction?: string }
 * Réutilise le même format de réponse que scan-food (dont dishDescription).
 */
router.post('/fix-scan-food', async (req, res) => {
  try {
    const currentResult = req.body?.currentResult;
    if (!currentResult || typeof currentResult !== 'object' || Array.isArray(currentResult)) {
      return sendError(res, 400, 'invalid_body');
    }

    if (!getClient()) {
      console.error('[ai] OPENAI_API_KEY manquante');
      return sendError(res, 503, 'missing_api_key');
    }

    const instruction = typeof req.body?.instruction === 'string' ? req.body.instruction.trim() : '';
    const result = await fixFoodScanResult(currentResult, instruction);
    if (!result.ok) {
      const status = result.error === 'missing_api_key' ? 503 : 502;
      return sendError(res, status, result.error ?? 'ai_failed');
    }

    const raw = result.data != null ? result.data : {};
    const normalized = normalizeFoodScanResultInline(raw);
    sendScanFoodSuccess(res, normalized);
  } catch (err) {
    console.error('[ai] fix-scan-food error:', err?.message ?? err);
    if (err?.stack) console.error('[ai] stack:', err.stack);
    return sendError(res, 500, 'internal_error');
  }
});

/**
 * POST /ai/scan-label
 * Body: multipart/form-data, champ "image"
 */
router.post('/scan-label', (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      handleMulterError(err, req, res, next);
      return;
    }
    next();
  });
}, async (req, res) => {
  try {
    const prepared = prepareImageForOpenAI(req.file);
    if (!prepared.valid) {
      return sendError(res, 400, prepared.error);
    }

    if (!getClient()) {
      console.error('[ai] OPENAI_API_KEY manquante');
      return sendError(res, 503, 'missing_api_key');
    }

    const result = await analyzeNutritionLabelImage(prepared.dataUrl);
    if (!result.ok) {
      return sendError(res, 502, result.error);
    }

    const raw = result.data != null ? result.data : {};
    const normalized = getNutrition().normalizeLabelScanResult(raw);
    sendScanLabelSuccess(res, normalized);
  } catch (err) {
    console.error('[ai] scan-label error:', err?.message ?? err);
    sendError(res, 500, 'internal_error');
  }
});

/**
 * POST /ai/scan-barcode
 * Body: JSON { "barcode": "3017620422003" }
 * Recherche via Open Food Facts, retourne name, calories, protein, carbs, fats.
 */
router.post('/scan-barcode', async (req, res) => {
  try {
    const barcode = typeof req.body?.barcode === 'string' ? req.body.barcode.trim() : '';
    if (!barcode) {
      return sendError(res, 400, 'invalid_barcode');
    }
    const result = await lookupBarcode(barcode);
    if (!result.ok) {
      const status = result.error === 'invalid_barcode' ? 400 : 404;
      return res.status(status).json({
        success: false,
        mode: 'scan_barcode',
        error: result.error,
      });
    }
    const body = {
      success: true,
      mode: 'scan_barcode',
      name: result.data.name,
      calories: result.data.calories,
      protein: result.data.protein,
      carbs: result.data.carbs,
      fats: result.data.fats,
      servingSize: result.data.servingSize ?? null,
    };
    const img = result.data.image_url ?? result.data.imageUrl ?? result.data.image_front_url;
    if (img) {
      body.image_url = img;
      body.imageUrl = img;
      body.image_front_url = img;
    }
    res.status(200).json(body);
  } catch (err) {
    console.error('[ai] scan-barcode error:', err?.message ?? err);
    sendError(res, 500, 'internal_error');
  }
});

router.normalizeFoodScanResultInline = normalizeFoodScanResultInline;
module.exports = router;
