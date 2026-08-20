import { exec } from 'node:child_process';
import os from 'node:os';

export default async function start(server) {
  const protocol = server?.protocol || 'https';
  const url = server ? `${protocol}://${server.host}:${server.port}` : 'https://localhost:3000';

  console.log(`-> Dev server: ${url}`);

  // A remote or headless workstation has no browser to open; printing the URL
  // is all that is useful there.
  if (server && server.headless) {
    return;
  }

  if (os.platform() === 'darwin') {
    exec(`open ${url}`);
  } else if (os.platform() === 'win32') {
    exec(`start ${url}`);
  } else {
    exec(`xdg-open ${url}`);
  }
}
