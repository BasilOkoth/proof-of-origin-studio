# EvidenceIntelligenceLab.tsx UI patch

In `src/components/EvidenceIntelligenceLab.tsx`, find this line inside the claim card:

```tsx
<p className="micro">{claim.evidenceKind} · confidence {claim.confidence} · visual {claim.visualPotential}</p>
```

Replace it with:

```tsx
<p className="micro">
  {claim.role.replace("_", " ").toUpperCase()} · relevance {claim.relevance} · {claim.evidenceKind} · confidence {claim.confidence} · visual {claim.visualPotential}
</p>
<p className="muted" style={{ marginTop: 6 }}>
  {claim.relevanceReason}
</p>
```

This makes the relevance role visible during testing.
