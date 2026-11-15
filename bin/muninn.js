#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { exec } from 'node:child_process';
import { createServer } from '../src/server.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const HELP = `muninn ${pkg.version}

Usage:
  muninn serve [--port 8080] [--open]   Serve the display and relay recognition requests
  muninn eval <folder>                  Run the recognition hit-rate check on a folder of clips
  muninn --help | --version

\`eval\` reads its credentials from the environment or .env:
  RECOGNITION_PROVIDER=audd (default) with RECOGNITION_API_TOKEN, or
  RECOGNITION_PROVIDER=acrcloud with ACRCLOUD_HOST, ACRCLOUD_ACCESS_KEY, ACRCLOUD_ACCESS_SECRET.
The display keeps its own credentials in the browser. Nothing is written to disk.
`;

function loadDotEnv() {
  try {
    for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
      const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
    }
  } catch { /* no .env, fine */ }
}

function flag(args, name) {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
}

const [command = '--help', ...args] = process.argv.slice(2);

if (command === '--help' || command === '-h' || command === 'help') {
  console.log(HELP);
} else if (command === '--version' || command === '-v') {
  console.log(pkg.version);
} else if (command === 'serve') {
  const port = Number(flag(args, '--port') ?? 8080);
  const server = createServer();
  server.listen(port, '127.0.0.1', () => {
    const url = `http://localhost:${port}/`;
    console.log(`muninn is running at ${url}`);
    if (args.includes('--open')) exec(`${process.platform === 'darwin' ? 'open' : 'xdg-open'} ${url}`);
  });
} else if (command === 'eval') {
  const dir = args[0];
  loadDotEnv();
  if (!dir) { console.error('Usage: muninn eval <folder>'); process.exit(2); }
  const env = process.env;
  const settings = { provider: env.RECOGNITION_PROVIDER, token: env.RECOGNITION_API_TOKEN, acrHost: env.ACRCLOUD_HOST, acrKey: env.ACRCLOUD_ACCESS_KEY, acrSecret: env.ACRCLOUD_ACCESS_SECRET };
  const { createRecognizer, isConfigured } = await import('../web/providers.js');
  if (!isConfigured(settings)) { console.error('Credentials are missing for the chosen provider. See muninn --help.'); process.exit(2); }
  const { evaluate } = await import('../src/evaluate.js');
  await evaluate({ dir, recognizer: createRecognizer(settings) });
} else {
  console.error(`Unknown command: ${command}\n\n${HELP}`);
  process.exit(2);
}
