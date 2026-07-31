import {
	type BatteryUpdateMsg,
	ClientHandshakeRespMsgSchema,
	type ClientIncomingMsg,
	ClientIncomingMsgSchema,
	type ClientInfo,
	type ClientToHostMsg,
	type ClientToServerMsg,
	type HostInfo,
	MsgType,
	parseMessage,
	ServerCloseCodeAndReason,
	type SessionJoinedMsg,
} from "@shellular/protocol";
import native from "bridge/native";
import { getAccessTokenForAuth } from "lib/auth";
import {
	decryptMessage,
	decryptProxyBinaryFrame,
	encryptMessage,
	isPlaintextMessage,
	type ProxyBinaryHttpResponseData,
} from "lib/e2ee";
import {
	getHostCapabilities,
	type HostCapabilities,
} from "lib/hostCapabilities";
import { getBaseServerUrl } from "lib/settings";
import * as store from "lib/store";
import { nanoid } from "nanoid";

type OutgoingMsg = ClientToHostMsg | ClientToServerMsg;
export type SendableMsg = {
	[TType in OutgoingMsg["type"]]: Omit<
		Extract<OutgoingMsg, { type: TType }>,
		"id" | "clientId"
	>;
}[OutgoingMsg["type"]];

export type ConnectionStatus =
	| "disconnected"
	| "connecting"
	| "connected"
	| "reconnecting";

export interface BatteryInfo {
	percentage: number;
	charging: boolean;
}

type Listener = () => void;
const PROXY_BINARY_HTTP_RESPONSE_DATA_EVENT = "proxy:binary:http-response-data";

/**
 * Host identity plus the dynamic CLI update status. `updateAvailable` /
 * `latestCliVersion` aren't part of `HostInfo` (they change over a session, so
 * the protocol carries them on SESSION_JOINED rather than host identity); we
 * fold them into the snapshot here for the UI to read.
 */
export type ConnectedHostInfo = HostInfo & {
	updateAvailable?: boolean;
	latestCliVersion?: string;
};

interface ConnectionSnapshot {
	serverUrl: string;
	sessionToken: string;
	hostInfo: ConnectedHostInfo | null;
	connectionStatus: ConnectionStatus;
	batteryInfo: BatteryInfo | null;
	/**
	 * How many reconnect attempts have been made in the current run (reset to 0
	 * whenever we settle into `connected` or `disconnected`). The UI reads this
	 * to decide when a reconnect has dragged on long enough to be worth offering
	 * a way out of — see ConnectionStatus.
	 */
	reconnectAttempt: number;
	/**
	 * True from the moment the CLI reports it's self-updating until the next
	 * successful connect (or until we give up reconnecting). The CLI restarts
	 * mid-update, so the socket drop that follows is expected rather than a
	 * fault — the reconnect overlay reads this to explain the wait instead of
	 * implying something broke.
	 */
	hostUpdating: boolean;
}

type HandshakeError = Error & {
	code?: number;
	reason?: string;
	userMessage?: string;
};

type ConnectionCloseDetail = {
	code: number;
	reason: string;
};

type WebSocketTokenResponse = {
	wsToken: string;
	clientId: string;
	expiresIn: number;
	/**
	 * The regional relay to open the WebSocket to (e.g. wss://in.shellular.dev).
	 * Central returns this from the host's live presence so the app lands on the
	 * SAME relay its CLI is connected to — in-process relaying can't cross regions.
	 *
	 * `relayUrl` is absent on the legacy server, and we need to support it for people
	 * who already have an older version of CLI running on their VPS for backwards
	 * compatibility. In that case, the server itself is the relay so we just
	 * synthesize it from the server URL.
	 */
	relayUrl: string;
};

/** Thrown by requestWebSocketToken; `httpStatus` lets callers detect 4xx to
 * distinguish "this server doesn't support the request" (old server) from a
 * generic network/5xx failure that shouldn't trigger fallback. */
type TokenRequestError = Error & { httpStatus?: number };

// Legacy central server. Older CLI versions still point at this domain and
// don't know how to return a `relayUrl` — for them the domain itself IS the
// relay (see requestWebSocketToken).
const OLD_SERVER_URL = "https://api.shellular.dev";
const OLD_RELAY_URL = "wss://api.shellular.dev/app";

// Per-host "which central server actually works" preference, so mixed CLI
// versions (some hosts upgraded to the new server, some still on the old
// one) don't have to renegotiate every connection. Keyed by hostId because a
// single user can have multiple hosts on either CLI version.
type ServerPreference = "new" | "old";
function serverPrefStorageKey(hostId: string): string {
	return `shellular:server-pref:${hostId}`;
}
async function getServerPreference(
	hostId: string,
): Promise<ServerPreference | null> {
	return store.get<ServerPreference>(serverPrefStorageKey(hostId));
}
async function setServerPreference(
	hostId: string,
	pref: ServerPreference,
): Promise<void> {
	await store.set(serverPrefStorageKey(hostId), pref);
}

