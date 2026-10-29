import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
  readdirSync,
  lstatSync,
  existsSync,
  unlinkSync,
} from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as bundle } from 'esbuild';
import { root } from '../app/config.js';
import { page, adminPage } from '../app/pages.js';
import { validateContent } from '../app/validation.js';
export const routes = [
  '/',
  '/weight-management',
  '/pharmacy-first',
  '/prescriptions',
  '/contact',
  '/find-us',
  '/privacy',
  '/complaints',
  '/admin',
];
export async function buildSite({
  mode = process.env.APP_MODE ?? 'demo',
  contentFile = join(root, 'content/site-content.json'),
  output = join(root, 'dist'),
  workerFile = join(dirname(output), 'build/worker.mjs'),
} = {}) {
  if (!['demo', 'test', 'live'].includes(mode))
    throw new Error('Invalid APP_MODE.');
  const raw = readFileSync(contentFile, 'utf8');
  if (Buffer.byteLength(raw) > 80000)
    throw new Error('Content exceeds the editor size limit.');
  const content = validateContent({ ...JSON.parse(raw), revision: 1 });
  mkdirSync(output, { recursive: true });
  // Remove only the two known Pages artifacts left by the previous build.
  for (const name of ['_worker.js', '_routes.json']) {
    const previous = join(output, name);
    if (existsSync(previous)) {
      if (!lstatSync(previous).isFile())
        throw new Error(`Unexpected previous build artifact: ${name}`);
      unlinkSync(previous);
    }
  }
  if (
    resolve(workerFile).startsWith(resolve(output) + '/') ||
    resolve(workerFile).startsWith(resolve(output) + '\\')
  )
    throw new Error(
      'Worker code must be built outside the public assets directory.',
    );
  for (const route of routes) {
    const folder = join(output, route.slice(1));
    mkdirSync(folder, { recursive: true });
    writeFileSync(
      join(folder, 'index.html'),
      route === '/admin' ? adminPage(mode) : page(route, content, mode),
    );
  }
  mkdirSync(join(output, 'public'), { recursive: true });
  // Explicit allowlist: neither source JSON/drafts nor legacy HTML/secrets are published.
  for (const name of [
    'site.css',
    'site.js',
    'admin.js',
    'logo.png',
    'favicon.png',
    'BMI.webp',
  ])
    copyFileSync(join(root, 'public', name), join(output, 'public', name));
  writeFileSync(
    join(output, '404.html'),
    '<!doctype html><html lang="en"><meta charset="utf-8"><title>Page not found</title><h1>Page not found</h1><a href="/">Return to Moston Pharmacy</a></html>',
  );
  mkdirSync(dirname(workerFile), { recursive: true });
  await bundle({
    entryPoints: [join(root, 'edge/worker.js')],
    outfile: workerFile,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    define: { __BUILD_MODE__: JSON.stringify(mode) },
    legalComments: 'none',
  });
  // Refuse to publish any unexpected residue rather than silently expose old build files.
  const allowed = new Set([
    'index.html',
    '404.html',
    ...routes.filter((x) => x !== '/').map((x) => x.slice(1) + '/index.html'),
    ...[
      'site.css',
      'site.js',
      'admin.js',
      'logo.png',
      'favicon.png',
      'BMI.webp',
    ].map((x) => 'public/' + x),
  ]);
  function verify(directory, prefix = '') {
    for (const entry of readdirSync(directory)) {
      const relative = prefix + entry,
        full = join(directory, entry),
        stat = lstatSync(full);
      if (stat.isSymbolicLink())
        throw new Error('Symlinks are not allowed in build output.');
      if (stat.isDirectory()) verify(full, relative + '/');
      else if (!allowed.has(relative))
        throw new Error(
          `Unexpected build output: ${relative}. Use a clean output directory.`,
        );
    }
  }
  verify(output);
  return { output, mode, workerFile };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = await buildSite();
  console.log(
    `Built static assets in ${result.output} and Worker in ${result.workerFile} (${result.mode}).`,
  );
}
