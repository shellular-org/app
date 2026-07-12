import { exec } from "node:child_process";
import { join } from "node:path";

export default async function start(server) {
	const project = join(process.cwd(), "platforms/macos/shellular.xcodeproj");
	exec(`open "${project}"`);
	console.log("Build and run the shellular scheme (My Mac).");
	if (server) console.log(`Dev server: http://${server.host}:${server.port}`);
}
