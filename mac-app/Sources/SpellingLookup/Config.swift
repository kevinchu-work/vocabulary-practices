import Foundation

// Server connection settings, persisted in UserDefaults.
enum Config {
    static var serverURL: String {
        get { UserDefaults.standard.string(forKey: "serverURL") ?? "" }
        set { UserDefaults.standard.set(newValue.trimmingCharacters(in: .whitespaces), forKey: "serverURL") }
    }
    static var apiToken: String {
        get { UserDefaults.standard.string(forKey: "apiToken") ?? "" }
        set { UserDefaults.standard.set(newValue.trimmingCharacters(in: .whitespaces), forKey: "apiToken") }
    }
    static var isConfigured: Bool { !serverURL.isEmpty && !apiToken.isEmpty }
}
