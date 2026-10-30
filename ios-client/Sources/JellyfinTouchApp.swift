import SwiftUI
import WebKit

@main
struct JellyfinTouchApp: App {
    var body: some Scene {
        WindowGroup {
            JellyfinTouchHome()
        }
    }
}

struct JellyfinTouchHome: View {
    @AppStorage("jellyfinServerAddress") private var savedServer = ""
    @State private var editingAddress = ""
    @State private var connectedOrigin: URL?
    @State private var fullscreen = false
    @State private var invalidAddress = false

    var body: some View {
        Group {
            if let origin = connectedOrigin {
                VStack(spacing: 0) {
                    if !fullscreen {
                        HStack {
                            Text("Jellyfin Touch").font(.headline)
                            Spacer()
                            Button("サーバー変更") {
                                connectedOrigin = nil
                                fullscreen = false
                            }
                            .font(.subheadline)
                        }
                        .padding(.horizontal, 12)
                        .frame(height: 48)
                        .background(Color(white: 0.09))
                    }
                    JellyfinBrowser(origin: origin, fullscreen: $fullscreen)
                        .background(.black)
                }
                .ignoresSafeArea(edges: fullscreen ? .all : [])
                .statusBarHidden(fullscreen)
                .background(Color.black)
            } else {
                VStack(alignment: .leading, spacing: 18) {
                    Text("Jellyfin Touch").font(.largeTitle.bold())
                    Text("自宅のJellyfinサーバーのURLを指定してください。Tailscaleのアドレスも利用できます。")
                    TextField("http://100.x.x.x:8096", text: $editingAddress)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                        .autocorrectionDisabled()
                        .textFieldStyle(.roundedBorder)
                        .accessibilityIdentifier("serverAddress")
                    if invalidAddress {
                        Text("http:// または https:// で始まる有効なサーバーURLを入力してください。")
                            .foregroundColor(.red)
                    }
                    Button("Jellyfinに接続") {
                        guard let url = Self.serverOrigin(editingAddress) else {
                            invalidAddress = true
                            return
                        }
                        invalidAddress = false
                        savedServer = url.absoluteString
                        connectedOrigin = url
                    }
                    .buttonStyle(.borderedProminent)
                    Spacer()
                }
                .padding()
                .onAppear { editingAddress = savedServer }
            }
        }
        .preferredColorScheme(.dark)
    }

    static func serverOrigin(_ raw: String) -> URL? {
        guard let url = URL(string: raw.trimmingCharacters(in: .whitespacesAndNewlines)),
              let parts = URLComponents(url: url, resolvingAgainstBaseURL: false),
              parts.scheme == "http" || parts.scheme == "https",
              let host = parts.host, !host.isEmpty,
              parts.user == nil, parts.password == nil else { return nil }
        var clean = URLComponents()
        clean.scheme = parts.scheme
        clean.host = host
        clean.port = parts.port
        return clean.url
    }
}

struct JellyfinBrowser: UIViewRepresentable {
    let origin: URL
    @Binding var fullscreen: Bool

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.allowsInlineMediaPlayback = true
        config.allowsPictureInPictureMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        let content = WKUserContentController()
        content.add(context.coordinator, name: "jfdNative")
        config.userContentController = content

        // The Surface controls are bundled unchanged and bridged to WKWebView.
        // Never expose login tokens or other secrets to the native message handler.
        let bridge = """
            window.chrome = window.chrome || {};
            window.chrome.webview = {
                postMessage: function(payload) {
                    window.webkit.messageHandlers.jfdNative.postMessage(payload);
                }
            };
            """
        content.addUserScript(WKUserScript(source: bridge, injectionTime: .atDocumentStart, forMainFrameOnly: true))

        let inlineVideo = """
            (function () {
                function enableInline() {
                    document.querySelectorAll('video').forEach(function(video) {
                        video.setAttribute('playsinline', '');
                        video.setAttribute('webkit-playsinline', '');
                    });
                }
                function start() {
                    enableInline();
                    new MutationObserver(enableInline).observe(document.documentElement,
                        {childList:true,subtree:true});
                }
                if (document.documentElement) start();
                else document.addEventListener('DOMContentLoaded', start, {once:true});
            })();
            """
        content.addUserScript(WKUserScript(source: inlineVideo, injectionTime: .atDocumentStart, forMainFrameOnly: true))

        if let path = Bundle.main.url(forResource: "controls", withExtension: "js"),
           let controls = try? String(contentsOf: path, encoding: .utf8),
           let quotedOrigin = try? String(data: JSONEncoder().encode(origin.absoluteString), encoding: .utf8) {
            let injected = controls.replacingOccurrences(of: "\"__JFD_SERVER_ORIGIN__\"", with: quotedOrigin)
            content.addUserScript(WKUserScript(source: injected, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }

        let browser = WKWebView(frame: .zero, configuration: config)
        browser.navigationDelegate = context.coordinator
        browser.isOpaque = false
        browser.backgroundColor = .black
        browser.scrollView.backgroundColor = .black
        browser.allowsBackForwardNavigationGestures = false
        context.coordinator.webView = browser
        let url = origin.appendingPathComponent("web/")
        browser.load(URLRequest(url: url))
        return browser
    }

    func updateUIView(_ view: WKWebView, context: Context) {
        context.coordinator.parent = self
    }

    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
        var parent: JellyfinBrowser
        weak var webView: WKWebView?

        init(_ parent: JellyfinBrowser) { self.parent = parent }

        func userContentController(_ userContentController: WKUserContentController,
                                   didReceive message: WKScriptMessage) {
            guard message.name == "jfdNative",
                  let body = message.body as? [String: Any],
                  body["type"] as? String == "jfd-player-action",
                  let action = body["action"] as? String else { return }
            switch action {
            case "toggle-fullscreen":
                DispatchQueue.main.async { self.parent.fullscreen.toggle() }
            case "stop-home":
                stopAndReturnHome()
            default:
                break
            }
        }

        private func stopAndReturnHome() {
            // Prefer Jellyfin's own stop handler to preserve watch progress.
            let script = """
                (async function () {
                    try {
                        const manager=window.playbackManager;
                        if(manager && manager._currentPlayer && typeof manager.stop==='function')
                            await manager.stop(manager._currentPlayer);
                        else {
                            const close=document.querySelector(
                                '.videoOsd-appBar .btnClose, #videoOsdPage .btnClose, .btnClose');
                            if(close) close.click();
                            else document.querySelector('video')?.pause();
                        }
                    } catch (_) { document.querySelector('video')?.pause(); }
                    window.location.hash='#/home';
                })();
                """
            webView?.evaluateJavaScript(script, completionHandler: nil)
            DispatchQueue.main.async { self.parent.fullscreen = false }
        }

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let next = navigationAction.request.url else {
                decisionHandler(.cancel)
                return
            }
            if next.scheme == "about" || next.scheme == "blob" {
                decisionHandler(.allow)
                return
            }
            let sameServer = next.scheme == parent.origin.scheme &&
                next.host == parent.origin.host && next.port == parent.origin.port
            if sameServer {
                decisionHandler(.allow)
            } else {
                if next.scheme == "https" || next.scheme == "http" {
                    UIApplication.shared.open(next)
                }
                decisionHandler(.cancel)
            }
        }
    }
}
