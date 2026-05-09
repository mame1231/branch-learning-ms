'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { data, error } = await supabase
      .from('students')
      .select('id')
      .eq('code', code.trim().toUpperCase())
      .single()

    if (error || !data) {
      setError('IDが見つかりません。先生に確認してね。')
      setLoading(false)
      return
    }

    localStorage.setItem('student_id', data.id)

    // プロフィールが設定済みかチェック
    const supabase2 = createClient()
    const { data: profile } = await supabase2
      .from('profiles')
      .select('nickname')
      .eq('id', data.id)
      .single()

    router.push(profile?.nickname ? '/' : '/profile')
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-amber-50 flex flex-col items-center justify-center p-8">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-4xl">🌿</span>
        <h1 className="text-3xl font-bold text-green-800">ブランチラーニング 🌿</h1>
      </div>
      <p className="text-green-600 mb-10 text-base">知識のネットワークを広げよう</p>

      <div className="bg-white rounded-3xl shadow-lg p-8 w-full max-w-sm">
        <h2 className="text-xl font-bold text-gray-700 mb-2 text-center">はじめよう！</h2>
        <p className="text-sm text-gray-400 text-center mb-6">先生からもらったIDを入力してね</p>

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <input
            type="text"
            placeholder="例: TARO-001"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            className="border-2 border-green-300 rounded-xl px-4 py-3 text-center text-lg font-bold tracking-widest focus:outline-none focus:border-green-500 text-gray-800 uppercase"
          />

          {error && (
            <p className="text-sm text-center text-red-500">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !code.trim()}
            className="bg-green-500 text-white font-bold py-3 rounded-xl hover:bg-green-600 disabled:opacity-40 transition-all mt-2"
          >
            {loading ? '確認中...' : 'はじめる →'}
          </button>
        </form>
      </div>
    </div>
  )
}
