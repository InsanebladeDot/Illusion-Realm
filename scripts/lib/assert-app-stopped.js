/** 迁移前只读检查同一 Electron 的其他主进程，拒绝并行写入，绝不终止应用。 */
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execute = promisify(execFile);

async function assertAppStopped() {
  if (process.platform !== 'win32') throw new Error('MIGRATION_PLATFORM_NOT_VERIFIED');
  const { stdout } = await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    "Get-CimInstance Win32_Process -Filter \"name='electron.exe'\" | Select-Object ProcessId,ExecutablePath,CommandLine | ConvertTo-Json -Compress"],
  { windowsHide: true, timeout: 10000 });
  const value = stdout.trim() ? JSON.parse(stdout) : [];
  const processes = Array.isArray(value) ? value : [value];
  const active = processes.some(item => item.ProcessId !== process.pid &&
    typeof item.ExecutablePath === 'string' && item.ExecutablePath.toLowerCase() === process.execPath.toLowerCase() &&
    typeof item.CommandLine === 'string' && !/--type=/.test(item.CommandLine));
  if (active) throw new Error('MIGRATION_APP_STILL_RUNNING');
}

module.exports = { assertAppStopped };
