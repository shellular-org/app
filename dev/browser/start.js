import { exec } from 'node:child_process';
import os from 'node:os';

export default async function start(server) {
  const url = server ? `https://${server.host}:${server.port}` : 'https://localhost:3000';

  if (os.platform() === 'darwin') {
    exec(`open ${url}`);
  } else if (os.platform() === 'win32') {
    exec(`start ${url}`);
  } else {
    exec(`xdg-open ${url}`);
  }
}
