import dialog from "bridge/dialog";
import {
	applyKeybindingChanges,
	getKeybindingsSnapshot,
	initializeKeybindings,
	resetPlatformKeybindings,
	setCommandKeybindings,
	subscribeKeybindings,
} from "lib/keybindings";
import toast from "lib/toast";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
	bindingIdentifier,
	bindingsEqual,
	DESKTOP_COMMAND_IDS,
	DESKTOP_COMMANDS,
	type DesktopKeyboardCommand,
	defaultShortcutsForCommand,
	detectDesktopShortcutPlatform,
	findKeybindingConflicts,
	formatShortcutBinding,
	formatShortcutStrokeParts,
	isCommandModified,
	resolveKeybindings,
	type ShortcutBinding,
	type ShortcutStroke,
	shortcutStrokeFromEvent,
} from "workbench/desktopShortcuts";

interface RecordingState {
	command: DesktopKeyboardCommand;
	strokes: ShortcutStroke[];
}

export default function KeyboardShortcutsSettings({
	query,
}: {
	query: string;
}) {
	const snapshot = useSyncExternalStore(
		subscribeKeybindings,
		getKeybindingsSnapshot,
	);
	const platform = useMemo(() => detectDesktopShortcutPlatform(), []);
	const [modifiedOnly, setModifiedOnly] = useState(false);
	const [recording, setRecording] = useState<RecordingState | null>(null);
	const resolved = useMemo(
		() => resolveKeybindings(platform, snapshot.overrides),
		[platform, snapshot.overrides],
	);

	useEffect(() => {
		void initializeKeybindings().catch(() =>
			toast("Couldn't load keyboard shortcuts", 2600),
		);
	}, []);

	const commands = useMemo(() => {
		const normalized = query.trim().toLowerCase();
		return DESKTOP_COMMAND_IDS.filter((command) => {
			if (!DESKTOP_COMMANDS[command].configurable) return false;
			if (
				modifiedOnly &&
				!isCommandModified(command, platform, snapshot.overrides)
			)
				return false;
			if (!normalized) return true;
			const definition = DESKTOP_COMMANDS[command];
			return (
				definition.label.toLowerCase().includes(normalized) ||
				command.toLowerCase().includes(normalized) ||
				definition.category.toLowerCase().includes(normalized) ||
				resolved[command].some((binding) =>
					formatShortcutBinding(binding, platform)
						.toLowerCase()
						.includes(normalized),
				)
			);
		}).sort((left, right) => {
			const category = DESKTOP_COMMANDS[left].category.localeCompare(
				DESKTOP_COMMANDS[right].category,
			);
			return (
				category ||
				DESKTOP_COMMANDS[left].label.localeCompare(
					DESKTOP_COMMANDS[right].label,
				)
			);
		});
	}, [modifiedOnly, platform, query, resolved, snapshot.overrides]);

	async function persistBinding(
		command: DesktopKeyboardCommand,
		binding: ShortcutBinding,
	) {
		if (
			resolved[command].some((candidate) => bindingsEqual(candidate, binding))
		) {
			setRecording(null);
			return;
		}
		const nextBindings = [...resolved[command], binding];
		const conflicts = findKeybindingConflicts(command, binding, resolved);
		const replacements: Partial<
			Record<DesktopKeyboardCommand, ShortcutBinding[]>
		> = { [command]: nextBindings };
		if (conflicts.length) {
			const labels = conflicts
				.map((candidate) => DESKTOP_COMMANDS[candidate].label)
				.join(", ");
			if (
				!(await dialog.confirm(
					`${formatShortcutBinding(binding, platform)} is already used by ${labels}. Replace the existing binding?`,
					"Shortcut Conflict",
				))
			)
				return;
			for (const conflict of conflicts) {
				replacements[conflict] = resolved[conflict].filter(
					(candidate) => !bindingsEqual(candidate, binding),
				);
			}
		}
		try {
			await applyKeybindingChanges(platform, { set: replacements });
			setRecording(null);
		} catch (error) {
			console.error("Failed to save keybinding", error);
			toast("Couldn't save keyboard shortcut", 2600);
		}
	}

	async function resetCommand(command: DesktopKeyboardCommand) {
		const defaults = defaultShortcutsForCommand(command, platform);
		const replacements: Partial<
			Record<DesktopKeyboardCommand, ShortcutBinding[]>
		> = {};
		const conflicts = new Set<DesktopKeyboardCommand>();
		for (const binding of defaults) {
			for (const conflict of findKeybindingConflicts(
				command,
				binding,
				resolved,
			)) {
				conflicts.add(conflict);
				replacements[conflict] = (
					replacements[conflict] ?? resolved[conflict]
				).filter((candidate) => !bindingsEqual(candidate, binding));
			}
		}
		if (conflicts.size) {
			const labels = [...conflicts]
				.map((candidate) => DESKTOP_COMMANDS[candidate].label)
				.join(", ");
			if (
				!(await dialog.confirm(
					`The default shortcut conflicts with ${labels}. Replace the conflicting user binding?`,
					"Reset Shortcut",
				))
			)
				return;
		}
		try {
			await applyKeybindingChanges(platform, {
				set: replacements,
				reset: [command],
			});
		} catch (error) {
			console.error("Failed to reset keybinding", error);
			toast("Couldn't reset keyboard shortcut", 2600);
		}
	}

	async function resetAll() {
		if (
			!(await dialog.confirm(
				"Reset every shortcut for this platform to the VS Code defaults?",
				"Reset Keyboard Shortcuts",
			))
		)
			return;
		try {
			await resetPlatformKeybindings(platform);
		} catch (error) {
			console.error("Failed to reset keybindings", error);
			toast("Couldn't reset keyboard shortcuts", 2600);
		}
	}

	return (
		<div className="animate-in fade-in duration-300">
			<div className="mb-5 flex flex-wrap items-center justify-between gap-3">
				<div>
					<h2 className="text-[18px] font-semibold text-(--primary-text)">
						Keyboard Shortcuts
					</h2>
					<p className="mt-1 text-[13px] text-(--secondary-text)">
						VS Code defaults for {platformLabel(platform)}. Shellular-only
						commands start unassigned.
					</p>
				</div>
				<div className="flex items-center gap-2">
					<button
						type="button"
						aria-pressed={modifiedOnly}
						className={`rounded-md border px-3 py-1.5 text-xs ${
							modifiedOnly
								? "border-(--accent) bg-(--surface-strong) text-(--primary-text)"
								: "border-(--card-border) text-(--secondary-text) hover:text-(--primary-text)"
						}`}
						onClick={() => setModifiedOnly((value) => !value)}
					>
						Modified only
					</button>
					<button
						type="button"
						className="rounded-md border border-(--card-border) px-3 py-1.5 text-xs text-(--secondary-text) hover:bg-(--surface-soft) hover:text-(--primary-text)"
						onClick={() => void resetAll()}
					>
						Reset All
					</button>
				</div>
			</div>

			<div className="overflow-hidden rounded-xl border border-(--card-border)">
				{commands.map((command) => {
					const definition = DESKTOP_COMMANDS[command];
					const modified = isCommandModified(
						command,
						platform,
						snapshot.overrides,
					);
					const commandConflicts = resolved[command].flatMap((binding) =>
						findKeybindingConflicts(command, binding, resolved),
					);
					return (
						<div
							key={command}
							className="border-b border-(--card-border) p-3 last:border-0"
						>
							<div className="flex items-start justify-between gap-3">
								<div className="min-w-0">
									<div className="flex flex-wrap items-center gap-2">
										<span className="text-sm font-medium text-(--primary-text)">
											{definition.label}
										</span>
										<span className="rounded bg-(--surface-soft) px-1.5 py-0.5 text-[10px] text-(--secondary-text)">
											{definition.category}
										</span>
										<span
											className={`text-[10px] font-medium ${
												modified ? "text-(--accent)" : "text-(--secondary-text)"
											}`}
										>
											{modified ? "User" : "Default"}
										</span>
										{commandConflicts.length > 0 && (
											<span className="text-[10px] font-medium text-danger">
												Conflict
											</span>
										)}
									</div>
									<div className="mt-0.5 truncate font-mono text-[10px] text-(--secondary-text)">
										{command}
									</div>
								</div>
								<div className="flex shrink-0 items-center gap-1">
									<button
										type="button"
										className="grid size-7 place-items-center rounded text-(--secondary-text) hover:bg-(--surface-soft) hover:text-(--primary-text)"
										aria-label={`Add shortcut for ${definition.label}`}
										title="Add Binding"
										onClick={() => setRecording({ command, strokes: [] })}
									>
										<span className="icon-plus" aria-hidden="true" />
									</button>
									{modified && (
										<button
											type="button"
											className="grid size-7 place-items-center rounded text-(--secondary-text) hover:bg-(--surface-soft) hover:text-(--primary-text)"
											aria-label={`Reset ${definition.label}`}
											title="Reset Command"
											onClick={() => void resetCommand(command)}
										>
											<span className="icon-rotate-ccw" aria-hidden="true" />
										</button>
									)}
								</div>
							</div>
							<div className="mt-3 flex flex-wrap items-center gap-2">
								{resolved[command].length ? (
									resolved[command].map((binding, index) => (
										<span
											key={`${command}-${bindingIdentifier(binding)}`}
											className="inline-flex min-h-8 items-stretch overflow-hidden rounded-lg border border-(--card-border) bg-(--surface-soft)"
										>
											<ShortcutKeys binding={binding} platform={platform} />
											<button
												type="button"
												className="grid w-8 shrink-0 place-items-center border-l border-(--card-border) text-(--secondary-text) transition-colors hover:bg-danger/10 hover:text-danger focus-visible:bg-danger/10 focus-visible:text-danger focus-visible:outline-none"
												aria-label={`Remove ${formatShortcutBinding(binding, platform)} from ${definition.label}`}
												onClick={() =>
													void setCommandKeybindings(
														platform,
														command,
														resolved[command].filter(
															(_, bindingIndex) => bindingIndex !== index,
														),
													).catch((error) => {
														console.error("Failed to remove keybinding", error);
														toast("Couldn't save keyboard shortcut", 2600);
													})
												}
											>
												<span
													className="icon-x block text-[11px] leading-none"
													aria-hidden="true"
												/>
											</button>
										</span>
									))
								) : (
									<span className="text-xs italic text-(--secondary-text)">
										Unassigned
									</span>
								)}
							</div>
						</div>
					);
				})}
				{commands.length === 0 && (
					<div className="p-8 text-center text-sm text-(--secondary-text)">
						No keyboard shortcuts match this filter.
					</div>
				)}
			</div>

			{recording && (
				<KeybindingRecorder
					state={recording}
					platform={platform}
					onChange={setRecording}
					onCancel={() => setRecording(null)}
					onSave={(binding) => void persistBinding(recording.command, binding)}
				/>
			)}
		</div>
	);
}

