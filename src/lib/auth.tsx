import browser from "bridge/browser";
import native from "bridge/native";
import secureStore from "bridge/secureStore";
import { BROWSER_AUTH_REQUEST_ID_PARAM } from "lib/browserAuthCallback";
import { getBaseServerUrl } from "lib/settings";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";

export type AuthProviderId = "google" | "github" | "apple";

export type AuthLinkedAccount = {
	provider: AuthProviderId;
	email: string;
	isPrimary: boolean;
	linkedAt: number;
};

export type AuthUser = {
	id: string;
	email: string;
	name: string | null;
	avatarUrl: string | null;
	linkedAccounts: AuthLinkedAccount[];
};

type ProviderStatus = {
	id: AuthProviderId;
	enabled: boolean;
};

type AuthStatus = "loading" | "authenticated" | "unauthenticated";
/** Error from `authRequest`, carrying the HTTP status when there was one. */
type AuthRequestError = Error & { httpStatus?: number };
type AccountAction = {
	type: "link" | "unlink";
	provider: AuthProviderId;
};

type AuthContextValue = {
	status: AuthStatus;
	user: AuthUser | null;
	providers: ProviderStatus[];
	error: string | null;
	accountError: string | null;
	accountAction: AccountAction | null;
	signingInProvider: AuthProviderId | null;
	signIn: (provider: AuthProviderId) => Promise<void>;
	linkAccount: (provider: AuthProviderId) => Promise<void>;
	unlinkAccount: (provider: AuthProviderId) => Promise<void>;
	refreshMe: () => Promise<void>;
	logout: () => Promise<void>;
	refresh: () => Promise<boolean>;
};

const REFRESH_TOKEN_KEY = "auth-refresh-token";
const REFRESH_SKEW_MS = 60 * 1000;
/** Backoff after a refresh that failed for non-auth reasons (offline, 5xx). */
const REFRESH_RETRY_MS = 30 * 1000;
/** How often the login screen re-checks storage for a token that arrived
 * out-of-band (a sign-in whose callback never reached this JS context). */
const STORED_TOKEN_POLL_MS = 2 * 1000;
const AuthContext = createContext<AuthContextValue | null>(null);

let accessToken: string | null = null;
let accessTokenExpiresAt = 0;
let refreshTokenValue: string | null = null;
let refreshInFlight: Promise<boolean> | null = null;
let authCallbackSchemeInFlight: Promise<string> | null = null;
let activeBrowserAuthRequestId: string | null = null;
let authenticatedUserSnapshot: AuthUser | null = null;

function setAuthenticatedUserSnapshot(user: AuthUser | null): void {
	authenticatedUserSnapshot = user;
}

export function getAuthenticatedUserForAuth(): Readonly<
	Pick<AuthUser, "id" | "email">
> | null {
	if (!authenticatedUserSnapshot) return null;
	return {
		id: authenticatedUserSnapshot.id,
		email: authenticatedUserSnapshot.email,
	};
}

function isBrowserCookieAuth(): boolean {
	return process.env.PLATFORM === "browser";
}

