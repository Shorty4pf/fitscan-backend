/**
 * Service OpenAI pour l'analyse d'images (nourriture, étiquettes).
 * La clé API est lue uniquement côté serveur, jamais exposée au client.
 */

const OpenAI = require('openai');

const FOOD_SCAN_SYSTEM_PROMPT = `Tu es un assistant nutritionnel. Tu analyses une photo de nourriture.

Tu dois répondre UNIQUEMENT avec un objet JSON valide, sans texte avant ou après.
Pas d'explication, pas de markdown, pas de \`\`\`json\`\`\`.

Structure stricte attendue :
{
  "dishName": "Nom du plat (string)",
  "estimatedCalories": nombre entier,
  "proteinG": nombre,
  "carbsG": nombre,
  "fatG": nombre,
  "confidence": nombre entre 0 et 1 (niveau de confiance de ton estimation),
  "items": [
    { "name": "Nom de l'aliment", "grams": nombre estimé en grammes }
  ],
  "notes": ["Note optionnelle 1", "Note 2"]
}

Règles :
- Identifie le type de plat et les aliments visibles.
- Estime les portions en grammes de manière réaliste.
- Estime les calories et les macronutriments (protéines, glucides, lipides) pour l'ensemble du plat.
- confidence : 0 à 1 selon la clarté de l'image et ta certitude.
- items : liste les aliments principaux visibles avec une estimation en grammes.
- notes : brefs commentaires si besoin (ex: "Estimation basée sur l'image").
- Réponds uniquement avec ce JSON, rien d'autre.`;

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
 * @returns {OpenAI|null}
 */
function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    return null;
  }
  return new OpenAI({ apiKey: apiKey.trim() });
}

/**
 * Analyse une photo de nourriture et retourne un objet structuré.
 * @param {string} imageDataUrl - Image en data URL (base64)
 * @returns {Promise<{ok: true, data: object}|{ok: false, error: 'ai_failed'|'invalid_response'}>}
 */
async function analyzeFoodImage(imageDataUrl) {
  const client = getClient();
  if (!client) return { ok: false, error: 'ai_failed' };

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
    if (!content) return { ok: false, error: 'ai_failed' };

    const parsed = extractJsonFromResponse(content);
    if (!parsed) return { ok: false, error: 'invalid_response' };
    return { ok: true, data: parsed };
  } catch (err) {
    console.error('[openai] analyzeFoodImage error:', err?.message ?? err);
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
