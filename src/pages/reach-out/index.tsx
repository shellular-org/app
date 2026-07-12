import native from "bridge/native";
import Page from "components/Page";
import "../about/style.scss";

export type ReachOutLink = {
	icon: string;
	label: string;
	href: string;
};

export const REACH_OUT_LINKS = {
	discord: {
		icon: "icon-discord",
		href: "https://discord.gg/VUEqnyHdZx",
	},
	email: {
		icon: "icon-mail",
		href: "mailto:team@shellular.dev",
	},
	website: {
		icon: "icon-globe",
		href: "https://shellular.dev",
	},
	github: {
		icon: "icon-github",
		href: "https://github.com/Shellular-Org",
	},
	x: {
		icon: "icon-twitter",
		href: "https://x.com/shellular_dev",
	},
	linkedin: {
		icon: "icon-linkedin",
		href: "https://www.linkedin.com/company/shellular",
	},
} as const satisfies Record<string, Omit<ReachOutLink, "label">>;

const GET_IN_TOUCH: ReachOutLink[] = [
	{ ...REACH_OUT_LINKS.discord, label: "Join Discord" },
	{ ...REACH_OUT_LINKS.email, label: "Email us" },
];

const SOCIAL: ReachOutLink[] = [
	{ ...REACH_OUT_LINKS.website, label: "Website" },
	{ ...REACH_OUT_LINKS.github, label: "GitHub" },
	{ ...REACH_OUT_LINKS.x, label: "X" },
	{ ...REACH_OUT_LINKS.linkedin, label: "LinkedIn" },
];

function ReachOutRow({ icon, label, href }: ReachOutLink) {
	return (
		<button
			type="button"
			className="about-link-item"
			onClick={() => native.openInBrowser(href)}
		>
			<span className={`${icon} about-link-icon`} aria-hidden="true" />
			<span className="about-link-label">{label}</span>
			<span
				className="icon-chevron-right about-link-chevron"
				aria-hidden="true"
			/>
		</button>
	);
}

export default function ReachOutPage() {
	return (
		<Page title="Reach Out">
			<section>
				<p className="about-section-title">Get in touch</p>
				<div className="about-card">
					{GET_IN_TOUCH.map((link) => (
						<ReachOutRow key={link.href} {...link} />
					))}
				</div>
			</section>

			<section>
				<p className="about-section-title">Social</p>
				<div className="about-card">
					{SOCIAL.map((link) => (
						<ReachOutRow key={link.href} {...link} />
					))}
				</div>
			</section>
		</Page>
	);
}
