# One-click cloud rendering

Proof of Origin Studio now renders media directly from the hosted application.

The Publish tab calls:

```text
POST /api/render/video
POST /api/render/short
POST /api/render/thumbnail
```

The server then:

```text
current project
→ Remotion bundle
→ headless Chromium render
→ temporary MP4 / PNG
→ browser download
```

## Recommended Render.com test order

1. Generate Thumbnail
2. Generate Short 1
3. Generate Final Video

Video rendering uses much more CPU and memory than an ordinary Next.js page.
If thumbnails work but long-form video fails, your application may be fine and
the Render instance may need more RAM/CPU.

The JSON export remains intentionally: it is the editable production manifest,
useful for backups, rerenders, version control and provenance.
