@testable import WindowChromeSupport
import XCTest

final class NativeThemeColorParserTests: XCTestCase {
    func testParsesHexColorsWithOptionalAlpha() {
        XCTAssertEqual(
            NativeThemeColorParser.parse("#0d0d0f"),
            NativeThemeColor(red: 13.0 / 255, green: 13.0 / 255, blue: 15.0 / 255, alpha: 1)
        )
        XCTAssertEqual(NativeThemeColorParser.parse("#fff8"), NativeThemeColor(
            red: 1,
            green: 1,
            blue: 1,
            alpha: 136.0 / 255
        ))
    }

    func testParsesRGBAndRGBAColors() {
        XCTAssertEqual(
            NativeThemeColorParser.parse("rgb(242, 242, 247)"),
            NativeThemeColor(red: 242.0 / 255, green: 242.0 / 255, blue: 247.0 / 255, alpha: 1)
        )
        XCTAssertEqual(
            NativeThemeColorParser.parse("rgba(0, 0, 0, 0.6)"),
            NativeThemeColor(red: 0, green: 0, blue: 0, alpha: 0.6)
        )
    }

    func testRejectsInvalidColors() {
        XCTAssertNil(NativeThemeColorParser.parse("red"))
        XCTAssertNil(NativeThemeColorParser.parse("rgb(300, 0, 0)"))
        XCTAssertNil(NativeThemeColorParser.parse("#12"))
    }
}

final class TitlebarDoubleClickActionTests: XCTestCase {
    func testResolvesCurrentAndLegacyFillValues() {
        XCTAssertEqual(TitlebarDoubleClickAction.resolve("Fill"), .fill)
        XCTAssertEqual(TitlebarDoubleClickAction.resolve("Maximize"), .fill)
        XCTAssertEqual(TitlebarDoubleClickAction.resolve("Zoom"), .fill)
        XCTAssertEqual(TitlebarDoubleClickAction.resolve(nil), .fill)
    }

    func testResolvesMinimizeAndDoNothing() {
        XCTAssertEqual(TitlebarDoubleClickAction.resolve("Minimize"), .minimize)
        XCTAssertEqual(TitlebarDoubleClickAction.resolve("None"), .none)
        XCTAssertEqual(TitlebarDoubleClickAction.resolve("Do Nothing"), .none)
        XCTAssertEqual(TitlebarDoubleClickAction.resolve("unsupported"), .none)
    }
}

final class WindowFrameAnimationTimingTests: XCTestCase {
    func testClampsAnimationProgress() {
        XCTAssertEqual(WindowFrameAnimationTiming.easedProgress(elapsed: -1, duration: 0.18), 0)
        XCTAssertEqual(WindowFrameAnimationTiming.easedProgress(elapsed: 1, duration: 0.18), 1)
        XCTAssertEqual(WindowFrameAnimationTiming.easedProgress(elapsed: 0.1, duration: 0), 1)
    }

    func testEaseInOutProgressIsContinuousAndSymmetric() {
        let quarter = WindowFrameAnimationTiming.easedProgress(elapsed: 0.25, duration: 1)
        let midpoint = WindowFrameAnimationTiming.easedProgress(elapsed: 0.5, duration: 1)
        let threeQuarters = WindowFrameAnimationTiming.easedProgress(elapsed: 0.75, duration: 1)

        XCTAssertEqual(quarter, 0.0625, accuracy: 0.000_001)
        XCTAssertEqual(midpoint, 0.5, accuracy: 0.000_001)
        XCTAssertEqual(threeQuarters, 0.9375, accuracy: 0.000_001)
    }
}
