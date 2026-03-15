/**
 * Endpoint unifié pour le scan nutrition (spec app iOS).
 * POST /nutrition/scan : image et/ou barcode → réponse { name, calories, protein, carbs, fats }.
 */

const express = require('express');
const { detectWholeFood, computeHealthScore } = require('../services/healthScore');
const multer = require('multer');
const { sendError } = require('../utils/errors');
const {
  sendNutritionScanSuccess,
  sendNutritionScanError,
  toJournalFormat,
} = require('../utils/response');
const { prepareImageForOpenAI } = require('../utils/image');
const { analyzeFoodImage, analyzeNutritionLabelImage, getClient } = require('../services/openai');
const { normalizeFoodScanResult, normalizeLabelScanResult } = require('../services/nutrition');
const { lookupBarcode } = require('../services/barcode');

const router = express.Router();
const { MAX_SIZE_BYTES, ALLOWED_MIME_TYPES } = require('../utils/image');

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

function handleMulterError(err, req, res, next) {
  if (err) {
    return sendNutritionScanError(res, 400, 'invalid_image', 'Image manquante ou format non supporté.');
  }
  next();
}

/**
 * POST /nutrition/scan
 * Body: multipart/form-data
 *   - image (optionnel) : fichier image (plat ou étiquette)
 *   - barcode (optionnel) : string (ex. 3017620422003)
 *   - type (optionnel) : "food" | "label" — si image envoyée, type d'analyse (défaut: "food")
 * Au moins un de image ou barcode doit être présent.
 * Réponse: { success, name, calories, protein, carbs, fats } pour le journal.
 */
router.post('/scan', (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      handleMulterError(err, req, res, next);
      return;
    }
    next();
  });
}, async (req, res) => {
  const hasImage = req.file && req.file.buffer;
  const barcode = typeof req.body?.barcode === 'string' ? req.body.barcode.trim() : '';
  const hasBarcode = barcode.length > 0;
  const scanType = (req.body?.type === 'label') ? 'label' : 'food';

  if (!hasImage && !hasBarcode) {
    return sendNutritionScanError(res, 400, 'missing_input', 'Envoyez une image et/ou un code-barres.');
  }

  try {
    // Priorité image si présente
    if (hasImage) {
      const prepared = prepareImageForOpenAI(req.file);
      if (!prepared.valid) {
        return sendNutritionScanError(res, 400, 'invalid_image', 'Image invalide ou trop volumineuse.');
      }
      if (!getClient()) {
        return sendNutritionScanError(res, 503, 'missing_api_key', 'Service temporairement indisponible.');
      }

      if (scanType === 'label') {
        const result = await analyzeNutritionLabelImage(prepared.dataUrl);
        if (!result.ok) {
          return sendNutritionScanError(res, 502, result.error, 'Lecture de l\'étiquette impossible. Réessayez.');
        }
        const normalized = normalizeLabelScanResult(result.data);
        const journal = toJournalFormat(normalized, 'scan_label');
        return sendNutritionScanSuccess(res, journal);
      }

      const result = await analyzeFoodImage(prepared.dataUrl);
      if (!result.ok) {
        return sendNutritionScanError(res, 502, result.error, 'Analyse du plat impossible. Réessayez.');
      }
      const normalized = normalizeFoodScanResult(result.data);
      const journal = toJournalFormat(normalized, 'scan_food');
      return sendNutritionScanSuccess(res, journal);
    }

    // Barcode seul : recherche Open Food Facts
    const result = await lookupBarcode(barcode);
    if (!result.ok) {
      const message = result.error === 'invalid_barcode'
        ? 'Code-barres invalide.'
        : result.error === 'timeout'
          ? 'Recherche expirée. Réessayez.'
          : 'Produit non trouvé. Vous pouvez l\'ajouter au journal sans macros.';
      return res.status(result.error === 'invalid_barcode' ? 400 : 404).json({
        success: false,
        error: result.error,
        message,
        name: '',
        calories: 0,
        protein: 0,
        carbs: 0,
        fats: 0,
      });
    }
    return sendNutritionScanSuccess(res, result.data);
  } catch (err) {
    console.error('[nutrition] scan error:', err?.message ?? err);
    sendNutritionScanError(res, 500, 'internal_error', 'Une erreur est survenue. Réessayez.');
  }
});

/**
 * POST /nutrition/scan/barcode
 * Endpoint utilisé par l’app iOS (NutritionScanAPI.swift). Corps : { "barcode": "..." } uniquement.
 * Réponse 200 : { success, name, calories, protein, carbs, fats, servingSize?, image_url?, imageUrl?, image_front_url? }
 *   — image_url / imageUrl / image_front_url : URL de l’image produit (Open Food Facts) si disponible ; l’app affiche l’image via resolvedImageUrl = image_url ?? imageUrl ?? image_front_url.
 * Réponse 400/404 : code-barres invalide ou produit non trouvé. L’app (NutritionScanAPI) peut en 404 faire un fallback vers Open Food Facts direct.
 */
router.post('/scan/barcode', async (req, res) => {
  try {
    const barcode = typeof req.body?.barcode === 'string' ? req.body.barcode.trim() : '';
    if (!barcode) {
      return res.status(400).json({
        success: false,
        error: 'invalid_barcode',
        message: 'Code-barres manquant.',
        name: '',
        calories: 0,
        protein: 0,
        carbs: 0,
        fats: 0,
      });
    }

    const result = await lookupBarcode(barcode);
    if (!result.ok) {
      const errorCode = result.error === 'invalid_barcode' ? 'invalid_barcode' : 'not_found';
      const status = result.error === 'invalid_barcode' ? 400 : 404;
      return res.status(status).json({
        success: false,
        error: errorCode,
        name: '',
        calories: 0,
        protein: 0,
        carbs: 0,
        fats: 0,
      });
    }

    return sendNutritionScanSuccess(res, result.data);
  } catch (err) {
    console.error('[nutrition] scan/barcode error:', err?.message ?? err);
    res.status(500).json({
      success: false,
      error: 'internal_error',
      name: '',
      calories: 0,
      protein: 0,
      carbs: 0,
      fats: 0,
    });
  }
});

module.exports = router;
