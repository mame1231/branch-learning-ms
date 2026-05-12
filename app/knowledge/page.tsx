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

function buildGraph(branches: Branch[]): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []

  const grouped: Record<string, Branch[]> = {}
  for (const b of branches) {
    const key = b.subject ?? 'その他'
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(b)
  }

  const subjects = Object.keys(grouped)
  const subjectSpacingX = 520
  const startX = (subjects.length - 1) * subjectSpacingX * -0.5

  subjects.forEach((subject, si) => {
    const subjectBranches = grouped[subject]
    const cx = startX + si * subjectSpacingX
    const cy = 0

    nodes.push({
      id: `subject-${subject}`,
      position: { x: cx - 80, y: cy },
      data: { label: subject },
      style: {
        background: '#16a34a',
        color: '#fff',
        borderRadius: 12,
        padding: '10px 20px',
        fontWeight: 700,
        fontSize: 15,
        border: 'none',
        boxShadow: '0 2px 8px rgba(22,163,74,0.3)',
        minWidth: 160,
        textAlign: 'center',
      },
    })

    const count = subjectBranches.length
    subjectBranches.forEach((b, bi) => {
      const angle = (bi / count) * 2 * Math.PI - Math.PI / 2
      const radius = Math.max(180, 80 + count * 30)
      const x = cx + Math.cos(angle) * radius - 100
      const y = cy + Math.sin(angle) * radius - 30

      const label = b.branch_summary.length > 40
        ? b.branch_summary.slice(0, 40) + '…'
        : b.branch_summary

      nodes.push({
        id: b.id,
        position: { x, y },
        data: {
          label: (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-amber-600 font-medium">「{b.child_question.slice(0, 25)}{b.child_question.length > 25 ? '…' : ''}」</span>
              <span className="text-xs text-gray-700">{label}</span>
            </div>
          ),
        },
        style: {
          background: '#fefce8',
          border: '1.5px solid #fbbf24',
          borderRadius: 10,
          padding: '8px 12px',
          width: 200,
          fontSize: 12,
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        },
      })

      edges.push({
        id: `e-${subject}-${b.id}`,
        source: `subject-${subject}`,
        target: b.id,
        style: { stroke: '#86efac', strokeWidth: 2 },
        animated: false,
      })
    })
  })

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
            fitViewOptions={{ padding: 0.3 }}
          >
            <Background color="#e5e7eb" gap={20} />
            <Controls />
          </ReactFlow>
        )}
      </div>
    </div>
  )
}
