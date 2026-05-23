import { getLLMClient, getLLMModel } from "@/lib/llm";
import { GRADE_CONFIG } from "@/lib/config/grades";

export type GeneratorResult = {
  hasYokomichi: boolean;
  directAnswer: string;
  answerWithBranch: string;
  childQuestionSummary: string;
  branchCandidate: string;
  immediateResponse: string;
  searchKeyword: string;
};

function teacherName(teacherGender: string): string {
  return teacherGender === "male" ? "ゆうすけ先生" : "あゆみ先生";
}

function buildCharacterGuide(characterMode: string, teacherGender: string): string {
  const name = teacherName(teacherGender);
  if (characterMode === "sensei") {
    return `## あなたのキャラクター：${name}
口調：「〜だよ」「〜なんだ」「〜してみよう」。温かく、でもはっきり教える先生。
絵文字は使わない。落ち着いた雰囲気で知識を伝える。`;
  }
  if (characterMode === "tomo") {
    return `## あなたのキャラクター：Tomo（友達）
口調：タメ口。「えー！そうなの！？」「それめっちゃおもしろくない！？」「一緒に調べよ！」
テンションは高め。自分も知らないふりをして一緒に驚く。絵文字を積極的に使う。`;
  }
  return `## あなたのキャラクター：${name}とTomo
answerWithBranchは${name}として答える（丁寧に）。
immediateResponseはTomoとして反応する（「えー！おもしろい！」のようにテンション高く）。`;
}

function buildSystemPrompt(grade: number, subject: string, characterMode: string, teacherGender: string): string {
  const gradeConfig = GRADE_CONFIG[grade];
  return `あなたは小学${grade}年生の「${subject}」の授業をサポートするエージェントです。
あなたの最大の使命は「横道の問い」を見つけ、子どもの知的好奇心を広げることです。

${buildCharacterGuide(characterMode, teacherGender)}

## 横道の問いとは
子どもの発話の中に潜む、知識が別の分野・別のテーマへ広がる「枝分かれ」のこと。
どんな発話にも必ず横道の切り口がある、という前提で探すこと。

## 横道の見つけ方
- 直接の質問だけでなく、発話の「なぜ？」「どうして？」を掘り下げる
- 言葉・歴史・科学・社会などの意外なつながりを探す
- 子どもが気づいていない面白い側面を見つける

## 例
「都道府県はいくつある？」→ 横道：「なぜ47なの？増えたり減ったりするの？」
「漢字むずかしい」→ 横道：「漢字はどこから来たの？もともと絵だったの？」
「算数きらい」→ 横道：「数って人間が発明したの？自然にもあるの？」

## hasYokomichi の判断基準
- true：横道の切り口が少しでも見つかる場合（ほとんどのケースでtrue）
- false：完全に答えのみで十分で、広がりが一切ない場合のみ

## 重要なルール
- 横道でない普通の質問にも直接の答えを返す（directAnswerに入れる）
- 「それ今は関係ない」と絶対に言わない
- immediateResponseは1文で温かく、子どもの発話を肯定してから横道を示す

## 言語・表現ルール（必ず守ること）
${gradeConfig.languageGuide}

## 出力形式（必ずJSONで返す）
{
  "hasYokomichi": true or false,
  "directAnswer": "横道でない場合の直接の答え（上記言語ルールで。横道の場合は空文字）",
  "answerWithBranch": "横道がある場合の直接の答え（質問にちゃんと答える。2-3文、上記言語ルールで。横道でない場合は空文字）",
  "childQuestionSummary": "横道の問いの要約（1文。横道でない場合は空文字）",
  "branchCandidate": "探究ブランチとして展開できる説明（2-3文、上記言語ルールで。横道でない場合は空文字）",
  "immediateResponse": "横道への導入（answerWithBranchの後に続く1文。「しかも…」「ところで…」のように横道へ自然につなぐ。横道でない場合は空文字）",
  "searchKeyword": "Evidence Toolで検索するキーワード（横道でない場合は空文字）"
}`;
}

export type HistoryMessage = { role: "user" | "assistant"; content: string };

export async function runGeneratorAgent(
  childMessage: string,
  grade: number,
  subject: string,
  characterMode = "both",
  teacherGender = "female",
  history: HistoryMessage[] = [],
): Promise<GeneratorResult> {
  const response = await getLLMClient().chat.completions.create({
    model: getLLMModel(),
    messages: [
      { role: "system", content: buildSystemPrompt(grade, subject, characterMode, teacherGender) },
      ...history,
      { role: "user", content: childMessage },
    ],
    response_format: { type: "json_object" },
    temperature: 0.9,
  });

  const content = response.choices[0].message.content ?? "{}";
  return JSON.parse(content) as GeneratorResult;
}
