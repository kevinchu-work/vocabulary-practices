import SwiftUI

struct ContentView: View {
    @ObservedObject var model: LookupModel

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            header
            Divider()
            if model.showSettings || !Config.isConfigured {
                SettingsView(model: model)
            } else {
                content
            }
        }
        .padding(14)
        .frame(width: 340)
    }

    private var header: some View {
        HStack {
            Text("Spelling Lookup").font(.headline)
            Spacer()
            Button {
                model.showSettings.toggle()
            } label: {
                Image(systemName: model.showSettings ? "xmark.circle" : "gearshape")
            }
            .buttonStyle(.borderless)
        }
    }

    @ViewBuilder private var content: some View {
        switch model.phase {
        case .idle:
            Text("Select a word in any app, then press your hotkey.")
                .foregroundStyle(.secondary).font(.callout)
            Text("Global hotkey: ⌘⇧L").font(.caption).foregroundStyle(.secondary)
        case .loading(let word):
            HStack(spacing: 8) {
                ProgressView().controlSize(.small)
                Text("Looking up “\(word)”…")
            }
        case .result(let result):
            resultView(result)
        case .suggestions(let list):
            VStack(alignment: .leading, spacing: 6) {
                Text("No exact match. Did you mean:").font(.callout).foregroundStyle(.secondary)
                ForEach(list.prefix(6), id: \.self) { suggestion in
                    Button(suggestion) { model.lookup(suggestion) }.buttonStyle(.link)
                }
            }
        case .error(let message):
            Text(message).foregroundStyle(.red).font(.callout)
        }
    }

    private func resultView(_ result: WordResult) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(result.word ?? "").font(.title3).bold()
                if let pronunciation = result.pronunciation {
                    Text(pronunciation).foregroundStyle(.secondary)
                }
            }
            if let pos = result.partOfSpeech {
                Text(pos).italic().foregroundStyle(.secondary).font(.caption)
            }
            ForEach(Array((result.definitions ?? []).prefix(3).enumerated()), id: \.offset) { _, def in
                Text("• \(def)").font(.callout)
            }
            if let example = result.examples?.first {
                Text("“\(example)”").italic().foregroundStyle(.secondary).font(.callout)
            }
            HStack {
                Button(model.saved ? "Saved ✓" : "Save word") { model.save() }
                    .disabled(model.saved)
                Spacer()
            }
        }
    }
}

struct SettingsView: View {
    @ObservedObject var model: LookupModel
    @State private var serverURL = Config.serverURL
    @State private var apiToken = Config.apiToken

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Server URL").font(.caption).foregroundStyle(.secondary)
            TextField("https://spelling-server.<you>.workers.dev", text: $serverURL)
                .textFieldStyle(.roundedBorder)
            Text("API token").font(.caption).foregroundStyle(.secondary)
            SecureField("bearer token", text: $apiToken)
                .textFieldStyle(.roundedBorder)
            Text("Global hotkey: ⌘⇧L").font(.caption).foregroundStyle(.secondary)
            HStack {
                Spacer()
                Button("Save settings") {
                    Config.serverURL = serverURL
                    Config.apiToken = apiToken
                    model.showSettings = false
                }
                .keyboardShortcut(.defaultAction)
            }
        }
    }
}
