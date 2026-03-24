import { Readable } from "stream"

// OpenAI Whisper API - Accepts Blob URL and transcribes
export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return Response.json(
        { error: "OpenAI API key is not configured. Please set OPENAI_API_KEY environment variable." },
        { status: 503 }
      )
    }

    const body = await req.json()
    const { blobUrl, filename } = body

    if (!blobUrl) {
      return Response.json({ error: "No blob URL provided" }, { status: 400 })
    }

    console.log("[v0] Fetching audio from Blob:", blobUrl)

    // Fetch audio from Blob storage
    const audioResponse = await fetch(blobUrl)
    if (!audioResponse.ok) {
      throw new Error("Failed to fetch audio from Blob storage")
    }

    const audioBlob = await audioResponse.blob()
    const audioBuffer = await audioBlob.arrayBuffer()
    const sizeMB = (audioBuffer.byteLength / (1024 * 1024)).toFixed(2)

    console.log("[v0] Audio size:", sizeMB + "MB")

    // OpenAI Whisper API has a 25MB limit
    // Typically audio compresses significantly - if still over limit, reject
    if (audioBuffer.byteLength > 25 * 1024 * 1024) {
      return Response.json(
        {
          error: `Audio file is too large (${sizeMB}MB). OpenAI Whisper supports files up to 25MB. Please use shorter recordings or compress your audio. Consider using MP3 format instead of WAV for better compression.`,
        },
        { status: 413 }
      )
    }

    // Create FormData for OpenAI API
    const transcriptionFormData = new FormData()
    const audioFile = new File([audioBuffer], filename || "audio.mp3", {
      type: audioBlob.type || "audio/mpeg",
    })
    transcriptionFormData.append("file", audioFile)
    transcriptionFormData.append("model", "whisper-1")
    transcriptionFormData.append("language", "en")

    console.log("[v0] Sending to OpenAI Whisper:", filename)

    // Call OpenAI Whisper API
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: transcriptionFormData,
    })

    if (!response.ok) {
      const error = await response.json()
      console.error("[v0] OpenAI error:", error)
      const message = error.error?.message || "Unknown error"

      // Handle specific OpenAI errors
      if (message.includes("413") || message.includes("content size")) {
        return Response.json(
          {
            error: `File too large for OpenAI Whisper. Your file is ${sizeMB}MB but limit is 25MB. Please compress your audio or use shorter recordings.`,
          },
          { status: 413 }
        )
      }

      throw new Error(message)
    }

    const result = await response.json()
    console.log("[v0] Transcription complete:", result.text?.substring(0, 50) + "...")

    return Response.json({ transcript: result.text })
  } catch (error) {
    console.error("[v0] Transcription error:", error instanceof Error ? error.message : error)
    return Response.json(
      { error: `Failed to transcribe: ${error instanceof Error ? error.message : "Unknown error"}` },
      { status: 500 }
    )
  }
}
