import JSZip from "jszip";

import { analyzeCsv } from "./data-story";
import type { DatasetAnalysis } from "./types";

export type XlsxAnalysis = {
  title: string;
  datasets: DatasetAnalysis[];
  primaryDataset: DatasetAnalysis;
  extractedText: string;
  sheetNames: string[];
};

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function localElements(parent: ParentNode, name: string) {
  return Array.from(
    (parent as Document | Element).getElementsByTagNameNS("*", name)
  );
}

function firstLocal(parent: ParentNode, name: string) {
  return localElements(parent, name)[0];
}

function xml(text: string, label: string) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) {
    throw new Error(`Unable to parse ${label} inside the XLSX workbook.`);
  }
  return doc;
}

function columnIndexFromRef(ref: string) {
  const letters = (ref.match(/[A-Za-z]+/)?.[0] || "").toUpperCase();
  let index = 0;

  for (const char of letters) {
    index = index * 26 + (char.charCodeAt(0) - 64);
  }

  return Math.max(0, index - 1);
}

function csvEscape(value: string) {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function rowsToCsv(rows: string[][]) {
  return rows
    .map((row) => row.map((value) => csvEscape(value)).join(","))
    .join("\n");
}

function sharedStringsFrom(doc?: Document) {
  if (!doc) return [] as string[];

  return localElements(doc, "si").map((item) =>
    localElements(item, "t")
      .map((node) => node.textContent || "")
      .join("")
  );
}

function readCell(cell: Element, sharedStrings: string[]) {
  const type = cell.getAttribute("t") || "";
  const valueNode = firstLocal(cell, "v");
  const raw = valueNode?.textContent ?? "";

  if (type === "s") {
    const index = Number(raw);
    return Number.isFinite(index) ? sharedStrings[index] || "" : "";
  }

  if (type === "inlineStr") {
    return localElements(cell, "t")
      .map((node) => node.textContent || "")
      .join("");
  }

  if (type === "b") return raw === "1" ? "true" : "false";

  /*
   * t="str" is common in generated workbooks and must be treated as text.
   * Numeric cells keep their textual numeric representation so data-story.ts
   * can classify and parse them consistently.
   */
  return raw;
}

function sheetRows(sheetDoc: Document, sharedStrings: string[]) {
  const rows: string[][] = [];

  for (const rowNode of localElements(sheetDoc, "row")) {
    const values: string[] = [];

    for (const cell of localElements(rowNode, "c")) {
      const ref = cell.getAttribute("r") || "";
      const columnIndex = ref
        ? columnIndexFromRef(ref)
        : values.length;

      while (values.length <= columnIndex) values.push("");
      values[columnIndex] = clean(readCell(cell, sharedStrings));
    }

    while (values.length && !values[values.length - 1]) values.pop();
    if (values.some(Boolean)) rows.push(values);
  }

  return rows;
}

function normalizeTarget(target: string) {
  const noLeadingSlash = target.replace(/^\/+/, "");
  if (noLeadingSlash.startsWith("xl/")) return noLeadingSlash;

  const stripped = noLeadingSlash.replace(/^(\.\.\/)+/, "");
  return `xl/${stripped}`.replace(/\/+/g, "/");
}

function workbookTitle(fileName: string) {
  return fileName
    .replace(/\.(xlsx|xlsm)$/i, "")
    .replace(/[_-]+/g, " ")
    .trim() || "Uploaded workbook";
}

function datasetScore(dataset: DatasetAnalysis) {
  return (
    (dataset.recommendedChart ? 120 : 0) +
    (dataset.recommendedMap ? 120 : 0) +
    Math.min(60, dataset.rowCount) +
    Math.min(30, dataset.numericColumns.length * 10) +
    Math.min(20, dataset.dateColumns.length * 10)
  );
}

export async function analyzeXlsx(
  file: Blob,
  fileName = file instanceof File ? file.name : "Uploaded workbook.xlsx"
): Promise<XlsxAnalysis> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());

  const workbookEntry = zip.file("xl/workbook.xml");
  const relsEntry = zip.file("xl/_rels/workbook.xml.rels");

  if (!workbookEntry || !relsEntry) {
    throw new Error(
      "This file does not contain a readable XLSX workbook structure."
    );
  }

  const workbookDoc = xml(
    await workbookEntry.async("text"),
    "workbook.xml"
  );
  const relsDoc = xml(
    await relsEntry.async("text"),
    "workbook relationships"
  );

  const sharedEntry = zip.file("xl/sharedStrings.xml");
  const sharedDoc = sharedEntry
    ? xml(await sharedEntry.async("text"), "shared strings")
    : undefined;
  const sharedStrings = sharedStringsFrom(sharedDoc);

  const relationships = new Map<string, string>();

  for (const relation of localElements(relsDoc, "Relationship")) {
    const id = relation.getAttribute("Id");
    const target = relation.getAttribute("Target");
    if (id && target) relationships.set(id, normalizeTarget(target));
  }

  const sheetNames: string[] = [];
  const datasets: DatasetAnalysis[] = [];
  const textSections: string[] = [];

  for (const sheet of localElements(workbookDoc, "sheet")) {
    const sheetName = clean(sheet.getAttribute("name") || "Sheet");
    const relId =
      sheet.getAttributeNS(
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
        "id"
      ) ||
      sheet.getAttribute("r:id") ||
      "";

    const target = relationships.get(relId);
    if (!target) continue;

    const entry = zip.file(target);
    if (!entry) continue;

    const sheetDoc = xml(
      await entry.async("text"),
      `${sheetName} worksheet`
    );
    const rows = sheetRows(sheetDoc, sharedStrings);

    if (!rows.length) continue;

    sheetNames.push(sheetName);

    textSections.push(
      [
        `## ${sheetName}`,
        ...rows.slice(0, 80).map((row) => row.join("\t")),
      ].join("\n")
    );

    if (rows.length < 3) continue;

    const csv = rowsToCsv(rows);
    const dataset = analyzeCsv(
      csv,
      `${workbookTitle(fileName)} · ${sheetName}`
    );

    /*
     * Notes/source sheets are preserved in extractedText but are not promoted
     * as quantitative datasets unless they contain a measurable structure.
     */
    const useful =
      Boolean(dataset.recommendedChart) ||
      Boolean(dataset.recommendedMap) ||
      dataset.numericColumns.length > 0;

    if (useful) datasets.push(dataset);
  }

  if (!datasets.length) {
    throw new Error(
      "The XLSX workbook was readable, but no tabular quantitative dataset was found."
    );
  }

  datasets.sort((a, b) => datasetScore(b) - datasetScore(a));
  const primaryDataset = datasets[0];

  return {
    title: workbookTitle(fileName),
    datasets,
    primaryDataset,
    extractedText: textSections.join("\n\n").slice(0, 120_000),
    sheetNames,
  };
}
