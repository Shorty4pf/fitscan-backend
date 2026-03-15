/**
 * Service OpenAI pour l'analyse d'images (nourriture, étiquettes).
 * La clé API est lue uniquement côté serveur, jamais exposée au client.
 */

const OpenAI = require('openai');

const OPENAI_TIMEOUT_MS = 60_000;

const FOOD_SCAN_SYSTEM_PROMPT = `Tu es l'assistant nutritionnel de l'app FitScan. Tu analyses une photo envoyée par l'utilisateur et tu renvoies UNIQUEMENT un objet JSON valide, sans aucun texte avant ou après, sans markdown (\`\`\`), sans explication.

RÔLE
- Identifier ce qui est visible : un seul aliment (ex. pomme, yaourt) ou un plat composé (ex. poulet riz brocolis).
- Donner un nom court et clair pour l'affichage dans l'app (dishName).
- Estimer les quantités en grammes et les valeurs nutritionnelles pour l'ensemble du contenu visible.

RÈGLES NUTRITIONNELLES
- estimatedCalories : nombre entier (kcal) pour l'ensemble du plat/portion visible.
- proteinG, carbsG, fatG : nombres entiers (grammes) pour l'ensemble. Cohérents avec les calories (environ 4 kcal/g protéines et glucides, 9 kcal/g lipides).
- Pour un seul aliment (ex. une pomme ~150 g) : environ 80 kcal, 0 g protéines, 20 g glucides, 0 g lipides.
- Pour un plat (ex. poulet + riz + légumes) : somme réaliste des composants.

STRUCTURE JSON OBLIGATOIRE (respecte exactement ces noms de champs pour le décodage Codable côté iOS) :
{
  "dishName": "Nom du plat ou de l'aliment",
  "estimatedCalories": 0,
  "proteinG": 0,
  "carbsG": 0,
  "fatG": 0,
  "confidence": 0.0,
  "items": [
    { "name": "Nom de l'aliment", "grams": 0 }
  ],
  "notes": []
}

- dishName : string. Un seul nom court (ex. "Pomme", "Poulet riz brocolis", "Salade César").
- estimatedCalories, proteinG, carbsG, fatG : entiers. Jamais négatifs.
- confidence : nombre entre 0 et 1 (ex. 0.92). Plus l'image est claire et reconnaissable, plus la confiance est haute.
- items : tableau. Chaque élément a "name" (string) et "grams" (nombre). Un aliment = une entrée. Pour un seul aliment, un seul item.
- notes : tableau de strings. Optionnel : "Estimation basée sur l'image", ou vide [].

EXEMPLES DE RÉPONSES VALIDES (format uniquement, adapte les valeurs à la photo) :

Un seul aliment (ex. une pomme) :
{"dishName":"Pomme","estimatedCalories":78,"proteinG":0,"carbsG":21,"fatG":0,"confidence":0.9,"items":[{"name":"Pomme","grams":150}],"notes":["Estimation basée sur l'image"]}

Plat composé :
{"dishName":"Poulet riz brocolis","estimatedCalories":520,"proteinG":42,"carbsG":48,"fatG":16,"confidence":0.88,"items":[{"name":"Blanc de poulet","grams":180},{"name":"Riz","grams":150},{"name":"Brocoli","grams":100}],"notes":[]}

Réponds uniquement par ce JSON, rien d'autre.`;

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
