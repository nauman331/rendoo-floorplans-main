# Rendoo Floorplans — handover briefing

> For an experienced full-stack dev with AI/CAD experience taking over this
> codebase to ship it for paying customers.
>
> Companion to `README.md`. This file describes **what's built and what's not**
> in the current codebase — read it before changing anything substantial.
>
> The roadmap (V1 → V2, scope, priorities) lives in the separate briefing
> document delivered alongside this handover. This file is intentionally
> roadmap-free so the two documents cannot drift out of sync.

---

## 1. Product context

**Rendoo** delivers visual communication for property developers in NL/BE.
The Floorplans app automates what is currently a manual done-for-you
service: turning an architect's drawing (DWG/DXF/PDF) into a commercial
sales-grade floorplan in a chosen mood/style.

**Phase 1 goal** — replicate the existing service (woningtype-level
floorplans, 2D Basic or 2D Luxe), so margin per project goes up and
turnaround time goes down. Customers are property developers wanting to
render plans for 5–200 units per project.

---

## 2. Tech stack

- **Framework**: Next.js 16.2.2 (App Router, server components) + React 19.2.4 + Tailwind v4
- **State**: Zustand with `persist` middleware (localStorage)
- **AI**:
  - `@anthropic-ai/sdk` 0.82 — Claude Opus 4.6 for feedback parsing
  - `@google/generative-ai` — Gemini 2.5 Pro Vision for unit detection
- **CAD/PDF parsing**:
  - `dxf-parser` (npm) — native DXF
  - `@mlightcad/libredwg-web` (WASM) — native DWG, no external installs needed
  - `pdfjs-dist` — PDF vector extraction
- **System dependencies** (currently installed via Homebrew on the dev box;
  must be packaged for production via Dockerfile):
  - `poppler` → `pdftoppm` for PDF rasterization
  - `librsvg` → `rsvg-convert` for SVG rendering
  - `python3` + `Pillow` for image trim/processing
- **Deploy**: Railway. Verify all binaries above are in the production image.

---

## 3. Architecture & data flow

### User flow

The user walks through these routes:

1. `/nieuw` — project name only, creates a draft project in localStorage
2. `/project/[id]/niveau` (Step 1/4) — woningtype / verdieping / project (only woningtype enabled today)
3. `/project/[id]/stijl` (Step 2/4 part 1) — pick 2D Basic vs 2D Luxe
4. `/project/[id]/stijl/voorbeelden` (Step 2/4 part 2) — pick a specific example from the gallery
5. `/project/[id]/branding` (Step 3/4) — primary/secondary/accent colors with HEX + RGB inputs (Basic only; auto-skipped for Luxe)
6. `/project/[id]/input` (Step 4/4) — three separate drop zones for DXF / DWG / PDF + optional CSV unit list
7. `/project/[id]/validatie` — type confirmation, polygon editing, AI training
8. `/project/[id]/resultaat` — per-unit cropped + styled view, feedback iteration

### Upload pipeline (`POST /api/upload`)

- **DXF**: parsed in-process via `dxf-parser` → walls + texts cached as `{fileId}-dxf.json`
- **DWG**: parsed via `libredwg-web` WASM → same `DxfExtraction` shape cached. Also: `dwg_to_svg` → `rsvg-convert` PNG saved as `{fileId}.png` for vision fallback
- **PDF**: rasterized via `pdftoppm` → `{fileId}.png`

### Analysis pipeline (`POST /api/analyze`)

- If DXF cache exists with detected regions: build analysis from geometry + CSV
- Otherwise: send the PNG to Gemini Vision with the detection prompt + few-shot training examples + extracted text labels as hints
- Post-process: mirror pairing heuristic (B2/B3 pairs), bowtie polygon auto-fix, CSV classification overrides

### Result page rendering

- `PlanRenderer` canvas component, raster mode: crop the unit polygon from the original raster, apply palette CSS filter (sepia/saturate/hue-rotate per palette), polygon clip mask, wall outline overlay
- Type tabs across the top let users switch between Type A / Type B / Type C
- Annotation overlay: click to drop circle/rectangle, drag body to move, drag handles to resize, +/− buttons for size

### Feedback iteration (max 5 rounds)

