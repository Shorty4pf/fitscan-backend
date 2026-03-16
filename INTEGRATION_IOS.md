# Intégration iOS – Backend FitScan

Ce document contient tout le code Swift à ajouter dans ton projet Xcode pour connecter l’écran de scan au backend. **Aucun fichier n’est créé dans ton projet iOS** : tu crées les fichiers dans Xcode et tu copies le code ci‑dessous.

---

## Contrat backend (POST /ai/scan-food)

Le backend expose **POST /ai/scan-food** avec :

- **Body :** `multipart/form-data`, champ **`image`** (fichier JPEG ou PNG ; pas de HEIC — côté iOS, utiliser `image.jpegData(compressionQuality: 0.8)`).
- **Réponse JSON (exemple) :**
```json
{
  "success": true,
  "dishName": "Poulet riz brocolis",
  "estimatedCalories": 450,
  "proteinG": 35,
  "carbsG": 60,
  "fatG": 10,
  "confidence": 0.92,
  "items": [
    {"name": "Poulet", "grams": 150},
    {"name": "Riz", "grams": 120}
  ],
  "notes": []
}
```
- **Champs optionnels** : gérés avec des fallbacks côté app (nom par défaut, 0 pour les macros).
- **`items`** et **`notes`** : décodés et utilisables pour afficher la liste des aliments détectés ; l’écran résultat actuel utilise déjà le mapping vers `FoodScanBackendResult` / `ScannedMealDisplayModel`.

---

## 1. Config backend (1 fichier)

**Dans Xcode :** File → New → File → Swift File → nommer `AppConfig.swift`.

```swift
//
//  AppConfig.swift
//  FitScanTM_Minimal
//

import Foundation

enum AppConfig {

    /// URL de base du backend FitScan (Railway).
    static let backendBaseURL: String = "https://fitscan-backend-production.up.railway.app"

    static var fitscanBackendBaseURL: String { backendBaseURL }

    static var fitscanBackendURL: URL? {
        URL(string: fitscanBackendBaseURL)
    }

    static let networkTimeout: TimeInterval = 60
}
```

**Pour le dev local :** remplacer temporairement par `"http://localhost:3000"` (simulateur) ou `"http://<IP-de-ton-Mac>:3000"` (iPhone physique).

---

## 2. Modèles Codable (1 fichier)

**Dans Xcode :** Nouveau fichier Swift → `ScanAPIModels.swift`.

```swift
//
//  ScanAPIModels.swift
//  FitScanTM_Minimal
//

import Foundation

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
    // Score santé (affichage) : utiliser cette valeur, ne pas recalculer depuis les macros
    let healthScore: Double?
    let healthScoreDisplay: Int?       // ex. 9 → afficher "9/10"
    let healthScoreReasoning: [String]?
}

struct DetectedFoodItem: Codable {
    let name: String
    let grams: Int?
}

struct LabelScanResponse: Codable {
    let success: Bool
    let mode: String?
    let productName: String?
    let servingSize: String?
    let calories: Int?
    let proteinG: Int?
    let carbsG: Int?
    let fatG: Int?
    let confidence: Double?
    let error: String?
}

struct BarcodeScanResponse: Codable {
    let success: Bool
    let mode: String?
    let barcode: String?
    let isFood: Bool?
    let productName: String?
    let brand: String?
    let servingSize: String?
    let calories: Int?
    let proteinG: Int?
    let carbsG: Int?
    let fatG: Int?
    let error: String?
}
```

---

## 3. Service réseau (1 fichier)

**Dans Xcode :** Nouveau fichier Swift → `ScanAPIClient.swift`.

