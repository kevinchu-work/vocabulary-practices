import Foundation

// Mirrors the Worker's normalised lookup / saved-word shape. Optional fields
// cover both a successful entry and a "not found" suggestions response.
struct WordResult: Decodable {
    let word: String?
    let partOfSpeech: String?
    let pronunciation: String?
    let definition: String?
    let definitions: [String]?
    let examples: [String]?
    let suggestions: [String]?
}

enum ApiError: Error, LocalizedError {
    case notConfigured
    case unauthorized
    case server(Int)
    case transport(String)

    var errorDescription: String? {
        switch self {
        case .notConfigured: return "Set your server URL and API token in Settings."
        case .unauthorized: return "Unauthorized — check your API token."
        case .server(let code): return "Server error (HTTP \(code))."
        case .transport(let message): return message
        }
    }
}

enum ApiClient {
    static func lookup(_ word: String) async throws -> WordResult {
        let encoded = word.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? word
        return try await send(makeRequest("/lookup?word=\(encoded)"))
    }

    static func save(_ word: String) async throws -> WordResult {
        return try await send(makeRequest("/words", method: "POST", body: ["word": word]))
    }

    private static func makeRequest(_ path: String, method: String = "GET", body: [String: Any]? = nil) throws -> URLRequest {
        guard Config.isConfigured, let url = URL(string: Config.serverURL + path) else {
            throw ApiError.notConfigured
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("Bearer \(Config.apiToken)", forHTTPHeaderField: "Authorization")
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        return request
    }

    private static func send(_ request: URLRequest) async throws -> WordResult {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw ApiError.transport(error.localizedDescription)
        }
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        if code == 401 { throw ApiError.unauthorized }
        if code >= 500 { throw ApiError.server(code) }
        do {
            return try JSONDecoder().decode(WordResult.self, from: data)
        } catch {
            throw ApiError.transport("Unexpected response from server.")
        }
    }
}
