import { exec } from "node:child_process";
import { join } from "node:path";

export default async function build() {
	const root = join(process.cwd(), "platforms/macos");
	await new Promise((resolve, reject) => {
		const child = exec(`xcodebuild archive -project "${join(root, "shellular.xcodeproj")}" -scheme shellular -configuration Release -destination 'generic/platform=macOS' -archivePath "${join(root, "shellular.xcarchive")}"`);
		child.stdout?.pipe(process.stdout); child.stderr?.pipe(process.stderr);
		child.on("close", code => code === 0 ? resolve() : reject(new Error(`xcodebuild exited ${code}`)));
		child.on("error", reject);
	});
}
