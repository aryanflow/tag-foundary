# Tag Foundry

A small **Google Tag Manager (GTM) “read-only workshop”** for the **public web container** embedded on a site. You point it at a public **container ID** (e.g. `GTM-XXXXXXX`) or paste a **`gtm.js`** response, then explore tags, variables, predicates, and rules, and **export a clean JSON** snapshot. The app **does not** connect to your GTM account and **does not** need publish access; it only uses what the browser would load from the public file.

![Tag Foundry banner](public/assets/banner.png)

![Tag Foundry app / website](public/assets/website.png)

Put your art under `public/assets/` and keep the filenames above, or **rename the files and edit the paths** in this README. The `public` folder is served at the site root, so an image at `public/assets/banner.png` is available as `/assets/banner.png` in the app.

---

## What this is for (useful, not hype)

**Performance marketers and growth teams**

- **Competitive and landscape review:** If a site exposes a GTM web container, that container ID is in the page. Loading the public **`gtm.js`** lets you see **which tags and patterns** are compiled into the snippet (e.g. GA4, ads pixels, other vendors), how **predicates and rules** are wired, and what the **rough firing shape** is. That supports honest answers to “what are they running in GTM?” for benchmarking or RFP context. It is **not** a substitute for their internal documentation or GTM UI; the public file can omit or simplify things (paused tags, consent, sequencing, sGTM, etc.).

- **Client conversations and pitches:** When a **client** is already poking at **GTM**, exporting **`gtm.js`**, or asking about tags, you can **ground the discussion in the same public data** the snippet ships: what’s in the file, what “fires when” summaries the tool infers, and a **JSON** export for tickets or a technical appendix. You pitch **clearly** (“here’s what the public container shows / here’s what we still need from your team or GTM access”) instead of generic claims.

- **Debug and handoff:** Turn a minified **gtm.js** into **readable lists** and a **cleaner JSON** for Slack, Jira, or a repo, without retyping structure by hand.

---

## What this does *not* do (so expectations stay honest)

- **No** Google login, **no** workspace access, **no** GTM edit or publish.
- Inferences in **“How it tracks”** are **heuristics** from the public `resource` (rules, predicates, tags), similar in spirit to Preview for common cases. **Consent mode, tag sequencing, server GTM,** and other edge cases may **not** match the full GTM or Tag Assistant experience. The UI says this explicitly.
- You should only use **public** data you’re allowed to fetch; respect **robots, terms, and privacy** for any site you analyze.

---

## How to run

```bash
npm install
npm run dev
```

The dev server includes a small proxy to fetch `gtm.js` by container ID. For production deploy, use `npm run build` and serve the `dist` output (see `package.json` and your host’s Node/static setup).

---

## Stack

- React, TypeScript, Vite, Tailwind CSS, Express (see `package.json`).

---

## Trademark

**Google Tag Manager** is a trademark of Google LLC. Tag Foundry is an independent tool and is not affiliated with or endorsed by Google.
