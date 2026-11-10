import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// Read only explicitly supported variables. Secrets stay in this process.
export function resolveEnvironmentKeys() {
  const powershell = '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe';
  if (!existsSync(powershell)) return;
  for (const name of ['DEEPSEEK_KEY', 'QWEN_API_KEY', 'DASHSCOPE_API_KEY', 'DASHSCOPE_WORKSPACE_ID']) {
    if (process.env[name]) continue;
    try {
      const command = `$k=[Environment]::GetEnvironmentVariable('${name}','User'); if (-not $k) {$k=[Environment]::GetEnvironmentVariable('${name}','Machine')}; [Console]::Out.Write($k)`;
      const value = execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      if (value) process.env[name] = value;
    } catch {}
  }
}
