const cwd = process.cwd();
const lifecycleEvent = process.env.npm_lifecycle_event ?? '';
const isMountedWindowsPath = cwd.startsWith('/mnt/');
const isNativeWindows = process.platform === 'win32';
const isWsl = Boolean(process.env.WSL_DISTRO_NAME);
const isEnvCheck = lifecycleEvent === 'check:env';

if (isMountedWindowsPath) {
  console.warn('');
  console.warn('[fomopomo] Warning: the project is running from a mounted Windows path.');
  console.warn('[fomopomo] This is supported, but file watching and I/O can be slower than a native filesystem.');
  console.warn('[fomopomo] Recommended locations: C:\\dev\\fomopomo on Windows or ~/projects/fomopomo in WSL.');
  console.warn('');
}

if (isEnvCheck) {
  console.log('');
  if (isNativeWindows) {
    console.log('[fomopomo] Environment OK: native Windows detected.');
    console.log(`[fomopomo] Working directory: ${cwd}`);
  } else if (isWsl) {
    console.log('[fomopomo] Environment OK: WSL detected.');
    console.log(`[fomopomo] Working directory: ${cwd}`);
  } else {
    console.log(`[fomopomo] Environment OK: ${process.platform} detected.`);
    console.log(`[fomopomo] Working directory: ${cwd}`);
  }
  console.log('');
}
