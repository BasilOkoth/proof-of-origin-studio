import { ingestDocumentText } from "@/lib/document-evidence";

export const runtime = "nodejs";

const MAX_BYTES = 15 * 1024 * 1024;

function kindFromValue(value: FormDataEntryValue | null) {
  return value === "research" || value === "report" ? value : "text";
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const body = await request.json();
      const text = String(body.text || "");
      const fileName = String(body.fileName || "pasted-source.txt");
      const kind =
        body.kind === "research" || body.kind === "report" ? body.kind : "text";

      if (!text.trim()) {
        return Response.json(
          { error: "No source text was provided." },
          { status: 400 }
        );
      }

      return Response.json({
        result: ingestDocumentText({ text, fileName, kind }),
      });
    }

    const form = await request.formData();
    const file = form.get("file");
    const kind = kindFromValue(form.get("kind"));

    if (!(file instanceof File)) {
      return Response.json(
        { error: "Upload a PDF, TXT or Markdown source." },
        { status: 400 }
      );
    }

    if (file.size > MAX_BYTES) {
      return Response.json(
        { error: "The source is larger than the 15 MB ingestion limit." },
        { status: 413 }
      );
    }

    const lower = file.name.toLowerCase();
    let text = "";

    if (lower.endsWith(".pdf") || file.type === "application/pdf") {
      const pdfModule = await import("pdf-parse");
      const pdfParse = pdfModule.default;
      const parsed = await pdfParse(Buffer.from(await file.arrayBuffer()));
      text = parsed.text || "";
    } else {
      text = await file.text();
    }

    if (!text.trim()) {
      return Response.json(
        { error: "No readable text could be extracted from this source." },
        { status: 422 }
      );
    }

    return Response.json({
      result: ingestDocumentText({ text, fileName: file.name, kind }),
    });
  } catch (error: any) {
    return Response.json(
      { error: error?.message || "Document ingestion failed." },
      { status: 500 }
    );
  }
}
