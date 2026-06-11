export type ContextWindowUsage = {
	usedTokens: number;
	maxTokens: number;
};

export function readContextWindowUsage(
	properties: Record<string, unknown>,
): ContextWindowUsage | null {
	const status = asRecord(properties.status);
	const usage = asRecord(properties.usage);
	const maxTokens = firstFiniteNumber(status?.size, usage?.size);
	const usedTokens = firstFiniteNumber(status?.used, usage?.used);
	if (!isValidTokenCount(maxTokens) || !isValidTokenCount(usedTokens)) {
		return null;
	}
	return { maxTokens, usedTokens };
}

export function getContextWindowPercentage(
	usedTokens: number,
	maxTokens: number,
): number | null {
	if (maxTokens <= 0) return null;
	return (usedTokens / maxTokens) * 100;
}

export function getContextWindowState(percentage: number) {
	if (percentage > 90) return "danger";
	if (percentage >= 70) return "warning";
	return "normal";
}

export function formatTokenCount(value: number): string {
	if (value >= 1_000_000) return `${Math.round(value / 1_000_000)}m`;
	if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
	return Math.round(value).toString();
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function firstFiniteNumber(...values: unknown[]): number | null {
	for (const value of values) {
		if (typeof value === "number" && Number.isFinite(value)) return value;
	}
	return null;
}

function isValidTokenCount(value: number | null): value is number {
	return value !== null && value >= 0;
}
