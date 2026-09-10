# Research Relevance Guard

This patch fixes evidence-discovery contamination.

## Problems fixed

1. Front matter such as dedications, acknowledgements, declarations and contents pages could be extracted as evidence.
2. A source from a different geography could replace the user's intended story location.
3. Weak search matches had an artificial relevance floor, allowing unrelated datasets to survive.
4. Question discovery could silently replace the user's original big question.
5. Strong-but-irrelevant datasets could rank highly because evidence strength and visual potential outweighed topical relevance.

## New behavior

### Front-matter exclusion

The document ingester now rejects:

- dedications
- acknowledgements
- declarations
- approval/certification pages
- contents pages
- references/bibliographies
- common personal dedication language

### Geographic lock

When the user's topic/question contains a clear proper-noun location, such as Nairobi, that location becomes a strong relevance anchor.

Evidence from other places may still survive as general background only when it strongly matches the phenomenon. It cannot silently become the main story.

### Question lock

The user's original big question is preserved as the top anchored question. Discovery can suggest refinements, but cannot replace the subject or geography without explicit user action.

### Dataset relevance

There is no longer a hard minimum relevance score. Weak matches can score near zero and be filtered.

For a Nairobi flooding story, unrelated indicators such as life expectancy or part-time employment should no longer survive the relevance gate.

## Expected Nairobi test

For:

Topic: `Why Nairobi floods`

Question: `Why does Nairobi flood so often?`

Expected top question:

`Why does Nairobi flood so often?`

Expected discovered evidence should prioritize:

- Nairobi flooding
- Nairobi drainage/stormwater
- Nairobi rivers/watersheds
- urban flood risk
- rainfall and drainage
- relevant urban growth/land-use context

Budalangi may appear only as background/comparison if it is strongly relevant. It should not replace Nairobi.
