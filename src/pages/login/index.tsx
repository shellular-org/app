import "./style.scss";
import clsx from "clsx";
import OfflineBanner from "components/OfflineBanner";
import { useAuth } from "lib/auth";
import { useState } from "react";

const PROVIDER_LABELS = {
	google: "Continue with Google",
	github: "Continue with GitHub",
	apple: "Continue with Apple",
} as const;

const PROVIDER_ICONS = {
	google: "icon-google",
	github: "icon-github",
	apple: "icon-apple",
} as const;

export default function LoginPage() {
	const { providers, error, signingInProvider, signIn } = useAuth();
	const [online, setOnline] = useState(true);
	const enabledProviders = providers.filter((provider) => provider.enabled);

	return (
		<div className="login-page">
			<OfflineBanner onChange={setOnline} />
			<div className="login-page-inner">
				<div className="login-brand">
					<span
						className="icon-shellular login-brand-icon"
						aria-hidden="true"
					/>
					<h1>Shellular</h1>
				</div>

				<div className="login-copy">
					<h2>Sign in to continue</h2>
					<p>Access your dev machine, agents, terminals, files, and ports.</p>
				</div>

				<div className="login-provider-list">
					{enabledProviders.map((provider) => (
						<button
							key={provider.id}
							type="button"
							className={clsx("login-provider-btn haptic-trigger", {
								"login-provider-btn--loading":
									signingInProvider === provider.id,
							})}
							disabled={!online || signingInProvider !== null}
							onClick={() => signIn(provider.id)}
						>
							<span
								className={PROVIDER_ICONS[provider.id]}
								aria-hidden="true"
							/>
							<span>{PROVIDER_LABELS[provider.id]}</span>
							{signingInProvider === provider.id && (
								<span className="login-provider-spinner" aria-hidden="true" />
							)}
						</button>
					))}
				</div>

				{enabledProviders.length === 0 && (
					<p className="login-message">
						Sign-in is not configured on this server yet.
					</p>
				)}

				{error && <p className="login-error">{error}</p>}

				<p className="login-security-note">
					Your Shellular session is protected with OAuth and automatic token
					rotation.
				</p>
			</div>
		</div>
	);
}
