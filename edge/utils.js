// Web-standard helpers shared by Cloudflare and the local preview. No database.
export const encoder = new TextEncoder();
export const decoder = new TextDecoder();
export function fail(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}
export const json = (value, status = 200, headers = {}) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
export const redirect = (path, headers = {}) =>
  new Response(null, {
    status: 303,
    headers: { Location: path, 'Cache-Control': 'no-store', ...headers },
  });
export const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
export const unb64 = (value) =>
  Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
export const url64 = (bytes) =>
  b64(bytes).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
export const random = () => url64(crypto.getRandomValues(new Uint8Array(32)));
export async function digest(value) {
  return url64(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', encoder.encode(value)),
    ),
  );
}
export async function equal(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = await digest(a),
    y = await digest(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}
async function key(secret, purpose) {
  if (typeof secret !== 'string' || secret.length < 32)
    fail('Private server settings are incomplete.', 503);
  return crypto.subtle.importKey(
    'raw',
    await crypto.subtle.digest(
      'SHA-256',
      encoder.encode(purpose + ':' + secret),
    ),
    'AES-GCM',
    false,
    ['encrypt', 'decrypt'],
  );
}
export async function seal(value, secret, purpose, seconds = 28800) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await key(secret, purpose),
    encoder.encode(
      JSON.stringify({ ...value, exp: Date.now() + seconds * 1000 }),
    ),
  );
  return b64(iv) + '.' + b64(new Uint8Array(bytes));
}
export async function unseal(value, secret, purpose) {
  try {
    if (!value || value.length > 6000) return null;
    const [iv, body] = value.split('.');
    const bytes = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: unb64(iv) },
      await key(secret, purpose),
      unb64(body),
    );
    const data = JSON.parse(decoder.decode(bytes));
    return data.exp > Date.now() && data.exp <= Date.now() + 28801000
      ? data
      : null;
  } catch {
    return null;
  }
}
export const cookieValue = (request, name) =>
  (request.headers.get('Cookie') ?? '')
    .split(';')
    .map((x) => x.trim())
    .find((x) => x.startsWith(name + '='))
    ?.slice(name.length + 1);
export function cookie(
  name,
  value,
  request,
  seconds = 28800,
  sameSite = 'Strict',
) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=${seconds}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}
export function originCheck(request) {
  if (request.headers.get('Origin') !== new URL(request.url).origin)
    fail('Please submit from this website.', 403);
}
export async function body(request, max = 80000) {
  const type = request.headers.get('Content-Type') ?? '';
  if (
    !type.startsWith('application/json') &&
    !type.startsWith('application/x-www-form-urlencoded')
  )
    fail('Unsupported request format.', 415);
  if (Number(request.headers.get('Content-Length') ?? 0) > max)
    fail('Request too large.', 413);
  const reader = request.body?.getReader();
  if (!reader) fail('Empty request.');
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) {
        await reader.cancel();
        fail('Request too large.', 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const raw = decoder.decode(bytes);
    const data = type.startsWith('application/json')
      ? JSON.parse(raw)
      : Object.fromEntries(new URLSearchParams(raw));
    if (!data || typeof data !== 'object' || Array.isArray(data))
      throw new Error();
    return data;
  } catch {
    fail('Invalid request.');
  }
}
export const localRequest = (request) =>
  ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(request.url).hostname);
export function secureHeaders(response, { privatePage = true } = {}) {
  const result = new Response(response.body, response);
  const h = result.headers;
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set('X-Frame-Options', 'DENY');
  h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  h.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self'; img-src 'self' data:; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  );
  if (privatePage) {
    h.set('Cache-Control', 'private, no-store');
    h.set('X-Robots-Tag', 'noindex, nofollow');
  }
  return result;
}

