'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  ReactFlow,
  type Node,
  type Edge,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { createClient } from '@/lib/supabase'

type Branch = {
  id: string
  child_question: string
  branch_summary: string
  subject: string | null
  grade: number | null
}

const JP_STOP_BIGRAMS = new Set([
  "する","できる","なる","いる","ある","れる","られる","てい","ので","には","から","まで","こと","もの","ため","とき","よう","ほど","など","また","しか","ただ","さらに","たり","だり","ます","です","ない","なく","よる","より","その","この","あの","どの","それ","これ","あれ","どれ","では","して","おり","ており",
])

function extractBigrams(text: string): Set<string> {
  const clean = text.replace(/[、。！？\s]/g, '')
  const bigrams = new Set<string>()
  for (let i = 0; i < clean.length - 1; i++) {
    const bg = clean.slice(i, i + 2)
    if (!JP_STOP_BIGRAMS.has(bg)) bigrams.add(bg)
  }
  return bigrams
}

function similarity(a: Branch, b: Branch): number {
  const kA = extractBigrams(a.branch_summary + a.child_question)
  const kB = extractBigrams(b.branch_summary + b.child_question)
  let common = 0
  kA.forEach(k => { if (kB.has(k)) common++ })
  const union = new Set([...kA, ...kB]).size
  return union === 0 ? 0 : common / union
}

function sortBySimilarity(branches: Branch[]): Branch[] {
  if (branches.length <= 1) return branches
  const remaining = [...branches]
  const sorted: Branch[] = [remaining.splice(0, 1)[0]]
  while (remaining.length > 0) {
    const last = sorted[sorted.length - 1]
    let bestIdx = 0, bestSim = -1
    remaining.forEach((b, i) => {
      const s = similarity(last, b)
      if (s > bestSim) { bestSim = s; bestIdx = i }
    })
    sorted.push(remaining.splice(bestIdx, 1)[0])
  }
  return sorted
}

// 教科間の平均類似度で教科の隣接順を決める
function orderSubjects(grouped: Record<string, Branch[]>): string[] {
  const subjects = Object.keys(grouped)
  if (subjects.length <= 2) return subjects

  function subjectSim(a: string, b: string): number {
    const ba = grouped[a], bb = grouped[b]
    let total = 0
    for (const x of ba) for (const y of bb) total += similarity(x, y)
    return total / (ba.length * bb.length)
  }

  const remaining = [...subjects]
  const ordered = [remaining.splice(0, 1)[0]]
  while (remaining.length > 0) {
    const last = ordered[ordered.length - 1]
    let bestIdx = 0, bestSim = -1
    remaining.forEach((s, i) => {
      const sim = subjectSim(last, s)
      if (sim > bestSim) { bestSim = sim; bestIdx = i }
    })
    ordered.push(remaining.splice(bestIdx, 1)[0])
  }
  return ordered
}

const SUBJECT_COLORS: Record<string, string> = {
  '理科': '#3b82f6', '算数': '#f59e0b', '国語': '#ef4444',
  '社会': '#8b5cf6', '英語': '#10b981', '図工': '#f97316',
  '音楽': '#ec4899', '体育': '#06b6d4', 'その他': '#6b7280',
}

