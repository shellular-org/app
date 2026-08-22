import { pushPage } from "App";
import RatingDialog from "components/RatingDialog";
import TabPageHeader from "components/TabPageHeader";
import { openPortsPage } from "lib/navigate";
import AboutPage from "pages/about";
import ReachOutPage from "pages/reach-out";
import SettingsPage from "pages/settings";
import { useState } from "react";

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
				openPortsPage().catch(console.error);
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
		<div className="flex min-h-full flex-col">
			<TabPageHeader title="More" />
			<ul className="m-0 flex list-none flex-col gap-0.5 px-2 py-2">
				{tiles.map(({ id, label, description, icon, onTap }) => (
					<li key={id}>
						<button
							type="button"
							className="haptic-trigger flex w-full items-center gap-4 rounded-2xl px-3 py-3.5 text-left text-primary-text transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--info)_6%,transparent)] active:bg-[color-mix(in_srgb,var(--info)_10%,transparent)]"
							onClick={onTap}
						>
							<span
								className={`${icon} shrink-0 text-[20px] text-primary-text`}
								aria-hidden="true"
							/>
							<div className="flex flex-1 flex-col gap-0.5">
								<span className="text-[15px] font-semibold text-primary-text">
									{label}
								</span>
								<span className="text-[12px] text-secondary-text opacity-60">
									{description}
								</span>
							</div>
							<span
								className="icon-chevron-right shrink-0 text-[16px] text-secondary-text opacity-40"
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
