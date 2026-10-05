import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildAgentation } from './build-agentation.mjs';
await buildAgentation();
const server = spawn(process.execPath, ['server.mjs'], {
  cwd: fileURLToPath(new URL('../', import.meta.url)),
  env: { ...process.env, NODE_ENV: 'development' }, stdio: 'inherit',
});
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.kill(signal));
server.on('error', error => { console.error(error); process.exitCode = 1; });
server.on('exit', code => { process.exitCode = code ?? 0; });
