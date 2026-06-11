import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export default async () => {
  await buildApp('apk');
  await buildApp('bundle');
};

function buildApp(packageType = 'bundle') {
  let onDone;
  let onError;
  const buildConfigPath = join(process.cwd(), 'build.json');
  if (!existsSync(buildConfigPath)) {
    throw new Error('build.json not found. This file is required for release builds. See readme for setup instructions.');
  }
  const config = JSON.parse(readFileSync(buildConfigPath, 'utf8'));

  const androidPath = join(process.cwd(), 'platforms', 'android');
  const gradlewPath = join(androidPath, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');

  // Create a temporary gradle.properties in the android project to pass keystore values
  const gradlePropertiesPath = join(androidPath, 'gradle.properties');
  const backupPath = `${gradlePropertiesPath}.shellular.bak`;
  const hadOriginal = existsSync(gradlePropertiesPath);
  try {
    if (hadOriginal) {
      copyFileSync(gradlePropertiesPath, backupPath);
    }

    const props = [];
    // project property names expected by the build script
    // Use forward slashes in the keystore path so properties file parsing doesn't treat backslashes as escapes
    const jksPath = join(process.cwd(), config.keystore).replace(/\\/g, '/');
    props.push(`jks=${jksPath}`);
    props.push(`storePassword=${config.storePassword}`);
    props.push(`password=${config.password}`);
    props.push(`alias=${config.alias}`);
    // Ensure AndroidX is enabled for builds that include AndroidX dependencies
    props.push('android.useAndroidX=true');
    props.push('android.enableJetifier=true');
    writeFileSync(gradlePropertiesPath, props.join('\n'), { encoding: 'utf8' });
  } catch (err) {
    console.error('Failed to write gradle.properties for signing:', err && err.message ? err.message : err);
    if (hadOriginal && existsSync(backupPath)) {
      // attempt to restore
      try { renameSync(backupPath, gradlePropertiesPath); } catch (_) { }
    }
    throw err;
  }

  const gradleArgs = [
    packageType === 'bundle' ? 'bundleRelease' : 'assembleRelease',
  ];

  const gradleEnv = { ...process.env, GRADLE_OPTS: [process.env.GRADLE_OPTS, '--enable-native-access=ALL-UNNAMED'].filter(Boolean).join(' ') };
  const buildShell = process.platform === 'win32'
    ? spawn('cmd.exe', ['/c', gradlewPath, ...gradleArgs], { cwd: androidPath, stdio: 'inherit', env: gradleEnv })
    : spawn(gradlewPath, gradleArgs, { cwd: androidPath, stdio: 'inherit', env: gradleEnv });

  buildShell.on('error', (error) => {
    console.error(`Error: ${error.message}`);
    onError();
  });

  buildShell.on('close', (code) => {
    // restore gradle.properties backup if we created one
    try {
      if (hadOriginal) {
        if (existsSync(backupPath)) {
          renameSync(backupPath, gradlePropertiesPath);
        }
      } else {
        if (existsSync(gradlePropertiesPath)) {
          unlinkSync(gradlePropertiesPath);
        }
      }
    } catch (_) {
      // ignore restore errors
    }

    if (code === 0) {
      onDone();
      console.log(`${androidPath}/app/build/outputs/${packageType}/release/app-release.${packageType === 'bundle' ? 'aab' : 'apk'}`);
    } else {
      onError();
      console.error(`Build failed with code ${code}`);
    }
  });

  return new Promise((resolve, reject) => {
    onDone = resolve;
    onError = reject;
  });
}
