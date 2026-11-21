// watchmyfilm.online API. In production nginx serves the built site and passes /api and /uploads here.

import express from "express";
import { config } from "./config.js";
import "./db.js";
import { appOnly, authRouter, loadUser, purgeExpired } from "./auth.js";
import { filmsRouter } from "./films.js";
import { adminRouter } from "./admin.js";
import { libraryRouter, watchlistRouter } from "./library.js";
import { watchRouter } from "./watch.js";
import { browseRouter } from "./browse.js";
import { stripeWebhook } from "./payments.js";
import { connectRouter } from "./connect.js";
import { filmmakerSalesRouter, salesRouter } from "./sales.js";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", "loopback"); // real client IPs from nginx, for rate limits

app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), stripeWebhook);

app.use(express.json({ limit: "100kb" }));

// Changes must come from our own pages: a custom header can't be sent cross-site without CORS, which we never allow.
app.use("/api", (req, res, next) => {
  if (req.method !== "GET" && req.headers["x-wmf"] !== "1") return res.status(403).json({ error: "Forbidden." });
  next();
});

app.use("/api/watch", watchRouter); // public, no sign-in
app.use("/api/browse", browseRouter); // public catalog of opted-in live films
app.use("/api", loadUser);
app.use("/api/watch", salesRouter); // buying and watching on a film's own address (knows who's signed in there)
app.use("/api/auth", authRouter);
// Filmmaker tools: only with a watchmyfilm.online sign-in (an indiefilm.club sign-in is for watching).
app.use("/api/films", appOnly, filmsRouter);
app.use("/api/admin", appOnly, adminRouter);
app.use("/api/connect", appOnly, connectRouter);
app.use("/api/sales", appOnly, filmmakerSalesRouter); // the filmmaker's own sales list
// Viewer things: either site.
app.use("/api/library", libraryRouter);
app.use("/api/watchlist", watchlistRouter);
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api", (_req, res) => res.status(404).json({ error: "Not found." }));

app.use("/uploads", express.static(config.uploadDir, { maxAge: "7d", index: false, dotfiles: "deny" }));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong on our end." });
});

setInterval(purgeExpired, 3_600_000).unref();

app.listen(config.port, "127.0.0.1", () => console.log(`watchmyfilm API on http://127.0.0.1:${config.port}`));
