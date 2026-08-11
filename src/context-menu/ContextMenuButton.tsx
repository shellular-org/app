import type { ReactNode } from "react";
import { showContextMenu } from "./service";
import type { CommandId, CommandTarget, ContextMenuId } from "./types";

export default function ContextMenuButton({
	ariaLabel,
	className,
	children,
	menuId,
	commandGroups,
	target,
	disabled,
}: {
	ariaLabel: string;
	className?: string;
	children: ReactNode;
	menuId: ContextMenuId;
	commandGroups?: readonly (readonly CommandId[])[];
	target: CommandTarget;
	disabled?: boolean;
}) {
	const open = (
		origin: HTMLButtonElement,
		anchor: Parameters<typeof showContextMenu>[0]["anchor"],
		trigger: Parameters<typeof showContextMenu>[0]["trigger"],
	) =>
		showContextMenu({ menuId, commandGroups, target, origin, anchor, trigger });
	return (
		<button
			type="button"
			className={className}
			aria-label={ariaLabel}
			disabled={disabled}
			onClick={(event) => {
				event.stopPropagation();
				const rect = event.currentTarget.getBoundingClientRect();
				void open(
					event.currentTarget,
					{
						kind: "rect",
						left: rect.left,
						top: rect.top,
						right: rect.right,
						bottom: rect.bottom,
					},
					"button",
				);
			}}
			onContextMenu={(event) => {
				event.preventDefault();
				event.stopPropagation();
				void open(
					event.currentTarget,
					{
						kind: "point",
						x: event.clientX,
						y: event.clientY,
					},
					"context",
				);
			}}
		>
			{children}
		</button>
	);
}
