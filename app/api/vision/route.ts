import { NextRequest } from "next/server";
import { getLLMClient, getLLMModel } from "@/lib/llm";
import { GRADE_CONFIG } from "@/lib/config/grades";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const { imageBase64, mimeType, grade, subject } = await request.json();

  if (!imageBase64 || !grade || !subject) {
    return Response.json({ error: "imageBase64, grade, subject are required" }, { status: 400 });
  }

  const client = getLLMClient();
  const model = getLLMModel();
  const gradeConfig = GRADE_CONFIG[grade as number];

  if (!gradeConfig) {
    return Response.json({ error: "invalid grade" }, { status: 400 });
  }

  const safeType = (mimeType as string)?.startsWith("image/") ? mimeType : "image/jpeg";

  let hint: string;
  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: `あなたは優しい先生です。子どもが宿題の写真を撮って送ってきました。
問題を読み取り、答えは絶対に言わず、小学${grade}年生向けのヒントだけを教えてください。

${gradeConfig.languageGuide}

返答の構成：
1. 「どんな問題か」を1文で確認する（例：「これは○○を求める問題だね！」）
2. 「考えるためのヒント」を2〜3つ、箇条書きで教える
3. 励ましの一言で締める

答えは絶対に言わないこと。`,
        },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:${safeType};base64,${imageBase64}` },
            },
            {
              type: "text",
              text: `これは${subject}の宿題です。問題を読み取って、ヒントを教えてください。`,
            },
          ],
        },
      ],
      max_tokens: 600,
    });

    hint = response.choices[0].message.content ?? "ごめん、うまく読み取れなかった。もう一度撮ってみて！";
  } catch (e) {
    console.error("vision error", e);
    return Response.json({ error: "vision failed" }, { status: 500 });
  }

  return Response.json({ hint });
}
