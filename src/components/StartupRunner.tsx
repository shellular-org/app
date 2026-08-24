import { useEffect, useRef } from "react";
import { useShellular } from "state";
import { runStartup } from "state/startup";

/**
 * Starts the configured startup rule, once per app process. Renders nothing,
 * the way AppDialogHost does; the visible half is StartupBanner in the Home
 * tab. Mounted in App's authenticated, non-onboarding branch rather than
 * inside the provider, because ShellularProvider also wraps the onboarding
 * page and the rule must not fire during first run.
 */
export default function StartupRunner() {
	const { connect, agents, projects } = useShellular();

	// The runner starts once and then waits, so it needs the values from the
	// latest render rather than the ones captured at mount.
	const connectRef = useRef(connect);
	connectRef.current = connect;
	const agentsRef = useRef(agents);
	agentsRef.current = agents;
	const projectsRef = useRef(projects);
	projectsRef.current = projects;

	useEffect(() => {
		runStartup({
			connect: (token) => connectRef.current(token),
			getAgents: () => agentsRef.current,
			getProjects: () => projectsRef.current,
		}).catch((err) => console.error("[Startup]", err));
	}, []);

	return null;
}
