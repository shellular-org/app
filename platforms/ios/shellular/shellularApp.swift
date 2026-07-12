//
//  shellularApp.swift
//  shellular
//
//  Created by Ajit Kumar on 07/04/26.
//

import SwiftUI
import UserNotifications

class AppDelegate: NSObject, UIApplicationDelegate {
    static weak var shared: AppDelegate?
    private var pendingURL: URL?
    var intentHandler: ((URL) -> Void)? {
        didSet {
            guard let url = pendingURL, let intentHandler else { return }
            pendingURL = nil
            intentHandler(url)
        }
    }

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        AppDelegate.shared = self
        UNUserNotificationCenter.current().delegate = NotificationService.shared
        return true
    }

    @available(iOS, deprecated: 26.0, message: "Migrate to UIScene lifecycle when targeting iOS 26+")
    func application(
        _ app: UIApplication,
        open url: URL,
        options: [UIApplication.OpenURLOptionsKey: Any] = [:]
    ) -> Bool {
        handleOpenURL(url)
        return true
    }

    func handleOpenURL(_ url: URL) {
        if let intentHandler {
            intentHandler(url)
        } else {
            pendingURL = url
        }
    }

    func application(
        _ application: UIApplication,
        supportedInterfaceOrientationsFor window: UIWindow?
    ) -> UIInterfaceOrientationMask {
        UIDevice.current.userInterfaceIdiom == .pad ? .all : .portrait
    }
}

@main
struct shellularApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        WindowGroup {
            ContentView()
                .ignoresSafeArea()
                .onOpenURL { url in
                    appDelegate.handleOpenURL(url)
                }
        }
    }
}
