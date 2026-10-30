export function fail(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}
export function text(value, label, max = 160, required = true) {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    fail(`Please check ${label}.`);
  return value.trim();
}
export function email(value) {
  const v = text(value, "email address", 254).toLowerCase();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v))
    fail("Please enter a valid email address.");
  return v;
}
export function date(value, label) {
  const v = text(value, label, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
    !Number.isFinite(Date.parse(v)) ||
    new Date(v).toISOString().slice(0, 10) !== v
  )
    fail(`Please check ${label}.`);
  return v;
}
export function validateForm(kind, data) {
  if (kind !== "contact")
    fail(
      "Please phone or email the pharmacy directly for prescription matters.",
      410,
    );
  if (!data || typeof data !== "object" || Array.isArray(data))
    fail("Invalid enquiry.");
  const allowed = new Set([
    "name",
    "email",
    "phone",
    "message",
    "basicOnly",
    "callback",
    "csrf",
    "submissionId",
    "website",
  ]);
  if (Object.keys(data).some((key) => !allowed.has(key)))
    fail(
      "This form accepts basic enquiries only. Please phone or email the pharmacy for prescription matters.",
    );
  if (data.basicOnly !== "yes")
    fail(
      "Please confirm this is a basic enquiry without medical or prescription information.",
    );
  if (data.callback !== undefined && data.callback !== "yes")
    fail("Please check the callback request.");
  const callback = data.callback === "yes";
  const phone = text(data.phone ?? "", "telephone", 40, callback);
  if (callback && !/^[+\d\s().-]{6,40}$/.test(phone))
    fail("Please enter a telephone number so we can call you back.");
  return {
    name: text(data.name, "name"),
    email: email(data.email),
    phone,
    callback,
    message: text(data.message, "message", 3000),
  };
}
export function validateContent(value) {
  if (
    !Number.isSafeInteger(value.revision) ||
    !Array.isArray(value.prices) ||
    !Array.isArray(value.news) ||
    value.prices.length > 100 ||
    value.news.length > 100
  )
    fail("Invalid content.");
  const ids = new Set();
  const id = (v) => {
    v = text(v, "item ID", 80);
    if (!/^[\w-]+$/.test(v) || ids.has(v)) fail("Each item needs a unique ID.");
    ids.add(v);
    return v;
  };
  return {
    revision: value.revision,
    prices: value.prices.map((p) => {
      if (
        typeof p.price !== "number" ||
        !Number.isFinite(p.price) ||
        p.price < 0 ||
        p.price > 10000 ||
        Math.abs(p.price * 100 - Math.round(p.price * 100)) > 0.0001
      )
        fail(
          "Prices must be between £0 and £10,000, with at most two decimal places.",
        );
      return {
        id: id(p.id),
        product: text(p.product, "product", 80),
        dose: text(p.dose, "strength or supply", 80),
        price: p.price,
      };
    }),
    news: value.news.map((n) => {
      if (typeof n.published !== "boolean")
        fail("Please check publication status.");
      return {
        id: id(n.id),
        date: date(n.date, "article date"),
        title: text(n.title, "article title", 160),
        body: text(n.body, "article text", 5000),
        published: n.published,
      };
    }),
  };
}
