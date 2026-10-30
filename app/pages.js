import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { business as b, root } from './config.js';
export const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
const copy = JSON.parse(
  readFileSync(join(root, 'content/pharmacist-copy.json'), 'utf8').replace(
    /^\uFEFF/,
    '',
  ),
);
const nhsDataLink = '<a href="https://digital.nhs.uk/services/national-data-opt-out/understanding-the-national-data-opt-out/confidential-patient-information">NHS guidance on confidential patient information ↗</a>';
const pf = readFileSync(join(root, 'content/pharmacy-first.html'), 'utf8');
const link = (href, text, kind = '') =>
  `<a class="button ${kind}" href="${href}">${text}<span aria-hidden="true">↗</span></a>`;
const intro = (eyebrow, title, body) =>
  `<section class="page-intro"><div class="wrap"><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p class="lead">${body}</p></div></section>`;
const field = (name, label, type = 'text', required = true, auto = 'off') =>
  `<label>${label}${required ? ' <span class="required">*</span>' : ' <span class="muted">(optional)</span>'}<input name="${name}" type="${type}" ${required ? 'required' : ''} maxlength="${type === 'email' ? 254 : 160}" autocomplete="${auto}"></label>`;
const area = (name, label, required = true, max = 1000) =>
  `<label class="full">${label}${required ? ' <span class="required">*</span>' : ' (optional)'}<textarea name="${name}" ${required ? 'required' : ''} maxlength="${max}" rows="4"></textarea></label>`;
