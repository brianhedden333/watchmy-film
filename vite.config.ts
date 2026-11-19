import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

const SLASH_PAGES = ["/workflow", "/account", "/signup", "/signin", "/sample", "/dashboard", "/add-a-film", "/preview", "/library", "/browse", "/admin", "/terms", "/privacy"];

export default defineConfig({
  // Sub-path the site is served from. GitHub Pages project sites need
  // "/watchmy-film/" (set by the deploy workflow); a custom domain uses "/".
  base: process.env.BASE_PATH || "/",
  plugins: [
    react(),
    {
      // Dev server: send /signup etc. to their trailing-slash pages (production hosts do this already)
      name: "workflow-slash",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          // A film's own address (e.g. mountaingoat.localhost:5173) shows its live watch page, as nginx does in production.
          if (/^[^.]+\.localhost(:\d+)?$/.test(req.headers.host || "") && (req.url === "/" || req.url?.startsWith("/?"))) {
            req.url = "/watch/";
          }
          const path = req.url?.split("?")[0];
          if (path && SLASH_PAGES.includes(path)) {
            res.statusCode = 301;
            res.setHeader("Location", `${path}/${req.url!.slice(path.length)}`);
            res.end();
            return;
          }
          next();
        });
      },
    },
  ],
  // Dev: the API runs separately (cd server && npm run dev). API_URL points at another copy, e.g. for testing.
  server: {
    proxy: { "/api": process.env.API_URL || "http://127.0.0.1:5050", "/uploads": process.env.API_URL || "http://127.0.0.1:5050" },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        workflow: resolve(__dirname, "workflow/index.html"), // internal, not linked
        signup: resolve(__dirname, "signup/index.html"),
        terms: resolve(__dirname, "terms/index.html"),
        watch: resolve(__dirname, "watch/index.html"), // live watch page, served at each film's own address
        privacy: resolve(__dirname, "privacy/index.html"),
        // Account pages need the API server, so they're only built with VITE_ACCOUNTS=open
        ...(process.env.VITE_ACCOUNTS === "open" && {
          signin: resolve(__dirname, "signin/index.html"), // also where emailed sign-in links land
          dashboard: resolve(__dirname, "dashboard/index.html"), // list of the filmmaker's films
          addfilm: resolve(__dirname, "add-a-film/index.html"), // onboarding; also where each film is edited
          admin: resolve(__dirname, "admin/index.html"),
          account: resolve(__dirname, "account/index.html"), // name, email, password
          library: resolve(__dirname, "library/index.html"), // films the person has rented or bought
          preview: resolve(__dirname, "preview/index.html"), // the filmmaker's watch page, before it's live
        }),
        sample: resolve(__dirname, "sample/index.html"), // sample watch page (Fracking the System)
        browse: resolve(__dirname, "browse/index.html"), // public catalog of opted-in live films (not linked yet)
      },
    },
  },
});
