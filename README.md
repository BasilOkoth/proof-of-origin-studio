# Proof of Origin Studio

A premium, truth-first video operating system for **HPS, provenance, digital trust, authenticity, AI-generated content and verification experiments**.

The system is intentionally broader than a product-demo generator. It is designed to help build a channel around the larger question:

> **How do we know where digital information came from, and what changed along the way?**

## What it does

### 1. Experiment intake
Start from a real question and controlled test rather than asking AI for a random video idea.

### 2. Evidence ledger
Every episode separates:

- **Observed** — what actually happened
- **Inference** — what you think the evidence suggests
- **Limitation** — what the experiment does not prove

This is the main anti-"AI slop" mechanism.

### 3. Episode generator
The built-in generator creates a 6–8 minute story structure:

1. Hook
2. Setup
3. Controlled change
4. What HPS checks
5. Result
6. Interpretation
7. Trust boundary / limitation
8. Real-world workflow
9. Bigger idea
10. CTA / next experiment

### 4. Premium Remotion visuals
Included visual scene types:

- cinematic hook
- document card / evidence screenshot
- before → after value change
- provenance proof card
- relationship-confidence meter
- explanatory flow diagram
- transformation timeline
- quote / principle
- CTA

### 5. Shorts engine
One episode produces 3 short-form scripts.

### 6. Thumbnail lab
Three non-clickbait thumbnail concepts are generated from the experiment.

### 7. Publishing package
Generates:

- title options
- YouTube description
- pinned comment
- LinkedIn launch copy
- markdown script package
- render-ready project JSON

### 8. Remotion rendering
The JSON project can be rendered into a real MP4 with Remotion.

---

## Install

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

---

## Render a finished MP4

In the Studio, click **Download render project**.

Save the JSON somewhere in the repo, for example:

```text
episodes/receipt-test.json
```

Then run:

```bash
npm run render -- episodes/receipt-test.json
```

The video is written to:

```text
renders/receipt-test.mp4
```

You can also specify an output path:

```bash
npm run render -- episodes/receipt-test.json renders/my-video.mp4
```

---


## Render Shorts

Render Short 1:

```bash
npm run render:short -- episodes/sample-receipt-test.json 0
```

Render Short 2:

```bash
npm run render:short -- episodes/sample-receipt-test.json 1
```

The vertical master is **1080×1920**.

## Render thumbnail concepts

```bash
npm run render:thumbnail -- episodes/sample-receipt-test.json 0
```

This outputs a **1280×720 PNG** thumbnail.


## Optional AI provider

The Studio works without an AI API.

If you want a model to assist with hooks, titles and script refinement, copy:

```bash
cp .env.example .env.local
```

Then configure an OpenAI-compatible endpoint:

```text
AI_BASE_URL=
AI_API_KEY=
AI_MODEL=
```

The API route is:

```text
POST /api/ai
```

The current UI deliberately uses the built-in generator by default so the system remains usable with no paid API.

---

## Suggested production workflow

### Phase A — experiment

1. Run the real HPS test.
2. Save screenshots.
3. Record exact results.
4. Write limitations.

### Phase B — Studio

1. Enter the big question.
2. Enter the controlled experiment.
3. Populate the Evidence Ledger.
4. Upload screenshots.
5. Click **Build premium episode**.
6. Review the story map.
7. Export the script and render JSON.

### Phase C — narration

For the best long-term channel identity, use your own voice when practical.

For AI narration, generate a voice track externally from the exported narration script. A future version of Origin Studio can make narration-provider adapters directly.

### Phase D — render

Render with Remotion.

### Phase E — publish

Use the title/thumbnail/publishing package, then turn the same experiment into Shorts.

---

## Editorial rules

Every HPS-related episode should obey these rules:

1. Do not call a document "authentic" solely because it is similar to a registered asset.
2. Exact SHA-256 is the strongest exact-file identity signal.
3. A related/modified result means a relationship was found, not that the candidate content is unchanged.
4. HPS does not prove factual truth.
5. Do not turn an inconclusive result into a fraud claim.
6. Show real observed results on screen.
7. Use fictional/sample documents for public demonstrations where possible.
8. Separate presentation noise from material content changes.
9. Keep limitations in the final edit.
10. Prefer an interesting experiment over a generic explainer.

---



## Automatic HPS ingestion

The first tab is now **HPS Ingest**.

You can either:

1. paste the visible result from the HPS verifier, or
2. provide a public `humanprovenancestandard.org` record/result URL.

The Studio extracts, where present:

- HPS record ID
- exact / related relationship
- relationship confidence
- asset identity
- text-integrity result
- registry signature
- issuer/creator signature
- record status
- Text SimHash
- Content Integrity Witness status
- critical-value coverage
- unmatched registered/candidate values
- explicit old → new changes

It converts those observations into the Evidence Ledger and automatically
creates a viewer-first experiment question and episode architecture.

The parser is deliberately conservative. Missing data stays missing.

## Premium narration + sentence timing

The Narration tab supports two modes.

### Estimated timing

No external API required:

```text
Build timing without TTS
```

