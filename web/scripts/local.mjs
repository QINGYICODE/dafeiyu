import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const production = process.argv[2] === 'start';
const cwd = fileURLToPath(new URL('../', import.meta.url));
const uiArguments = production ? ['--import', './scripts/sites-env.mjs', './node_modules/wrangler/bin/wrangler.js', 'dev', '--config', 'dist/server/wrangler.json', '--local', '--persist-to', '.wrangler/state', '--ip', '127.0.0.1', '--port', '5174', '--inspector-port', '0'] : ['scripts/run-framework.mjs', 'dev'];
const commands = [['server/index.mjs'], uiArguments, ...(production ? [['server/gateway.mjs']] : [])];
const children = commands.map(args => spawn(process.execPath, args, { cwd, stdio: 'inherit', env: process.env }));
let stopping = false;
function stop(code = 0) { if (stopping) return; stopping = true; for (const child of children) child.kill('SIGTERM'); setTimeout(() => process.exit(code), 500).unref(); }
for (const child of children) child.on('exit', code => stop(code || 0));
process.on('SIGINT', () => stop()); process.on('SIGTERM', () => stop());
