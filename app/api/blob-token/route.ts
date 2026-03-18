import { put } from "@vercel/blob"
import { NextResponse } from "next/server"

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const filename = formData.get("filename") as string | null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    // Validate file type
    const validExtensions = [".mp3", ".wav", ".m4a", ".webm", ".mp4", ".ogg", ".mpeg"]
    const name = filename || file.name
    const isValid = validExtensions.some((ext) => name.toLowerCase().endsWith(ext))
    
    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid file type. Only audio files are allowed." },
        { status: 400 }
      )
    }

    // Sanitize filename
    const sanitizedName = name.replace(/[^a-zA-Z0-9.-]/g, "_").replace(/\.\.+/g, ".")
    const timestamp = Date.now()
    const blobName = `audio/${timestamp}_${sanitizedName}`

    // Upload to Vercel Blob
    const blob = await put(blobName, file, {
      access: "public",
      contentType: file.type || "audio/mpeg",
    })

    console.log("[v0] Audio uploaded to Blob:", blob.url)

    return NextResponse.json({ url: blob.url })
  } catch (error) {
    console.error("[v0] Upload handler error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    )
  }
}