export function AuthProvider({ children }: { children: ReactNode }) {
	const [status, setStatus] = useState<AuthStatus>("loading");
	const [user, setUser] = useState<AuthUser | null>(null);
	const [providers, setProviders] = useState<ProviderStatus[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [accountError, setAccountError] = useState<string | null>(null);
	const [accountAction, setAccountAction] = useState<AccountAction | null>(
		null,
	);
	const [signingInProvider, setSigningInProvider] =
		useState<AuthProviderId | null>(null);
	const updateUser = useCallback((nextUser: AuthUser | null) => {
		setAuthenticatedUserSnapshot(nextUser);
		setUser(nextUser);
	}, []);

	const clearAuth = useCallback(async () => {
		accessToken = null;
		accessTokenExpiresAt = 0;
		refreshTokenValue = null;
		await secureStore.remove(REFRESH_TOKEN_KEY);
		updateUser(null);
		setStatus("unauthenticated");
	}, [updateUser]);

	const applyTokenResponse = useCallback(
		async (data: TokenResponse) => {
			accessToken = data.accessToken;
			accessTokenExpiresAt = data.accessTokenExpiresAt;
			refreshTokenValue = data.refreshToken;
			await secureStore.set(REFRESH_TOKEN_KEY, data.refreshToken);
			updateUser(data.user);
			setStatus("authenticated");
			setError(null);
			setAccountError(null);
		},
		[updateUser],
	);

	const refresh = useCallback(async () => {
		if (refreshInFlight) return refreshInFlight;
		refreshInFlight = (async () => {
			if (isBrowserCookieAuth()) {
				try {
					const data = await authRequest<BrowserSessionResponse>(
						"/auth/refresh",
						{
							method: "POST",
						},
					);
					accessToken = null;
					accessTokenExpiresAt = data.accessTokenExpiresAt;
					refreshTokenValue = null;
					updateUser(data.user);
					setStatus("authenticated");
					setError(null);
					setAccountError(null);
					return true;
				} catch (err) {
					logAuthError("refresh browser session", err);
					// See the token path below: don't sign the user out over a
					// transient network/server failure.
					if (!isAuthRejection(err)) return false;
					await clearAuth();
					return false;
				} finally {
					refreshInFlight = null;
				}
			}

			const token =
				refreshTokenValue ?? (await secureStore.get(REFRESH_TOKEN_KEY));
			if (!token) {
				await clearAuth();
				return false;
			}

			try {
				const data = await authRequest<TokenResponse>("/auth/refresh", {
					method: "POST",
					body: JSON.stringify({ refreshToken: token }),
				});
				await applyTokenResponse(data);
				return true;
			} catch (err) {
				logAuthError("refresh session", err);
				// Only a explicit rejection means the token is dead. On network or
				// server errors keep it and stay signed in — the next refresh (or
				// the next request that needs a token) will retry.
				if (!isAuthRejection(err)) return false;
				await clearAuth();
				setError("Your session expired. Please sign in again.");
				return false;
			} finally {
				refreshInFlight = null;
			}
		})();
		return refreshInFlight;
	}, [applyTokenResponse, clearAuth, updateUser]);

	const ensureAccessToken = useCallback(async () => {
		if (accessToken && accessTokenExpiresAt - Date.now() > REFRESH_SKEW_MS) {
			return accessToken;
		}
		const ok = await refresh();
		if (!ok || !accessToken) {
			throw new Error("Your session expired. Please sign in again.");
		}
		return accessToken;
	}, [refresh]);

	useEffect(() => {
		let cancelled = false;

		(async () => {
			try {
				const providerData = await authRequest<{ providers: ProviderStatus[] }>(
					"/auth/providers",
				);
				if (!cancelled) setProviders(providerData.providers);
			} catch (err) {
				logAuthError("load auth providers", err);
				if (!cancelled) {
					setError("Sign-in is unavailable right now. Please try again later.");
				}
			}

			if (isBrowserCookieAuth()) {
				const ok = await refresh();
				if (!cancelled && !ok) setStatus("unauthenticated");
				return;
			}

			refreshTokenValue = await secureStore.get(REFRESH_TOKEN_KEY);
			if (!refreshTokenValue) {
				if (!cancelled) setStatus("unauthenticated");
				return;
			}

			const ok = await refresh();
			if (!cancelled && !ok) setStatus("unauthenticated");
		})();

		return () => {
			cancelled = true;
		};
	}, [refresh]);

	// A refresh that failed for network reasons leaves the token on disk (only an
	// explicit 401/403 clears it), so the session is recoverable — retry when the
	// device comes back online or the app returns to the foreground instead of
	// stranding the user on the login screen until they sign in again.
	//
	// This also covers a sign-in whose result never made it back to us: if the
	// native auth callback was dropped (process death, a WebView reload mid-flow)
	// the token can be on disk while this context still says "unauthenticated".
	// Polling it while the login screen is up means the wall comes down on its
	// own instead of asking the user to repeat a sign-in that already worked.
	useEffect(() => {
		if (status !== "unauthenticated") return;
		let cancelled = false;

		const retry = async () => {
			if (cancelled) return;
			if (
				!isBrowserCookieAuth() &&
				!(await secureStore.get(REFRESH_TOKEN_KEY))
			) {
				return;
			}
			if (cancelled) return;
			refresh().catch(console.error);
		};

		// Cheap (a keychain read) and only while the auth wall is showing, so it
		// stops as soon as the session lands.
		const timer = window.setInterval(retry, STORED_TOKEN_POLL_MS);
		window.addEventListener("online", retry);
		document.addEventListener("resume", retry);
		return () => {
			cancelled = true;
			window.clearInterval(timer);
			window.removeEventListener("online", retry);
			document.removeEventListener("resume", retry);
		};
	}, [refresh, status]);

	useEffect(() => {
		if (status !== "authenticated") return;
		let timer = 0;

		const schedule = (delay: number) => {
			timer = window.setTimeout(async () => {
				const ok = await refresh().catch((err) => {
					console.error(err);
					return false;
				});
				// A transient failure leaves us authenticated with a stale access
				// token; retry on a short backoff rather than waiting for the next
				// expiry that will never be scheduled.
				if (!ok) schedule(REFRESH_RETRY_MS);
			}, delay);
		};

		schedule(
			Math.max(1000, accessTokenExpiresAt - Date.now() - REFRESH_SKEW_MS),
		);
		return () => window.clearTimeout(timer);
	}, [refresh, status]);

	const signIn = useCallback(
		async (provider: AuthProviderId) => {
			const authRequestId = createAuthRequestId();
			if (authRequestId) activeBrowserAuthRequestId = authRequestId;
			setSigningInProvider(provider);
			setError(null);
			try {
				const start = await authRequest<{ authorizationUrl: string }>(
					`/auth/oauth/${provider}/start`,
					{
						method: "POST",
						body: JSON.stringify({
							callbackUrl: await getAuthCallbackUrl(authRequestId),
						}),
					},
				);
				const callbackTarget = await getAuthCallbackTarget();
				const result = await browser.openForAuth(
					start.authorizationUrl,
					callbackTarget,
					true,
					authRequestId,
				);
				const params = result.params ?? callbackParams(result.url);
				if (params.error) {
					throw new Error(decodeURIComponent(params.error));
				}
				if (isBrowserCookieAuth()) {
					const ok = await refresh();
					if (!ok) {
						throw new Error("Sign-in did not complete.");
					}
					return;
				}
				if (!params.code) {
					throw new Error("Sign-in did not return an authorization code.");
				}
				const data = await authRequest<TokenResponse>("/auth/exchange", {
					method: "POST",
					body: JSON.stringify({ code: params.code }),
				});
				await applyTokenResponse(data);
			} catch (err) {
				const message = errorMessage(err);
				if (isAuthSuperseded(message)) {
					// Another attempt owns the flow now; let it report.
				} else if (await recoverStoredSession(refresh)) {
					// The flow actually completed — the native callback just never
					// made it back to this promise (cancel race, reload, process
					// death). We're signed in, so don't accuse the user of failing.
					logAuthError(`recover dropped ${provider} sign-in`, err);
				} else {
					logAuthError(`sign in with ${provider}`, err);
					setError("We couldn't sign you in. Please try again.");
				}
			} finally {
				if (
					!isBrowserCookieAuth() ||
					activeBrowserAuthRequestId === authRequestId
				) {
					activeBrowserAuthRequestId = null;
					setSigningInProvider(null);
				}
			}
		},
		[applyTokenResponse, refresh],
	);

	const refreshMe = useCallback(async () => {
		if (isBrowserCookieAuth()) {
			const data = await authRequest<{ user: AuthUser }>("/auth/me");
			updateUser(data.user);
			setAccountError(null);
			return;
		}

		const token = await ensureAccessToken();
		const data = await authRequest<{ user: AuthUser }>("/auth/me", {
			headers: { Authorization: `Bearer ${token}` },
		});
		updateUser(data.user);
		setAccountError(null);
	}, [ensureAccessToken, updateUser]);

	const linkAccount = useCallback(
		async (provider: AuthProviderId) => {
			const authRequestId = createAuthRequestId();
			setAccountAction({ type: "link", provider });
			setAccountError(null);
			try {
				const token = isBrowserCookieAuth() ? null : await ensureAccessToken();
				const start = await authRequest<{ authorizationUrl: string }>(
					`/auth/oauth/${provider}/link/start`,
					{
						method: "POST",
						headers: token ? { Authorization: `Bearer ${token}` } : undefined,
						body: JSON.stringify({
							callbackUrl: await getAuthCallbackUrl(authRequestId),
						}),
					},
				);
				const callbackTarget = await getAuthCallbackTarget();
				const result = await browser.openForAuth(
					start.authorizationUrl,
					callbackTarget,
					true,
					authRequestId,
				);
				const params = result.params ?? callbackParams(result.url);
				if (params.error) {
					throw new Error(decodeURIComponent(params.error));
				}
				if (isBrowserCookieAuth()) {
					await refreshMe();
					return;
				}
				if (!params.linkCode) {
					throw new Error(
						"Account linking did not return an authorization code.",
					);
				}

				const exchangeToken = await ensureAccessToken();
				const data = await authRequest<{ user: AuthUser }>(
					"/auth/oauth/link/exchange",
					{
						method: "POST",
						headers: { Authorization: `Bearer ${exchangeToken}` },
						body: JSON.stringify({ code: params.linkCode }),
					},
				);
				updateUser(data.user);
			} catch (err) {
				const message = errorMessage(err);
				if (!isAuthSuperseded(message)) {
					logAuthError(`link ${provider} account`, err);
					setAccountError("We couldn't link this account. Please try again.");
				}
			} finally {
				setAccountAction(null);
			}
		},
		[ensureAccessToken, refreshMe, updateUser],
	);

	const unlinkAccount = useCallback(
		async (provider: AuthProviderId) => {
			setAccountAction({ type: "unlink", provider });
			setAccountError(null);
			try {
				const token = isBrowserCookieAuth() ? null : await ensureAccessToken();
				const data = await authRequest<{ user: AuthUser }>(
					`/auth/oauth/accounts/${provider}`,
					{
						method: "DELETE",
						headers: token ? { Authorization: `Bearer ${token}` } : undefined,
					},
				);
				updateUser(data.user);
			} catch (err) {
				logAuthError(`unlink ${provider} account`, err);
				setAccountError("We couldn't unlink this account. Please try again.");
			} finally {
				setAccountAction(null);
			}
		},
		[ensureAccessToken, updateUser],
	);

	const logout = useCallback(async () => {
		const token =
			refreshTokenValue ?? (await secureStore.get(REFRESH_TOKEN_KEY));
		try {
			if (isBrowserCookieAuth()) {
				await authRequest("/auth/logout", { method: "POST" });
				return;
			}

			if (accessToken || token) {
				await authRequest("/auth/logout", {
					method: "POST",
					headers: accessToken
						? { Authorization: `Bearer ${accessToken}` }
						: undefined,
					body: JSON.stringify({ refreshToken: token ?? "" }),
				});
			}
		} catch (err) {
			console.warn("[auth] logout failed", err);
		} finally {
			await clearAuth();
		}
	}, [clearAuth]);

	const value = useMemo<AuthContextValue>(
		() => ({
			status,
			user,
			providers,
			error,
			accountError,
			accountAction,
			signingInProvider,
			signIn,
			linkAccount,
			unlinkAccount,
			refreshMe,
			logout,
			refresh,
		}),
		[
			accountAction,
			accountError,
			error,
			linkAccount,
			logout,
			providers,
			refresh,
			refreshMe,
			signIn,
			signingInProvider,
			status,
			unlinkAccount,
			user,
		],
	);

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
	const ctx = useContext(AuthContext);
	if (!ctx) throw new Error("useAuth must be used within AuthProvider");
	return ctx;
}

export async function getAccessTokenForAuth(): Promise<string | null> {
	if (isBrowserCookieAuth()) {
		return null;
	}
	if (accessToken && accessTokenExpiresAt - Date.now() > REFRESH_SKEW_MS) {
		return accessToken;
	}
	if (!refreshTokenValue) {
		refreshTokenValue = await secureStore.get(REFRESH_TOKEN_KEY);
	}
	if (!refreshTokenValue) return null;
	if (!refreshInFlight) {
		refreshInFlight = refreshWithoutReact();
	}
	await refreshInFlight;
	return accessToken && accessTokenExpiresAt > Date.now() ? accessToken : null;
}

export async function authenticatedRequest<T = unknown>(
	path: string,
	init: RequestInit = {},
): Promise<T> {
	if (isBrowserCookieAuth()) {
		return authRequest<T>(path, init);
	}

	const token = await getAccessTokenForAuth();
	if (!token) {
		throw new Error("Your session expired. Please sign in again.");
	}

	const headers = new Headers(init.headers);
	headers.set("Authorization", `Bearer ${token}`);
	return authRequest<T>(path, { ...init, headers });
}

async function refreshWithoutReact(): Promise<boolean> {
	try {
		if (isBrowserCookieAuth()) {
			const data = await authRequest<BrowserSessionResponse>("/auth/refresh", {
				method: "POST",
			});
			accessToken = null;
			accessTokenExpiresAt = data.accessTokenExpiresAt;
			refreshTokenValue = null;
			setAuthenticatedUserSnapshot(data.user);
			return Boolean(data.user);
		}

		const data = await authRequest<TokenResponse>("/auth/refresh", {
			method: "POST",
			body: JSON.stringify({ refreshToken: refreshTokenValue }),
		});
		accessToken = data.accessToken;
		accessTokenExpiresAt = data.accessTokenExpiresAt;
		refreshTokenValue = data.refreshToken;
		setAuthenticatedUserSnapshot(data.user);
		await secureStore.set(REFRESH_TOKEN_KEY, data.refreshToken);
		return true;
	} catch (err) {
		// Drop the in-memory access token either way (it's unusable), but only
		// destroy the refresh token when the server actually rejected it —
		// otherwise a blip while connecting would silently sign the user out.
		accessToken = null;
		accessTokenExpiresAt = 0;
		if (isAuthRejection(err)) {
			refreshTokenValue = null;
			setAuthenticatedUserSnapshot(null);
			await secureStore.remove(REFRESH_TOKEN_KEY);
		}
		return false;
	} finally {
		refreshInFlight = null;
	}
}

type TokenResponse = {
	accessToken: string;
	accessTokenExpiresAt: number;
	refreshToken: string;
	refreshTokenExpiresAt: number;
	user: AuthUser;
};

type BrowserSessionResponse = {
	accessTokenExpiresAt: number;
	refreshTokenExpiresAt: number;
	user: AuthUser;
};

async function authRequest<T = unknown>(
	path: string,
	init: RequestInit = {},
): Promise<T> {
	const baseUrl = await getBaseServerUrl();
	const headers = new Headers(init.headers);
	if (init.body && !headers.has("Content-Type")) {
		headers.set("Content-Type", "application/json");
	}
	const res = await fetch(`${baseUrl}${path}`, {
		...init,
		credentials: init.credentials ?? "include",
		headers,
	});
	const json = (await res.json().catch(() => ({}))) as {
		success?: boolean;
		data?: T;
		error?: string;
		message?: string;
	};
	if (!res.ok || json.success === false) {
		const error = new Error(
			json.error || json.message || "Authentication failed.",
		) as AuthRequestError;
		error.httpStatus = res.status;
		throw error;
	}
	return json.data as T;
}

/**
 * True only when the server explicitly rejected our credentials (401/403).
 *
 * Everything else — `fetch` rejecting outright (offline, DNS, TLS, backgrounded
 * radio), 5xx during a deploy, 429, a gateway's HTML error page — says nothing
 * about whether the refresh token is still valid. Treating those as "signed
 * out" throws away a perfectly good token and forces a fresh login, which is
 * how a week-long session turns into a daily one.
 */
export function isAuthRejection(err: unknown): boolean {
	const status = (err as AuthRequestError)?.httpStatus;
	return status === 401 || status === 403;
}

function callbackParams(url: string): Record<string, string> {
	try {
		return Object.fromEntries(new URL(url).searchParams.entries());
	} catch {
		return {};
	}
}

function errorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message.replace(/^Browser\/openForAuth:\s*/, "");
	}
	return String(error);
}

