export async function POST(request: Request) {
  const baseUrl = process.env.AI_BASE_URL?.replace(/\/$/, "");
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL;

  if (!baseUrl || !apiKey || !model) {
    return Response.json(
      {
        configured: false,
        error:
          "AI provider is not configured. The studio can still use its built-in truth-first generator.",
      },
      { status: 503 }
    );
  }

  const body = await request.json();

  const system = `You are the editorial engine for Proof of Origin Studio.
You write premium YouTube content about digital trust, provenance, authenticity,
AI-generated content and HPS experiments.

Non-negotiable editorial rules:
1. Never invent experimental results.
2. Separate observed facts, inference and limitations.
3. Never call a file authentic merely because it is similar to a registered file.
4. Never say HPS proves factual truth.
5. Use tension, curiosity and clear stakes without sensationalism.
6. Prefer concrete experiments over generic listicles.
7. Return valid JSON only when the user requests JSON.`;

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: JSON.stringify(body),
        },
      ],
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    return Response.json(
      { configured: true, error: data?.error || "AI provider request failed." },
      { status: response.status }
    );
  }

  return Response.json({
    configured: true,
    content: data?.choices?.[0]?.message?.content || "",
  });
}
