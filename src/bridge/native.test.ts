import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(
	() =>
		[] as Array<{
			success: (value: unknown) => void;
			action: string;
			args: unknown[];
		}>,
);

beforeEach(() => {
	calls.length = 0;
	vi.stubGlobal("Bridge", {
		exec(
			success: (value: unknown) => void,
			_error: (error: Error) => void,
			_service: string,
			action: string,
			args: unknown[],
		) {
			calls.push({ success, action, args });
		},
	});
});

import native from "./native";

describe("desktop command bridge", () => {
	it("uses tokenized registrations and ignores events after disposal", () => {
		const handler = vi.fn();
		const dispose = native.setDesktopCommandHandler(handler);
		const registration = calls[0];
		expect(registration?.action).toBe("setDesktopCommandHandler");
		expect(registration?.args[0]).toMatch(/^desktop-command-/);

		registration?.success("open-folder");
		expect(handler).toHaveBeenCalledWith("open-folder");
		registration?.success(null);
		expect(handler).toHaveBeenCalledOnce();

		dispose();
		expect(calls[1]).toMatchObject({
			action: "clearDesktopCommandHandler",
			args: registration?.args,
		});
		registration?.success("open-folder");
		expect(handler).toHaveBeenCalledOnce();
	});
});
