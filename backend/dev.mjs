import { spawn } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';

// Polling also works in containers and hosts where native watchers hit EMFILE.
function version() {
  return readdirSync('src').filter(name => name.endsWith('.js')).concat('.env').map(name => {
    try { return statSync(name.endsWith('.env') ? '.env' : `src/${name}`).mtimeMs; } catch { return 0; }
  }).join(',');
}
let child;
let stopping = false;
let revision = version();
function launch() { child = spawn(process.execPath, ['--env-file-if-exists=.env', 'src/index.js'], { stdio: 'inherit' }); }
launch();
const timer = setInterval(() => {
  const next = version();
  if (next === revision || stopping) return;
  revision = next;
  if (child.exitCode !== null || child.signalCode !== null) launch();
  else { child.once('exit', () => { if (!stopping) launch(); }); child.kill('SIGTERM'); }
}, 500);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stopping = true; clearInterval(timer); child.kill(signal); });
