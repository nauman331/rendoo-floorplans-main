# Rendoo Floorplans

Web app that converts architect plans (DWG/DXF/PDF) into commercial sales-grade floorplans in a chosen style.

> 👉 **New on this codebase?** Read [`HANDOVER.md`](./HANDOVER.md) first. It's the briefing for whoever picks this up — what's built, what's mocked, and what to build next.

---

## Quick start

```bash
git clone <repo>
cd rendoo-floorplans
npm install                           # postinstall patches libredwg-web

# System binaries (macOS dev box)
brew install poppler librsvg
pip3 install Pillow

# API keys
cp .env.local.example .env.local
# Set ANTHROPIC_API_KEY + GEMINI_API_KEY

npm run dev
# http://localhost:3000
```

## Key entry points

- `app/nieuw/page.tsx` — start of the user flow
- `app/api/upload/route.ts` — multi-format upload pipeline
- `app/api/analyze/route.ts` — Gemini Vision unit detection
- `components/render/PlanRenderer.tsx` — canvas renderer
- `lib/render/palettes.ts` — 17 hand-tuned style palettes

## Stack

Next.js 16 (App Router) · React 19 · Tailwind v4 · Zustand · Anthropic SDK (Claude Opus 4.6) · Gemini 2.5 Pro Vision · `@mlightcad/libredwg-web` (WASM DWG parser) · `pdftoppm` · `rsvg-convert` · Pillow.

## Important notes for AI agents working on this code

- Next.js 16 has breaking changes from prior versions — see `AGENTS.md` and read `node_modules/next/dist/docs/` before assuming any API.
- The `@mlightcad/libredwg-web` package needs the `scripts/patch-libredwg.mjs` postinstall fix to work in Node — don't remove it.
- The full architecture is in [`HANDOVER.md`](./HANDOVER.md). The roadmap (V1 → V2, scope, priorities) lives in the separate briefing document delivered alongside the codebase.
