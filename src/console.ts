import "./browser/developerToolsStorageBootstrap";
import eruda from "eruda";
import {
	installShellularDeveloperTools,
	type ShellularDeveloperTools,
	type ShellularDeveloperToolsOptions,
} from "./browser/developerToolsRuntime";

type ConsoleWindow = Window &
	typeof globalThis & {
		eruda?: typeof eruda;
		__shellularDeveloperTools?: ShellularDeveloperTools;
		__shellularInstallDeveloperTools?: (
			options?: ShellularDeveloperToolsOptions,
		) => ShellularDeveloperTools;
	};

const consoleWindow = window as ConsoleWindow;
consoleWindow.eruda = eruda;
consoleWindow.__shellularInstallDeveloperTools = (options) =>
	installShellularDeveloperTools(eruda, options);

export default eruda;
