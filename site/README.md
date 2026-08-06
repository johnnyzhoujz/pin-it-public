# Pin It marketing site

This directory contains the static marketing page for Pin It.

- Production: <https://get-pin-it.vercel.app>
- Entry point: `index.html`
- Previous design: `legacy.html`

No build step or environment variables are required.

## Local preview

From the repository root:

```sh
python3 -m http.server 4173 --directory site
```

Then open <http://127.0.0.1:4173/>.

## Deploy

The local `site/` directory is linked to the Vercel project named `pin-it`.

```sh
vercel deploy --prod --yes --cwd site
```

Local `.vercel/` metadata is intentionally ignored.