function ShortcutKeys({
	binding,
	platform,
}: {
	binding: ShortcutBinding;
	platform: ReturnType<typeof detectDesktopShortcutPlatform>;
}) {
	const renderStroke = (
		stroke: ShortcutStroke,
		position: "first" | "second",
	) => {
		const strokeId = bindingIdentifier({ strokes: [stroke] });
		return (
			<span
				key={`${position}-${strokeId}`}
				className="inline-flex items-center gap-1.5"
				aria-hidden="true"
			>
				{formatShortcutStrokeParts(stroke, platform).map((part) => (
					<span
						key={`${strokeId}-${part}`}
						className="inline-flex min-h-6 min-w-6 items-center justify-center rounded-md border border-(--card-border) bg-(--popup-background) px-1.5 py-1 text-[10px] leading-none shadow-sm"
					>
						{part}
					</span>
				))}
			</span>
		);
	};

	return (
		<kbd
			aria-label={formatShortcutBinding(binding, platform)}
			className="flex items-center gap-2 whitespace-nowrap px-2.5 py-1.5 font-mono text-(--primary-text)"
		>
			{renderStroke(binding.strokes[0], "first")}
			{binding.strokes[1] && renderStroke(binding.strokes[1], "second")}
		</kbd>
	);
}

function KeybindingRecorder({
	state,
	platform,
	onChange,
	onCancel,
	onSave,
}: {
	state: RecordingState;
	platform: ReturnType<typeof detectDesktopShortcutPlatform>;
	onChange: (state: RecordingState) => void;
	onCancel: () => void;
	onSave: (binding: ShortcutBinding) => void;
}) {
	useEffect(() => {
		const capture = (event: KeyboardEvent) => {
			event.preventDefault();
			event.stopPropagation();
			if (event.key === "Escape") {
				onCancel();
				return;
			}
			const stroke = shortcutStrokeFromEvent(event);
			if (!stroke) return;
			onChange({
				...state,
				strokes:
					state.strokes.length >= 2 ? [stroke] : [...state.strokes, stroke],
			});
		};
		document.addEventListener("keydown", capture, true);
		return () => document.removeEventListener("keydown", capture, true);
	}, [onCancel, onChange, state]);

	const binding =
		state.strokes.length > 0
			? ({
					strokes: state.strokes as ShortcutBinding["strokes"],
				} satisfies ShortcutBinding)
			: null;

	return (
		<div
			className="fixed inset-0 z-[12000] grid place-items-center bg-black/55 p-4"
			role="dialog"
			aria-modal="true"
			aria-label="Record keyboard shortcut"
			data-keybinding-capture="true"
		>
			<div className="w-full max-w-md rounded-xl border border-(--card-border) bg-(--popup-background) p-5 shadow-[var(--shadow)]">
				<h3 className="text-base font-semibold text-(--primary-text)">
					Record shortcut
				</h3>
				<p className="mt-1 text-xs text-(--secondary-text)">
					Press one key combination or a two-stroke chord. Escape cancels.
				</p>
				<div className="my-5 grid min-h-14 place-items-center rounded-lg border border-(--card-border) bg-(--surface-soft) px-3">
					{binding ? (
						<kbd className="font-mono text-sm text-(--primary-text)">
							{formatShortcutBinding(binding, platform)}
						</kbd>
					) : (
						<span className="text-sm text-(--secondary-text)">
							Waiting for keys…
						</span>
					)}
				</div>
				<div className="flex justify-end gap-2">
					<button
						type="button"
						className="rounded-md px-3 py-2 text-xs text-(--secondary-text) hover:bg-(--surface-soft)"
						onClick={onCancel}
					>
						Cancel
					</button>
					<button
						type="button"
						disabled={!binding}
						className="rounded-md bg-(--button-background) px-3 py-2 text-xs font-semibold text-(--button-text) disabled:opacity-40"
						onClick={() => binding && onSave(binding)}
					>
						Save
					</button>
				</div>
			</div>
		</div>
	);
}

function platformLabel(
	platform: ReturnType<typeof detectDesktopShortcutPlatform>,
) {
	if (platform === "mac") return "macOS";
	if (platform === "windows") return "Windows";
	return "Linux";
}
