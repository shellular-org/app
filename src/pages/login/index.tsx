import native from "bridge/native";
import clsx from "clsx";
import BottomSheet from "components/BottomSheet";
import OfflineBanner from "components/OfflineBanner";
import { useAuth } from "lib/auth";
import { REACH_OUT_LINKS, type ReachOutLink } from "pages/reach-out";
import { useState } from "react";

const HELP_LINKS: ReachOutLink[] = [
	{ ...REACH_OUT_LINKS.discord, label: "Join Discord" },
	{ ...REACH_OUT_LINKS.email, label: "Email us" },
	{ ...REACH_OUT_LINKS.x, label: "DM us on X" },
	{ ...REACH_OUT_LINKS.linkedin, label: "LinkedIn" },
];

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
	const [helpOpen, setHelpOpen] = useState(false);
	const enabledProviders = providers.filter((provider) => provider.enabled);

	return (
		<div className="fixed inset-0 flex flex-col overflow-hidden bg-primary text-primary-text pt-[calc(var(--sat,0px)+18px)] pb-[calc(var(--sab,0px)+32px)] px-5">
			<OfflineBanner onChange={setOnline} />
			<div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center gap-9">
				<div
					className="flex flex-col items-center text-center"
					style={{ animation: "rise-in 0.5s cubic-bezier(0.4,0,0.2,1) both" }}
				>
					<span
						className="icon-shellular mb-6 text-[64px] leading-none text-accent [animation:float_3s_ease-in-out_infinite] before:text-accent"
						aria-hidden="true"
					/>
					<h1 className="text-[32px] font-extrabold leading-[1.15] tracking-[-0.8px] text-primary-text">
						Welcome to Shellular
					</h1>
					<p className="mt-3 max-w-[300px] text-[15px] leading-relaxed text-secondary-text opacity-75">
						Sign in to reach your dev machine, agents, terminals, files, and
						ports — from your phone.
					</p>
				</div>

				<div className="flex flex-col gap-2.5">
					{enabledProviders.map((provider, i) => {
						const loading = signingInProvider === provider.id;
						return (
							<button
								key={provider.id}
								type="button"
								style={{
									animation: `rise-in 0.45s cubic-bezier(0.4,0,0.2,1) both`,
									animationDelay: `${0.08 + i * 0.06}s`,
								}}
								className={clsx(
									"haptic-trigger relative flex min-h-[54px] w-full items-center justify-center gap-3 rounded-2xl border border-card-border bg-popup-background px-4 text-[15px] font-bold text-primary-text shadow-[var(--shadow)] transition-[background,border-color,transform] duration-150 active:scale-[0.98] active:bg-[color-mix(in_srgb,var(--info)_8%,transparent)] disabled:cursor-default disabled:opacity-45",
									{ "opacity-70": loading },
								)}
								disabled={!online || signingInProvider !== null}
								onClick={() => signIn(provider.id)}
							>
								<span
									className={clsx(
										PROVIDER_ICONS[provider.id],
										// Provider glyphs are a multi-color icon font: some (e.g.
										// icon-google) hardcode `color` on ::before, others inherit.
										// Force the ::before to the parent color so all render as an
										// adaptive black/white monochrome mark.
										"text-[21px] text-primary-text before:!text-current",
									)}
									aria-hidden="true"
								/>
								<span>{PROVIDER_LABELS[provider.id]}</span>
								{loading && (
									<span
										className="absolute right-4 h-4 w-4 rounded-full border-2 border-line-soft border-t-primary-text [animation:spin_0.8s_linear_infinite]"
										aria-hidden="true"
									/>
								)}
							</button>
						);
					})}
				</div>

				{enabledProviders.length === 0 && (
					<div className="flex items-start gap-2.5 rounded-xl border border-[color-mix(in_srgb,var(--warning)_22%,transparent)] bg-[color-mix(in_srgb,var(--warning)_8%,transparent)] px-3.5 py-3">
						<span
							className="icon-alert-triangle mt-px shrink-0 text-[15px] text-warning"
							aria-hidden="true"
						/>
						<p className="text-[13px] leading-normal text-secondary-text">
							Sign-in is not configured on this server yet.
						</p>
					</div>
				)}

				{error && (
					<div className="flex items-start gap-2.5 rounded-xl border border-[color-mix(in_srgb,var(--danger)_22%,transparent)] bg-[color-mix(in_srgb,var(--danger)_7%,transparent)] px-3.5 py-3">
						<span
							className="icon-alert-triangle mt-px shrink-0 text-[15px] text-danger"
							aria-hidden="true"
						/>
						<p className="text-[13px] leading-normal text-primary-text">
							{error}
						</p>
					</div>
				)}

				<button
					type="button"
					className="haptic-trigger mx-auto text-[13px] font-medium text-secondary-text underline decoration-line-soft underline-offset-4 transition-colors active:text-primary-text"
					onClick={() => setHelpOpen(true)}
				>
					Unable to log in?
				</button>
			</div>

			<BottomSheet
				open={helpOpen}
				onClose={() => setHelpOpen(false)}
				title="Unable to log in?"
			>
				<p className="mb-4 text-[13px] leading-relaxed text-secondary-text opacity-80">
					Having trouble signing in? Reach out and we'll get you sorted.
				</p>
				<div className="flex flex-col gap-2">
					{HELP_LINKS.map((link) => (
						<button
							key={link.href}
							type="button"
							className="haptic-trigger flex min-h-[52px] items-center gap-3 rounded-2xl border border-card-border bg-primary px-4 text-left transition-[background,transform] duration-150 active:scale-[0.98] active:bg-[color-mix(in_srgb,var(--info)_8%,transparent)]"
							onClick={() => native.openInBrowser(link.href)}
						>
							<span
								className={clsx(
									link.icon,
									"text-[19px] text-accent before:!text-current",
								)}
								aria-hidden="true"
							/>
							<span className="flex-1 text-[15px] font-bold text-primary-text">
								{link.label}
							</span>
							<span
								className="icon-chevron-right text-[15px] text-secondary-text opacity-60"
								aria-hidden="true"
							/>
						</button>
					))}
				</div>
			</BottomSheet>
		</div>
	);
}