const RECV_TIMEOUT = 40_000;
const PING_INTERVAL_MS = 25_000;
// If no inbound frame (pong or anything else) arrives within this window, the
// socket is considered dead. The OS frequently kills the TCP connection while
// the app is backgrounded/locked without ever delivering a `close` frame, so we
// can't rely on `close` alone. ~2× the ping interval gives one missed pong of
// slack before we tear down and reconnect.
const LIVENESS_TIMEOUT_MS = 55_000;
const MAX_RECONNECT_ATTEMPTS = 10;
// Backoff runs 4s → 8s → 16s → 20s (capped) per attempt. Retrying faster than
// this rarely helps: a host that's genuinely gone won't be back in a second,
// and the sub-second reconnects that do succeed are handled by reconnectNow()
// on app resume / network-online rather than by this backoff.
const BASE_RECONNECT_DELAY_MS = 4000;
const MAX_RECONNECT_DELAY_MS = 20_000;
const CLIENT_ID_STORAGE_KEY = "shellular:client-id";

class MessageEvent<TMsg extends ClientIncomingMsg> extends Event {
	readonly msg: TMsg;

	constructor(type: string, msg: TMsg) {
		super(type);
		this.msg = msg;
	}
}

class ProxyBinaryHttpResponseDataEvent extends Event {
	readonly data: ProxyBinaryHttpResponseData;

	constructor(data: ProxyBinaryHttpResponseData) {
		super(PROXY_BINARY_HTTP_RESPONSE_DATA_EVENT);
		this.data = data;
	}
}

export async function getClientId(): Promise<string> {
	const existing = await store.get<string>(CLIENT_ID_STORAGE_KEY);
	if (existing) {
		return existing;
	}

	const clientId = `c_${nanoid(16)}`;
	await store.set(CLIENT_ID_STORAGE_KEY, clientId);
	return clientId;
}

export class Connection extends EventTarget {
	private ws: WebSocket | null = null;
	private pendingResponses = new Map<string, (msg: unknown) => void>();
	private encryptionKey: Uint8Array | null = null;
	// Resolved from the host's version on SESSION_JOINED. Conservative until
	// then, so anything sent before the handshake lands stays uncompressed.
	private hostCapabilities: HostCapabilities = { gzipPayloads: false };
	private clientId: string | null = null;
	// The CENTRAL base that actually worked for this host (new or old server),
	// resolved fresh from settings each time open() runs (see
	// resolveWebSocketToken). Read back by ConnectionManager so future
	// reconnects/attempts for this host start from the known-good server.
	resolvedServerUrl: string;
	// Timestamp of the last inbound frame of any kind. Any traffic from the host
	// (pong, battery update, terminal output, …) proves the socket is alive.
	private lastInboundAt = Date.now();

	constructor(initialServerUrl: string, encryptionKey?: Uint8Array | null) {
		super();
		this.resolvedServerUrl = initialServerUrl;
		this.encryptionKey = encryptionKey ?? null;
	}

	private handleIncomingMessage(raw: string) {
		let msgRaw = raw;

		// Decrypt encrypted envelopes before Zod parsing
		if (this.encryptionKey) {
			try {
				const envelope = JSON.parse(raw);
				if (envelope.type === MsgType.ENCRYPTED) {
					const inner = decryptMessage(envelope, this.encryptionKey);
					if (!inner) return; // silent drop
					msgRaw = JSON.stringify(inner);
				}
			} catch {
				console.warn("[E2EE] Failed to pre-parse message, dropping");
				return;
			}
		}

		const parsed = parseMessage(msgRaw, ClientIncomingMsgSchema);
		if (!parsed.data) {
			console.error("Received invalid message:", {
				error: parsed.error,
				raw: msgRaw,
			});
			return;
		}

		const msg = parsed.data;

		if ("respTo" in msg && msg.respTo) {
			const pending = this.pendingResponses.get(msg.respTo);
			if (pending) {
				this.pendingResponses.delete(msg.respTo);
				pending(msg);
			}
		}

		this.dispatchEvent(new MessageEvent(msg.type, msg));
	}

	private handleIncomingBinaryMessage(frame: ArrayBuffer) {
		if (!this.encryptionKey) {
			console.warn(
				"[E2EE] Received proxy binary frame without an encryption key",
			);
			return;
		}

		const msg = decryptProxyBinaryFrame(frame, this.encryptionKey);
		if (!msg) return;

		this.dispatchEvent(new ProxyBinaryHttpResponseDataEvent(msg));
	}

