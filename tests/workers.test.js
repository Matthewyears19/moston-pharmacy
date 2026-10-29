import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { unstable_dev } from 'wrangler';
import { buildSite } from '../scripts/build.js';
import { random } from '../edge/utils.js';

// Exercises Cloudflare's actual asset router and workerd, not a mocked ASSETS binding.
test(
  'Workers runtime gates assets before serving them and resolves HTML/API routes safely',
  { timeout: 120000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'moston-workers-test-'));
    let worker;
    try {
      const { output, workerFile } = await buildSite({
        output: join(directory, 'dist'),
      });
      const original = await readFile(
        new URL('../wrangler.toml', import.meta.url),
        'utf8',
      );
      const quote = (value) => JSON.stringify(value.replaceAll('\\', '/'));
      const config = original
        .replace(/^main = .*$/m, 'main = ' + quote(workerFile))
        .replace(/^directory = .*$/m, 'directory = ' + quote(output));
      await writeFile(join(directory, 'wrangler.toml'), config);
      const password = random();
      await writeFile(
        join(directory, '.dev.vars'),
        [
          'APP_MODE=demo',
          'MAIL_MODE=preview',
          'PREVIEW_ENABLED=true',
          'LOCAL_EDITOR=true',
          'PREVIEW_PASSWORD=' + password,
          'SESSION_SECRET=' + random(),
        ].join('\n'),
      );
      worker = await unstable_dev(workerFile, {
        config: join(directory, 'wrangler.toml'),
        local: true,
        ip: '127.0.0.1',
        port: 0,
        inspectorPort: 0,
        logLevel: 'none',
        persist: false,
        experimental: {
          watch: false,
          disableDevRegistry: true,
          disableExperimentalWarning: true,
        },
      });
      const origin = `http://127.0.0.1:${worker.port}`;
      const send = (path, options = {}) =>
        fetch(origin + path, { redirect: 'manual', ...options });
      for (const path of [
        '/',
        '/weight-management',
        '/public/site.css',
        '/public/logo.png',
        '/index.html',
        '/admin/index.html',
      ]) {
        const response = await send(path);
        assert.equal(response.status, 303, path);
        assert.equal(response.headers.get('Location'), '/preview');
        assert.match(response.headers.get('Cache-Control'), /no-store/);
      }
      assert.equal((await send('/api/admin')).status, 401);
      const gate = await send('/preview');
      assert.equal(gate.status, 200);
      assert.match(await gate.text(), /A private preview/);
      const login = await send('/preview', {
        method: 'POST',
        headers: {
          Origin: origin,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ password }),
      });
      assert.equal(login.status, 303);
      const cookie = login.headers.get('Set-Cookie').split(';')[0];
      const unlocked = (path, options = {}) =>
        send(path, {
          ...options,
          headers: { Cookie: cookie, ...options.headers },
        });
      for (const path of [
        '/',
        '/weight-management',
        '/prescriptions',
        '/contact',
        '/admin',
        '/find-us/',
      ]) {
        const response = await unlocked(path);
        assert.equal(response.status, 200, path);
        assert.match(response.headers.get('Content-Type'), /text\/html/);
        assert.match(await response.text(), /Moston Pharmacy/);
      }
      const css = await unlocked('/public/site.css');
      assert.equal(css.status, 200);
      assert.match(css.headers.get('Content-Type'), /text\/css/);
      assert.equal((await unlocked('/public/logo.png')).status, 200);
      const legacy = await unlocked('/Weight.html');
      assert.equal(legacy.status, 303);
      assert.equal(legacy.headers.get('Location'), '/weight-management');
      for (const path of [
        '/build/worker.mjs',
        '/_worker.js',
        '/_routes.json',
        '/.dev.vars',
        '/content/site-content.json',
        '/admin/index.html',
      ])
        assert.equal((await unlocked(path)).status, 404, path);
      assert.equal((await unlocked('/api/admin')).status, 401);
      const configResponse = await unlocked('/api/form-config');
      assert.equal(configResponse.status, 200);
      const form = await configResponse.json();
      const enquiry = await unlocked('/api/forms/contact', {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Fictional Worker Test',
          email: 'fictional@example.com',
          phone: '',
          message: 'Opening hours?',
          basicOnly: 'yes',
          website: '',
          csrf: form.csrf,
          submissionId: form.submissionId,
        }),
      });
      assert.equal(enquiry.status, 200);
      assert.match(
        (await enquiry.json()).message,
        /Nothing has been emailed or stored/,
      );
      assert.equal(
        (
          await unlocked('/api/forms/prescription', {
            method: 'POST',
            headers: { Origin: origin, 'Content-Type': 'application/json' },
            body: '{}',
          })
        ).status,
        410,
      );
    } finally {
      if (worker) await worker.stop();
      const target = resolve(directory);
      assert.ok(target.startsWith(resolve(tmpdir()) + sep));
      assert.match(target, /moston-workers-test-/);
      await rm(target, { recursive: true, force: true });
    }
  },
);
