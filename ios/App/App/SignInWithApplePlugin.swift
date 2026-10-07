import AuthenticationServices
import Capacitor
import Foundation
import UIKit

@objc(SignInWithApplePlugin)
public class SignInWithApplePlugin: CAPPlugin, CAPBridgedPlugin, ASAuthorizationControllerDelegate,
  ASAuthorizationControllerPresentationContextProviding
{
  public let identifier = "SignInWithApplePlugin"
  public let jsName = "SignInWithApple"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise),
  ]

  private var pendingCall: CAPPluginCall?

  @objc func authorize(_ call: CAPPluginCall) {
    pendingCall = call
    let request = ASAuthorizationAppleIDProvider().createRequest()
    request.requestedScopes = [.fullName, .email]
    let controller = ASAuthorizationController(authorizationRequests: [request])
    controller.delegate = self
    controller.presentationContextProvider = self
    controller.performRequests()
  }

  public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
    bridge?.webView?.window ?? UIWindow()
  }

  public func authorizationController(
    controller: ASAuthorizationController,
    didCompleteWithAuthorization authorization: ASAuthorization
  ) {
    guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential else {
      pendingCall?.reject("No Apple ID credential")
      pendingCall = nil
      return
    }
    let token = credential.identityToken.flatMap { String(data: $0, encoding: .utf8) } ?? ""
    let given = credential.fullName?.givenName ?? ""
    let family = credential.fullName?.familyName ?? ""
    pendingCall?.resolve([
      "response": [
        "identityToken": token,
        "email": credential.email ?? "",
        "givenName": given,
        "familyName": family,
      ],
    ])
    pendingCall = nil
  }

  public func authorizationController(
    controller: ASAuthorizationController,
    didCompleteWithError error: Error
  ) {
    pendingCall?.reject(error.localizedDescription)
    pendingCall = nil
  }
}
