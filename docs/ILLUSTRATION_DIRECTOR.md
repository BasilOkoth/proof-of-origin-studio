# Illustration Director

This upgrade adds the missing `Kurzgesagt-style` capability family:

- visual metaphor selection
- illustration mode selection
- scale-comparison logic
- flow/system explanation logic
- hybrid style guidance
- per-scene illustrated frame planning

## Why it matters

Vox and Johnny Harris are strong references for:

- documents
- maps
- timelines
- archival material
- B-roll
- editorial structure

But Kurzgesagt adds something different:

- designed visual universes
- explanation through metaphor
- object continuity
- scale transformations
- system animation
- abstract ideas made intuitive

The Illustration Director helps Origin Studio decide when a scene should stop behaving like a documentary and start behaving like an explanatory animation.

## Modes

- `vox_documentary`
- `johnny_cinematic`
- `kurzgesagt_illustrated`
- `hybrid_world_explained`

For most episodes, `hybrid_world_explained` should be the overall default.

## What the API returns

`POST /api/illustration-director`

Body:

```json
{
  "project": {}
}
```

Returns:

- whether each scene should be illustrated
- the suggested explanation mode
- the chosen visual metaphor
- a mini frame-by-frame plan
- palette guidance
- motion guidance
- icon strategy
- transition style
- warnings
- illustration score

## Practical use

The renderer can use this in two ways:

1. planning only — show the direction in the studio UI
2. rendering — route illustration-heavy scenes into a dedicated illustrated Remotion component

The included `IllustrationConceptScene.tsx` is a starter renderer for that second path.
