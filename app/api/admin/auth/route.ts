import { NextRequest } from 'next/server'

export async function POST(req: NextRequest) {
  const { password } = await req.json()
  const ownerPw = process.env.ADMIN_PASSWORD ?? ''
  if (password === ownerPw) return Response.json({ role: 'owner' })
  if (password === 'hackathon') return Response.json({ role: 'demo' })
  return Response.json({ role: null }, { status: 401 })
}
