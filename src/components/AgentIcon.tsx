import { getAgentIcon } from "lib/agents";
import type { AcpAgentInfo } from "state/acp";

interface AgentIconProps {
	agent: Pick<AcpAgentInfo, "id" | "icon" | "name" | "title">;
	className?: string;
}

export default function AgentIcon({ agent, className }: AgentIconProps) {
	const label = agent.title || agent.name;

	if (agent.icon) {
		return (
			<img
				className={className}
				src={agent.icon}
				alt=""
				aria-hidden="true"
				loading="lazy"
				decoding="async"
				onError={(event) => {
					event.currentTarget.style.display = "none";
				}}
			/>
		);
	}

	return (
		<span
			className={`${className ? `${className} ` : ""}${getAgentIcon(agent.id)}`}
			aria-hidden="true"
			title={label}
		/>
	);
}
