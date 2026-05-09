"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CharacterAvatar } from "@/components/CharacterAvatar";
import { GRADE_LABELS, SUBJECTS, toGradeDisplay } from "@/lib/config/grades";
import { createClient } from "@/lib/supabase";

type Profile = { nickname: string | null; avatar_url: string | null };

type Phase = "welcome" | "grade" | "subject" | "character" | "chat";
type CharacterMode = "sensei" | "tomo" | "both";

type SavedConversation = {
  id: string
  grade: number
  subject: string
  messages: Message[]
  updated_at: string
};

type Message = {
  role: "child" | "agent";
  text: string;
  isBranch?: boolean;
  branchLabel?: string;
};

const BRANCH_LABELS = [
  "よりみち発見！",
  "おもしろ発見！",
  "深掘り！",
  "横道たんけん！",
  "気になる発見！",
  "ひろがり！",
];

function randomBranchLabel() {
  return BRANCH_LABELS[Math.floor(Math.random() * BRANCH_LABELS.length)];
}

function speakText(text: string, character: "sensei" | "tomo"): Promise<void> {
  return new Promise((resolve) => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ja-JP";
    utterance.pitch = character === "sensei" ? 1.0 : 1.4;
    utterance.rate = 1.1;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
}

export default function Home() {
  const router = useRouter();
  const [studentId, setStudentId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile>({ nickname: null, avatar_url: null });
  const [conversationId, setConversationId] = useState<string | null>(null);

  const [phase, setPhase] = useState<Phase>("welcome");
  const [savedConversation, setSavedConversation] = useState<SavedConversation | null>(null);
  const [characterMode, setCharacterMode] = useState<CharacterMode>("both");
  const [grade, setGrade] = useState<number | null>(null);
  const [subject, setSubject] = useState<string | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  // "idle" | "thinking"（即時応答待ち） | "checking"（Judge待ち）
  const [loadingPhase, setLoadingPhase] = useState<"idle" | "thinking" | "checking">("idle");
  const [recording, setRecording] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [talkingChar, setTalkingChar] = useState<"sensei" | "tomo" | null>(null);
  const [interimText, setInterimText] = useState("");

  const bottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const speechUnlockedRef = useRef(false);
  const interimTextRef = useRef("");

  // セッション確認・プロフィール・前回会話取得
  useEffect(() => {
    const id = localStorage.getItem("student_id");
    if (!id) { router.push("/login"); return; }
    setStudentId(id);
    const supabase = createClient();

    supabase.from("profiles").select("nickname, avatar_url").eq("id", id).single()
      .then(({ data }) => {
        if (!data?.nickname) { router.push("/profile"); return; }
        setProfile({ nickname: data.nickname, avatar_url: data.avatar_url ?? null });
      });

    supabase.from("conversations")
      .select("id, grade, subject, messages, updated_at")
      .eq("student_id", id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data && (data.messages as Message[]).length > 1) {
          setSavedConversation(data as SavedConversation);
        } else {
          setPhase("grade");
        }
      });
  }, [router]);

  // iOSはユーザージェスチャーからspeakを呼ばないとブロックされる
  function unlockSpeech() {
    if (speechUnlockedRef.current || typeof window === "undefined") return;
    speechUnlockedRef.current = true;
    const u = new SpeechSynthesisUtterance("");
    window.speechSynthesis.speak(u);
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, interimText]);

  async function saveMessages(msgs: Message[]) {
    if (!studentId) return;
    const supabase = createClient();
    if (conversationId) {
      await supabase.from("conversations")
        .update({ messages: msgs, updated_at: new Date().toISOString() })
        .eq("id", conversationId);
    }
  }

  function handleGradeSelect(g: number) {
    setGrade(g);
    setPhase("subject");
  }

  async function handleSubjectSelect(s: string) {
    unlockSpeech();
    setSubject(s);
    const subjectEmoji = SUBJECTS.find((sub) => sub.id === s)?.emoji ?? "";
    const introMessages: Message[] = [
      {
        role: "agent",
        text: `${subjectEmoji} ${s}について一緒に考えよう！なんでも気になることがあったら話しかけてね！`,
      },
      {
        role: "agent",
        text: `やっほー！${s}か〜！わたしも一緒に考えるね！`,
      },
    ];
    setMessages(introMessages);
    setPhase("character");

    if (studentId) {
      const supabase = createClient();
      const { data } = await supabase.from("conversations")
        .insert({ student_id: studentId, grade, subject: s, messages: introMessages })
        .select("id").single();
      setConversationId(data?.id ?? null);
    }
  }

  async function send(textOverride?: string) {
    const text = (textOverride ?? input).trim();
    if (!text || loadingPhase !== "idle" || speaking || grade === null || subject === null) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "child", text }]);
    setLoadingPhase("thinking");

    const speechItems: Array<{ text: string; char: "sensei" | "tomo" }> = [];

    try {
      const res = await fetch("/api/branch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, grade, subject, characterMode, studentId, conversationId }),
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const chunk = JSON.parse(line);

          if (chunk.type === "done") {
            setMessages((prev) => [...prev, { role: "agent", text: chunk.text }]);
            setLoadingPhase("idle");
            speechItems.push({ text: chunk.text, char: "sensei" });

          } else if (chunk.type === "immediate") {
            setMessages((prev) => [...prev, { role: "agent", text: chunk.text }]);
            setLoadingPhase("checking");
            speechItems.push({ text: chunk.text, char: "sensei" });

          } else if (chunk.type === "branch") {
            setLoadingPhase("idle");
            if (chunk.judgeStatus === "judge_checked" && chunk.childFacingSummary) {
              setMessages((prev) => [
                ...prev,
                {
                  role: "agent",
                  text: chunk.childFacingSummary,
                  isBranch: true,
                  branchLabel: randomBranchLabel(),
                },
              ]);
              speechItems.push({ text: chunk.childFacingSummary, char: "tomo" });
            } else if (chunk.judgeStatus === "judge_rejected") {
              const rejMsg = "その問い、すごく面白いんだけど、今すぐ正しい答えが確認できなかったんだ。メンターの先生に聞いてみようね！";
              setMessages((prev) => [...prev, { role: "agent", text: rejMsg }]);
              speechItems.push({ text: rejMsg, char: "sensei" });
            }

          } else if (chunk.type === "error") {
            setMessages((prev) => [
              ...prev,
              { role: "agent", text: "ごめん、うまく答えられなかった。もう一度聞いてみて。" },
            ]);
            setLoadingPhase("idle");
          }
        }
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "agent", text: "ごめん、うまく答えられなかった。もう一度聞いてみて。" },
      ]);
      setLoadingPhase("idle");
    }

    // 会話ログ保存
    setMessages((prev) => { saveMessages(prev); return prev; });

    // TTS: キャラクターモードに合わせて読み上げキャラを決定
    const effectiveItems = speechItems.map((item) => ({
      ...item,
      char: characterMode === "sensei" ? "sensei" as const
          : characterMode === "tomo"   ? "tomo"   as const
          : item.char,
    }));
    if (effectiveItems.length > 0) {
      setSpeaking(true);
      try {
        for (const item of effectiveItems) {
          setTalkingChar(item.char);
          await speakText(item.text, item.char);
          setTalkingChar(null);
        }
      } finally {
        setSpeaking(false);
        setTalkingChar(null);
      }
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      unlockSpeech();
      send();
    }
  }

  function startRecording() {
    if (!window.isSecureContext) {
      alert("音声入力はHTTPS接続が必要です。\nVercelなどのHTTPS環境でお試しください。");
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert("音声入力に対応していません。\niPhone/iPadはSafari、AndroidはChromeをお使いください。");
      return;
    }

    const recognition = new SR();
    recognition.lang = "ja-JP";
    recognition.interimResults = true;
    recognition.continuous = false;

    let gotResult = false;

    recognition.onresult = (e: SpeechRecognitionEvent) => {
      gotResult = true;
      const result = e.results[e.results.length - 1];
      const text = result[0].transcript;
      if (result.isFinal) {
        interimTextRef.current = "";
        setInterimText("");
        setRecording(false);
        send(text);
      } else {
        interimTextRef.current = text;
        setInterimText(text);
      }
    };

    recognition.onend = () => {
      setRecording(false);
      const text = interimTextRef.current;
      interimTextRef.current = "";
      setInterimText("");
      if (text.trim()) {
        send(text.trim());
      } else if (!gotResult) {
        alert("音声が認識されませんでした。\n\niPhoneの場合：\n設定 → 一般 → キーボード → 音声入力 をオン\n設定 → プライバシー → 音声認識 → Safari をオン");
      }
    };

    recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
      setRecording(false);
      interimTextRef.current = "";
      setInterimText("");
      const errorMessages: Record<string, string> = {
        "not-allowed": "マイクの使用が許可されていません。\nブラウザの設定でマイクを許可してください。",
        "no-speech": "声が聞こえませんでした。もう一度試してね！",
        "network": "ネットワークエラーです。\nインターネット接続を確認してください。",
        "audio-capture": "マイクが使えません。接続を確認してください。",
        "service-not-allowed": "iOSの設定でマイクが許可されていません。\n設定 → Safari → マイク → 許可 をオンにしてください。",
      };
      alert(errorMessages[e.error] ?? `音声認識エラー: ${e.error}`);
    };

    recognitionRef.current = recognition;
    try {
      window.speechSynthesis.cancel();
      recognition.start();
      setRecording(true);
    } catch {
      alert("音声認識の起動に失敗しました。ページを再読み込みして試してください。");
    }
  }

  function stopRecording() {
    recognitionRef.current?.stop();
    setRecording(false);
    setInterimText("");
  }

  const micDisabled = loadingPhase !== "idle" || speaking;

  // ── ウェルカム（続きから／はじめから）──────────────────────
  if (phase === "welcome") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-amber-50 flex flex-col items-center justify-center p-8">
        <button
          onClick={() => router.push("/profile")}
          className="absolute top-4 right-4 flex flex-col items-center gap-1"
        >
          <div className="w-10 h-10 rounded-full overflow-hidden bg-green-200 flex items-center justify-center border-2 border-green-400">
            {profile.avatar_url
              ? <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
              : <span className="text-xl">👤</span>}
          </div>
          <span className="text-xs text-green-600 font-medium">プロフィール</span>
        </button>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-4xl">🌿</span>
          <h1 className="text-3xl font-bold text-green-800">ブランチラーニング 🌿</h1>
        </div>
        <p className="text-green-600 mb-8 text-sm">おかえり、{profile.nickname ?? ""}！</p>

        <div className="flex gap-4 mb-6">
          <div className="flex flex-col items-center gap-1">
            <CharacterAvatar character="sensei" size={68} />
          </div>
          <div className="flex flex-col items-center gap-1">
            <CharacterAvatar character="tomo" size={68} />
          </div>
        </div>

        {savedConversation && (
          <div className="w-full max-w-sm mb-4 bg-white rounded-2xl shadow p-4 border-2 border-green-200">
            <p className="text-xs text-gray-400 mb-1">前回の続き</p>
            <p className="font-bold text-green-800">
              小学{savedConversation.grade}年生 ·{" "}
              {SUBJECTS.find((s) => s.id === savedConversation.subject)?.emoji}{" "}
              {toGradeDisplay(savedConversation.subject, savedConversation.grade)}
            </p>
            <p className="text-xs text-gray-500 mt-1 line-clamp-2">
              {[...savedConversation.messages].reverse().find((m) => m.role === "agent")?.text ?? ""}
            </p>
          </div>
        )}

        <div className="flex flex-col gap-3 w-full max-w-sm">
          {savedConversation && (
            <button
              onClick={() => {
                setGrade(savedConversation.grade);
                setSubject(savedConversation.subject);
                setMessages(savedConversation.messages);
                setConversationId(savedConversation.id);
                setPhase("chat");
              }}
              className="bg-green-500 text-white font-bold py-4 rounded-2xl hover:bg-green-600 transition-all shadow-md active:scale-95 text-lg"
            >
              🌿 続きからはじめる
            </button>
          )}
          <button
            onClick={() => setPhase("grade")}
            className={`font-bold py-4 rounded-2xl transition-all shadow-md active:scale-95 text-lg ${
              savedConversation
                ? "bg-white border-2 border-green-400 text-green-700 hover:bg-green-50"
                : "bg-green-500 text-white hover:bg-green-600"
            }`}
          >
            {savedConversation ? "はじめから" : "はじめる →"}
          </button>
        </div>

        <button
          onClick={() => { localStorage.removeItem("student_id"); router.push("/login"); }}
          className="fixed bottom-5 left-5 text-xs text-gray-400 hover:text-gray-600"
        >
          ログアウト
        </button>
        <a
          href="/admin"
          className="fixed bottom-5 right-5 text-xs text-green-600 border border-green-400 rounded-lg px-3 py-2 hover:bg-green-50 transition-colors bg-white shadow-sm"
        >
          管理者
        </a>
      </div>
    );
  }

  // ── 学年選択 ────────────────────────────────────────────
  if (phase === "grade") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-amber-50 flex flex-col items-center justify-center p-4 sm:p-8">
        <button
          onClick={() => setPhase("welcome")}
          className="absolute top-5 left-5 text-green-600 hover:text-green-800 flex items-center gap-1 text-sm font-medium"
        >
          ← もどる
        </button>
        <button
          onClick={() => router.push("/profile")}
          className="absolute top-4 right-4 flex flex-col items-center gap-1"
        >
          <div className="w-10 h-10 rounded-full overflow-hidden bg-green-200 flex items-center justify-center border-2 border-green-400">
            {profile.avatar_url
              ? <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
              : <span className="text-xl">👤</span>}
          </div>
          <span className="text-xs text-green-600 font-medium">プロフィール</span>
        </button>
        <div className="flex items-center gap-2 sm:gap-3 mb-1">
          <span className="text-4xl sm:text-5xl">🌿</span>
          <h1 className="text-3xl sm:text-4xl font-bold text-green-800">ブランチラーニング 🌿</h1>
        </div>
        <p className="text-green-600 mb-6 sm:mb-8 text-sm sm:text-base">知識のネットワークを広げよう</p>

        <div className="flex gap-6 sm:gap-10 mb-6 sm:mb-10">
          <div className="flex flex-col items-center gap-2">
            <CharacterAvatar character="sensei" size={68} />
            <span className="text-sm font-bold text-green-700">せんせい</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <CharacterAvatar character="tomo" size={68} />
            <span className="text-sm font-bold text-orange-500">ともだち</span>
          </div>
        </div>

        <p className="text-gray-700 text-lg sm:text-xl mb-4 sm:mb-6 font-medium">何年生ですか？</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 w-full max-w-xs sm:max-w-none">
          {GRADE_LABELS.map((label, i) => (
            <button
              key={i}
              onClick={() => handleGradeSelect(i + 1)}
              className="bg-white border-2 border-green-400 text-green-800 font-bold text-base sm:text-lg px-4 sm:px-8 py-4 sm:py-6 rounded-2xl hover:bg-green-500 hover:text-white hover:border-green-500 transition-all shadow-md active:scale-95"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── 教科選択 ────────────────────────────────────────────
  if (phase === "subject") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-amber-50 flex flex-col items-center justify-center p-4 sm:p-8">
        <button
          onClick={() => setPhase("grade")}
          className="absolute top-5 left-5 text-green-600 hover:text-green-800 flex items-center gap-1 text-sm font-medium"
        >
          ← 学年えらびにもどる
        </button>
        <button
          onClick={() => router.push("/profile")}
          className="absolute top-4 right-4 flex flex-col items-center gap-1"
        >
          <div className="w-10 h-10 rounded-full overflow-hidden bg-green-200 flex items-center justify-center border-2 border-green-400">
            {profile.avatar_url
              ? <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
              : <span className="text-xl">👤</span>}
          </div>
          <span className="text-xs text-green-600 font-medium">プロフィール</span>
        </button>

        <div className="flex items-center gap-2 mb-1">
          <span className="text-3xl">🌿</span>
          <h1 className="text-2xl sm:text-3xl font-bold text-green-800">ブランチラーニング 🌿</h1>
        </div>
        <p className="text-green-600 mb-6 sm:mb-8 text-sm sm:text-base">今日は何を学ぶ？</p>

        <div className="grid grid-cols-3 gap-2 sm:gap-3 w-full max-w-xs sm:max-w-sm">
          {SUBJECTS.map((s) => (
            <button
              key={s.id}
              onClick={() => handleSubjectSelect(s.id)}
              className="bg-white border-2 border-green-200 text-gray-700 font-bold py-3 sm:py-5 rounded-2xl hover:border-green-400 hover:bg-green-50 transition-all shadow-sm flex flex-col items-center gap-1 sm:gap-2 active:scale-95"
            >
              <span className="text-2xl sm:text-3xl">{s.emoji}</span>
              <span className="text-xs sm:text-sm">{toGradeDisplay(s.id, grade!)}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── キャラクター選択 ──────────────────────────────────────
  if (phase === "character") {
    const options: { mode: CharacterMode; label: string; sub: string; emoji: string; color: string }[] = [
      { mode: "sensei", label: "せんせい", sub: "ていねいに教えてくれる", emoji: "🎓", color: "border-green-400 hover:bg-green-50" },
      { mode: "tomo",   label: "ともだち", sub: "一緒にワクワクする",    emoji: "✨", color: "border-orange-400 hover:bg-orange-50" },
      { mode: "both",   label: "ふたり",   sub: "両方と話す",            emoji: "🌿", color: "border-purple-400 hover:bg-purple-50" },
    ];
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-amber-50 flex flex-col items-center justify-center p-4 sm:p-8">
        <button
          onClick={() => setPhase("subject")}
          className="absolute top-5 left-5 text-green-600 hover:text-green-800 flex items-center gap-1 text-sm font-medium"
        >
          ← 教科えらびにもどる
        </button>
        <button
          onClick={() => router.push("/profile")}
          className="absolute top-4 right-4 flex flex-col items-center gap-1"
        >
          <div className="w-10 h-10 rounded-full overflow-hidden bg-green-200 flex items-center justify-center border-2 border-green-400">
            {profile.avatar_url
              ? <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
              : <span className="text-xl">👤</span>}
          </div>
          <span className="text-xs text-green-600 font-medium">プロフィール</span>
        </button>

        <div className="flex items-center gap-2 mb-1">
          <span className="text-3xl">🌿</span>
          <h1 className="text-2xl sm:text-3xl font-bold text-green-800">ブランチラーニング 🌿</h1>
        </div>
        <p className="text-green-600 mb-8 text-sm">だれと話す？</p>

        <div className="flex flex-col gap-4 w-full max-w-xs">
          {options.map(({ mode, label, sub, emoji, color }) => (
            <button
              key={mode}
              onClick={() => { setCharacterMode(mode); setPhase("chat"); }}
              className={`bg-white border-2 ${color} rounded-2xl px-6 py-5 flex items-center gap-4 shadow-md transition-all active:scale-95`}
            >
              <div className="flex gap-1 flex-shrink-0">
                {(mode === "sensei" || mode === "both") && <CharacterAvatar character="sensei" size={52} />}
                {(mode === "tomo"   || mode === "both") && <CharacterAvatar character="tomo"   size={52} />}
              </div>
              <div className="text-left">
                <p className="font-bold text-gray-800 text-lg">{emoji} {label}</p>
                <p className="text-sm text-gray-500">{sub}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── チャット ────────────────────────────────────────────
  const subjectInfo = SUBJECTS.find((s) => s.id === subject);

  return (
    <div className="min-h-screen bg-amber-50 flex flex-col">
      {/* ヘッダー */}
      <header className="bg-green-600 text-white px-4 py-3 flex items-center shadow">
        <div className="flex-1">
          <button
            onClick={() => { setPhase("subject"); setMessages([]); setConversationId(null); }}
            className="flex items-center gap-1 text-sm font-bold text-white hover:text-green-100"
          >
            ← もどる
          </button>
        </div>
        <div className="flex-1 flex justify-center">
          <span className="font-bold text-lg flex items-center gap-1.5">
            {subjectInfo?.emoji} {subject ? toGradeDisplay(subject, grade!) : ""}
          </span>
        </div>
        <div className="flex-1 flex justify-end">
          <a
            href="/knowledge"
            className="flex items-center gap-1 text-xs font-bold text-green-700 bg-white rounded-full px-3 py-1.5 hover:bg-green-50 transition-colors"
          >
            🌿 発見マップ
          </a>
        </div>
      </header>

      {/* キャラクターエリア */}
      <div className="bg-white border-b border-green-100 px-4 py-3 flex items-end justify-center gap-8">
        {(characterMode === "sensei" || characterMode === "both") && (
          <div className="flex flex-col items-center gap-1">
            <CharacterAvatar character="sensei" size={72} talking={talkingChar === "sensei"} />
            <span className="text-xs font-bold text-green-700">せんせい</span>
          </div>
        )}
        {(characterMode === "tomo" || characterMode === "both") && (
          <div className="flex flex-col items-center gap-1">
            <CharacterAvatar character="tomo" size={72} talking={talkingChar === "tomo"} />
            <span className="text-xs font-bold text-orange-500">ともだち</span>
          </div>
        )}
      </div>

      {/* メッセージ */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((msg, i) => {
          if (msg.role === "child") {
            return (
              <div key={i} className="flex justify-end items-end gap-2">
                <div className="bg-blue-500 text-white px-4 py-3 rounded-2xl rounded-tr-sm max-w-[78%] sm:max-w-sm text-sm shadow">
                  {msg.text}
                </div>
                <div className="w-8 h-8 rounded-full bg-green-100 flex-shrink-0 flex items-center justify-center">
                  <span className="text-lg">👤</span>
                </div>
              </div>
            );
          }

          return (
            <div key={i}>
              {msg.isBranch ? (
                <div className="ml-11 mt-2 bg-gradient-to-r from-green-50 to-yellow-50 border-2 border-green-300 rounded-2xl px-4 py-3 max-w-[78%] sm:max-w-sm shadow-sm">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-base">🌿</span>
                    <span className="text-xs font-bold text-green-700 tracking-wider uppercase">
                      {msg.branchLabel}
                    </span>
                  </div>
                  <p className="text-sm text-green-900 italic">{msg.text}</p>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <div className="flex-shrink-0">
                    <CharacterAvatar character="sensei" size={36} />
                  </div>
                  <div className="bg-green-100 text-green-900 px-4 py-3 rounded-2xl rounded-tl-sm max-w-[78%] sm:max-w-sm text-sm shadow">
                    {msg.text}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {loadingPhase === "thinking" && (
          <div className="flex items-center gap-2">
            <CharacterAvatar character="sensei" size={36} />
            <div className="bg-green-100 px-4 py-3 rounded-2xl text-sm text-green-800 flex items-center gap-2">
              <span className="animate-pulse">🌿</span>
              <span>ブランチを探してるよ...</span>
            </div>
          </div>
        )}
        {loadingPhase === "checking" && (
          <div className="flex justify-start">
            <div className="bg-amber-50 border border-amber-200 rounded-2xl rounded-bl-sm px-4 py-2.5 flex items-center gap-2 text-xs text-amber-600">
              <span className="animate-spin inline-block">🌿</span>
              <span>ちゃんと確認してるよ...</span>
            </div>
          </div>
        )}

        {interimText && (
          <div className="flex justify-end">
            <div className="bg-blue-200 text-blue-800 px-4 py-3 rounded-2xl rounded-tr-sm max-w-sm text-sm shadow opacity-70 italic">
              {interimText}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 入力エリア */}
      <div className="bg-white border-t border-green-100 px-4 py-4 flex flex-col items-center gap-3">
        <div className="flex items-center gap-2 w-full max-w-md">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="メッセージを入力..."
            disabled={micDisabled}
            className="flex-1 border-2 border-green-400 rounded-full px-4 py-2.5 focus:outline-none focus:border-green-600 focus:ring-2 focus:ring-green-200 disabled:opacity-40 bg-white text-gray-800 placeholder-gray-400"
          />
          <button
            onClick={() => { unlockSpeech(); send(); }}
            disabled={micDisabled || !input.trim()}
            className="bg-green-500 text-white rounded-full w-10 h-10 flex items-center justify-center hover:bg-green-600 disabled:opacity-40 transition-all text-lg"
          >
            ↑
          </button>
        </div>

        <button
          onClick={recording ? stopRecording : startRecording}
          disabled={micDisabled}
          className={`w-16 h-16 rounded-full flex items-center justify-center text-3xl shadow-lg transition-all ${
            micDisabled
              ? "bg-gray-200 text-gray-400 cursor-not-allowed"
              : recording
              ? "bg-red-500 text-white scale-110 shadow-red-300 shadow-xl animate-pulse"
              : "bg-green-500 text-white hover:bg-green-600 active:scale-95"
          }`}
        >
          {speaking ? "🔊" : recording ? "⏹" : "🎤"}
        </button>
        <p className="text-xs text-gray-400">
          {speaking
            ? "読み上げ中..."
            : recording
            ? "タップして停止"
            : micDisabled
            ? "少し待ってね..."
            : "タップして話しかける"}
        </p>
      </div>
    </div>
  );
}
