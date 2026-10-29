# Decisions and remaining work

Updated 29 October 2026 for Cloudflare Workers. Earlier MySQL and Pages setup instructions are superseded.

## Confirmed and implemented

- Phone 01270 758779; pharmacy.fma50@nhs.net monitored. Address/accessibility confirmed; no Instagram.
- Keep mostonpharmacy.co.uk. Matthew operates the website; pharmacy funds it.
- Moston consultations/follow-ups; prescriptions through PharmaDoctor. Applicable pharmacist copy preserved, September prices and retained news unchanged.
- Sensitive/prescription enquiries show the address and mailto button. No prescription web form.
- Nominate through GP OR NHS App, then contact Moston. Free delivery by arrangement.
- Lymphoedema garments, prescription hosiery and nurse dressing prescriptions included.
- Static pages, file-based prices/news, Git-backed staff editor and server-enforced preview password.
- No MySQL subscription or always-running hosted Node process. Enquiries are not stored or queued.
- Real sending disabled until Resend setup. Fictional test recipient: matthew.years18@gmail.com.

## Matthew's next setup steps

- [ ] Review the local website and local editor. Current passwords are in ignored `data/preview-access.txt` and `data/demo-access.txt`.
- [ ] Create/access Cloudflare Workers and connect a private GitHub repository/selected branch; use the Workers commands in HOSTING.md. Review existing GitHub Pages publishing before pushing replacement code.
- [ ] Set Worker runtime preview secrets and Turnstile keys; preserve run_worker_first=true and verify asset protection before sharing the workers.dev URL.
- [ ] Register/install the GitHub App on the website repository, provide named editor usernames, and verify an edit triggers a successful rebuild.
- [ ] Set up Resend's verified domain/From address later; keep sending disabled until ready for fictional tests.
- [ ] Recover Squarespace/domain DNS access. Keep domain registration; change hosting/DNS only as part of the planned launch.

## Ask the pharmacy

- [ ] Confirm September prices, supply quantities, consultation costs and availability using the editor demonstration.
- [ ] Review supplied medicine information and public presentation, including Ozempic inclusion, weight-loss figures and switching advice.
- [ ] Confirm retained 2025 news and Pharmacy First coverage remain suitable.
- [ ] Confirm legal trading/registration details, complaints procedure and responsible contact.
- [ ] Approve final privacy wording for Cloudflare/Turnstile, GitHub staff access, Resend, accidental sensitive enquiries and mailbox/provider retention. No patient information belongs in news/content files.
- [ ] Confirm who monitors enquiries and prescription emails and expected response arrangements.
- [ ] Supply any delivery coverage/exclusions or bank-holiday details needed in public wording.
- [ ] Provide named editors and an offboarding owner; confirm GitHub repository write access is acceptable for those people.
- [ ] Ask the old provider to arrange redirects and a transition before termination. Matthew cannot control that domain/provider yet.

## Before public launch

- [ ] Test actual hosted GitHub sign-in, Turnstile, build triggers and password protection. Local tests use mocked external services.
- [ ] Verify fictional email receipt in Gmail, then with a pharmacy staff member in the NHS inbox.
- [ ] Confirm privacy/complaints/clinical copy and final prices; test mobile, keyboard and zoom on the deployed site.
- [ ] Confirm domain/HTTPS/alias redirects, free-tier usage and failure alerts.
- [ ] Assign ownership for failed builds/emails, dependency updates, source backup, staff access and renewals.

## Demonstration

Unlock preview, show services and nomination steps, then sign into the local editor using its separate password. Change a price, save and refresh the website; restore the original afterwards. Add a draft news article and verify it stays off the public page. Demonstrate the enquiry form with fictional details: demo mode does not store or email the message. On the hosted version, saves go to GitHub and become visible after deployment succeeds.
