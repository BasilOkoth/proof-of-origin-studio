# Editorial Director

The Editorial Director sits above Production Intelligence.

Production Intelligence decides **what kind of visual each scene needs**.

Editorial Director decides **how the episode should actually be edited**.

It adds:

- cold-open logic
- reveal timing
- quiet beats
- callbacks
- scene splitting into multiple editorial beats
- caption suppression during emotional or reflective moments
- music ducking before reveals
- pacing diagnostics
- visual reset logic
- authored callbacks to earlier imagery

## Why this matters

Premium explanatory video is not just:

`script → visuals`

It is closer to:

`question → tension → evidence → reveal → breath → explanation → callback → payoff`

The director therefore treats some scenes as multi-shot sequences rather than one visual card.

## API

`POST /api/editorial-director`

Body:

```json
{
  "project": {}
}
```

Returns:

- production plan
- editorial beats
- pacing diagnostics
- callbacks
- sound actions
- caption actions
- warnings
- editorial score

## Cinematic sequence API

`POST /api/cinematic-sequence`

This converts editorial beats into a cut list with:

- cut timing
- visual role
- transition type
- visual instruction
- audio instruction

This can later be consumed directly by Remotion to make the renderer follow the editorial plan automatically.
