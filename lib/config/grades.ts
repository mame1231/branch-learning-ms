import { CUMULATIVE_KANJI } from "./kanji";

// 教科名に含まれる漢字のよみがな
const KANJI_READINGS: Record<string, string> = {
  国: "こく", 語: "ご",
  算: "さん", 数: "すう",
  理: "り",   科: "か",
  社: "しゃ", 会: "かい",
  英: "えい",
  図: "ず",   工: "こう",
  音: "おん", 楽: "がく",
  体: "たい", 育: "いく",
};

/** 学年に合わせて未習漢字をひらがなに変換する */
export function toGradeDisplay(text: string, grade: number): string {
  const allowed = CUMULATIVE_KANJI[grade] ?? "";
  return text.split("").map((char) => {
    const code = char.charCodeAt(0);
    const isKanji = code >= 0x4e00 && code <= 0x9fff;
    if (isKanji && !allowed.includes(char)) {
      return KANJI_READINGS[char] ?? char;
    }
    return char;
  }).join("");
}

export type GradeConfig = {
  label: string;
  languageGuide: string;
};

function buildLanguageGuide(grade: number): string {
  const kanjiList = CUMULATIVE_KANJI[grade];
  const baseGuides: Record<number, string> = {
    1: "・1文は15字以内。語尾は「〜だよ」「〜だね」「〜しようね」。むずかしいことばは使わない。",
    2: "・1文は20字以内。語尾は「〜だよ」「〜だね」「〜できるね」。",
    3: "・1文は25字以内。語尾は「〜だよ」「〜だね」「〜なんだ」。因果関係（〜だから〜）を使ってよい。",
    4: "・1文は30字以内。語尾は「〜だよ」「〜なんだ」。専門用語は初出で平易に説明する。",
    5: "・文の長さは普通でよい。語尾は「〜だよ」「〜だね」「〜といえる」。専門用語も使えるが初出は説明を添える。",
    6: "・文の長さは普通でよい。語尾は「〜だよ」「〜だね」「〜といえます」。中学受験レベルの言葉も使えるが難しい場合は補足する。",
  };

  return `【絶対ルール：漢字の使用制限】
小学${grade}年生までに習った漢字だけを使うこと。
下のリストにない漢字は必ずひらがなで書くこと（例：「問題」→「もんだい」、「様子」→「ようす」）。
迷ったらひらがなで書くこと。

使ってよい漢字：${kanjiList}

【文体】
${baseGuides[grade]}`;
}

export const GRADE_CONFIG: Record<number, GradeConfig> = {
  1: { label: "1年生", languageGuide: buildLanguageGuide(1) },
  2: { label: "2年生", languageGuide: buildLanguageGuide(2) },
  3: { label: "3年生", languageGuide: buildLanguageGuide(3) },
  4: { label: "4年生", languageGuide: buildLanguageGuide(4) },
  5: { label: "5年生", languageGuide: buildLanguageGuide(5) },
  6: { label: "6年生", languageGuide: buildLanguageGuide(6) },
};

export const SUBJECTS = [
  { id: "国語", emoji: "📖" },
  { id: "算数", emoji: "🔢" },
  { id: "理科", emoji: "🔬" },
  { id: "社会", emoji: "🗺️" },
  { id: "英語", emoji: "🌍" },
  { id: "図工", emoji: "🎨" },
  { id: "音楽", emoji: "🎵" },
  { id: "体育", emoji: "⚽" },
  { id: "なんでも", emoji: "✨" },
];

export const GRADE_LABELS = ["1年生", "2年生", "3年生", "4年生", "5年生", "6年生"];