function isAuthSuperseded(message: string): boolean {
	return message.includes("Auth superseded");
}

/**
 * Last chance to salvage a sign-in that threw: check whether a usable session
 * exists anyway and adopt it.
 *
 * A failed `openForAuth` promise does not prove the sign-in failed. The native
 * callback can be lost after the server already issued tokens — Android's
 * resume-vs-deep-link race, a WebView reload during a slow OAuth detour, or
 * process death mid-flow. In those cases the user completed everything asked of
 * them, so re-showing the login screen is just wrong.
 *
 * Returns true only when we end up authenticated.
 */
async function recoverStoredSession(
	refresh: () => Promise<boolean>,
): Promise<boolean> {
	try {
		if (!isBrowserCookieAuth() && !(await secureStore.get(REFRESH_TOKEN_KEY))) {
			return false;
		}
		return await refresh();
	} catch (err) {
		logAuthError("recover stored session", err);
		return false;
	}
}

function logAuthError(action: string, error: unknown): void {
	console.warn(`[auth] Failed to ${action}`, error);
}

async function getAuthCallbackScheme(): Promise<string> {
	// Android and iOS both ship dev builds under a `.dev` bundle id so they can
	// sit alongside the store build; those register `shellular-dev` instead of
	// `shellular` so the OS routes the auth callback to the right app.
	if (process.env.PLATFORM !== "android" && process.env.PLATFORM !== "ios") {
		return "shellular";
	}

	authCallbackSchemeInFlight ??= native
		.getAppInfo()
		.then((appInfo) =>
			appInfo.packageName.endsWith(".dev") ? "shellular-dev" : "shellular",
		)
		.catch((error) => {
			console.warn("[auth] Failed to detect app bundle id", error);
			return "shellular";
		});
	return authCallbackSchemeInFlight;
}

async function getAuthCallbackUrl(authRequestId?: string): Promise<string> {
	if (process.env.PLATFORM === "browser") {
		const url = new URL(window.location.origin);
		url.searchParams.set("shellularAuthCallback", "1");
		if (authRequestId) {
			url.searchParams.set(BROWSER_AUTH_REQUEST_ID_PARAM, authRequestId);
		}
		return url.toString();
	}
	return `${await getAuthCallbackScheme()}://auth-callback`;
}

function createAuthRequestId(): string | undefined {
	return isBrowserCookieAuth() ? crypto.randomUUID() : undefined;
}

async function getAuthCallbackTarget(): Promise<string> {
	if (process.env.PLATFORM === "browser") {
		return getAuthCallbackUrl();
	}
	return getAuthCallbackScheme();
}
