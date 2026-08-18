import { describe, expect, it } from "vitest";
import Localization from "./localization";

describe("Localization", () => {
	it("treats replacement names as literal placeholder text", () => {
		const localization = new Localization();
		localization.set("message", `Open $${"{file.name}"} in $${"{path(}"}`);

		expect(
			localization.get("message", {
				"file.name": "report.txt",
				"path(": "/tmp",
			}),
		).toBe("Open report.txt in /tmp");
	});
});
