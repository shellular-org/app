import { describe, expect, it, vi } from "vitest";
import { redirectVerticalWheelToHorizontal } from "./horizontalWheel";

function wheel(
	overrides: Partial<
		Parameters<typeof redirectVerticalWheelToHorizontal>[0]
	> = {},
) {
	return {
		deltaX: 0,
		deltaY: 20,
		preventDefault: vi.fn(),
		currentTarget: { scrollLeft: 10, scrollWidth: 200, clientWidth: 100 },
		...overrides,
	};
}

describe("redirectVerticalWheelToHorizontal", () => {
	it("uses an ordinary vertical wheel while horizontal overflow remains", () => {
		const event = wheel();
		expect(redirectVerticalWheelToHorizontal(event)).toBe(true);
		expect(event.currentTarget.scrollLeft).toBe(30);
		expect(event.preventDefault).toHaveBeenCalledOnce();
	});

	it("does not consume native horizontal gestures or boundary movement", () => {
		const gesture = wheel({ deltaX: 30, deltaY: 10 });
		expect(redirectVerticalWheelToHorizontal(gesture)).toBe(false);
		expect(gesture.preventDefault).not.toHaveBeenCalled();

		const boundary = wheel({
			deltaY: -20,
			currentTarget: { scrollLeft: 0, scrollWidth: 200, clientWidth: 100 },
		});
		expect(redirectVerticalWheelToHorizontal(boundary)).toBe(false);
		expect(boundary.preventDefault).not.toHaveBeenCalled();
	});

	it("does not consume wheel events when there is no overflow", () => {
		const event = wheel({
			currentTarget: { scrollLeft: 0, scrollWidth: 100, clientWidth: 100 },
		});
		expect(redirectVerticalWheelToHorizontal(event)).toBe(false);
		expect(event.preventDefault).not.toHaveBeenCalled();
	});
});
