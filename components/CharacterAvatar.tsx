'use client'

import { useEffect, useState } from 'react'

export type CharacterKey = 'female' | 'male' | 'friend_1' | 'friend_2' | 'friend_3'

const CHARACTER_INFO: Record<CharacterKey, { prefix: string; label: string }> = {
  female:   { prefix: 'sensei_f', label: 'あゆみ先生' },
  male:     { prefix: 'sensei_m', label: 'ゆうすけ先生' },
  friend_1: { prefix: 'friend_1', label: 'のぞみ' },
  friend_2: { prefix: 'friend_2', label: 'けんた' },
  friend_3: { prefix: 'friend_3', label: 'エイリアン' },
}

type Props = {
  character: CharacterKey
  talking?: boolean
  size?: number
}

export function CharacterAvatar({ character, talking = false, size = 64 }: Props) {
  const [mouthOpen, setMouthOpen] = useState(false)

  useEffect(() => {
    if (!talking) { setMouthOpen(false); return }
    const interval = setInterval(() => setMouthOpen((p) => !p), 150)
    return () => clearInterval(interval)
  }, [talking])

  const info = CHARACTER_INFO[character]
  if (!info) return <span style={{ display: 'inline-block', width: size, height: size }} />

  const { prefix, label } = info

  // CSS Grid で2枚を同じセルに重ねて opacity 切替 → src 変更による消えなし
  // 高さ固定・幅 auto で縦長キャラが自然な比率で表示される
  return (
    <span style={{ display: 'grid', height: size, flexShrink: 0 }}>
      <img
        src={`/characters/${prefix}_closed.webp`}
        alt={label}
        height={size}
        style={{ gridArea: '1/1', height: size, width: 'auto', opacity: mouthOpen ? 0 : 1, transition: 'opacity 0.05s' }}
      />
      <img
        src={`/characters/${prefix}_open.webp`}
        alt=""
        height={size}
        style={{ gridArea: '1/1', height: size, width: 'auto', opacity: mouthOpen ? 1 : 0, transition: 'opacity 0.05s' }}
      />
    </span>
  )
}
