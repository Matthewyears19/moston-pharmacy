> Historical Pages verification. Superseded for deployment by WORKERS-VERIFICATION.md (29 October 2026).

# Verification — 21 October 2026

The database-free alternative passes all six automated test groups. No MySQL instance, real email service or GitHub writes are used by the tests.

- Cookie encryption, expiry, tampering and secret rotation.
- Preview protection for pages, assets and APIs; wrong origin, missing configuration and rate-limit rejection.
- Basic-enquiry validation, retired prescription endpoint, Turnstile failures, Resend failures and stable retry IDs; demo never emails or stores messages.
- Mocked GitHub App sign-in with state/PKCE, allowlist and repository permissions; content revision conflicts and revoked access.
- Actual local HTTP login, file edit/rebuild, conflict handling and absence of draft text in published HTML.
- Invalid content/price/date rejection.

The static build completed successfully. `.dev.vars`, `.env`, credentials and `dist/` are ignored by Git. Published files are restricted to generated HTML, approved public assets and the bundled function; source JSON/drafts and historical HTML are excluded.

Browser verification completed on the local preview:

- Viewing-password entry opens the site. A browser form-origin problem was found and corrected by changing Referrer-Policy to strict-origin-when-cross-origin.
- Separate local staff sign-in opens the prices/news editor.
- Save shows “Saved locally and rebuilt” without changing the supplied prices/news.
- A fictional basic enquiry shows “Nothing has been emailed or stored”.

Screenshots: `static-editor.png` and `static-enquiry-demo.png` in this folder. Older review artifacts predate this alternative.

Not yet verified: real hosted GitHub App authentication, Cloudflare deployment/runtime and fail-closed settings, live Turnstile, inbox delivery/bounces, and final hosted mobile/browser/accessibility review. These need account configuration described in ../HOSTING.md. No live deployment or DNS change was made.
