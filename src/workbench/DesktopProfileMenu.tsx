import {
	Menu,
	MenuButton,
	MenuItem,
	MenuItems,
	MenuSeparator,
} from "@headlessui/react";
import { useAuth } from "lib/auth";
import { getInitials } from "lib/utils";

export type DesktopProfileDestination =
	| "account"
	| "agents"
	| "settings"
	| "reach-out"
	| "about";

const ITEMS: Array<{
	id: DesktopProfileDestination;
	label: string;
	icon: string;
	divider?: boolean;
}> = [
	{ id: "account", label: "Profile", icon: "icon-user" },
	{ id: "agents", label: "Agents", icon: "icon-ai-chat" },
	{ id: "settings", label: "Settings", icon: "icon-settings" },
	{
		id: "reach-out",
		label: "Reach Out",
		icon: "icon-message-circle",
		divider: true,
	},
	{ id: "about", label: "About", icon: "icon-info" },
];

export default function DesktopProfileMenu({
	onOpen,
}: {
	onOpen: (destination: DesktopProfileDestination) => void;
}) {
	const { user } = useAuth();

	return (
		<Menu as="div" className="contents">
			<MenuButton
				className="workbench-account-avatar account-avatar-button m-2 grid size-8 shrink-0 place-items-center overflow-hidden rounded-full border border-card-border bg-surface-strong text-accent transition-transform duration-150 hover:border-accent active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
				aria-label="User menu"
				title="User menu"
			>
				{user?.avatarUrl ? (
					<img src={user.avatarUrl} alt="" className="size-full object-cover" />
				) : user ? (
					<span className="text-[12px] font-bold uppercase leading-none">
						{getInitials(user.name || user.email)}
					</span>
				) : (
					<span className="icon-user text-[14px]" aria-hidden="true" />
				)}
			</MenuButton>
			<MenuItems
				anchor={{ to: "top start", gap: 8, padding: 8 }}
				portal
				modal={false}
				transition
				className="z-[10001] w-60 origin-bottom-left overflow-hidden rounded-xl border border-card-border bg-popup-background p-1 text-primary-text shadow-[var(--shadow)] transition duration-100 data-[closed]:translate-y-1 data-[closed]:scale-95 data-[closed]:opacity-0"
			>
				<div className="min-w-0 px-3 py-2.5">
					<strong className="block truncate text-xs font-semibold">
						{user?.name || (user ? "Shellular account" : "Not signed in")}
					</strong>
					<span className="mt-0.5 block truncate text-[11px] text-secondary-text">
						{user?.email ?? "Open Profile to sign in"}
					</span>
				</div>
				<MenuSeparator className="mx-1 h-px bg-card-border" />
				{ITEMS.map((item) => (
					<div key={item.id}>
						{item.divider && (
							<MenuSeparator className="mx-1 my-1 h-px bg-card-border" />
						)}
						<MenuItem>
							{({ focus }) => (
								<button
									type="button"
									className={`flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-xs ${focus ? "bg-surface-soft" : ""}`}
									onClick={() => onOpen(item.id)}
								>
									<span
										className={`${item.icon} grid size-4 place-items-center text-[14px] text-secondary-text`}
										aria-hidden="true"
									/>
									<span>{item.label}</span>
								</button>
							)}
						</MenuItem>
					</div>
				))}
			</MenuItems>
		</Menu>
	);
}
