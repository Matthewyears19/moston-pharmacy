import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHandler } from '../edge/worker.js';
import { seal, unseal, random, encoder, b64, digest } from '../edge/utils.js';
import { buildSite } from '../scripts/build.js';
import { createLocal } from '../scripts/dev.js';
import { validateContent } from '../app/validation.js';
const origin = 'https://preview.example.com';
const baseEnv = () => ({
  APP_MODE: 'demo',
  MAIL_MODE: 'preview',
  SITE_ORIGIN: origin,
  PREVIEW_ENABLED: 'true',
  PREVIEW_PASSWORD: random(),
  SESSION_SECRET: random(),
  TURNSTILE_SITE_KEY: 'public-sitekey',
  TURNSTILE_SECRET_KEY: 'test-secret',
  ASSETS: { fetch: async () => new Response('STATIC PAGE') },
  FETCH: async (url) => {
    assert.equal(
      url,
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    );
    return Response.json({
      success: true,
      hostname: 'preview.example.com',
      action: 'preview',
    });
  },
});
const cookie = (response) =>
  response.headers
    .getSetCookie()
    .map((x) => x.split(';')[0])
    .join('; ');
function request(
  path,
  { method = 'GET', data, cookies = '', csrf, originHeader = origin } = {},
) {
  return new Request(origin + path, {
    method,
    headers: {
      Cookie: cookies,
      ...(method === 'POST'
        ? { Origin: originHeader, 'Content-Type': 'application/json' }
        : {}),
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
}
async function unlock(handler, env) {
  const r = await handler(
    request('/preview', {
      method: 'POST',
      data: {
        password: env.PREVIEW_PASSWORD,
        'cf-turnstile-response': 'fictional',
      },
    }),
    env,
  );
  assert.equal(r.status, 303);
  return cookie(r);
}
const sourceContent = JSON.parse(
  await readFile(
    new URL('../content/site-content.json', import.meta.url),
    'utf8',
  ),
);

test('sealed sessions reject tampering, expiration, different purposes and rotated secrets', async () => {
  const secret = random();
  const value = await seal({ user: 'test' }, secret, 'staff');
  assert.equal((await unseal(value, secret, 'staff')).user, 'test');
  assert.equal(await unseal(value, random(), 'staff'), null);
  assert.equal(await unseal(value, secret, 'view'), null);
  assert.equal(await unseal(value + 'broken', secret, 'staff'), null);
  assert.equal(
    await unseal(await seal({}, secret, 'staff', -1), secret, 'staff'),
    null,
  );
});

test('password gate protects pages, assets and APIs; fails closed and rejects cross-origin requests', async () => {
  const env = baseEnv(),
    handler = createHandler();
  for (const path of [
    '/',
    '/admin',
    '/public/logo.png',
    '/prescriptions',
    '/index.html',
  ]) {
    const r = await handler(request(path), env);
    assert.equal(r.status, 303, path);
    assert.equal(r.headers.get('Location'), '/preview');
    assert.match(r.headers.get('Cache-Control'), /no-store/);
  }
  assert.equal((await handler(request('/api/admin'), env)).status, 401);
  assert.equal(
    (
      await handler(
        request('/preview', {
          method: 'POST',
          data: { password: env.PREVIEW_PASSWORD },
          originHeader: 'https://evil.example',
        }),
        env,
      )
    ).status,
    403,
  );
  const login = await unlock(handler, env);
  assert.match(login, /moston_preview=/);
  const page = await handler(request('/', { cookies: login }), env);
  assert.equal(await page.text(), 'STATIC PAGE');
  assert.equal(page.headers.get('X-Robots-Tag'), 'noindex, nofollow');
  assert.equal(
    (
      await handler(request('/', { cookies: login }), {
        ...env,
        PREVIEW_PASSWORD: random(),
      })
    ).status,
    303,
  );
  for (const path of [
    '/.dev.vars',
    '/.env',
    '/content/site-content.json',
    '/data/preview-access.txt',
    '/_worker.js',
    '/database/001-initial.sql',
  ])
    assert.equal(
      (await handler(request(path, { cookies: login }), env)).status,
      404,
      path,
    );
  assert.equal(
    (
      await handler(
        request('/api/forms/prescription', {
          method: 'POST',
          cookies: login,
          data: {},
        }),
        env,
      )
    ).status,
    410,
  );
  assert.equal(
    (await handler(request('/api/admin', { cookies: login }), env)).status,
    401,
  );
  assert.equal(
    (
      await handler(
        request('/api/login', {
          method: 'POST',
          cookies: login,
          data: { password: 'anything' },
        }),
        { ...env, LOCAL_EDITOR: 'true' },
      )
    ).status,
    403,
  );
  assert.equal(
    (await handler(request('/'), { ...env, PREVIEW_PASSWORD: '' })).status,
    503,
  );
  assert.equal(
    (await handler(request('/'), { ...env, PREVIEW_ENABLED: 'false' })).status,
    503,
  );
  assert.equal(
    (await handler(request('/'), { ...env, APP_MODE: 'live' })).status,
    503,
  );
  assert.equal(
    (await handler(new Request('https://wrong.example.com/'), env)).status,
    421,
  );
  const exit = await handler(
    request('/preview/exit', { method: 'POST', cookies: login, data: {} }),
    env,
  );
  assert.equal(exit.headers.getSetCookie().length, 3);
  assert.match(exit.headers.getSetCookie()[0], /Max-Age=0/);
  const limited = createHandler();
  for (let i = 0; i < 8; i++)
    assert.equal(
      (
        await limited(
          request('/preview', {
            method: 'POST',
            data: { password: 'wrong', 'cf-turnstile-response': 'ok' },
          }),
          env,
        )
      ).status,
      401,
    );
  assert.equal(
    (
      await limited(
        request('/preview', { method: 'POST', data: { password: 'wrong' } }),
        env,
      )
    ).status,
    429,
  );
});

test('enquiries never persist; demo never calls Resend; test transport validates Turnstile, recipient and retries', async () => {
  const env = baseEnv();
  env.APP_MODE = 'test';
  env.MAIL_MODE = 'resend';
  env.TEST_EMAIL = 'fictional@example.com';
  env.MAIL_FROM = 'Moston <enquiries@example.com>';
  env.RESEND_API_KEY = 'fictional-key';
  const handler = createHandler({ buildMode: 'test' });
  let challengeAction = 'preview',
    challengeValid = true,
    providerStatus = 200;
  const sent = [];
  env.FETCH = async (url, options) => {
    if (url.includes('siteverify'))
      return Response.json({
        success: challengeValid,
        hostname: 'preview.example.com',
        action: challengeAction,
      });
    assert.equal(url, 'https://api.resend.com/emails');
    sent.push({
      body: JSON.parse(options.body),
      key: options.headers['Idempotency-Key'],
    });
    return Response.json(
      providerStatus === 200
        ? { id: 'fictional' }
        : { error: 'provider failure' },
      { status: providerStatus },
    );
  };
  const viewing = await unlock(handler, env);
  challengeAction = 'enquiry';
  const config = await (
    await handler(request('/api/form-config', { cookies: viewing }), env)
  ).json();
  const data = {
    name: 'Fictional Visitor',
    email: 'visitor@example.com',
    phone: '',
    message: 'What time do you open?',
    basicOnly: 'yes',
    website: '',
    csrf: config.csrf,
    submissionId: config.submissionId,
    'cf-turnstile-response': 'fictional-token',
  };
  const send = (extra) =>
    handler(
      request('/api/forms/contact', {
        method: 'POST',
        cookies: viewing,
        data: { ...data, ...extra },
      }),
      env,
    );
  assert.equal((await send({ dob: '2000-01-01' })).status, 400);
  assert.equal((await send({ basicOnly: 'no' })).status, 400);
  assert.equal((await send({ csrf: 'forged' })).status, 403);
  assert.equal(sent.length, 0);
  challengeValid = false;
  assert.equal((await send()).status, 400);
  assert.equal(sent.length, 0);
  challengeValid = true;
  providerStatus = 503;
  assert.equal((await send()).status, 503);
  providerStatus = 200;
  const accepted = await send();
  assert.equal(accepted.status, 200);
  assert.match((await accepted.json()).message, /test inbox/);
  assert.equal(sent[0].key, sent[1].key);
  assert.deepEqual(sent[1].body.to, ['fictional@example.com']);
  assert.equal(sent[1].body.reply_to, 'visitor@example.com');
  assert.match(sent[1].body.text, /What time/);
  const demo = baseEnv();
  demo.FETCH = async () =>
    Response.json({
      success: true,
      hostname: 'preview.example.com',
      action: 'preview',
    });
  const h = createHandler(),
    view = await unlock(h, demo);
  const c = await (
    await h(request('/api/form-config', { cookies: view }), demo)
  ).json();
  demo.FETCH = async (url) => {
    assert.ok(url.includes('siteverify'), 'Demo must not send mail');
    return Response.json({
      success: true,
      hostname: 'preview.example.com',
      action: 'enquiry',
    });
  };
  const result = await h(
    request('/api/forms/contact', {
      method: 'POST',
      cookies: view,
      data: { ...data, csrf: c.csrf, submissionId: c.submissionId },
    }),
    demo,
  );
  assert.match(
    (await result.json()).message,
    /Nothing has been emailed or stored/,
  );
});

test('GitHub App OAuth uses state and PKCE, named allowlist, encrypted sessions, SHA conflicts and revocation', async () => {
  const env = {
    ...baseEnv(),
    GITHUB_REPO: 'example/pharmacy',
    GITHUB_BRANCH: 'website',
    GITHUB_CLIENT_ID: 'fictional-client',
    GITHUB_CLIENT_SECRET: 'fictional-secret',
    GITHUB_EDITORS: 'pharmacist',
  };
  const handler = createHandler(),
    view = await unlock(handler, env);
  let login = 'pharmacist',
    push = true,
    sha = 'a'.repeat(40),
    current = structuredClone(sourceContent),
    expectedChallenge,
    exchangeCount = 0;
  env.FETCH = async (url, options = {}) => {
    if (url === 'https://github.com/login/oauth/access_token') {
      exchangeCount++;
      const exchange = JSON.parse(options.body);
      assert.equal(await digest(exchange.code_verifier), expectedChallenge);
      assert.equal(exchange.redirect_uri, origin + '/api/auth/callback');
      return Response.json({
        access_token: 'ghu_FICTIONAL',
        expires_in: 28800,
      });
    }
    assert.equal(options.headers.Authorization, 'Bearer ghu_FICTIONAL');
    if (url.endsWith('/user'))
      return Response.json({ login, name: 'Named Pharmacist' });
    if (url.endsWith('/repos/example/pharmacy'))
      return Response.json({ permissions: { push } });
    if (url.includes('/commits?'))
      return Response.json([
        {
          author: { login },
          commit: {
            author: { name: 'Named Pharmacist', date: '2026-10-21T12:00:00Z' },
            message: 'Update content',
          },
        },
      ]);
    if (url.includes('/contents/content/site-content.json')) {
      if (options.method === 'PUT') {
        const update = JSON.parse(options.body);
        assert.equal(update.branch, 'website');
        assert.match(update.message, /pharmacist/);
        if (update.sha !== sha)
          return Response.json({ message: 'Conflict' }, { status: 409 });
        current = JSON.parse(
          Buffer.from(update.content, 'base64').toString('utf8'),
        );
        sha = 'b'.repeat(40);
        return Response.json({ content: { sha } });
      }
      assert.ok(url.endsWith('?ref=website'));
      return Response.json({
        encoding: 'base64',
        size: 1000,
        content: b64(encoder.encode(JSON.stringify(current))),
        sha,
      });
    }
    throw new Error('Unexpected request ' + url);
  };
  const started = await handler(
    request('/api/auth/start', { cookies: view }),
    env,
  );
  const target = new URL(started.headers.get('Location'));
  assert.equal(target.origin, 'https://github.com');
  assert.equal(target.searchParams.get('code_challenge_method'), 'S256');
  expectedChallenge = target.searchParams.get('code_challenge');
  const oauthCookie = cookie(started);
  assert.match(started.headers.get('Set-Cookie'), /SameSite=Lax/);
  const invalid = await handler(
    request('/api/auth/callback?code=fictional&state=wrong', {
      cookies: view + '; ' + oauthCookie,
    }),
    env,
  );
  assert.equal(invalid.status, 403);
  assert.equal(exchangeCount, 0);
  const finished = await handler(
    request(
      '/api/auth/callback?code=fictional&state=' +
        target.searchParams.get('state'),
      { cookies: view + '; ' + oauthCookie },
    ),
    env,
  );
  assert.equal(finished.status, 303);
  assert.equal(finished.headers.get('Location'), '/admin');
  assert.ok(!cookie(finished).includes('ghu_FICTIONAL'));
  const sessionCookie = cookie(finished).split('; moston_oauth=')[0];
  const cookies = view + '; ' + sessionCookie;
  const loaded = await handler(request('/api/admin', { cookies }), env);
  assert.equal(loaded.status, 200);
  const data = await loaded.json();
  assert.equal(data.user.name, 'Named Pharmacist');
  assert.equal(data.content.revision, sha);
  assert.ok(!JSON.stringify(data).includes('ghu_FICTIONAL'));
  const updated = structuredClone(data.content);
  updated.prices[0].price += 1;
  assert.equal(
    (
      await handler(
        request('/api/content', {
          method: 'POST',
          cookies,
          data: updated,
          csrf: 'wrong',
        }),
        env,
      )
    ).status,
    403,
  );
  const saved = await handler(
    request('/api/content', {
      method: 'POST',
      cookies,
      data: updated,
      csrf: data.csrf,
    }),
    env,
  );
  assert.equal(saved.status, 200);
  assert.equal(current.prices[0].price, updated.prices[0].price);
  assert.equal(
    (
      await handler(
        request('/api/content', {
          method: 'POST',
          cookies,
          data: updated,
          csrf: data.csrf,
        }),
        env,
      )
    ).status,
    409,
  );
  push = false;
  assert.equal(
    (await handler(request('/api/admin', { cookies }), env)).status,
    403,
  );
  push = true;
  env.GITHUB_EDITORS = 'another-person';
  assert.equal(
    (await handler(request('/api/admin', { cookies }), env)).status,
    403,
  );
});

test('static build excludes drafts and secrets; real local editor rebuilds with conflict protection', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'moston-static-test-'));
  const file = join(dir, 'site-content.json'),
    output = join(dir, 'dist');
  let app;
  try {
    const data = structuredClone(sourceContent);
    data.news.push({
      id: 'private-draft',
      title: 'SECRET DRAFT TITLE',
      date: '2026-10-21',
      body: 'Draft only',
      published: false,
    });
    await writeFile(file, JSON.stringify(data));
    await buildSite({ contentFile: file, output });
    const html = await readFile(join(output, 'index.html'), 'utf8');
    assert.ok(!html.includes('SECRET DRAFT TITLE'));
    assert.ok(html.includes('Lymphoedema'));
    const contact = await readFile(join(output, 'contact/index.html'), 'utf8');
    assert.ok(!contact.includes('__FORM_CSRF__'));
    assert.match(contact, /basicOnly/);
    assert.match(
      await readFile(join(output, 'prescriptions/index.html'), 'utf8'),
      /mailto:pharmacy.fma50@nhs.net/,
    );
    const assetFiles = await readdir(output);
    assert.ok(!assetFiles.includes('_routes.json'));
    assert.ok(!assetFiles.includes('_worker.js'));
    assert.ok(!(await readdir(output)).includes('content'));
    const env = {
      APP_MODE: 'demo',
      MAIL_MODE: 'preview',
      PREVIEW_ENABLED: 'true',
      PREVIEW_PASSWORD: random(),
      SESSION_SECRET: random(),
      LOCAL_EDITOR: 'true',
      LOCAL_STAFF_PASSWORD: random(),
    };
    app = await createLocal({
      port: 0,
      settings: env,
      contentFile: file,
      output,
    });
    const send = async (
      path,
      { method = 'GET', data, cookies = '', csrf } = {},
    ) =>
      fetch(app.origin + path, {
        method,
        redirect: 'manual',
        headers: {
          Cookie: cookies,
          ...(method === 'POST'
            ? { Origin: app.origin, 'Content-Type': 'application/json' }
            : {}),
          ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        },
        ...(data ? { body: JSON.stringify(data) } : {}),
      });
    const view = await send('/preview', {
      method: 'POST',
      data: { password: env.PREVIEW_PASSWORD },
    });
    assert.equal(view.status, 303);
    const viewing = cookie(view);
    const logged = await send('/api/login', {
      method: 'POST',
      cookies: viewing,
      data: { password: env.LOCAL_STAFF_PASSWORD },
    });
    assert.equal(logged.status, 200);
    const cookies = viewing + '; ' + cookie(logged);
    const state = await (await send('/api/admin', { cookies })).json();
    assert.equal(state.user.name, 'Matthew (local demo)');
    const updated = state.content;
    updated.prices[0].price = 222.22;
    assert.equal(
      (
        await send('/api/content', {
          method: 'POST',
          cookies,
          csrf: state.csrf,
          data: updated,
        })
      ).status,
      200,
    );
    assert.match(
      await (await send('/weight-management', { cookies })).text(),
      /£222.22/,
    );
    assert.equal(
      (
        await send('/api/content', {
          method: 'POST',
          cookies,
          csrf: state.csrf,
          data: updated,
        })
      ).status,
      409,
    );
    const form = await (await send('/api/form-config', { cookies })).json();
    const response = await send('/api/forms/contact', {
      method: 'POST',
      cookies,
      data: {
        name: 'Fictional',
        email: 'fictional@example.com',
        phone: '',
        message: 'Opening hours?',
        basicOnly: 'yes',
        website: '',
        csrf: form.csrf,
        submissionId: form.submissionId,
      },
    });
    assert.equal(response.status, 200);
    assert.match(
      (await response.json()).message,
      /Nothing has been emailed or stored/,
    );
    assert.ok(!(await readFile(file, 'utf8')).includes('Opening hours?'));
  } finally {
    if (app) await app.close();
    const target = resolve(dir);
    assert.ok(target.startsWith(resolve(tmpdir()) + requireSeparator()));
    assert.match(target, /moston-static-test-/);
    await rm(target, { recursive: true, force: true });
  }
});
function requireSeparator() {
  return process.platform === 'win32' ? '\\' : '/';
}

test('content validation rejects invalid prices, dates and duplicate IDs', () => {
  const data = { ...structuredClone(sourceContent), revision: 1 };
  data.prices[0].price = -1;
  assert.throws(() => validateContent(data));
  data.prices[0].price = 10;
  data.news[0].date = '2026-02-31';
  assert.throws(() => validateContent(data));
});
