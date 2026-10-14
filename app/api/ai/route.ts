import { NextResponse } from "next/server";
import { checkAccess, complete, parseJson, type AiMessage } from "@/lib/ai-server";

export const maxDuration = 120;

/* POST /api/ai
   { system?, prompt? | messages?, smart?, effort?, json?, images?: [{mediaType, data(base64)}] }
   → { text, json? } */
export async function POST(req: Request) {
  const denied = await checkAccess(req);
  if (denied) return NextResponse.json({ error: denied }, { status: 401 });
  try {
    const b = await req.json();
    let messages: AiMessage[] = Array.isArray(b.messages) ? b.messages.slice(-30) : [];
    if (b.prompt) {
      const images = Array.isArray(b.images) ? b.images.slice(0, 6) : [];
      messages = [
        ...messages,
        {
          role: "user",
          content: images.length
            ? [
                ...images.map((im: { mediaType: string; data: string }) => ({ type: "image" as const, source: { type: "base64" as const, media_type: im.mediaType as "image/jpeg", data: im.data } })),
                { type: "text" as const, text: String(b.prompt) },
              ]
            : String(b.prompt),
        },
      ];
    }
    if (!messages.length) return NextResponse.json({ error: "Message vide." }, { status: 400 });
    const text = await complete({
      system: typeof b.system === "string" ? b.system : undefined,
      messages,
      smart: !!b.smart,
      effort: ["low", "medium", "high"].includes(b.effort) ? b.effort : "medium",
      maxTokens: Math.min(Number(b.maxTokens) || 8000, 16000),
    });
    return NextResponse.json({ text, json: b.json ? parseJson(text) : undefined });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur IA" }, { status: 500 });
  }
}
