import "./style.scss";
import { pushPage } from "App";
import clsx from "clsx";
import Page from "components/Page";
import { type AuthProviderId, useAuth } from "lib/auth";
import AccountHistoryPage from "pages/account-history";

const PROVIDERS: AuthProviderId[] = ["google", "github", "apple"];

const PROVIDER_LABELS: Record<AuthProviderId, string> = {
	google: "Google",
	github: "GitHub",
	apple: "Apple",
};

const PROVIDER_ICONS: Record<AuthProviderId, string> = {
	google: "icon-google",
	github: "icon-github",
	apple: "icon-apple",
};

export default function AccountPage() {
	const {
		user,
		providers,
		accountError,
		accountAction,
		linkAccount,
		unlinkAccount,
		logout,
	} = useAuth();
	const providerConfig = new Map(
		providers.map((provider) => [provider.id, provider.enabled]),
	);

	return (
		<Page title="Account" className="account-page">
			{user ? (
				<>
					<section className="account-page-profile">
						<div className="account-page-avatar" aria-hidden="true">
							{user.avatarUrl ? (
								<img src={user.avatarUrl} alt="" />
							) : (
								<span className="icon-user" />
							)}
						</div>
						<div className="account-page-profile-text">
							<h2>{user.name || user.email}</h2>
							<p>{user.email}</p>
						</div>
					</section>

					<section className="account-page-section">
						<h3 className="account-page-section-title">Profile</h3>
						<div className="account-page-card">
							<div className="account-page-row">
								<span className="icon-mail" aria-hidden="true" />
								<span className="account-page-row-text">
									<span className="account-page-row-label">Primary email</span>
									<span className="account-page-row-value">{user.email}</span>
								</span>
							</div>
						</div>
					</section>

					<section className="account-page-section">
						<h3 className="account-page-section-title">Linked accounts</h3>
						<div className="account-page-card">
							{PROVIDERS.map((provider) => {
								const linked = user.linkedAccounts.find(
									(account) => account.provider === provider,
								);
								const enabled = providerConfig.get(provider) === true;
								const isBusy = accountAction?.provider === provider;
								const isAnyBusy = accountAction !== null;
								const value = linked
									? linked.email
									: enabled
										? "Not linked"
										: "Not configured";
								return (
									<div
										key={provider}
										className={clsx("account-page-row account-provider-row", {
											"account-page-row--disabled": !enabled && !linked,
										})}
									>
										<span
											className={PROVIDER_ICONS[provider]}
											aria-hidden="true"
										/>
										<span className="account-page-row-text">
											<span className="account-page-row-label">
												{PROVIDER_LABELS[provider]}
											</span>
											<span className="account-page-row-value">{value}</span>
										</span>
										{linked?.isPrimary ? (
											<span className="account-page-badge">Primary</span>
										) : linked ? (
											<button
												type="button"
												className="account-page-provider-action account-page-provider-action--danger haptic-trigger"
												disabled={isAnyBusy}
												onClick={() => unlinkAccount(provider)}
											>
												{isBusy && accountAction?.type === "unlink"
													? "Unlinking"
													: "Unlink"}
											</button>
										) : enabled ? (
											<button
												type="button"
												className="account-page-provider-action haptic-trigger"
												disabled={isAnyBusy}
												onClick={() => linkAccount(provider)}
											>
												{isBusy && accountAction?.type === "link"
													? "Linking"
													: "Link"}
											</button>
										) : (
											<span className="account-page-badge account-page-badge--muted">
												Unavailable
											</span>
										)}
									</div>
								);
							})}
						</div>
						{accountError && (
							<p className="account-page-error">{accountError}</p>
						)}
					</section>

					<section className="account-page-section">
						<h3 className="account-page-section-title">History</h3>
						<div className="account-page-card">
							<button
								type="button"
								className="account-page-row haptic-trigger"
								onClick={openHistoryPage}
							>
								<span className="icon-clock" aria-hidden="true" />
								<span className="account-page-row-text">
									<span className="account-page-row-label">
										Hosts and devices
									</span>
									<span className="account-page-row-value">
										View connection history
									</span>
								</span>
								<span
									className="icon-chevron-right account-page-chevron"
									aria-hidden="true"
								/>
							</button>
						</div>
					</section>

					<button
						type="button"
						className="account-page-logout haptic-trigger"
						onClick={() => logout().catch(console.error)}
					>
						<span className="icon-log-out" aria-hidden="true" />
						<span>Log out</span>
					</button>
				</>
			) : (
				<div className="account-page-empty">
					<span className="icon-user" aria-hidden="true" />
					<p>No signed-in account is available.</p>
				</div>
			)}
		</Page>
	);
}

function openHistoryPage() {
	pushPage("account-history", <AccountHistoryPage />, {
		showConnectionBanner: false,
	});
}
