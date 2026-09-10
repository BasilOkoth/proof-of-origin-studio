import type { DatasetAnalysis, EvidenceItem, EvidenceSourceType } from "./types";
import type { EvidenceScoutSource } from "./evidence-scout";

export type LibraryStatus = "candidate" | "ingested" | "reviewed";
export type LibraryOrigin = "scout" | "upload" | "manual";

export type EvidenceLibraryRecord = {
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  url?: string;
  downloadUrl?: string;
  provider?: string;
  sourceType: EvidenceSourceType;
  access?: "open_download" | "landing_page" | "metadata_only";
  license?: string;
  authors?: string[];
  year?: number;
  publisher?: string;
  summary?: string;
  status: LibraryStatus;
  origin: LibraryOrigin;
  tags: string[];
  fileName?: string;
  mimeType?: string;
  byteLength?: number;
  extractedText?: string;
  evidence: EvidenceItem[];
  dataset?: DatasetAnalysis;
  datasets?: DatasetAnalysis[];
  fileBlob?: Blob;
};

const DB_NAME = "evidence-studio-library";
const STORE_NAME = "sources";
const DB_VERSION = 1;

function browserDb(): Promise<IDBDatabase> {
  if (typeof window === "undefined" || !window.indexedDB) {
    return Promise.reject(new Error("IndexedDB is unavailable in this environment."));
  }

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error || new Error("Unable to open Evidence Library."));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
        store.createIndex("status", "status");
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  operation: (
    store: IDBObjectStore,
    resolve: (value: T) => void,
    reject: (reason?: unknown) => void
  ) => void
): Promise<T> {
  const db = await browserDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error("Evidence Library transaction failed."));
    };
    operation(store, resolve, reject);
  });
}

export async function listEvidenceLibrary(): Promise<EvidenceLibraryRecord[]> {
  return withStore<EvidenceLibraryRecord[]>("readonly", (store, resolve, reject) => {
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const records = (request.result || []) as EvidenceLibraryRecord[];
      resolve(records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    };
  });
}

export async function getEvidenceLibraryRecord(
  id: string
): Promise<EvidenceLibraryRecord | undefined> {
  return withStore<EvidenceLibraryRecord | undefined>(
    "readonly",
    (store, resolve, reject) => {
      const request = store.get(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () =>
        resolve(request.result as EvidenceLibraryRecord | undefined);
    }
  );
}

export async function saveEvidenceLibraryRecord(
  record: EvidenceLibraryRecord
): Promise<void> {
  return withStore<void>("readwrite", (store, resolve, reject) => {
    const request = store.put(record);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function deleteEvidenceLibraryRecord(
  id: string
): Promise<void> {
  return withStore<void>("readwrite", (store, resolve, reject) => {
    const request = store.delete(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export function scoutSourceToLibraryRecord(
  source: EvidenceScoutSource
): EvidenceLibraryRecord {
  const now = new Date().toISOString();
  return {
    id: source.id,
    createdAt: now,
    updatedAt: now,
    title: source.title,
    url: source.url,
    downloadUrl: source.downloadUrl,
    provider: source.provider,
    sourceType: source.sourceType,
    access: source.access,
    license: source.license,
    authors: source.authors,
    year: source.year,
    publisher: source.publisher,
    summary: source.summary,
    status: "candidate",
    origin: "scout",
    tags: [source.provider, source.sourceType].filter(Boolean),
    evidence: [],
  };
}

export function mergeLibraryRecord(
  existing: EvidenceLibraryRecord | undefined,
  patch: Partial<EvidenceLibraryRecord> &
    Pick<EvidenceLibraryRecord, "id" | "title" | "sourceType">
): EvidenceLibraryRecord {
  const now = new Date().toISOString();
  return {
    id: patch.id,
    createdAt: existing?.createdAt || patch.createdAt || now,
    updatedAt: now,
    title: patch.title,
    url: patch.url ?? existing?.url,
    downloadUrl: patch.downloadUrl ?? existing?.downloadUrl,
    provider: patch.provider ?? existing?.provider,
    sourceType: patch.sourceType,
    access: patch.access ?? existing?.access,
    license: patch.license ?? existing?.license,
    authors: patch.authors ?? existing?.authors,
    year: patch.year ?? existing?.year,
    publisher: patch.publisher ?? existing?.publisher,
    summary: patch.summary ?? existing?.summary,
    status: patch.status ?? existing?.status ?? "candidate",
    origin: patch.origin ?? existing?.origin ?? "manual",
    tags: patch.tags ?? existing?.tags ?? [],
    fileName: patch.fileName ?? existing?.fileName,
    mimeType: patch.mimeType ?? existing?.mimeType,
    byteLength: patch.byteLength ?? existing?.byteLength,
    extractedText: patch.extractedText ?? existing?.extractedText,
    evidence: patch.evidence ?? existing?.evidence ?? [],
    dataset: patch.dataset ?? existing?.dataset,
    datasets: patch.datasets ?? existing?.datasets,
    fileBlob: patch.fileBlob ?? existing?.fileBlob,
  };
}

export function base64ToBlob(base64: string, mimeType: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], {
    type: mimeType || "application/octet-stream",
  });
}

export function downloadLibraryBlob(record: EvidenceLibraryRecord) {
  if (!record.fileBlob) {
    throw new Error("This library item does not contain a stored file.");
  }

  const href = URL.createObjectURL(record.fileBlob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download =
    record.fileName ||
    `${
      record.title
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-|-$/g, "") || "evidence"
    }`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
}
