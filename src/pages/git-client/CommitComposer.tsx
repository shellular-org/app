import AppMenu from "components/AppMenu";
import Loader from "components/Loader";
import { useLayoutEffect, useRef } from "react";
import type { GitOperation } from "state";

const MAX_COMPOSER_HEIGHT = 68;

interface Props {
	busy: GitOperation | null;
	canCommit: boolean;
	message: string;
	onChange: (message: string) => void;
	onCommit: () => void;
	onCommitAndPush: () => void;
}

export default function CommitComposer({
	busy,
	canCommit,
	message,
	onChange,
	onCommit,
	onCommitAndPush,
}: Props) {
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const disabled = !canCommit || !!busy || !message.trim();

	useLayoutEffect(() => {
		const textarea = textareaRef.current;
		if (!textarea) return;
		textarea.style.height = "0px";
		const height = Math.min(textarea.scrollHeight, MAX_COMPOSER_HEIGHT);
		textarea.style.height = `${height}px`;
		textarea.style.overflowY =
			textarea.scrollHeight > MAX_COMPOSER_HEIGHT ? "auto" : "hidden";
	});

	return (
		<div className="git-commit-bar">
			<div className="git-commit-input-wrapper">
				<span className="icon-edit git-commit-input-icon" aria-hidden="true" />
				<textarea
					ref={textareaRef}
					value={message}
					onChange={(event) => onChange(event.target.value)}
					onKeyDown={(event) => {
						if (
							event.key === "Enter" &&
							(event.metaKey || event.ctrlKey) &&
							!disabled
						) {
							event.preventDefault();
							onCommit();
						}
					}}
					placeholder="Commit message"
					rows={1}
					className="git-commit-textarea"
				/>
			</div>
			<div
				className="git-commit-btn-group"
				data-disabled={disabled || undefined}
			>
				<button
					type="button"
					className="git-commit-btn-main"
					onClick={onCommit}
					disabled={disabled}
					title="Commit changes"
				>
					{busy === "commit" ? (
						<Loader size={14} mascot={false} />
					) : (
						<>
							<span className="icon-git-commit" aria-hidden="true" />
							Commit
						</>
					)}
				</button>
				<AppMenu
					ariaLabel="Commit options"
					disabled={disabled}
					buttonClassName="git-commit-btn-dropdown"
					placement="top end"
					items={[
						{
							icon: "icon-upload-cloud",
							label: "Commit & Push",
							subText: "Commit and push the current branch",
							onClick: onCommitAndPush,
						},
					]}
				>
					<span className="icon-chevron-down" aria-hidden="true" />
				</AppMenu>
			</div>
		</div>
	);
}
