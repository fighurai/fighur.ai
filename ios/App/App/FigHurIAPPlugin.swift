import Capacitor
import Foundation
import StoreKit

@objc(FigHurIAPPlugin)
public class FigHurIAPPlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "FigHurIAPPlugin"
  public let jsName = "FigHurIAP"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "purchaseProduct", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "restorePurchases", returnType: CAPPluginReturnPromise),
  ]

  @objc func purchaseProduct(_ call: CAPPluginCall) {
    let productId = call.getString("productIdentifier") ?? ""
    let accountToken = call.getString("appAccountToken")
    guard !productId.isEmpty else {
      call.reject("productIdentifier is required")
      return
    }
    Task { @MainActor in
      do {
        let products = try await Product.products(for: [productId])
        guard let product = products.first else {
          call.reject("Product not found: \(productId)")
          return
        }
        var options: Set<Product.PurchaseOption> = []
        if let accountToken, let uuid = UUID(uuidString: accountToken) {
          options.insert(.appAccountToken(uuid))
        }
        let result = try await product.purchase(options: options)
        switch result {
        case .success(let verification):
          let transaction = try Self.checkVerified(verification)
          let jws = verification.jwsRepresentation
          await transaction.finish()
          call.resolve([
            "transactionId": transaction.id,
            "jwsRepresentation": jws,
          ])
        case .userCancelled:
          call.reject("Purchase cancelled")
        case .pending:
          call.reject("Purchase pending")
        @unknown default:
          call.reject("Unknown purchase result")
        }
      } catch {
        call.reject(error.localizedDescription)
      }
    }
  }

  @objc func restorePurchases(_ call: CAPPluginCall) {
    Task { @MainActor in
      do {
        try await AppStore.sync()
        var txs: [[String: String]] = []
        for await result in Transaction.currentEntitlements {
          txs.append(["jwsRepresentation": result.jwsRepresentation])
        }
        call.resolve(["transactions": txs])
      } catch {
        call.reject(error.localizedDescription)
      }
    }
  }

  private static func checkVerified<T>(_ result: VerificationResult<T>) throws -> T {
    switch result {
    case .unverified(_, let error):
      throw error
    case .verified(let safe):
      return safe
    }
  }
}
