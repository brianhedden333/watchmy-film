import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [
    react(),
    {
      // Dev server: send /workflow and /account to their trailing-slash pages (production hosts do this already)
      name: "workflow-slash",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === "/workflow" || req.url === "/account") {
            res.statusCode = 301;
            res.setHeader("Location", `${req.url}/`);
            res.end();
            return;
          }
          next();
        });
      },
    },
  ],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        workflow: resolve(__dirname, "workflow/index.html"), // internal, not linked
        account: resolve(__dirname, "account/index.html"), // mockup, not linked
      },
    },
  },
});
