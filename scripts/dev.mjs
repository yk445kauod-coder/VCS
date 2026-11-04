#!/usr/bin/env node
/**
 * Development runner: starts the API and the Vite dev server together and
 * prefixes their output, so one `npm run dev` gives you an API with hot reload
 * and a dashboard with HMR (Vite proxies /api to the API on port 8787).
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const colours = { api: '\u001b[38;5;208m', web: '\u001b[38;5;111m', dim: '\u001b[2m', reset: '\u001b[0m' };

if (!existsSync('.env')) {
  console.log(`${colours.dim}no .env found — copy .env.example to .env to configure Duty${colours.reset}`);
}

const tasks = [
  { name: 'api', command: 'npx', args: ['tsx', 'watch', 'src/server/index.ts'] },
  { name: 'web', command: 'npx', args: ['vite'] },
];

const children = tasks.map(({ name, command, args }) => {
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
  const label = `${colours[name]}${name.padEnd(3)}${colours.reset} │ `;

  const pipe = (stream) => {
    stream.setEncoding('utf8');
    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) console.log(`${label}${line}`);
    });
  };

  pipe(child.stdout);
  pipe(child.stderr);

  child.on('exit', (code) => {
    console.log(`${label}exited with code ${code}`);
    shutdown();
  });

  return child;
});

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(0), 300);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log(`${colours.dim}Duty dev: api on :8787, dashboard on :5273${colours.reset}`);
