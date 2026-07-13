import SwiftUI

@MainActor
final class LookupModel: ObservableObject {
    enum Phase {
        case idle
        case loading(String)
        case result(WordResult)
        case suggestions([String])
        case error(String)
    }

    @Published var phase: Phase = .idle
    @Published var saved = false
    @Published var showSettings = false

    func lookup(_ word: String) {
        saved = false
        showSettings = false
        phase = .loading(word)
        Task {
            do {
                let result = try await ApiClient.lookup(word)
                if result.word == nil, let suggestions = result.suggestions {
                    phase = .suggestions(suggestions)
                } else {
                    phase = .result(result)
                }
            } catch {
                phase = .error(message(for: error))
            }
        }
    }

    func save() {
        guard case let .result(result) = phase, let word = result.word else { return }
        Task {
            do {
                _ = try await ApiClient.save(word)
                saved = true
            } catch {
                phase = .error(message(for: error))
            }
        }
    }

    private func message(for error: Error) -> String {
        (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
    }
}
