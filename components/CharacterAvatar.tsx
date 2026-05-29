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

  // 2枚重ねて CSS opacity で切り替え → src 変更による一瞬消えを防ぐ
  return (
    <span style={{ position: 'relative', display: 'inline-block', width: size, height: size, flexShrink: 0 }}>
      <img
        src={`/characters/${prefix}_closed.png`}
        alt={label}
        width={size}
        height={size}
        style={{ position: 'absolute', top: 0, left: 0, objectFit: 'contain', opacity: mouthOpen ? 0 : 1, transition: 'opacity 0.05s' }}
      />
      <img
        src={`/characters/${prefix}_open.png`}
        alt=""
        width={size}
        height={size}
        style={{ position: 'absolute', top: 0, left: 0, objectFit: 'contain', opacity: mouthOpen ? 1 : 0, transition: 'opacity 0.05s' }}
      />
    </span>
  )
}
