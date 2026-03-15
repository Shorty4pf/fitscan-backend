/**
 * Service OpenAI pour l'analyse d'images (nourriture, étiquettes).
 * La clé API est lue uniquement côté serveur, jamais exposée au client.
 */

const OpenAI = require('openai');

const OPENAI_TIMEOUT_MS = 60_000;

const FOOD_SCAN_SYSTEM_PROMPT = `Tu es l'assistant nutritionnel de l'app FitScan. Tu analyses une photo et renvoies UNIQUEMENT un objet JSON valide, sans texte avant ou après, sans markdown.

RÔLE
- Déterminer le type : un seul aliment (single_food), un plat composé (multi_ingredient_meal), ou un produit emballé (packaged_product).
- Donner un nom court (dishName), les macros en grammes (valeurs précises possibles, ex. 0.3 pour protéines d'une pomme).
- Estimer les fibres (estimatedFiberG) pour fruits, légumes, céréales, légumineuses.
- Différencier sucre naturel (naturalSugarEstimate) et sucre ajouté (addedSugarEstimate) en grammes.
- Indiquer le niveau de transformation : minimal, low, moderate, high, ultra.

RÈGLES NUTRITIONNELLES
- estimatedCalories : entier (kcal). proteinG, carbsG, fatG : nombres (décimaux acceptés pour précision, ex. 0.3, 20.5).
- Pour une pomme ~150 g : ~78 kcal, proteinG 0.3, carbsG 21, fatG 0.2, estimatedFiberG 3.5, naturalSugarEstimate 18, addedSugarEstimate 0, processingLevel "minimal".
- Pour un fruit/légume entier : processingLevel "minimal" ou "low", estimatedFiberG > 0, addedSugarEstimate 0 sauf si produit transformé.
- Pour un plat composé : somme des composants, processingLevel selon le plus transformé.
- Pour biscuits, soda, viennoiserie : processingLevel "ultra", addedSugarEstimate renseigné.

STRUCTURE JSON OBLIGATOIRE :
{
  "dishName": "Nom du plat ou aliment",
  "foodType": "single_food",
  "estimatedCalories": 0,
  "proteinG": 0,
  "carbsG": 0,
  "fatG": 0,
  "estimatedFiberG": 0,
  "naturalSugarEstimate": 0,
  "addedSugarEstimate": 0,
  "processingLevel": "minimal",
  "confidence": 0.0,
  "items": [{ "name": "Nom", "grams": 0 }],
  "notes": []
}

- foodType : "single_food" | "multi_ingredient_meal" | "packaged_product"
- processingLevel : "minimal" | "low" | "moderate" | "high" | "ultra"
- estimatedFiberG, naturalSugarEstimate, addedSugarEstimate : nombres (0 si inconnu)
- confidence : 0 à 1

EXEMPLES (format uniquement) :

Pomme : {"dishName":"Pomme verte","foodType":"single_food","estimatedCalories":78,"proteinG":0.3,"carbsG":21,"fatG":0.2,"estimatedFiberG":3.5,"naturalSugarEstimate":18,"addedSugarEstimate":0,"processingLevel":"minimal","confidence":0.92,"items":[{"name":"Pomme","grams":150}],"notes":[]}

Avocat : {"dishName":"Avocat","foodType":"single_food","estimatedCalories":240,"proteinG":3,"carbsG":13,"fatG":22,"estimatedFiberG":10,"naturalSugarEstimate":1,"addedSugarEstimate":0,"processingLevel":"minimal","confidence":0.9,"items":[{"name":"Avocat","grams":200}],"notes":[]}

Barre chocolatée : {"dishName":"Barre chocolatée","foodType":"packaged_product","estimatedCalories":250,"proteinG":3,"carbsG":28,"fatG":14,"estimatedFiberG":1,"naturalSugarEstimate":2,"addedSugarEstimate":20,"processingLevel":"ultra","confidence":0.88,"items":[{"name":"Barre chocolatée","grams":50}],"notes":[]}

Réponds uniquement par ce JSON.`;

