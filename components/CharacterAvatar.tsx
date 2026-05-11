'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'

type Props = {
  character: 'female' | 'male'
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

  const prefix = character === 'female' ? 'sensei_f' : 'sensei_m'
  const src = `/characters/${prefix}_${mouthOpen ? 'open' : 'closed'}.png`

  return (
    <Image
      src={src}
      alt={character === 'female' ? '女の先生' : '男の先生'}
      width={size}
      height={size}
      style={{ objectFit: 'contain' }}
      priority
    />
  )
}
