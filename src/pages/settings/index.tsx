import { ONBOARDING_KEY } from "App";
import AppSelect from "components/AppSelect";
import Page from "components/Page";
import {
	DEFAULT_EDITOR_SETTINGS,
	DEFAULT_SERVER_SETTINGS,
	DEFAULT_TERMINAL_SETTINGS,
	loadSettings,
	MONOSPACE_FONT_FAMILY_OPTIONS,
	type ServerProtocol,
	saveSettings,
	type TerminalCursorStyle,
} from "lib/settings";
import * as store from "lib/store";
import toast from "lib/toast";
import React, { useEffect, useState } from "react";
import themes from "themes";
import "./style.scss";

// --- Components ---

function NumberInput({
	value,
	onChange,
	min,
	max,
}: {
	value: number;
	onChange: (v: number) => void;
	min: number;
	max: number;
}) {
	return (
		<div className="flex items-center bg-(--surface-soft) border border-(--card-border) rounded-md overflow-hidden">
			<button
				type="button"
				className="px-2 py-1.5 text-(--secondary-text) hover:text-(--primary-text) hover:bg-(--surface-strong) transition-colors"
				onClick={() => onChange(Math.max(min, value - 1))}
			>
				<span className="icon-minus text-[14px]" aria-hidden="true" />
			</button>
			<input
				type="number"
				value={value}
				onChange={(e) => onChange(Number(e.target.value))}
				className="w-10 text-center bg-transparent text-sm text-(--primary-text) focus:outline-none hide-number-spinners"
			/>
			<button
				type="button"
				className="px-2 py-1.5 text-(--secondary-text) hover:text-(--primary-text) hover:bg-(--surface-strong) transition-colors"
				onClick={() => onChange(Math.min(max, value + 1))}
			>
				<span className="icon-plus text-[14px]" aria-hidden="true" />
			</button>
		</div>
	);
}

function Switch({
	checked,
	onChange,
}: {
	checked: boolean;
	onChange: (v: boolean) => void;
}) {
	return (
		<button
			type="button"
			className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${checked ? "bg-(--accent)" : "bg-(--surface-strong)"}`}
			onClick={() => onChange(!checked)}
		>
			<span
				className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-(--button-text) shadow ring-0 transition duration-200 ease-in-out ${checked ? "translate-x-2" : "-translate-x-2"}`}
			/>
		</button>
	);
}

function TextInput({
	value,
	onChange,
	placeholder,
}: {
	value: string;
	onChange: (v: string) => void;
	placeholder?: string;
}) {
	return (
		<input
			type="text"
			value={value}
			onChange={(e) => onChange(e.target.value)}
			placeholder={placeholder}
			className="w-full bg-(--surface-soft) text-sm text-(--primary-text) rounded-md px-3 py-2 border border-(--card-border) focus:outline-none focus:border-(--accent)"
			autoCapitalize="none"
			autoCorrect="off"
			spellCheck={false}
		/>
	);
}

function SettingsGroup({
	title,
	children,
	searchQuery,
}: {
	title: string;
	children: React.ReactNode;
	searchQuery?: string;
}) {
	type SearchableSettingsItemProps = {
		title?: string;
		description?: string;
	};

	// If searching, only show group if it has visible children
	const childrenArray = React.Children.toArray(children);
	const hasVisibleChildren = childrenArray.some((child) => {
		if (React.isValidElement<SearchableSettingsItemProps>(child)) {
			const props = child.props;
			if (!props.title) return true;
			const q = (searchQuery || "").toLowerCase();
			return (
				props.title.toLowerCase().includes(q) ||
				props.description?.toLowerCase().includes(q)
			);
		}
		return true;
	});

	if (searchQuery && !hasVisibleChildren) {
		return null;
	}

	return (
		<div className="mb-6">
			<h3 className="text-(--primary-text) text-[14px] font-semibold mb-3 px-1">
				{title}
			</h3>
			<div className="border border-(--card-border) rounded-xl overflow-hidden bg-transparent">
				{React.Children.map(children, (child) => {
					if (
						React.isValidElement<SearchableSettingsItemProps>(child) &&
						searchQuery
					) {
						const props = child.props;
						if (!props.title) return child;
						const q = searchQuery.toLowerCase();
						const match =
							props.title.toLowerCase().includes(q) ||
							props.description?.toLowerCase().includes(q);
						if (!match) return null;
					}
					return child;
				})}
			</div>
		</div>
	);
}

