import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
import { runGeneratorAgent, type HistoryMessage } from "@/lib/agents/generator";
import { runJudgeAgent } from "@/lib/agents/judge";
import { searchEvidence, getAllEvidence } from "@/lib/tools/evidence";
import { createServerClient } from "@/lib/supabase-server";
import { toGradeText } from "@/lib/utils/toGradeText";

export async function POST(request: NextRequest) {
  const { message, grade, subject, characterMode, teacherGender, studentId, conversationId, history } = await request.json();

  if (!message || typeof message !== "string") {
    return Response.json({ error: "message is required" }, { status: 400 });
  }

  const gradeNum = typeof grade === "number" ? grade : 4;
  const subjectStr = typeof subject === "string" ? subject : "社会";
  const charMode = typeof characterMode === "string" ? characterMode : "both";
  const teacher = typeof teacherGender === "string" ? teacherGender : "female";
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(obj: object) {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      }

      try {
        // Step 1: Generator（速い）
        const safeHistory: HistoryMessage[] = Array.isArray(history) ? history.slice(-8) : [];
        const generated = await runGeneratorAgent(message, gradeNum, subjectStr, charMode, teacher, safeHistory);

        if (!generated.hasYokomichi) {
          send({
            type: "done",
            hasYokomichi: false,
            text: generated.directAnswer || "うん！なんでも聞いてね。",
          });
          controller.close();
          return;
        }

        // 先生の答えを先に流す（Judge前）
        const immediateText = await toGradeText(generated.answerWithBranch, gradeNum);
        send({ type: "immediate", text: immediateText });
        // 友達の反応：約40%の確率でのみ送る
        if (generated.immediateResponse && Math.random() < 0.4) {
          const tomoText = await toGradeText(generated.immediateResponse, gradeNum);
          send({ type: "tomo_immediate", text: tomoText });
        }

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
          const savedSubject = subjectStr === "なんでも" && judged.inferredSubject
            ? judged.inferredSubject
            : subjectStr;

          // デモ学生かどうか確認してbranchに伝播
          let isDemo = false;
          if (studentId) {
            const { data: studentData } = await supabase
              .from("students")
              .select("is_demo")
              .eq("id", studentId)
              .single();
            isDemo = studentData?.is_demo ?? false;
          }

          await supabase.from("branches").insert({
            student_id: studentId || null,
            conversation_id: conversationId || null,
            child_question: generated.childQuestionSummary || message,
            branch_summary: judged.childFacingSummary,
            evidence_ids: judged.evidenceIds ?? [],
            judge_status: "judge_checked",
            grade: gradeNum,
            subject: savedSubject,
            is_demo: isDemo,
          });
        }

        const rawChildFacing = approved && judged.childFacingSummary?.trim()
          ? judged.childFacingSummary
          : null;
        const childFacing = rawChildFacing
          ? await toGradeText(rawChildFacing, gradeNum)
          : null;

        send({
          type: "branch",
          judgeStatus: childFacing ? "judge_checked" : "judge_rejected",
          childFacingSummary: childFacing,
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