	private async handleIncomingWebSocketData(data: unknown) {
		this.lastInboundAt = Date.now();

		if (typeof data === "string") {
			this.handleIncomingMessage(data);
			return;
		}

		if (data instanceof ArrayBuffer) {
			this.handleIncomingBinaryMessage(data);
			return;
		}

		if (ArrayBuffer.isView(data)) {
			const view = data as ArrayBufferView;
			const bytes = new Uint8Array(view.byteLength);
			bytes.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
			this.handleIncomingBinaryMessage(bytes.buffer);
			return;
		}

		if (data instanceof Blob) {
			this.handleIncomingBinaryMessage(await data.arrayBuffer());
		}
	}

	async open(hostId: string): Promise<SessionJoinedMsg> {
		const accessToken =
			process.env.PLATFORM === "browser" ? null : await getAccessTokenForAuth();
		if (process.env.PLATFORM !== "browser" && !accessToken) {
			throw new Error("Sign in again to connect to this host.");
		}
		const deviceInfo = await native.getDeviceInfo();
		const clientId = await getClientId();
		const appVersion = `${process.env.VERSION} (${process.env.VERSION_CODE})`;
		const clientInfo: ClientInfo = {
			hostId,
			clientId,
			appVersion,
			platform: process.env.PLATFORM,
			deviceModel: deviceInfo.model,
			deviceIsEmulator: deviceInfo.isEmulator,
			deviceManufacturer: deviceInfo.manufacturer,
		};
		// The token request goes to CENTRAL server; to get the token and the
		// relay associated with the host. Resolves new-vs-old server per hostId,
		// alternating on 4xx and remembering whichever one works.
		const { url: resolvedServerUrl, wsInfo } = await resolveWebSocketToken(
			hostId,
			accessToken,
			clientInfo,
		);
		this.resolvedServerUrl = resolvedServerUrl;

		const wsUrl = new URL(wsInfo.relayUrl);
		wsUrl.searchParams.set("wsToken", wsInfo.wsToken);

		this.clientId = wsInfo.clientId;
		this.ws = new WebSocket(wsUrl.toString());
		const ws = this.ws;
		ws.binaryType = "arraybuffer";

		return new Promise((resolve, reject) => {
			let settled = false;

			const cleanupHandshakeListeners = () => {
				ws.removeEventListener("error", onHandshakeError);
				ws.removeEventListener("close", onHandshakeClose);
				ws.removeEventListener("message", onHandshakeMessage);
			};

			const resolveOnce = (msg: SessionJoinedMsg) => {
				if (settled) return;
				settled = true;
				cleanupHandshakeListeners();
				resolve(msg);
			};

			const rejectOnce = (error: Error) => {
				if (settled) return;
				settled = true;
				cleanupHandshakeListeners();
				reject(error);
			};

			if (!ws) {
				rejectOnce(new Error("WebSocket connection was not created"));
				return;
			}

			const onHandshakeError = (event: Event) => {
				console.error("[Connection] WebSocket error during handshake", event);
			};

			const onHandshakeClose = (event: CloseEvent) => {
				const message = getHandshakeCloseMessage(event.code, event.reason);
				console.error("[Connection] WebSocket closed during handshake", {
					code: event.code,
					reason: event.reason,
					message,
				});
				rejectOnce(
					createHandshakeError({
						message,
						code: event.code,
						reason: event.reason,
					}),
				);
			};

			const onHandshakeMessage = (event: globalThis.MessageEvent) => {
				let raw = String(event.data);

				// Decrypt if the handshake response arrives encrypted
				if (this.encryptionKey) {
					try {
						const envelope = JSON.parse(raw);
						if (envelope.type === MsgType.ENCRYPTED) {
							const inner = decryptMessage(envelope, this.encryptionKey);
							if (!inner) {
								rejectOnce(new Error("Failed to decrypt handshake response"));
								return;
							}
							raw = JSON.stringify(inner);
						}
					} catch {
						rejectOnce(new Error("Failed to decrypt handshake response"));
						return;
					}
				}

				const parsed = parseMessage(raw, ClientHandshakeRespMsgSchema);
				if (!parsed.data) {
					console.error("[Connection] Handshake parse failed", {
						error: parsed.error,

						raw,
					});
					rejectOnce(new Error(`Invalid handshake response: ${parsed.error}`));
					return;
				}

				const msg = parsed.data;

				switch (msg.type) {
					case MsgType.SESSION_JOINED:
						// The host's version arrives here and nowhere earlier, so this
						// is the first point at which outbound compression can be
						// decided.
						this.hostCapabilities = getHostCapabilities(msg.data.cliVersion);
						ws.addEventListener("message", (nextEvent) => {
							void this.handleIncomingWebSocketData(nextEvent.data);
						});
						ws.addEventListener("close", (event) => {
							this.dispatchEvent(
								new CustomEvent<ConnectionCloseDetail>("disconnected", {
									detail: { code: event.code, reason: event.reason },
								}),
							);
						});
						resolveOnce(msg);
						return;

					case MsgType.SESSION_ERROR:
						console.error("[Connection] Handshake failed with session:error", {
							error: msg.error,
						});
						rejectOnce(new Error(msg.error));
						return;
				}
			};

			ws.addEventListener("error", onHandshakeError, { once: true });
			ws.addEventListener("close", onHandshakeClose, { once: true });
			ws.addEventListener("message", onHandshakeMessage, { once: true });
		});
	}

