'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'


type Student = {
  id: string
  code: string
  created_at: string
  profiles: { nickname: string | null } | null
}

type Branch = {
  id: string
  child_question: string
  branch_summary: string
  evidence_ids: string[]
  judge_status: string
  grade: number | null
  subject: string | null
  created_at: string
}

type Tab = 'students' | 'queue'

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code + Math.floor(100 + Math.random() * 900)
}

export default function AdminPage() {
  const [authed, setAuthed] = useState(false)
  const [isDemo, setIsDemo] = useState(false)
  const [pwInput, setPwInput] = useState('')
  const [pwError, setPwError] = useState(false)
  const pwRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const stored = sessionStorage.getItem('admin_authed')
    if (stored === 'owner' || stored === '1') { setAuthed(true); setIsDemo(false) }
    else if (stored === 'demo') { setAuthed(true); setIsDemo(true) }
    else setTimeout(() => pwRef.current?.focus(), 50)
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    const res = await fetch('/api/admin/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwInput }),
    })
    const { role } = await res.json()
    if (role === 'owner') {
      sessionStorage.setItem('admin_authed', 'owner')
      sessionStorage.setItem('admin_pw', pwInput)
      setAuthed(true); setIsDemo(false)
    } else if (role === 'demo') {
      sessionStorage.setItem('admin_authed', 'demo')
      setAuthed(true); setIsDemo(true)
    } else {
      setPwError(true); setPwInput('')
    }
  }

  const [tab, setTab] = useState<Tab>('students')
  const [students, setStudents] = useState<Student[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(false)
  const [newCode, setNewCode] = useState('')

  async function fetchStudents() {
    const supabase = createClient()
    const { data } = await supabase
      .from('students')
      .select('id, code, created_at, profiles(nickname)')
      .eq('is_demo', isDemo)
      .order('created_at', { ascending: false })
    setStudents((data as unknown as Student[]) ?? [])
  }

  async function fetchBranches() {
    const supabase = createClient()
    const { data } = await supabase
      .from('branches')
      .select('id, child_question, branch_summary, evidence_ids, judge_status, grade, subject, created_at')
      .eq('judge_status', 'judge_checked')
      .eq('is_demo', isDemo)
      .order('created_at', { ascending: false })
    setBranches((data as Branch[]) ?? [])
  }

  useEffect(() => {
    if (authed) {
      fetchStudents()
      fetchBranches()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, isDemo])

  async function handleIssue() {
    setLoading(true)
    const code = generateCode()
    const supabase = createClient()
    const { error } = await supabase.from('students').insert({ code, is_demo: isDemo })
    if (!error) {
      setNewCode(code)
      await fetchStudents()
    }
    setLoading(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('このIDを削除しますか？')) return
    const supabase = createClient()
    await supabase.from('students').delete().eq('id', id)
    await fetchStudents()
  }

  async function handleApprove(id: string) {
    const supabase = createClient()
    await supabase.from('branches').update({ judge_status: 'mentor_approved' }).eq('id', id)
    await fetchBranches()
  }

  async function handleReject(id: string) {
    const supabase = createClient()
    await supabase.from('branches').update({ judge_status: 'mentor_rejected' }).eq('id', id)
    await fetchBranches()
  }

  if (!authed) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-amber-50 flex items-center justify-center p-8">
        <form onSubmit={handleLogin} className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-xs flex flex-col gap-4">
          <h1 className="text-xl font-bold text-green-800 text-center">管理者ログイン</h1>
          <input
            ref={pwRef}
            type="password"
            value={pwInput}
            onChange={(e) => { setPwInput(e.target.value); setPwError(false) }}
            placeholder="パスワード"
            className="border-2 border-gray-200 rounded-xl px-4 py-3 text-center text-lg tracking-widest outline-none focus:border-green-400"
          />
          {pwError && <p className="text-red-500 text-sm text-center">パスワードが違います</p>}
          <button
            type="submit"
            className="bg-green-500 text-white font-bold py-3 rounded-xl hover:bg-green-600 transition-all"
          >
            ログイン
          </button>
          <a href="/" className="text-xs text-gray-400 hover:text-gray-600 text-center">← もどる</a>
        </form>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-green-700 text-white px-6 py-4 shadow flex items-center justify-between">
        <h1 className="text-xl font-bold">
          ブランチラーニング — 管理者
        </h1>
        <button
          onClick={() => { sessionStorage.removeItem('admin_authed'); location.reload() }}
          className="text-xs opacity-60 hover:opacity-100"
        >
          ログアウト
        </button>
      </div>

      <div className="flex border-b border-gray-200 bg-white">
        <button
          onClick={() => setTab('students')}
          className={`px-6 py-3 text-sm font-medium transition-colors ${
            tab === 'students'
              ? 'border-b-2 border-green-600 text-green-700'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          生徒ID管理
        </button>
        <button
          onClick={() => setTab('queue')}
          className={`px-6 py-3 text-sm font-medium transition-colors flex items-center gap-2 ${
            tab === 'queue'
              ? 'border-b-2 border-green-600 text-green-700'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          ブランチ承認キュー
          {branches.length > 0 && (
            <span className="bg-orange-500 text-white text-xs rounded-full px-2 py-0.5">
              {branches.length}
            </span>
          )}
        </button>
      </div>

      <div className="max-w-2xl mx-auto p-6 flex flex-col gap-6">
        {tab === 'students' && (
          <>
            <div className="bg-white rounded-2xl shadow p-6 flex flex-col gap-4">
              <h2 className="font-bold text-gray-700">
                新しいIDを発行する
              </h2>
              <button
                onClick={handleIssue}
                disabled={loading}
                className="bg-green-500 text-white font-bold py-3 rounded-xl hover:bg-green-600 disabled:opacity-40 transition-all"
              >
                {loading ? '発行中...' : '+ IDを発行'}
              </button>
              {newCode && (
                <div className="bg-green-50 border-2 border-green-300 rounded-xl p-4 text-center">
                  <p className="text-sm text-green-600 mb-1">発行しました！</p>
                  <p className="text-3xl font-bold tracking-widest text-green-800">{newCode}</p>
                  <p className="text-xs text-gray-400 mt-2">
                    子どもにこのIDを伝えてください
                  </p>
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl shadow p-6">
              <h2 className="font-bold text-gray-700 mb-4">発行済みID一覧</h2>
              {students.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">まだIDがありません</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {students.map((s) => (
                    <div key={s.id} className="flex items-center justify-between border border-gray-100 rounded-xl px-4 py-3">
                      <div>
                        <span className="font-bold tracking-wider text-green-800">{s.code}</span>
                        {s.profiles?.nickname && (
                          <span className="ml-3 text-sm text-gray-500">{s.profiles.nickname}</span>
                        )}
                      </div>
                      <button
                        onClick={() => handleDelete(s.id)}
                        className="text-xs text-red-400 hover:text-red-600"
                      >
                        削除
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {tab === 'queue' && (
          <div className="bg-white rounded-2xl shadow p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-700">承認待ちブランチ</h2>
              <div className="flex items-center gap-3">
                {!isDemo && (
                  <button
                    onClick={async () => {
                      if (!confirm('「なんでも」ブランチを教科別に再分類しますか？')) return
                      const res = await fetch('/api/admin/reclassify', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ password: sessionStorage.getItem('admin_pw') ?? '' }),
                      })
                      const data = await res.json()
                      alert(`完了！ ${data.updated}件を再分類しました（対象${data.total}件）`)
                      fetchBranches()
                    }}
                    className="text-xs text-purple-600 hover:underline"
                  >
                    🔄 なんでもを再分類
                  </button>
                )}
                <a
                  href={`/knowledge?demo=${isDemo ? '1' : '0'}`}
                  className="text-sm text-green-600 hover:underline"
                >
                  発見マップを見る →
                </a>
              </div>
            </div>
            {branches.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">
                承認待ちのブランチはありません
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                {branches.map((b) => (
                  <div key={b.id} className="border border-orange-200 bg-orange-50 rounded-xl p-4 flex flex-col gap-3">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      {b.subject && (
                        <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                          {b.subject}
                        </span>
                      )}
                      {b.grade && <span className="text-gray-400">{b.grade}年生</span>}
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">子どもの問い</p>
                      <p className="text-sm font-medium text-gray-800">「{b.child_question}」</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">ブランチ内容</p>
                      <p className="text-sm text-gray-700">{b.branch_summary}</p>
                    </div>
                    {b.evidence_ids.length > 0 && (
                      <p className="text-xs text-gray-400">根拠ID: {b.evidence_ids.join(', ')}</p>
                    )}
                    <div className="flex gap-2 mt-1">
                      <button
                        onClick={() => handleApprove(b.id)}
                        className="flex-1 bg-green-500 text-white text-sm font-bold py-2 rounded-xl hover:bg-green-600 transition-all"
                      >
                        承認して知識グラフへ
                      </button>
                      <button
                        onClick={() => handleReject(b.id)}
                        className="px-4 bg-white text-red-400 border border-red-200 text-sm font-medium py-2 rounded-xl hover:bg-red-50 transition-all"
                      >
                        却下
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
