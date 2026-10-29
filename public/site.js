document.documentElement.classList.add('js');
const toggle = document.querySelector('.menu-toggle'),
  nav = document.querySelector('#navigation');
toggle?.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  toggle.setAttribute('aria-expanded', String(open));
});
nav?.addEventListener('click', (e) => {
  if (e.target.closest('a')) {
    nav.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && nav?.classList.contains('open')) {
    nav.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.focus();
  }
});

async function prepareForm(form) {
  const button = form.querySelector('button[type="submit"]'),
    status = form.querySelector('[role="status"]');
  let widget, config, sentFingerprint;
  const initialise = async () => {
    const response = await fetch('/api/form-config');
    config = await response.json();
    if (!response.ok)
      throw new Error(
        config.error || 'The form is unavailable. Please phone or email us.',
      );
    form.elements.csrf.value = config.csrf;
    form.elements.submissionId.value = config.submissionId;
  };
  try {
    await initialise();
    if (config.siteKey) {
      const script = document.createElement('script');
      script.src =
        'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      await new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = () =>
          reject(
            new Error(
              'Spam protection could not load. Please phone or email us.',
            ),
          );
        document.head.append(script);
      });
      widget = window.turnstile.render(
        form.querySelector('.turnstile-container'),
        { sitekey: config.siteKey, action: 'enquiry' },
      );
    }
    button.disabled = false;
  } catch (error) {
    status.textContent = error.message;
    status.classList.add('error');
    return;
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    button.disabled = true;
    status.classList.remove('error');
    status.textContent = 'Sending your enquiry…';
    try {
      const details = new FormData(form);
      const fingerprint = JSON.stringify(
        ['name', 'email', 'phone', 'message'].map((key) => details.get(key)),
      );
      if (sentFingerprint && sentFingerprint !== fingerprint)
        await initialise();
      sentFingerprint = fingerprint;
      const response = await fetch(form.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(new FormData(form)),
        signal: AbortSignal.timeout(25000),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error || 'Sending failed. Please phone or email us.',
        );
      status.textContent = result.message;
      form.reset();
      button.textContent = 'Enquiry processed';
      status.focus();
    } catch (error) {
      status.classList.add('error');
      status.textContent =
        error.name === 'TimeoutError'
          ? 'We could not confirm acceptance. Retry the unchanged enquiry on this page or phone/email the pharmacy. Nothing is stored for later sending.'
          : error.message;
      if (widget !== undefined) window.turnstile.reset(widget);
      button.disabled = false;
      status.focus();
    }
  });
}
document.querySelectorAll('[data-public-form]').forEach(prepareForm);
