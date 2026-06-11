import browser from "bridge/browser";
import Page from "components/Page";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import acodeIcon from "res/acode.png";
import betterKeepIcon from "res/better_keep.png";
import chess69Icon from "res/chess69.png";
import licenses from "./licenses";
import "./style.scss";
import native from "bridge/native";

export default function AboutPage() {
	const [expanded, setExpanded] = useState<Record<string, boolean>>({});

	function toggleGroup(category: string) {
		setExpanded((prev) => ({ ...prev, [category]: !prev[category] }));
	}

	return (
		<Page title="About">
			<div className="about-hero">
				<div className="about-hero-icon-wrapper">
					<span className="icon-shellular about-hero-icon" aria-hidden="true" />
				</div>
				<h1 className="about-hero-title flex items-center gap-2 relative">
					Shellular{" "}
					<span className="text-(--accent) text-xs absolute right-[-32px] top-[0px]">
						beta
					</span>
				</h1>
				<p className="about-hero-version">
					Version {process.env.VERSION} ({process.env.VERSION_CODE})
				</p>
			</div>

			<section>
				<p className="about-section-title">Links</p>
				<div className="about-card">
					<button
						type="button"
						className="about-link-item"
						onClick={() => native.openInBrowser("https://discord.gg/Fu2SD3nNF")}
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

			<section>
				<p className="about-section-title">Other Apps</p>
				<div className="about-card">
					<button
						type="button"
						className="about-link-item"
						onClick={() => native.openInBrowser("https://acode.app")}
					>
						<img
							src={acodeIcon}
							alt=""
							className="about-link-icon about-link-icon--img"
						/>
						<span className="about-link-label">Acode Editor</span>
						<span
							className="icon-chevron-right about-link-chevron"
							aria-hidden="true"
						/>
					</button>
					<button
						type="button"
						className="about-link-item"
						onClick={() =>
							native.openInBrowser("https://betterkeep.app/welcome")
						}
					>
						<img
							src={betterKeepIcon}
							alt=""
							className="about-link-icon about-link-icon--img"
						/>
						<span className="about-link-label">Better Keep</span>
						<span
							className="icon-chevron-right about-link-chevron"
							aria-hidden="true"
						/>
					</button>
					<button
						type="button"
						className="about-link-item"
						onClick={() => native.openInBrowser("https://chess69.com")}
					>
						<img
							src={chess69Icon}
							alt=""
							className="about-link-icon about-link-icon--img"
						/>
						<span className="about-link-label">Hanging Piece</span>
						<span
							className="icon-chevron-right about-link-chevron"
							aria-hidden="true"
						/>
					</button>
				</div>
			</section>

			<section>
				<p className="about-section-title">Open Source Licenses</p>
				{licenses.map((group) => {
					const isOpen = !!expanded[group.category];
					return (
						<div
							className="about-card about-license-group"
							key={group.category}
						>
							<button
								type="button"
								className="about-link-item about-license-header"
								onClick={() => toggleGroup(group.category)}
							>
								<span
									className={`${group.icon} about-link-icon`}
									aria-hidden="true"
								/>
								<span className="about-link-label">
									{group.category}
									<span className="about-license-count">
										{group.entries.length}
									</span>
								</span>
								<span
									className={`icon-chevron-right about-link-chevron about-license-chevron${isOpen ? " about-license-chevron--open" : ""}`}
									aria-hidden="true"
								/>
							</button>
							<AnimatePresence initial={false}>
								{isOpen && (
									<motion.div
										initial={{ height: 0, opacity: 0 }}
										animate={{ height: "auto", opacity: 1 }}
										exit={{ height: 0, opacity: 0 }}
										transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
										style={{ overflow: "hidden" }}
									>
										<div className="about-license-entries">
											{group.entries.map((entry) => (
												<button
													type="button"
													className="about-license-entry"
													key={entry.name}
													onClick={() => browser.open(entry.url)}
												>
													<span className="about-license-name">
														{entry.name}
													</span>
													<span className="about-license-badge">
														{entry.license}
													</span>
													<span
														className="icon-external-link about-license-ext"
														aria-hidden="true"
													/>
												</button>
											))}
										</div>
									</motion.div>
								)}
							</AnimatePresence>
						</div>
					);
				})}
			</section>
		</Page>
	);
}
