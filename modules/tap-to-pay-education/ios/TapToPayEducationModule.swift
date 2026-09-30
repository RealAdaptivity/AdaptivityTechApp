import ExpoModulesCore
import ProximityReader

/// Apple's own Tap to Pay on iPhone education screens (ProximityReaderDiscovery,
/// iOS 18+). Apple's review checklist requires using it where available
/// (requirement 4.1); the JS side falls back to the app's own screens on
/// older iOS.
public class TapToPayEducationModule: Module {
  // Kept alive while its view controller is on screen.
  private var discovery: AnyObject?

  public func definition() -> ModuleDefinition {
    Name("TapToPayEducation")

    Function("isAvailable") { () -> Bool in
      if #available(iOS 18.0, *) {
        return true
      }
      return false
    }

    AsyncFunction("showHowToTap") { (promise: Promise) in
      guard #available(iOS 18.0, *) else {
        promise.resolve(false)
        return
      }
      Task { @MainActor in
        guard let viewController = self.appContext?.utilities?.currentViewController() else {
          promise.reject("NO_VIEW_CONTROLLER", "Could not find a screen to present on.")
          return
        }
        let discovery = ProximityReaderDiscovery()
        self.discovery = discovery
        do {
          let content = try await discovery.content(for: .payment(.howToTap))
          try await discovery.presentContent(content, from: viewController)
          self.discovery = nil
          promise.resolve(true)
        } catch {
          self.discovery = nil
          promise.reject("EDUCATION_UNAVAILABLE", error.localizedDescription)
        }
      }
    }
  }
}