function SettingsItem({
	title,
	description,
	control,
	vertical,
}: {
	title: string;
	description?: string;
	control?: React.ReactNode;
	vertical?: boolean;
	searchQuery?: string;
}) {
	return (
		<div
			className={`p-4 border-b border-(--card-border) last:border-0 ${vertical ? "flex flex-col gap-3" : "flex items-center justify-between gap-4"}`}
		>
			<div className="flex-1 min-w-0">
				<div className="text-[14px] font-medium text-(--primary-text) mb-1">
					{title}
				</div>
				{description && (
					<div className="text-[13px] text-(--secondary-text) leading-relaxed pr-4">
						{description}
					</div>
				)}
			</div>
			{control && <div className="shrink-0">{control}</div>}
		</div>
	);
}

type SettingSearchEntry = {
	title: string;
	description?: string;
};

function matchesSettingsSearch(
	query: string,
	entries: SettingSearchEntry[],
): boolean {
	const q = query.trim().toLowerCase();
	if (!q) return true;
	return entries.some(
		(entry) =>
			entry.title.toLowerCase().includes(q) ||
			entry.description?.toLowerCase().includes(q),
	);
}

export default function SettingsPage() {
	const [activeTab, setActiveTab] = useState("look-and-feel");
	const [searchQuery, setSearchQuery] = useState("");

	// App State
	const [currentTheme, setCurrentTheme] = useState(() => {
		const name = themes.current?.name.toLowerCase();
		if (name === "oled") return "black";
		return name ?? "dark";
	});
	const [serverDomain, setServerDomain] = useState(
		DEFAULT_SERVER_SETTINGS.domain,
	);
	const [serverProtocol, setServerProtocol] = useState<ServerProtocol>(
		DEFAULT_SERVER_SETTINGS.protocol,
	);

	const [editorFontSize, setEditorFontSize] = useState(
		DEFAULT_EDITOR_SETTINGS.fontSize,
	);
	const [editorFontFamily, setEditorFontFamily] = useState(
		DEFAULT_EDITOR_SETTINGS.fontFamily,
	);
	const [editorWordWrap, setEditorWordWrap] = useState(
		DEFAULT_EDITOR_SETTINGS.wordWrap,
	);
	const [editorLineNumbers, setEditorLineNumbers] = useState(
		DEFAULT_EDITOR_SETTINGS.lineNumbers,
	);
	const [editorTabSize, setEditorTabSize] = useState(
		DEFAULT_EDITOR_SETTINGS.tabSize,
	);

	const [terminalFontSize, setTerminalFontSize] = useState(
		DEFAULT_TERMINAL_SETTINGS.fontSize,
	);
	const [terminalFontFamily, setTerminalFontFamily] = useState(
		DEFAULT_TERMINAL_SETTINGS.fontFamily,
	);
	const [terminalCursorStyle, setTerminalCursorStyle] =
		useState<TerminalCursorStyle>(DEFAULT_TERMINAL_SETTINGS.cursorStyle);
	const [terminalCursorInactiveStyle, setTerminalCursorInactiveStyle] =
		useState(DEFAULT_TERMINAL_SETTINGS.cursorInactiveStyle);
	const [terminalCursorBlink, setTerminalCursorBlink] = useState(
		DEFAULT_TERMINAL_SETTINGS.cursorBlink,
	);
	const [terminalScrollback, setTerminalScrollback] = useState(
		DEFAULT_TERMINAL_SETTINGS.scrollback,
	);
	const [terminalLetterSpacing, setTerminalLetterSpacing] = useState(
		DEFAULT_TERMINAL_SETTINGS.letterSpacing,
	);

	const [hapticFeedback, setHapticFeedback] = useState(true);
	const [isSavingServer, setIsSavingServer] = useState(false);
	const [testOnboarding, setTestOnboarding] = useState(false);

	useEffect(() => {
		if (!process.env.DEV_MODE) {
			return;
		}

		store.get<boolean>(ONBOARDING_KEY).then((val) => {
			// "Test onboarding" is on when onboarding has NOT been completed,
			// so the flow will show again on the next app launch.
			setTestOnboarding(!val);
		});
	}, []);

	useEffect(() => {
		loadSettings().then((s) => {
			setCurrentTheme(s.theme);
			setServerDomain(s.server.domain);
			setServerProtocol(s.server.protocol);
			setEditorFontSize(s.editor.fontSize);
			setEditorFontFamily(s.editor.fontFamily);
			setEditorWordWrap(s.editor.wordWrap);
			setEditorLineNumbers(s.editor.lineNumbers);
			setEditorTabSize(s.editor.tabSize);
			setTerminalFontSize(s.terminal.fontSize);
			setTerminalFontFamily(s.terminal.fontFamily);
			setTerminalCursorStyle(s.terminal.cursorStyle);
			setTerminalCursorInactiveStyle(s.terminal.cursorInactiveStyle);
			setTerminalCursorBlink(s.terminal.cursorBlink);
			setTerminalScrollback(s.terminal.scrollback);
			setTerminalLetterSpacing(s.terminal.letterSpacing);
			setHapticFeedback(s.hapticFeedback);
		});
	}, []);

	// Settings save instantly on change, so a success toast per change would be
	// noisy. But a failed write must not pass silently — surface it so the user
	// knows the change didn't stick. Returns whether the save succeeded.
	async function persistSettings(
		settings: Parameters<typeof saveSettings>[0],
	): Promise<boolean> {
		try {
			await saveSettings(settings);
			return true;
		} catch (err) {
			console.error("Failed to save settings:", err);
			toast("Couldn't save setting", 2600);
			return false;
		}
	}

	async function handleThemeChange(name: string) {
		const themeName = name.toLowerCase();
		setCurrentTheme(themeName);
		if (await persistSettings({ theme: themeName })) {
			await themes.applyTheme(themeName);
		}
	}

	async function handleEditorFontSizeChange(value: number) {
		setEditorFontSize(value);
		await persistSettings({ editor: { fontSize: value } });
	}

	async function handleEditorFontFamilyChange(value: string) {
		setEditorFontFamily(value);
		await persistSettings({ editor: { fontFamily: value } });
	}

	async function handleEditorWordWrapChange(value: boolean) {
		setEditorWordWrap(value);
		await persistSettings({ editor: { wordWrap: value } });
	}

	async function handleEditorLineNumbersChange(value: boolean) {
		setEditorLineNumbers(value);
		await persistSettings({ editor: { lineNumbers: value } });
	}

	async function handleEditorTabSizeChange(value: number) {
		setEditorTabSize(value);
		await persistSettings({ editor: { tabSize: value } });
	}

	async function handleTerminalFontSizeChange(value: number) {
		setTerminalFontSize(value);
		await persistSettings({ terminal: { fontSize: value } });
	}

	async function handleTerminalFontFamilyChange(value: string) {
		setTerminalFontFamily(value);
		await persistSettings({ terminal: { fontFamily: value } });
	}

	async function handleTerminalCursorStyleChange(value: string) {
		const cursorStyle = value as TerminalCursorStyle;
		setTerminalCursorStyle(cursorStyle);
		await persistSettings({ terminal: { cursorStyle } });
	}

	async function handleTerminalCursorInactiveStyleChange(value: string) {
		const cursorInactiveStyle =
			value as typeof DEFAULT_TERMINAL_SETTINGS.cursorInactiveStyle;
		setTerminalCursorInactiveStyle(cursorInactiveStyle);
		await persistSettings({ terminal: { cursorInactiveStyle } });
	}

	async function handleTerminalCursorBlinkChange(value: boolean) {
		setTerminalCursorBlink(value);
		await persistSettings({ terminal: { cursorBlink: value } });
	}

	async function handleTerminalScrollbackChange(value: number) {
		setTerminalScrollback(value);
		await persistSettings({ terminal: { scrollback: value } });
	}

	async function handleTerminalLetterSpacingChange(value: number) {
		setTerminalLetterSpacing(value);
		await persistSettings({ terminal: { letterSpacing: value } });
	}

	function normalizeDomain(domain: string) {
		return domain
			.trim()
			.replace(/^https?:\/\//, "")
			.replace(/\/+$/, "");
	}

	async function handleHapticFeedbackChange(value: boolean) {
		setHapticFeedback(value);
		await persistSettings({ hapticFeedback: value });
	}

	async function handleTestOnboardingChange(value: boolean) {
		setTestOnboarding(value);
		if (value) {
			// Clear the completion flag so onboarding shows again on next launch.
			await store.remove(ONBOARDING_KEY);
		} else {
			await store.set(ONBOARDING_KEY, true);
		}
	}

	async function handleServerSave() {
		setIsSavingServer(true);
		try {
			const domain =
				normalizeDomain(serverDomain) || DEFAULT_SERVER_SETTINGS.domain;
			setServerDomain(domain);
			// Explicit Save action (unlike the auto-saving controls), so confirm
			// success with a toast. persistSettings toasts on failure.
			if (
				await persistSettings({
					server: { protocol: serverProtocol, domain },
				})
			) {
				toast("Server settings saved", 2000);
			}
		} finally {
			setIsSavingServer(false);
		}
	}

	const sidebarCategories = [
		{ id: "look-and-feel", label: "Look & Feel" },
		{ id: "editor", label: "Editor" },
		{ id: "terminal", label: "Terminal" },
		{ id: "network", label: "Network" },
		...(process.env.DEV_MODE ? [{ id: "developer", label: "Developer" }] : []),
	];

	const isSearching = searchQuery.trim().length > 0;
	const showAppearanceSettings = matchesSettingsSearch(searchQuery, [
		{
			title: "Application Theme",
			description: "Controls the app color scheme.",
		},
		{
			title: "Haptic Feedback",
			description: "Vibrates on touch interactions.",
		},
	]);
	const showEditorSettings = matchesSettingsSearch(searchQuery, [
		{ title: "Font Size", description: "Controls the font size in pixels." },
		{
			title: "Font Family",
			description: "Controls the typeface used by the editor.",
		},
		{
			title: "Word Wrap",
			description: "Controls how lines should wrap in the editor.",
		},
		{
			title: "Line Numbers",
			description: "Controls the display of line numbers.",
		},
		{
			title: "Tab Size",
			description: "Controls how many columns a tab occupies.",
		},
	]);
	const showTerminalSettings = matchesSettingsSearch(searchQuery, [
		{
			title: "Font Size",
			description: "Controls the font size in pixels for the terminal.",
		},
		{
			title: "Font Family",
			description: "Controls the typeface used by the terminal.",
		},
		{
			title: "Letter Spacing",
			description: "Adjusts terminal character spacing in pixels.",
		},
		{
			title: "Cursor Style",
			description: "Controls the active terminal cursor shape.",
		},
		{
			title: "Inactive Cursor Style",
			description: "Controls how the terminal cursor appears when unfocused.",
		},
		{
			title: "Cursor Blink",
			description: "Controls whether the terminal cursor blinks.",
		},
		{
			title: "Scrollback",
			description: "Controls how many terminal rows are retained.",
		},
	]);
	const showNetworkSettings = matchesSettingsSearch(searchQuery, [
		{ title: "Protocol", description: "http:// or https://" },
		{
			title: "Base domain",
			description: "The domain of the Shellular server.",
		},
	]);
	const showDeveloperSettings = matchesSettingsSearch(searchQuery, [
		{
			title: "Test onboarding",
			description:
				"Replays the onboarding flow the next time you open the app.",
		},
	]);
	const monospaceFontOptions = MONOSPACE_FONT_FAMILY_OPTIONS.map((font) => ({
		value: font.value,
		label: font.label,
	}));

	return (
		<Page title="Settings" className="settings-page" noBottomSafeArea>
			<div className="flex flex-col md:flex-row flex-1 h-full w-full bg-(--primary) text-(--primary-text) font-sans overflow-hidden">
				{/* Sidebar */}
				<div className="w-full md:w-64 border-r border-(--card-border) bg-(--primary) flex flex-col shrink-0">
					<div className="p-4 border-b border-(--card-border)">
						<div className="relative">
							<span
								className="icon-search absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-(--secondary-text)"
								aria-hidden="true"
							/>
							<input
								type="text"
								placeholder="Search settings..."
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								className="w-full bg-(--surface-soft) text-sm text-(--primary-text) rounded-md pl-9 pr-3 py-2 border border-transparent focus:outline-none focus:border-(--card-border) transition-colors placeholder-(--secondary-text)"
							/>
						</div>
					</div>

					{/* Categories */}
					<div className="flex flex-row md:flex-col overflow-x-auto md:overflow-y-auto p-3 gap-1 custom-scroll">
						{sidebarCategories.map((category) => (
							<button
								key={category.id}
								type="button"
								onClick={() => {
									setActiveTab(category.id);
									setSearchQuery("");
								}}
								className={`flex items-center justify-between px-4 md:px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap text-left ${
									!isSearching && activeTab === category.id
										? "bg-(--surface-soft) text-(--primary-text)"
										: "text-(--secondary-text) hover:text-(--primary-text)"
								}`}
							>
								<span>{category.label}</span>
							</button>
						))}
					</div>
				</div>

				{/* Settings Area */}
				<div className="flex-1 overflow-y-auto custom-scroll bg-(--primary) p-4 md:p-8">
					<div className="w-full max-w-3xl mx-auto">
						{((isSearching && showAppearanceSettings) ||
							(!isSearching && activeTab === "look-and-feel")) && (
							<div className="animate-in fade-in duration-300">
								{isSearching && (
									<h2 className="text-[18px] font-semibold text-(--primary-text) mb-6 mt-4">
										Look & Feel
									</h2>
								)}
								<SettingsGroup title="Theme" searchQuery={searchQuery}>
									<SettingsItem
										title="Application Theme"
										description="Controls the app color scheme."
										control={
											<AppSelect
												value={currentTheme}
												onChange={handleThemeChange}
												options={themes.list.map((t) => ({
													value: t.toLowerCase(),
													label: t,
												}))}
											/>
										}
									/>
								</SettingsGroup>
								<SettingsGroup title="Interaction" searchQuery={searchQuery}>
									<SettingsItem
										title="Haptic Feedback"
										description="Vibrates on touch interactions."
										control={
											<Switch
												checked={hapticFeedback}
												onChange={handleHapticFeedbackChange}
											/>
										}
									/>
								</SettingsGroup>
							</div>
						)}

						{((isSearching && showEditorSettings) ||
							(!isSearching && activeTab === "editor")) && (
							<div className="animate-in fade-in duration-300">
								{isSearching && (
									<h2 className="text-[18px] font-semibold text-(--primary-text) mb-6 mt-8">
										Editor
									</h2>
								)}
								<SettingsGroup title="General" searchQuery={searchQuery}>
									<SettingsItem
										title="Font Size"
										description="Controls the font size in pixels."
										control={
											<NumberInput
												value={editorFontSize}
												onChange={handleEditorFontSizeChange}
												min={8}
												max={72}
											/>
										}
									/>
									<SettingsItem
										title="Font Family"
										description="Controls the typeface used by the editor."
										control={
											<AppSelect
												value={editorFontFamily}
												onChange={handleEditorFontFamilyChange}
												options={monospaceFontOptions}
											/>
										}
									/>
									<SettingsItem
										title="Word Wrap"
										description="Controls how lines should wrap in the editor."
										control={
											<Switch
												checked={editorWordWrap}
												onChange={handleEditorWordWrapChange}
											/>
										}
									/>
									<SettingsItem
										title="Line Numbers"
										description="Controls the display of line numbers."
										control={
											<Switch
												checked={editorLineNumbers}
												onChange={handleEditorLineNumbersChange}
											/>
										}
									/>
									<SettingsItem
										title="Tab Size"
										description="Controls how many columns a tab occupies."
										control={
											<NumberInput
												value={editorTabSize}
												onChange={handleEditorTabSizeChange}
												min={1}
												max={8}
											/>
										}
									/>
								</SettingsGroup>
							</div>
						)}

						{((isSearching && showTerminalSettings) ||
							(!isSearching && activeTab === "terminal")) && (
							<div className="animate-in fade-in duration-300">
								{isSearching && (
									<h2 className="text-[18px] font-semibold text-(--primary-text) mb-6 mt-8">
										Terminal
									</h2>
								)}
								<SettingsGroup title="Look & Feel" searchQuery={searchQuery}>
									<SettingsItem
										title="Font Size"
										description="Controls the font size in pixels for the terminal."
										control={
											<NumberInput
												value={terminalFontSize}
												onChange={handleTerminalFontSizeChange}
												min={8}
												max={72}
											/>
										}
									/>
									<SettingsItem
										title="Font Family"
										description="Controls the typeface used by the terminal."
										control={
											<AppSelect
												value={terminalFontFamily}
												onChange={handleTerminalFontFamilyChange}
												options={monospaceFontOptions}
											/>
										}
									/>
									<SettingsItem
										title="Letter Spacing"
										description="Adjusts terminal character spacing in pixels."
										control={
											<NumberInput
												value={terminalLetterSpacing}
												onChange={handleTerminalLetterSpacingChange}
												min={-2}
												max={8}
											/>
										}
									/>
									<SettingsItem
										title="Cursor Style"
										description="Controls the active terminal cursor shape."
										control={
											<AppSelect
												value={terminalCursorStyle}
												onChange={handleTerminalCursorStyleChange}
												options={[
													{ value: "block", label: "Block" },
													{ value: "underline", label: "Underline" },
													{ value: "bar", label: "Bar" },
												]}
											/>
										}
									/>
									<SettingsItem
										title="Inactive Cursor Style"
										description="Controls how the terminal cursor appears when unfocused."
										control={
											<AppSelect
												value={terminalCursorInactiveStyle}
												onChange={handleTerminalCursorInactiveStyleChange}
												options={[
													{ value: "outline", label: "Outline" },
													{ value: "block", label: "Block" },
													{ value: "underline", label: "Underline" },
													{ value: "bar", label: "Bar" },
													{ value: "none", label: "Hidden" },
												]}
											/>
										}
									/>
									<SettingsItem
										title="Cursor Blink"
										description="Controls whether the terminal cursor blinks."
										control={
											<Switch
												checked={terminalCursorBlink}
												onChange={handleTerminalCursorBlinkChange}
											/>
										}
									/>
									<SettingsItem
										title="Scrollback"
										description="Controls how many terminal rows are retained."
										control={
											<NumberInput
												value={terminalScrollback}
												onChange={handleTerminalScrollbackChange}
												min={100}
												max={10000}
											/>
										}
									/>
								</SettingsGroup>
							</div>
						)}

						{((isSearching && showNetworkSettings) ||
							(!isSearching && activeTab === "network")) && (
							<div className="animate-in fade-in duration-300">
								{isSearching && (
									<h2 className="text-[18px] font-semibold text-(--primary-text) mb-6 mt-8">
										Network
									</h2>
								)}
								<SettingsGroup title="Server" searchQuery={searchQuery}>
									<SettingsItem
										title="Protocol"
										description="http:// or https://"
										control={
											<AppSelect
												value={serverProtocol}
												onChange={(v) => setServerProtocol(v as ServerProtocol)}
												options={[
													{ value: "http", label: "HTTP" },
													{ value: "https", label: "HTTPS" },
												]}
											/>
										}
									/>
									<SettingsItem
										title="Base domain"
										description="The domain of the Shellular server."
										vertical
										control={
											<div className="flex flex-col sm:flex-row gap-3 w-full">
												<TextInput
													value={serverDomain}
													onChange={setServerDomain}
													placeholder="server.shellular.dev"
												/>
												<button
													type="button"
													className="px-4 py-2 bg-(--surface-strong) text-(--primary-text) border border-(--card-border) text-sm font-medium rounded-md hover:bg-(--accent) hover:text-(--button-text) hover:border-transparent transition-colors disabled:opacity-50 shrink-0"
													onClick={handleServerSave}
													disabled={isSavingServer}
												>
													{isSavingServer ? "Saving..." : "Save"}
												</button>
											</div>
										}
									/>
								</SettingsGroup>
							</div>
						)}

						{((isSearching && showDeveloperSettings) ||
							(!isSearching && activeTab === "developer")) &&
							process.env.DEV_MODE && (
								<div className="animate-in fade-in duration-300">
									{isSearching && (
										<h2 className="text-[18px] font-semibold text-(--primary-text) mb-6 mt-8">
											Developer
										</h2>
									)}
									<SettingsGroup title="Debug" searchQuery={searchQuery}>
										<SettingsItem
											title="Test onboarding"
											description="Replays the onboarding flow the next time you open the app. Enable, then close and reopen the app."
											control={
												<Switch
													checked={testOnboarding}
													onChange={handleTestOnboardingChange}
												/>
											}
										/>
									</SettingsGroup>
								</div>
							)}
					</div>
				</div>
			</div>
		</Page>
	);
}
