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

// Grouped-card shell: a rounded surface whose direct child rows are separated by
// hairline dividers (first row has no top border via [&>*:first-child]).
const CARD =
	"overflow-hidden rounded-2xl border border-card-border bg-popup-background shadow-[var(--shadow)]";
const ROW =
	"flex w-full min-h-[58px] items-center gap-3 px-3.5 py-3 text-left text-primary-text [&+*]:border-t [&+*]:border-line-soft";
const ROW_ICON = "w-6 shrink-0 text-center text-[20px] text-accent";
// Provider brand glyphs are a multi-color icon font: some (e.g. icon-google)
// hardcode `color` on ::before, others inherit and would pick up the accent.
// Force ::before to the parent color so all render as an adaptive black/white
// monochrome mark instead of accent/brand-blue.
const PROVIDER_ROW_ICON =
	"w-6 shrink-0 text-center text-[20px] text-primary-text before:!text-current";
const ROW_LABEL = "truncate text-[14px] font-[650] text-primary-text";
const ROW_VALUE = "truncate text-[12px] text-secondary-text opacity-[0.68]";
const SECTION_TITLE =
	"ml-1 text-[11px] font-bold uppercase tracking-[0.9px] text-secondary-text opacity-45";
const PILL =
	"inline-flex min-h-[30px] max-w-[96px] shrink-0 items-center justify-center whitespace-nowrap rounded-lg border border-card-border px-2.5 text-[12px] font-[750]";

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
		<Page title="Account">
			{user ? (
				<div className="flex flex-col gap-6 pb-[calc(var(--sab,0px)+24px)]">
					<section className="flex items-center gap-3.5 rounded-2xl border border-card-border bg-popup-background p-4 shadow-[var(--shadow)]">
						<div
							className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full bg-surface-strong text-accent"
							aria-hidden="true"
						>
							{user.avatarUrl ? (
								<img
									src={user.avatarUrl}
									alt=""
									className="h-full w-full object-cover"
								/>
							) : (
								<span className="icon-user text-[24px]" />
							)}
						</div>
						<div className="flex min-w-0 flex-col gap-1">
							<h2 className="truncate text-[18px] font-[750] text-primary-text">
								{user.name || user.email}
							</h2>
							<p className="truncate text-[13px] text-secondary-text opacity-70">
								{user.email}
							</p>
						</div>
					</section>

					<section className="flex flex-col gap-2.5">
						<h3 className={SECTION_TITLE}>Profile</h3>
						<div className={CARD}>
							<div className={ROW}>
								<span className={`icon-mail ${ROW_ICON}`} aria-hidden="true" />
								<span className="flex min-w-0 flex-1 flex-col gap-0.5">
									<span className={ROW_LABEL}>Primary email</span>
									<span className={ROW_VALUE}>{user.email}</span>
								</span>
							</div>
						</div>
					</section>

					<section className="flex flex-col gap-2.5">
						<h3 className={SECTION_TITLE}>Linked accounts</h3>
						<div className={CARD}>
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
										className={clsx(ROW, "min-w-0", {
											"opacity-[0.58]": !enabled && !linked,
										})}
									>
										<span
											className={`${PROVIDER_ICONS[provider]} ${PROVIDER_ROW_ICON}`}
											aria-hidden="true"
										/>
										<span className="flex min-w-0 flex-1 flex-col gap-0.5">
											<span className={ROW_LABEL}>
												{PROVIDER_LABELS[provider]}
											</span>
											<span className={ROW_VALUE}>{value}</span>
										</span>
										{linked?.isPrimary ? (
											<span
												className={`${PILL} bg-[color-mix(in_srgb,var(--success)_12%,transparent)] text-success`}
											>
												Primary
											</span>
										) : linked ? (
											<button
												type="button"
												className={`${PILL} haptic-trigger bg-surface-soft text-danger active:opacity-65 disabled:opacity-[0.58]`}
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
												className={`${PILL} haptic-trigger bg-surface-soft text-accent active:opacity-65 disabled:opacity-[0.58]`}
												disabled={isAnyBusy}
												onClick={() => linkAccount(provider)}
											>
												{isBusy && accountAction?.type === "link"
													? "Linking"
													: "Link"}
											</button>
										) : (
											<span
												className={`${PILL} bg-surface-soft text-secondary-text`}
											>
												Unavailable
											</span>
										)}
									</div>
								);
							})}
						</div>
						{accountError && (
							<p className="m-0 rounded-xl border border-danger bg-surface-soft px-3 py-2.5 text-[12px] leading-snug text-primary-text">
								{accountError}
							</p>
						)}
					</section>

					<section className="flex flex-col gap-2.5">
						<h3 className={SECTION_TITLE}>History</h3>
						<div className={CARD}>
							<button
								type="button"
								className={`${ROW} haptic-trigger active:bg-[color-mix(in_srgb,var(--info)_8%,transparent)]`}
								onClick={openHistoryPage}
							>
								<span className={`icon-clock ${ROW_ICON}`} aria-hidden="true" />
								<span className="flex min-w-0 flex-1 flex-col gap-0.5">
									<span className={ROW_LABEL}>Hosts and devices</span>
									<span className={ROW_VALUE}>View connection history</span>
								</span>
								<span
									className="icon-chevron-right shrink-0 text-secondary-text opacity-[0.42]"
									aria-hidden="true"
								/>
							</button>
						</div>
					</section>

					<button
						type="button"
						className="haptic-trigger flex min-h-12 items-center justify-center gap-2 rounded-xl border border-card-border bg-surface-soft text-[14px] font-[750] text-primary-text active:opacity-70"
						onClick={() => logout().catch(console.error)}
					>
						<span
							className="icon-log-out text-[18px] text-danger"
							aria-hidden="true"
						/>
						<span>Log out</span>
					</button>
				</div>
			) : (
				<div className="m-auto flex flex-col items-center gap-3 text-secondary-text">
					<span className="icon-user text-[30px] text-accent" aria-hidden="true" />
					<p className="m-0 text-[14px]">No signed-in account is available.</p>
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