function formStart(kind, mode) {
  return `<form action="/api/forms/${kind}" method="post" data-public-form="${kind}" class="form-grid"><input type="hidden" name="csrf" value=""><input type="hidden" name="submissionId" value=""><div class="trap" aria-hidden="true"><label>Leave blank<input name="website" tabindex="-1" autocomplete="off"></label></div>${mode !== 'live' ? '<p class="notice full">Test environment. Use fictional details only. ' + (mode === 'demo' ? 'Messages are checked for demonstration only, never stored or emailed.' : 'Enquiries and confirmations go to the test inbox, not the pharmacy or visitor.') + '</p>' : ''}`;
}
function formEnd(label) {
  return `<p class="full small">Read our <a href="/privacy">privacy information</a> before sending. For urgent medical advice use NHS 111; in an emergency call 999.</p><div class="full"><div class="turnstile-container"></div><noscript><p>Please enable JavaScript to send a basic enquiry, or phone/email the pharmacy directly.</p></noscript><button type="submit" class="button" disabled>${label} <span aria-hidden="true">→</span></button><p role="status" class="form-status" tabindex="-1"></p></div></form>`;
}
function newsHtml(news) {
  return (
    news
      .filter((n) => n.published)
      .sort((a, b) => b.date.localeCompare(a.date))
      .map(
        (n) =>
          `<article class="news-item"><time datetime="${escape(n.date)}">${new Date(n.date + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}</time><h3>${escape(n.title)}</h3><p>${escape(n.body)}</p></article>`,
      )
      .join('') ||
    '<p>No updates at the moment. Please contact us for service information.</p>'
  );
}
function priceHtml(prices) {
  return [...new Set(prices.map((p) => p.product))]
    .map(
      (product) =>
        `<section class="price-group"><h3>${escape(product)}</h3><table><caption class="sr-only">${escape(product)} prices</caption><thead><tr><th scope="col">Strength / supply</th><th scope="col">Price</th></tr></thead><tbody>${prices
          .filter((p) => p.product === product)
          .map(
            (p) =>
              `<tr><th scope="row">${escape(p.dose)}</th><td>£${Number(p.price).toFixed(2)}</td></tr>`,
          )
          .join('')}</tbody></table></section>`,
    )
    .join('');
}
function pharmacistFaq() {
  const start = copy.indexOf('FAQs');
  const end = copy.findIndex((t) =>
    t.startsWith('Xenical and Orlistat treatment'),
  );
  const groups = [];
  let current;
  for (const raw of copy.slice(start + 1, end)) {
    let t = raw;
    if (t.startsWith('What is BMI? HYPERLINK')) t = 'What is BMI?';
    if (/^(What|Is it|Can I|Do I|Why do)/.test(t) && t.endsWith('?')) {
      current = { q: t, body: [] };
      groups.push(current);
    } else if (current) current.body.push(t);
  }
  return groups
    .map(
      (g) =>
        `<details><summary>${escape(g.q)}</summary>${g.body.map((t) => `<p>${escape(t)}</p>`).join('')}</details>`,
    )
    .join('');
}
const navItems = [
  ['/#services', 'Services'],
  ['/weight-management', 'Weight management'],
  ['/#news', 'Updates'],
  ['/find-us', 'Find us'],
];
export function layout(
  title,
  body,
  {
    mode = 'demo',
    admin = false,
    path = '/',
    description = 'Independent pharmacy care, prescription delivery and personal support in Sandbach.',
  } = {},
) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} | Moston Pharmacy</title><meta name="description" content="${escape(description)}">${mode !== 'live' || admin ? '<meta name="robots" content="noindex,nofollow">' : `<link rel="canonical" href="${b.domain}${path}">`}<link rel="icon" href="/public/favicon.png"><link rel="stylesheet" href="/public/site.css"><script src="/public/site.js" defer></script>${admin ? '<script src="/public/admin.js" defer></script>' : ''}</head><body><a class="skip-link" href="#main">Skip to content</a>${mode !== 'live' ? `<div class="preview-bar">${mode === 'demo' ? 'Private demonstration · no emails are sent' : 'Email test environment · fictional details only'}</div>` : ''}<div class="topbar"><div class="wrap"><span>Independent care. Right here in Sandbach.</span><a href="tel:${b.tel}">Call ${b.phone}</a></div></div><header class="site-header"><div class="wrap header-inner"><a class="brand" href="/" aria-label="Moston Pharmacy home"><img src="/public/logo.png" width="390" height="143" alt="Moston Pharmacy"></a><button class="menu-toggle" aria-controls="navigation" aria-expanded="false">Menu</button><nav id="navigation" aria-label="Main navigation">${navItems.map(([url, text]) => `<a href="${url}"${url === path ? ' aria-current="page"' : ''}>${text}</a>`).join('')}${link('/contact', 'Get in touch', 'compact')}</nav></div></header><main id="main">${body}</main><footer><div class="wrap footer-grid"><div><p class="eyebrow">MOSTON PHARMACY</p><h2>We deliver better.</h2><p>Friendly advice. Personal support.<br>Care that fits your life.</p></div><div><h3>Call or visit</h3><p>${b.address}</p><a href="tel:${b.tel}">${b.phone}</a><br><a href="mailto:${b.email}">${b.email}</a></div><div><h3>Opening hours</h3><p>Monday–Friday: 9am–5pm<br>Saturday & Sunday: closed</p><a href="${b.facebook}" target="_blank" rel="noopener noreferrer">Find us on Facebook ↗</a></div></div><div class="wrap footer-bottom"><small>© ${new Date().getFullYear()} ${b.company}</small><div><a href="/privacy">Privacy</a><a href="/complaints">Complaints</a><a href="/admin">Staff sign in</a>${mode !== 'live' ? '<form action="/preview/exit" method="post"><button class="preview-exit">Leave preview</button></form>' : ''}</div></div></footer></body></html>`;
}
export function page(path, content, mode) {
  let title, body;
  switch (path) {
    case '/':
      title = 'Your local independent pharmacy';
      body = `<section class="hero"><div class="wrap hero-grid"><div><p class="eyebrow">YOUR HEALTH. OUR COMMUNITY.</p><h1>A little closer.<br>A lot more <em>personal.</em></h1><p class="lead">Your friendly, independent pharmacy in Sandbach. Prescriptions, practical advice and ongoing support from people who get to know you.</p><div class="actions">${link('/#services', 'Explore our services')}${link('/prescriptions', 'Prescription delivery', 'outline')}</div><p class="hero-note">Local care <span>·</span> Free prescription delivery · contact us to arrange <span>·</span> Mon–Fri, 9–5</p></div><aside class="hero-panel"><span class="eyebrow">CARE, BUILT AROUND YOU</span><div class="hero-mark" aria-hidden="true">+</div><h2>Your next step<br>to feeling supported.</h2><p>Talk to us about your medicines, your health or where to start.</p><div class="panel-row"><span>Visit us</span><strong>Sandbach, CW11 3PA</strong></div><div class="panel-row"><span>Give us a call</span><a href="tel:${b.tel}">${b.phone} ↗</a></div></aside></div></section><section class="section" id="services"><div class="wrap"><div class="section-heading"><div><p class="eyebrow">HOW WE CAN HELP</p><h2>Everyday care.<br>Extra support when you need it.</h2></div><p>From your regular prescriptions to a private conversation about your health.</p></div><div class="service-grid"><article class="service-card"><span class="service-number">01 / YOUR MEDICINES</span><h3>Prescription collection<br>& delivery</h3><p>Let us take the strain out of collecting your regular prescriptions. Free prescription delivery. Contact the pharmacy to discuss arrangements.</p>${link('/prescriptions', 'Arrange your delivery', 'text-button')}</article><article class="service-card featured"><span class="service-number">02 / PERSONAL SUPPORT</span><h3>Weight management</h3><p>Face-to-face consultations, practical lifestyle advice and follow-up support at Moston.</p>${link('/weight-management', 'Discover the service', 'text-button')}</article><article class="service-card"><span class="service-number">03 / NHS SERVICES</span><h3>Pharmacy First</h3><p>Advice, assessment and treatment where appropriate for common conditions.</p>${link('/pharmacy-first', 'See how we can help', 'text-button')}</article></div><div class="care-strip"><h3>Here for the everyday, too.</h3><p>Lymphoedema garments · Prescription hosiery · Nurse dressing prescriptions · Private prescriptions · Medicine advice · Self-care support</p></div></div></section><section class="section tinted" id="news"><div class="wrap"><div class="section-heading"><div><p class="eyebrow">FROM YOUR PHARMACY</p><h2>Latest updates</h2></div><p>Services, announcements and news from the team.</p></div><div class="news-grid">${newsHtml(content.news)}</div></div></section>${cta()}`;
      break;
    case '/weight-management':
      title = 'Weight management';
      body =
        intro(
          'PERSONAL SUPPORT, AT MOSTON',
          'Your goals.<br>Our ongoing support.',
          'Face-to-face consultations and follow-ups with our pharmacists at Moston. Prescriptions are supplied through PharmaDoctor.',
        ) +
        `<section class="section"><div class="wrap split"><div><p class="eyebrow">A CONVERSATION IS THE FIRST STEP</p><h2>Support for your<br>long-term goals.</h2>${copy
          .slice(0, 3)
          .map((t) => `<p>${escape(t)}</p>`)
          .join(
            '',
          )}<div class="actions">${link('/contact', 'Book a free chat')}${link('/find-us', 'Visit the pharmacy', 'outline')}</div></div><aside class="info-panel"><h3>With you along the way</h3><ol class="steps"><li><strong>Meet your pharmacist</strong><span>An initial face-to-face consultation in our private consultation room.</span></li><li><strong>Find the right approach</strong><span>Discuss suitability, lifestyle, treatment options and costs.</span></li><li><strong>Stay supported</strong><span>Weekly calls during the first month and ongoing reviews at Moston.</span></li></ol><p class="small">No subscription required. Consultations and follow-ups take place through Moston Pharmacy.</p></aside></div></section><section class="section tinted"><div class="wrap narrow"><p class="eyebrow">INFORMATION FROM OUR PHARMACISTS</p><h2>Understanding your options</h2>${copy
          .slice(7, copy.indexOf('FAQs'))
          .filter((t) => !t.startsWith('The manufacturers of Mounjaro'))
          .map((t) =>
            t === 'How these medicines Work'
              ? '<h3>How these medicines work</h3>'
              : `<p>${escape(t)}</p>`,
          )
          .join(
            '',
          )}<p class="small">Treatment is subject to an individual consultation and suitability assessment.</p></div></section><section class="section" id="prices"><div class="wrap"><div class="section-heading"><div><p class="eyebrow">CLEAR INFORMATION</p><h2>Treatment prices</h2></div><p>We will confirm the treatment, supply quantity and total cost during your consultation.</p></div>${mode !== 'live' ? '<p class="notice">Demonstration prices: September 1st prices used where provided. Pharmacy confirmation is pending.</p>' : ''}<div class="price-grid">${priceHtml(content.prices)}</div></div></section><section class="section tinted"><div class="wrap narrow"><p class="eyebrow">YOUR QUESTIONS, ANSWERED</p><h2>More about the service</h2>${pharmacistFaq()}<details><summary>Xenical and Orlistat treatment</summary>${copy
          .slice(
            copy.findIndex((t) => t === 'Xenical and Orlistat treatment') + 1,
          )
          .map((t) => `<p>${escape(t)}</p>`)
          .join(
            '',
          )}</details><figure><img src="/public/BMI.webp" width="600" height="500" loading="lazy" alt="Body mass index chart comparing height and weight"><figcaption>Our pharmacists can explain your BMI and assess your individual suitability.</figcaption></figure></div></section>${cta()}`;
      break;
    case '/pharmacy-first':
      title = 'NHS Pharmacy First';
      body =
        intro(
          'NHS CARE, CLOSE TO HOME',
          'Advice when you need it.',
          'Our pharmacist can assess common conditions, provide treatment when appropriate, or help you find the right care.',
        ) +
        `<section class="section"><div class="wrap narrow"><p class="notice">Not for emergencies. Call 999 in an emergency, or NHS 111 for urgent advice.</p><div class="condition-list">${pf}</div><p>Eligibility and treatment depend on your assessment. <a href="https://www.england.nhs.uk/primary-care/pharmacy/pharmacy-services/pharmacy-first/">Read about NHS Pharmacy First ↗</a></p></div></section>${cta()}`;
      break;
    case '/prescriptions':
      title = 'Prescriptions and free delivery';
      body =
        intro(
          'YOUR MEDICINES, YOUR LOCAL PHARMACY',
          'Prescriptions made simpler.',
          'Nominate Moston Pharmacy through your GP or the NHS App, then contact our team to arrange your service.',
        ) +
        `<section class="section"><div class="wrap split"><div><h2>Getting started with Moston</h2><ol class="steps"><li><strong>Choose Moston Pharmacy</strong><span>Ask your GP surgery to nominate Moston Pharmacy, or change your nominated pharmacy in the NHS App. You only need to use one of these routes.</span></li><li><strong>Contact our team</strong><span>Use our contact form to request a callback, or phone the team. Please discuss prescription details directly with the pharmacy.</span></li><li><strong>Discuss free delivery</strong><span>We provide free prescription delivery. Please contact the pharmacy first to discuss delivery arrangements.</span></li></ol><div class="actions">${link('/contact#enquiry-form', 'Request a callback')}${link('tel:' + b.tel, 'Call ' + b.phone, 'outline')}</div></div><aside class="info-panel"><p class="eyebrow">FREE PRESCRIPTION DELIVERY</p><h3>Let’s arrange it together.</h3><p>Request a callback through our contact form to discuss prescriptions and free delivery. Include your phone number, but leave out medicine names and prescription or health details. Changing your nominated pharmacy does not automatically arrange delivery.</p>${link('/contact#enquiry-form', 'Request a callback')}<p><a href="tel:${b.tel}">${b.phone}</a></p></aside></div><div class="wrap form-section"><p class="eyebrow">MORE THAN REGULAR MEDICINES</p><h2>Prescription items we can help with</h2><div class="service-grid"><article class="service-card"><h3>Lymphoedema garments</h3><p>Contact our team about the lymphoedema garments we provide.</p></article><article class="service-card"><h3>Prescription hosiery</h3><p>Speak to us about supplying your prescribed hosiery.</p></article><article class="service-card"><h3>Nurse dressing prescriptions</h3><p>We can help with prescriptions for dressings used in your nursing care.</p></article></div><p class="small">Contact the pharmacy to discuss your prescribed items and availability.</p></div><div class="wrap narrow form-section"><h2>Prescription or personal health information?</h2><p>Please phone us or email the pharmacy directly. We do not collect prescription registration details through this website.</p>${link('mailto:' + b.email, 'Open your email app')}<p class="small">This opens your own email app addressed to ${b.email}. No personal details are pre-filled or sent by this website. If no email app opens, copy the address into your email service. Email is not for emergencies.</p></div></section>`;
      break;
    case '/contact':
      title = 'Get in touch';
      body =
        intro(
          'A FRIENDLY CONVERSATION',
          'How can we help?',
          'Send a general query through the website or request a callback. For prescription details or personal health information, contact the pharmacy directly.',
        ) +
        `<section class="section"><div class="wrap split"><section id="enquiry-form"><h2>General queries &amp; callback requests</h2><p>Ask about opening hours, service availability or general arrangements using this website form. To request a callback, tick the box and provide your telephone number; there is no need to explain your medical situation.</p><p>General queries are sent through Resend to the pharmacy, with a separate confirmation email to you when email sending is enabled. A confirmation acknowledges your enquiry; it does not book a callback or service.</p><p class="notice">Keep your message general. Please do not include symptoms, diagnoses, medical history, medicine names, allergies, prescription details, NHS numbers, dates of birth or medical documents. Identifiable information about your health or treatment can be confidential patient information. Discuss those details directly with the pharmacy.</p><p class="small">${nhsDataLink}. Your name, email address and phone number are still personal information; see our <a href="/privacy">privacy information</a> for how we handle them.</p>${formStart('contact', mode)}${field('name', 'Your name', 'text', true, 'name')}${field('email', 'Email address', 'email', true, 'email')}${field('phone', 'Telephone (required for a callback)', 'tel', false, 'tel')}<label class="check full"><input name="callback" type="checkbox" value="yes"><span>Please call me back on the telephone number above.</span></label>${area('message', 'Your general query or callback request (no health details)', true, 3000)}<label class="check full"><input name="basicOnly" type="checkbox" value="yes" required><span>I confirm this is a general query or callback request and contains no medical or prescription information.</span></label>${formEnd('Send enquiry')}</section><aside class="info-panel"><p class="eyebrow">PRESCRIPTIONS & PERSONAL INFORMATION</p><h2>Contact us directly.</h2><p>For prescription details or personal health information, please phone or email our monitored pharmacy inbox.</p>${link('mailto:' + b.email, 'Open your email app', 'outline')}<p><a href="mailto:${b.email}">${b.email}</a><br><a href="tel:${b.tel}">${b.phone}</a></p><p class="small">The button opens your own email app. You write and send the email there; its contents do not pass through the website or Resend. If it does not open, copy the address above.</p><hr><p>${b.address}</p><p>Monday–Friday, 9am–5pm<br>Weekends closed</p><p>Step-free access and accessible parking.<br>Free prescription delivery — contact us to arrange.</p>${link('/find-us', 'Find the pharmacy', 'outline')}</aside></div></section>`;
      break;
    case '/find-us':
      title = 'Find us';
      body =
        intro(
          'YOUR LOCAL PHARMACY',
          'Come and say hello.',
          'Independent pharmacy care in Sandbach, with a step-free entrance and nearby parking.',
        ) +
        `<section class="section"><div class="wrap split"><div><p class="eyebrow">PLAN YOUR VISIT</p><h2>Moston Pharmacy</h2><p class="lead">${b.address}</p><p>Monday–Friday: 9am–5pm<br>Saturday & Sunday: closed</p><p>Step-free entrance · Accessible parking<br>Assistance available — please ask a team member.</p>${link('https://maps.google.com/?q=Moston+Pharmacy+Services+CW11+3PA', 'Open Google Maps')}<p class="small">Directions open in Google Maps.</p></div><aside class="location-panel"><span class="eyebrow">SANDBACH · CHESHIRE</span><div class="location-symbol" aria-hidden="true">↗</div><h2>Good care.<br>Close to home.</h2><a href="tel:${b.tel}">Need help finding us? ${b.phone}</a></aside></div></section>`;
      break;
    case '/privacy':
      title = 'Privacy information';
      body =
        intro(
          'YOUR INFORMATION',
          'Privacy information',
          mode === 'live'
            ? 'How we handle information sent through this website.'
            : 'Draft for pharmacy review before launch.',
        ) +
        `<section class="section"><div class="wrap narrow"><h2>General queries and callback requests</h2><p>The enquiry form collects your name, email address, message, callback choice and telephone number (required for a callback, otherwise optional). It is for general queries and callback requests only. Please do not enter medical or prescription information.</p><p>Information identifying you together with details about your health or treatment can be confidential patient information. Examples include symptoms, diagnoses, medicines, allergies and treatment history. ${nhsDataLink}. Contact details are still personal information even when your message contains no health details.</p><h2>Resend email delivery</h2><p>The website function validates your enquiry and passes it directly to Resend for delivery to the pharmacy’s monitored inbox. A separate acknowledgement goes to the email address you supplied, without repeating your message or contact details. Acknowledgements do not confirm staff have read the enquiry or booked a callback. The website does not keep a database, copy or retry queue of your message. Resend and the receiving email service process the message under their own retention arrangements. If sending fails, the website will tell you; it will not send it later. If only the acknowledgement fails, your enquiry may already have been accepted; the status message will explain this.</p><h2>Direct email and telephone</h2><p>For prescription or personal health matters, phone us or use the pharmacy email address. An email button opens your own email app without pre-filling personal information. The website and Resend do not receive the content of emails you send this way. Your email service and the pharmacy’s email service handle those messages.</p><h2>Hosting and spam protection</h2><p>Cloudflare hosts the website and processes requests. Turnstile checks help protect hosted forms from automated abuse. Hosting security logs may contain request metadata; enquiry text is not deliberately logged by our application.</p><h2>Staff editing</h2><p>Approved staff sign in with GitHub. Website prices, news and their change history are stored in the website repository, separate from enquiries. A necessary encrypted session cookie keeps staff signed in for up to eight hours.</p><h2>Private preview access</h2><p>A viewing password is required while this website is being reviewed. A necessary browser cookie remembers access for up to eight hours. Staff sign-in uses a separate cookie and account. Neither cookie contains your password.</p>${mode !== 'live' ? '<p class="notice">Testing: use fictional information only. Local preview checks enquiries without storing them or sending email. Configured email tests send both the enquiry and acknowledgement to the test inbox instead of the pharmacy or visitor.</p>' : ''}<h2>Before launch</h2><p>The pharmacy must approve the final privacy notice, lawful bases, providers, retention periods, rights process and contacts. This draft is not a complete live privacy notice.</p><p>Contact <a href="mailto:${b.email}">${b.email}</a> with questions.</p></div></section>`;
      break;
    case '/complaints':
      title = 'Complaints and feedback';
      body =
        intro(
          'WE’RE LISTENING',
          'Help us improve.',
          'We aim to give you the highest possible standard of service. Please tell us if something has gone wrong.',
        ) +
        `<section class="section"><div class="wrap narrow"><h2>Speak to the pharmacy</h2><p>Contact us and speak to a member of staff about your concerns. We welcome comments about our services and suggestions for improvement.</p><p>Our pharmacist can explain the complaints procedure and the next steps.</p>${link('/contact', 'Contact the team')}<p class="small">The full complaints procedure and current escalation contacts will be confirmed with the pharmacy before launch.</p></div></section>`;
      break;
    default:
      return null;
  }
  return layout(title, body, { mode, path });
}
function cta() {
  return `<section class="cta"><div class="wrap"><div><p class="eyebrow">LET’S TALK</p><h2>A familiar face.<br>A helpful conversation.</h2></div><div><p>Whatever brings you to us, we’re here to help.</p>${link('/contact', 'Get in touch', 'light')}${link('tel:' + b.tel, 'Call ' + b.phone, 'light-outline')}</div></div></section>`;
}
export function adminPage(mode) {
  return layout(
    'Staff area',
    intro(
      'MOSTON PHARMACY · STAFF',
      'Your pharmacy, up to date.',
      'Manage treatment prices and news in one place.',
    ) +
      `<section class="section"><div class="wrap"><div id="login-panel" class="narrow"><h2>Sign in</h2><p id="login-help">Loading sign-in options…</p><a id="github-login" class="button" href="/api/auth/start" hidden>Sign in with GitHub →</a><form id="login-form" class="form-grid" hidden>${field('password', 'Local staff password', 'password', true, 'current-password')}<div class="full"><button class="button">Open local editor →</button></div></form><p id="login-status" role="status"></p></div><div id="editor" hidden><div class="editor-toolbar"><p>Signed in as <strong id="staff-name"></strong></p><button id="logout" class="button outline">Sign out</button></div><p class="notice">Review with the pharmacy: September prices, product availability, clinical copy and the 2025 contraception announcement. After saving, the website rebuilds. Changes appear when that rebuild succeeds. Unpublished articles remain in the private editing source.</p><form id="editor-form"><div class="editor-toolbar"><h2>Treatment prices</h2><button type="button" id="add-price" class="button outline">Add price</button></div><div id="price-editor"></div><div class="editor-toolbar"><h2>News & announcements</h2><button type="button" id="add-news" class="button outline">Add article</button></div><div id="news-editor"></div><div class="save-bar"><button class="button" type="submit">Save website changes →</button><a href="/" target="_blank" rel="noopener">View website ↗</a><p id="save-status" role="status"></p></div></form><section class="admin-section"><h2>Enquiries</h2><p>Basic enquiries go directly to the pharmacy inbox. This website does not store messages or an email queue. Check delivery issues in the email provider account.</p></section><section class="admin-section"><h2>Recent changes</h2><div id="audit-list"></div></section></div></div></section>`,
    { mode, admin: true, path: '/admin' },
  );
}