	send(msgObj: SendableMsg): string | null {
		if (!this.ws) {
			return null;
		}

		// Guard: if WebSocket is not open, trigger disconnect detection
		if (this.ws.readyState !== WebSocket.OPEN) {
			this.ws.close();
			throw new Error("WebSocket is not open");
		}

		const id = `c_${nanoid(10)}`;
		const fullMsg = { id, ...msgObj };

		try {
			if (this.encryptionKey && !isPlaintextMessage(msgObj.type)) {
				// With E2EE the relay can't inject clientId, so we include it
				const msgWithClient = this.clientId
					? { ...fullMsg, clientId: this.clientId }
					: fullMsg;
				const envelope = encryptMessage(
					msgWithClient as { id: string; type: string },
					this.encryptionKey,
					this.hostCapabilities.gzipPayloads,
				);
				this.ws.send(JSON.stringify(envelope));
			} else {
				this.ws.send(JSON.stringify(fullMsg));
			}
		} catch (err) {
			console.error("failed to send message", err);
		}

		return id;
	}

	sendRequest<TMsg = unknown>(msgObj: SendableMsg): Promise<TMsg> {
		return new Promise((resolve) => {
			const msgId = this.send(msgObj);
			if (!msgId) {
				resolve({
					id: "send_failed",
					type: MsgType.SESSION_ERROR,
					error: "Unable to send request",
				} as TMsg);
				return;
			}
			const timeout = setTimeout(() => {
				this.pendingResponses.delete(msgId);
				console.error("Request timed out", msgObj);
				resolve({
					id: `timeout_${msgId}`,
					type: MsgType.SESSION_ERROR,
					respTo: msgId,
					error: "Request timed out",
				} as TMsg);
			}, RECV_TIMEOUT);

			this.pendingResponses.set(msgId, (msg) => {
				clearTimeout(timeout);
				resolve(msg as TMsg);
			});
		});
	}

	on<TMsg = unknown>(
		eventName: string,
		listener: (msg: TMsg | Event) => void,
	): () => void {
		const wrapped = (event: Event) => {
			if (event instanceof MessageEvent) {
				listener(event.msg as TMsg);
				return;
			}
			listener(event);
		};
		this.addEventListener(eventName, wrapped as EventListener);
		return () => this.removeEventListener(eventName, wrapped as EventListener);
	}

	onBinaryHttpResponseData(
		handler: (msg: ProxyBinaryHttpResponseData) => void,
	): () => void {
		const wrapped = (event: Event) => {
			if (event instanceof ProxyBinaryHttpResponseDataEvent) {
				handler(event.data);
			}
		};
		this.addEventListener(PROXY_BINARY_HTTP_RESPONSE_DATA_EVENT, wrapped);
		return () =>
			this.removeEventListener(PROXY_BINARY_HTTP_RESPONSE_DATA_EVENT, wrapped);
	}

	/**
	 * True when no inbound frame has arrived for longer than the given window,
	 * i.e. the socket is very likely dead even if no `close` has fired yet.
	 */
	isStale(timeoutMs: number): boolean {
		return Date.now() - this.lastInboundAt > timeoutMs;
	}

	/** Reset the liveness clock, e.g. right after a successful handshake. */
	markAlive() {
		this.lastInboundAt = Date.now();
	}

	close() {
		this.ws?.close();
	}
}

class ConnectionManager {
	private readonly listeners = new Set<Listener>();
	private snapshot: ConnectionSnapshot = {
		serverUrl: "",
		sessionToken: "",
		hostInfo: null,
		connectionStatus: "disconnected",
		batteryInfo: null,
		reconnectAttempt: 0,
		hostUpdating: false,
	};
	private connection: Connection | null = null;
	private pendingSocket: Connection | null = null;
	private pingInterval: ReturnType<typeof setInterval> | null = null;
	private activeConnectAttempt = 0;
	private reconnectAttempt = 0;
	private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
	private encryptionKey: Uint8Array | null = null;
	// The host we're currently meant to be connected to. Retained across
	// reconnects so app-resume / network-online can re-establish the session.
	private activeHostId: string | null = null;
	private onConnected:
		| ((token: string, prevStatus: ConnectionStatus) => void | Promise<void>)
		| null = null;
	private onDisconnected: (() => void) | null = null;
	private onPreDisconnect: (() => void) | null = null;

