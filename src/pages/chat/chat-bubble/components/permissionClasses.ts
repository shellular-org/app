export const permissionCardClass =
	"chat-bubble chat-bubble--assistant box-border min-w-0 max-w-full self-stretch overflow-hidden rounded-[10px] border border-border-color bg-surface-soft p-2.5";

export const permissionTitleClass =
	"box-border flex min-w-0 w-full max-w-full items-center gap-2 px-2.5 py-[9px] text-[12px] font-bold text-primary-text [overflow-wrap:anywhere] [word-break:break-word]";

export const permissionActionsClass =
	"flex min-w-0 w-full flex-col items-stretch justify-end gap-2 md:flex-row md:flex-wrap";

export function permissionButtonClass(kind: string): string {
	const base =
		"box-border min-h-[34px] min-w-0 max-w-full w-full rounded-lg border border-border-color px-3 font-[inherit] text-[12px] font-bold whitespace-normal [overflow-wrap:anywhere] [word-break:break-word] transition-[background,border-color] duration-150 active:scale-[0.98] disabled:opacity-35 md:w-auto md:max-w-full md:flex-[0_1_auto]";
	if (kind.startsWith("reject")) {
		return `${base} border-transparent bg-transparent text-secondary-text hover:border-border-color`;
	}
	if (kind === "allow_always") {
		return `${base} border-border-color bg-[color-mix(in_srgb,var(--button-background)_16%,transparent)] text-primary-text hover:bg-[color-mix(in_srgb,var(--button-background)_28%,transparent)]`;
	}
	return `${base} bg-button-background text-button-text`;
}
