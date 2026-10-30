# Moston Pharmacy — Cloudflare Workers

Active working copy: `C:/Users/matth/Documents/git/Pharmacy_project/Website`.

Static HTML pages plus one Cloudflare Worker handle the password-protected preview, named GitHub staff editor and basic-enquiry email. No website database or always-running hosted Node process is required. Email sending remains disabled.

## Local preview 

Use Node 24.x and pnpm 11.25:

```powershell
pnpm install --frozen-lockfile
pnpm setup
pnpm start
```

Open http://127.0.0.1:4173. Viewing password: `data/preview-access.txt`. Separate local editor password: `data/demo-access.txt`. Setup preserves current settings; no password rotation is needed for the Workers conversion. The loopback-only local editor writes `content/site-content.json` and rebuilds pages immediately. Hosted staff use approved named GitHub accounts.

The local demonstration neither stores nor emails enquiries. Sensitive/prescription enquiries use the visitor's email app addressed to pharmacy.fma50@nhs.net. Restart the preview after changing source code; Ctrl+C stops it.

## Build and validate

```powershell
pnpm build
pnpm test
pnpm deploy:check
```

- `dist/`: approved HTML, styles, JavaScript and image assets only.
- `build/worker.mjs`: bundled server code, outside the public asset directory.
- `wrangler.toml`: Worker entry point, assets binding and security-sensitive routing settings.

Wrangler's dry-run validates packaging without deploying. Tests include Cloudflare's actual local workerd runtime and asset router, plus local content editing and mocked GitHub/Turnstile/Resend flows. Real accounts and inbox delivery still need deployment checks.

For direct Workers runtime inspection, `pnpm dev:workers` builds and starts Wrangler on http://127.0.0.1:4174. It uses ignored local `.dev.vars`; the GitHub editor is unavailable until configured, whereas `pnpm start` provides the separate local file editor. No local database is needed.

## Deployment

Use **Workers**, matching the setup screen with a Deploy command. In Workers Builds:

| Setting             | Value                                                                       |
| ------------------- | --------------------------------------------------------------------------- |
| Worker/project name | `moston-pharmacy`                                                           |
| Repository          | `Matthewyears19/Website`                                                    |
| Production branch   | `website_prototype`                                                         |
| Root/path           | `/`                                                                         |
| Build command       | `pnpm install --frozen-lockfile && pnpm build`                              |
| Deploy command      | `pnpm exec wrangler deploy`                                                 |
| Preview command     | `pnpm exec wrangler preview` (leave automatic preview builds off initially) |

The generic address is `https://moston-pharmacy.YOUR-ACCOUNT-SUBDOMAIN.workers.dev`, not a pages.dev address. Use the actual assigned URL for SITE_ORIGIN. Build variables and runtime settings are separate: see HOSTING.md for all values and where to put them. The first deployment fails closed until runtime secrets and origin are configured.

`pnpm deploy` performs a real deployment using existing build output and needs Cloudflare authentication. Do not run it merely to test. Never upload the whole project as public assets or use plain static hosting for a protected preview.

## Code map

| Path                        | Purpose                                                |
| --------------------------- | ------------------------------------------------------ |
| `content/site-content.json` | Editable prices/news                                   |
| `app/pages.js`, `public/`   | Shared page design and browser code                    |
| `scripts/build.js`          | Generates HTML and a separate Worker bundle            |
| `scripts/dev.js`            | Loopback-only local editor                             |
| `edge/worker.js`            | Password gate, API routing and protected asset routing |
| `edge/editor.js`            | GitHub App authentication and content commits          |
| `edge/enquiry.js`           | Turnstile validation and direct Resend forwarding      |
| `HOSTING.md`                | Workers setup and troubleshooting                      |
| `BACKEND.md`                | Architecture and operational limits                    |
| `CLIENT-CHECKLIST.md`       | Pharmacy decisions and handover tasks                  |

Old root HTML files are historical source and are excluded from deployment. The MySQL implementation is preserved outside the active project at `C:/Users/matth/Documents/Pharmacy/archive/mysql-backend-2026-10-21`; its data has not been deleted. Current local settings are in ignored `.dev.vars`; the old `.env` is unused. The Workers conversion has not pushed to GitHub, published a deployment or changed DNS.
