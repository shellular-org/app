import { pushPage } from "App";
import Page from "components/Page";
import { AnimatePresence, domAnimation, LazyMotion, m } from "framer-motion";
import ReachOutPage from "pages/reach-out";
import { useState } from "react";
import acodeIcon from "res/acode.png";
import betterKeepIcon from "res/better_keep.png";
import chess69Icon from "res/chess69.png";
import licenses from "./licenses";
import "./style.scss";
import { openBrowserSurface } from "workbench/browserSurface";
import { tryOpenUtilitySurface } from "workbench/openers";

export default function AboutPage() {
	const [expanded, setExpanded] = useState<Record<string, boolean>>({});

	function toggleGroup(category: string) {
		setExpanded((prev) => ({ ...prev, [category]: !prev[category] }));
	}

	return (
		<Page title="About" className="about-page">
			<LazyMotion features={domAnimation}>
				<div className="about-hero">
					<div className="about-hero-icon-wrapper">
						<span
							className="icon-shellular about-hero-icon"
							aria-hidden="true"
						/>
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
					<p className="about-hero-credit">
						Built by the team behind Acode, the mobile code editor with 4M
						downloads on Play Store.
					</p>
				</div>

				<section className="about-reach-out">
					<div className="about-card">
						<button
							type="button"
							className="about-link-item"
							onClick={() => {
								if (
									tryOpenUtilitySurface(
										"reach-out",
										"Reach Out",
										"icon-message-circle",
									)
								)
									return;
								pushPage("reach-out", <ReachOutPage />, {
									showConnectionBanner: false,
								});
							}}
						>
							<span
								className="icon-message-circle about-link-icon"
								aria-hidden="true"
							/>
							<span className="about-link-label">Want to reach out?</span>
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
							onClick={() =>
								openBrowserSurface("https://acode.app", "Acode Editor")
							}
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
								openBrowserSurface(
									"https://betterkeep.app/welcome",
									"Better Keep",
								)
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
							onClick={() =>
								openBrowserSurface("https://chess69.com", "Hanging Piece")
							}
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
										<m.div
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
														onClick={() =>
															openBrowserSurface(entry.url, entry.name)
														}
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
										</m.div>
									)}
								</AnimatePresence>
							</div>
						);
					})}
				</section>
			</LazyMotion>
		</Page>
	);
}
