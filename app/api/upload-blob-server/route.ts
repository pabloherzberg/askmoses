import { put } from "@vercel/blob"
import { NextResponse } from "next/server"

export const maxDuration = 60

// Disable default body size limit for large file uploads
export const dynamic = "force-dynamic"

// Server-side blob upload for Script Builder (not used by Upload Call)
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File
    const filename = formData.get("filename") as string

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    const blob = await put(filename || file.name, file, {
      access: "public",
    })

    return NextResponse.json({ url: blob.url })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    )
  }
}
