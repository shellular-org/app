import clsx from "clsx";
import type { ComponentPropsWithoutRef } from "react";

type WorkbenchDividerProps = Omit<
	ComponentPropsWithoutRef<"div">,
	"aria-hidden" | "aria-orientation" | "role"
> & {
	orientation: "horizontal" | "vertical";
	interactive?: boolean;
	extendHitArea?: boolean;
};

export default function WorkbenchDivider({
	orientation,
	interactive = false,
	extendHitArea = false,
	className,
	tabIndex,
	"aria-valuenow": ariaValueNow,
	...props
}: WorkbenchDividerProps) {
	const classes = clsx(
		"workbench-divider",
		interactive && "is-interactive",
		className,
	);
	if (!interactive) {
		return (
			<div
				{...props}
				className={classes}
				data-orientation={orientation}
				aria-hidden="true"
			/>
		);
	}
	return (
		// biome-ignore lint/a11y/useSemanticElements: a div avoids native hr rules while supporting pointer capture and keyboard resizing.
		<div
			{...props}
			className={classes}
			data-extend-hit-area={extendHitArea ? "true" : undefined}
			data-orientation={orientation}
			role="separator"
			aria-orientation={orientation}
			aria-valuenow={ariaValueNow}
			tabIndex={tabIndex ?? 0}
		/>
	);
}