- Local heuristic parser handles common Dutch shapes
  ("vervang de bank door een hoekbank", "voeg een plant toe", "weg met die loungestoel")
- When the parser returns nothing, fall through to Claude Opus 4.6 via `/api/apply-feedback` —
  sends feedback text + annotation + room context, gets back a structured JSON array of edits
- Edits are validated against the furniture catalog and stored on the project;
  the renderer applies them as overlay icons at annotation positions

### Project store

`stores/project-store.ts` holds everything: niveau, outputType (basic/luxe),
exampleId, branding (colors), files, analysis, feedback rounds, edits.
Persisted via localStorage.

### Cache structure in `/uploads/`

- `{fileId}.{ext}` — original uploaded file
- `{fileId}.png` — rasterized version for vision (PDF/DWG)
- `cache/{fileId}-dxf.json` — parsed walls + texts + regions
- `cache/{fileId}.json` — final analyzed units (Gemini output)
- `cache/{fileId}-csv.json` — parsed CSV unit list
- `training/examples.json` — manually corrected polygons for few-shot learning

---

## 4. Key files

A reading order roughly matching pipeline order:

| Path | Role |
| --- | --- |
| `app/api/analyze/route.ts` | orchestrates Gemini → Claude vision fallback, mirror heuristic, bowtie fix |
| `app/api/upload/route.ts` | multi-format upload: DXF/DWG/PDF, generates raster PNGs |
| `app/api/upload-dxf/route.ts` | DXF-specific upload + parsing |
| `app/api/apply-feedback/route.ts` | Claude API fallback for feedback parsing |
| `app/api/training/route.ts` | save/load training examples |
| `lib/parsers/dwg-parse.ts` | WASM DWG parsing + SVG rendering |
| `lib/parsers/dxf-parse.ts` | DXF parsing |
| `lib/parsers/pdf-extract.ts` | PDF wall extraction via pdfjs |
| `lib/parsers/room-detection.ts` | grid-based room flood fill |
| `lib/conversion/pdf-to-png.ts` | pdftoppm → PNG converter |
| `lib/render/palettes.ts` | 17 hand-tuned palettes with rasterFilter |
| `lib/render/furniture.ts` | 22 furniture items with draw functions |
| `lib/render/room-layout.ts` | guillotine packer for template renderer |
| `lib/render/parse-feedback.ts` | NL keyword parser for feedback |
| `lib/ai/gemini-detection.ts` | Gemini Vision prompt + few-shot |
| `lib/ai/prompts.ts` | Claude vision prompt templates |
| `components/render/PlanRenderer.tsx` | canvas renderer (raster mode + template fallback) |
| `components/viewer/PlanCanvas.tsx` | editable polygon viewer for /validatie |
| `components/flow/InputStepIndicator.tsx` | step indicator |
| `scripts/patch-libredwg.mjs` | postinstall fix for libredwg-web Vite bug |

---

## 5. What works today (end-to-end)

- ✅ Multi-step input flow with draft persistence in localStorage
- ✅ DXF parsing → wall geometry → unit detection → polygon overlay
- ✅ DWG parsing via WASM (no installs) → rendering to PNG via SVG
- ✅ Complex PDF handling via pdftoppm
- ✅ Gemini Vision unit detection with mirror pairing + bowtie auto-fix
- ✅ Per-unit cropped view on `/resultaat` with palette filter
- ✅ Annotation tools (circle/rectangle with drag + resize handles)
- ✅ Feedback iteration (local parser + Claude fallback, max 5 rounds)
- ✅ AI training pipeline (corrected polygons → few-shot for next analysis)
- ✅ 17 hand-tuned palettes with rasterFilter for consistent style look

---

## 6. What doesn't really work — critical for commercial use

### A. No actual plan generation

The "generated plan" on `/resultaat` is a styled version of the uploaded
drawing — palette filter + polygon clip + text-label overlay. It is **not** a
redraw in the chosen style with:

- Real walls in the palette wallColor
- Floors with proper texture (plank/herringbone/tile per palette)
- Furniture placed per room
- Dimensions / labels with m²
- North arrow, scale bar, title block

