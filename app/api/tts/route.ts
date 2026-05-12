import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type VoiceProfile = { voice: string; rate: string; pitch: string };

const VOICE_PROFILES: Record<string, VoiceProfile> = {
  sensei:   { voice: "ja-JP-NanamiNeural",            rate: "1.05", pitch: "0%"   },
  female:   { voice: "ja-JP-NanamiNeural",            rate: "1.05", pitch: "0%"   },
  male:     { voice: "ja-JP-KeitaNeural",             rate: "1.1",  pitch: "0%"   },
  tomo:     { voice: "ja-JP-AoiNeural",               rate: "1.15", pitch: "0%"   },
  friend_1: { voice: "ja-JP-AoiNeural",               rate: "1.15", pitch: "0%"   },
  friend_2: { voice: "ja-JP-NaokiNeural",             rate: "1.2",  pitch: "+18%" }, // けんた：元気な男の子
  friend_3: { voice: "ja-JP-MasaruMultilingualNeural", rate: "1.05", pitch: "+45%" }, // エイリアン：宇宙人ぽい高音
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

  const profile = VOICE_PROFILES[character as keyof typeof VOICE_PROFILES] ?? VOICE_PROFILES.sensei;

  const cleanText = text
    .replace(/\p{Emoji_Presentation}/gu, "")
    .replace(/\s+/g, " ")
    .trim();

  const escaped = cleanText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const ssml = `
    <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="ja-JP">
      <voice name="${profile.voice}">
        <prosody rate="${profile.rate}" pitch="${profile.pitch}">${escaped}</prosody>
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
