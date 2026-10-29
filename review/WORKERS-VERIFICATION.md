# Workers conversion verification — 29 October 2026

The deployment target is now Cloudflare Workers with Static Assets. This report supersedes the earlier Pages-specific verification.

## Passed

- All seven automated test groups, including the existing preview-cookie, content validation, enquiry and mocked GitHub authentication checks.
- An actual workerd integration test using the real Wrangler config and Cloudflare asset router. Pages, CSS, images and direct HTML paths require viewing access; protected APIs return 401. After login the main pages and assets return successfully. Server bundle/source paths remain inaccessible. Legacy redirects and non-sending enquiry processing work.
- Static assets build in dist; bundled server code builds separately in build/worker.mjs. The old Pages artifacts are removed on build and not part of the asset allowlist.
- Wrangler deploy --dry-run succeeds with the ASSETS binding. No upload or deployment was performed.
- Git ignores build output, local secrets and private credentials. Git diff whitespace check passes.
- Installed Wrangler 4.154.0 supports the documented preview command; automatic preview builds should remain off initially.

## Configuration

wrangler.toml now declares main, workers_dev, keep_vars and the ASSETS binding. run_worker_first=true is essential to prevent assets bypassing preview authentication. html_handling=none permits explicit HTML route resolution by the Worker. Version URLs are disabled. Dashboard runtime variables are preserved on subsequent deploys.

Node 24 and pnpm 11.25.0 remain the build tools. Wrangler and esbuild are pinned in package.json/pnpm-lock.yaml; workerd's install script is explicitly allowed. No database has been added. Existing pharmacy prices/news and medical copy were not changed by this conversion.

## Pending hosted checks

Commit/push to the intended branch, connect Workers Builds, configure the exact workers.dev SITE_ORIGIN and runtime secrets, and test Turnstile/GitHub/Resend with real accounts. Build variables are separate from runtime bindings. No Cloudflare dashboard, GitHub remote, domain or email settings were changed. Real sending remains disabled in the current demonstration.