```swift
//
//  ScanAPIClient.swift
//  FitScanTM_Minimal
//

import Foundation
import UIKit

enum ScanAPIError: LocalizedError {
    case invalidBaseURL
    case invalidImage
    case backendError(String)
    case decodingError
    case networkError(Error)

    var errorDescription: String? {
        switch self {
        case .invalidBaseURL: return "URL du backend invalide."
        case .invalidImage: return "Image invalide ou impossible à envoyer."
        case .backendError(let code): return messageForErrorCode(code)
        case .decodingError: return "Réponse du serveur invalide."
        case .networkError(let e): return e.localizedDescription
        }
    }

    private func messageForErrorCode(_ code: String) -> String {
        switch code {
        case "invalid_image": return "Image manquante ou format non supporté."
        case "ai_failed": return "L’analyse a échoué. Réessayez."
        case "invalid_response": return "Réponse invalide du serveur."
        case "missing_api_key": return "Service temporairement indisponible."
        case "not_implemented_yet": return "Fonctionnalité bientôt disponible."
        default: return "Erreur serveur (\(code))."
        }
    }
}

final class ScanAPIClient {

    static let shared = ScanAPIClient()
    private init() {}

    private var baseURL: URL {
        guard let url = AppConfig.fitscanBackendURL else {
            fatalError("AppConfig.fitscanBackendBaseURL must be valid")
        }
        return url
    }

    private let session: URLSession = {
        let c = URLSessionConfiguration.default
        c.timeoutIntervalForRequest = AppConfig.networkTimeout
        return URLSession(configuration: c)
    }()

    private let boundary = "FitScanBoundary\(UUID().uuidString.replacingOccurrences(of: "-", with: ""))"

    // MARK: - Health (optionnel)

    func checkHealth() async throws -> Bool {
        let url = baseURL.appendingPathComponent("health")
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { return false }
        struct Health: Decodable { let ok: Bool? }
        let health = try? JSONDecoder().decode(Health.self, from: data)
        return health?.ok ?? false
    }

    // MARK: - Upload image (multipart/form-data, champ "image")

    func uploadFoodImage(_ image: UIImage) async throws -> FoodScanResponse {
        let url = baseURL.appendingPathComponent("ai/scan-food")
        return try await uploadImage(image, to: url, responseType: FoodScanResponse.self)
    }

    func uploadLabelImage(_ image: UIImage) async throws -> LabelScanResponse {
        let url = baseURL.appendingPathComponent("ai/scan-label")
        return try await uploadImage(image, to: url, responseType: LabelScanResponse.self)
    }

    private func uploadImage<T: Decodable>(_ image: UIImage, to url: URL, responseType: T.Type) async throws -> T {
        guard let jpeg = image.jpegData(compressionQuality: 0.8) else {
            throw ScanAPIError.invalidImage
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = AppConfig.networkTimeout

        var body = Data()
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"image\"; filename=\"image.jpg\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: image/jpeg\r\n\r\n".data(using: .utf8)!)
        body.append(jpeg)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
        request.httpBody = body

        let (data, response) = try await session.data(for: request)
        return try handleJSONResponse(data: data, response: response, type: responseType)
    }

    // MARK: - Barcode (JSON body)

    func lookupBarcode(_ value: String) async throws -> BarcodeScanResponse {
        guard let url = AppConfig.fitscanBackendURL?.appendingPathComponent("ai/scan-barcode") else {
            throw ScanAPIError.invalidBaseURL
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = AppConfig.networkTimeout
        request.httpBody = try JSONEncoder().encode(["barcode": value])

        let (data, response) = try await session.data(for: request)
        return try handleJSONResponse(data: data, response: response, type: BarcodeScanResponse.self)
    }

    // MARK: - Réponse JSON commune

    private func handleJSONResponse<T: Decodable>(data: Data, response: URLResponse, type: T.Type) throws -> T {
        guard let http = response as? HTTPURLResponse else {
            throw ScanAPIError.decodingError
        }

        if http.statusCode != 200 && http.statusCode != 501 {
            if let generic = try? JSONDecoder().decode(GenericError.self, from: data) {
                throw ScanAPIError.backendError(generic.error ?? "unknown")
            }
            throw ScanAPIError.backendError("http_\(http.statusCode)")
        }

        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw ScanAPIError.decodingError
        }
    }
}

private struct GenericError: Decodable {
    let error: String?
}
```

---

## 4. Intégration dans le ViewController caméra

Dans ton `NutritionScanCameraViewController`, tu dois :

- **Appeler le bon endpoint** selon le mode (scanFood → `uploadFoodImage`, foodLabel → `uploadLabelImage`, gallery → même logique selon le mode actif).
- **Afficher un loading** pendant la requête.
- **Afficher le résultat** (nouvelle vue ou écran de résultat) ou une **erreur lisible**.

