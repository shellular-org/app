import "./AccessoryToolbarEditor.scss";
import {
	addToolbarKey,
	defaultToolbarRows,
	moveKeyLeft,
	moveKeyRight,
	moveKeyToOtherRow,
	removeToolbarKey,
	replaceToolbarKey,
	TERMINAL_TOOLBAR_KEY_META,
	toolbarKeyLabel,
	type ToolbarKeyPosition,
	unusedToolbarKeys,
} from "lib/accessoryToolbarLayout";
import {
	TERMINAL_TOOLBAR_KEY_IDS,
	type TerminalToolbarKeyId,
} from "lib/settings";
import { useMemo, useState } from "react";

type Props = {
	rows: string[][];
	onChange: (rows: string[][]) => void;
};

function isSameLayout(a: string[][], b: string[][]): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

function KeyFace({ id }: { id: string }) {
	const meta = isTerminalId(id) ? TERMINAL_TOOLBAR_KEY_META[id] : null;
	if (meta?.icon) {
		return (
			<>
				<span className={meta.icon} aria-hidden="true" />
				<span className="sr-only">{meta.label}</span>
			</>
		);
	}
	return (
		<span className="accessory-toolbar-key-label">
			{toolbarKeyLabel(id)}
		</span>
	);
}

function isTerminalId(id: string): id is TerminalToolbarKeyId {
	return (TERMINAL_TOOLBAR_KEY_IDS as readonly string[]).includes(id);
}