There IS a template renderer in the code (`PlanRenderer` template mode +
furniture library + room-layout guillotine packer), but it's only used as a
fallback when there's no raster image. For real plan generation, a tech
direction needs to be picked:

1. **Konva/canvas template renderer improved** — no AI cost, but requires accurate per-room geometry (see B)
2. **AI image-to-image** (Stable Diffusion / Flux via Replicate API) — best visual variety, but API cost and output drift
3. **Hybrid** — Konva for structure, AI for textures/finishing

### B. No per-room detection

We detect units (apartment boundaries) but not the rooms within them.
Gemini returns `unit.rooms[]` with type+label but **without position**. Needed for:

- Per-room labels on the rendered floorplan
- Auto-furniture placement (which room is the kitchen?)
- Feedback like "replace the sofa in the living room"
- Furniture catalog filtering per room

### C. No authentication / multi-tenancy

- `/` shows a login/register UI but no backend — submit just routes to `/nieuw`
- No user table, no sessions, no API auth
- Project state lives in localStorage of one browser
- No project history / dashboard
- No team sharing

### D. No persistent storage

- Uploads on local disk (`/uploads/`) → wiped on Railway redeploy / doesn't work on multi-server
- Project data in browser localStorage → 1 user, 1 device, 1 browser
- No database

### E. No export

- `PlanRenderer` has `toDataURL()` but no UI to download PNG/PDF
- No multi-page PDF for projects with multiple unit types
- No branded title block (logo / project info)

### F. No multi-floor / multi-page support

- One upload per project
- A DWG with 4 floors gets analyzed as one flat plan
- A PDF with 5 sheets only uses sheet 1

### G. Half-built features

- **Furniture catalog picker**: placeholder details block in feedback; no actual UI to pick furniture
- **Verdieping/project niveau**: buttons say "Coming soon" but aren't structurally supported
- **3D plans**: same
- **Fact sheet template** (mentioned by Nick): doesn't exist
- **Logo placement**: deliberately deferred

### H. Robustness gaps

- Many error paths `console.error/warn` but don't surface to the user
- Gemini analysis takes 10–30s with no progress feedback
- Large DWG files (>50MB) can blow the WASM heap
- No retry logic on API failures
- No rate limiting

---

## 7. Roadmap & scope — see the briefing

The prioritized roadmap, scoping decisions, and split between V1 (manual-first
paid pilot) and V2 (fully automated ideal) live in the separate briefing
document delivered alongside this handover. That briefing is the single source
of truth for what to build and in what order — please refer to it for scope,
priorities, and the V1 → V2 evolution.

This file (HANDOVER.md) only describes **what exists today** in the codebase and
where to find it. It deliberately does not duplicate the roadmap so the two
documents can never drift out of sync.

### Continuous improvement (regardless of V1/V2)

- More training examples collected via the existing pipeline → better unit detection over time
- Prompt engineering on the Gemini detection prompt (already extensive, but each new customer type reveals edge cases)
- A/B test rendering quality with real Rendoo customers

---

## 8. Risks & open questions

- **AI cost scaling** — at 100 projects/month with 5 feedback rounds each = 500 Claude calls + 100 Gemini calls. Budget and monitoring required.
- **DWG complexity** — every architect organizes DWGs differently. Layer naming, model vs paper space, multi-sheet — no standard. ~80% automatable; the rest needs a manual fallback.
- **Generated plan quality** — this is THE differentiator. If output is "good enough", it scales. If it doesn't feel "pro enough", customers stick with the manual service.
- **Training data** — more examples = better detection, but collecting them costs effort (manual polygon corrections from the Rendoo team).
- **Competition** — a few Dutch / German players do something similar. Differentiation on style choice + flow.

---

## 9. Getting started (for the new dev)

```bash
# Clone, install (postinstall patches libredwg-web automatically)
git clone <repo>
cd rendoo-floorplans
npm install

# System dependencies (macOS dev box)
brew install poppler librsvg
pip3 install Pillow

# Env: copy and fill in API keys
cp .env.local.example .env.local
# Set ANTHROPIC_API_KEY and GEMINI_API_KEY

# Run dev server
npm run dev
# Open http://localhost:3000
```

For production deployment notes (Docker / nixpacks bundling of poppler,
librsvg, python+PIL), see the briefing document.
