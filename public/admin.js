let csrf = '',
  content = null,
  dirty = false;
const $ = (id) => document.getElementById(id);
const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
async function api(path, method = 'GET', body) {
  const response = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Something went wrong.');
  return data;
}
function render() {
  $('price-editor').innerHTML = content.prices
    .map(
      (p) =>
        `<div class="edit-price" data-price="${esc(p.id)}"><label>Product<input data-field="product" value="${esc(p.product)}" maxlength="80" required></label><label>Strength / supply<input data-field="dose" value="${esc(p.dose)}" maxlength="80" required></label><label>Price (£)<input data-field="price" type="number" min="0" max="10000" step="0.01" value="${p.price}" required></label><button type="button" class="remove-button" data-remove-price="${esc(p.id)}" aria-label="Remove ${esc(p.product)} ${esc(p.dose)}">Remove</button></div>`,
    )
    .join('');
  $('news-editor').innerHTML = content.news
    .map(
      (n) =>
        `<article class="edit-news" data-news="${esc(n.id)}"><div class="form-grid"><label>Article title<input data-field="title" value="${esc(n.title)}" maxlength="160" required></label><label>Date<input data-field="date" type="date" value="${esc(n.date)}" required></label><label class="full">Article text<textarea data-field="body" rows="4" maxlength="5000" required>${esc(n.body)}</textarea></label><label class="check"><input type="checkbox" data-field="published" ${n.published ? 'checked' : ''}><span>Published on the website</span></label><button type="button" class="remove-button" data-remove-news="${esc(n.id)}">Remove article</button></div></article>`,
    )
    .join('');
}
function collect() {
  content.prices = [...document.querySelectorAll('[data-price]')].map(
    (row) => ({
      id: row.dataset.price,
      product: row.querySelector('[data-field="product"]').value,
      dose: row.querySelector('[data-field="dose"]').value,
      price: Number(row.querySelector('[data-field="price"]').value),
    }),
  );
  content.news = [...document.querySelectorAll('[data-news]')].map((row) => ({
    id: row.dataset.news,
    title: row.querySelector('[data-field="title"]').value,
    date: row.querySelector('[data-field="date"]').value,
    body: row.querySelector('[data-field="body"]').value,
    published: row.querySelector('[data-field="published"]').checked,
  }));
}
function status(data) {
  $('audit-list').innerHTML =
    data.audit
      .map(
        (a) =>
          `<div class="audit-row"><strong>${esc(a.name ?? 'Former staff member')}</strong> · ${esc(a.action)}<br><small>${esc(a.at)} UTC</small></div>`,
      )
      .join('') || '<p>No changes recorded yet.</p>';
}
async function load() {
  const data = await api('/api/admin');
  csrf = data.csrf;
  content = data.content;
  $('staff-name').textContent = data.user.name;
  $('login-panel').hidden = true;
  $('editor').hidden = false;
  render();
  status(data);
  document.body.dataset.localEditor = String(data.local);
}
$('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.target.querySelector('button');
  button.disabled = true;
  try {
    await api(
      '/api/login',
      'POST',
      Object.fromEntries(new FormData(event.target)),
    );
    event.target.reset();
    await load();
    $('login-status').textContent = '';
  } catch (e) {
    $('login-status').textContent = e.message;
  } finally {
    button.disabled = false;
  }
});
$('logout').addEventListener('click', async () => {
  if (dirty && !confirm('Discard unsaved changes and sign out?')) return;
  try {
    await api('/api/logout', 'POST', {});
    dirty = false;
    location.reload();
  } catch (e) {
    $('save-status').textContent = e.message;
  }
});
$('editor-form').addEventListener('input', () => {
  dirty = true;
  $('save-status').textContent = 'Unsaved changes';
});
$('editor-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  collect();
  const button = event.target.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    content = await api('/api/content', 'POST', content);
    dirty = false;
    $('save-status').textContent =
      document.body.dataset.localEditor === 'true'
        ? 'Saved locally and rebuilt. Refresh the website to see your changes.'
        : 'Saved to GitHub. The website is rebuilding; changes appear after a successful deployment.';
    render();
    status(await api('/api/admin'));
  } catch (e) {
    $('save-status').textContent = e.message;
  } finally {
    button.disabled = false;
  }
});
$('add-price').addEventListener('click', () => {
  collect();
  content.prices.push({
    id: crypto.randomUUID(),
    product: '',
    dose: '',
    price: 0,
  });
  dirty = true;
  render();
  document.querySelector('[data-price]:last-child input').focus();
});
$('add-news').addEventListener('click', () => {
  collect();
  content.news.unshift({
    id: crypto.randomUUID(),
    title: '',
    date: new Date().toISOString().slice(0, 10),
    body: '',
    published: false,
  });
  dirty = true;
  render();
  document.querySelector('[data-news] input').focus();
});
$('editor-form').addEventListener('click', (event) => {
  const price = event.target.dataset.removePrice,
    news = event.target.dataset.removeNews;
  if (!price && !news) return;
  if (
    !confirm(
      'Remove this item? It will only disappear from the website when you save changes.',
    )
  )
    return;
  collect();
  if (price) content.prices = content.prices.filter((p) => p.id !== price);
  if (news) content.news = content.news.filter((n) => n.id !== news);
  dirty = true;
  render();
  $('save-status').textContent = 'Unsaved changes';
});
window.addEventListener('beforeunload', (e) => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = '';
  }
});
async function initialise() {
  try {
    const config = await api('/api/editor-config');
    $('login-form').hidden = !config.local;
    $('github-login').hidden = config.local || !config.configured;
    $('login-help').textContent = config.local
      ? 'Local demonstration: use your separate staff password. Hosted staff use their own approved GitHub accounts.'
      : config.configured
        ? 'Use your approved GitHub account. Saving changes updates the website after a rebuild.'
        : 'The hosted editor needs its GitHub connection set up. See the hosting setup guide.';
    await load();
  } catch (e) {
    if (e.message !== 'Please sign in to edit the website.')
      $('login-status').textContent = e.message;
  }
}
initialise();
