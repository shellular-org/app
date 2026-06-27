import { authenticatedRequest } from "lib/auth";

export type AccountHistory = {
	hosts: HostHistory[];
	devices: DeviceHistory[];
};

export type HostHistory = {
	hostId: string;
	machineId: string | null;
	platform: string | null;
	firstSeenAt: number;
	lastSeenAt: number;
	connectionCount: number;
};

export type DeviceHistory = {
	clientId: string;
	lastHostId: string;
	appVersion: string;
	platform: "android" | "browser" | "ios";
	deviceModel: string;
	deviceIsEmulator: boolean;
	deviceManufacturer: string;
	firstSeenAt: number;
	lastSeenAt: number;
	connectionCount: number;
};

export async function loadAccountHistory(): Promise<AccountHistory> {
	const data = await authenticatedRequest<{ history: AccountHistory }>(
		"/auth/history",
	);
	return data.history;
}
