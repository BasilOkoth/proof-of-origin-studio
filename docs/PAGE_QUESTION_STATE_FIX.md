# REQUIRED PAGE PATCH — preserve the user's story when uploading evidence

File to edit:

`src/app/page.tsx`

The current `ingestDocument()` function overwrites the Story tab with the uploaded document's suggested topic/question/brief.

Replace the ENTIRE current `ingestDocument` function with this version:

```tsx
  async function ingestDocument(file: File | undefined) {
    if (!file) return;
    setDocumentBusy(true);
    setDocumentError("");

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", sourceKind);

      const response = await fetch("/api/document-ingest", {
        method: "POST",
        body: form,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to ingest source.");
      }

      const parsed = data.result as DocumentIngestion;
      const merged = [...evidence, ...parsed.evidence];

      /*
       * STORY CONTEXT POLICY
       *
       * If the user is already building a World Explained / Investigation /
       * Explainer / Case Study story, the uploaded document is evidence for
       * that story. It must not silently replace the user's topic, big
       * question or systems brief.
       *
       * Research/report mode may still be inferred when the source itself is
       * the story and the user has not chosen a broader story mode.
       */
      const preserveStoryContext =
        mode === "world_explained" ||
        mode === "investigation" ||
        mode === "explainer" ||
        mode === "case_study";

      const nextMode: StoryMode = preserveStoryContext
        ? mode
        : sourceKind === "research"
          ? "research"
          : sourceKind === "report"
            ? "report"
            : mode;

      const nextTopic = preserveStoryContext
        ? topic
        : parsed.suggestedTopic;

      const nextQuestion = preserveStoryContext
        ? question
        : parsed.suggestedQuestion;

      const nextBrief = preserveStoryContext
        ? brief
        : parsed.suggestedBrief;

      setMode(nextMode);
      setEvidence(merged);

      if (!preserveStoryContext) {
        setTopic(nextTopic);
        setQuestion(nextQuestion);
        setBrief(nextBrief);
      }

      const base = buildStoryEpisode({
        mode: nextMode,
        channelName: "Evidence Studio",
        byline: "The world explained through evidence",
        topic: nextTopic,
        question: nextQuestion,
        experiment: nextBrief,
        audience,
        targetMinutes: minutes,
        evidence: merged,
      });

      base.assets = project.assets;
      base.documentIngestion = parsed;

      setProject(applyVisualIntelligence(base, datasets));

      /*
       * Reset only the scout's manual search query. Do NOT reset the user's
       * Story-tab topic/question/brief.
       */
      setScoutQuery("");

      await runEvidenceScout({
        nextEvidence: merged,
        nextDatasets: datasets,
        nextTopic,
        nextQuestion,
        nextSearchQuery: "",
        autoOpen: true,
      });
    } catch (error: any) {
      setDocumentError(
        error?.message || "Document ingestion failed."
      );
    } finally {
      setDocumentBusy(false);
    }
  }
```

## Why this is required

Previously, this sequence happened:

1. User chose `World Explained`.
2. User entered `Why Nairobi floods`.
3. User entered `Why does Nairobi flood so often?`.
4. User uploaded a research PDF.
5. `ingestDocument()` switched Story Mode to `research`.
6. It replaced Topic with the PDF title.
7. It replaced Big Question with the PDF's auto-generated question.
8. Evidence Scout therefore never received the user's intended story question.

After this patch, an uploaded PDF behaves as **evidence**, not as a new editorial assignment, whenever the current story mode is World Explained, Investigation, Explainer or Case Study.
