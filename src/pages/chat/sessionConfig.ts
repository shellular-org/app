import type { AiSessionConfigOption } from "@shellular/protocol";

export type SessionConfigChange = {
	option: AiSessionConfigOption;
	value: string | boolean;
};

export type DraftConfigReconciliation = {
	changes: SessionConfigChange[];
	unsupported: SessionConfigChange[];
};

export function flattenConfigValues(option: AiSessionConfigOption) {
	const values: { value: string; name: string }[] = [];
	for (const item of option.options ?? []) {
		if ("options" in item && Array.isArray(item.options)) {
			for (const child of item.options) {
				values.push({
					value: String(child.value),
					name: child.name || String(child.value),
				});
			}
			continue;
		}
		if ("value" in item) {
			values.push({
				value: String(item.value),
				name: item.name || String(item.value),
			});
		}
	}
	return values;
}

export function getProminentConfigOptions(options: AiSessionConfigOption[]) {
	const supported = options.filter(
		(option) => option.type === "select" && flattenConfigValues(option).length,
	);
	const preferred = supported.filter((option) =>
		["mode", "model", "thought_level"].includes(String(option.category ?? "")),
	);
	return (preferred.length ? preferred : supported).slice(0, 3);
}

export function overlayPendingConfigValues(
	confirmed: AiSessionConfigOption[],
	pending: Iterable<SessionConfigChange>,
) {
	const desiredById = new Map(
		Array.from(pending, (change) => [change.option.id, change.value]),
	);
	return confirmed.map((option) => {
		const desired = desiredById.get(option.id);
		return desired === undefined
			? option
			: { ...option, currentValue: desired };
	});
}

/**
 * Compare what a draft composer displayed with the options returned by its new
 * live session. Explicit changes are applied separately and win over cached
 * display values.
 */
export function reconcileDraftConfig(
	displayed: AiSessionConfigOption[],
	live: AiSessionConfigOption[],
	explicitConfigIds: ReadonlySet<string>,
): DraftConfigReconciliation {
	const liveById = new Map(live.map((option) => [option.id, option]));
	const changes: SessionConfigChange[] = [];
	const unsupported: SessionConfigChange[] = [];

	for (const displayedOption of displayed) {
		if (explicitConfigIds.has(displayedOption.id)) continue;
		const liveOption = liveById.get(displayedOption.id);
		if (!liveOption) continue;
		const value = displayedOption.currentValue;
		if (String(value) === String(liveOption.currentValue)) continue;

		const change = { option: liveOption, value };
		const allowedValues = flattenConfigValues(liveOption);
		if (
			liveOption.type === "select" &&
			!allowedValues.some((candidate) => candidate.value === String(value))
		) {
			unsupported.push(change);
			continue;
		}
		changes.push(change);
	}

	return { changes, unsupported };
}
