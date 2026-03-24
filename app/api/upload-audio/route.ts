import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { NextResponse } from "next/server"

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const validExtensions = [".mp3", ".wav", ".m4a", ".webm", ".mp4", ".ogg", ".mpeg"]
        const isValid = validExtensions.some((ext) =>
          pathname.toLowerCase().endsWith(ext)
        )
        if (!isValid) {
          throw new Error("Invalid file type. Only audio files are allowed.")
        }
        return {
          allowedContentTypes: [
            "audio/mpeg",
            "audio/mp3",
            "audio/wav",
            "audio/x-wav",
            "audio/m4a",
            "audio/x-m4a",
            "audio/webm",
            "audio/mp4",
            "audio/ogg",
          ],
          maximumSizeInBytes: 50 * 1024 * 1024,
        }
      },
      onUploadCompleted: async ({ blob }) => {
        console.log("[v0] Audio uploaded to Blob:", blob.url)
      },
    })

    return NextResponse.json(jsonResponse)
  } catch (error) {
    console.error("[v0] Upload handler error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 400 }
    )
  }
}
