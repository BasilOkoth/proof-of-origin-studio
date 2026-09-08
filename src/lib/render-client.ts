export async function postForDownload(
  url: string,
  payload: unknown,
  fallbackFilename: string
) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let message = `Render request failed with HTTP ${response.status}.`;

    try {
      const data = await response.json();
      if (data?.error) message = data.error;
    } catch {
      // Keep fallback error.
    }

    throw new Error(message);
  }

  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition");
  const filename =
    disposition?.match(/filename="?([^"]+)"?/i)?.[1] ||
    fallbackFilename;

  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();

  setTimeout(() => URL.revokeObjectURL(objectUrl), 500);
}
