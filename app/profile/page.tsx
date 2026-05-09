'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function ProfilePage() {
  const [nickname, setNickname] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [isNew, setIsNew] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  useEffect(() => {
    const studentId = localStorage.getItem('student_id')
    if (!studentId) { router.push('/login'); return }

    const supabase = createClient()
    supabase.from('profiles').select('*').eq('id', studentId).single()
      .then(({ data }) => {
        if (data) {
          setNickname(data.nickname ?? '')
          setAvatarUrl(data.avatar_url ?? null)
        } else {
          setIsNew(true)
        }
      })
  }, [router])

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const studentId = localStorage.getItem('student_id')
    if (!studentId) return

    setUploading(true)
    const supabase = createClient()
    const ext = file.name.split('.').pop()
    const path = `${studentId}/avatar.${ext}`

    const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (error) {
      setMessage('アップロードに失敗しました')
      setUploading(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    setAvatarUrl(publicUrl + '?t=' + Date.now())
    setUploading(false)
  }

  async function handleSave() {
    const studentId = localStorage.getItem('student_id')
    if (!studentId || !nickname.trim()) return

    setSaving(true)
    setMessage('')
    const supabase = createClient()

    const { error } = await supabase.from('profiles').upsert({
      id: studentId,
      nickname: nickname.trim(),
      avatar_url: avatarUrl,
      updated_at: new Date().toISOString(),
    })

    setSaving(false)
    if (error) {
      setMessage('保存に失敗しました')
    } else {
      router.push('/')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-amber-50 flex flex-col">
      <div className="bg-green-600 text-white px-4 py-4 flex items-center gap-3 shadow">
        {!isNew && (
          <button onClick={() => router.push('/')} className="text-white text-xl">←</button>
        )}
        <h1 className="text-xl font-bold">
          {isNew ? 'プロフィールをつくろう！' : 'プロフィール'}
        </h1>
      </div>

      <div className="flex flex-col items-center px-6 py-8 gap-6">
        {/* アバター */}
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-28 h-28 rounded-full border-4 border-green-400 overflow-hidden bg-green-100 flex items-center justify-center cursor-pointer shadow-lg"
            onClick={() => fileInputRef.current?.click()}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              <span className="text-5xl">👤</span>
            )}
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="text-sm text-green-600 font-medium hover:underline disabled:opacity-40"
          >
            {uploading ? 'アップロード中...' : '画像を変更する'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarUpload}
          />
        </div>

        {/* ニックネーム */}
        <div className="w-full max-w-sm">
          <label className="text-sm font-bold text-gray-600 mb-2 block">ニックネーム</label>
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="名前を入れてね"
            maxLength={20}
            className="w-full border-2 border-green-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-green-500 text-gray-800"
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving || !nickname.trim()}
          className="w-full max-w-sm bg-green-500 text-white font-bold py-3 rounded-xl hover:bg-green-600 disabled:opacity-40 transition-all"
        >
          {saving ? '保存中...' : isNew ? 'はじめる！' : '保存する'}
        </button>

        {message && (
          <p className="text-sm font-medium text-red-500">{message}</p>
        )}
      </div>
    </div>
  )
}
