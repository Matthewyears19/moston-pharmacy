# Set up Cloudflare Workers for Moston Pharmacy

Updated 29 October 2026. This replaces all earlier Pages deployment instructions. Use the Workers setup screen that includes Build command, Deploy command, Preview command and API token. The project is now configured for it.

## 1. Prepare GitHub

Check GitHub repository Settings > Pages and leave the current site's publishing branch/settings alone. Commit and push the current project to `website_prototype` in `Matthewyears19/Website`; these new files cannot be built by Cloudflare until pushed. Do not merge into the old live publishing branch just to deploy this preview.

Keep `.dev.vars`, `.env`, data, node_modules, build and dist out of Git (already ignored). Use a private repository if draft news/source must be private. The editor's unpublished flag excludes text from the deployed pages, not from repository access.

## 2. Configure the Workers screen

Choose Workers & Pages > Create application > connect/import GitHub repository, then select `Matthewyears19/Website`. Grant the Cloudflare GitHub integration access only to this repository.

| Setting                          | Value                                                                            |
| -------------------------------- | -------------------------------------------------------------------------------- |
| Project/Worker name              | `moston-pharmacy` (matches wrangler.toml)                                        |
| Production branch                | `website_prototype`                                                              |
| Build command                    | `pnpm install --frozen-lockfile && pnpm build`                                   |
| Deploy command                   | `pnpm exec wrangler deploy`                                                      |
| Preview command                  | `pnpm exec wrangler preview`                                                     |
| Enable Preview builds            | Off initially                                                                    |
| Protect with Cloudflare Access   | Optional additional layer; the application already has its own viewing password  |
| Advanced > Path / root directory | `/`                                                                              |
| API token                        | Cloudflare's Create new token option can create the build token; keep it private |

Workers has no separate output-directory field: wrangler.toml specifies `main = "./build/worker.mjs"` and assets directory `./dist`. The configured name must match the Worker created in Cloudflare. If a different name is needed, update wrangler.toml before pushing.

Under **Build variables and secrets**, add ordinary build variables:

| Name         | Value                                   |
| ------------ | --------------------------------------- |
| NODE_VERSION | `24` (also set by .node-version)        |
| PNPM_VERSION | `11.25.0` (also pinned in package.json) |
| APP_MODE     | `demo`                                  |

These are build settings only. Do not put runtime passwords/API keys in this initial build form. The deploy command uses the pinned Wrangler dependency rather than downloading an unpinned CLI. No custom Worker API token needs to be put into the website's runtime variables.

Deploy, then open the Worker dashboard. A configuration error at this stage is expected because private runtime settings are still missing; pages must not open without the gate. The first deploy must successfully upload before there is a Worker to configure.

## 3. Record the workers.dev address

In the Worker's **Settings > Domains & Routes**, find/enable its workers.dev address. It normally looks like:

`https://moston-pharmacy.YOUR-ACCOUNT-SUBDOMAIN.workers.dev`

Cloudflare may ask you to choose an account workers.dev subdomain. Use the actual assigned full URL. This needs no pharmacy domain access or DNS changes. Do not use pages.dev or the localhost URL in hosted settings.

Version preview URLs are disabled by `preview_urls = false`. Keep automatic branch preview builds off initially; unknown hosts are rejected by the app's SITE_ORIGIN check. To create separate staging later, use a separate Worker and origin/Turnstile/GitHub callback configuration rather than silently accepting every preview hostname.

## 4. Add runtime variables and secrets

Open **Worker > Settings > Variables and Secrets**. These settings are distinct from Settings > Build > Build variables and secrets. The application reads these runtime bindings on every request.

| Name             | Value                                              | Type   |
| ---------------- | -------------------------------------------------- | ------ |
| APP_MODE         | `demo`                                             | Text   |
| MAIL_MODE        | `preview`                                          | Text   |
| PREVIEW_ENABLED  | `true`                                             | Text   |
| SITE_ORIGIN      | Exact assigned HTTPS origin; no trailing slash     | Text   |
| PREVIEW_PASSWORD | A new random password of at least 32 characters    | Secret |
| SESSION_SECRET   | A separate random secret of at least 32 characters | Secret |

Generate hosted secrets with a password manager, separately from the local demo credentials. Only the viewing password is shared with viewers. Never share SESSION_SECRET, API keys or the GitHub client secret.

`keep_vars = true` preserves dashboard-configured text variables across Git deployments. Secrets remain private runtime bindings. APP_MODE must match the build's APP_MODE; rebuild after changing modes. Never set LOCAL_EDITOR or LOCAL_STAFF_PASSWORD on the hosted Worker.

Save/deploy the settings, or trigger a fresh deployment after adding them, so the active Worker version has the bindings.

## 5. Connect Turnstile

Create a free Turnstile widget in Cloudflare, choose Managed mode, and allow the exact Worker hostname (without `https://` or a path).

Add runtime values:

- TURNSTILE_SITE_KEY: Text, the public site key.
- TURNSTILE_SECRET_KEY: Secret, the private validation key.

Apply/deploy the settings. Visit the stable workers.dev address. You should see the private-preview screen, complete the Turnstile check, and enter the viewing password to open the site. Remote preview logins require Turnstile; local development bypasses it on loopback only.

## 6. How preview protection works in Workers

