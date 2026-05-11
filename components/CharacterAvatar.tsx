'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'

export type CharacterKey = 'female' | 'male' | 'friend_1' | 'friend_2' | 'friend_3'

const CHARACTER_INFO: Record<CharacterKey, { prefix: string; label: string }> = {
  female:   { prefix: 'sensei_f', label: '女の先生' },
  male:     { prefix: 'sensei_m', label: '男の先生' },
  friend_1: { prefix: 'friend_1', label: 'ともこ' },
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

  const { prefix, label } = CHARACTER_INFO[character]
  const src = `/characters/${prefix}_${mouthOpen ? 'open' : 'closed'}.png`

  return (
    <Image
      src={src}
      alt={label}
      width={size}
      height={size}
      style={{ objectFit: 'contain' }}
      priority
    />
  )
}
