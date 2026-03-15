/**
 * Helpers pour formater les réponses JSON de l'API de manière cohérente.
 * Format journal : name, calories, protein, carbs, fats (pour FoodScanBackendResult côté app).
 */

/**
 * Construit l'objet journal attendu par l'app (name, calories, protein, carbs, fats).
 * @param {object} data - Données normalisées (food ou label)
 * @param {'scan_food'|'scan_label'} mode
 * @returns {{ name: string, calories: number, protein: number, carbs: number, fats: number }}
 */
function toJournalFormat(data, mode) {
  const name = mode === 'scan_food'
    ? (data.dishName ?? '')
    : (data.productName ?? '');
  const calories = mode === 'scan_food'
    ? (data.estimatedCalories ?? 0)
    : (data.calories ?? 0);
  const protein = data.proteinG ?? 0;
  const carbs = data.carbsG ?? 0;
  const fats = data.fatG ?? 0;
  return {
    name: name || 'Sans nom',
    calories: Number(calories),
    protein: Number(protein),
    carbs: Number(carbs),
    fats: Number(fats),
  };
}

/**
 * Envoie une réponse succès pour scan-food.
 * Inclut : valeurs précises (proteinG, carbsG, fatG), valeurs affichage (display*),
 * score santé (healthScore, healthScoreDisplay, healthScoreReasoning), foodType, processingLevel, fibres.
 */
function sendScanFoodSuccess(res, data) {
  const toInt = (v) => Math.round(Number(v) || 0);
  const items = (data.items ?? []).map((i) => ({
    name: (i && i.name != null) ? String(i.name) : '',
    grams: toInt(i && i.grams),
  })).filter((i) => i.name !== '');
  const body = {
    success: true,
    mode: 'scan_food',
    dishName: data.dishName ?? '',
    name: data.name ?? data.dishName ?? '',
    foodType: data.foodType ?? 'single_food',
    estimatedCalories: toInt(data.estimatedCalories),
    proteinG: toInt(data.displayProteinG ?? data.proteinG),
    carbsG: toInt(data.displayCarbsG ?? data.carbsG),
    fatG: toInt(data.displayFatG ?? data.fatG),
    displayProteinG: toInt(data.displayProteinG ?? data.proteinG),
    displayCarbsG: toInt(data.displayCarbsG ?? data.carbsG),
    displayFatG: toInt(data.displayFatG ?? data.fatG),
    estimatedFiberG: Number(data.estimatedFiberG) || 0,
    processingLevel: data.processingLevel ?? 'moderate',
    healthScore: Number(data.healthScore) || 5,
    healthScoreDisplay: toInt(data.healthScoreDisplay ?? data.healthScore),
    healthScoreReasoning: Array.isArray(data.healthScoreReasoning) ? data.healthScoreReasoning : [],
    confidence: Number(data.confidence) || 0,
    items,
    notes: Array.isArray(data.notes) ? data.notes : [],
  };
  res.status(200).json(body);
}

/**
 * Envoie une réponse succès pour scan-label.
 * Inclut le format journal (name, calories, protein, carbs, fats) pour l'app.
 */
function sendScanLabelSuccess(res, data) {
  const journal = toJournalFormat(data, 'scan_label');
  res.status(200).json({
    success: true,
    mode: 'scan_label',
    ...journal,
    productName: data.productName ?? null,
    servingSize: data.servingSize ?? null,
    calories: data.calories ?? null,
    proteinG: data.proteinG ?? null,
    carbsG: data.carbsG ?? null,
    fatG: data.fatG ?? null,
    confidence: data.confidence ?? null,
  });
}

/**
 * Réponse unifiée pour POST /nutrition/scan (format journal).
 * payload peut contenir optionnellement servingSize (ex. "100 g").
 */
function sendNutritionScanSuccess(res, payload) {
  const body = {
    success: true,
    name: payload.name,
    calories: payload.calories,
    protein: payload.protein,
    carbs: payload.carbs,
    fats: payload.fats,
  };
  if (payload.servingSize) {
    body.servingSize = payload.servingSize;
  }
  // URL image produit (scan code-barres) : l'app affiche l'image (image_url, imageUrl ou image_front_url)
  const img = payload.image_url ?? payload.imageUrl ?? payload.image_front_url;
  if (img) {
    body.image_url = img;
    body.imageUrl = img;
    body.image_front_url = img;
  }
  res.status(200).json(body);
}

/**
 * Erreur pour /nutrition/scan (message lisible pour l'utilisateur).
 */
function sendNutritionScanError(res, status, errorCode, message) {
  res.status(status).json({
    success: false,
    error: errorCode,
    message: message ?? null,
  });
}

module.exports = {
  toJournalFormat,
  sendScanFoodSuccess,
  sendScanLabelSuccess,
  sendNutritionScanSuccess,
  sendNutritionScanError,
};
