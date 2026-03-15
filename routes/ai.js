/**
 * Routes API pour l'analyse IA (scan food, scan label, scan barcode).
 * Toutes les images sont reçues en multipart/form-data.
 */

const express = require('express');
const multer = require('multer');
const { sendError } = require('../utils/errors');
const { sendScanFoodSuccess, sendScanLabelSuccess } = require('../utils/response');
const { prepareImageForOpenAI } = require('../utils/image');
const { analyzeFoodImage, analyzeNutritionLabelImage, getClient } = require('../services/openai');
const { lookupBarcode } = require('../services/barcode');

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
    if (!hasNorm && nutrition && typeof nutrition === 'object') {
      body.nutritionKeys = Object.keys(nutrition).filter((k) => typeof nutrition[k] === 'function').slice(0, 20);
      body.hasGlobal = typeof global.__fitscanNutrition !== 'undefined';
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
    const nutrition = getNutrition();
    const normFn = nutrition && nutrition.normalizeFoodScanResult;
    let normalized;
    if (typeof normFn === 'function') {
      try {
        normalized = normFn(raw);
      } catch (normErr) {
        console.error('[ai] scan-food normalizeFoodScanResult error:', normErr?.message ?? normErr);
        if (normErr?.stack) console.error('[ai] stack:', normErr.stack);
        return sendError(res, 500, 'internal_error');
      }
    } else {
      // Fallback si le module nutrition est incomplet (déploiement / cache)
      const n = (v) => (typeof v === 'number' && !Number.isNaN(v) && v >= 0 ? v : 0);
      normalized = {
        dishName: (raw.dishName && String(raw.dishName).trim()) || '',
        name: (raw.dishName && String(raw.dishName).trim()) || '',
        foodType: 'single_food',
        estimatedCalories: Math.round(n(Number(raw.estimatedCalories))),
        proteinG: n(Number(raw.proteinG)),
        carbsG: n(Number(raw.carbsG)),
        fatG: n(Number(raw.fatG)),
        displayProteinG: Math.round(n(Number(raw.proteinG))),
        displayCarbsG: Math.round(n(Number(raw.carbsG))),
        displayFatG: Math.round(n(Number(raw.fatG))),
        estimatedFiberG: n(Number(raw.estimatedFiberG)),
        processingLevel: (raw.processingLevel && String(raw.processingLevel).toLowerCase()) || 'moderate',
        healthScore: 5,
        healthScoreDisplay: 5,
        healthScoreReasoning: [],
        confidence: Math.min(1, Math.max(0, Number(raw.confidence) || 0)),
        items: Array.isArray(raw.items) ? raw.items.filter((i) => i && i.name).map((i) => ({ name: String(i.name), grams: Math.max(0, Number(i.grams) || 0) })) : [],
        notes: Array.isArray(raw.notes) ? raw.notes.filter((n) => typeof n === 'string').map((s) => s.trim()) : [],
      };
    }
    sendScanFoodSuccess(res, normalized);
  } catch (err) {
    console.error('[ai] scan-food error:', err?.message ?? err);
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

module.exports = router;
