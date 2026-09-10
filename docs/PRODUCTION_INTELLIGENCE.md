# Production Intelligence Leap

This upgrade adds the missing layer between a good evidence-led script and a premium documentary-style finished video.

## What it adds

### 1. Media and B-roll intelligence

Each scene is assigned a visual role:

- real-world B-roll
- archival material
- maps
- charts
- documents
- diagrams
- quiet moments
- editorial headline resets

The production plan also carries search queries, shot treatment, motion language and scene priority.

### 2. Map storytelling

Existing `MapSpec` scenes are promoted into explicit production beats.

Maps should:

1. establish geography,
2. reveal the relevant route, cluster, point or boundary,
3. move in narration order,
4. retain a visible source label.

### 3. Data storytelling

Existing `ChartSpec` scenes are treated as visual claims rather than decorative dashboards.

Use:

- one claim per chart,
- narration-led reveal,
- visible sourcing,
- only the comparison being discussed.

### 4. Cinematic sound intelligence

The production layer reuses Origin Studio's Audio Director for:

- coherent documentary score,
- subtle ambience,
- transition whooshes,
- evidence ticks,
- restrained impacts,
- tension and resolution cues.

Sound should support narration, not compete with it.

### 5. Visual rhythm

The production layer marks visual resets when:

- visual roles change,
- a scene becomes long,
- a reveal needs emphasis,
- a quote needs space,
- a value change needs a pattern interrupt.

This reduces card fatigue.

### 6. Simple production mode

Open:

`/create`

The intended flow is:

`UPLOAD SOURCE → EXTRACT EVIDENCE → STORY QUESTION → FULL STUDIO → PRODUCTION INTELLIGENCE → RENDER`

The existing expert Studio remains available.

## Production-plan API

Endpoint:

`POST /api/production-plan`

Body:

```json
{
  "project": {}
}
```

Pass the normal `EpisodeProject`.

The response contains:

- shot plan
- media search prompts
- map beats
- chart beats
- audio direction
- rhythm resets
- production warnings
- production-readiness score

## Editorial principle

A visual should not be chosen just because it looks cinematic.

Every important visual should do at least one of these:

1. show evidence,
2. establish place,
3. explain mechanism,
4. create emotional breathing room.
