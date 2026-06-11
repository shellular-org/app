import { exec } from 'node:child_process';
import { join } from 'node:path';

const iosPath = join(process.cwd(), 'platforms', 'ios');

export default async function build() {
  console.log('Archiving iOS app with xcodebuild...');
  const archivePath = join(iosPath, 'shellular.xcarchive');

  await runCommand(
    `xcodebuild archive` +
    ` -project "${join(iosPath, 'shellular.xcodeproj')}"` +
    ` -scheme shellular` +
    ` -configuration Release` +
    ` -archivePath "${archivePath}"`,
  );

  console.log(`Archive created at: ${archivePath}`);
  console.log('Upload to App Store Connect via Xcode Organizer or Transporter.');
}

function runCommand(command) {
  return new Promise((resolve, reject) => {
    const child = exec(command);
    child.stdout?.pipe(process.stdout);
    child.stderr?.pipe(process.stderr);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command exited with code ${code}`));
    });
    child.on('error', reject);
  });
}
