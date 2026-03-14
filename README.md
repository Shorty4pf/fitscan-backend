# FitScan Backend

Backend Node.js/Express pour l’app iOS FitScan. Analyse des photos de nourriture et d’étiquettes via OpenAI. La clé API OpenAI reste **uniquement côté serveur**, jamais exposée à l’app.

## Prérequis

- Node.js (v18 ou plus recommandé)
- Clé API OpenAI

## Installation

```bash
npm install
```

## Variables d’environnement

Créez un fichier `.env` à la racine du projet :

```env
OPENAI_API_KEY=sk-...
PORT=3000
```

- **OPENAI_API_KEY** : obligatoire pour les routes `/ai/scan-food` et `/ai/scan-label`.
- **PORT** : port du serveur (défaut : 3000).

## Lancer le serveur

```bash
npm start
```

Ou :

```bash
node server.js
```

Au démarrage, le serveur affiche le port et la liste des routes.

## Déploiement (Docker / conteneur)

L’erreur `Impossible de trouver le module './routes/ai'` signifie que le dossier `routes/` (ou `services/`, `utils/`) n’est pas présent dans le conteneur.

- **Avec le Dockerfile fourni** : le build copie `server.js`, `routes/`, `services/`, `utils/`. Utilisez ce Dockerfile pour votre image (Railway, Render, etc.).
- **Sans Docker** (build natif) : assurez-vous que tout le repo est déployé (y compris les dossiers `routes`, `services`, `utils`) et que la commande de démarrage est bien `node server.js`.

## Tester l’API

### Healthcheck

```bash
curl http://localhost:3000/health
```

Réponse attendue : `{"ok":true}`

### Version

```bash
curl http://localhost:3000/version
```

Réponse attendue : `{"ok":true,"name":"fitscan-backend","version":"1.0.0"}`

### Scan Food (photo de plat)

Envoi d’une image en `multipart/form-data`, champ **`image`** :

**Avec curl :**

```bash
curl -X POST http://localhost:3000/ai/scan-food \
  -F "image=@/chemin/vers/photo.jpg"
```

**Avec Postman :**

1. Méthode : **POST**
2. URL : `http://localhost:3000/ai/scan-food`
3. Body → **form-data**
4. Clé : `image`, type : **File**, valeur : votre fichier image

Réponse succès (exemple) :

```json
{
  "success": true,
  "mode": "scan_food",
  "dishName": "Poulet riz brocoli",
  "estimatedCalories": 620,
  "proteinG": 42,
  "carbsG": 58,
  "fatG": 18,
  "confidence": 0.87,
  "items": [
    { "name": "Blanc de poulet", "grams": 180 },
    { "name": "Riz", "grams": 160 },
    { "name": "Brocoli", "grams": 120 }
  ],
  "notes": ["Estimation basée sur l'image"]
}
```

En cas d’erreur : `{"success":false,"error":"invalid_image"}` (ou `ai_failed`, `invalid_response`, etc.)

### Scan Label (étiquette nutritionnelle)

Même principe, route **POST** `/ai/scan-label`, champ **`image`** :

```bash
curl -X POST http://localhost:3000/ai/scan-label \
  -F "image=@/chemin/vers/etiquette.jpg"
```

### Scan Barcode (endpoint utilisé par l’app iOS)

**POST** `/nutrition/scan/barcode` — Body JSON `{ "barcode": "..." }` uniquement. Recherche via Open Food Facts.  
Réponse 200 : `{ success, name, calories, protein, carbs, fats, servingSize?, image_url?, imageUrl?, image_front_url? }`. Les champs `image_*` contiennent l’URL de l’image produit quand Open Food Facts en fournit une ; l’app les utilise pour afficher la photo (ex. `resolvedImageUrl = image_url ?? imageUrl ?? image_front_url`).  
Réponse 404 : produit non trouvé. **C’est le seul endpoint code-barres appelé par l’app** (NutritionScanAPI.swift).

### Autres routes

**POST** `/ai/scan-barcode` — Même logique que ci‑dessus mais format réponse avec `mode: "scan_barcode"`. Non utilisé par l’app actuelle.

**POST** `/nutrition/scan` — Body multipart : `image` (optionnel), `barcode` (optionnel), `type` optionnel (`food` ou `label`). Au moins un de image/barcode. Réponse succès : `{ "success": true, "name", "calories", "protein", "carbs", "fats" }` (+ champs image en cas de barcode). Erreurs : `{ "success": false, "error", "message" }`.

## Structure du projet

```
server.js           # Point d’entrée
routes/ai.js        # Routes /ai/scan-food, /ai/scan-label, /ai/scan-barcode
routes/nutrition.js # POST /nutrition/scan (unifié, format journal)
services/
  openai.js         # Appels OpenAI (vision)
  nutrition.js      # Normalisation des réponses (clamp, arrondis)
  barcode.js        # Lookup code-barres (Open Food Facts)
utils/
  image.js          # Validation image (MIME, taille, base64)
  errors.js         # Codes d’erreur et envoi des réponses d’erreur
  response.js       # Format des réponses succès (scan_food, scan_label)
```

## Contraintes images

- **Types acceptés** : `image/jpeg`, `image/jpg`, `image/png`, `image/heic`
- **Taille max** : 10 Mo

## Codes d’erreur

| Code               | Signification                          |
|--------------------|----------------------------------------|
| `invalid_image`    | Image manquante, mauvais format ou trop lourde |
| `invalid_barcode`  | Code-barres invalide ou manquant |
| `barcode_not_found`| Produit non trouvé (Open Food Facts) |
| `ai_failed`        | Échec de l’appel OpenAI                |
| `invalid_response` | Réponse OpenAI invalide                |
| `missing_api_key`  | `OPENAI_API_KEY` non configurée        |
| `internal_error`   | Erreur interne serveur                 |
| `not_implemented_yet` | Route non implémentée (ex. barcode) |

## Intégration iOS

Les réponses JSON sont pensées pour être décodées en Swift avec `Codable`. Structure stable, champs toujours présents (avec `null` ou valeurs par défaut si besoin). Pas de stack trace ni de détail technique exposé au client.

## Évolutions prévues

- Scan barcode avec base produit
- Historique / sauvegarde des scans
- Ajustements des prompts et de la normalisation selon retours terrain
