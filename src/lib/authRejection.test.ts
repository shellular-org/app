import { describe, expect, it } from "vitest";
import { isAuthRejection } from "./auth";

/**
 * Guards the rule that decides whether a failed `/auth/refresh` destroys the
 * stored refresh token. Getting this wrong doesn't break a build or fail
 * loudly — it just silently signs people out, so it's worth pinning down.
 */
describe("isAuthRejection", () => {
	const withStatus = (httpStatus: number) =>
		Object.assign(new Error("nope"), { httpStatus });

	it("treats 401/403 as a real rejection", () => {
		expect(isAuthRejection(withStatus(401))).toBe(true);
		expect(isAuthRejection(withStatus(403))).toBe(true);
	});

	it("does not sign out on server-side failures", () => {
		// A deploy, a crash, a rate limit — the token is still fine.
		for (const status of [500, 502, 503, 504, 429]) {
			expect(isAuthRejection(withStatus(status))).toBe(false);
		}
	});

	it("does not sign out on a bare network error", () => {
		// `fetch` rejects with a plain TypeError when the device is offline, the
		// radio is asleep, or DNS/TLS fails — no status is ever attached.
		expect(isAuthRejection(new TypeError("Failed to fetch"))).toBe(false);
		expect(isAuthRejection(new Error("Authentication failed."))).toBe(false);
	});

	it("does not sign out on malformed or missing errors", () => {
		expect(isAuthRejection(undefined)).toBe(false);
		expect(isAuthRejection(null)).toBe(false);
		expect(isAuthRejection({})).toBe(false);
		expect(isAuthRejection("401")).toBe(false);
	});

	it("does not treat other 4xx as a credential rejection", () => {
		// 400/404 mean the request or route was wrong, not that we're signed out.
		expect(isAuthRejection(withStatus(400))).toBe(false);
		expect(isAuthRejection(withStatus(404))).toBe(false);
	});
});
