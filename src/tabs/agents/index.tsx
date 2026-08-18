import "./style.scss";
import { pushPage } from "App";
import EmptyState from "components/EmptyState";
import Loader from "components/Loader";
import TabPageHeader from "components/TabPageHeader";
import BookmarkSessionsPage from "pages/bookmark-sessions";
import type { ReactElement } from "react";
import { useShellular } from "state";
import { useBookmarkedSessions } from "state/bookmarkSessions";
import AgentTile from "./AgentTile";

function openBookmarked() {
	pushPage("bookmarked-sessions", <BookmarkSessionsPage />);
}

async function openManageAgents() {
	const ManageAgentsPage = await import("pages/manage-agents");
	pushPage("manage-agents", <ManageAgentsPage.default />);
}

export default function AgentsTab() {
	const { connectionStatus, loadingAgents, agents, loadAgents } =
		useShellular();
	const { bookmarked } = useBookmarkedSessions();

	if (connectionStatus !== "connected") {
		return (
			<div className="agents-page empty">
				<TabPageHeader title="Agents" />
				<EmptyState
					message="Connect to a device to use agents"
					mascot="sleep"
				/>
			</div>
		);
	}

	let rightSlot: ReactElement | null = null;

	if (loadingAgents) {
		rightSlot = <Loader size={16} />;
	} else {
		rightSlot = (
			<>
				{bookmarked.length > 0 && (
					<button
						type="button"
						onClick={openBookmarked}
						className="agents-header-btn"
						aria-label="Bookmarked chats"
					>
						<span className="icon-bookmark" aria-hidden="true" />
					</button>
				)}
				<button
					type="button"
					onClick={openManageAgents}
					className="agents-header-btn"
					aria-label="Manage agents"
				>
					<span className="icon-sliders" aria-hidden="true" />
				</button>
				<button
					type="button"
					onClick={loadAgents}
					className="agents-header-btn"
					aria-label="Refresh agents"
				>
					<span className="icon-refresh-cw" aria-hidden="true" />
				</button>
			</>
		);
	}

	return (
		<div className="agents-page">
			<TabPageHeader title="Agents" rightSlot={rightSlot} />
			{loadingAgents && (
				<EmptyState message="Loading agents..." mascot="loading" />
			)}
			{!loadingAgents && Object.keys(agents).length === 0 && (
				<EmptyState
					message="No agents yet"
					description="Set up an agent like Claude Code or Codex and start shipping from your phone."
					mascot="thinking"
					action={
						<button type="button" onClick={openManageAgents}>
							<span className="icon-sliders" aria-hidden="true" />
							Manage agents
						</button>
					}
				/>
			)}

			{!loadingAgents && Object.keys(agents).length > 0 && (
				<ul className="agents-list">
					{Object.values(agents).map((agent) => (
						<AgentTile key={agent.id} agent={agent} />
					))}
				</ul>
			)}
		</div>
	);
}
