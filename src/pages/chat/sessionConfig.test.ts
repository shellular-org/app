import type { AiSessionConfigOption } from "@shellular/protocol";
import { describe, expect, it } from "vitest";
import {
	getProminentConfigOptions,
	overlayPendingConfigValues,
	reconcileDraftConfig,
} from "./sessionConfig";

function modelOption(
	currentValue: string,
	values = ["gpt-5.5", "gpt-5.6-sol"],
): AiSessionConfigOption {
	return {
		id: "model",
		name: "Model",
		category: "model",
		type: "select",
		currentValue,
		options: values.map((value) => ({ value, name: value })),
	};
}

describe("reconcileDraftConfig", () => {
	it("applies a displayed cached model when the live session uses its default", () => {
		const displayed = modelOption("gpt-5.5");
		const live = modelOption("gpt-5.6-sol");

		expect(reconcileDraftConfig([displayed], [live], new Set())).toEqual({
			changes: [{ option: live, value: "gpt-5.5" }],
			unsupported: [],
		});
	});

	it("lets an explicit draft choice win over its cached display value", () => {
		expect(
			reconcileDraftConfig(
				[modelOption("gpt-5.5")],
				[modelOption("gpt-5.6-sol")],
				new Set(["model"]),
			),
		).toEqual({ changes: [], unsupported: [] });
	});

	it("reports a stale displayed model that the live session cannot select", () => {
		const live = modelOption("gpt-5.6-sol", ["gpt-5.6-sol"]);
		const result = reconcileDraftConfig(
			[modelOption("gpt-5.5")],
			[live],
			new Set(),
		);

		expect(result.changes).toEqual([]);
		expect(result.unsupported).toEqual([{ option: live, value: "gpt-5.5" }]);
	});
});

describe("getProminentConfigOptions", () => {
	it("keeps the same model/mode/thought-level priority used by the composer", () => {
		const fallback = {
			...modelOption("gpt-5.5"),
			id: "fallback",
			category: "other",
		};
		const model = modelOption("gpt-5.5");

		expect(getProminentConfigOptions([fallback, model])).toEqual([model]);
	});
});

describe("overlayPendingConfigValues", () => {
	it("keeps the newest optimistic choice visible over an older live response", () => {
		const confirmed = modelOption("gpt-5.6-sol");
		const desired = modelOption("gpt-5.5");

		expect(
			overlayPendingConfigValues(
				[confirmed],
				[{ option: desired, value: "gpt-5.5" }],
			),
		).toEqual([{ ...confirmed, currentValue: "gpt-5.5" }]);
	});
});
