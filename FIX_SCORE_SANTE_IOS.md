# Correctif : afficher le score santé envoyé par le backend (pas un score calculé dans l’app)

## Problème

L’écran résultat affiche **Score santé 2/10** pour une pomme, alors que le backend envoie **9/10**.  
Cause : le modèle Swift ne décode pas les champs `healthScore` / `healthScoreDisplay` de la réponse, donc l’app affiche un score calculé localement (souvent à partir des macros), ce qui donne un mauvais score pour les fruits (0 g protéines → score très bas).

## Solution côté iOS

### 1. Ajouter les champs dans le struct de décodage

Dans le struct qui décode la réponse du scan food (ex. `FoodScanResponse`), **ajouter** :

```swift
struct FoodScanResponse: Codable {
    let success: Bool
    let mode: String?
    let dishName: String?
    let estimatedCalories: Int?
    let proteinG: Int?
    let carbsG: Int?
    let fatG: Int?
    let confidence: Double?
    let items: [DetectedFoodItem]?
    let notes: [String]?
    let error: String?

    // --- À ajouter : score santé envoyé par le backend ---
    let healthScore: Double?           // ex. 9.4
    let healthScoreDisplay: Int?       // ex. 9 → à afficher "9/10"
    let healthScoreReasoning: [String]?  // ex. ["Fruit entier peu transformé", "Sucre naturellement présent", ...]
}
```

### 2. Afficher le score venu du backend (et non un score calculé)

Sur l’écran résultat du scan :

- **Ne plus** calculer un score à partir des macros (protéines, glucides, lipides).
- **Afficher** la valeur renvoyée par l’API :
  - Utiliser **`healthScoreDisplay`** pour le texte du type « X/10 » (ex. `"\(healthScoreDisplay ?? 5)/10"`).
  - Si `healthScoreDisplay` est `nil`, utiliser un fallback (ex. `5`) uniquement pour l’affichage, pas un calcul local.

Exemple (à adapter à ton code) :

```swift
// Côté écran résultat
let scoreDisplay = response.healthScoreDisplay ?? 5  // 5 par défaut si absent
labelScoreSante.text = "\(scoreDisplay)/10"

// Optionnel : afficher les raisons
if let reasons = response.healthScoreReasoning, !reasons.isEmpty {
    labelReasoning.text = reasons.joined(separator: "\n")
}
```

### 3. Vérification

Après la modif, en scannant une **pomme** (ou une banane, un brocoli), l’app doit afficher un score **≥ 6/10** (souvent 8 ou 9), car le backend envoie déjà ce score pour les fruits/légumes entiers.

---

**Résumé :** le backend envoie `healthScoreDisplay: 9` pour une pomme. Il faut que le struct décode ce champ et que l’écran « Score santé » affiche **uniquement** cette valeur (avec un fallback si nil), sans recalcul à partir des macros.
