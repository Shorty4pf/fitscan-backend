# Prompt à envoyer au backend – Scan Food (POST /ai/scan-food)

Copie ce document et envoie-le à l’équipe backend pour qu’elle sache exactement ce que l’app iOS envoie et ce qu’elle attend en retour.

---

## 1. Endpoint

- **URL :** `POST {baseURL}/ai/scan-food`
- **Base URL :** `https://fitscan-program-backend-production.up.railway.app`
- **URL complète :** `https://fitscan-program-backend-production.up.railway.app/ai/scan-food`

---

## 2. Requête envoyée par l’app iOS

### Méthode et headers

```
POST /ai/scan-food HTTP/1.1
Host: fitscan-program-backend-production.up.railway.app
Content-Type: multipart/form-data; boundary=ScanAPI-{UUID}
```

- **Content-Type :** `multipart/form-data` avec une boundary aléatoire (ex. `ScanAPI-A1B2C3D4-E5F6-7890-ABCD-EF1234567890`).
- **Timeout côté app :** 60 secondes.

### Corps (body)

Le corps est en **multipart/form-data** avec **un seul champ** :

| Champ | Type | Obligatoire | Description |
|-------|------|-------------|-------------|
| `image` | fichier | Oui | Photo du plat en JPEG |

**Format exact du champ :**

```
--{boundary}\r\n
Content-Disposition: form-data; name="image"; filename="image.jpg"\r\n
Content-Type: image/jpeg\r\n
\r\n
{bytes JPEG}\r\n
--{boundary}--\r\n
```

- **Nom du champ :** `image` (obligatoire).
- **Nom du fichier :** `image.jpg`.
- **Content-Type du fichier :** `image/jpeg`.
- **Format image :** JPEG uniquement (pas de HEIC). L’app convertit systématiquement en JPEG avec une qualité de 0.8 avant envoi.

---

## 3. Réponse attendue par l’app

### Succès (HTTP 200 + `success: true`)

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

| Champ | Type | Obligatoire | Description |
|-------|------|-------------|-------------|
| `success` | boolean | Oui | `true` pour succès |
| `mode` | string | Optionnel | ex. `"scan_food"` |
| `dishName` | string | Recommandé | Nom du plat |
| `estimatedCalories` | int | Oui | Calories (kcal) |
| `proteinG` | int | Oui | Protéines (g) |
| `carbsG` | int | Oui | Glucides (g) |
| `fatG` | int | Oui | Lipides (g) |
| `confidence` | double | Optionnel | 0–1 |
| `items` | array | Optionnel | Liste `{ name: string, grams?: int }` |
| `notes` | array | Optionnel | Liste de strings |

### Erreur (HTTP 4xx/5xx ou HTTP 200 + `success: false`)

Toujours un JSON avec :

```json
{
  "success": false,
  "error": "<code>"
}
```

**Codes d’erreur attendus par l’app :**

| Code | Signification |
|------|---------------|
| `invalid_image` | Image invalide ou format non supporté |
| `ai_failed` | Échec de l’analyse IA |
| `invalid_response` | Réponse IA illisible |
| `missing_api_key` | Clé API manquante côté backend |
| `internal_error` | Erreur interne serveur |

L’app affiche un message utilisateur selon le code (pas de stack technique).

---

## 4. Récap pour le backend

1. **Accepter :** `POST /ai/scan-food` avec `multipart/form-data`, champ `image` (fichier JPEG).
2. **Refuser :** HEIC et autres formats non JPEG/PNG si non supportés.
3. **Répondre :** JSON structuré avec `success`, `dishName`, `estimatedCalories`, `proteinG`, `carbsG`, `fatG`, etc.
4. **En cas d’erreur :** JSON avec `success: false` et `error` contenant l’un des codes ci-dessus.
