import http from 'node:http';
import {
  readFileSync,
  writeFileSync,
  existsSync,
  statSync,
  renameSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parseEnv } from 'node:util';
import { root } from '../app/config.js';
import { buildSite } from './build.js';
import { createHandler } from '../edge/worker.js';
const sha = (raw) => createHash('sha256').update(raw).digest('hex');
export async function createLocal({
  port = 4173,
  settings,
  contentFile = join(root, 'content/site-content.json'),
  output = join(root, 'dist'),
} = {}) {
  const env =
    settings ?? parseEnv(readFileSync(join(root, '.dev.vars'), 'utf8'));
  if (env.APP_MODE !== 'demo')
    throw new Error(
      'The local editor runs in non-sending demo mode only. Use hosted staging for email tests.',
    );
  await buildSite({ mode: 'demo', contentFile, output });
  const audit = [];
  let saving = false;
  env.LOCAL_CONTENT = {
    async read() {
      const raw = readFileSync(contentFile, 'utf8');
      return { ...JSON.parse(raw), revision: sha(raw) };
    },
    async history() {
      return audit.slice(0, 5);
    },
    async save(revision, content) {
      if (saving)
        throw Object.assign(
          new Error('Another save is running. Please reload.'),
          { status: 409 },
        );
      saving = true;
      try {
        const previous = readFileSync(contentFile, 'utf8');
        if (sha(previous) !== revision)
          throw Object.assign(
            new Error(
              'Content changed. Copy your edits, reload and try again.',
            ),
            { status: 409 },
          );
        const raw = JSON.stringify(content, null, 2) + '\n';
        const temporary = contentFile + '.pending';
        writeFileSync(temporary, raw);
        renameSync(temporary, contentFile);
        try {
          await buildSite({ mode: 'demo', contentFile, output });
        } catch (error) {
          writeFileSync(contentFile, previous);
          await buildSite({ mode: 'demo', contentFile, output });
          throw error;
        }
        audit.unshift({
          name: 'Matthew (local demo)',
          action: 'Updated website content locally',
          at: new Date().toISOString(),
        });
        return { ...content, revision: sha(raw) };
      } finally {
        saving = false;
      }
    },
  };
  env.ASSETS = {
    async fetch(request) {
      const pathname = decodeURIComponent(new URL(request.url).pathname);
      const target = resolve(output, '.' + pathname);
      if (
        target !== resolve(output) &&
        !target.startsWith(resolve(output) + '/') &&
        !target.startsWith(resolve(output) + '\\')
      )
        return new Response('Not found', { status: 404 });
      let file = target;
      if (existsSync(file) && statSync(file).isDirectory())
        file = join(file, 'index.html');
      if (!existsSync(file)) return new Response('Not found', { status: 404 });
      const ext = file.split('.').pop();
      const types = {
        html: 'text/html; charset=utf-8',
        css: 'text/css; charset=utf-8',
        js: 'text/javascript; charset=utf-8',
        png: 'image/png',
        webp: 'image/webp',
      };
      return new Response(
        request.method === 'HEAD' ? null : readFileSync(file),
        {
          headers: { 'Content-Type': types[ext] || 'application/octet-stream' },
        },
      );
    },
  };
  const handler = createHandler({ buildMode: 'demo' });
  const server = http.createServer(async (req, res) => {
    try {
      // Bind only loopback. Never trust the Host header to enable local editor mode.
      const origin = `http://127.0.0.1:${server.address().port}`;
      if (req.headers.host !== new URL(origin).host) {
        res.writeHead(421);
        res.end('Use ' + origin);
        return;
      }
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (v !== undefined && !['cf-connecting-ip', 'host'].includes(k))
          headers.set(k, Array.isArray(v) ? v.join(',') : v);
      }
      headers.set('CF-Connecting-IP', req.socket.remoteAddress ?? 'local');
      const request = new Request(origin + req.url, {
        method: req.method,
        headers,
        ...(!['GET', 'HEAD'].includes(req.method)
          ? { body: ReadableStream.from(req), duplex: 'half' }
          : {}),
      });
      const response = await handler(request, env);
      res.statusCode = response.status;
      for (const [key, value] of response.headers)
        if (key !== 'set-cookie') res.setHeader(key, value);
      if (response.headers.getSetCookie().length)
        res.setHeader('Set-Cookie', response.headers.getSetCookie());
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Local preview failed. Check the local server.');
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return {
    server,
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const app = await createLocal();
  console.log(
    'Moston static preview: ' +
      app.origin +
      ' (demo; no database or outgoing email)',
  );
}
