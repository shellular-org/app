import * as store from "lib/store";

const RATING_KEY = "shellular:app-rating-prompted";
const RATING_SESSION_COUNT_KEY = "shellular:app-rating-session-count";
const MIN_SESSIONS_BEFORE_PROMPT = 3;

export async function hasUserBeenPromptedForRating(): Promise<boolean> {
	const prompted = await store.get<boolean>(RATING_KEY);
	return !!prompted;
}

export async function incrementSessionCount(): Promise<number> {
	const current = (await store.get<number>(RATING_SESSION_COUNT_KEY)) || 0;
	const updated = current + 1;
	await store.set(RATING_SESSION_COUNT_KEY, updated);
	return updated;
}

export async function shouldPromptForRating(): Promise<boolean> {
	if (await hasUserBeenPromptedForRating()) {
		return false;
	}
	const sessionCount = (await store.get<number>(RATING_SESSION_COUNT_KEY)) || 0;
	return sessionCount >= MIN_SESSIONS_BEFORE_PROMPT;
}

export async function markRatingPrompted(): Promise<void> {
	await store.set(RATING_KEY, true);
}

export function openAppStore(): void {
	if (process.env.PLATFORM === "ios") {
		const url = "https://apps.apple.com/us/app/shellular/id6761985327";
		window.location.href = url;
	} else if (process.env.PLATFORM === "android") {
		const url =
			"https://play.google.com/store/apps/details?id=io.foxbiz.shellular";
		window.location.href = url;
	}
}