### 4.1 État et loading

Ajoute des propriétés pour le chargement et le résultat, par exemple :

```swift
// Dans NutritionScanCameraViewController
private var isLoading = false
private let overlayLoading = UIActivityIndicatorView(style: .large) // à ajouter dans setupUI
```

### 4.2 Quand une photo est capturée ou choisie (galerie)

Dans ta méthode `onPhotoCaptured(_ image: UIImage)` (et après choix galerie), selon `currentMode` :

- **scanFood** : appeler `ScanAPIClient.shared.uploadFoodImage(image)` en `Task { }`, afficher l’indicateur de chargement, puis afficher le `FoodScanResponse` (nom du plat, calories, protéines, glucides, lipides, items, confiance).
- **foodLabel** : appeler `ScanAPIClient.shared.uploadLabelImage(image)` et afficher le `LabelScanResponse` (nom produit, portion, calories, macros, confiance).
- **gallery** : utiliser le même mode que celui sélectionné (scanFood ou foodLabel) et la même logique que ci‑dessus.

Exemple de structure (à adapter à ton UI) :

```swift
private func onPhotoCaptured(_ image: UIImage) {
    guard !isLoading else { return }
    isLoading = true
    overlayLoading.startAnimating()
    overlayLoading.isHidden = false

    Task {
        do {
            switch currentMode {
            case .scanFood, .gallery:
                let response = try await ScanAPIClient.shared.uploadFoodImage(image)
                await MainActor.run { showFoodResult(response, image: image) }
            case .foodLabel:
                let response = try await ScanAPIClient.shared.uploadLabelImage(image)
                await MainActor.run { showLabelResult(response, image: image) }
            case .barcode:
                await MainActor.run { showError("En mode code-barres, scannez un code-barres.") }
            }
        } catch {
            await MainActor.run { showError(error.localizedDescription) }
        }
        await MainActor.run {
            isLoading = false
            overlayLoading.stopAnimating()
            overlayLoading.isHidden = true
        }
    }
}
```

Tu peux implémenter `showFoodResult`, `showLabelResult` et `showError` en présentant un nouvel écran (résumé nutrition + image) ou des labels sur la même vue.

### 4.3 Mode Barcode

Quand l’utilisateur est en mode **barcode** et que le lecteur de code-barres natif (AVCaptureMetadataOutput) détecte une valeur :

- Appeler `ScanAPIClient.shared.lookupBarcode(valeur)`.
- Afficher le `BarcodeScanResponse` (produit, marque, macros) ou, si `success == false` / `error == "not_implemented_yet"`, un message propre du type « Fonctionnalité bientôt disponible » ou « Produit non reconnu ».

---

## 5. Affichage des résultats

Tu peux faire une seule vue de résultat qui affiche :

- **Scan Food** : `dishName`, `estimatedCalories`, `proteinG`, `carbsG`, `fatG`, `confidence`, liste `items` (nom + grammes), `notes`.
- **Scan Label** : `productName`, `servingSize`, `calories`, `proteinG`, `carbsG`, `fatG`, `confidence`.
- **Barcode** : `productName`, `brand`, `servingSize`, calories et macros ; en cas d’erreur, afficher un message (ex. « Produit non alimentaire » ou « Fonctionnalité bientôt disponible »).

Gérer les erreurs avec des messages lisibles (backend indisponible, timeout, image invalide, etc.) en utilisant `ScanAPIError` et les champs `error` des réponses.

---

## 6. Récap

| Élément              | Fichier / lieu                          |
|----------------------|------------------------------------------|
| URL backend          | `AppConfig.swift`                        |
| Modèles JSON         | `ScanAPIModels.swift`                    |
| Appels réseau        | `ScanAPIClient.swift`                    |
| Branchement caméra   | `NutritionScanCameraViewController`     |
| Affichage résultat   | Nouvelle vue ou écran (à toi de créer)  |

- **Simulateur** : `localhost:3000` (déjà dans `AppConfig`).
- **iPhone réel** : modifier `fitscanBackendBaseURL` dans `AppConfig` avec l’IP de ton Mac (ex. `http://192.168.1.10:3000`).

Aucune clé API dans l’app : tout reste côté backend.
