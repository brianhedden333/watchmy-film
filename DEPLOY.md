# Deploying watchmyfilm.online

The site and API run on the DigitalOcean droplet `root@165.232.58.191` (Ubuntu 24.04, shared with Fracking the System).
Moved there 2026-11-20 from `164.92.121.73`. The API runs under PM2 as the unprivileged `web` user:
on the server use `sudo -u web HOME=/home/web pm2 …` (e.g. `pm2 ls`, `pm2 logs watchmyfilm`).

| Piece | Where |
|---|---|
| Static site (Vite build) | `/var/www/watchmyfilm/site` |
| API (Node, Express, SQLite) | `/var/www/watchmyfilm/server`, PM2 process `watchmyfilm`, `127.0.0.1:5050` |
| Settings and secrets | `/var/www/watchmyfilm/server/.env` (only on the droplet; see `server/.env.example`) |
| Database | `/var/www/watchmyfilm/server/data/watchmyfilm.db` |
| Posters | `/var/www/watchmyfilm/server/uploads/` |
| Backups | `/var/backups/watchmyfilm/` (made by every deploy) |
| nginx | `/etc/nginx/sites-available/watchmyfilm` (copy of `deploy/nginx-watchmyfilm.conf`) |

## Everyday deploy (from the Mac)

```sh
cd ~/Documents/WEBSITES/WATCH
./deploy/deploy.sh        # site + API
./deploy/deploy.sh site   # site only
```

The script never copies `.env`, the database or uploads.

## First-time setup (once)

1. DNS at the registrar: `A` records for `watchmyfilm.online` and `www` → `165.232.58.191`.
2. On the droplet: `mkdir -p /var/www/watchmyfilm/{site,server,deploy}`.
3. Create `/var/www/watchmyfilm/server/.env` from `server/.env.example` with:
   `NODE_ENV=production`, `APP_URL=https://watchmyfilm.online`, Stripe keys (FTS account), SendGrid key,
   `FROM_EMAIL` on the authenticated domain, `ADMIN_EMAILS`, `NOTIFY_EMAIL`.
4. From the Mac: `./deploy/deploy.sh` (starts the PM2 process), then on the droplet `sudo -u web HOME=/home/web pm2 save`.
5. nginx: copy `deploy/nginx-watchmyfilm.conf` to `/etc/nginx/sites-available/watchmyfilm`, symlink into
   `sites-enabled`, `nginx -t && systemctl reload nginx`.
6. HTTPS: `certbot --nginx -d watchmyfilm.online -d www.watchmyfilm.online`.
7. Stripe dashboard (FTS account) → Developers → Webhooks → add endpoint
   `https://watchmyfilm.online/api/stripe/webhook`, events `checkout.session.completed` and
   `checkout.session.async_payment_succeeded`. Put its signing secret in `.env` as `STRIPE_WEBHOOK_SECRET`, then
   `sudo -u web HOME=/home/web pm2 restart watchmyfilm --update-env`.
8. SendGrid: authenticate the domain `watchmyfilm.online` (adds DNS records) so sign-in emails don't land in spam.

## Two sites, one server (since 2026-11-21)

| Site | For | What's there |
|---|---|---|
| `watchmyfilm.online` | filmmakers | home page, sign-up, My Films, add-a-film, admin, account |
| `indiefilm.club` | viewers | Browse (home page), My Library, viewer sign-in |
| `<name>.indiefilm.club` | viewers | each film's watch page (or `watch.<their domain>`) |

Same built site, same API, same database. One account and one sign-in: signing in on either site passes through the
other with a one-time code (`/api/auth/hop` → `/api/auth/land`), and signing out of either ends both. An
indiefilm.club sign-in can't use the filmmaker tools. Old `<name>.watchmyfilm.online` addresses forward to
`<name>.indiefilm.club`.

### indiefilm.club, once

**Brian (Namecheap + Cloudflare):**

1. Cloudflare dashboard → **Add a domain** → `indiefilm.club` → Free plan. Cloudflare shows two nameservers.
2. Namecheap → Domain List → `indiefilm.club` → **Manage** → Nameservers → **Custom DNS** → enter the two Cloudflare
   nameservers → save. Wait until Cloudflare says the domain is **Active** (minutes to a few hours).
3. Cloudflare → indiefilm.club → **DNS** → add three `A` records, all **Proxied** (orange cloud), value
   `165.232.58.191`: name `@`, name `www`, name `*`.
4. Cloudflare → indiefilm.club → **SSL/TLS** → Overview → encryption mode **Full (strict)**.
5. Cloudflare → indiefilm.club → **SSL/TLS → Origin Server → Create Certificate**: RSA, hostnames `indiefilm.club`
   and `*.indiefilm.club`, 15 years. Keep the page open: the private key is shown only once.