function buildGraph(branches: Branch[]): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []

  const grouped: Record<string, Branch[]> = {}
  for (const b of branches) {
    const key = b.subject ?? 'その他'
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(b)
  }

  const subjects = orderSubjects(grouped)
  const total = branches.length
  const NODE_W = 165
  const MIN_SPACING = 175
  const RING_R = Math.max(320, (total * MIN_SPACING) / (2 * Math.PI))
  const SUBJ_R = RING_R * 0.48

  let angleOffset = -Math.PI / 2

  subjects.forEach(subject => {
    const sorted = sortBySimilarity(grouped[subject])
    const count = sorted.length
    const arcAngle = (count / total) * 2 * Math.PI
    const arcMid = angleOffset + arcAngle / 2
    const color = SUBJECT_COLORS[subject] ?? '#6b7280'

    // 教科ノード（輪の内側）
    nodes.push({
      id: `subject-${subject}`,
      position: {
        x: Math.cos(arcMid) * SUBJ_R - 60,
        y: Math.sin(arcMid) * SUBJ_R - 20,
      },
      data: { label: subject },
      style: {
        background: color,
        color: '#fff',
        borderRadius: 10,
        padding: '8px 18px',
        fontWeight: 700,
        fontSize: 14,
        border: 'none',
        boxShadow: `0 2px 8px ${color}55`,
        whiteSpace: 'nowrap',
      },
    })

    // ブランチノードをアーク上に均等配置
    sorted.forEach((b, bi) => {
      const t = (bi + 0.5) / count
      const angle = angleOffset + t * arcAngle
      const x = Math.cos(angle) * RING_R - NODE_W / 2
      const y = Math.sin(angle) * RING_R - 40

      const label = b.branch_summary.length > 38
        ? b.branch_summary.slice(0, 38) + '…'
        : b.branch_summary

      nodes.push({
        id: b.id,
        position: { x, y },
        data: {
          label: (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium" style={{ color }}>
                「{b.child_question.slice(0, 20)}{b.child_question.length > 20 ? '…' : ''}」
              </span>
              <span className="text-xs text-gray-700">{label}</span>
            </div>
          ),
        },
        style: {
          background: '#fff',
          border: `1.5px solid ${color}`,
          borderRadius: 10,
          padding: '7px 10px',
          width: NODE_W,
          fontSize: 12,
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        },
      })

      edges.push({
        id: `e-${subject}-${b.id}`,
        source: `subject-${subject}`,
        target: b.id,
        style: { stroke: color, strokeWidth: 1.5, opacity: 0.5 },
        animated: false,
      })
    })

    angleOffset += arcAngle
  })

  // ブランチが別教科のブランチと特に似ていれば、その教科ノードへ線を引く
  for (const b of branches) {
    const mySubj = b.subject ?? 'その他'
    const maxSimBySubject: Record<string, number> = {}
    for (const other of branches) {
      const otherSubj = other.subject ?? 'その他'
      if (otherSubj === mySubj) continue
      const sim = similarity(b, other)
      if ((maxSimBySubject[otherSubj] ?? 0) < sim) maxSimBySubject[otherSubj] = sim
    }
    for (const [subj, maxSim] of Object.entries(maxSimBySubject)) {
      if (maxSim >= 0.15) {
        edges.push({
          id: `cross-${b.id}-${subj}`,
          source: b.id,
          target: `subject-${subj}`,
          style: { stroke: '#a78bfa', strokeWidth: 1.5, strokeDasharray: '4,3', opacity: 0.65 },
          animated: false,
        })
      }
    }
  }

  return { nodes, edges }
}

export default function KnowledgePage() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [loading, setLoading] = useState(true)
  const [branchCount, setBranchCount] = useState(0)

  const fetchAndBuild = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('branches')
      .select('id, child_question, branch_summary, subject, grade')
      .eq('judge_status', 'mentor_approved')
      .order('created_at', { ascending: true })

    const branches = (data as Branch[]) ?? []
    setBranchCount(branches.length)

    if (branches.length > 0) {
      const { nodes: n, edges: e } = buildGraph(branches)
      setNodes(n)
      setEdges(e)
    }
    setLoading(false)
  }, [setNodes, setEdges])

  useEffect(() => { fetchAndBuild() }, [fetchAndBuild])

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <div className="bg-green-700 text-white px-6 py-4 shadow flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">発見マップ</h1>
          <p className="text-sm text-green-200">承認されたブランチ: {branchCount}件</p>
        </div>
        <button onClick={() => window.history.back()} className="text-sm text-green-200 hover:text-white">
          ← もどる
        </button>
      </div>

      <div className="flex-1" style={{ height: 'calc(100vh - 80px)' }}>
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-400">よみこみ中...</p>
          </div>
        ) : branchCount === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <p className="text-4xl">🌱</p>
            <p className="text-gray-500">まだ承認されたブランチがありません</p>
            <a href="/admin" className="text-green-600 hover:underline text-sm">
              管理者ページでブランチを承認する →
            </a>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            fitView
            fitViewOptions={{ padding: 0.25 }}
          >
            <Background color="#e5e7eb" gap={20} />
            <Controls />
          </ReactFlow>
        )}
      </div>
    </div>
  )
}
