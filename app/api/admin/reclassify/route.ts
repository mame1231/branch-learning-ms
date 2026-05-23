import { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { getLLMClient, getLLMModel } from "@/lib/llm";

export const dynamic = "force-dynamic";

const KNOWN_SUBJECTS = ["国語", "算数", "理科", "社会", "英語", "図工", "音楽", "体育"];

async function inferSubject(question: string, summary: string): Promise<string> {
  const res = await getLLMClient().chat.completions.create({
    model: getLLMModel(),
    messages: [
      {
        role: "system",
        content: `以下の子どもの問いとブランチ内容から、最も近い小学校の教科を1つ選んでください。
選択肢：${KNOWN_SUBJECTS.join("・")}・なんでも
必ず上記の選択肢の中から1つだけ回答してください。説明不要。`,
      },
      {
        role: "user",
        content: `問い：${question}\n内容：${summary}`,
      },
    ],
    max_tokens: 10,
    temperature: 0,
  });
  const result = (res.choices[0].message.content ?? "").trim();
  return [...KNOWN_SUBJECTS, "なんでも"].includes(result) ? result : "なんでも";
}

export async function POST(request: NextRequest) {
  const { password } = await request.json();
  if (password !== "test") {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();
  const { data: branches, error } = await supabase
    .from("branches")
    .select("id, child_question, branch_summary")
    .eq("subject", "なんでも");

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!branches?.length) return Response.json({ updated: 0 });

  let updated = 0;
  for (const b of branches) {
    const inferred = await inferSubject(b.child_question, b.branch_summary);
    if (inferred !== "なんでも") {
      await supabase.from("branches").update({ subject: inferred }).eq("id", b.id);
      updated++;
    }
  }

  return Response.json({ updated, total: branches.length });
}