export default function AccessoryToolbarEditor({ rows, onChange }: Props) {
	const [selected, setSelected] = useState<ToolbarKeyPosition | null>(null);
	const [replaceOpen, setReplaceOpen] = useState(false);
	const [preferredAddRow, setPreferredAddRow] = useState(0);

	const safeRows = useMemo(() => {
		if (rows.length >= 2) return rows;
		return defaultToolbarRows();
	}, [rows]);

	const unused = useMemo(() => unusedToolbarKeys(safeRows), [safeRows]);
	const selectedId =
		selected && safeRows[selected.row]
			? safeRows[selected.row][selected.index]
			: null;
	const selectedMeta =
		selectedId && isTerminalId(selectedId)
			? TERMINAL_TOOLBAR_KEY_META[selectedId]
			: null;

	const canMoveLeft = Boolean(selected && selected.index > 0);
	const canMoveRight = Boolean(
		selected &&
			selected.index < (safeRows[selected.row]?.length ?? 0) - 1,
	);
	const canMoveRow = Boolean(
		selected && (safeRows[selected.row]?.length ?? 0) > 1,
	);
	const canRemove = canMoveRow;

	function commit(next: string[][], nextSelected?: ToolbarKeyPosition | null) {
		onChange(next);
		if (nextSelected !== undefined) {
			setSelected(nextSelected);
			if (nextSelected) setPreferredAddRow(nextSelected.row);
		} else if (selected) {
			// Clamp selection if the layout shifted under us.
			const row = next[selected.row] ?? [];
			if (row.length === 0) {
				setSelected(null);
				setReplaceOpen(false);
				return;
			}
			const index = Math.min(selected.index, row.length - 1);
			const idAt = row[index];
			const stillThere =
				selectedId && row.includes(selectedId)
					? {
							row: selected.row,
							index: row.indexOf(selectedId),
						}
					: { row: selected.row, index };
			setSelected(stillThere);
			if (idAt !== selectedId) setReplaceOpen(false);
		}
	}

	function selectKey(pos: ToolbarKeyPosition) {
		const same =
			selected?.row === pos.row && selected?.index === pos.index;
		if (same) {
			setSelected(null);
			setReplaceOpen(false);
			return;
		}
		setSelected(pos);
		setPreferredAddRow(pos.row);
		setReplaceOpen(false);
	}

	function handleAdd(id: TerminalToolbarKeyId, row = preferredAddRow) {
		const next = addToolbarKey(safeRows, id, row);
		if (isSameLayout(next, safeRows)) return;
		const pos = {
			row,
			index: next[row].indexOf(id),
		};
		commit(next, pos.index >= 0 ? pos : null);
	}

	function handleReplace(id: TerminalToolbarKeyId) {
		if (!selected) return;
		const next = replaceToolbarKey(safeRows, selected, id);
		const found = next
			.map((row, rowIndex) => ({ row: rowIndex, index: row.indexOf(id) }))
			.find((pos) => pos.index >= 0);
		commit(next, found ?? null);
		setReplaceOpen(false);
	}

	return (
		<div className="accessory-toolbar-editor">
			<div
				className="accessory-toolbar-preview"
				aria-label="Accessory control preview"
			>
				<div className="accessory-toolbar-preview-label">
					<span>Demo toolbar</span>
					<span className="accessory-toolbar-preview-hint">
						Tap a key to edit
					</span>
				</div>
				{safeRows.map((row, rowIndex) => (
					<div className="accessory-toolbar-row" key={`preview-row-${rowIndex}`}>
						<span className="accessory-toolbar-row-tag" aria-hidden="true">
							{rowIndex + 1}
						</span>
						<div
							className="accessory-toolbar-keys"
							role="toolbar"
							aria-label={`Row ${rowIndex + 1}`}
						>
							{row.map((id, keyIndex) => {
								const isSelected =
									selected?.row === rowIndex &&
									selected?.index === keyIndex;
								const label = isTerminalId(id)
									? TERMINAL_TOOLBAR_KEY_META[id].label
									: id;
								return (
									<button
										type="button"
										key={`${id}-${keyIndex}`}
										className={`accessory-toolbar-key${isSelected ? " is-selected" : ""}`}
										aria-pressed={isSelected}
										aria-label={`${label}, row ${rowIndex + 1}`}
										onClick={() =>
											selectKey({ row: rowIndex, index: keyIndex })
										}
									>
										<KeyFace id={id} />
									</button>
								);
							})}
							{unused.length > 0 && (
								<button
									type="button"
									className="accessory-toolbar-add-slot"
									aria-label={`Add control to row ${rowIndex + 1}`}
									title={`Add to row ${rowIndex + 1}`}
									onClick={() => {
										setPreferredAddRow(rowIndex);
										setSelected(null);
										setReplaceOpen(false);
										// Focus palette mentally: scroll not needed; user taps chip next
										const first = unused[0];
										if (unused.length === 1 && first) {
											handleAdd(first, rowIndex);
										}
									}}
								>
									+
								</button>
							)}
						</div>
					</div>
				))}
			</div>

			{selected && selectedId && (
				<div className="accessory-toolbar-inspector">
					<div className="accessory-toolbar-inspector-header">
						<strong>
							{selectedMeta?.label ?? selectedId}
							{selectedMeta?.icon ? (
								<>
									{" "}
									<span
										className={selectedMeta.icon}
										aria-hidden="true"
									/>
								</>
							) : null}
						</strong>
						<span>
							Row {selected.row + 1} · position {selected.index + 1}
						</span>
					</div>
					{selectedMeta?.description && (
						<p className="accessory-toolbar-empty">{selectedMeta.description}</p>
					)}
					<div className="accessory-toolbar-actions">
						<button
							type="button"
							disabled={!canMoveLeft}
							onClick={() => {
								if (!selected) return;
								const next = moveKeyLeft(safeRows, selected);
								commit(next, {
									row: selected.row,
									index: Math.max(0, selected.index - 1),
								});
							}}
						>
							Move left
						</button>
						<button
							type="button"
							disabled={!canMoveRight}
							onClick={() => {
								if (!selected) return;
								const next = moveKeyRight(safeRows, selected);
								commit(next, {
									row: selected.row,
									index: selected.index + 1,
								});
							}}
						>
							Move right
						</button>
						<button
							type="button"
							disabled={!canMoveRow}
							onClick={() => {
								if (!selected) return;
								const next = moveKeyToOtherRow(safeRows, selected);
								const other = selected.row === 0 ? 1 : 0;
								const index = next[other].indexOf(selectedId);
								commit(
									next,
									index >= 0 ? { row: other, index } : null,
								);
							}}
						>
							{selected.row === 0 ? "Move to row 2" : "Move to row 1"}
						</button>
						<button
							type="button"
							className={replaceOpen ? "is-active" : ""}
							onClick={() => setReplaceOpen((open) => !open)}
						>
							Replace…
						</button>
						<button
							type="button"
							className="is-danger"
							disabled={!canRemove}
							onClick={() => {
								if (!selected) return;
								const next = removeToolbarKey(safeRows, selected);
								commit(next, null);
								setReplaceOpen(false);
							}}
						>
							Remove
						</button>
					</div>
					{replaceOpen && (
						<div className="accessory-toolbar-replace-grid" role="listbox" aria-label="Replace with">
							{TERMINAL_TOOLBAR_KEY_IDS.map((id) => {
								const meta = TERMINAL_TOOLBAR_KEY_META[id];
								const isCurrent = id === selectedId;
								const inUse = safeRows.flat().includes(id);
								return (
									<button
										type="button"
										role="option"
										aria-selected={isCurrent}
										key={id}
										className={`accessory-toolbar-replace-option${isCurrent ? " is-current" : ""}${inUse && !isCurrent ? " is-in-use" : ""}`}
										title={
											inUse && !isCurrent
												? `${meta.label} (swap)`
												: meta.description ?? meta.label
										}
										onClick={() => handleReplace(id)}
									>
										{meta.icon ? (
											<span className={meta.icon} aria-hidden="true" />
										) : null}
										<span>{meta.shortLabel ?? meta.label}</span>
									</button>
								);
							})}
						</div>
					)}
				</div>
			)}

			<div className="accessory-toolbar-palette">
				<div className="accessory-toolbar-palette-heading">
					<span>Available controls</span>
					<small>
						{unused.length === 0
							? "All in use"
							: `Tap to add to row ${preferredAddRow + 1}`}
					</small>
				</div>
				{unused.length === 0 ? (
					<p className="accessory-toolbar-empty">
						Every control is already on the toolbar. Remove or replace one to free a slot.
					</p>
				) : (
					<div className="accessory-toolbar-palette-grid">
						{unused.map((id) => {
							const meta = TERMINAL_TOOLBAR_KEY_META[id];
							return (
								<button
									type="button"
									key={id}
									className="accessory-toolbar-chip"
									title={meta.description ?? meta.label}
									onClick={() => handleAdd(id)}
								>
									{meta.icon ? (
										<span className={meta.icon} aria-hidden="true" />
									) : null}
									<span>{meta.label}</span>
								</button>
							);
						})}
					</div>
				)}
			</div>

			<button
				type="button"
				className="accessory-toolbar-reset"
				disabled={isSameLayout(safeRows, defaultToolbarRows())}
				onClick={() => {
					commit(defaultToolbarRows(), null);
					setReplaceOpen(false);
				}}
			>
				Restore default controls
			</button>
		</div>
	);
}
