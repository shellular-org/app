import AppKit

final class ShellularWindow: NSWindow {
    private static let animationDuration: TimeInterval = 0.18
    private static let meaningfulSizeDelta: CGFloat = 8

    private var titlebarDragGeneration = 0
    private var pendingTitlebarTileAnimation = false
    private var titlebarDragStartFrame: NSRect?
    private var isForwardingFrameChange = false
    private var usesShellularAnimationDuration = false
    private var restoredFrame: NSRect?
    private var frameAnimationTimer: Timer?
    private var frameAnimationTarget: NSRect?

    func beginTitlebarDrag() {
        cancelFrameAnimation()
        titlebarDragGeneration += 1
        pendingTitlebarTileAnimation = true
        titlebarDragStartFrame = frame
    }

    func endTitlebarDrag() {
        let generation = titlebarDragGeneration
        // WindowServer applies a tiling target just after performDrag returns.
        // The first meaningful size change consumes this intent; this timeout is
        // only a safety expiry and cannot animate unrelated later resizes.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { [weak self] in
            guard let self, self.titlebarDragGeneration == generation else { return }
            self.pendingTitlebarTileAnimation = false
            self.titlebarDragStartFrame = nil
        }
    }

    func performConfiguredTitlebarDoubleClick() {
        switch TitlebarDoubleClickAction.resolve(
            UserDefaults.standard.string(forKey: "AppleActionOnDoubleClick")
        ) {
        case .minimize:
            miniaturize(nil)
        case .fill:
            toggleFilledFrame()
        case .none:
            break
        }
    }

    override func setFrame(_ frameRect: NSRect, display flag: Bool) {
        guard !isForwardingFrameChange else {
            super.setFrame(frameRect, display: flag)
            return
        }
        forwardFrame(frameRect, display: flag, requestedAnimation: false)
    }

    override func setFrame(_ frameRect: NSRect, display flag: Bool, animate animateFlag: Bool) {
        guard !isForwardingFrameChange else {
            super.setFrame(frameRect, display: flag, animate: animateFlag)
            return
        }
        forwardFrame(frameRect, display: flag, requestedAnimation: animateFlag)
    }

    override func animationResizeTime(_ newFrame: NSRect) -> TimeInterval {
        usesShellularAnimationDuration
            ? Self.animationDuration
            : super.animationResizeTime(newFrame)
    }

    private func forwardFrame(_ target: NSRect, display: Bool, requestedAnimation: Bool) {
        if frameAnimationTimer != nil,
           let frameAnimationTarget,
           framesMatch(target, frameAnimationTarget) {
            return
        }
        cancelFrameAnimation()
        let tileAnimation = consumeTileAnimationIfNeeded(for: target)
        let shouldAnimate = requestedAnimation || tileAnimation
        isForwardingFrameChange = true
        usesShellularAnimationDuration = tileAnimation
        super.setFrame(target, display: display, animate: shouldAnimate)
        usesShellularAnimationDuration = false
        isForwardingFrameChange = false
    }

    private func consumeTileAnimationIfNeeded(for target: NSRect) -> Bool {
        guard pendingTitlebarTileAnimation,
              !inLiveResize,
              !styleMask.contains(.fullScreen),
              isVisible,
              !NSWorkspace.shared.accessibilityDisplayShouldReduceMotion else {
            return false
        }
        let meaningful = abs(frame.width - target.width) >= Self.meaningfulSizeDelta ||
            abs(frame.height - target.height) >= Self.meaningfulSizeDelta
        if meaningful {
            pendingTitlebarTileAnimation = false
            if let targetScreen = screenContaining(target),
               framesMatch(target, targetScreen.visibleFrame) {
                restoredFrame = titlebarDragStartFrame
            }
            titlebarDragStartFrame = nil
        }
        return meaningful
    }

    private func toggleFilledFrame() {
        guard !styleMask.contains(.fullScreen), let screen else { return }
        let filledFrame = constrainFrameRect(screen.visibleFrame, to: screen)
        let target: NSRect
        if framesMatch(frame, filledFrame), let restoredFrame {
            target = constrainFrameRect(restoredFrame, to: screenContaining(restoredFrame) ?? screen)
            self.restoredFrame = nil
        } else {
            restoredFrame = frame
            target = filledFrame
        }

        animateFrame(to: target)
    }

    private func animateFrame(to target: NSRect) {
        cancelFrameAnimation()
        let source = frame
        guard !framesMatch(source, target) else { return }

        let startedAt = ProcessInfo.processInfo.systemUptime
        let framesPerSecond = max(screen?.maximumFramesPerSecond ?? 60, 60)
        let timer = Timer(timeInterval: 1 / Double(framesPerSecond), repeats: true) { [weak self] timer in
            guard let self else {
                timer.invalidate()
                return
            }
            let elapsed = ProcessInfo.processInfo.systemUptime - startedAt
            let linearProgress = min(elapsed / Self.animationDuration, 1)
            let progress = WindowFrameAnimationTiming.easedProgress(
                elapsed: elapsed,
                duration: Self.animationDuration
            )
            let easedProgress = CGFloat(progress)
            let nextFrame = NSRect(
                x: source.origin.x + (target.origin.x - source.origin.x) * easedProgress,
                y: source.origin.y + (target.origin.y - source.origin.y) * easedProgress,
                width: source.width + (target.width - source.width) * easedProgress,
                height: source.height + (target.height - source.height) * easedProgress
            )
            self.applyAnimatedFrame(linearProgress >= 1 ? target : nextFrame)
            if linearProgress >= 1 {
                timer.invalidate()
                self.frameAnimationTimer = nil
                self.frameAnimationTarget = nil
            }
        }
        timer.tolerance = 0
        frameAnimationTarget = target
        frameAnimationTimer = timer
        RunLoop.main.add(timer, forMode: .common)
    }

    private func applyAnimatedFrame(_ target: NSRect) {
        isForwardingFrameChange = true
        super.setFrame(target, display: true)
        isForwardingFrameChange = false
    }

    private func cancelFrameAnimation() {
        frameAnimationTimer?.invalidate()
        frameAnimationTimer = nil
        frameAnimationTarget = nil
    }

    private func screenContaining(_ frame: NSRect) -> NSScreen? {
        NSScreen.screens.max {
            $0.frame.intersection(frame).width * $0.frame.intersection(frame).height <
                $1.frame.intersection(frame).width * $1.frame.intersection(frame).height
        }
    }

    private func framesMatch(_ left: NSRect, _ right: NSRect) -> Bool {
        abs(left.minX - right.minX) < 2 &&
            abs(left.minY - right.minY) < 2 &&
            abs(left.width - right.width) < 2 &&
            abs(left.height - right.height) < 2
    }
}
