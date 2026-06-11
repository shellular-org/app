import UIKit
import CoreText

final class IconFont {
    // Codepoints are loaded dynamically from bundle/style.css at runtime.

    private static var icons: [String: String] = [:]
    private static var cssLoaded = false

    private static func loadCSS() {
        guard !cssLoaded else { return }
        cssLoaded = true
        guard let url = Bundle.main.url(forResource: "style", withExtension: "css", subdirectory: "bundle")
                     ?? Bundle.main.url(forResource: "style", withExtension: "css"),
              let css = try? String(contentsOf: url, encoding: .utf8) else {
            print("[IconFont] style.css not found in bundle")
            return
        }
        // Matches: .icon-NAME:before { ... content: "\XXXX" ... }
        let pattern = #"\.icon-([^:]+):before\s*\{[^}]*content:\s*["']\\([0-9a-fA-F]+)["']"#
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.dotMatchesLineSeparators]) else { return }
        for match in regex.matches(in: css, range: NSRange(css.startIndex..., in: css)) {
            guard let nameRange = Range(match.range(at: 1), in: css),
                  let cpRange   = Range(match.range(at: 2), in: css),
                  let scalar    = UInt32(css[cpRange], radix: 16),
                  let unicode   = Unicode.Scalar(scalar) else { continue }
            let name = String(css[nameRange])
            if icons[name] == nil { icons[name] = String(unicode) }
        }
    }

    /// Returns the Unicode codepoint string for a CSS icon name such as "globe" or "anchor".
    static func code(_ name: String) -> String {
        loadCSS()
        return icons[name] ?? ""
    }

    private static var fontRegistered = false
    private static let fontName = "shellular-app" // PostScript name in the TTF

    static func registerFont() {
        guard !fontRegistered else { return }
        fontRegistered = true

        // Try with subdirectory first, then without (bundle may flatten directories)
        let fontURL = Bundle.main.url(forResource: "shellular-app", withExtension: "ttf", subdirectory: "bundle")
            ?? Bundle.main.url(forResource: "shellular-app", withExtension: "ttf")

        guard let fontURL else {
            print("[IconFont] icon.ttf not found in bundle")
            return
        }

        var error: Unmanaged<CFError>?
        if !CTFontManagerRegisterFontsForURL(fontURL as CFURL, .process, &error) {
            // Error code 105 = already registered, which is fine
            if let err = error?.takeRetainedValue() {
                let code = CFErrorGetCode(err)
                if code != 105 {
                    print("[IconFont] Failed to register font: \(err)")
                }
            }
        }
    }

    static func image(code: String, size: CGFloat, color: UIColor) -> UIImage? {
        registerFont()

        let font: UIFont
        if let f = UIFont(name: fontName, size: size) {
            font = f
        } else {
            // Fallback: try system font (won't render icons but avoids crash)
            print("[IconFont] Font '\(fontName)' not available, using system font")
            font = UIFont.systemFont(ofSize: size)
        }

        let attrs: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: color
        ]
        let str = NSAttributedString(string: code, attributes: attrs)
        let textSize = str.size()

        let renderer = UIGraphicsImageRenderer(size: textSize)
        return renderer.image { _ in
            str.draw(at: .zero)
        }
    }
}
