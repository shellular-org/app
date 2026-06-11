import Localization, { type Replacements } from "classes/localization";
import defaultLang from "lang/english";

let lang = new Localization(Object.entries(defaultLang));

export default {
	get list() {
		return [{ name: "English", value: "en-US" }];
	},

	get(key: string, replacements?: Replacements): string {
		return lang.get(key, replacements) ?? key;
	},

	get id(): string {
		return lang.id ?? "en-US";
	},

	get name(): string {
		return lang.name ?? "English";
	},

	async set(id: string): Promise<Localization> {
		return setLanguage(id);
	},
};

/**
 * Get language by name
 * @param {string} name
 * @returns {Promise<Lang>}
 */
async function setLanguage(name: string): Promise<Localization> {
	name = name?.toLowerCase();

	let module: { default: Record<string, string> } | null = null;

	switch (name) {
		default: {
			name = "en";
			module = await import("./english");
			break;
		}
	}

	if (!module) {
		return new Localization(Object.entries(defaultLang));
	}

	lang = new Localization(
		Object.entries({
			...defaultLang,
			...module.default,
		}),
	);

	return lang;
}
