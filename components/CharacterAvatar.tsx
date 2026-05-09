'use client'

import { useEffect, useState } from 'react'

type Props = {
  character: 'sensei' | 'tomo'
  talking?: boolean
  size?: number
}

export function CharacterAvatar({ character, talking = false, size = 64 }: Props) {
  const [mouthOpen, setMouthOpen] = useState(false)

  useEffect(() => {
    if (!talking) { setMouthOpen(false); return }
    const interval = setInterval(() => setMouthOpen((p) => !p), 130)
    return () => clearInterval(interval)
  }, [talking])

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      {character === 'sensei' ? (
        <Sensei mouthOpen={mouthOpen} />
      ) : (
        <Tomo mouthOpen={mouthOpen} />
      )}
    </svg>
  )
}

function Sensei({ mouthOpen }: { mouthOpen: boolean }) {
  return (
    <>
      {/* 顔 */}
      <circle cx="50" cy="55" r="38" fill="#fde68a" />
      {/* 髪 */}
      <ellipse cx="50" cy="22" rx="32" ry="18" fill="#4b3a2a" />
      <rect x="18" y="20" width="64" height="20" fill="#4b3a2a" />
      {/* 耳 */}
      <ellipse cx="12" cy="55" rx="7" ry="9" fill="#fde68a" />
      <ellipse cx="88" cy="55" rx="7" ry="9" fill="#fde68a" />
      {/* メガネフレーム */}
      <rect x="18" y="43" width="24" height="16" rx="5" fill="none" stroke="#555" strokeWidth="2.5" />
      <rect x="58" y="43" width="24" height="16" rx="5" fill="none" stroke="#555" strokeWidth="2.5" />
      <line x1="42" y1="51" x2="58" y2="51" stroke="#555" strokeWidth="2" />
      <line x1="11" y1="51" x2="18" y2="51" stroke="#555" strokeWidth="2" />
      <line x1="82" y1="51" x2="89" y2="51" stroke="#555" strokeWidth="2" />
      {/* 目 */}
      <circle cx="30" cy="51" r="5" fill="#2d2d2d" />
      <circle cx="70" cy="51" r="5" fill="#2d2d2d" />
      <circle cx="32" cy="49" r="1.5" fill="white" />
      <circle cx="72" cy="49" r="1.5" fill="white" />
      {/* まゆ毛 */}
      <path d="M 20 38 Q 30 33 40 38" stroke="#4b3a2a" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M 60 38 Q 70 33 80 38" stroke="#4b3a2a" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      {/* 口 */}
      {mouthOpen ? (
        <>
          <path d="M 37 74 Q 50 80 63 74" stroke="#c0392b" strokeWidth="2" fill="#c0392b" />
          <ellipse cx="50" cy="76" rx="13" ry="6" fill="#e74c3c" />
          <path d="M 37 74 Q 50 68 63 74" stroke="#c8a882" strokeWidth="1.5" fill="#c8a882" />
        </>
      ) : (
        <path d="M 37 74 Q 50 80 63 74" stroke="#c0392b" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      )}
      {/* 服の襟 */}
      <path d="M 20 92 L 35 78 L 50 85 L 65 78 L 80 92" stroke="#16a34a" strokeWidth="3" fill="#16a34a" />
    </>
  )
}

function Tomo({ mouthOpen }: { mouthOpen: boolean }) {
  return (
    <>
      {/* ツインテール */}
      <ellipse cx="18" cy="28" rx="12" ry="16" fill="#f97316" transform="rotate(-20 18 28)" />
      <ellipse cx="82" cy="28" rx="12" ry="16" fill="#f97316" transform="rotate(20 82 28)" />
      {/* 髪 */}
      <ellipse cx="50" cy="25" rx="34" ry="20" fill="#f97316" />
      <rect x="16" y="22" width="68" height="22" fill="#f97316" />
      {/* 顔 */}
      <circle cx="50" cy="58" r="36" fill="#fde68a" />
      {/* 耳 */}
      <ellipse cx="14" cy="58" rx="7" ry="9" fill="#fde68a" />
      <ellipse cx="86" cy="58" rx="7" ry="9" fill="#fde68a" />
      {/* 目（大きめ） */}
      <circle cx="34" cy="52" r="10" fill="white" />
      <circle cx="66" cy="52" r="10" fill="white" />
      <circle cx="36" cy="53" r="7" fill="#7c3aed" />
      <circle cx="68" cy="53" r="7" fill="#7c3aed" />
      <circle cx="34" cy="51" r="4" fill="#1e1b4b" />
      <circle cx="66" cy="51" r="4" fill="#1e1b4b" />
      <circle cx="36" cy="49" r="2" fill="white" />
      <circle cx="68" cy="49" r="2" fill="white" />
      {/* まゆ毛 */}
      <path d="M 24 38 Q 34 33 44 38" stroke="#f97316" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M 56 38 Q 66 33 76 38" stroke="#f97316" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      {/* ほっぺ */}
      <circle cx="20" cy="63" r="8" fill="#fca5a5" opacity="0.55" />
      <circle cx="80" cy="63" r="8" fill="#fca5a5" opacity="0.55" />
      {/* 口 */}
      {mouthOpen ? (
        <>
          <ellipse cx="50" cy="77" rx="11" ry="7" fill="#e74c3c" />
          <path d="M 39 74 Q 50 68 61 74" stroke="#fde68a" strokeWidth="1.5" fill="#fde68a" />
          <path d="M 39 74 Q 50 84 61 74" stroke="#c0392b" strokeWidth="2" fill="none" />
        </>
      ) : (
        <path d="M 39 74 Q 50 82 61 74" stroke="#e11d48" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      )}
    </>
  )
}
