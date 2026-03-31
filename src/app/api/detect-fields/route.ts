import OpenAI from "openai";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { fields: [], error: "AI detection not configured" },
        { status: 200 },
      );
    }

    const { imageBase64, pageWidth, pageHeight } = await req.json();

    if (!imageBase64 || !pageWidth || !pageHeight) {
      return NextResponse.json(
        { fields: [], error: "Missing required fields" },
        { status: 400 },
      );
    }

    const openai = new OpenAI({ apiKey });

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
      { status: 200 },
    );
  }
}
