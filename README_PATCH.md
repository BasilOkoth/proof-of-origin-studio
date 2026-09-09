# Evidence Studio — Visual Intelligence Sprint

This is a cumulative patch for `BasilOkoth/proof-of-origin-studio`. It can be applied directly to the original HPS-focused repository, or on top of the earlier Evidence Studio core patch.

## Product shift

The studio now supports the editorial promise:

> **The world explained through evidence.**

The new layer does not try to imitate a generic AI-video generator. It makes evidence determine the visual grammar of the episode.

## What this sprint adds

### 1. World Explained story mode
A new premium story pack for geographic, scientific, policy, climate, development and systems explainers. It keeps Observed / Inference / Limitation separation while making room for maps, data, field evidence and source-visible storytelling.

### 2. Visual Reasoning Engine
Each scene receives a visual plan with:
- recommended visual type;
- reason for the recommendation;
- linked evidence IDs;
- confidence score.

The engine can recommend:
- source highlight;
- real evidence card;
- data chart;
- map story;
- timeline;
- comparison;
- systems diagram;
- field evidence;
- quote/minimal treatment.

A Visual Intelligence score evaluates:
- evidence density;
- visual variation;
- geographic context;
- data storytelling;
- source visibility.

### 3. Data Story Engine
Upload a CSV. The deterministic analyzer detects:
- numeric columns;
- year/date-like columns;
- category columns;
- latitude / longitude columns.

It can automatically create:
- line trends;
- bar charts;
- rankings;
- scatter plots.

The renderer turns the resulting chart specification into an animated Remotion scene.

### 4. Map Story Engine
A CSV containing latitude/longitude is converted into a mapped evidence scene. The renderer:
- places geocoded observations on a spatial canvas;
- sizes points by a numeric value when available;
- automatically uses an Africa-focused viewport when most observations fall within Africa.

This is intentionally an evidence map, not a decorative map. It only plots supplied coordinates and does not invent locations.

### 5. Research / report ingestion
Upload:
- PDF;
- TXT;
- Markdown.

The server extracts readable text and conservatively separates candidate evidence into:
- observed statements;
- interpretive statements;
- limitations.

The extractor is deterministic. It does not silently invent findings. Every imported statement retains the source filename and should be reviewed against the source before publication.

PDF extraction uses `pdf-parse`, added automatically to `package.json`.

### 6. Source-highlight scene
Research/report/investigation stories can promote source-backed evidence into a full visual scene. The source itself becomes part of the story rather than being hidden in the YouTube description.

### 7. Remotion upgrades
New renderable scene types:
- `data_chart`;
- `map_story`;
- `source_highlight`.

Generic diagrams and timelines can now receive story-specific labels instead of always showing HPS-specific wording.

### 8. Retention integration
Charts, maps and source-highlight scenes count as visible proof and visual resets inside the existing Retention Lab.

## Apply

From the root of `proof-of-origin-studio`:

```bash
python EvidenceStudioVisualSprint/apply_evidence_studio_visual_sprint.py
npm install
npm run build
```

The installer validates expected code locations before writing and creates `.pre-evidence-visual-sprint` backups of modified files.

## Quick test after installation

1. Open **Evidence**.
2. Select **World Explained**.
3. Upload a research/report PDF or enter evidence manually.
4. Upload `fixtures/africa_sites.csv`.
5. Open **Visual Intelligence**.
6. Confirm that a Data Story and Map Story appear.
7. Open **Story & Video** and preview the new scenes.
8. Build narration only after the storyboard is final; adding visual/data scenes clears stale narration timing deliberately.

## Validation performed for this patch

- Python installer syntax: passed.
- Installer transactional replacement test against original-style source fixture: passed.
- Upgrade-path test (Evidence Studio v1 patch → Visual Intelligence sprint): passed.
- Strict TypeScript check for types, Story Packs, Data Story and document evidence modules: passed.
- Strict TypeScript check for the generic story/visual reasoning layer with repository dependency stubs: passed.
- TypeScript syntax/type check for new Remotion visual components with framework stubs: passed.
- TypeScript check for the document-ingestion API route with framework/library stubs: passed.
- Runtime CSV analysis fixture: 5 rows → line chart + 5-point Africa-focused map: passed.
- Runtime document extraction fixture: observed / inference / limitation separation: passed.

A complete `npm run build` still needs to be executed inside the repository after `npm install`, because this sandbox does not contain the repository's npm dependency tree.

## Important current boundaries

This sprint is the first real Visual Intelligence implementation, not the final premium studio. It does **not yet** automatically fetch satellite imagery, licensed archival footage, web maps, stock media or external academic databases. Map scenes require supplied coordinates. Charts require uploaded structured data. Source ingestion extracts text but does not replace human review of study design or claims.

Those boundaries are deliberate: the tool should prefer a visible sourcing gap over invented evidence.

## Recommended next sprint

1. Claim ↔ source graph and citation display at sentence level.
2. Real geographic basemaps / GeoJSON layers and animated route/region highlighting.
3. Figure/table extraction from research PDFs.
4. Field-evidence ingestion: photos + GPS + notes + interviews.
5. Visual asset sourcing manifest: archive, satellite, field footage, illustration and screenshot requirements per scene.
6. YouTube Analytics feedback into Visual Intelligence and Retention Lab.