const LABEL_SCAN_SYSTEM_PROMPT = `Tu es un assistant qui lit les étiquettes nutritionnelles sur des photos.

Tu dois répondre UNIQUEMENT avec un objet JSON valide, sans texte avant ou après.
Pas d'explication, pas de markdown, pas de \`\`\`json\`\`\`.

Structure stricte attendue :
{
  "productName": "Nom du produit (string)",
  "servingSize": "Portion indiquée (ex: 100 g, 1 pot)",
  "calories": nombre,
  "proteinG": nombre,
  "carbsG": nombre,
  "fatG": nombre,
  "confidence": nombre entre 0 et 1
}

Règles :
- Lis les valeurs visibles sur l'étiquette (tableau nutritionnel).
- Si une valeur n'est pas lisible, mets 0 ou une chaîne vide selon le type.
- confidence : 0 à 1 selon la lisibilité de l'étiquette.
- Réponds uniquement avec ce JSON, rien d'autre.`;

/**
 * Extrait un objet JSON d'une réponse qui peut contenir du texte autour.
 * @param {string} text - Réponse brute
 * @returns {object|null}
 */
function extractJsonFromResponse(text) {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();
  // Déjà un JSON pur
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;
  const candidate = trimmed.slice(first, last + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

/**
 * Crée un client OpenAI (clé lue depuis process.env).
 * Timeout 60s pour éviter les blocages.
 * @returns {OpenAI|null}
 */
function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    return null;
  }
  return new OpenAI({
    apiKey: apiKey.trim(),
    timeout: OPENAI_TIMEOUT_MS,
  });
}

/**
 * Analyse une photo de nourriture et retourne un objet structuré.
 * @param {string} imageDataUrl - Image en data URL (base64)
 * @returns {Promise<{ok: true, data: object}|{ok: false, error: 'ai_failed'|'invalid_response'|'missing_api_key'}>}
 */
async function analyzeFoodImage(imageDataUrl) {
  const client = getClient();
  if (!client) return { ok: false, error: 'missing_api_key' };

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: FOOD_SCAN_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: imageDataUrl },
            },
          ],
        },
      ],
      max_tokens: 1024,
    });

    const content = response?.choices?.[0]?.message?.content;
    if (!content) {
      console.error('[openai] analyzeFoodImage: pas de content dans la réponse');
      return { ok: false, error: 'ai_failed' };
    }

    const parsed = extractJsonFromResponse(content);
    if (!parsed) {
      console.error('[openai] analyzeFoodImage: JSON invalide. Début de la réponse:', content.slice(0, 400));
      return { ok: false, error: 'invalid_response' };
    }
    return { ok: true, data: parsed };
  } catch (err) {
    console.error('[openai] analyzeFoodImage error:', err?.message ?? err);
    if (err?.status) console.error('[openai] status:', err.status);
    if (err?.error) console.error('[openai] error body:', JSON.stringify(err.error).slice(0, 500));
    return { ok: false, error: 'ai_failed' };
  }
}

/**
 * Analyse une photo d'étiquette nutritionnelle.
 * @param {string} imageDataUrl - Image en data URL (base64)
 * @returns {Promise<{ok: true, data: object}|{ok: false, error: 'ai_failed'|'invalid_response'}>}
 */
async function analyzeNutritionLabelImage(imageDataUrl) {
  const client = getClient();
  if (!client) return { ok: false, error: 'ai_failed' };

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: LABEL_SCAN_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: imageDataUrl },
            },
          ],
        },
      ],
      max_tokens: 512,
    });

    const content = response?.choices?.[0]?.message?.content;
    if (!content) return { ok: false, error: 'ai_failed' };

    const parsed = extractJsonFromResponse(content);
    if (!parsed) return { ok: false, error: 'invalid_response' };
    return { ok: true, data: parsed };
  } catch (err) {
    console.error('[openai] analyzeNutritionLabelImage error:', err?.message ?? err);
    return { ok: false, error: 'ai_failed' };
  }
}

module.exports = {
  getClient,
  extractJsonFromResponse,
  analyzeFoodImage,
  analyzeNutritionLabelImage,
};
