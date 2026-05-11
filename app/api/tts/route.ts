import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const VOICES: Record<string, string> = {
  sensei:   "ja-JP-NanamiNeural",
  tomo:     "ja-JP-AoiNeural",
  female:   "ja-JP-NanamiNeural",
  male:     "ja-JP-KeitaNeural",
  friend_1: "ja-JP-AoiNeural",
  friend_2: "ja-JP-DaichiNeural",
  friend_3: "ja-JP-ShioriNeural",
};

export async function POST(request: NextRequest) {
  const { text, character } = await request.json();

  if (!text || !character) {
    return Response.json({ error: "text and character are required" }, { status: 400 });
  }

  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION ?? "eastus";

  if (!key) {
    return Response.json({ error: "AZURE_SPEECH_KEY not set" }, { status: 500 });
  }

  const voice = VOICES[character as keyof typeof VOICES] ?? VOICES.sensei;
  const rate = (character === "tomo" || character === "male") ? "1.1" : "1.05";

  const ssml = `
    <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="ja-JP">
      <voice name="${voice}">
        <prosody rate="${rate}">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</prosody>
      </voice>
    </speak>
  `.trim();

  const res = await fetch(
    `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
    {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
      },
      body: ssml,
    }
  );

  if (!res.ok) {
    return Response.json({ error: "TTS failed" }, { status: 500 });
  }

  const audioBuffer = await res.arrayBuffer();
  return new Response(audioBuffer, {
    headers: { "Content-Type": "audio/mpeg" },
  });
}
