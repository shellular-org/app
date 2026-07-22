import type { AuthedClientInfo } from "@shellular/protocol";
import bridge from "./bridge";

export type LocalCliClientMutation =
	| { action: "set-approval"; clientId: string; approved: boolean }
	| { action: "delete"; clientId: string };
export type LocalCliLogEntry = {
	id: number;
	timestamp: string;
	level: "log" | "debug" | "warn" | "error";
	message: string;
};
export type LocalCliClient = {
	clientId: string;
	platform: string;
	appVersion: string;
	deviceModel?: string;
	approved: boolean;
	connected: boolean;
	firstSeen: string;
	lastSeen: string;
};
export type LocalCliSnapshot = {
	state: string;
	cliVersion?: string;
	protocolVersion?: number;
	pid?: number;
	port?: number;
	uptimeMs?: number;
	directory?: string;
	machineName?: string;
	source?: string;
	lifecycle?: "app-owned" | "attached";
	remoteState?: string;
	qrData?: string;
	clients: LocalCliClient[];
	logs: LocalCliLogEntry[];
};
export type LocalCliTicketResponse = {
	wsUrl: string;
	ticket: string;
	hostId: string;
	clientId: string;
	encryptionKey: string;
	protocolVersion: number;
};
export type LocalCliTicketClient = Omit<
	AuthedClientInfo,
	"hostId" | "platform"
> & { platform: "macos" };

const local = bridge("LocalCLI");

export type LocalCliCapability = {
	available: boolean;
	sandboxed: boolean;
	protocolVersion: number;
};

export default {
	capability: () => local("capability") as Promise<LocalCliCapability>,
	ensureRunning: () => local("ensureRunning") as Promise<LocalCliSnapshot>,
	status: () => local("status") as Promise<LocalCliSnapshot>,
	ticket: (client: LocalCliTicketClient) =>
		local("ticket", [
			{ protocolVersion: 1, client },
		]) as Promise<LocalCliTicketResponse>,
	mutateClient: (mutation: LocalCliClientMutation) =>
		local("mutateClient", [mutation]) as Promise<{ success: boolean }>,
	stop: () => local("stop") as Promise<{ success: boolean }>,
	disable: () => local("disable") as Promise<{ success: boolean }>,
	qrCode: (data: string) => local("qrCode", [data]) as Promise<string>,
};
