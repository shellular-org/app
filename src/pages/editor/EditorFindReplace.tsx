import {
	closeSearchPanel,
	findNext,
	findPrevious,
	getSearchQuery,
	openSearchPanel,
	replaceAll,
	replaceNext,
	SearchQuery,
	setSearchQuery,
} from "@codemirror/search";
import type { EditorView } from "codemirror";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface Props {
	editorView: EditorView | null;
	editorVersion: number;
	visible: boolean;
	onOpen: () => void;
}

function countMatches(view: EditorView, query: SearchQuery) {
	if (!query.search || !query.valid) return { current: 0, total: 0 };

	let total = 0;
	let current = 0;
	const selection = view.state.selection.main;

	const cursor = query.getCursor(view.state);
	for (let next = cursor.next(); !next.done; next = cursor.next()) {
		const match = next.value;
		total += 1;
		if (selection.from === match.from && selection.to === match.to) {
			current = total;
		}
	}

	return { current, total };
}

export default function EditorFindReplace({
	editorView,
	editorVersion,
	visible,
	onOpen,
}: Props) {
	const searchInputRef = useRef<HTMLInputElement>(null);
	const [searchText, setSearchText] = useState("");
	const [replaceText, setReplaceText] = useState("");
	const [replaceOpen, setReplaceOpen] = useState(false);
	const [caseSensitive, setCaseSensitive] = useState(false);
	const [wholeWord, setWholeWord] = useState(false);
	const [regexp, setRegexp] = useState(false);
	const [status, setStatus] = useState({ current: 0, total: 0 });

	const query = useMemo(
		() =>
			new SearchQuery({
				search: searchText,
				replace: replaceText,
				caseSensitive,
				wholeWord,
				regexp,
			}),
		[caseSensitive, regexp, replaceText, searchText, wholeWord],
	);

	const syncSearchQuery = useCallback(
		(nextQuery: SearchQuery, selectFirst = false) => {
			if (!editorView || !visible) return;
			openSearchPanel(editorView);
			editorView.dispatch({ effects: setSearchQuery.of(nextQuery) });
			if (selectFirst && nextQuery.valid && nextQuery.search) {
				findNext(editorView);
			}
			setStatus(countMatches(editorView, nextQuery));
		},
		[editorView, visible],
	);

	useEffect(() => {
		if (!editorView || !visible) return;
		openSearchPanel(editorView);
		const activeQuery = getSearchQuery(editorView.state);
		setSearchText(activeQuery.search);
		setReplaceText(activeQuery.replace);
		setCaseSensitive(activeQuery.caseSensitive);
		setWholeWord(activeQuery.wholeWord);
		setRegexp(activeQuery.regexp);
		setStatus(countMatches(editorView, activeQuery));
		requestAnimationFrame(() => {
			searchInputRef.current?.focus();
			searchInputRef.current?.select();
		});
	}, [editorView, visible]);

	useEffect(() => {
		if (!editorView || visible) return;
		closeSearchPanel(editorView);
	}, [editorView, visible]);

	useEffect(() => {
		if (!editorView || !visible) return;
		syncSearchQuery(query);
	}, [editorView, query, syncSearchQuery, visible]);

	useEffect(() => {
		if (!editorView || !visible) return;
		void editorVersion;
		setStatus(countMatches(editorView, getSearchQuery(editorView.state)));
	}, [editorView, editorVersion, visible]);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (!editorView) return;
			const isFindShortcut =
				(event.metaKey || event.ctrlKey) &&
				!event.altKey &&
				!event.shiftKey &&
				event.key.toLowerCase() === "f";
			if (!isFindShortcut) return;

			event.preventDefault();
			onOpen();
			requestAnimationFrame(() => {
				searchInputRef.current?.focus();
				searchInputRef.current?.select();
			});
		};

		window.addEventListener("keydown", handleKeyDown, { capture: true });
		return () => {
			window.removeEventListener("keydown", handleKeyDown, { capture: true });
		};
	}, [editorView, onOpen]);

	if (!editorView || !visible) return null;

	const runSearchCommand = (command: (view: EditorView) => boolean) => {
		command(editorView);
		editorView.focus();
		setStatus(countMatches(editorView, getSearchQuery(editorView.state)));
	};

	const handleSearchChange = (value: string) => {
		const nextQuery = new SearchQuery({
			search: value,
			replace: replaceText,
			caseSensitive,
			wholeWord,
			regexp,
		});
		setSearchText(value);
		syncSearchQuery(nextQuery, true);
	};

	const handleReplaceChange = (value: string) => {
		setReplaceText(value);
		syncSearchQuery(
			new SearchQuery({
				search: searchText,
				replace: value,
				caseSensitive,
				wholeWord,
				regexp,
			}),
		);
	};

	const toggleOption = (
		option: "caseSensitive" | "wholeWord" | "regexp",
		value: boolean,
	) => {
		const nextOptions = {
			caseSensitive,
			wholeWord,
			regexp,
			[option]: value,
		};

		if (option === "caseSensitive") setCaseSensitive(value);
		if (option === "wholeWord") setWholeWord(value);
		if (option === "regexp") setRegexp(value);

		syncSearchQuery(
			new SearchQuery({
				search: searchText,
				replace: replaceText,
				...nextOptions,
			}),
			true,
		);
	};

	return (
		<div
			className={`editor-find-dock${replaceOpen ? " editor-find-dock--replace-open" : ""}`}
		>
			<div className="editor-find-dock__topbar">
				<button
					type="button"
					className="editor-find-dock__icon-button editor-find-dock__expand"
					onClick={() => setReplaceOpen((open) => !open)}
					aria-label={replaceOpen ? "Hide replace" : "Show replace"}
					title={replaceOpen ? "Hide replace" : "Show replace"}
				>
					<span
						className={replaceOpen ? "icon-chevron-up" : "icon-chevron-down"}
						aria-hidden="true"
					/>
				</button>
				<button
					type="button"
					className="editor-find-dock__option editor-find-dock__option--case"
					data-active={caseSensitive}
					onClick={() => toggleOption("caseSensitive", !caseSensitive)}
					aria-label="Match case"
					title="Match case"
				>
					Aa
				</button>
				<button
					type="button"
					className="editor-find-dock__option"
					data-active={wholeWord}
					onClick={() => toggleOption("wholeWord", !wholeWord)}
					aria-label="Match whole word"
					title="Match whole word"
				>
					<span className="icon-type" aria-hidden="true" />
				</button>
				<button
					type="button"
					className="editor-find-dock__option"
					data-active={regexp}
					onClick={() => toggleOption("regexp", !regexp)}
					aria-label="Use regular expression"
					title="Use regular expression"
				>
					.*
				</button>
				<div className="editor-find-dock__topbar-spacer" />
				<button
					type="button"
					className="editor-find-dock__icon-button"
					onClick={() => runSearchCommand(findPrevious)}
					disabled={!query.valid || !searchText}
					aria-label="Previous match"
					title="Previous match"
				>
					<span className="icon-arrow-up" aria-hidden="true" />
				</button>
				<button
					type="button"
					className="editor-find-dock__icon-button"
					onClick={() => runSearchCommand(findNext)}
					disabled={!query.valid || !searchText}
					aria-label="Next match"
					title="Next match"
				>
					<span className="icon-arrow-down" aria-hidden="true" />
				</button>
			</div>
			<div className="editor-find-dock__row editor-find-dock__row--find">
				<label className="editor-find-dock__field">
					<span className="icon-search" aria-hidden="true" />
					<input
						ref={searchInputRef}
						type="search"
						value={searchText}
						onChange={(event) => handleSearchChange(event.currentTarget.value)}
						placeholder="Find"
						spellCheck={false}
						aria-label="Find"
					/>
				</label>
				<div className="editor-find-dock__count" aria-live="polite">
					{(!query.search || (query.search && query.valid)) &&
						`${status.current || 0}/${status.total}`}
					{query.search && !query.valid && (
						<span className="text-red-400">Invalid</span>
					)}
				</div>
			</div>
			<div
				className="editor-find-dock__replace-panel"
				aria-hidden={!replaceOpen}
			>
				<div className="editor-find-dock__row editor-find-dock__row--replace">
					<label className="editor-find-dock__field">
						<span className="icon-corner-down-right" aria-hidden="true" />
						<input
							type="text"
							value={replaceText}
							onChange={(event) =>
								handleReplaceChange(event.currentTarget.value)
							}
							placeholder="Replace"
							spellCheck={false}
							aria-label="Replace"
							tabIndex={replaceOpen ? 0 : -1}
						/>
					</label>
					<button
						type="button"
						className="editor-find-dock__icon-button"
						onClick={() => runSearchCommand(replaceNext)}
						disabled={!query.valid || !searchText}
						aria-label="Replace next"
						title="Replace next"
						tabIndex={replaceOpen ? 0 : -1}
					>
						<span className="icon-corner-down-right" aria-hidden="true" />
					</button>
					<button
						type="button"
						className="editor-find-dock__icon-button"
						onClick={() => runSearchCommand(replaceAll)}
						disabled={!query.valid || !searchText}
						aria-label="Replace all"
						title="Replace all"
						tabIndex={replaceOpen ? 0 : -1}
					>
						<span className="icon-repeat" aria-hidden="true" />
					</button>
				</div>
			</div>
		</div>
	);
}
