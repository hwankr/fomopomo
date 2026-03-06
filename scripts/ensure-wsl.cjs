const cwd = process.cwd();
const isNativeWindows = process.platform === 'win32';
const isMountedWindowsPath = cwd.startsWith('/mnt/');

if (isNativeWindows) {
  console.error('');
  console.error('[fomopomo] This project is configured for WSL/Linux development only.');
  console.error('[fomopomo] Run install/build/dev commands inside WSL, not native Windows.');
  console.error('[fomopomo] Recommended location: ~/projects/fomopomo');
  console.error('[fomopomo] Windows can still open the files via \\\\wsl.localhost\\Ubuntu\\home\\<user>\\projects\\fomopomo');
  console.error('');
  process.exit(1);
}

if (isMountedWindowsPath) {
  console.warn('');
  console.warn('[fomopomo] Warning: the project is running from a mounted Windows path.');
  console.warn('[fomopomo] For better stability and file watching, move it into the WSL filesystem.');
  console.warn('[fomopomo] Recommended location: ~/projects/fomopomo');
  console.warn('');
}
