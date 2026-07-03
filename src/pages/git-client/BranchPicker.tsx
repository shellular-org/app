import Loader from "components/Loader";
import { useMemo, useState } from "react";
import type { GitBranch, GitOperation } from "state";
import type { BranchActionError } from "./branchErrors";

interface Props {
	activeBranchRef: string | null;
	branches: GitBranch[];
	busy: GitOperation | null;
	error: BranchActionError | null;
	onClose: () => void;
	onCreate: (name: string) => Promise<void>;
	onDelete: (branch: GitBranch, force?: boolean) => Promise<void>;
	onDismissError: () => void;
	onSelect: (branch: GitBranch) => Promise<void>;
}

export default function BranchPicker({
	activeBranchRef,
	branches,
	busy,
	error,
	onClose,
	onCreate,
	onDelete,
	onDismissError,
	onSelect,
}: Props) {
	const [query, setQuery] = useState("");
	const [newBranch, setNewBranch] = useState("");
	const [creating, setCreating] = useState(false);
	const filtered = useMemo(() => {
		const normalized = query.trim().toLocaleLowerCase();
		return normalized
			? branches.filter((branch) =>
					`${branch.name} ${branch.ref}`
						.toLocaleLowerCase()
						.includes(normalized),
				)
			: branches;
	}, [branches, query]);
	const localBranches = filtered.filter((branch) => !branch.remote);
	const remoteBranches = filtered.filter((branch) => branch.remote);

	const submitCreate = async () => {
		const name = newBranch.trim();
		if (!name || busy) return;
		await onCreate(name);
	};

	const renderBranch = (branch: GitBranch) => (
		<div
			key={`${branch.remote ? "remote" : "local"}:${branch.ref}`}
			className="git-modal-branch-row"
			data-active={branch.current || undefined}
		>
			<button
				type="button"
				className="git-modal-branch-select"
				onClick={() => !branch.current && onSelect(branch)}
				disabled={branch.current || !!busy}
			>
				{activeBranchRef === branch.ref && busy === "checkout" ? (
					<span className="git-branch-row-loader">
						<Loader size={14} mascot={false} />
					</span>
				) : (
					<span
						className={
							branch.current
								? "icon-check git-current-indicator"
								: "icon-git-branch git-branch-row-icon"
						}
						aria-hidden="true"
					/>
				)}
				<span className="git-branch-row-copy">
					<span className="git-branch-name-text">{branch.name}</span>
					<span className="git-branch-row-meta">
						{branch.current
							? "Current branch"
							: branch.remote
								? branch.ref
								: branch.upstream || "Local branch"}
					</span>
				</span>
				{branch.default && (
					<span className="git-default-branch-label">Default</span>
				)}
			</button>
			{!branch.remote && !branch.current && (
				<button
					type="button"
					className="git-modal-branch-delete"
					onClick={() => onDelete(branch)}
					disabled={!!busy}
					title="Delete branch"
					aria-label={`Delete branch ${branch.name}`}
				>
					{activeBranchRef === branch.ref && busy === "branch-delete" ? (
						<Loader size={14} mascot={false} />
					) : (
						<span className="icon-trash" aria-hidden="true" />
					)}
				</button>
			)}
		</div>
	);

	return (
		<div
			className="git-modal-backdrop"
			onClick={() => {
				if (!busy) onClose();
			}}
		>
			<section
				className="git-modal-content"
				onClick={(event) => event.stopPropagation()}
				aria-label="Branches"
			>
				<div className="git-sheet-handle" aria-hidden="true" />
				<div className="git-modal-header">
					<div>
						<h3>Branches</h3>
						<span>{branches.length} available</span>
					</div>
					<button
						type="button"
						className="git-modal-close-btn"
						onClick={onClose}
						disabled={!!busy}
						aria-label="Close"
					>
						<span className="icon-x" aria-hidden="true" />
					</button>
				</div>

				{error && (
					<div className="git-branch-alert" role="alert">
						<div className="git-branch-alert-icon">
							<span className="icon-alert-triangle" aria-hidden="true" />
						</div>
						<div className="git-branch-alert-copy">
							<strong>{error.title}</strong>
							<p>{error.message}</p>
							{error.canForceDelete && error.branch && (
								<button
									type="button"
									className="git-force-delete-btn"
									onClick={() => error.branch && onDelete(error.branch, true)}
									disabled={!!busy}
								>
									{busy === "branch-delete" ? (
										<Loader size={13} mascot={false} />
									) : (
										<span className="icon-trash" aria-hidden="true" />
									)}
									Force delete
								</button>
							)}
						</div>
						<button
							type="button"
							className="git-branch-alert-close"
							onClick={onDismissError}
							disabled={!!busy}
							aria-label="Dismiss branch error"
						>
							<span className="icon-x" aria-hidden="true" />
						</button>
					</div>
				)}

				<div className="git-branch-controls">
					<div className="git-branch-search">
						<span className="icon-search" aria-hidden="true" />
						<input
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder="Find a branch"
							autoComplete="off"
						/>
					</div>
					{creating ? (
						<form
							className="git-branch-create-form"
							onSubmit={(event) => {
								event.preventDefault();
								submitCreate();
							}}
						>
							<input
								value={newBranch}
								onChange={(event) => setNewBranch(event.target.value)}
								placeholder="feature/branch-name"
								autoCapitalize="none"
								autoCorrect="off"
							/>
							<button type="submit" disabled={!newBranch.trim() || !!busy}>
								{busy === "branch-create" ? (
									<Loader size={14} mascot={false} />
								) : (
									<span className="icon-check" aria-hidden="true" />
								)}
							</button>
							<button
								type="button"
								onClick={() => {
									setCreating(false);
									setNewBranch("");
								}}
								aria-label="Cancel branch creation"
							>
								<span className="icon-x" aria-hidden="true" />
							</button>
						</form>
					) : (
						<button
							type="button"
							className="git-modal-create-btn"
							onClick={() => setCreating(true)}
						>
							<span className="icon-plus" aria-hidden="true" />
							New branch
						</button>
					)}
				</div>

				<div className="git-modal-branch-list">
					{localBranches.length > 0 && (
						<div className="git-branch-section">
							<div className="git-branch-section-label">Local</div>
							{localBranches.map(renderBranch)}
						</div>
					)}
					{remoteBranches.length > 0 && (
						<div className="git-branch-section">
							<div className="git-branch-section-label">Remote</div>
							{remoteBranches.map(renderBranch)}
						</div>
					)}
					{filtered.length === 0 && (
						<div className="git-branch-empty">No branches match “{query}”</div>
					)}
				</div>
			</section>
		</div>
	);
}
