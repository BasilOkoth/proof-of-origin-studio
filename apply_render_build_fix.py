#!/usr/bin/env python3
from pathlib import Path
import json
import shutil
import sys
from datetime import datetime

ROOT = Path.cwd()

API_ROUTES = [
    ROOT / "src/app/api/ai/route.ts",
    ROOT / "src/app/api/document-ingest/route.ts",
    ROOT / "src/app/api/hps-ingest/route.ts",
    ROOT / "src/app/api/narration/route.ts",
    ROOT / "src/app/api/render/video/route.ts",
    ROOT / "src/app/api/render/short/route.ts",
    ROOT / "src/app/api/render/thumbnail/route.ts",
]

def fail(message: str):
    print(f"ERROR: {message}", file=sys.stderr)
    sys.exit(1)

package_path = ROOT / "package.json"
if not package_path.exists():
    fail("Run this script from the proof-of-origin-studio repository root.")

missing = [str(p.relative_to(ROOT)) for p in API_ROUTES if not p.exists()]
if missing:
    fail("Expected API route(s) not found: " + ", ".join(missing))

stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
backup_root = ROOT / f".evidence-studio-build-fix-backup-{stamp}"

for path in API_ROUTES + [package_path]:
    dest = backup_root / path.relative_to(ROOT)
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, dest)

for path in API_ROUTES:
    text = path.read_text(encoding="utf-8")
    text = text.replace('import { NextRequest, NextResponse } from "next/server";\n', '')
    text = text.replace('import { NextResponse } from "next/server";\n', '')
    text = text.replace("NextRequest", "Request")
    text = text.replace("NextResponse", "Response")
    path.write_text(text, encoding="utf-8")

package = json.loads(package_path.read_text(encoding="utf-8"))
deps = package.setdefault("dependencies", {})
deps["next"] = "15.5.25"
deps["pdf-parse"] = "1.1.1"
package["dependencies"] = dict(sorted(deps.items()))
package_path.write_text(json.dumps(package, indent=2) + "\n", encoding="utf-8")

types_dir = ROOT / "src/types"
types_dir.mkdir(parents=True, exist_ok=True)
pdf_types = types_dir / "pdf-parse.d.ts"
if pdf_types.exists():
    dest = backup_root / pdf_types.relative_to(ROOT)
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(pdf_types, dest)

pdf_types.write_text(
'''declare module "pdf-parse" {
  export type PdfParseResult = {
    numpages: number;
    numrender: number;
    info: unknown;
    metadata: unknown;
    text: string;
    version: string;
  };

  export default function pdfParse(
    dataBuffer: Buffer | Uint8Array,
    options?: Record<string, unknown>
  ): Promise<PdfParseResult>;
}
''',
    encoding="utf-8",
)

print("Evidence Studio Render build fix applied.")
print(f"Backup created at: {backup_root.name}")
print("")
print("Next:")
print("  npm install")
print("  npm run build")
print("")
print("If the build succeeds:")
print("  git add package.json package-lock.json src/app/api src/types/pdf-parse.d.ts")
print('  git commit -m "Fix Render build for Evidence Studio"')
print("  git push")
