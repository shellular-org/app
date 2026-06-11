import select from 'cli-select';
import { exec, execSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import packageJson from '../../package.json' with { type: 'json' };

const name = packageJson.name;
const debugName = `${name}.dev`;
const androidPath = join(process.cwd(), 'platforms', 'android');
const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');
const isRelease = process.argv.includes('--release') || process.argv.includes('-r') || false;
const targetArg = process.argv.find((arg) => arg.startsWith('--target=') || arg.startsWith('-t='));
const target = targetArg ? targetArg.split('=')[1] : null;
const type = isRelease ? 'release' : 'debug';
const apkPath = join(androidPath, `app/build/outputs/apk/${type}/app-${type}.apk`);

let emulatorStarted = false;
// let appInstalled = false;
let _onDone;

export default async function start(server, onDone) {
  _onDone = onDone;
  if (isRelease) {
    const { default: build } = await import('./build.js');
    await build('apk');
    installApp();
    return;
  }

  let command = 'assembleDebug';

  try {
    const res = execSync('adb devices', { encoding: 'utf-8' }); // Use 'utf-8' to get a string output
    const devices = res.toString().trim().split('\n').slice(1).filter(Boolean);
    if (devices.length) {
      command = 'installDebug';
    }
  } catch (_error) {
    execSync('adb start-server', { stdio: 'ignore' });
  }

  const gradlewPath = join(androidPath, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
  if (!existsSync(gradlewPath)) {
    console.error(`gradlew not found at ${gradlewPath}. Make sure you have the Android platform and gradle wrapper available.`);
    process.exit(1);
  }

  let buildShell;
  try {
    if (verbose) console.log(`Spawning: ${gradlewPath} ${command}`);
    const gradleEnv = { ...process.env, GRADLE_OPTS: [process.env.GRADLE_OPTS, '--enable-native-access=ALL-UNNAMED'].filter(Boolean).join(' ') };
    if (process.platform === 'win32') {
      // On Windows, execute the .bat via cmd.exe /c
      buildShell = spawn('cmd.exe', ['/c', gradlewPath, command], {
        cwd: androidPath,
        stdio: 'inherit',
        env: gradleEnv,
      });
    } else {
      buildShell = spawn(gradlewPath, [command], {
        cwd: androidPath,
        stdio: 'inherit',
        env: gradleEnv,
      });
    }
  } catch (err) {
    console.error('Failed to spawn gradlew. Command/args:', process.platform === 'win32' ? ['cmd.exe', '/c', gradlewPath, command] : [gradlewPath, command]);
    console.error(err && err.message ? err.message : err);
    process.exit(1);
  }

  buildShell.on('error', (error) => {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  });

  buildShell.on('close', (code) => {
    if (code === 0) {
      installApp();
    } else {
      console.error(`Build failed with code ${code}`);
      process.exit(1);
    }
  });
}

async function installApp() {
  const runningDevice = execSync('adb devices', { encoding: 'utf-8' });
  const devices = runningDevice.split('\n').slice(1).filter(Boolean);
  let targetDevice = target;

  if (targetDevice) {
    if (!devices.find((d) => new RegExp(targetDevice || '.*').test(d))) {
      console.error(`No device found matching target: ${targetDevice}`);
      process.exit(1);
    }
  } else if (devices.length > 1) {
    const res = await select({
      values: devices,
      inputStream: process.stdin,
      outputStream: process.stdout,
      cleanup: true,
    });

    targetDevice = res.value.split('\t')[0];
  } else if (devices.length === 1) {
    targetDevice = devices[0].split('\t')[0];
  } else {
    console.log('No devices connected.');
  }

  if (!devices.length) {
    targetDevice = await startEmulator();
    return;
  }

  if (!existsSync(apkPath)) {
    console.error('APK not found. Please build the app first. Retrying in 5 seconds...');
    setTimeout(installApp, 5000);
    return;
  }

  // Ensure adb is available
  try {
    execSync('adb version', { stdio: 'ignore' });
  } catch (err) {
    console.error('adb not found in PATH. Please ensure Android platform-tools are installed and adb is available.');
    process.exit(1);
  }

  // Build adb args without empty strings (passing an empty arg can cause EINVAL on Windows)
  const adbArgs = [];
  if (targetDevice) {
    adbArgs.push('-s', targetDevice);
  }
  adbArgs.push('install', '-r', apkPath);

  let adb;
  try {
    if (verbose) console.log('Spawning: adb', adbArgs);
    adb = spawn('adb', adbArgs, {
      stdio: 'pipe',
    });
  } catch (err) {
    console.error('Failed to spawn adb. Command/args: adb', adbArgs);
    console.error(err && err.message ? err.message : err);
    process.exit(1);
  }

  adb.stdout.on('data', (data) => {
    if (data.includes('Success')) {
      console.log('App installed successfully');
      // appInstalled = true;
      startApp();
      return;
    }
    if (verbose) {
      console.log(`ADB: ${data}`);
    }
  });

  adb.stderr.on('data', async (data) => {
    const errorMessage = data.toString();
    if (await deviceErrorHandler(errorMessage)) {
      return;
    }
    adb.kill();
  });
}

async function deviceErrorHandler(errorMessage) {
  if (errorMessage.includes('device offline')) {
    if (!emulatorStarted) {
      await startEmulator();
    }
    console.error('Device offline. Please check your device/emulator.');
    console.log('Retrying installation in 5 seconds...');
    setTimeout(installApp, 5000);
    return true;
  } else {
    console.error(`Error: ${errorMessage}`);
  }

  return false;
}

function startApp() {
  const appId = isRelease ? name : debugName;
  console.log(`-> Stopping app ${appId}`);
  try {
    execSync(`adb shell am force-stop ${appId}`, { stdio: 'ignore' });
  } catch (_error) {
    // Ignore error if app is not running
  }
  console.log(`-> Starting app ${appId}`);
  const shell = exec(`adb shell am start -n ${appId}/${name}.MainActivity`);
  setTimeout(() => {
    shell.kill();
  }, 10000);
  _onDone?.();
}

async function getEmulator() {
  emulatorStarted = true;
  console.log('-> Starting emulator');

  // Use path.join and explicit executable name on Windows to avoid invalid spawn arguments
  const emulatorExe = join(process.env.ANDROID_HOME || '', 'emulator', process.platform === 'win32' ? 'emulator.exe' : 'emulator');
  if (!existsSync(emulatorExe)) {
    console.error(`Emulator executable not found at ${emulatorExe}. Check your ANDROID_HOME and Android SDK installation.`);
    process.exit(1);
  }

  const emulators = execSync(`"${emulatorExe}" -list-avds`, { encoding: 'utf-8' });

  const avds = emulators.split('\n').filter(Boolean);
  let avd = avds[0];
  if (target) {
    avd = avds.find((avd) => avd.includes(target));
    if (!avd) {
      console.error(`No AVD found with target ${target}`);
      process.exit(1);
    }
  } else if (avds.length > 1) {
    console.log('\nMultiple AVDs found. Please select one:');
    const res = await select({
      values: avds,
      inputStream: process.stdin,
      outputStream: process.stdout,
      cleanup: true,
    });

    console.log(`Selected AVD: ${res.value}`);
    avd = res.value;
  }

  return avd;
}

async function startEmulator() {
  const avd = await getEmulator();
  const emulatorExePath = join(process.env.ANDROID_HOME || '', 'emulator', process.platform === 'win32' ? 'emulator.exe' : 'emulator');
  if (!existsSync(emulatorExePath)) {
    console.error(`Emulator executable not found at ${emulatorExePath}. Check your ANDROID_HOME and Android SDK installation.`);
    process.exit(1);
  }

  let emulator;
  try {
    if (verbose) console.log('Spawning emulator:', emulatorExePath, ['-avd', avd]);
    emulator = spawn(emulatorExePath, ['-avd', avd], {
      stdio: 'pipe',
    });
  } catch (err) {
    console.error('Failed to spawn emulator. Command/args:', emulatorExePath, ['-avd', avd]);
    console.error(err && err.message ? err.message : err);
    process.exit(1);
  }

  process.on('exit', () => {
    emulator.kill();
  });

  process.on('SIGINT', () => {
    emulator.kill();
    process.exit(0);
  });

  emulator.on('error', (error) => {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  });

  emulator.on('close', (code) => {
    if (code !== 0) {
      console.error(`Emulator exited with code ${code}`);
      process.exit(1);
    }
  });

  if (verbose) {
    emulator.stdout.on('data', (data) => {
      console.log(`Emulator: ${data}`);
    });
  }

  setTimeout(installApp, 5000);
  return avd;
}
