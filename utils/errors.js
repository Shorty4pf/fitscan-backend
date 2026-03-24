/**
 * Codes d'erreur stables pour l'API FitScan.
 * Utilisés par l'app iOS pour afficher des messages ou gérer les cas d'erreur.
 */

const ERROR_CODES = {
  invalid_image: 'Image manquante, format invalide ou taille dépassée',
  invalid_barcode: 'Code-barres invalide ou manquant',
  barcode_not_found: 'Produit non trouvé pour ce code-barres',
  ai_failed: 'Échec de l\'analyse par l\'IA',
  invalid_response: 'Réponse de l\'IA invalide ou illisible',
  missing_api_key: 'Clé API OpenAI non configurée',
  internal_error: 'Erreur interne du serveur',
  not_implemented_yet: 'Fonctionnalité non implémentée',
  invalid_body: 'Corps de requête JSON invalide ou incomplet',
};

/**
 * Retourne le message associé à un code d'erreur.
 * @param {string} code - Code d'erreur
 * @returns {string}
 */
function getErrorMessage(code) {
  return ERROR_CODES[code] ?? 'Erreur inconnue';
}

/**
 * Envoie une réponse JSON d'erreur au client.
 * @param {object} res - Objet response Express
 * @param {number} status - Code HTTP
 * @param {string} errorCode - Code d'erreur (ex: invalid_image)
 */
function sendError(res, status, errorCode) {
  res.status(status).json({
    success: false,
    error: errorCode,
  });
}

module.exports = {
  ERROR_CODES,
  getErrorMessage,
  sendError,
};
