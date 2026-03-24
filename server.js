/**
 * Serveur FitScan Backend - API IA pour l'app iOS FitScan.
 * La clé OpenAI reste côté serveur, jamais exposée au client.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Service nutrition global avant routes/nutrition (évite require partiel si une chaîne touche getNutrition au chargement).
const aiRoutes = require('./routes/ai');
global.__fitscanNutrition = require('./services/nutrition');
const nutritionRoutes = require('./routes/nutrition');
const { sendError } = require('./utils/errors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// Routes
app.get('/health', (req, res) => {
  res.status(200).json({ ok: true });
});

app.get('/version', (req, res) => {
  let version = '1.0.0';
  let name = 'fitscan-backend';
  try {
    const pkgPath = path.join(__dirname, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    if (pkg.version) version = pkg.version;
    if (pkg.name) name = pkg.name;
  } catch {
    // garde les valeurs par défaut
  }
  res.status(200).json({
    ok: true,
    name,
    version,
  });
});

/** Express : router ou sous-app doit être une fonction ou avoir .handle (app.use). */
function assertMountable(label, m) {
  const ok = m != null && (typeof m === 'function' || typeof m.handle === 'function');
  if (!ok) {
    console.error('[server] FATAL:', label, 'doit exporter un Router Express (function ou handle), reçu:', m == null ? m : typeof m);
    process.exit(1);
  }
}
assertMountable('routes/ai', aiRoutes);
assertMountable('routes/nutrition', nutritionRoutes);

app.use('/ai', aiRoutes);
app.use('/nutrition', nutritionRoutes);

// 404
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'not_found' });
});

// Gestion d'erreurs globale (évite d'envoyer des stack traces au client)
app.use((err, req, res, next) => {
  console.error('[server] error:', err?.message ?? err);
  sendError(res, 500, 'internal_error');
});

app.listen(PORT, () => {
  console.log(`FitScan Backend démarré sur le port ${PORT}`);
  console.log(`  GET  /health`);
  console.log(`  GET  /ai/ready (diagnostic nutrition)`);
  console.log(`  GET  /version`);
  console.log(`  POST /ai/scan-food`);
  console.log(`  POST /ai/fix-scan-food (JSON currentResult + instruction optionnelle)`);
  console.log(`  POST /ai/scan-label`);
  console.log(`  POST /ai/scan-barcode`);
  console.log(`  POST /nutrition/scan (image et/ou barcode → name, calories, protein, carbs, fats)`);
  console.log(`  POST /nutrition/scan/barcode (JSON { barcode } → name, calories, protein, carbs, fats)`);
});
