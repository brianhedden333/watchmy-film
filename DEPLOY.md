# Deploying watchmyfilm.online

The site and API run on the DigitalOcean droplet (`root@164.92.121.73`, same box as Fracking the System and Stump).

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

1. DNS at the registrar: `A` records for `watchmyfilm.online` and `www` → `164.92.121.73`.
2. On the droplet: `mkdir -p /var/www/watchmyfilm/{site,server,deploy}`.
3. Create `/var/www/watchmyfilm/server/.env` from `server/.env.example` with:
   `NODE_ENV=production`, `APP_URL=https://watchmyfilm.online`, Stripe keys (FTS account), SendGrid key,
   `FROM_EMAIL` on the authenticated domain, `ADMIN_EMAILS`, `NOTIFY_EMAIL`.
4. From the Mac: `./deploy/deploy.sh` (starts the PM2 process), then on the droplet `pm2 save`.
5. nginx: copy `deploy/nginx-watchmyfilm.conf` to `/etc/nginx/sites-available/watchmyfilm`, symlink into
   `sites-enabled`, `nginx -t && systemctl reload nginx`.
6. HTTPS: `certbot --nginx -d watchmyfilm.online -d www.watchmyfilm.online`.
7. Stripe dashboard (FTS account) → Developers → Webhooks → add endpoint
   `https://watchmyfilm.online/api/stripe/webhook`, events `checkout.session.completed` and
   `checkout.session.async_payment_succeeded`. Put its signing secret in `.env` as `STRIPE_WEBHOOK_SECRET`, then
   `pm2 restart watchmyfilm --update-env`.
8. SendGrid: authenticate the domain `watchmyfilm.online` (adds DNS records) so sign-in emails don't land in spam.

## Notes

- The FTS Stripe account also takes Fracking the System sales. Our Checkout sessions carry `metadata.app = watchmyfilm`
  and the API ignores everything else. The FTS webhook ignores our payments (it only matches its own transactions).
- Card statements and Stripe receipts show the FTS account's business name.
- Waiver codes are made on `/admin/` (only emails in `ADMIN_EMAILS`).
- Local dev: `cd server && npm run dev` (API on :5050, sign-in links print to the terminal), and `npm run dev` in the
  project root (site on :5173, proxies `/api`).
