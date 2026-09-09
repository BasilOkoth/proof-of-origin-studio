# Evidence Intelligence Layer

Evidence Studio's intelligence layer turns Evidence Scout results and uploaded files into a persistent research workspace that can drive story selection.

## Pipeline

Evidence Scout / local upload
→ Persistent Evidence Library
→ Automatic open-file ingestion
→ Claim ↔ source graph
→ Contradiction screening
→ Story Hunter
→ Existing Story + Visual Intelligence + Render pipeline

## Persistent Evidence Library

The current production implementation uses IndexedDB in the user's browser on the deployed Evidence Studio domain.

It persists:
- source metadata
- access / license signals
- extracted evidence
- extracted text (capped for working context)
- dataset analysis
- the original open/local file as a Blob when it is ingested
- review status

This survives page reloads and does not require a server database.

Boundary: browser IndexedDB is device/browser/domain-specific. Clearing site data removes it. A future storage adapter can persist the same record shape to Supabase, S3, Cloudflare R2 or another durable team store for cross-device work.

## Automatic open-file ingestion

`POST /api/open-ingest`

Supported:
- PDF
- CSV
- ZIP containing CSV (including World Bank CSV download packages)
- TXT / Markdown
- JSON text

Safety controls:
- HTTPS only
- private/local network targets rejected
- DNS resolution checked against private ranges
- redirects checked one hop at a time
- maximum 5 redirects
- maximum 8 MB file
- automatic ingestion requires an explicit license/access signal from Evidence Scout

Open PDFs are parsed with `pdf-parse` and run through the document evidence extractor.
Open CSV/ZIP data are analyzed by the existing Data Story Engine.

## Claim ↔ source graph

The engine creates claim nodes from the evidence ledger and ingested library evidence, then links each claim back to persistent source records.

Relations:
- supports
- contradicts
- limits
- context

The graph is a screening and traceability layer. It does not claim that lexical similarity proves scholarly support.

## Contradiction detection

The first production version screens for:
- overlapping claims with opposing polarity
- opposing directions of change (increase vs decrease, higher vs lower, etc.)
- explicit uncertainty and limitations

Contradiction findings are prompts for source review, not automated truth judgments.

## Story Hunter

Story Hunter ranks angles using:
- evidence support
- curiosity
- stakes
- visual potential
- genuine tension
- originality

Supported angle families:
- contradiction
- causal
- systems
- comparison
- change
- unresolved

Choosing **Build this story** now carries the Story Hunter question, recommended title and opening hook into the episode generator before Visual Intelligence is re-run.

## Trust principle

Discovered metadata is not automatically treated as a verified substantive finding.
Candidate sources remain candidates until ingested/reviewed. The final human review remains essential before publication.
