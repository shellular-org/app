import { pushPage } from "App";
import RatingDialog from "components/RatingDialog";
import TabPageHeader from "components/TabPageHeader";
import AboutPage from "pages/about";
import PortsPage from "pages/ports";
import ReachOutPage from "pages/reach-out";
import SettingsPage from "pages/settings";
import { useState } from "react";

import "./style.scss";

interface AppTile {
	id: string;
	label: string;
	description: string;
	icon: string;
	onTap: () => void;
}

export default function MoreTab() {
	const [showRatingDialog, setShowRatingDialog] = useState(false);

	const tiles: AppTile[] = [
		{
			id: "ports",
			label: "Ports Management",
			description: "View and manage open ports",
			icon: "icon-power-cord",
			onTap: () => {
				pushPage("ports", <PortsPage />, { showConnectionBanner: false });
			},
		},
		{
			id: "settings",
			label: "Settings",
			description: "App preferences and configuration",
			icon: "icon-settings",
			onTap: () => {
				pushPage("settings", <SettingsPage />, { showConnectionBanner: false });
			},
		},
		{
			id: "reach-out",
			label: "Reach Out",
			description: "Contact us, report an issue, or say hi",
			icon: "icon-message-circle",
			onTap: () => {
				pushPage("reach-out", <ReachOutPage />, {
					showConnectionBanner: false,
				});
			},
		},
		{
			id: "about",
			label: "About",
			description: "Version info and licenses",
			icon: "icon-info",
			onTap: () => {
				pushPage("about", <AboutPage />, { showConnectionBanner: false });
			},
		},
		...(process.env.PLATFORM === "ios"
			? [
					{
						id: "rate",
						label: "Rate App",
						description: "Leave a review on the App Store",
						icon: "icon-star",
						onTap: () => {
							setShowRatingDialog(true);
						},
					},
				]
			: []),
	];

	return (
		<div className="more-tab">
			<TabPageHeader title="More" />
			<ul className="more-tab-list">
				{tiles.map(({ id, label, description, icon, onTap }) => (
					<li key={id}>
						<button type="button" className="more-tab-tile" onClick={onTap}>
							<span className={icon} aria-hidden="true" />
							<div className="more-tab-tile-text">
								<span className="more-tab-tile-label">{label}</span>
								<span className="more-tab-tile-desc">{description}</span>
							</div>
							<span
								className="icon-chevron-right more-tab-tile-chevron"
								aria-hidden="true"
							/>
						</button>
					</li>
				))}
			</ul>
			<RatingDialog
				isOpen={showRatingDialog}
				onClose={() => setShowRatingDialog(false)}
			/>
		</div>
	);
}
