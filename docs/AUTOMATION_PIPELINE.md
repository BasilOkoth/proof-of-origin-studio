# HPS → Premium Video Automation Pipeline

The fast path is now:

```text
Run a real HPS experiment
→ paste the HPS verification receipt
→ Studio extracts the evidence
→ episode architecture is generated
→ narration timing is created
→ premium TTS is generated
→ captions are synchronized
→ Remotion renders the final video
```

## 1. Automatic HPS verification-result ingestion

Open **HPS Ingest**.

You can paste the visible HPS verification receipt or provide a public HPS URL.

The parser can extract:

- record ID
- exact/different-byte identity
- relationship class
- relationship confidence
- text-integrity result
- Text SimHash similarity
- registry signature state
- issuer/creator signature state
- record status
- critical-value witness state
- matched / unmatched critical-value counts
- explicit before → after changes
- textual deletions shown by the witness layer

It automatically creates an evidence ledger with:

- Observed facts
- Inference
- Limitations

The system must never convert an inference into an observed experimental result.

## 2. Episode assembly

The extracted evidence is converted into:

1. hook
2. setup
3. controlled change
4. what the verifier checks
5. observed result
6. interpretation
7. limitation
8. real-world relevance
9. conceptual payoff
10. next experiment

## 3. Free timing dry run

Click:

```text
Build timing without TTS
```

This generates:

- sentence timing
- word timing
- scene duration
- kinetic-caption timing

No external API is needed.

Use this to test watch-time pacing before generating final narration.

## 4. Premium narration

Configure `.env.local`:

```text
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=...
ELEVENLABS_MODEL_ID=eleven_multilingual_v2
```

Then click:

```text
Generate premium narration
```

The narration endpoint requests speech with character timestamps.

The Studio converts:

```text
character timestamps
→ sentence timestamps
→ word timestamps
→ scene timing
→ animated captions
```

The narration audio becomes the master editing clock.

## 5. Animated captions

The renderer uses precise word timestamps when available.

Caption behavior:

- six-word phrases
- active spoken word turns cyan
- active word scales slightly
- completed words remain bright
- upcoming words are muted
- caption panel stays near the bottom of frame

If only estimated timing exists, the same system still works using estimated
word boundaries.

## 6. Final render

The Remotion master combines:

- premium scene templates
- uploaded HPS evidence screenshots
- voice track
- word-synchronized captions

The exported project JSON contains the narration audio as a data URL in this
first version.

For larger-scale production, replace embedded audio with object-storage URLs.

## 7. Truth rule

Automation can speed up production.

It must not fabricate the experiment.

An HPS failure, bug or inconclusive result should remain visible in the episode.
That is part of the evidence and can be the most interesting part of the story.
