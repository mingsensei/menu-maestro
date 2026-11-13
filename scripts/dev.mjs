import { spawn } from 'node:child_process';

const children = ['backend', 'frontend'].map(workspace => spawn('npm', ['run', 'dev', '--workspace', workspace], { stdio: 'inherit', detached: process.platform !== 'win32' }));
let closing = false;
function stop(code = 0) {
  if (closing) return;
  closing = true;
  for (const child of children) {
    try { if (process.platform === 'win32') child.kill('SIGTERM'); else process.kill(-child.pid, 'SIGTERM'); } catch { /* The process may already have exited. */ }
  }
  process.exitCode = code;
}
for (const child of children) child.on('exit', code => stop(code ?? 1));
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
