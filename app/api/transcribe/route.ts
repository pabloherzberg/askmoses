// OpenAI Whisper API - Accepts Blob URL and transcribes
export async function POST(req: Request) {
  try {
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
    const audioFile = new File([audioBlob], filename || "audio.mp3", { 
      type: audioBlob.type || "audio/mpeg" 
    })

    console.log("[v0] Transcribing:", filename, "size:", audioFile.size)

    // Create FormData for OpenAI API
    const transcriptionFormData = new FormData()
    transcriptionFormData.append("file", audioFile)
    transcriptionFormData.append("model", "whisper-1")

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
      throw new Error(error.error?.message || "OpenAI API error")
    }

    const result = await response.json()
    console.log("[v0] Transcription complete")

    return Response.json({ transcript: result.text })
  } catch (error) {
    console.error("[v0] Transcription error:", error instanceof Error ? error.message : error)
    return Response.json(
      { error: `Failed to transcribe: ${error instanceof Error ? error.message : "Unknown error"}` },
      { status: 500 }
    )
  }
}
