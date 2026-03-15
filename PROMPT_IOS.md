# Prompt à envoyer au projet iOS (FitScan)

Copie le bloc ci‑dessous et colle‑le dans le chat Cursor (ou envoie‑le au dev) quand tu travailles sur l’app iOS FitScan. Il décrit le contrat backend et ce que l’app doit faire.

---

## Début du prompt (copier à partir d’ici)

**Contexte :** L’app FitScan envoie une photo de nourriture au backend. Le backend analyse l’image avec OpenAI et renvoie un JSON avec le nom du plat, les calories, les macros et la liste des aliments. L’app doit envoyer la photo et décoder la réponse.

**Contrat backend :**

- **Endpoint :** `POST /ai/scan-food`
- **Base URL :** `https://fitscan-backend-production.up.railway.app` (ou `http://localhost:3000` en dev). La clé OpenAI reste côté backend, jamais dans l’app.
- **Body :** `multipart/form-data`, champ **`image`** (fichier). Le backend n’accepte que **JPEG ou PNG**. Sur iOS, envoyer du JPEG avec `image.jpegData(compressionQuality: 0.8)` pour éviter le HEIC qui est refusé.
- **Réponse succès (200) :** JSON de ce type (tous les champs présents, décodable en Codable) :
  ```json
  {
    "success": true,
    "mode": "scan_food",
    "dishName": "Poulet riz brocolis",
    "estimatedCalories": 450,
    "proteinG": 35,
    "carbsG": 60,
    "fatG": 10,
    "confidence": 0.92,
    "items": [
      { "name": "Poulet", "grams": 150 },
      { "name": "Riz", "grams": 120 }
    ],
    "notes": []
  }
  ```
- **Champs optionnels / fallbacks :** côté app, utiliser un nom par défaut si `dishName` est vide, et 0 pour les macros si absent. Les champs `items` (liste des aliments avec nom + grammes) et `notes` doivent être décodés et peuvent servir à afficher le détail (ex. liste des aliments détectés). L’écran résultat peut s’appuyer sur un mapping vers `FoodScanBackendResult` / `ScannedMealDisplayModel`.
- **Réponse erreur :** toujours du JSON avec `"success": false` et `"error": "<code>"`. Codes possibles : `invalid_image`, `ai_failed`, `invalid_response`, `missing_api_key`, `internal_error`. Afficher un message utilisateur selon le code, pas de stack technique.

**À faire côté iOS :**

1. **AppConfig** (ou équivalent) : URL de base `https://fitscan-backend-production.up.railway.app`, utilisée pour construire l’URL de `POST .../ai/scan-food`. Timeout conseillé : 60 s.
2. **Requête :** POST en `multipart/form-data`, champ nommé exactement **`image`**, fichier JPEG (pas HEIC). Content-Type du fichier : `image/jpeg`, filename par ex. `image.jpg`.
3. **Modèles Codable :** struct pour la réponse succès avec `success`, `mode`, `dishName`, `estimatedCalories`, `proteinG`, `carbsG`, `fatG`, `confidence`, `items` (tableau de `{ name: String, grams: Int? }`), `notes` (tableau de String). Struct pour les erreurs avec `success`, `error`.
4. **Affichage :** utiliser `dishName`, `estimatedCalories`, `proteinG`, `carbsG`, `fatG` pour l’écran résultat (ex. FoodScanBackendResult / ScannedMealDisplayModel). Afficher la liste `items` si tu veux montrer le détail des aliments détectés.

**Résumé :** L’app envoie une photo en JPEG au backend, reçoit un JSON structuré (nom du plat, kcal, protéines, glucides, lipides, confiance, liste d’items). Décoder en Codable, gérer les erreurs par code, et afficher le résultat proprement.

---

## Fin du prompt (copier jusqu’ici)
