import {
  json,
  redirect,
  fail,
  body,
  originCheck,
  localRequest,
  random,
  equal,
  seal,
  unseal,
  cookie,
  cookieValue,
  secureHeaders,
} from './utils.js';
import { formConfig, enquiry, verifyChallenge } from './enquiry.js';
import {
  startAuth,
  finishAuth,
  staff,
  localLogin,
  localEditor,
  getContent,
  saveContent,
  history,
} from './editor.js';
const BUILD_MODE =
  typeof __BUILD_MODE__ === 'undefined' ? 'demo' : __BUILD_MODE__;
const htmlEscape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
const pages = new Set([
  '/',
  '/weight-management',
  '/pharmacy-first',
  '/prescriptions',
  '/contact',
  '/find-us',
  '/privacy',
  '/complaints',
  '/admin',
]);
const redirects = {
  '/index.html': '/',
  '/index.php': '/',
  '/Weight.html': '/weight-management',
  '/WeightLoss.html': '/weight-management',
  '/PharmacyFirst.html': '/pharmacy-first',
  '/prescription%20delivery.html': '/prescriptions',
  '/Prescription.html': '/prescriptions',
  '/Prescriptions.html': '/prescriptions',
  '/contact.html': '/contact',
  '/Contact.html': '/contact',
  '/ContactUs.html': '/contact',
  '/findus.html': '/find-us',
  '/FindUs.html': '/find-us',
  '/team.html': '/contact',
  '/MeetTheTeam.html': '/contact',
};
function previewPage(env, error = '') {
  const turnstile = env.TURNSTILE_SITE_KEY
    ? `<div class="cf-turnstile" data-sitekey="${htmlEscape(env.TURNSTILE_SITE_KEY)}" data-action="preview"></div><script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>`
    : '';
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Private preview | Moston Pharmacy</title><link rel="stylesheet" href="/preview.css"></head><body><main class="preview-login"><p class="eyebrow">MOSTON PHARMACY</p><h1>A private preview.</h1><p>Enter the viewing password to explore the website. Staff editing requires a separate sign-in.</p><form method="post" action="/preview"><label>Viewing password<input name="password" type="password" required maxlength="200" autocomplete="current-password"></label>${turnstile}<button class="button">View website <span aria-hidden="true">→</span></button>${error ? `<p role="alert">${htmlEscape(error)}</p>` : ''}</form></main></body></html>`,
    {
      status: error ? 401 : 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    },
  );
}
export function createHandler({ buildMode = BUILD_MODE } = {}) {
  const rates = new Map();
  function rate(request, group, max) {
    const now = Date.now();
    for (const [k, v] of rates) if (v.until < now) rates.delete(k);
    const key =
      group + ':' + (request.headers.get('CF-Connecting-IP') ?? 'local');
    let entry = rates.get(key);
    if (!entry) {
      if (rates.size > 10000) fail('Please try again later.', 429);
      entry = { count: 0, until: now + 900000 };
      rates.set(key, entry);
    }
    if (++entry.count > max)
      fail('Too many attempts. Please wait 15 minutes.', 429);
  }
  return async function handle(request, env) {
    let privatePage = true;
    try {
      const url = new URL(request.url),
        mode = env.APP_MODE ?? 'demo',
        gated = env.PREVIEW_ENABLED !== 'false';
      if (!['demo', 'test', 'live'].includes(mode) || mode !== buildMode)
        fail(
          'Build and runtime modes do not match. Rebuild the site with the intended APP_MODE.',
          503,
        );
      if (
        !localRequest(request) &&
        (!env.SITE_ORIGIN ||
          url.origin !== env.SITE_ORIGIN ||
          url.protocol !== 'https:')
      )
        fail('Use the configured HTTPS website address.', 421);
      if (env.SESSION_SECRET?.length < 32 || !env.SESSION_SECRET)
        fail('Private server settings are incomplete.', 503);
      if (!gated && mode !== 'live')
        fail('Preview protection must remain enabled until launch.', 503);
      if (
        mode === 'live' &&
        (env.LAUNCH_APPROVED !== 'yes' ||
          env.MAIL_MODE !== 'resend' ||
          !env.RESEND_API_KEY ||
          !env.MAIL_FROM ||
          !env.TURNSTILE_SECRET_KEY ||
          !env.TURNSTILE_SITE_KEY ||
          url.protocol !== 'https:')
      )
        fail('Live launch settings are incomplete.', 503);
      if (gated && (!env.PREVIEW_PASSWORD || env.PREVIEW_PASSWORD.length < 32))
        fail('The private preview password has not been configured.', 503);
      privatePage =
        gated ||
        mode !== 'live' ||
        url.pathname.startsWith('/api/') ||
        url.pathname === '/admin';
      const respond = (response) => {
        const result = secureHeaders(response, { privatePage });
        if (url.protocol === 'https:')
          result.headers.set('Strict-Transport-Security', 'max-age=31536000');
        return result;
      };
      if (!['GET', 'HEAD', 'POST'].includes(request.method))
        return respond(json({ error: 'Method not allowed.' }, 405));
      if (request.method === 'POST') originCheck(request);
      if (url.pathname === '/robots.txt')
        return respond(
          new Response(
            gated || mode !== 'live'
              ? 'User-agent: *\nDisallow: /\n'
              : 'User-agent: *\nDisallow: /admin\nDisallow: /api/\n',
            { headers: { 'Content-Type': 'text/plain' } },
          ),
        );
      if (url.pathname === '/preview.css' && request.method === 'GET')
        return respond(
          await env.ASSETS.fetch(new Request(url.origin + '/public/site.css')),
        );
      if (url.pathname === '/preview') {
        if (!gated) return respond(redirect('/'));
        if (request.method === 'GET') return respond(previewPage(env));
        if (request.method === 'POST') {
          rate(request, 'view', 8);
          const data = await body(request, 5000);
          await verifyChallenge(
            request,
            env,
            data['cf-turnstile-response'],
            'preview',
          );
          if (!(await equal(data.password, env.PREVIEW_PASSWORD)))
            return respond(previewPage(env, 'Incorrect viewing password.'));
          return respond(
            redirect('/', {
              'Set-Cookie': cookie(
                'moston_preview',
                await seal({ view: true }, env.PREVIEW_PASSWORD, 'view'),
                request,
                28800,
                'Lax',
              ),
            }),
          );
        }
      }
      if (
        gated &&
        !(await unseal(
          cookieValue(request, 'moston_preview'),
          env.PREVIEW_PASSWORD,
          'view',
        ))
      )
        return respond(
          request.method === 'GET' && !url.pathname.startsWith('/api/')
            ? redirect('/preview')
            : json({ error: 'Enter the viewing password first.' }, 401),
        );
      if (url.pathname === '/preview/exit' && request.method === 'POST') {
        const result = redirect('/preview');
        for (const name of ['moston_preview', 'moston_staff', 'moston_oauth'])
          result.headers.append('Set-Cookie', cookie(name, '', request, 0));
        return respond(result);
      }
      if (url.pathname === '/api/form-config' && request.method === 'GET')
        return respond(await formConfig({ ...env, APP_MODE: mode }));
      if (
        url.pathname.startsWith('/api/forms/') &&
        url.pathname !== '/api/forms/contact'
      )
        return respond(
          json(
            {
              error:
                'Please phone or email the pharmacy directly for prescription matters.',
            },
            410,
          ),
        );
      if (url.pathname === '/api/forms/contact' && request.method === 'POST') {
        rate(request, 'form', 12);
        return respond(
          await enquiry(
            request,
            { ...env, APP_MODE: mode },
            await body(request, 15000),
          ),
        );
      }
      if (url.pathname === '/api/editor-config' && request.method === 'GET')
        return respond(
          json({
            local: localEditor(request, env),
            configured:
              localEditor(request, env) ||
              Boolean(
                env.GITHUB_CLIENT_ID &&
                  env.GITHUB_CLIENT_SECRET &&
                  env.GITHUB_EDITORS,
              ),
          }),
        );
      if (url.pathname === '/api/auth/start' && request.method === 'GET')
        return respond(await startAuth(request, env));
      if (url.pathname === '/api/auth/callback' && request.method === 'GET')
        return respond(await finishAuth(request, env));
      if (url.pathname === '/api/login' && request.method === 'POST') {
        rate(request, 'staff', 8);
        return respond(
          await localLogin(request, env, await body(request, 5000)),
        );
      }
      if (
        ['/api/admin', '/api/content', '/api/logout'].includes(url.pathname)
      ) {
        const s = await staff(request, env);
        if (
          request.method === 'POST' &&
          !(await equal(request.headers.get('X-CSRF-Token'), s.csrf))
        )
          fail('Please reload the editor and try again.', 403);
        if (url.pathname === '/api/logout' && request.method === 'POST')
          return respond(
            json({ ok: true }, 200, {
              'Set-Cookie': cookie('moston_staff', '', request, 0),
            }),
          );
        if (url.pathname === '/api/admin' && request.method === 'GET')
          return respond(
            json({
              user: s.user,
              csrf: s.csrf,
              content: await getContent(env, s),
              audit: await history(env, s),
              local: Boolean(s.local),
            }),
          );
        if (url.pathname === '/api/content' && request.method === 'POST')
          return respond(json(await saveContent(env, s, await body(request))));
        return respond(json({ error: 'Method not allowed.' }, 405));
      }
      if (request.method === 'GET' || request.method === 'HEAD') {
        if (redirects[url.pathname])
          return respond(redirect(redirects[url.pathname]));
        const clean =
          url.pathname.length > 1
            ? url.pathname.replace(/\/$/, '')
            : url.pathname;
        if (pages.has(clean)) {
          const asset = new URL(request.url);
          asset.pathname =
            clean === '/' ? '/index.html' : clean + '/index.html';
          asset.search = '';
          return respond(await env.ASSETS.fetch(new Request(asset, request)));
        }
        if (/^\/public\/[a-zA-Z0-9_.-]+$/.test(clean))
          return respond(await env.ASSETS.fetch(request));
      }
      return respond(json({ error: 'Page not found.' }, 404));
    } catch (error) {
      return secureHeaders(
        json(
          {
            error: error.status
              ? error.message
              : 'Something went wrong. Please try again or contact the pharmacy.',
          },
          error.status ?? 500,
        ),
        { privatePage: true },
      );
    }
  };
}
export default { fetch: createHandler() };
