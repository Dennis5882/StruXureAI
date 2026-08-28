# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

StruXureAI: a browser-only web app that turns CAD drawings (DWG/DXF) into a precise structural model (walls/columns/beams/grid as a node-member graph, world mm) and hands it off to **MIDAS Gen NX** via its Open API. Target market is Taiwan/Southeast Asia (+Korea), so layer names, drawing conventions, and text are often CJK. AI/vision recognition is scoped only for the no-DWG case (photos/scans) and is currently a mock stub — it is **not** the current focus. Analysis (loads, seismic, wind, load combos) is explicitly out of scope; that happens in Gen NX after handoff.

Read [docs/TODO.md](docs/TODO.md) first for current status — it is the single up-to-date source of truth for what's done, what's in progress, and why decisions were made. `README.md` documents the original architecture plan and a changelog that stops around v0.27; treat `docs/TODO.md` as authoritative for anything after that.

Other docs, load as needed:
- [docs/DRAWING_CONVENTIONS.md](docs/DRAWING_CONVENTIONS.md) — layer/member/label/encoding/scale conventions across regions (read before touching `classifyLayer`, `isAxisLayer`, encoding, or scale detection)
- [docs/STRUCTURAL_MODEL.md](docs/STRUCTURAL_MODEL.md) — extraction design (schema, coordinate system, algorithm rationale)
- [docs/ROADMAP.md](docs/ROADMAP.md) — staged roadmap / recommended path
- [docs/COMPETITIVE_TRACING.md](docs/COMPETITIVE_TRACING.md) — 1:1 comparison against MIDAS Gen NX's own native "CAD Tracing" feature (same B1F test drawing) — this is the closest thing to a competitive benchmark and the source of several correctness fixes

## Commands

No test suite and no linter are configured — there is no `npm test`/`npm run lint`.

```
npm run dev                       # Vite dev server
npm run build                     # production build (tsc types are NOT checked by build; vite build only)
npm run preview -- --port 4317    # serve the production build (used for manual + Playwright verification)
```

