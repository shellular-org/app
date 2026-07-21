import {
	Dialog,
	DialogBackdrop,
	DialogPanel,
	DialogTitle,
} from "@headlessui/react";
import Loader from "components/Loader";
import type { BranchActionError } from "pages/git-client/branchErrors";
import { useMemo, useState } from "react";
import type { GitBranch, GitOperation } from "state";

export interface DesktopBranchDialogProps {
	activeBranchRef: string | null;
	branches: GitBranch[];
	busy: GitOperation | null;
	error: BranchActionError | null;
	loading: boolean;
	onClose: () => void;
	onCreate: (name: string) => Promise<void>;
	onDelete: (branch: GitBranch, force?: boolean) => Promise<void>;
	onDismissError: () => void;
	onRetry: () => void;
	onSelect: (branch: GitBranch) => Promise<void>;
}

export default function DesktopBranchDialog({
	activeBranchRef,
	branches,
	busy,
	error,
	loading,
	onClose,
	onCreate,
	onDelete,
	onDismissError,
	onRetry,
	onSelect,
}: DesktopBranchDialogProps) {
	const [query, setQuery] = useState("");
	const [creating, setCreating] = useState(false);
	const [newBranch, setNewBranch] = useState("");
	const locked = Boolean(busy && busy !== "branches");
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

	const close = () => {
		if (!locked) onClose();
	};
	const create = async () => {
		const name = newBranch.trim();
		if (!name || locked) return;
		await onCreate(name);
	};

	return (
		<Dialog open onClose={close} className="fixed inset-0 z-10000">
			<DialogBackdrop
				className="fixed inset-0 bg-black/55 backdrop-blur-[2px]"
				onClick={close}
			/>
			<div className="fixed inset-0 flex items-center justify-center p-4">
				<DialogPanel className="flex max-h-[min(680px,calc(100dvh-32px))] w-full max-w-[460px] flex-col overflow-hidden rounded-xl border border-popup-border-color bg-popup-background text-primary-text shadow-2xl">
					<header className="flex h-12 shrink-0 items-center gap-3 border-b border-card-border px-4">
						<div className="min-w-0 flex-1">
							<DialogTitle className="text-sm font-semibold">
								Branches
							</DialogTitle>
							<p className="truncate text-[11px] text-secondary-text">
								{loading ? "Loading branches…" : `${branches.length} available`}
							</p>
						</div>
						<button
							type="button"
							className="grid size-7 place-items-center rounded-md text-secondary-text hover:bg-surface-soft hover:text-primary-text disabled:opacity-40"
							onClick={close}
							disabled={locked}
							aria-label="Close branch dialog"
						>
							<span className="icon-x" />
						</button>
					</header>

					<div className="grid shrink-0 gap-2 border-b border-card-border p-3">
						<label className="flex h-9 items-center gap-2 rounded-md border border-card-border bg-primary px-2.5 focus-within:border-accent">
							<span className="icon-search text-xs text-secondary-text" />
							<span className="sr-only">Find a branch</span>
							<input
								autoFocus
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								placeholder="Find a branch"
								autoComplete="off"
								className="min-w-0 flex-1 bg-transparent text-xs text-primary-text outline-none placeholder:text-secondary-text"
							/>
						</label>
						{creating ? (
							<form
								className="flex h-9 overflow-hidden rounded-md border border-card-border bg-primary focus-within:border-accent"
								onSubmit={(event) => {
									event.preventDefault();
									void create();
								}}
							>
								<input
									value={newBranch}
									onChange={(event) => setNewBranch(event.target.value)}
									placeholder="feature/branch-name"
									autoCapitalize="none"
									autoCorrect="off"
									className="min-w-0 flex-1 bg-transparent px-2.5 text-xs text-primary-text outline-none placeholder:text-secondary-text"
								/>
								<button
									type="submit"
									className="grid w-9 place-items-center border-l border-card-border text-accent disabled:opacity-40"
									disabled={!newBranch.trim() || locked}
									aria-label="Create branch"
								>
									{busy === "branch-create" ? (
										<Loader size={13} mascot={false} />
									) : (
										<span className="icon-check" />
									)}
								</button>
								<button
									type="button"
									className="grid w-9 place-items-center border-l border-card-border text-secondary-text hover:text-primary-text"
									onClick={() => {
										setCreating(false);
										setNewBranch("");
									}}
									disabled={locked}
									aria-label="Cancel branch creation"
								>
									<span className="icon-x" />
								</button>
							</form>
						) : (
							<button
								type="button"
								className="flex h-8 items-center justify-center gap-1.5 rounded-md bg-button-background px-3 text-xs font-semibold text-button-text hover:bg-button-background-active disabled:opacity-45"
								onClick={() => setCreating(true)}
								disabled={locked}
							>
								<span className="icon-plus" /> New branch
							</button>
						)}
					</div>

					{error && (
						<div
							className="mx-3 mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-md border border-danger/30 bg-danger/10 p-2.5 text-xs"
							role="alert"
						>
							<div className="min-w-0">
								<strong className="block text-danger">{error.title}</strong>
								<p className="mt-0.5 text-secondary-text">{error.message}</p>
								<div className="mt-2 flex gap-2">
									{error.canForceDelete && error.branch && (
										<button
											type="button"
											className="rounded border border-danger/40 bg-danger/10 px-2 py-1 font-semibold text-danger hover:bg-danger/15 disabled:opacity-45"
											onClick={() =>
												error.branch && void onDelete(error.branch, true)
											}
											disabled={locked}
										>
											Force delete
										</button>
									)}
									<button
										type="button"
										className="rounded border border-card-border px-2 py-1 text-primary-text hover:bg-surface-soft"
										onClick={onRetry}
										disabled={loading || locked}
									>
										Retry
									</button>
								</div>
							</div>
							<button
								type="button"
								className="grid size-6 place-items-center rounded text-secondary-text hover:bg-surface-soft hover:text-primary-text"
								onClick={onDismissError}
								aria-label="Dismiss branch error"
							>
								<span className="icon-x" />
							</button>
						</div>
					)}

					<div className="min-h-0 flex-1 overflow-y-auto py-1">
						{loading && branches.length === 0 ? (
							<div className="flex h-28 items-center justify-center gap-2 text-xs text-secondary-text">
								<Loader size={16} mascot={false} /> Loading branches…
							</div>
						) : filtered.length === 0 ? (
							<p className="px-4 py-8 text-center text-xs text-secondary-text">
								No branches found
							</p>
						) : (
							<>
								<BranchGroup
									title="Local"
									branches={localBranches}
									activeBranchRef={activeBranchRef}
									busy={busy}
									onDelete={onDelete}
									onSelect={onSelect}
								/>
								<BranchGroup
									title="Remote"
									branches={remoteBranches}
									activeBranchRef={activeBranchRef}
									busy={busy}
									onDelete={onDelete}
									onSelect={onSelect}
								/>
							</>
						)}
					</div>
				</DialogPanel>
			</div>
		</Dialog>
	);
}

