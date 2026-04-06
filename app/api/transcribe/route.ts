import { type NextRequest } from "next/server";
import { getGeminiModel } from "@/lib/gemini";

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = (await request.json()) as {
      audioBase64?: string;
      mimeType?: string;
      text?: string;
    };

    if (body.text) {
      return Response.json({ data: { transcript: body.text }, error: null });
    }

    if (!body.audioBase64) {
      return Response.json(
        {
          data: null,
          error: { message: "audioBase64 or text is required", code: 400 },
        },
        { status: 400 },
      );
    }

    const transcript = await transcribeAudio(
      body.audioBase64,
      body.mimeType ?? "audio/mp3",
    );
    return Response.json({ data: { transcript }, error: null });
  }

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("audio") as File | null;

    if (!file) {
      return Response.json(
        {
          data: null,
          error: { message: '"audio" field not found in form data', code: 400 },
        },
        { status: 400 },
      );
    }

    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const transcript = await transcribeAudio(base64, file.type || "audio/mp3");
    return Response.json({ data: { transcript }, error: null });
  }

  return Response.json(
    { data: null, error: { message: "Unsupported Content-Type", code: 415 } },
    { status: 415 },
  );
}

async function transcribeAudio(
  audioBase64: string,
  mimeType: string,
): Promise<string> {
  const model = getGeminiModel("gemini-2.5-flash");

  const result = await model.generateContent([
    {
      inlineData: { data: audioBase64, mimeType },
    },
    {
      text: `Transcribe this sales call in full, including all speech from the trainer and the prospect/client.
Format: identify speakers as "Trainer:" and "Prospect:" (or "Client:").
Keep the language natural as spoken. Do not summarize — transcribe verbatim.
If speakers cannot be identified with certainty, use "Speaker 1:" and "Speaker 2:".`,
    },
  ]);

  return result.response.text().trim();
}