6. On the droplet, save them (paste each into nano; the key is a secret, never paste it in chat):
   `mkdir -p /etc/ssl/indiefilm && nano /etc/ssl/indiefilm/origin.pem` (the certificate), then
   `nano /etc/ssl/indiefilm/origin.key` (the private key), then `chmod 600 /etc/ssl/indiefilm/origin.key`.

**Server (Claude, at deploy time):**

7. `.env`: `CLUB_URL=https://indiefilm.club`; remove `SITE_DOMAIN` if it says `watchmyfilm.online` (films now
   default to the club's domain).
8. nginx: copy `deploy/nginx-indiefilm.conf` → `/etc/nginx/sites-available/indiefilm` and
   `deploy/nginx-indiefilm-films.conf` → `/etc/nginx/sites-available/indiefilm-films`, symlink both into
   `sites-enabled`; replace `/etc/nginx/sites-available/watchmyfilm-films` with the new
   `deploy/nginx-watchmyfilm-films.conf` (forwards old film addresses).
9. In the live `/etc/nginx/sites-available/watchmyfilm` (certbot edited it, so edit by hand), in the 443 block add:
   `location ~ ^/(browse|library)(/|$) { return 302 /api/auth/hop?next=https://indiefilm.club/$1/; }`
   (Browse is `https://indiefilm.club/`; the hop page maps `/browse/` there.) Then `nginx -t && systemctl reload nginx`.
10. Deploy (runs database changes up to 22 with a backup first), then check: indiefilm.club shows Browse, a film
    page at `<name>.indiefilm.club`, sign in on one site and open the other.
11. Vimeo: each film's embed domain list needs `*.indiefilm.club` (or the film's own address) instead of
    `*.watchmyfilm.online`.

### Films on their own domains (watch.theirfilm.com), once

A filmmaker's own domain only **forwards** (301) to `<name>.indiefilm.club`, which stays the address viewers and
search engines see. If their DNS is wrong, only their short link fails; every link we give out still works.

The filmmaker adds a CNAME `watch` → `<name>.indiefilm.club` at their DNS. That brings the visit to Cloudflare, but
Cloudflare only serves it once the hostname is registered with our zone (otherwise: error 1001).

**Brian (Cloudflare, indiefilm.club zone):**

1. **DNS**: add `A` record, name `fallback`, value `165.232.58.191`, **Proxied**.
2. **SSL/TLS → Custom Hostnames**: enable **Cloudflare for SaaS** (free for the first 100 hostnames; may ask for a
   card on file). Set the **Fallback Origin** to `fallback.indiefilm.club`.
3. **Rules → Configuration Rules → Create rule**: name "Filmmaker domains"; when **Hostname** does **not end with**
   `indiefilm.club` → **SSL: Full**. (Our server's certificate can't name their domain; Full still encrypts.)
4. **Custom Hostnames → Add Custom Hostname**: `watch.frackingthesystem.com` (default settings). It turns Active once
   the filmmaker's CNAME is in place and Cloudflare has issued the certificate (usually minutes).

**Server (Claude, at deploy time):** copy `deploy/nginx-own-domains.conf` → `/etc/nginx/sites-available/own-domains`,
symlink into `sites-enabled`, `nginx -t && systemctl reload nginx`. It's the catch-all for hosts no other block names;
the API forwards known own domains and shows "film not found" for anything else.

### Film addresses: how the wildcard works

Nothing is done per film: one wildcard covers them all (`*.indiefilm.club`, DNS + origin certificate + one nginx
block). The API serves the page at `/api/watch/page` from the built site's `watch/index.html` (`SITE_DIR`, default
`../site` next to the server). Films on their own domains (watch.theirfilm.com) need Cloudflare for SaaS later.

## Notes

- The FTS Stripe account also takes Fracking the System sales. Our Checkout sessions carry `metadata.app = watchmyfilm`
  and the API ignores everything else. The FTS webhook ignores our payments (it only matches its own transactions).
- Card statements and Stripe receipts show the FTS account's business name.
- Waiver codes are made on `/admin/` (only emails in `ADMIN_EMAILS`).
- Local dev: `cd server && npm run dev` (API on :5050, sign-in links print to the terminal), and `npm run dev` in the
  project root (site on :5173, proxies `/api`). Filmmaker site `http://localhost:5173`, viewer site
  `http://indiefilm.localhost:5173` (Browse), films at `http://<name>.indiefilm.localhost:5173`.
