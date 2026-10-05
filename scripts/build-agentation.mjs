import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
export async function buildAgentation() {
  await build({
    absWorkingDir: fileURLToPath(new URL('../', import.meta.url)),
    entryPoints: ['dev/agentation.jsx'],
    outfile: '.runtime/agentation.js',
    bundle: true, format: 'iife', platform: 'browser', target: 'es2020',
    define: { 'process.env.NODE_ENV': '"development"' },
    sourcemap: false,
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await buildAgentation();
