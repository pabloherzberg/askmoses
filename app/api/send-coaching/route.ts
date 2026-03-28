export async function POST() {
  return Response.json({
    success: true,
    emailId: `mock-email-${Date.now()}`,
  })
}
