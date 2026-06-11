import { exec } from 'node:child_process';
import { join } from 'node:path';

const iosPath = join(process.cwd(), 'platforms', 'ios');
const xcodeprojPath = join(iosPath, 'shellular.xcodeproj');

export default async function start(server) {
  console.log('Opening Xcode project...');
  exec(`open "${xcodeprojPath}"`, (error) => {
    if (error) {
      console.error('Failed to open Xcode:', error.message);
      return;
    }
    console.log('Xcode opened. Build and run from Xcode (⌘R).');
    if (server) {
      console.log(`Dev server: http://${server.host}:${server.port}`);
      console.log('The app will redirect to the dev server automatically on launch.');
    }
  });
}