function BranchGroup({
	title,
	branches,
	activeBranchRef,
	busy,
	onDelete,
	onSelect,
}: {
	title: string;
	branches: GitBranch[];
	activeBranchRef: string | null;
	busy: GitOperation | null;
	onDelete: (branch: GitBranch, force?: boolean) => Promise<void>;
	onSelect: (branch: GitBranch) => Promise<void>;
}) {
	if (branches.length === 0) return null;
	return (
		<section>
			<h3 className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-secondary-text">
				{title}
			</h3>
			{branches.map((branch) => (
				<div
					key={`${branch.remote ? "remote" : "local"}:${branch.ref}`}
					className="group flex min-h-10 items-center px-1.5 hover:bg-surface-soft"
				>
					<button
						type="button"
						className="flex min-w-0 flex-1 items-center gap-2 rounded px-1.5 py-1 text-left disabled:cursor-default"
						onClick={() => void onSelect(branch)}
						disabled={branch.current || Boolean(busy)}
					>
						{activeBranchRef === branch.ref && busy === "checkout" ? (
							<Loader size={13} mascot={false} />
						) : (
							<span
								className={`${branch.current ? "icon-check text-accent" : "icon-git-branch text-secondary-text"} shrink-0 text-xs`}
							/>
						)}
						<span className="min-w-0 flex-1">
							<span className="block truncate text-xs font-medium text-primary-text">
								{branch.name}
							</span>
							<span className="block truncate text-[10px] text-secondary-text">
								{branch.current
									? "Current branch"
									: branch.remote
										? branch.ref
										: branch.upstream || "Local branch"}
							</span>
						</span>
						{branch.default && (
							<span className="rounded border border-card-border bg-surface-soft px-1.5 py-0.5 text-[9px] text-primary-text">
								Default
							</span>
						)}
					</button>
					{!branch.remote && !branch.current && (
						<button
							type="button"
							className="grid size-7 shrink-0 place-items-center rounded text-secondary-text opacity-0 hover:bg-danger/10 hover:text-danger group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-30"
							onClick={() => void onDelete(branch)}
							disabled={Boolean(busy)}
							aria-label={`Delete branch ${branch.name}`}
						>
							{activeBranchRef === branch.ref && busy === "branch-delete" ? (
								<Loader size={13} mascot={false} />
							) : (
								<span className="icon-trash" />
							)}
						</button>
					)}
				</div>
			))}
		</section>
	);
}
