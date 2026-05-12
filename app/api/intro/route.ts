import { NextRequest } from "next/server";
import { getLLMClient, getLLMModel } from "@/lib/llm";
import { GRADE_CONFIG } from "@/lib/config/grades";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const { grade, subject, characterMode, teacherGender } = await request.json();
  const gradeConfig = GRADE_CONFIG[grade as number];
  const sensei = teacherGender === "male" ? "ゆうすけ先生" : "あゆみ先生";

  const systemPrompt = `あなたは小学${grade}年生の「${subject}」の授業を始めるアシスタントです。
今日扱う具体的なトピックを1つ選んで、子どもとの会話を始めてください。

## 言語・表現ルール（必ず守ること）
${gradeConfig.languageGuide}

## senseiLineのキャラクター：${sensei}
口調：「〜だよ」「〜しよう」「〜だと思う？」。温かく親しみやすい先生。
「今日は〜をやろう！」で始め、具体的な問いかけで終わる。

## tomoLineのキャラクター
口調：タメ口。「えー！」「〜じゃない！？」「一緒にやろ！」。テンション高め。絵文字を使う。
senseiが出したテーマに反応しつつ、自分も知りたい！という気持ちを表現する。

## 出力形式（必ずJSONで返す）
{
  "theme": "今日のテーマ（8字以内。例：三角形の角度、都道府県の数、光合成）",
  "senseiLine": "せんせいのセリフ。「今日は〜をやろう！」で始め、具体的な問いかけで終わる。学年の言語ルール厳守。",
  "tomoLine": "ともだちキャラのセリフ。senseiLineのテーマに反応して、一緒に知りたい！という気持ちを1〜2文で。絵文字あり。"
}`;

  try {
    const response = await getLLMClient().chat.completions.create({
      model: getLLMModel(),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `小学${grade}年生の${subject}の授業を始めてください。` },
      ],
      response_format: { type: "json_object" },
      temperature: 0.95,
    });

    const result = JSON.parse(response.choices[0].message.content ?? "{}");
    return Response.json(result);
  } catch {
    // フォールバック
    return Response.json({
      theme: subject,
      senseiLine: `今日は${subject}について一緒に考えよう！何か気になることはある？`,
      tomoLine: `わたしも${subject}きになる〜！一緒にやろ！✨`,
    });
  }
}
