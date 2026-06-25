import browser from "bridge/browser";
import secureStore from "bridge/secureStore";
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
const AuthContext = createContext<AuthContextValue | null>(null);

let accessToken: string | null = null;
let accessTokenExpiresAt = 0;
let refreshTokenValue: string | null = null;
let refreshInFlight: Promise<boolean> | null = null;

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

	const clearAuth = useCallback(async () => {
		accessToken = null;
		accessTokenExpiresAt = 0;
		refreshTokenValue = null;
		await secureStore.remove(REFRESH_TOKEN_KEY);
		setUser(null);
		setStatus("unauthenticated");
	}, []);

	const applyTokenResponse = useCallback(async (data: TokenResponse) => {
		accessToken = data.accessToken;
		accessTokenExpiresAt = data.accessTokenExpiresAt;
		refreshTokenValue = data.refreshToken;
		await secureStore.set(REFRESH_TOKEN_KEY, data.refreshToken);
		setUser(data.user);
		setStatus("authenticated");
		setError(null);
		setAccountError(null);
	}, []);

	const refresh = useCallback(async () => {
		if (refreshInFlight) return refreshInFlight;
		refreshInFlight = (async () => {
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
				await clearAuth();
				setError(errorMessage(err));
				return false;
			} finally {
				refreshInFlight = null;
			}
		})();
		return refreshInFlight;
	}, [applyTokenResponse, clearAuth]);

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
				if (!cancelled) setError(errorMessage(err));
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

	useEffect(() => {
		if (status !== "authenticated") return;
		const delay = Math.max(
			1000,
			accessTokenExpiresAt - Date.now() - REFRESH_SKEW_MS,
		);
		const timer = window.setTimeout(() => {
			refresh().catch(console.error);
		}, delay);
		return () => window.clearTimeout(timer);
	}, [refresh, status]);

	const signIn = useCallback(
		async (provider: AuthProviderId) => {
			setSigningInProvider(provider);
			setError(null);
			try {
				const start = await authRequest<{ authorizationUrl: string }>(
					`/auth/oauth/${provider}/start`,
					{ method: "POST" },
				);
				const result = await browser.openForAuth(
					start.authorizationUrl,
					"shellular",
				);
				const params = result.params ?? callbackParams(result.url);
				if (params.error) {
					throw new Error(decodeURIComponent(params.error));
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
				setError(errorMessage(err));
			} finally {
				setSigningInProvider(null);
			}
		},
		[applyTokenResponse],
	);

	const refreshMe = useCallback(async () => {
		const token = await ensureAccessToken();
		const data = await authRequest<{ user: AuthUser }>("/auth/me", {
			headers: { Authorization: `Bearer ${token}` },
		});
		setUser(data.user);
		setAccountError(null);
	}, [ensureAccessToken]);

	const linkAccount = useCallback(
		async (provider: AuthProviderId) => {
			setAccountAction({ type: "link", provider });
			setAccountError(null);
			try {
				const token = await ensureAccessToken();
				const start = await authRequest<{ authorizationUrl: string }>(
					`/auth/oauth/${provider}/link/start`,
					{
						method: "POST",
						headers: { Authorization: `Bearer ${token}` },
					},
				);
				const result = await browser.openForAuth(
					start.authorizationUrl,
					"shellular",
				);
				const params = result.params ?? callbackParams(result.url);
				if (params.error) {
					throw new Error(decodeURIComponent(params.error));
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
				setUser(data.user);
			} catch (err) {
				setAccountError(errorMessage(err));
			} finally {
				setAccountAction(null);
			}
		},
		[ensureAccessToken],
	);

	const unlinkAccount = useCallback(
		async (provider: AuthProviderId) => {
			setAccountAction({ type: "unlink", provider });
			setAccountError(null);
			try {
				const token = await ensureAccessToken();
				const data = await authRequest<{ user: AuthUser }>(
					`/auth/oauth/accounts/${provider}`,
					{
						method: "DELETE",
						headers: { Authorization: `Bearer ${token}` },
					},
				);
				setUser(data.user);
			} catch (err) {
				setAccountError(errorMessage(err));
			} finally {
				setAccountAction(null);
			}
		},
		[ensureAccessToken],
	);

	const logout = useCallback(async () => {
		const token =
			refreshTokenValue ?? (await secureStore.get(REFRESH_TOKEN_KEY));
		try {
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

async function refreshWithoutReact(): Promise<boolean> {
	try {
		const data = await authRequest<TokenResponse>("/auth/refresh", {
			method: "POST",
			body: JSON.stringify({ refreshToken: refreshTokenValue }),
		});
		accessToken = data.accessToken;
		accessTokenExpiresAt = data.accessTokenExpiresAt;
		refreshTokenValue = data.refreshToken;
		await secureStore.set(REFRESH_TOKEN_KEY, data.refreshToken);
		return true;
	} catch {
		accessToken = null;
		accessTokenExpiresAt = 0;
		refreshTokenValue = null;
		await secureStore.remove(REFRESH_TOKEN_KEY);
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

async function authRequest<T = unknown>(
	path: string,
	init: RequestInit = {},
): Promise<T> {
	const baseUrl = await getBaseServerUrl();
	const headers = new Headers(init.headers);
	if (init.body && !headers.has("Content-Type")) {
		headers.set("Content-Type", "application/json");
	}
	const res = await fetch(`${baseUrl}${path}`, { ...init, headers });
	const json = (await res.json().catch(() => ({}))) as {
		success?: boolean;
		data?: T;
		error?: string;
		message?: string;
	};
	if (!res.ok || json.success === false) {
		throw new Error(json.error || json.message || "Authentication failed.");
	}
	return json.data as T;
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
