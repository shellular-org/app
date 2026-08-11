import AppKit

struct ContextMenuViewportMetrics: Equatable {
    var layoutWidth: CGFloat
    var layoutHeight: CGFloat
    var visualWidth: CGFloat
    var visualHeight: CGFloat
    var visualOffsetLeft: CGFloat
    var visualOffsetTop: CGFloat
    var visualScale: CGFloat
    var deviceScaleFactor: CGFloat
}

enum ContextMenuCoordinateConverter {
    /// Converts a layout-viewport CSS point into the target NSView's logical
    /// coordinate space. AppKit works in points, so Retina backing scale must
    /// not be applied a second time.
    static func convert(
        _ layoutPoint: CGPoint,
        viewport: ContextMenuViewportMetrics,
        viewBounds: CGRect,
        isFlipped: Bool,
        edgeInset: CGFloat = 1
    ) -> CGPoint {
        let visualScale = positive(viewport.visualScale, fallback: 1)
        let visualWidth = positive(
            viewport.visualWidth,
            fallback: viewport.layoutWidth / visualScale
        )
        let visualHeight = positive(
            viewport.visualHeight,
            fallback: viewport.layoutHeight / visualScale
        )
        let scaleX = positive(viewBounds.width, fallback: visualWidth) / visualWidth
        let scaleY = positive(viewBounds.height, fallback: visualHeight) / visualHeight
        let xFromLeft = (layoutPoint.x - viewport.visualOffsetLeft) * scaleX
        let yFromTop = (layoutPoint.y - viewport.visualOffsetTop) * scaleY
        let unclampedX = viewBounds.minX + xFromLeft
        let unclampedY = isFlipped
            ? viewBounds.minY + yFromTop
            : viewBounds.maxY - yFromTop
        return CGPoint(
            x: clamp(unclampedX, min: viewBounds.minX + edgeInset, max: viewBounds.maxX - edgeInset),
            y: clamp(unclampedY, min: viewBounds.minY + edgeInset, max: viewBounds.maxY - edgeInset)
        )
    }

    private static func positive(_ value: CGFloat, fallback: CGFloat) -> CGFloat {
        value.isFinite && value > 0 ? value : max(1, fallback)
    }

    private static func clamp(_ value: CGFloat, min lower: CGFloat, max upper: CGFloat) -> CGFloat {
        guard lower <= upper else { return (lower + upper) / 2 }
        return Swift.min(Swift.max(value, lower), upper)
    }
}

enum ContextMenuCoordinatorAction: Equatable {
    case present(Int)
    case cancelTracking(Int)
    case complete(Int, String?)
}

/// Pure request state machine. `NSMenu` runs a nested event loop, so a new
/// bridge request can arrive while the previous call to `popUp` is still on
/// the stack. This coordinator guarantees one active tracker and exactly one
/// completion per request.
struct ContextMenuRequestCoordinator {
    private(set) var activeID: Int?
    private(set) var pendingID: Int?
    private var activeCompleted = false
    private var cancellationRequested = false

    func canPresent(_ id: Int) -> Bool {
        activeID == id && !cancellationRequested
    }

    func canSelect(_ id: Int) -> Bool {
        activeID == id && !activeCompleted && !cancellationRequested
    }

    mutating func submit(_ id: Int) -> [ContextMenuCoordinatorAction] {
        guard let activeID else {
            self.activeID = id
            activeCompleted = false
            cancellationRequested = false
            return [.present(id)]
        }

        var actions: [ContextMenuCoordinatorAction] = []
        if let pendingID {
            actions.append(.complete(pendingID, nil))
        }
        pendingID = id
        if !activeCompleted {
            activeCompleted = true
            actions.append(.complete(activeID, nil))
        }
        if !cancellationRequested {
            cancellationRequested = true
            actions.append(.cancelTracking(activeID))
        }
        return actions
    }

    mutating func trackingEnded(_ id: Int, selection: String?) -> [ContextMenuCoordinatorAction] {
        guard activeID == id else { return [] }
        var actions: [ContextMenuCoordinatorAction] = []
        if !activeCompleted {
            actions.append(.complete(id, selection))
        }
        activeID = nil
        activeCompleted = false
        cancellationRequested = false
        if let pendingID {
            self.pendingID = nil
            activeID = pendingID
            actions.append(.present(pendingID))
        }
        return actions
    }

    mutating func cancelAll() -> [ContextMenuCoordinatorAction] {
        var actions: [ContextMenuCoordinatorAction] = []
        if let pendingID {
            actions.append(.complete(pendingID, nil))
            self.pendingID = nil
        }
        if let activeID {
            if !activeCompleted {
                activeCompleted = true
                actions.append(.complete(activeID, nil))
            }
            if !cancellationRequested {
                cancellationRequested = true
                actions.append(.cancelTracking(activeID))
            }
        }
        return actions
    }
}