This produces sentence-level timing using a speaking-rate estimate. It is useful
for storyboard/caption testing.

### ElevenLabs premium narration

Add to `.env.local`:

```text
ELEVENLABS_API_KEY=...
```

You can either set a default voice in `.env.local`:

```text
ELEVENLABS_VOICE_ID=...
ELEVENLABS_MODEL_ID=eleven_multilingual_v2
```

or enter a **voice ID** in the Studio, then click:

```text
Generate premium narration
```

The server uses ElevenLabs' speech-with-timestamps endpoint. It returns audio
plus character-level alignment. Origin Studio converts that alignment into
**sentence-level timing**, updates the Remotion scene boundaries, and stores the
audio/timing track inside the exported project.

## Animated captions

When a narration track exists, rendered videos automatically include captions.

The caption engine:

- selects the active sentence from the narration timeline;
- animates the caption onto the frame;
- advances emphasis through the sentence as it is spoken;
- uses the same narration timing that controls scene boundaries.

This keeps narration, visuals and captions on one timing source instead of
manually synchronizing them.



## Automated HPS ingestion + premium narration

Version 0.3 adds the high-automation path:

```text
HPS result
→ Evidence Ledger
→ Episode
→ Narration
→ Sentence timing
→ Word timing
→ Animated captions
→ Render
```

### HPS Ingest

Paste an HPS verification receipt or public HPS URL.

The Studio extracts observable verification facts and creates the first episode
draft automatically.

### Timing without TTS

Use **Build timing without TTS** for a free pacing/caption dry run.

### Premium narration

Configure:

```text
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
ELEVENLABS_MODEL_ID=eleven_multilingual_v2
```

Then use **Generate premium narration**.

The system uses provider timing alignment to synchronize the narration,
sentence timeline, scene lengths and kinetic captions.

See:

`docs/AUTOMATION_PIPELINE.md`



## One-click cloud rendering

The **Publish** tab now includes:

```text
Generate Final Video
Generate Short 1
Generate Thumbnail
```

The hosted app renders the Remotion composition and downloads the finished
MP4/PNG automatically.

The JSON export remains as the editable production manifest.

See:

`docs/RENDER_CLOUD_RENDERING.md`

> Test the thumbnail first. Full 1080p rendering is CPU- and memory-intensive,
> so a very small Render.com instance may need an upgrade.

## Automatic HPS → narrated episode

The fastest production path is now:

```text
Paste HPS verifier output
→ auto-extract evidence
→ build episode
→ create timing dry run
→ generate premium narration
→ word-synced captions
→ render
```

### HPS ingestion

Paste either:

- the full candidate verification receipt;
- a public HPS record URL;
- an HPS record ID.

A full candidate receipt is best because it contains candidate-specific
relationship, text-integrity and witness results.

### Premium voice

Create `.env.local`:

```text
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=...
ELEVENLABS_MODEL_ID=eleven_multilingual_v2
```

You can override the default voice/model inside the Narration tab.

### Timing

Use **Build timing without TTS** before paying for final voice generation.

The premium voice path turns provider character alignment into:

```text
sentence timing
→ word timing
→ scene timing
→ animated captions
```


## Watch-Time / Retention Lab

The Studio now includes a **Retention Lab** specifically for watch-time design.

Before publishing it scores:

- hook strength
- pacing
- proof density
- curiosity
- clarity

It also generates an **attention map** showing planned:

- hook
- open loop
- proof moments
- pattern interrupts
- visual resets
- payoff
- CTA / next-video bridge

The score is an editorial diagnostic, **not a prediction or guarantee of YouTube
performance**.

After publishing, use actual YouTube audience-retention data as the source of
truth. See:

`docs/WATCH_TIME_PLAYBOOK.md`


## Recommended channel mix

The Studio is intended for a channel that is **bigger than HPS product tutorials**.

Recommended mix:

- **60%** problem-led experiments
- **25%** HPS stress tests / demos
- **15%** broader provenance and digital-trust education

Example topics:

- Can a forwarded WhatsApp PDF still be recognized?
- I changed one amount in a document. What happened?
- Does PDF → Word destroy provenance?
- Can a photo of a signed document still be linked to its source?
- What metadata survives a screenshot?
- What does a cryptographic signature actually prove?
- How should AI-generated research outputs disclose provenance?
- Why "looks official" is a weak trust signal
- HPS vs C2PA: different problems, overlapping goals
- Can we verify AI-assisted media without pretending it is human-made?

---

## GitHub

You can upload this entire folder as a new repository.

Suggested repo name:

```text
proof-of-origin-studio
```

Suggested description:

> Truth-first premium video production system for provenance, digital trust, AI authenticity and HPS experiments.

---

## Next upgrades worth building

1. native narration providers
2. automatic sentence timing
3. automatic captions / SRT
4. 9:16 Remotion compositions for Shorts
5. thumbnail image renderer
6. HPS record API integration
7. automatic evidence extraction from HPS verification JSON
8. episode manifest + HPS registration of the final video
9. content calendar
10. YouTube analytics feedback loop
