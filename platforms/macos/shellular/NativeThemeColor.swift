import Foundation

enum TitlebarDoubleClickAction: Equatable {
    case fill
    case minimize
    case none

    static func resolve(_ rawValue: String?) -> TitlebarDoubleClickAction {
        switch rawValue?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "minimize":
            return .minimize
        case "none", "do nothing", "donothing":
            return .none
        case nil, "fill", "maximize", "zoom":
            return .fill
        default:
            return .none
        }
    }
}

enum WindowFrameAnimationTiming {
    static func easedProgress(elapsed: TimeInterval, duration: TimeInterval) -> Double {
        guard duration > 0 else { return 1 }
        let progress = min(max(elapsed / duration, 0), 1)
        if progress < 0.5 {
            return 4 * progress * progress * progress
        }
        let inverse = -2 * progress + 2
        return 1 - inverse * inverse * inverse / 2
    }
}

struct NativeThemeColor: Equatable {
    let red: Double
    let green: Double
    let blue: Double
    let alpha: Double
}

enum NativeThemeColorParser {
    static func parse(_ rawValue: String) -> NativeThemeColor? {
        let value = rawValue.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if value.hasPrefix("#") {
            return parseHex(String(value.dropFirst()))
        }
        if value.hasPrefix("rgb(") || value.hasPrefix("rgba(") {
            return parseRGB(value)
        }
        return nil
    }

    private static func parseHex(_ value: String) -> NativeThemeColor? {
        let expanded: String
        switch value.count {
        case 3, 4:
            expanded = value.map { "\($0)\($0)" }.joined()
        case 6, 8:
            expanded = value
        default:
            return nil
        }

        guard let number = UInt64(expanded, radix: 16) else { return nil }
        let includesAlpha = expanded.count == 8
        let redShift = includesAlpha ? 24 : 16
        let greenShift = includesAlpha ? 16 : 8
        let blueShift = includesAlpha ? 8 : 0
        return NativeThemeColor(
            red: Double((number >> redShift) & 0xff) / 255,
            green: Double((number >> greenShift) & 0xff) / 255,
            blue: Double((number >> blueShift) & 0xff) / 255,
            alpha: includesAlpha ? Double(number & 0xff) / 255 : 1
        )
    }

    private static func parseRGB(_ value: String) -> NativeThemeColor? {
        guard let open = value.firstIndex(of: "("), let close = value.lastIndex(of: ")"), open < close else {
            return nil
        }
        let components = value[value.index(after: open)..<close]
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        guard components.count == 3 || components.count == 4,
              let red = channel(components[0]),
              let green = channel(components[1]),
              let blue = channel(components[2]) else {
            return nil
        }
        let alpha = components.count == 4 ? alpha(components[3]) : 1
        guard let alpha else { return nil }
        return NativeThemeColor(red: red, green: green, blue: blue, alpha: alpha)
    }

    private static func channel(_ value: String) -> Double? {
        if value.hasSuffix("%") {
            guard let percentage = Double(value.dropLast()), (0...100).contains(percentage) else { return nil }
            return percentage / 100
        }
        guard let channel = Double(value), (0...255).contains(channel) else { return nil }
        return channel / 255
    }

    private static func alpha(_ value: String) -> Double? {
        if value.hasSuffix("%") {
            guard let percentage = Double(value.dropLast()), (0...100).contains(percentage) else { return nil }
            return percentage / 100
        }
        guard let alpha = Double(value), (0...1).contains(alpha) else { return nil }
        return alpha
    }
}
