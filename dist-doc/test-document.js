"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const document_evidence_1 = require("./src/lib/document-evidence");
const text = `Dryland vegetation change in northern Kenya\nThe study measured vegetation cover at 120 field plots between 2020 and 2024. Mean cover increased from 18 percent to 27 percent after rainfall returned. The authors suggest that recovery was stronger at sites with lower grazing pressure. However, the study was limited by uneven sampling across soil types and the results should be interpreted cautiously.`;
const result = (0, document_evidence_1.ingestDocumentText)({ text, fileName: 'study.pdf', kind: 'research' });
console.log(JSON.stringify({ title: result.title, evidence: result.evidence.map(e => [e.kind, e.statement]) }, null, 2));
