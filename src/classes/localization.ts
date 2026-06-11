export type Replacements = Record<string, string | number>;

export default class Localization extends Map<string, string> {
	static DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
	static MONTHS_SHORT = [
		"Jan",
		"Feb",
		"Mar",
		"Apr",
		"May",
		"Jun",
		"Jul",
		"Aug",
		"Sep",
		"Oct",
		"Nov",
		"Dec",
	];

	get(key: string, replacements?: Replacements): string | undefined {
		let value = super.get(key);
		if (!value) return undefined;

		if (replacements) {
			for (const [search, replaceWith] of Object.entries(replacements)) {
				value = value.replace(
					new RegExp(`\\$\\{${search}\\}`, "g"),
					String(replaceWith),
				);
			}
		}

		return value;
	}

	value(key: string): string | undefined {
		return super.get(key);
	}

	/**
	 * Get the name of the language.
	 * @returns {string} The name of the language.
	 */
	get name() {
		return super.get("langName");
	}

	/**
	 * Get the language ID.
	 * @returns {string} The language ID.
	 */
	get id() {
		return super.get("lang");
	}
}
