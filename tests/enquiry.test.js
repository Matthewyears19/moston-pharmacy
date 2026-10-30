import test from 'node:test';
import assert from 'node:assert/strict';
import { enquiry, formConfig } from '../edge/enquiry.js';
import { random } from '../edge/utils.js';
import { page } from '../app/pages.js';

async function fixture(mode = 'test') {
  const calls = [];
  const env = {
    APP_MODE: mode,
    MAIL_MODE: 'resend',
    SESSION_SECRET: random(),
    TURNSTILE_SITE_KEY: 'fictional-public',
    TURNSTILE_SECRET_KEY: 'fictional-secret',
    RESEND_API_KEY: 'fictional-key',
    MAIL_FROM: 'Moston <enquiries@example.com>',
    FETCH: async (url, options) => {
      if (url.includes('siteverify')) return Response.json({
        success: true, hostname: 'preview.example.com', action: 'enquiry',
      });
      calls.push({ key: options.headers['Idempotency-Key'], body: JSON.parse(options.body) });
      const confirmation = calls.at(-1).key.startsWith('enquiry-confirmation-');
      if (confirmation && env.confirmationThrows) throw new Error('network timeout');
      return Response.json({ id: 'fictional' }, {
        status: confirmation ? (env.confirmationStatus ?? 200) : (env.enquiryStatus ?? 200),
      });
    },
  };
  const config = await (await formConfig(env)).json();
  const data = {
    name: 'Fictional Visitor', email: 'visitor@example.com',
    phone: '01270 000000', message: 'Please call me back.', callback: 'yes',
    basicOnly: 'yes', website: '', csrf: config.csrf, submissionId: config.submissionId,
    'cf-turnstile-response': 'fictional-token',
  };
  const send = (extra = {}) => enquiry(new Request('https://preview.example.com/api/forms/contact'), env, { ...data, ...extra });
  return { env, calls, data, send };
}

test('test enquiries and confirmations default to the testing Gmail, without sending to visitors or NHS', async () => {
  const { calls, send } = await fixture();
  assert.equal((await send()).status, 200);
  assert.equal(calls.length, 2);
  for (const call of calls) assert.deepEqual(call.body.to, ['pharmacy.testing19@gmail.com']);
  assert.match(calls[0].body.text, /Callback requested: Yes/);
  assert.equal(calls[0].body.reply_to, 'visitor@example.com');
  assert.notEqual(calls[0].key, calls[1].key);
  assert.match(calls[1].body.text, /TEST CONFIRMATION/);
  assert.ok(!calls[1].body.text.includes('Please call me back.'));
  assert.ok(!calls[1].body.text.includes('01270 000000'));
  assert.ok(!calls[1].body.text.includes('visitor@example.com'));
});

test('live enquiries go to NHS and acknowledgement goes only to visitor', async () => {
  const { env, calls, send } = await fixture('live');
  env.TEST_EMAIL = 'testing@example.com';
  await send();
  assert.deepEqual(calls[0].body.to, ['pharmacy.fma50@nhs.net']);
  assert.deepEqual(calls[1].body.to, ['visitor@example.com']);
  assert.equal(calls[1].body.reply_to, 'pharmacy.fma50@nhs.net');
  assert.ok(!calls[1].body.text.includes('TEST CONFIRMATION'));
});

test('callback requires a usable telephone number; ordinary enquiries allow none', async () => {
  const { calls, send } = await fixture();
  for (const phone of ['', 'letters only']) await assert.rejects(send({ phone }), /telephone/);
  await assert.rejects(send({ callback: 'invalid' }), /callback/);
  assert.equal(calls.length, 0);
  await send({ callback: undefined, phone: '' });
  assert.match(calls[0].body.text, /Callback requested: No/);
});

test('failed forwarding does not send a misleading confirmation', async () => {
  const { env, calls, send } = await fixture();
  env.enquiryStatus = 503;
  await assert.rejects(send(), /could not accept/);
  assert.equal(calls.length, 1);
});

for (const failure of ['provider', 'network']) {
  test(`confirmation ${failure} failure reports partial acceptance and retries with stable distinct keys`, async () => {
    const { env, calls, send } = await fixture();
    env.confirmationStatus = failure === 'provider' ? 503 : 200;
    env.confirmationThrows = failure === 'network';
    await assert.rejects(send(), /enquiry was accepted.*confirmation email could not be confirmed/);
    env.confirmationStatus = 200;
    env.confirmationThrows = false;
    await send();
    assert.equal(calls.length, 4);
    assert.deepEqual(calls[0], calls[2]);
    assert.deepEqual(calls[1], calls[3]);
    assert.notEqual(calls[0].key, calls[1].key);
  });
}

test('prescriptions link to contact callback form, with NHS guidance and email-processing explanation', () => {
  const prescriptions = page('/prescriptions', {}, 'test');
  assert.match(prescriptions, /href="\/contact#enquiry-form"/);
  assert.match(prescriptions, /Request a callback/);
  const contact = page('/contact', {}, 'test');
  assert.match(contact, /id="enquiry-form"/);
  assert.match(contact, /name="callback"/);
  assert.match(contact, /https:\/\/digital.nhs.uk\/services\/national-data-opt-out\/understanding-the-national-data-opt-out\/confidential-patient-information/);
  assert.match(contact, /General queries are sent through Resend/);
  assert.match(contact, /Enquiries and confirmations go to the test inbox/);
});
