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
const { normalizeFoodScanResult, normalizeLabelScanResult } = require('../services/nutrition');
const { lookupBarcode } = require('../services/barcode');

const router = express.Router();

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

    const normalized = normalizeFoodScanResult(result.data);
    sendScanFoodSuccess(res, normalized);
  } catch (err) {
    console.error('[ai] scan-food error:', err?.message ?? err);
    if (err?.stack) console.error('[ai] stack:', err.stack);
    sendError(res, 500, 'internal_error');
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

    const normalized = normalizeLabelScanResult(result.data);
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
