import kuromoji from "kuromoji";
import path from "path";
import { CUMULATIVE_KANJI } from "@/lib/config/kanji";

const KANJI_RE = /[一-龯㐀-䶿]/;

function katakanaToHiragana(str: string): string {
  return str.replace(/[゠-ヿ]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );
}

type Tokenizer = kuromoji.Tokenizer<kuromoji.IpadicFeatures>;
let tokenizerCache: Tokenizer | null = null;
let tokenizerPromise: Promise<Tokenizer> | null = null;

function getTokenizer(): Promise<Tokenizer> {
  if (tokenizerCache) return Promise.resolve(tokenizerCache);
  if (tokenizerPromise) return tokenizerPromise;
  tokenizerPromise = new Promise((resolve, reject) => {
    kuromoji
      .builder({ dicPath: path.join(process.cwd(), "node_modules/kuromoji/dict") })
      .build((err, tokenizer) => {
        if (err) { reject(err); return; }
        tokenizerCache = tokenizer;
        resolve(tokenizer);
      });
  });
  return tokenizerPromise;
}

// 学年外の漢字をひらがなに変換
export async function toGradeText(text: string, grade: number): Promise<string> {
  const allowed = new Set(CUMULATIVE_KANJI[grade] ?? "");

  // 変換不要なら早期リターン
  const needsConversion = [...text].some(
    (ch) => KANJI_RE.test(ch) && !allowed.has(ch)
  );
  if (!needsConversion) return text;

  const tokenizer = await getTokenizer();
  const tokens = tokenizer.tokenize(text);

  return tokens
    .map((token) => {
      const surface = token.surface_form;
      const hasDisallowed = [...surface].some(
        (ch) => KANJI_RE.test(ch) && !allowed.has(ch)
      );
      if (!hasDisallowed) return surface;

      // 読みをひらがなに変換（読みがない場合はsurfaceをそのまま）
      const reading = token.reading;
      return reading ? katakanaToHiragana(reading) : surface;
    })
    .join("");
}
