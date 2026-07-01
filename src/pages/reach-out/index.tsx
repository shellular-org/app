import native from "bridge/native";
import Page from "components/Page";
import "../about/style.scss";

export default function ReachOutPage() {
	return (
		<Page title="Reach Out">
			<section>
				<p className="about-section-title">Get in touch</p>
				<div className="about-card">
					<button
						type="button"
						className="about-link-item"
						onClick={() =>
							native.openInBrowser("https://discord.gg/VUEqnyHdZx")
						}
					>
						<span className="icon-discord about-link-icon" aria-hidden="true" />
						<span className="about-link-label">Join Discord</span>
						<span
							className="icon-chevron-right about-link-chevron"
							aria-hidden="true"
						/>
					</button>
					<button
						type="button"
						className="about-link-item"
						onClick={() => native.openInBrowser("mailto:team@shellular.dev")}
					>
						<span className="icon-mail about-link-icon" aria-hidden="true" />
						<span className="about-link-label">Email us</span>
						<span
							className="icon-chevron-right about-link-chevron"
							aria-hidden="true"
						/>
					</button>
				</div>
			</section>

			<section>
				<p className="about-section-title">Social</p>
				<div className="about-card">
					<button
						type="button"
						className="about-link-item"
						onClick={() => native.openInBrowser("https://shellular.dev")}
					>
						<span className="icon-globe about-link-icon" aria-hidden="true" />
						<span className="about-link-label">Website</span>
						<span
							className="icon-chevron-right about-link-chevron"
							aria-hidden="true"
						/>
					</button>
					<button
						type="button"
						className="about-link-item"
						onClick={() =>
							native.openInBrowser("https://github.com/Shellular-Org")
						}
					>
						<span className="icon-github about-link-icon" aria-hidden="true" />
						<span className="about-link-label">GitHub</span>
						<span
							className="icon-chevron-right about-link-chevron"
							aria-hidden="true"
						/>
					</button>
					<button
						type="button"
						className="about-link-item"
						onClick={() => native.openInBrowser("https://x.com/shellular_dev")}
					>
						<span className="icon-twitter about-link-icon" aria-hidden="true" />
						<span className="about-link-label">X</span>
						<span
							className="icon-chevron-right about-link-chevron"
							aria-hidden="true"
						/>
					</button>
					<button
						type="button"
						className="about-link-item"
						onClick={() =>
							native.openInBrowser("https://www.linkedin.com/company/shellular")
						}
					>
						<span
							className="icon-linkedin about-link-icon"
							aria-hidden="true"
						/>
						<span className="about-link-label">LinkedIn</span>
						<span
							className="icon-chevron-right about-link-chevron"
							aria-hidden="true"
						/>
					</button>
				</div>
			</section>
		</Page>
	);
}
