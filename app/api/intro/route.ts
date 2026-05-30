import { NextRequest } from "next/server";
import { getLLMClient, getLLMModel } from "@/lib/llm";
import { GRADE_CONFIG } from "@/lib/config/grades";
import { toGradeText } from "@/lib/utils/toGradeText";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const { grade, subject, unit, characterMode, teacherGender } = await request.json();
  const gradeConfig = GRADE_CONFIG[grade as number];
  const sensei = teacherGender === "male" ? "ゆうすけ先生" : "あゆみ先生";

  const isNandemo = subject === "なんでも";

  const systemPrompt = isNandemo
    ? `あなたは小学${grade}年生の子どもと話す優しい先生です。
教科は決まっていません。子どもが何でも気軽に話しかけられるよう、温かく迎えてください。

## 言語・表現ルール（必ず守ること）
${gradeConfig.languageGuide}

## senseiLineのキャラクター：${sensei}
口調：「〜だよ」「〜しよう」「〜だと思う？」。温かく親しみやすい先生。
「何か気になってることある？なんでも聞いてね！」のように、何でも受け入れる雰囲気で迎える。

## tomoLineのキャラクター
口調：タメ口。テンション高め。絵文字を使う。
senseiと一緒に「なんでも聞いていいよ！」という雰囲気を盛り上げる。

## 出力形式（必ずJSONで返す）
{
  "theme": "なんでも",
  "senseiLine": "「なんでも聞いてね！」「何か気になってることある？」のような一言。「〜の授業」という表現は絶対に使わない。学年の言語ルール厳守。",
  "tomoLine": "一緒に盛り上げる一言。絵文字あり。"
}`
    : unit === "自由に聞きたい"
    ? `あなたは小学${grade}年生の「${subject}」を教える優しい先生です。
子どもは「自由に聞きたい」を選びました。テーマを押しつけず、何でも気軽に聞けるよう温かく迎えてください。

## 言語・表現ルール（必ず守ること）
${gradeConfig.languageGuide}

## senseiLineのキャラクター：${sensei}
口調：「〜だよ」「〜しよう」「〜だと思う？」。温かく親しみやすい先生。
「今日は${subject}をやろう！何か聞きたいことはある？」のように、教科名を出しつつ自由に問いかけを促す一言で終わる。

## tomoLineのキャラクター
口調：タメ口。「えー！」「〜じゃない！？」「一緒にやろ！」。テンション高め。絵文字を使う。
「なんでも聞いていいよ！」という雰囲気を盛り上げる。

## 出力形式（必ずJSONで返す）
{
  "theme": "自由",
  "senseiLine": "教科名を出しつつ「何か聞きたいことはある？」で終わる一言。学年の言語ルール厳守。",
  "tomoLine": "一緒にやろ！という盛り上げ一言。絵文字あり。"
}`
    : `あなたは小学${grade}年生の「${subject}」の授業を始めるアシスタントです。
子どもが「${unit}」を選びました。このトピックで会話を始めてください。

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
  "theme": "${unit}",
  "senseiLine": "せんせいのセリフ。「今日は〜をやろう！」で始め、具体的な問いかけで終わる。学年の言語ルール厳守。",
  "tomoLine": "ともだちキャラのセリフ。senseiLineのテーマに反応して、一緒に知りたい！という気持ちを1〜2文で。絵文字あり。"
}`;

  if (isNandemo) {
    const senseiLine = await toGradeText(`今日は何をやる？なんでも聞いてね！`, grade as number)
    const tomoLine = await toGradeText(`なんでもOKだよ！一緒に考えよ！✨`, grade as number)
    return Response.json({ theme: "なんでも", senseiLine, tomoLine })
  }

  try {
    const userPrompt = unit === "自由に聞きたい"
      ? `小学${grade}年生の${subject}の授業です。子どもが自由に質問できるよう温かく迎えてください。`
      : unit
      ? `小学${grade}年生の${subject}「${unit}」の授業を始めてください。`
      : `小学${grade}年生の${subject}の授業を始めてください。`;

    const response = await getLLMClient().chat.completions.create({
      model: getLLMModel(),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.95,
    });

    const result = JSON.parse(response.choices[0].message.content ?? "{}");
    const gradeNum = grade as number;
    if (result.senseiLine) result.senseiLine = await toGradeText(result.senseiLine, gradeNum);
    if (result.tomoLine) result.tomoLine = await toGradeText(result.tomoLine, gradeNum);
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
