import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
import { runGeneratorAgent } from "@/lib/agents/generator";
import { runJudgeAgent } from "@/lib/agents/judge";
import { searchEvidence, getAllEvidence } from "@/lib/tools/evidence";
import { createServerClient } from "@/lib/supabase-server";

export async function POST(request: NextRequest) {
  const { message, grade, subject, characterMode, studentId, conversationId } = await request.json();

  if (!message || typeof message !== "string") {
    return Response.json({ error: "message is required" }, { status: 400 });
  }

  const gradeNum = typeof grade === "number" ? grade : 4;
  const subjectStr = typeof subject === "string" ? subject : "社会";
  const charMode = typeof characterMode === "string" ? characterMode : "both";
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(obj: object) {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      }

      try {
        // Step 1: Generator（速い）
        const generated = await runGeneratorAgent(message, gradeNum, subjectStr, charMode);

        if (!generated.hasYokomichi) {
          send({
            type: "done",
            hasYokomichi: false,
            text: generated.directAnswer || "うん！なんでも聞いてね。",
          });
          controller.close();
          return;
        }

        // 答え＋横道への導入を先に流す（Judge前）
        const immediateText = [generated.answerWithBranch, generated.immediateResponse]
          .filter(Boolean).join(" ");
        send({ type: "immediate", text: immediateText });

        // Step 2: Evidence Tool + Judge Agent（少し遅い）
        let evidenceEntries = searchEvidence(generated.searchKeyword);
        if (evidenceEntries.length === 0 && subjectStr === "社会") {
          evidenceEntries = getAllEvidence();
        }

        const judged = await runJudgeAgent(
          generated.branchCandidate,
          evidenceEntries,
          gradeNum,
          subjectStr
        );

        // revision_required は judge_checked と同様に表示する
        const approved = judged.status === "judge_checked" || judged.status === "revision_required";

        if (approved && judged.childFacingSummary) {
          const supabase = createServerClient();
          await supabase.from("branches").insert({
            student_id: studentId || null,
            conversation_id: conversationId || null,
            child_question: generated.childQuestionSummary || message,
            branch_summary: judged.childFacingSummary,
            evidence_ids: judged.evidenceIds ?? [],
            judge_status: "judge_checked",
            grade: gradeNum,
            subject: subjectStr,
          });
        }

        send({
          type: "branch",
          judgeStatus: approved ? "judge_checked" : "judge_rejected",
          childFacingSummary: approved ? judged.childFacingSummary : null,
          childQuestionSummary: generated.childQuestionSummary,
          evidenceIds: judged.evidenceIds,
        });

        controller.close();
      } catch {
        send({ type: "error" });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}
