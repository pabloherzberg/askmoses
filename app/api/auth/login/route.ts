// Login is handled client-side via supabase.auth.signInWithPassword()
// This route is no longer used.
export async function POST() {
  return Response.json({ data: null, error: { message: 'Use Supabase Auth directly', code: 410 } }, { status: 410 })
}