**Verification workflow** (this is the project's actual test methodology — use it after any change to extraction/geometry/model logic): build, run preview, load a real sample drawing from `dwg sample/` (not committed to git; ask the user if missing) through the UI with headless-browser automation (Playwright), then append `?debug=1` to the URL to expose `window.__store` (the zustand store) and `window.__counts` (extraction counters) for inspection. Compare structural counts (columns/walls/grid/nodes/free-ends) against the known-good baselines recorded in `docs/TODO.md` for that file (e.g. B1F: columns 60, walls 101, grid 18) to catch regressions — total wall length/coverage is not sufficient because it can't detect wrong split granularity (see TODO.md "E1").

There's no dedicated backend: DWG→DXF conversion happens client-side via a WASM module (`@mlightcad/libredwg-web`), loaded lazily via a Web Worker with main-thread fallback (`src/workers/dwgWorker.ts`).

## Architecture

**Single entry point.** `index.html` → `src/main.tsx` → `src/next/AppNext.tsx`. (A v1 UI shell existed in parallel until v0.42.0 and was removed — don't recreate a second entry.)

### Two coordinate/data layers — know which one you're in

1. **Canvas layer** (`src/types/drawing.ts` `StructureLineData`, store's `lines[]`): pixel coordinates, used for rendering/editing on the Fabric.js canvas. Has a `source: 'CAD'|'AI'|'MANUAL'` tag and a `type: 'WALL'|'COLUMN'|'BEAM'|'CENTER_LINE'`.
2. **World model** (`src/types/structural.ts` `FloorModel`/`BuildingModel`): world millimeters, a real node-member graph — members (`SColumn`/`SWall`/`SBeam`) reference `SNode` ids, so shared joints are shared nodes, not just coincident coordinates. This is the single source of truth for MIDAS export, DXF re-export, and the review UI. Built from the canvas layer by `buildStructuralModel` (`src/utils/structuralModel.ts`), which also owns `canvasToWorld`/`worldToCanvas` — the **only** sanctioned bridge between the two coordinate spaces. Each model member carries a `lineId` back-reference to its originating canvas line, so canvas-side deletes/undo can keep the model in sync (see `useDrawingStore`'s `deleteMember`/`undoLine`).

Both spaces need `DxfTransform` (in the store) to convert: `scale` (px per drawing-unit) + `minX`/`maxY`/`pad` for canvas placement, plus `unitMm` (drawing-unit → mm; usually 1, but see scale auto-calibration below). Any mm-valued constant in extraction code must go through `mmPx = scale/unitMm`, never `scale` alone — this exact bug (a px "floor" constant blowing up in world terms at small `scale`) has recurred multiple times (see TODO.md "D2", the `gapCap`/`perpTol` fixes).

### Pipeline (roughly load → classify → extract → topology → model → export)

- `src/utils/fileLoader.ts` — file intake (`loadFile`/`loadFiles`), DWG→DXF via WASM worker, drag-and-drop/upload entry.
- `src/utils/decodeDxf.ts` — auto-detects GBK/Big5 vs UTF-8 CJK encoding by measuring invalid-UTF-8 byte ratio (DWG codepage headers are unreliable — see DRAWING_CONVENTIONS.md §4).
- `src/utils/drawingScale.ts` — auto-detects when a drawing is drawn at N× true scale (common Taiwan/China convention: geometry is 2× and `DIMLFAC=0.5` compensates in dimension text) by finding consistent ratios across adjacent dimension-text chains. Feeds `DxfTransform.unitMm`.
- `src/utils/geometry.ts` (largest file, ~1100 lines) — the extraction core: `classifyLayer`/`isAxisLayer` (keyword-based, CJK-aware), `extractStructuralModel` (walls = matched face-pairs → centerline+thickness, columns = `minAreaRect` for rotated sections, beams via shared `pairFaces` helper), `parseBeamLabel` (regex-parses 平法/flat-method beam labels like `"KL(1) 200X400"` for depth, which plan geometry alone cannot give), `splitWallsAtJunctions`/`splitLinesAtColumns` (splits members that pass through a column/T-junction instead of leaving one long unconnected run), `cleanupTopology` (snaps free ends to nearby columns/intersections, clusters near-coincident endpoints into nodes).
- `src/utils/structuralModel.ts` — `buildStructuralModel` promotes canvas lines + grid into the world-mm `FloorModel` node-graph (tolerance-based node merging via a spatial hash, not coordinate rounding — rounding-bucket merging was a past bug). `classifyMemberEnds` labels every open member end as unresolved (🔴 real defect — a nearby member exists but didn't connect) / at-column (⚪ fine) / open (✅ legitimate boundary/opening) — this replaced a naive "any degree-≤1 end is a warning" check that was ~45% false positives.
- `src/utils/midasExport.ts` — `FloorModel`(s) → MIDAS Gen NX Open API request sequence (`buildMidasRequests`/`buildMidasRequestsBuilding`) or a downloadable Python script (`toPythonScript`); `sendMidas` posts directly to the Gen NX cloud relay (`moa-engineers.midasit.com`) using a user-supplied MAPI key — columns/beams → `BEAM`, walls → vertical 4-node `PLATE`.
- `src/utils/dxfExport.ts` — `FloorModel` → ASCII DXF (R12/AC1009 for strict-importer compatibility) for round-tripping into other CAD tools.

### UI shell (`src/next/`)

`AppNext.tsx` is the top-level shell: `StepperBar` (5-step workflow: open → layers → extract → review → send-to-Gen-NX) + `Workspace` (the Fabric.js canvas, in `src/components/Workspace.tsx`, also ~1100 lines — DXF background rendering, structural-member overlay, crop mode, vertex editing) + `RightDock` (three tabs: Layers/Review/Export, under `src/next/tabs/`) + `BottomBar` (live counts) + `ManualPanel`. `workflow.ts` is a pure-function module deriving stepper state and the `ModelQuality` review metrics from a store snapshot — it deliberately doesn't touch the store itself, so both the stepper UI and the canvas amber-highlight logic can share one definition of "what counts as a problem."

State lives in one flat zustand store (`src/store/useDrawingStore.ts`) — canvas lines, DXF entities/layers/transform, the crop region, scale detection + user override, the `FloorModel` (`model`), saved floor snapshots for multi-story (`floors[]`), and file-loading progress.

### Multi-story

Floors are collected as independent `FloorModel` snapshots (`store.floors[]`, via `saveCurrentAsFloor`) rather than loading multiple DWGs into one live model — each floor is extracted from its own drawing/crop and stacked at export time (`buildMidasRequestsBuilding`, `buildBuildingDxf`) by translating world Z per floor's `elevation`. Shared-node continuity across floor boundaries comes from matching (x,y) at export, not from a persistent cross-floor graph.

## Working conventions specific to this repo

- **Ground truth is the drawing, not the competitor.** MIDAS Gen NX's own native Tracing feature was used as a benchmark (`docs/COMPETITIVE_TRACING.md`), but at least once its output was blindly treated as "correct" and that was wrong (TODO.md "E4" — Gen NX's own idealization broke a real face-sharing condition present in the source DWG). When in doubt, go back to raw DXF coordinates.
- **Never silently move geometry to fix a symptom.** Several attempted fixes (grid-snapping walls, extending free ends) were reverted after measurement showed they were shifting real geometry to paper over a metric, rather than fixing a cause (TODO.md "E2b", "E4" 폐기 항목). Structural modeling decisions (offsets, rigid links, idealization) require an explicit, visible decision — not a quiet coordinate nudge.
- **px-valued constants are a recurring bug source.** Any distance/tolerance constant in extraction code that's expressed in raw pixels will misbehave at extreme `scale` (huge multi-floor sheets vs. tightly cropped single floors) — convert through `mmPx = scale/unitMm` and set a world-mm floor, not a px floor.
- **`?debug=1` is the debugging/verification hook** (`window.__store`, `window.__counts`), kept out of the normal UI deliberately and safe to leave in production code.
- Version bumps: `package.json` version + README changelog entry accompany meaningful commits (see git log for the established message style: Korean, `유형: 설명 — vX.Y.Z`).
