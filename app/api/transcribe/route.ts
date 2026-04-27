import { type NextRequest } from "next/server";

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
        { data: null, error: { message: "audioBase64 or text is required", code: 400 } },
        { status: 400 },
      );
    }

    const transcript = await transcribeAudio(
      Buffer.from(body.audioBase64, "base64"),
      body.mimeType ?? "audio/mp3",
    );
    return Response.json({ data: { transcript }, error: null });
  }

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("audio") as File | null;

    if (!file) {
      return Response.json(
        { data: null, error: { message: '"audio" field not found in form data', code: 400 } },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const transcript = await transcribeAudio(buffer, file.type || "audio/mp3");
    return Response.json({ data: { transcript }, error: null });
  }

  return Response.json(
    { data: null, error: { message: "Unsupported Content-Type", code: 415 } },
    { status: 415 },
  );
}

async function transcribeAudio(buffer: Buffer, mimeType: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured in .env");

  const ext = mimeType.split("/")[1]?.split(";")[0] ?? "mp3";
  const form = new FormData();
  const ab = buffer.buffer instanceof ArrayBuffer
    ? buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    : buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as unknown as ArrayBuffer;
  form.append("file", new Blob([ab], { type: mimeType }), `audio.${ext}`);
  form.append("model", "whisper-1");
  form.append(
    "prompt",
    "This is a sales call between a dog training business and a prospect. Identify speakers as Trainer and Prospect.",
  );

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Whisper API error ${res.status}: ${err}`);
  }

  const data = (await res.json()) as { text: string };
  return data.text.trim();
}
