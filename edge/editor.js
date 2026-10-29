import {
  json,
  redirect,
  random,
  digest,
  seal,
  unseal,
  cookie,
  cookieValue,
  equal,
  fail,
  encoder,
  decoder,
  b64,
  unb64,
  localRequest,
} from './utils.js';
import { validateContent } from '../app/validation.js';
export const contentPath = 'content/site-content.json';
function repoConfig(env) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPO ?? '') || !env.GITHUB_BRANCH)
    fail('The hosted staff editor has not been connected to GitHub yet.', 503);
  return `/repos/${env.GITHUB_REPO}`;
}
const transport = (env) => env.FETCH ?? fetch;
async function github(env, token, path, options = {}) {
  let response;
  try {
    response = await transport(env)('https://api.github.com' + path, {
      ...options,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer ' + token,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Moston-Pharmacy-Editor',
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    fail(
      'GitHub could not be reached. Your changes have not been confirmed; reload before retrying.',
      503,
    );
  }
  if ([409, 422].includes(response.status))
    fail(
      'The content changed, or GitHub rejected the update. Copy your edits, reload the latest version and try again.',
      409,
    );
  if (response.status === 401)
    fail('Your GitHub session has expired. Please sign in again.', 401);
  if (!response.ok)
    fail(
      'GitHub access failed. Check your repository access, app installation and branch settings.',
      response.status === 403 ? 403 : 503,
    );
  return response.json();
}
export function localEditor(request, env) {
  return (
    localRequest(request) &&
    env.LOCAL_EDITOR === 'true' &&
    Boolean(env.LOCAL_CONTENT)
  );
}
export async function startAuth(request, env) {
  repoConfig(env);
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET)
    fail('GitHub sign-in has not been configured yet.', 503);
  const state = random(),
    verifier = random(),
    origin = new URL(request.url).origin;
  const transaction = await seal(
    { state, verifier, origin },
    env.SESSION_SECRET,
    'oauth',
    600,
  );
  const target = new URL('https://github.com/login/oauth/authorize');
  target.search = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: origin + '/api/auth/callback',
    state,
    code_challenge: await digest(verifier),
    code_challenge_method: 'S256',
  }).toString();
  return redirect(target.href, {
    'Set-Cookie': cookie('moston_oauth', transaction, request, 600, 'Lax'),
  });
}
async function approvedUser(env, token) {
  const user = await github(env, token, '/user');
  const allowed = (env.GITHUB_EDITORS ?? '')
    .toLowerCase()
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  if (!allowed.includes(user.login?.toLowerCase()))
    fail('This GitHub account is not an approved pharmacy editor.', 403);
  const repository = await github(env, token, repoConfig(env));
  if (!repository.permissions?.push)
    fail('This account needs write access to the website repository.', 403);
  return { name: user.name || user.login, login: user.login };
}
export async function finishAuth(request, env) {
  const url = new URL(request.url);
  const transaction = await unseal(
    cookieValue(request, 'moston_oauth'),
    env.SESSION_SECRET,
    'oauth',
  );
  if (
    !transaction ||
    transaction.origin !== url.origin ||
    !(await equal(transaction.state, url.searchParams.get('state'))) ||
    !url.searchParams.get('code')
  )
    fail(
      'Sign-in expired or was cancelled. Return to Staff sign in and try again.',
      403,
    );
  const response = await transport(env)(
    'https://github.com/login/oauth/access_token',
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code: url.searchParams.get('code'),
        code_verifier: transaction.verifier,
        redirect_uri: url.origin + '/api/auth/callback',
      }),
      signal: AbortSignal.timeout(12000),
    },
  );
  const data = await response.json();
  if (!response.ok || typeof data.access_token !== 'string')
    fail('GitHub sign-in failed. Please start again.', 401);
  const user = await approvedUser(env, data.access_token);
  const seconds = Math.max(
    1,
    Math.min(28800, Number(data.expires_in) || 28800),
  );
  const session = await seal(
    { token: data.access_token, user, csrf: random() },
    env.SESSION_SECRET,
    'staff',
    seconds,
  );
  const result = redirect('/admin');
  result.headers.append(
    'Set-Cookie',
    cookie('moston_staff', session, request, seconds),
  );
  result.headers.append(
    'Set-Cookie',
    cookie('moston_oauth', '', request, 0, 'Lax'),
  );
  return result;
}
export async function staff(request, env) {
  const s = await unseal(
    cookieValue(request, 'moston_staff'),
    env.SESSION_SECRET,
    'staff',
  );
  if (!s) fail('Please sign in to edit the website.', 401);
  if (s.local) {
    if (!localEditor(request, env)) fail('Local editor is unavailable.', 403);
    return s;
  }
  s.user = await approvedUser(env, s.token);
  return s; // Revoked access/allowlist changes take effect on the next operation.
}
export async function localLogin(request, env, data) {
  if (!localEditor(request, env))
    fail('Use your named GitHub account to sign in.', 403);
  if (
    !env.LOCAL_STAFF_PASSWORD ||
    !(await equal(data.password, env.LOCAL_STAFF_PASSWORD))
  )
    fail('Incorrect local staff password.', 401);
  const value = await seal(
    {
      local: true,
      user: { name: 'Matthew (local demo)', login: 'local-demo' },
      csrf: random(),
    },
    env.SESSION_SECRET,
    'staff',
  );
  return json({ ok: true }, 200, {
    'Set-Cookie': cookie('moston_staff', value, request),
  });
}
export async function getContent(env, s) {
  if (s.local) return env.LOCAL_CONTENT.read();
  const file = await github(
    env,
    s.token,
    repoConfig(env) +
      '/contents/' +
      contentPath +
      '?ref=' +
      encodeURIComponent(env.GITHUB_BRANCH),
  );
  if (file.encoding !== 'base64' || file.size > 80000)
    fail('The content file is invalid.', 503);
  let data;
  try {
    data = JSON.parse(decoder.decode(unb64(file.content.replace(/\s/g, ''))));
  } catch {
    fail('The content file cannot be read.', 503);
  }
  const valid = validateContent({ ...data, revision: 1 });
  return { ...valid, revision: file.sha };
}
export async function saveContent(env, s, data) {
  if (
    typeof data.revision !== 'string' ||
    !/^[a-f0-9]{40,64}$/.test(data.revision)
  )
    fail('Reload the editor before saving.');
  const validated = validateContent({ ...data, revision: 1 });
  const content = { prices: validated.prices, news: validated.news };
  const encoded = encoder.encode(JSON.stringify(content, null, 2) + '\n');
  if (encoded.length > 80000)
    fail('The website content is too large. Shorten or archive older articles before saving.');
  if (s.local) return env.LOCAL_CONTENT.save(data.revision, content);
  const result = await github(
    env,
    s.token,
    repoConfig(env) + '/contents/' + contentPath,
    {
      method: 'PUT',
      body: JSON.stringify({
        message: `Update pharmacy prices/news (${s.user.login})`,
        content: b64(encoded),
        sha: data.revision,
        branch: env.GITHUB_BRANCH,
      }),
    },
  );
  return { ...content, revision: result.content.sha };
}
export async function history(env, s) {
  if (s.local) return env.LOCAL_CONTENT.history();
  const commits = await github(
    env,
    s.token,
    repoConfig(env) +
      '/commits?' +
      new URLSearchParams({
        path: contentPath,
        sha: env.GITHUB_BRANCH,
        per_page: '5',
      }),
  );
  return commits.map((c) => ({
    name: c.author?.login || c.commit.author.name,
    action: c.commit.message.split('\n')[0],
    at: c.commit.author.date,
  }));
}
