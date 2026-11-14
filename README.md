# watchmy.film (working title)

Landing site for a service that builds custom-domain paywalls for
filmmakers who self-distribute.

## Run it

    npm install
    npm run dev      # http://localhost:5173
    npm run build    # production build in dist/

## Edit

- Prices, fees, founding-film count: `src/config.ts`
- Request form: set `site.formEndpoint` in `src/config.ts` (e.g. a Formspree
  endpoint). Until then the form says it isn't connected rather than
  pretending to send.
- Copy and sections: `src/App.tsx`. Styles: `src/styles.css`.

## Not built yet

The page describes the product; the product itself (Stripe Connect,
watch pages, video hosting, magic-link sign-in) is still to be built.
