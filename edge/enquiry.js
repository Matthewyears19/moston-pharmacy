import { validateForm } from '../app/validation.js';
import { json, fail, random, seal, unseal } from './utils.js';
const transport = (env) => env.FETCH ?? fetch;
export async function verifyChallenge(request, env, value, action) {
  if (
    env.LOCAL_EDITOR === 'true' &&
    new URL(request.url).hostname === '127.0.0.1'
  )
    return;
  if (!env.TURNSTILE_SECRET_KEY || !env.TURNSTILE_SITE_KEY)
    fail(
      'Spam protection has not been configured. Please contact the pharmacy directly.',
      503,
    );
  if (typeof value !== 'string' || !value || value.length > 2048)
    fail('Please complete the spam protection check.');
  let result;
  try {
    const response = await transport(env)(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: env.TURNSTILE_SECRET_KEY,
          response: value,
        }),
        signal: AbortSignal.timeout(10000),
      },
    );
    result = await response.json();
    if (!response.ok) throw new Error();
  } catch {
    fail(
      'Spam protection is unavailable. Please try again or contact the pharmacy directly.',
      503,
    );
  }
  if (
    !result.success ||
    result.hostname !== new URL(request.url).hostname ||
    result.action !== action
  )
    fail('Spam protection expired or failed. Please try again.', 400);
}
export async function formConfig(env) {
  const id = random();
  return json({
    mode: env.APP_MODE,
    siteKey: env.TURNSTILE_SITE_KEY || '',
    submissionId: id,
    csrf: await seal(
      { id, mode: env.APP_MODE },
      env.SESSION_SECRET,
      'enquiry',
      3600,
    ),
  });
}
export async function enquiry(request, env, data) {
  const challenge = data['cf-turnstile-response'];
  const fields = { ...data };
  delete fields['cf-turnstile-response'];
  const validated = validateForm('contact', fields);
  if (data.website) fail('Unable to accept this enquiry.');
  const ticket = await unseal(data.csrf, env.SESSION_SECRET, 'enquiry');
  if (
    !ticket ||
    ticket.id !== data.submissionId ||
    ticket.mode !== env.APP_MODE
  )
    fail('This form expired. Reload the page before sending.', 403);
  await verifyChallenge(request, env, challenge, 'enquiry');
  if (env.APP_MODE === 'demo')
    return json({
      message: 'Demonstration complete. Nothing has been emailed or stored.',
    });
  if (env.MAIL_MODE !== 'resend' || !env.RESEND_API_KEY || !env.MAIL_FROM)
    fail(
      'Email sending is not configured. Please phone or email the pharmacy directly.',
      503,
    );
  const recipient =
    env.APP_MODE === 'live' ? 'pharmacy.fma50@nhs.net' : env.TEST_EMAIL;
  if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient))
    fail('Test recipient is not configured.', 503);
  const text = `Basic website enquiry\n\nName: ${validated.name}\nEmail: ${validated.email}\nPhone: ${validated.phone || 'Not provided'}\n\n${validated.message}`;
  let response;
  try {
    response = await transport(env)('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + env.RESEND_API_KEY,
        'Content-Type': 'application/json',
        'Idempotency-Key': 'enquiry-' + ticket.id,
      },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to: [recipient],
        reply_to: validated.email,
        subject: 'Moston Pharmacy — basic website enquiry',
        text,
      }),
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    fail(
      'We could not confirm whether your enquiry was accepted. You can retry the unchanged message on this page, or phone/email the pharmacy. Nothing is stored for later sending.',
      503,
    );
  }
  if (!response.ok)
    fail(
      response.status === 409
        ? 'This request was already used with different details. Reload before sending a new enquiry.'
        : 'The email service could not accept your enquiry. Please retry or phone/email the pharmacy; nothing is queued for later sending.',
      503,
    );
  return json({
    message:
      env.APP_MODE === 'test'
        ? 'Test enquiry accepted by the email service for the test inbox. Inbox receipt still needs checking.'
        : 'Your enquiry was accepted by our email service. This does not confirm inbox delivery. Please phone if you need to follow up.',
  });
}
