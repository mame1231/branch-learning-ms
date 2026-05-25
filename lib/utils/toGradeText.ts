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

// モジュールロード時点から辞書の初期化を開始しておく
const tokenizerPromise: Promise<Tokenizer> = new Promise((resolve, reject) => {
  kuromoji
    .builder({ dicPath: path.join(process.cwd(), "node_modules/kuromoji/dict") })
    .build((err, tokenizer) => {
      if (err) { reject(err); return; }
      tokenizerCache = tokenizer;
      resolve(tokenizer);
    });
}).catch((err) => {
  // 辞書ファイルが見つからない場合はサーバーをクラッシュさせない
  console.warn("[toGradeText] kuromoji init failed:", err?.message);
  return Promise.reject(err);
}) as Promise<Tokenizer>;

function getTokenizer(): Promise<Tokenizer> {
  if (tokenizerCache) return Promise.resolve(tokenizerCache);
  return tokenizerPromise;
}

// 学年外の漢字をひらがなに変換（失敗時は元のテキストをそのまま返す）
export async function toGradeText(text: string, grade: number): Promise<string> {
  try {
    const allowed = new Set(CUMULATIVE_KANJI[grade] ?? "");

    // 変換不要なら早期リターン
    const needsConversion = [...text].some(
      (ch) => KANJI_RE.test(ch) && !allowed.has(ch)
    );
    if (!needsConversion) return text;

    const tokenizer = await Promise.race([
      getTokenizer(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("tokenizer timeout")), 5000)
      ),
    ]);

    const tokens = tokenizer.tokenize(text);

    return tokens
      .map((token) => {
        const surface = token.surface_form;
        const hasDisallowed = [...surface].some(
          (ch) => KANJI_RE.test(ch) && !allowed.has(ch)
        );
        if (!hasDisallowed) return surface;

        const reading = token.reading;
        return reading ? katakanaToHiragana(reading) : surface;
      })
      .join("");
  } catch {
    // kuromoji初期化失敗時は元のテキストを返す
    return text;
  }
}
