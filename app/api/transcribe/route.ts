import { type NextRequest } from "next/server";
import { transcribeAudioBuffer } from "@/lib/services/whisper";

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

    const transcript = await transcribeAudioBuffer(
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
    const transcript = await transcribeAudioBuffer(buffer, file.type || "audio/mp3");
    return Response.json({ data: { transcript }, error: null });
  }

  return Response.json(
    { data: null, error: { message: "Unsupported Content-Type", code: 415 } },
    { status: 415 },
  );
}
