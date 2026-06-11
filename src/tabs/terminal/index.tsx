import "./style.scss";
import "@xterm/xterm/css/xterm.css";
import { pushPage } from "App";
import dialog from "bridge/dialog";
import AppMenu from "components/AppMenu";
import EmptyState from "components/EmptyState";
import TabPageHeader from "components/TabPageHeader";
import actionStack from "lib/actionStack";
import { textifyEmoji } from "lib/emoji";
import { useCallback, useEffect, useState } from "react";
import { useShellular } from "state";
import {
	closeTerminal,
	type ProcessInfo,
	type RemoteTerminalInfo,
} from "state/terminals";
import TerminalTextview from "../../pages/terminal-textview";
import TerminalContainer from "./TerminalContainer";
import TerminalToolbar from "./TerminalToolbar";

export default function TerminalTab() {
	const {
		activeTerminals,
		activeTerminalId,
		terminalNames,
		terminalProcesses,
		connectionStatus,
		createTerminal,
		setActiveTerminalId,
		renameTerminal,
		getXterm,
		terminalsRestoring,
	} = useShellular();

	const [showPasteView, setShowPasteView] = useState(false);

	const handlePasteViewOpen = useCallback(() => {
		setShowPasteView(true);
		actionStack.push({
			id: "terminal-pasteview",
			action: () => setShowPasteView(false),
		});
	}, []);

	const handlePasteViewClose = useCallback(() => {
		actionStack.remove("terminal-pasteview");
		setShowPasteView(false);
		if (activeTerminalId) {
			getXterm(activeTerminalId)?.focus();
		}
	}, [activeTerminalId, getXterm]);

	const handleTextViewOpen = useCallback(() => {
		if (!activeTerminalId) return;
		pushPage(
			"terminal-text-selection",
			<TerminalTextview terminalId={activeTerminalId} />,
		);
	}, [activeTerminalId]);

	const handleRenameOpen = useCallback(async () => {
		if (!activeTerminalId) return;
		const currentName = terminalNames[activeTerminalId] || "";
		const result = await dialog.textInput(
			"Enter new terminal name",
			currentName,
			"Rename Terminal",
		);
		if (result !== null) {
			renameTerminal(activeTerminalId, result);
		}
	}, [activeTerminalId, renameTerminal, terminalNames]);

	const handleCreate = useCallback(async () => {
		if (activeTerminals.length === 0) {
			setTimeout(async () => {
				await createTerminal();
			}, 200);
		} else {
			await createTerminal();
		}
	}, [activeTerminals, createTerminal]);

	const getNextActiveTerminal = useCallback(() => {
		return activeTerminals[activeTerminals.length - 1]?.terminalId;
	}, [activeTerminals]);

	useEffect(() => {
		if (!activeTerminalId && activeTerminals.length) {
			setActiveTerminalId(getNextActiveTerminal());
		}
	}, [
		activeTerminals,
		setActiveTerminalId,
		activeTerminalId,
		getNextActiveTerminal,
	]);

	if (connectionStatus !== "connected") {
		return (
			<div className="terminal-tab terminal-tab--empty">
				<TabPageHeader title="Terminal" />
				<EmptyState
					message="Connect to a device to use terminals"
					mascot="sleep"
				/>
			</div>
		);
	}

	if (activeTerminals.length === 0) {
		return (
			<div className="terminal-tab terminal-tab--empty">
				<TabPageHeader title="Terminal" />
				{terminalsRestoring ? (
					<EmptyState message="Restoring terminals…" mascot="loading" />
				) : (
					<EmptyState
						message="No active terminals"
						mascot="idle"
						action={
							<button type="button" onClick={handleCreate}>
								<span className="icon-plus" aria-hidden="true" />
								New Terminal
							</button>
						}
					/>
				)}
			</div>
		);
	}

	const activeIndex = activeTerminals.findIndex(
		(t) => t.terminalId === activeTerminalId,
	);
	const activeTerminal = activeIndex >= 0 ? activeTerminals[activeIndex] : null;

	return (
		<div className="terminal-tab">
			<TabPageHeader>
				{/* <TerminalTabBar
					terminals={activeTerminals}
					activeId={activeTerminalId}
					names={terminalNames}
					processes={terminalProcesses}
					onCreate={handleCreate}
					terminalItems={}
				/> */}

				<div className="terminal-tab-bar">
					<AppMenu
						buttonClassName="terminal-title-btn"
						ariaLabel="Switch terminal"
						placement="bottom start"
						items={[
							...activeTerminals.map((t, i) => ({
								icon:
									t.terminalId === activeTerminalId
										? "icon-check"
										: "icon-terminal",
								label: getDisplayName(t, i, terminalNames, terminalProcesses),
								key: t.terminalId,
								onClick: () => setActiveTerminalId(t.terminalId),
							})),
							{
								icon: "icon-plus",
								label: "New Terminal",
								onClick: () => {
									handleCreate();
								},
							},
						]}
					>
						<span className="icon-chevron-down" aria-hidden="true" />
						<span className="terminal-title-name">
							{activeTerminal &&
								getDisplayName(
									activeTerminal,
									activeIndex,
									terminalNames,
									terminalProcesses,
								)}
						</span>
					</AppMenu>
					<AppMenu
						buttonClassName="terminal-tab-menu"
						ariaLabel="Terminal menu"
						items={[
							{
								icon: "icon-clipboard",
								label: "Paste",
								onClick: () => {
									if (activeTerminalId) {
										const xterm = getXterm(activeTerminalId);
										if (xterm) xterm.focus();
									}
									setTimeout(() => handlePasteViewOpen(), 300);
								},
							},
							{
								icon: "icon-type",
								label: "Select Text",
								onClick: handleTextViewOpen,
							},
							{
								icon: "icon-edit",
								label: "Rename",
								onClick: handleRenameOpen,
							},
							{
								icon: "icon-x",
								label: "Kill Terminal",
								onClick: () => {
									if (!activeTerminalId) return;
									dialog
										.confirm("Are you sure you want to kill this terminal?")
										.then((confirmed) => {
											if (confirmed) {
												setActiveTerminalId(null);
												closeTerminal(activeTerminalId);
												const terminalId = getNextActiveTerminal();
												if (terminalId) {
													setActiveTerminalId(terminalId);
												}
											}
										});
								},
								danger: true,
							},
						]}
					>
						<span className="icon-more-vertical" aria-hidden="true" />
					</AppMenu>
				</div>
			</TabPageHeader>
			<TerminalContainer
				activeTerminalId={activeTerminalId}
				menuItems={[
					{
						icon: "icon-type",
						label: "Select Text",
						onClick: handleTextViewOpen,
					},
					{
						icon: "icon-clipboard",
						label: "Paste",
						onClick: () => {
							if (activeTerminalId) {
								const xterm = getXterm(activeTerminalId);
								if (xterm) xterm.focus();
							}
							setTimeout(() => handlePasteViewOpen(), 300);
						},
					},
				]}
			/>
			<TerminalToolbar
				activeTerminalId={activeTerminalId}
				showPaste={showPasteView}
				onPasteOpen={handlePasteViewOpen}
				onPasteClose={handlePasteViewClose}
			/>
		</div>
	);
}

function getDisplayName(
	terminal: RemoteTerminalInfo,
	index: number,
	names: Record<string, string>,
	processes: Record<string, ProcessInfo | null>,
): string {
	const customName = names[terminal.terminalId];
	const process = processes[terminal.terminalId];

	let name: string;
	if (customName && process) {
		name = `${customName}: ${process.name}`;
	} else if (customName) {
		name = customName;
	} else if (process) {
		name = process.name;
	} else {
		name = terminal.shell || `Terminal ${index + 1}`;
	}
	return textifyEmoji(name);
}
