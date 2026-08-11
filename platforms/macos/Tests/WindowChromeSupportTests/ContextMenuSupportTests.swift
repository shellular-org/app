@testable import WindowChromeSupport
import XCTest

final class ContextMenuCoordinateConverterTests: XCTestCase {
    private let viewport = ContextMenuViewportMetrics(
        layoutWidth: 1200,
        layoutHeight: 800,
        visualWidth: 600,
        visualHeight: 400,
        visualOffsetLeft: 100,
        visualOffsetTop: 50,
        visualScale: 2,
        deviceScaleFactor: 4
    )

    func testConvertsIntoFlippedViewCoordinatesWithVisualViewportOffset() {
        let point = ContextMenuCoordinateConverter.convert(
            CGPoint(x: 250, y: 150),
            viewport: viewport,
            viewBounds: CGRect(x: 20, y: 30, width: 900, height: 600),
            isFlipped: true
        )
        XCTAssertEqual(point.x, 245, accuracy: 0.001)
        XCTAssertEqual(point.y, 180, accuracy: 0.001)
    }

    func testConvertsIntoNonFlippedViewCoordinates() {
        let point = ContextMenuCoordinateConverter.convert(
            CGPoint(x: 250, y: 150),
            viewport: viewport,
            viewBounds: CGRect(x: 20, y: 30, width: 900, height: 600),
            isFlipped: false
        )
        XCTAssertEqual(point.x, 245, accuracy: 0.001)
        XCTAssertEqual(point.y, 480, accuracy: 0.001)
    }

    func testRetinaScaleDoesNotChangeLogicalAppKitPoint() {
        var oneX = viewport
        oneX.deviceScaleFactor = 1
        let bounds = CGRect(x: 0, y: 0, width: 600, height: 400)
        XCTAssertEqual(
            ContextMenuCoordinateConverter.convert(
                CGPoint(x: 300, y: 200), viewport: oneX, viewBounds: bounds, isFlipped: true
            ),
            ContextMenuCoordinateConverter.convert(
                CGPoint(x: 300, y: 200), viewport: viewport, viewBounds: bounds, isFlipped: true
            )
        )
    }

    func testUsesBrowserZoomWhenVisualDimensionsAreUnavailable() {
        var zoomed = viewport
        zoomed.visualWidth = 0
        zoomed.visualHeight = 0
        zoomed.visualOffsetLeft = 0
        zoomed.visualOffsetTop = 0
        let point = ContextMenuCoordinateConverter.convert(
            CGPoint(x: 300, y: 200),
            viewport: zoomed,
            viewBounds: CGRect(x: 0, y: 0, width: 600, height: 400),
            isFlipped: true
        )
        XCTAssertEqual(point, CGPoint(x: 300, y: 200))
    }

    func testClampsEveryWindowEdge() {
        let bounds = CGRect(x: 10, y: 20, width: 300, height: 200)
        let upperLeft = ContextMenuCoordinateConverter.convert(
            CGPoint(x: -10_000, y: -10_000), viewport: viewport, viewBounds: bounds, isFlipped: true
        )
        let lowerRight = ContextMenuCoordinateConverter.convert(
            CGPoint(x: 10_000, y: 10_000), viewport: viewport, viewBounds: bounds, isFlipped: true
        )
        XCTAssertEqual(upperLeft, CGPoint(x: 11, y: 21))
        XCTAssertEqual(lowerRight, CGPoint(x: 309, y: 219))
    }
}

final class ContextMenuRequestCoordinatorTests: XCTestCase {
    func testNormalSelectionCompletesExactlyOnce() {
        var coordinator = ContextMenuRequestCoordinator()
        XCTAssertEqual(coordinator.submit(1), [.present(1)])
        XCTAssertEqual(coordinator.trackingEnded(1, selection: "edit.copy"), [
            .complete(1, "edit.copy")
        ])
        XCTAssertEqual(coordinator.trackingEnded(1, selection: "stale"), [])
    }

    func testRapidRequestsKeepOnlyNewestPendingMenu() {
        var coordinator = ContextMenuRequestCoordinator()
        _ = coordinator.submit(1)
        XCTAssertEqual(coordinator.submit(2), [
            .complete(1, nil), .cancelTracking(1)
        ])
        XCTAssertEqual(coordinator.submit(3), [.complete(2, nil)])
        XCTAssertEqual(coordinator.trackingEnded(1, selection: nil), [.present(3)])
        XCTAssertEqual(coordinator.trackingEnded(3, selection: nil), [.complete(3, nil)])
    }

    func testExplicitCancellationCompletesActiveAndPendingOnce() {
        var coordinator = ContextMenuRequestCoordinator()
        _ = coordinator.submit(10)
        _ = coordinator.submit(11)
        XCTAssertEqual(coordinator.cancelAll(), [.complete(11, nil)])
        XCTAssertEqual(coordinator.cancelAll(), [])
        XCTAssertEqual(coordinator.trackingEnded(10, selection: "stale"), [])
    }
}
