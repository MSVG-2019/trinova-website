# trinovahelveticgroup.ch — website

Static site (self-contained `index.html`) + Azure Static Web Apps managed API for the contact form.
Stack mirrors M&S Ventures: **Infomaniak (reg) · Cloudflare (DNS) · Azure SWA (hosting) · Microsoft 365 (email) · GitHub (CI/CD)**.

## Layout
- `index.html` — full landing page (Title Case, .ch canonical, JSON-LD Organization + founder Réka Raffai + LinkedIn sameAs).
- `api/contact/` — Node function: honeypot + Cloudflare Turnstile verify + Microsoft Graph `sendMail` → info@trinovahelveticgroup.ch.
- `robots.txt`, `sitemap.xml`, `llms.txt` — SEO + AI-search.
- `favicon.svg`, `og-image.png` — brand icon + social/AI preview card.
- `staticwebapp.config.json` — SPA fallback + security headers.

## Deploy (Azure creates the GitHub Actions workflow on link)
1. Push this folder to a GitHub repo (same account as M&S).
2. Azure Portal → Create Static Web App → link the repo, app_location `/`, api_location `api`, output `""`. Azure commits the workflow + deploy token.
3. Contact form env vars on the SWA: `TENANT_ID`, `CLIENT_ID`, `CLIENT_SECRET`, `TURNSTILE_SECRET`, `MAIL_SENDER=info@trinovahelveticgroup.ch`, `MAIL_TO=info@trinovahelveticgroup.ch`.
4. Replace `TURNSTILE_SITEKEY_PLACEHOLDER` in `index.html` with the real Turnstile **site key** for trinovahelveticgroup.ch.
5. Cloudflare (.ch zone): apex + `www` → SWA hostname (DNS-only), keep email records; redirect `.com` + apex → `https://www.trinovahelveticgroup.ch/`.
6. GSC + Bing WMT: verify via Cloudflare TXT, submit sitemap, request indexing.

Default landing = **https://www.trinovahelveticgroup.ch/**.
