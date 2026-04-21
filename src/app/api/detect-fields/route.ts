import OpenAI from "openai";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { checkRateLimit } from "@/lib/rate-limit";

// Lazy singleton OpenAI client — only instantiated at request time
let _openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!_openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY not configured");
    }
    _openaiClient = new OpenAI({ apiKey });
  }
  return _openaiClient;
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ fields: [], error: "Unauthorized" }, { status: 401 });
  }

  // Rate limiting check
  const forwarded = req.headers.get("x-forwarded-for");
  const realIp = req.headers.get("x-real-ip");
  const identifier = forwarded?.split(",")[0] || realIp || "anonymous";
  const { success, remaining } = await checkRateLimit(identifier);
  if (!success) {
    return NextResponse.json({ fields: [], error: "Too many requests, try again in a minute" }, { status: 429 });
  }

  try {
    const { imageBase64, pageWidth, pageHeight } = await req.json();

    if (!imageBase64 || !pageWidth || !pageHeight) {
      return NextResponse.json(
        { fields: [], error: "Missing required fields" },
        { status: 400 },
      );
    }

    const openai = getOpenAIClient();

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 4096,
      messages: [
        {
          role: "system",
          content:
            "You are a PDF form field detector. Analyse this PDF form image and identify every fillable field. Return ONLY a JSON array with no markdown, no explanation. Each item: { \"label\": string, \"type\": \"text\"|\"checkbox\"|\"signature\"|\"date\", \"x\": number, \"y\": number, \"width\": number, \"height\": number } where coordinates are in pixels relative to the top-left of the image at the given page dimensions.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Detect all fillable form fields in this PDF page. The image dimensions are ${pageWidth}x${pageHeight} pixels. Return only a JSON array.`,
            },
            {
              type: "image_url",
              image_url: {
                url: imageBase64.startsWith("data:")
                  ? imageBase64
                  : `data:image/png;base64,${imageBase64}`,
              },
            },
          ],
        },
      ],
    });

    const content = response.choices[0]?.message?.content ?? "[]";

    // Strip markdown code fences if present
    const cleaned = content
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    let fields: unknown[];
    try {
      fields = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse GPT response:", content);
      return NextResponse.json(
        { fields: [], error: "Failed to parse AI response" },
        { status: 200 },
      );
    }

    if (!Array.isArray(fields)) {
      return NextResponse.json(
        { fields: [], error: "Invalid AI response format" },
        { status: 200 },
      );
    }

    return NextResponse.json({ fields });
  } catch (err) {
    console.error("Detect fields error:", err);
    return NextResponse.json(
      { fields: [], error: "AI detection failed" },
      { status: 500 },
    );
  }
}