`[assets].run_worker_first = true` is essential. Every request, including HTML, scripts and images, reaches the password gate before the Worker deliberately reads from its ASSETS binding. Do not remove it, switch to an asset-only Worker, or change it to the asset-first default.

Pages' separate Fail open / closed setting no longer applies. This Worker has no pass-through/fallback path that serves protected assets after a gate failure. Requests still consume Workers allowance even when serving static assets because the Worker runs first. Verify protection on the actual deployment before sharing.

Server code is built in `build/worker.mjs`, outside the uploaded static directory. The builder removes the two old Pages artifacts from dist and refuses unexpected asset files. No source JSON, draft data, credentials or legacy HTML is intentionally published.

## 7. Connect your named staff editor

Use your own GitHub account for testing first; no pharmacy contact is needed yet.

Register a **GitHub App** under your GitHub account Settings > Developer settings > GitHub Apps:

- Homepage: the stable workers.dev website URL.
- User authorisation callback: `https://YOUR-WORKER-HOST/api/auth/callback`.
- Repository permission: Contents read/write; Metadata read is included.
- Webhook Active: unchecked; the editor does not use webhooks.
- Keep expiring user access tokens enabled. This user-token flow does not need an App private signing key.
- Installation: only on the owning account, and install on only the Website repository.

Generate a client secret and add these **runtime** settings:

| Name                 | Value                                                                       | Type   |
| -------------------- | --------------------------------------------------------------------------- | ------ |
| GITHUB_REPO          | `Matthewyears19/Website`                                                    | Text   |
| GITHUB_BRANCH        | `website_prototype`                                                         | Text   |
| GITHUB_EDITORS       | `Matthewyears19` initially; later comma-separated approved GitHub usernames | Text   |
| GITHUB_CLIENT_ID     | Client ID from the App, not App ID                                          | Text   |
| GITHUB_CLIENT_SECRET | Generated client secret                                                     | Secret |

Apply the settings and visit `/admin`. Sign in with GitHub, make a small edit, and confirm it creates a commit on website_prototype and a successful Workers Build. Restore the original value afterwards. Cloudflare's GitHub build integration and your editor's GitHub App are two separate connections; both are needed.

Future staff need repository write access plus inclusion in GITHUB_EDITORS. Collaborators can also edit code directly through GitHub: approve that access deliberately and enable MFA. Sessions expire within eight hours. Removing a user from the allowlist or repository prevents subsequent editor requests.

## 8. Email testing later

Keep APP_MODE=demo and MAIL_MODE=preview until Resend setup is ready. Demo enquiries are checked without storing or emailing them.

For a fictional inbox test, set runtime MAIL_MODE=resend, TEST_EMAIL=matthew.years18@gmail.com, MAIL_FROM and secret RESEND_API_KEY. Resend's onboarding@resend.dev sender can only deliver to the address owning that Resend account; use it only if that is Matthew's Gmail. Sending to other recipients needs a verified sending domain. Do not send as nhs.net without authority.

Set APP_MODE=test in both build and runtime, keep PREVIEW_ENABLED=true, and rebuild/redeploy. Verify actual receipt, replies, spam and error handling using fictional data. If domain verification is required, use a domain you control or recover pharmacy DNS access later.

Live mode requires HTTPS, Resend, Turnstile and LAUNCH_APPROVED=yes. Keep the preview password enabled while arranging a final fictional NHS-inbox test. Only remove the gate once the pharmacy has approved launch and all content/provider checks are complete.

## 9. Domain and maintenance later

The workers.dev URL is enough to review the finished preview. Recover Squarespace DNS access when ready to connect mostonpharmacy.co.uk. Workers Custom Domains require Cloudflare DNS setup; preserve current records, especially mail records. Update SITE_ORIGIN, Turnstile hostname and GitHub callback when changing the address. Domain registration can stay with its existing registrar.

Assign ownership for failed builds, email failures, staff access, dependency updates, repository backup and domain renewals. Git history permits rollback; keep an independent private source backup. Cloudflare free quotas can interrupt service; monitor them rather than assuming unlimited hosting.

## Troubleshooting

| Message/symptom                                        | Check                                                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Missing Worker entry point / Pages configuration error | Push this Workers conversion; it replaces pages_build_output_dir with main and assets |
| Missing build/worker.mjs or dist                       | The build command must run before wrangler deploy                                     |
| Private server settings incomplete                     | SESSION_SECRET must be in runtime secrets, not only build variables                   |
| Use the configured HTTPS website address               | SITE_ORIGIN must match the exact stable workers.dev URL                               |
| Preview password not configured                        | PREVIEW_PASSWORD must be a runtime secret with 32+ characters                         |
| Spam protection not configured/failing                 | Both Turnstile runtime keys and exact hostname are required                           |
| Build/runtime modes do not match                       | Set APP_MODE consistently and rebuild/redeploy                                        |
| Staff editor has no GitHub sign-in                     | Set GitHub runtime bindings and install the separate editor App                       |
| Price saved but website still old                      | Check the commit branch and Workers build/deployment status                           |

## Technical references

- [Workers Builds setup](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Workers build tools/version overrides](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/)
- [Worker-first asset routing](https://developers.cloudflare.com/workers/static-assets/binding/#run_worker_first)
- [Workers secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
