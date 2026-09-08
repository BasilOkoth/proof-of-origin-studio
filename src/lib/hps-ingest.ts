import type {
  EvidenceItem,
  HpsDetectedChange,
  HpsIngestion,
} from "./types";

const compact = (value: string) =>
  value
    .replace(/\u00a0/g, " ")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();

function firstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return compact(match[1]);
  }
  return undefined;
}

function numberMatch(text: string, patterns: RegExp[]) {
  const value = firstMatch(text, patterns);
  if (value == null) return undefined;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function changeCategory(before: string, after: string) {
  const both = `${before} ${after}`;

  if (/(?:KES|KSH|USD|EUR|GBP|US\$|[$€£])/i.test(both)) {
    return "currency" as const;
  }
  if (/%/.test(both)) return "percentage" as const;
  if (
    /\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{1,2}-\d{1,2})\b/.test(
      both
    )
  ) {
    return "date" as const;
  }
  return "number" as const;
}

function detectChanges(text: string): HpsDetectedChange[] {
  const changes: HpsDetectedChange[] = [];

  const arrowRx =
    /((?:KES|KSH|USD|EUR|GBP|US\$|[$€£])\s*[\d,.]+|\b\d+(?:[.,]\d+)?%?)\s*(?:→|->|⇒)\s*((?:KES|KSH|USD|EUR|GBP|US\$|[$€£])\s*[\d,.]+|\b\d+(?:[.,]\d+)?%?)/gi;

  for (const match of text.matchAll(arrowRx)) {
    const before = compact(match[1]);
    const after = compact(match[2]);
    const index = match.index || 0;
    const context = text.slice(Math.max(0, index - 180), index);

    const label = firstMatch(context, [
      /(?:CURRENCY|NUMBER|DATE|PERCENTAGE)\s*[·:\-]\s*([A-Za-z][A-Za-z0-9 _/-]{2,55})\s*$/i,
      /(?:Amount paid|Subtotal|Total|Invoice total|Date|Percentage|Rate|Score|Quantity)\s*[:\-]?\s*$/i,
    ]);

    changes.push({
      kind: "value",
      category: changeCategory(before, after),
      label,
      before,
      after,
      raw: match[0],
    });
  }

  // Textual witness output such as DELETED · PHRASE / Deleted: in writing.
  const textDeleteRx =
    /(?:DELETED\s*[·:\-]\s*(?:PHRASE|TEXT|WORD|MIXED)[\s\S]{0,120}?Deleted:\s*)([^\n]{1,160})/gi;

  for (const match of text.matchAll(textDeleteRx)) {
    const before = compact(match[1]);
    if (!before) continue;

    changes.push({
      kind: "text",
      category: "text",
      before,
      raw: match[0],
    });
  }

  const seen = new Set<string>();
  return changes.filter((change) => {
    const key = [
      change.kind,
      change.label || "",
      change.before || "",
      change.after || "",
    ].join("|");

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function parseHpsResult(rawInput: string): HpsIngestion {
  const rawText = rawInput
    .replace(/\r\n/g, "\n")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1 $2");

  const recordId = firstMatch(rawText, [
    /\b(HPS-\d{4}-[A-Z0-9]{6,})\b/i,
  ])?.toUpperCase();

  const relationship = firstMatch(rawText, [
    /Relationship\s*[:\-]?\s*(RELATED\s*\/\s*MODIFIED|EXACT ASSET|REGISTERED DERIVATIVE|VERIFIED DERIVATIVE|CROSS-FORMAT MATCH|POSSIBLE DERIVATIVE|REVOKED)/i,
    /HPS[✓!]\s*(RELATED\s*\/\s*MODIFIED|EXACT ASSET|REGISTERED DERIVATIVE|VERIFIED DERIVATIVE|CROSS-FORMAT MATCH|POSSIBLE DERIVATIVE|REVOKED)/i,
  ])?.toUpperCase();

  const relationshipConfidence = numberMatch(rawText, [
    /Relationship confidence\s*[:\-]?\s*(\d{1,3})\s*\/\s*100/i,
  ]);

  const assetIdentity = firstMatch(rawText, [
    /Asset identity\s*[:\-]?\s*(Exact SHA-256|Different bytes)/i,
  ]);

  const textIntegrity = firstMatch(rawText, [
    /Text integrity\s*[:\-]?\s*(?:⚠\s*|✓\s*)?(Changed|Identical|Unavailable)/i,
  ]);

  const registrySignature = firstMatch(rawText, [
    /Registry signature\s*[:\-]?\s*(?:✓\s*|✕\s*)?(Valid|Invalid)/i,
  ]);

  const creatorSignature = firstMatch(rawText, [
    /Issuer\/creator signature\s*[:\-]?\s*(?:✓\s*|✕\s*)?(Valid|Not independently valid|Invalid)/i,
  ]);

  const status = firstMatch(rawText, [
    /Status\s*[:\-]?\s*(active|revoked|superseded)/i,
  ])?.toLowerCase();

  const simHashSimilarity = numberMatch(rawText, [
    /Text SimHash similarity is\s*(\d+(?:\.\d+)?)\s*%/i,
    /Text SimHash\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*%/i,
  ]);

  let criticalStatus: string | undefined;
  if (/Material value change detected/i.test(rawText)) {
    criticalStatus = "material_change_detected";
  } else if (/Critical-value comparison inconclusive/i.test(rawText)) {
    criticalStatus = "inconclusive";
  } else if (
    /Registered critical values accounted for/i.test(rawText) ||
    /No changed registered critical values found/i.test(rawText)
  ) {
    criticalStatus = "critical_values_consistent";
  }

  const matchedCriticalValues = numberMatch(rawText, [
    /HPS matched\s*(\d+)\s*(?:of\s*\d+\s*)?registered critical-value/i,
    /matched\s*(\d+)\s*registered critical-value anchors/i,
  ]);

  const registeredCriticalValues = numberMatch(rawText, [
    /HPS matched\s*\d+\s*of\s*(\d+)\s*registered critical-value/i,
    /accounted for all\s*(\d+)\s*registered critical-value/i,
  ]);

  const registeredValuesNotMatched = numberMatch(rawText, [
    /Registered values not matched:\s*(\d+)/i,
  ]);

  const candidateValuesNotExplained = numberMatch(rawText, [
    /Candidate values not explained:\s*(\d+)/i,
  ]);

  const detectedChanges = detectChanges(rawText);

  const observations: string[] = [];
  const limitations: string[] = [];

  if (recordId) observations.push(`HPS identified record ${recordId}.`);
  if (assetIdentity) observations.push(`Asset identity: ${assetIdentity}.`);
  if (relationship) observations.push(`Relationship: ${relationship}.`);
  if (relationshipConfidence != null) {
    observations.push(
      `Relationship confidence was ${relationshipConfidence}/100.`
    );
  }
  if (textIntegrity) observations.push(`Text integrity: ${textIntegrity}.`);
  if (simHashSimilarity != null) {
    observations.push(`Text SimHash similarity was ${simHashSimilarity}%.`);
  }
  if (registrySignature) {
    observations.push(`Registry signature: ${registrySignature}.`);
  }
  if (creatorSignature) {
    observations.push(`Issuer/creator signature: ${creatorSignature}.`);
  }
  if (status) observations.push(`Record status: ${status}.`);

  for (const change of detectedChanges) {
    if (change.before && change.after) {
      observations.push(
        `${change.label ? `${change.label}: ` : ""}${change.before} → ${change.after}.`
      );
    } else if (change.before) {
      observations.push(`Text removed: ${change.before}.`);
    }
  }

  if (
    matchedCriticalValues != null &&
    registeredCriticalValues != null
  ) {
    observations.push(
      `HPS matched ${matchedCriticalValues} of ${registeredCriticalValues} registered critical-value entries.`
    );
  }

  if (
    registeredValuesNotMatched != null ||
    candidateValuesNotExplained != null
  ) {
    observations.push(
      `Critical-value comparison left ${
        registeredValuesNotMatched ?? 0
      } registered value(s) unmatched and ${
        candidateValuesNotExplained ?? 0
      } candidate value(s) unexplained.`
    );
  }

  if (criticalStatus === "inconclusive") {
    limitations.push(
      "The critical-value comparison was inconclusive for at least one value; HPS did not claim the unmatched value was unchanged."
    );
  }

  limitations.push(
    "A provenance relationship does not by itself mean the candidate content is unchanged."
  );
  limitations.push(
    "HPS provides provenance and integrity evidence; it does not prove that every factual claim inside a document is true."
  );

  return {
    rawText: rawInput,
    recordId,
    relationship,
    relationshipConfidence,
    assetIdentity,
    textIntegrity,
    registrySignature,
    creatorSignature,
    status,
    simHashSimilarity,
    criticalStatus,
    matchedCriticalValues,
    registeredCriticalValues,
    registeredValuesNotMatched,
    candidateValuesNotExplained,
    detectedChanges,
    observations,
    limitations,
  };
}

export const parseHpsVerificationText = parseHpsResult;

export function evidenceFromHps(parsed: HpsIngestion): EvidenceItem[] {
  const evidence: EvidenceItem[] = [];

  for (const statement of parsed.observations) {
    evidence.push({
      id: crypto.randomUUID(),
      kind: "observed",
      statement,
      source: parsed.sourceUrl || "HPS verification result",
    });
  }

  evidence.push({
    id: crypto.randomUUID(),
    kind: "inference",
    statement:
      "A strong provenance relationship should not be interpreted as proof that the candidate content is unchanged.",
    source: "Editorial interpretation",
  });

  for (const statement of parsed.limitations) {
    evidence.push({
      id: crypto.randomUUID(),
      kind: "limitation",
      statement,
      source: "HPS claim boundary",
    });
  }

  return evidence;
}

export function suggestEpisodeFromHps(parsed: HpsIngestion) {
  const firstChange = parsed.detectedChanges.find(
    (change) => change.before && change.after
  );

  const topic = firstChange
    ? `Changed ${firstChange.label || firstChange.category || "critical value"}`
    : parsed.relationship
      ? `${parsed.relationship} provenance test`
      : "HPS provenance stress test";

  const question = firstChange
    ? `I changed ${firstChange.before} to ${firstChange.after} in a registered document. Could HPS detect it?`
    : `What can HPS tell us about this modified digital document?`;

  const experiment = firstChange
    ? `Start from the registered document, change ${
        firstChange.label || "one critical value"
      } from ${firstChange.before} to ${
        firstChange.after
      }, then verify only the candidate file and record exactly what HPS reports.`
    : `Verify the candidate document against its HPS provenance record and document the exact identity, relationship, text-integrity and witness results without overstating them.`;

  return { topic, question, experiment };
}
