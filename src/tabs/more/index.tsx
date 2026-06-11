import "./style.scss";
import { pushPage } from "App";
import TabPageHeader from "components/TabPageHeader";
import AboutPage from "pages/about";
import PortsPage from "pages/ports";
import SettingsPage from "pages/settings";

interface AppTile {
	id: string;
	label: string;
	description: string;
	icon: string;
	onTap: () => void;
}

export default function MoreTab() {
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
			id: "about",
			label: "About",
			description: "Version info and licenses",
			icon: "icon-info",
			onTap: () => {
				pushPage("about", <AboutPage />, { showConnectionBanner: false });
			},
		},
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
		</div>
	);
}