	subscribe(listener: Listener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	getSnapshot(): ConnectionSnapshot {
		return this.snapshot;
	}

	setOnConnectedCallback(
		fn: (token: string, prevStatus: ConnectionStatus) => void | Promise<void>,
	) {
		this.onConnected = fn;
	}

	setOnDisconnectedCallback(fn: () => void) {
		this.onDisconnected = fn;
	}

	setOnPreDisconnectCallback(fn: () => void) {
		this.onPreDisconnect = fn;
	}

	onMessage<TMsg = unknown>(
		type: string,
		handler: (msg: TMsg) => void,
	): () => void {
		if (!this.connection) return () => {};
		return this.connection.on(type, (msg) => {
			handler(msg as TMsg);
		});
	}

	onBinaryHttpResponseData(
		handler: (msg: ProxyBinaryHttpResponseData) => void,
	): () => void {
		if (!this.connection) return () => {};
		return this.connection.onBinaryHttpResponseData(handler);
	}

	sendMessage(msg: SendableMsg): string | null {
		if (!this.connection) {
			return null;
		}

		return this.connection.send(msg) ?? null;
	}

	sendRequest<TMsg = unknown>(msg: SendableMsg): Promise<TMsg> {
		if (!this.connection) {
			return Promise.resolve({
				id: "offline",
				type: MsgType.SESSION_ERROR,
				error: "Not connected",
			} as TMsg);
		}
		return this.connection.sendRequest<TMsg>(msg);
	}

	connectToServer(
		url: string,
		hostId: string,
		encryptionKey?: Uint8Array | null,
		status: ConnectionStatus = "connecting",
	): Promise<void> {
		const attemptId = ++this.activeConnectAttempt;

		this.closePendingSocket();
		this.encryptionKey = encryptionKey ?? null;
		this.activeHostId = hostId;
		this.setSnapshot({
			serverUrl: url,
			sessionToken: hostId,
			connectionStatus: status,
		});

		return new Promise<void>((resolve, reject) => {
			const nextConnection = new Connection(url, this.encryptionKey);
			let handshakeCompleted = false;
			this.pendingSocket = nextConnection;

			nextConnection
				.open(hostId)
				.then((msg) => {
					if (attemptId !== this.activeConnectAttempt) return;
					handshakeCompleted = true;
					this.pendingSocket = null;
					this.connection = nextConnection;
					nextConnection.markAlive();
					this.setSnapshot({
						serverUrl: nextConnection.resolvedServerUrl,
						hostInfo: {
							id: hostId,
							username: msg.data.username,
							hostname: msg.data.hostname,
							platform: msg.data.platform,
							machineId: msg.data.machineId,
							dir: msg.data.dir,
							cliVersion: msg.data.cliVersion,
							updateAvailable: msg.data.updateAvailable,
							latestCliVersion: msg.data.latestCliVersion,
							canSelfUpdate: msg.data.canSelfUpdate,
						},
						connectionStatus: "connected",
						batteryInfo: null,
						reconnectAttempt: 0,
						// The CLI is back; whatever update was in flight is done.
						hostUpdating: false,
					});
					nextConnection.on<BatteryUpdateMsg>(MsgType.BATTERY_UPDATE, (msg) => {
						if (msg instanceof Event) return;
						this.setSnapshot({ batteryInfo: msg.data });
					});
					this.startPing();
					this.onConnected?.(hostId, status);
					resolve();
				})
				.catch((err) => {
					if (attemptId !== this.activeConnectAttempt) return;
					this.pendingSocket = null;
					if (status !== "reconnecting") {
						this.setSnapshot({
							connectionStatus: "disconnected",
						});
					}
					reject(err);
				});

			nextConnection.on("disconnected", (event) => {
				if (attemptId !== this.activeConnectAttempt) return;
				const closeDetail = connectionCloseDetail(event);
				if (!handshakeCompleted) {
					this.pendingSocket = null;
					if (status !== "reconnecting") {
						this.setSnapshot({
							connectionStatus: "disconnected",
						});
					}
					reject(
						createHandshakeError({
							message: getHandshakeCloseMessage(
								closeDetail?.code ?? 0,
								closeDetail?.reason ?? "",
							),
							code: closeDetail?.code,
							reason: closeDetail?.reason,
						}),
					);
					return;
				}
				if (isClientReplacedClose(closeDetail)) {
					this.stopPing();
					if (this.connection === nextConnection) {
						this.connection = null;
					}
					this.activeHostId = null;
					this.setSnapshot({
						hostInfo: null,
						connectionStatus: "disconnected",
						batteryInfo: null,
					});
					this.onDisconnected?.();
					return;
				}
				if (this.snapshot.connectionStatus === "connected") {
					this.handleUnexpectedDisconnect(hostId);
				}
			});
		});
	}

	disconnect() {
		this.cancelReconnect();
		this.encryptionKey = null;
		this.activeHostId = null;
		this.stopPing();
		this.closeConnection();
		this.closePendingSocket();
		this.setSnapshot({
			serverUrl: "",
			sessionToken: "",
			hostInfo: null,
			connectionStatus: "disconnected",
			batteryInfo: null,
			reconnectAttempt: 0,
			hostUpdating: false,
		});
		this.onDisconnected?.();
	}

	/**
	 * Mark that the CLI has begun a self-update. Held outside the socket because
	 * the update tears the socket down — a per-connection listener would be gone
	 * exactly when the UI needs to know why.
	 */
	setHostUpdating(updating: boolean) {
		this.setSnapshot({ hostUpdating: updating });
	}

	/**
	 * Force an immediate reconnect for the active host. Safe to call on app
	 * resume or when the network comes back: it no-ops when there's no active
	 * host or when the existing socket is still live, and otherwise cancels any
	 * pending backoff and retries right away with a fresh attempt budget.
	 */
	reconnectNow() {
		const hostId = this.activeHostId;
		if (!hostId) return;

		// Already connected with a live socket — nothing to do.
		if (
			this.snapshot.connectionStatus === "connected" &&
			this.connection &&
			!this.connection.isStale(LIVENESS_TIMEOUT_MS)
		) {
			return;
		}

		// Cancel any scheduled backoff and start a fresh attempt immediately.
		this.cancelReconnect();
		this.stopPing();
		this.closeConnection();
		this.closePendingSocket();
		this.setSnapshot({
			connectionStatus: "reconnecting",
			batteryInfo: null,
			reconnectAttempt: 0,
		});
		this.attemptReconnect(hostId, true);
	}

	private setSnapshot(next: Partial<ConnectionSnapshot>) {
		this.snapshot = { ...this.snapshot, ...next };
		for (const fn of this.listeners) fn();
	}

	private startPing() {
		this.stopPing();
		this.pingInterval = setInterval(() => {
			const connection = this.connection;
			if (!connection) return;

			// If the host has gone silent for too long the socket is dead even
			// though no `close` may have fired. Tear down and reconnect instead
			// of pinging into the void.
			if (
				this.snapshot.connectionStatus === "connected" &&
				connection.isStale(LIVENESS_TIMEOUT_MS) &&
				this.activeHostId
			) {
				this.handleUnexpectedDisconnect(this.activeHostId);
				return;
			}

			connection.send({ type: MsgType.PING });
		}, PING_INTERVAL_MS);
	}

	private stopPing() {
		if (!this.pingInterval) return;
		clearInterval(this.pingInterval);
		this.pingInterval = null;
	}

	private cancelReconnect() {
		if (this.reconnectTimeout) {
			clearTimeout(this.reconnectTimeout);
			this.reconnectTimeout = null;
		}
		this.reconnectAttempt = 0;
		this.setSnapshot({ reconnectAttempt: 0 });
	}

	private async attemptReconnect(hostId: string, immediate = false) {
		const key = this.encryptionKey;
		const url = this.snapshot.serverUrl || (await getBaseServerUrl());

		this.reconnectAttempt++;
		if (this.reconnectAttempt > MAX_RECONNECT_ATTEMPTS) {
			this.reconnectAttempt = 0;
			this.stopPing();
			this.closeConnection();
			this.closePendingSocket();
			this.setSnapshot({
				connectionStatus: "disconnected",
				hostInfo: null,
				batteryInfo: null,
				reconnectAttempt: 0,
				hostUpdating: false,
			});
			this.onDisconnected?.();
			return;
		}
		this.setSnapshot({ reconnectAttempt: this.reconnectAttempt });

		const backoff = Math.min(
			BASE_RECONNECT_DELAY_MS * 2 ** (this.reconnectAttempt - 1),
			MAX_RECONNECT_DELAY_MS,
		);
		// Jitter (±20%) avoids many clients hammering a shared relay in lockstep.
		// `immediate` fires the first attempt right away (e.g. on app resume).
		const delay = immediate ? 0 : backoff * (0.8 + Math.random() * 0.4);

		this.reconnectTimeout = setTimeout(async () => {
			this.reconnectTimeout = null;
			try {
				await this.connectToServer(url, hostId, key, "reconnecting");
				this.reconnectAttempt = 0;
			} catch {
				this.attemptReconnect(hostId);
			}
		}, delay);
	}

	private async handleUnexpectedDisconnect(hostId: string) {
		this.stopPing();
		this.closeConnection();
		this.closePendingSocket();
		this.setSnapshot({
			connectionStatus: "reconnecting",
			batteryInfo: null,
		});

		if (this.onPreDisconnect) {
			try {
				await this.onPreDisconnect();
			} catch (err) {
				console.error("Error saving state before reconnect:", err);
			}
		}

		this.attemptReconnect(hostId);
	}

	private closeConnection() {
		if (!this.connection) return;
		try {
			this.connection.close();
		} catch {}
		this.connection = null;
	}

	private closePendingSocket() {
		if (!this.pendingSocket) return;
		try {
			this.pendingSocket.close();
		} catch {}
		this.pendingSocket = null;
	}
}

const connectionManager = new ConnectionManager();

function createHandshakeError({
	message,
	code,
	reason,
}: {
	message: string;
	code?: number;
	reason?: string;
}): HandshakeError {
	const error = new Error(message) as HandshakeError;
	if (code !== undefined) error.code = code;
	if (reason) error.reason = reason;
	error.userMessage = message;
	return error;
}

function getHandshakeCloseMessage(code: number, reason: string): string {
	switch (code) {
		case ServerCloseCodeAndReason.HOST_UNAVAILABLE.code:
			return "Your dev machine is unavailable right now. Make sure Shellular CLI is running, then try again.";
		case ServerCloseCodeAndReason.INVALID_QUERY.code:
			return "This connection request is invalid. Please scan the QR code again and retry.";
		case ServerCloseCodeAndReason.APPROVAL_DENIED.code:
			return "This client is not allowed to connect. Please approve it in your dev machine.";
		case ServerCloseCodeAndReason.SESSION_JOIN_FAILED.code:
			return "We couldn't attach this client to the session. Please try again.";
		case ServerCloseCodeAndReason.HOST_DISCONNECTED.code:
			return "The host is offline. Please check your dev machine and try again.";
		case ServerCloseCodeAndReason.CLIENT_REPLACED.code:
			return "This browser session was replaced by a newer Shellular window.";
		default:
			break;
	}

	if (reason === "host_unavailable") {
		return "Your dev machine is unavailable right now. Make sure Shellular CLI is running, then try again.";
	}

	if (reason === "invalid_query") {
		return "This connection request is invalid. Please scan the QR code again and retry.";
	}

	if (reason === "approval_denied") {
		return "This client is not allowed to connect. Please approve it in your dev machine.";
	}

	if (reason === "session_join_failed") {
		return "We couldn't attach this client to the session. Please try again.";
	}

	if (reason === "client_replaced") {
		return "This browser session was replaced by a newer Shellular window.";
	}

	return "WebSocket closed before session handshake completed";
}

function connectionCloseDetail(
	event: Event | unknown,
): ConnectionCloseDetail | null {
	if (!(event instanceof CustomEvent)) return null;
	const detail = event.detail as Partial<ConnectionCloseDetail> | null;
	if (
		!detail ||
		typeof detail.code !== "number" ||
		typeof detail.reason !== "string"
	) {
		return null;
	}
	return { code: detail.code, reason: detail.reason };
}

function isClientReplacedClose(detail: ConnectionCloseDetail | null): boolean {
	return (
		detail?.code === ServerCloseCodeAndReason.CLIENT_REPLACED.code ||
		detail?.reason === "client_replaced"
	);
}

function toWsUrl(httpUrl: string): string {
	const url = new URL(httpUrl);
	if (url.protocol === "https:") {
		url.protocol = "wss:";
	} else if (url.protocol === "http:") {
		url.protocol = "ws:";
	}
	return url.toString();
}

async function requestWebSocketToken(
	serverUrl: string,
	accessToken: string | null,
	clientInfo: ClientInfo,
): Promise<WebSocketTokenResponse> {
	// Defensive: central base is http(s), but normalize in case a ws-scheme
	// URL is ever passed. The token endpoint always lives on central.
	const url = new URL(serverUrl);
	url.pathname = "/auth/ws-app-token";
	url.search = "";

	const headers = new Headers({ "Content-Type": "application/json" });
	if (accessToken) {
		headers.set("Authorization", `Bearer ${accessToken}`);
	}

	const response = await fetch(url.toString(), {
		method: "POST",
		credentials: "include",
		headers,
		body: JSON.stringify(clientInfo),
	});
	const json = (await response.json().catch(() => ({}))) as {
		success?: boolean;
		data?: WebSocketTokenResponse;
		error?: string;
		message?: string;
	};

	if (
		!response.ok ||
		json.success === false ||
		!json.data?.wsToken ||
		!json.data.clientId
	) {
		const error = new Error(
			json.error || json.message || "Failed to authorize WebSocket connection.",
		) as TokenRequestError;
		error.httpStatus = response.status;
		throw error;
	}

	// Legacy central server: no relay lookup, it IS the relay.
	const relayUrl = json.data.relayUrl
		? toWsUrl(json.data.relayUrl)
		: OLD_RELAY_URL;

	return { ...json.data, relayUrl };
}

function isHttp4xxError(err: unknown): boolean {
	const status = (err as TokenRequestError)?.httpStatus;
	return typeof status === "number" && status >= 400 && status < 500;
}

/**
 * Resolves which CENTRAL server to use for this host and requests a WebSocket
 * token from it, transparently handling old-server backwards compatibility:
 *
 * - A host once confirmed on the new server never falls back to the old one
 *   on error — that would just be a real failure, not a version mismatch.
 * - Otherwise we always try the new server first (picks up CLI upgrades from
 *   old → new automatically), and only on a 4xx response fall back to the
 *   legacy `api.shellular.dev`. Non-4xx failures (network, 5xx) propagate
 *   without alternating — they're not a "wrong server" signal.
 * - Whichever server responds successfully is remembered per-hostId so the
 *   next connection attempt for this host goes straight to it.
 */
async function resolveWebSocketToken(
	hostId: string,
	accessToken: string | null,
	clientInfo: ClientInfo,
): Promise<{ url: string; wsInfo: WebSocketTokenResponse }> {
	// Always resolved fresh from settings rather than trusting whatever URL a
	// prior connection attempt happened to land on — that may have been the
	// old server, which must never be mistaken for "the new server".
	const newServerUrl = await getBaseServerUrl();
	const pref = await getServerPreference(hostId);

	if (pref === "new") {
		const wsInfo = await requestWebSocketToken(
			newServerUrl,
			accessToken,
			clientInfo,
		);
		return { url: newServerUrl, wsInfo };
	}

	try {
		const wsInfo = await requestWebSocketToken(
			newServerUrl,
			accessToken,
			clientInfo,
		);
		await setServerPreference(hostId, "new");
		return { url: newServerUrl, wsInfo };
	} catch (err) {
		if (!isHttp4xxError(err)) throw err;

		const wsInfo = await requestWebSocketToken(
			OLD_SERVER_URL,
			accessToken,
			clientInfo,
		);
		await setServerPreference(hostId, "old");
		return { url: OLD_SERVER_URL, wsInfo };
	}
}

export function subscribeState(listener: Listener): () => void {
	return connectionManager.subscribe(listener);
}

export function getConnectionSnapshot() {
	return connectionManager.getSnapshot();
}

export function getHostInfo() {
	return getConnectionSnapshot().hostInfo;
}

export function setOnConnectedCallback(
	fn: (token: string, prevStatus: ConnectionStatus) => void | Promise<void>,
) {
	connectionManager.setOnConnectedCallback(fn);
}

export function setOnDisconnectedCallback(fn: () => void) {
	connectionManager.setOnDisconnectedCallback(fn);
}

export function setOnPreDisconnectCallback(fn: () => void) {
	connectionManager.setOnPreDisconnectCallback(fn);
}

export function onMessage<TMsg = unknown>(
	type: string,
	handler: (msg: TMsg) => void,
): () => void {
	return connectionManager.onMessage(type, handler);
}

export function onBinaryHttpResponseData(
	handler: (msg: ProxyBinaryHttpResponseData) => void,
): () => void {
	return connectionManager.onBinaryHttpResponseData(handler);
}

export function sendMessage(msg: SendableMsg): string | null {
	return connectionManager.sendMessage(msg);
}

export function sendRequest<TMsg = unknown>(msg: SendableMsg): Promise<TMsg> {
	return connectionManager.sendRequest<TMsg>(msg);
}

export function connectToServer(
	url: string,
	hostId: string,
	encryptionKey?: Uint8Array | null,
): Promise<void> {
	return connectionManager.connectToServer(url, hostId, encryptionKey);
}

export function disconnect() {
	connectionManager.disconnect();
}

/**
 * Flag that the CLI is self-updating, so the reconnect overlay can explain the
 * expected restart instead of presenting it as a failure. Cleared automatically
 * on the next successful connect, on disconnect, and if reconnecting gives up.
 */
export function setHostUpdating(updating: boolean) {
	connectionManager.setHostUpdating(updating);
}

/**
 * Force an immediate reconnect for the currently-active host if the socket is
 * not live. No-ops when disconnected (no active host) or already connected.
 * Call this on app resume and when the network comes back online.
 */
export function reconnectNow() {
	connectionManager.reconnectNow();
}
