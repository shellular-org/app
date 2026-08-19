import { getBaseServerUrl } from "lib/settings";
import * as store from "lib/store";

/**
 * Notices are short, dismiss-once messages the server serves from a JSON file
 * (see server/content/notices.json). Each has a stable `id`; once a user
 * dismisses an id we never show it again, but a brand-new id will pop up. This
 * lets us push a notice to already-installed apps without an app update.
 */

export type Notice = {
	id: string;
	title: string;
	body: string;
	createdAt: string;
};

const DISMISSED_KEY = "shellular:dismissed-notice-ids";

async function getDismissedIds(): Promise<string[]> {
	const ids = await store.get<string[]>(DISMISSED_KEY);
	return Array.isArray(ids) ? ids : [];
}

export async function dismissNotice(id: string): Promise<void> {
	const dismissed = await getDismissedIds();
	if (dismissed.includes(id)) return;
	await store.set(DISMISSED_KEY, [...dismissed, id]);
}

async function fetchNotices(): Promise<Notice[]> {
	const baseUrl = await getBaseServerUrl();
	const res = await fetch(`${baseUrl}/notices`);
	if (!res.ok) return [];
	const data = (await res.json()) as { notices?: Notice[] };
	return Array.isArray(data.notices) ? data.notices : [];
}

/**
 * Returns every notice the user hasn't dismissed yet, in server order. The app
 * shows them one at a time. Network or parse failures are swallowed — a notice
 * is never important enough to surface an error to the user.
 */
export async function getUndismissedNotices(): Promise<Notice[]> {
	try {
		const [notices, dismissed] = await Promise.all([
			fetchNotices(),
			getDismissedIds(),
		]);
		const dismissedIds = new Set(dismissed);
		return notices.filter(
			(notice) => notice?.id && !dismissedIds.has(notice.id),
		);
	} catch {
		return [];
	}
}
