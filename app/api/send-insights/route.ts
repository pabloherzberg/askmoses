export async function POST() {
  return Response.json({
    success: true,
    emailId: `mock-email-insights-${Date.now()}`,
  })
}
