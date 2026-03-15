/**
 * Validation et préparation des images pour l'API OpenAI.
 * Vérifications : présence du fichier, type MIME, taille min/max, image exploitable.
 */

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const MIN_SIZE_BYTES = 50; // fichier non vide, image exploitable
// JPEG et PNG uniquement : OpenAI Vision ne supporte pas HEIC. L'app iOS doit envoyer du JPEG (ex. jpegData).
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
];

/**
 * Vérifie que le fichier uploadé existe (multer a bien reçu un fichier).
 * @param {object} file - Fichier multer (req.file)
 * @returns {{ valid: boolean, error?: string }}
 */
function validateFileExists(file) {
  if (!file || !file.buffer) {
    return { valid: false, error: 'invalid_image' };
  }
  return { valid: true };
}

/**
 * Vérifie le type MIME du fichier.
 * @param {string} mimeType - Type MIME (ex: image/jpeg)
 * @returns {{ valid: boolean, error?: string }}
 */
function validateMimeType(mimeType) {
  if (!mimeType || !ALLOWED_MIME_TYPES.includes(mimeType.toLowerCase())) {
    return { valid: false, error: 'invalid_image' };
  }
  return { valid: true };
}

/**
 * Vérifie que la taille du fichier est dans une plage exploitable (min/max).
 * @param {number} size - Taille en octets
 * @returns {{ valid: boolean, error?: string }}
 */
function validateSize(size) {
  if (typeof size !== 'number' || Number.isNaN(size)) {
    return { valid: false, error: 'invalid_image' };
  }
  if (size < MIN_SIZE_BYTES || size > MAX_SIZE_BYTES) {
    return { valid: false, error: 'invalid_image' };
  }
  return { valid: true };
}

/**
 * Effectue toutes les validations sur un fichier multer.
 * @param {object} file - req.file (multer)
 * @returns {{ valid: boolean, error?: string }}
 */
function validateImageFile(file) {
  const exists = validateFileExists(file);
  if (!exists.valid) return exists;

  const mime = validateMimeType(file.mimetype);
  if (!mime.valid) return mime;

  const size = validateSize(file.size);
  if (!size.valid) return size;

  return { valid: true };
}

/**
 * Convertit un buffer en base64 pour l'envoi à l'API OpenAI.
 * @param {Buffer} buffer - Contenu du fichier
 * @param {string} mimeType - Type MIME (ex: image/jpeg)
 * @returns {string} - Data URL base64
 */
function toBase64DataUrl(buffer, mimeType) {
  const base64 = buffer.toString('base64');
  const normalizedMime = mimeType.toLowerCase();
  return `data:${normalizedMime};base64,${base64}`;
}

/**
 * Prépare l'image pour OpenAI : validation + conversion base64.
 * @param {object} file - req.file (multer)
 * @returns {{ valid: boolean, dataUrl?: string, error?: string }}
 */
function prepareImageForOpenAI(file) {
  const validation = validateImageFile(file);
  if (!validation.valid) {
    return { valid: false, error: validation.error };
  }
  const dataUrl = toBase64DataUrl(file.buffer, file.mimetype);
  return { valid: true, dataUrl };
}

module.exports = {
  MAX_SIZE_BYTES,
  ALLOWED_MIME_TYPES,
  validateFileExists,
  validateMimeType,
  validateSize,
  validateImageFile,
  toBase64DataUrl,
  prepareImageForOpenAI,
};
