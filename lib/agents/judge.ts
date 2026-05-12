import { getLLMClient, getLLMModel } from "@/lib/llm";
import type { EvidenceEntry } from "@/lib/tools/evidence";
import { GRADE_CONFIG } from "@/lib/config/grades";

export type JudgeStatus = "judge_checked" | "judge_rejected" | "revision_required";

export type JudgeResult = {
  status: JudgeStatus;
  reason: string;
  evidenceIds: string[];
  gradeNote: string;
  childFacingSummary: string;
};

function buildSystemPrompt(grade: number, subject: string): string {
  const gradeConfig = GRADE_CONFIG[grade];
  return `あなたは教育コンテンツの品質を審査するエージェントです。
Generator Agentが生成した「横道ブランチ候補」を評価してください。

## 評価軸
1. 事実性：根拠があるか。Evidenceがある場合はそれに基づく。ない場合はモデルの知識で慎重に判断する
2. 学年適合性：小学${grade}年生が理解できるか
3. 安全性：子どもに不適切な内容ではないか
4. 探究価値：知識の広がりにつながるか

## 重要な設計方針
- 「本筋から外れていること」は却下理由にしない
- Evidenceがなくても、モデルの知識で事実確認できれば承認してよい
- ただし不確かな場合はrevision_requiredにする

## 言語・表現ルール（childFacingSummaryに必ず適用すること）
${gradeConfig.languageGuide}

## 対象教科
${subject}

## 出力形式（必ずJSONで返す）
{
  "status": "judge_checked" | "judge_rejected" | "revision_required",
  "reason": "判定理由（1-2文）",
  "evidenceIds": ["使用したevidenceのid配列（なければ空配列）"],
  "gradeNote": "学年適合に関する補足（1文）",
  "childFacingSummary": "子どもに提示する最終的な説明（上記言語ルールで。judge_rejectedの場合は空文字）"
}`;
}

export async function runJudgeAgent(
  branchCandidate: string,
  evidenceEntries: EvidenceEntry[],
  grade: number,
  subject: string
): Promise<JudgeResult> {
  const evidenceText =
    evidenceEntries.length > 0
      ? evidenceEntries
          .map((e) => `[${e.id}] ${e.topic}\n${e.evidence_text}\n学年メモ: ${e.grade_note}`)
          .join("\n\n")
      : "（関連するEvidenceなし：モデルの知識で事実確認すること）";

  const userMessage = `## ブランチ候補\n${branchCandidate}\n\n## Evidence\n${evidenceText}`;

  const response = await getLLMClient().chat.completions.create({
    model: getLLMModel(),
    messages: [
      { role: "system", content: buildSystemPrompt(grade, subject) },
      { role: "user", content: userMessage },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });

  const content = response.choices[0].message.content ?? "{}";
  return JSON.parse(content) as JudgeResult;
}
