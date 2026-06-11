export default {
	async getHindiVfs() {
		return getVfs((await import("./hindi")).default);
	},
	async getGujaratiVfs() {
		return getVfs((await import("./gujarati")).default);
	},
	async getKannadaVfs() {
		return getVfs((await import("./kannada")).default);
	},
	getFont,
};

type FontVfs = Record<string, string>;

async function getVfs(vfs: FontVfs): Promise<FontVfs> {
	const results = await Promise.all(Object.values(vfs).map(base64));
	return Object.fromEntries(
		Object.keys(vfs).map((key, i) => [key, results[i]]),
	);
}

async function base64(url: string): Promise<string> {
	const response = await fetch(url);
	const blob = await response.blob();
	return new Promise<string>((resolve) => {
		const reader = new FileReader();
		reader.onloadend = () => {
			const result = reader.result;
			resolve(typeof result === "string" ? (result.split(",")[1] ?? "") : "");
		};
		reader.readAsDataURL(blob);
	});
}

function getFont(name: string) {
	return {
		bold: `${name}-bold.ttf`,
		normal: `${name}-normal.ttf`,
		italics: `${name}-italic.ttf`,
		bolditalics: `${name}-bolditalic.ttf`,
	};
}
