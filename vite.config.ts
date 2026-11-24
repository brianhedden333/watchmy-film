import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// Pages for filmmakers: only on watchmyfilm.online.
const APP_PAGES = ["/signup", "/dashboard", "/add-a-film", "/admin", "/account", "/preview", "/workflow", "/sample"];
const SLASH_PAGES = ["/workflow", "/account", "/signup", "/signin", "/sample", "/dashboard", "/add-a-film", "/preview", "/library", "/browse", "/admin", "/terms", "/privacy", "/screening"];

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
          const host = (req.headers.host || "").replace(/:\d+$/, "");
          const port = (req.headers.host || "").match(/:\d+$/)?.[0] || "";
          const atRoot = req.url === "/" || req.url?.startsWith("/?");
          const first = `/${(req.url || "/").split(/[/?]/)[1] || ""}`;
          const club = host === "indiefilm.localhost" || host.endsWith(".indiefilm.localhost");
          // Each page lives on one site; on the other, pass through the sign-in hop to the right one (nginx does
          // the same in production). Filmmaker pages belong on watchmyfilm.online, Browse and My Library on the club.
          const hop = (url: string) => {
            res.statusCode = 302;
            res.setHeader("Location", `/api/auth/hop?next=${encodeURIComponent(url)}`);
            res.end();
          };
          if (club && APP_PAGES.includes(first)) return hop(`http://localhost${port}${req.url}`);
          if (!club && host === "localhost" && first === "/browse") return hop(`http://indiefilm.localhost${port}/${req.url!.replace(/^\/browse\/?/, "")}`);
          if (!club && host === "localhost" && first === "/library") return hop(`http://indiefilm.localhost${port}${req.url}`);
          // The viewer site, as nginx does in production: indiefilm.localhost:5173 is Browse, and a film's own
          // address (e.g. mountaingoat.indiefilm.localhost:5173) shows its live watch page.
          if (host === "indiefilm.localhost" && atRoot) req.url = `/browse/${req.url!.slice(1)}`;
          else if (/^[^.]+\.indiefilm\.localhost$/.test(host) && atRoot) req.url = `/watch/${req.url!.slice(1)}`;
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
    // changeOrigin: false keeps the browser's Host (e.g. frackingthesystem.localhost:5173), which the API uses to
    // find the film on a film's address, as nginx does in production. (The string shorthand would rewrite it.)
    proxy: {
      "/api": { target: process.env.API_URL || "http://127.0.0.1:5050", changeOrigin: false },
      "/uploads": { target: process.env.API_URL || "http://127.0.0.1:5050", changeOrigin: false },
    },
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
        screening: resolve(__dirname, "screening/index.html"), // admin test screening on indiefilm.club (private link)
        browse: resolve(__dirname, "browse/index.html"), // public catalog of opted-in live films (not linked yet)
      },
    },
  },
});
