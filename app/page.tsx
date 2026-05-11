"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CharacterAvatar } from "@/components/CharacterAvatar";
import { GRADE_LABELS, SUBJECTS, toGradeDisplay } from "@/lib/config/grades";
import { createClient } from "@/lib/supabase";

type Profile = { nickname: string | null; avatar_url: string | null };

type Phase = "welcome" | "grade" | "subject" | "resume" | "chat";
type TeacherGender = "female" | "male";

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

let audioCtx: AudioContext | null = null;
let currentSource: AudioBufferSourceNode | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

function unlockAudio() {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") ctx.resume();
}

function speakText(text: string, character: string): Promise<void> {
  return new Promise(async (resolve) => {
    if (currentSource) { currentSource.stop(); currentSource = null; }
    try {
      const ctx = getAudioContext();
      if (ctx.state === "suspended") await ctx.resume();

      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, character }),
      });
      if (!res.ok) throw new Error("TTS failed");
      const arrayBuffer = await res.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.onended = () => resolve();
      currentSource = source;
      source.start(0);
    } catch {
      resolve();
    }
  });
}

export default function Home() {
  const router = useRouter();
  const [studentId, setStudentId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile>({ nickname: null, avatar_url: null });
  const [conversationId, setConversationId] = useState<string | null>(null);

  const [phase, setPhase] = useState<Phase>("welcome");
  const [savedConversations, setSavedConversations] = useState<Record<string, SavedConversation>>({});
  const [teacherGender, setTeacherGender] = useState<TeacherGender | null>(null);
  const [grade, setGrade] = useState<number | null>(null);
  const [subject, setSubject] = useState<string | null>(null);

  const [theme, setTheme] = useState<string | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  // "idle" | "thinking"（即時応答待ち） | "checking"（Judge待ち）
  const [loadingPhase, setLoadingPhase] = useState<"idle" | "thinking" | "checking">("idle");
  const [recording, setRecording] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [talkingChar, setTalkingChar] = useState<"female" | "male" | null>(null);
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
    const savedTeacher = localStorage.getItem("teacher_gender") as TeacherGender | null;
    if (savedTeacher) setTeacherGender(savedTeacher);
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
      .limit(30)
      .then(({ data }) => {
        if (data) {
          const map: Record<string, SavedConversation> = {};
          for (const conv of data) {
            if (!map[conv.subject] && (conv.messages as Message[]).length > 1) {
              map[conv.subject] = conv as SavedConversation;
            }
          }
          setSavedConversations(map);
        }
        setPhase("grade");
      });
  }, [router]);

  function unlockSpeech() { unlockAudio(); }

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

  function selectTeacher(gender: TeacherGender) {
    localStorage.setItem("teacher_gender", gender);
    setTeacherGender(gender);
  }

  function handleSubjectSelect(s: string) {
    unlockSpeech();
    setSubject(s);
    if (savedConversations[s]) {
      setPhase("resume");
    } else {
      startChat(s);
    }
  }

  async function startChat(selectedSubject: string) {
    const teacher = teacherGender ?? "female";
    const friend: TeacherGender = teacher === "female" ? "male" : "female";
    setPhase("chat");
    setLoadingPhase("thinking");

    let introMessages: Message[] = [];
    let introTheme = selectedSubject;

    try {
      const res = await fetch("/api/intro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grade, subject: selectedSubject, characterMode: "both" }),
      });
      const data = await res.json();
      introTheme = data.theme ?? selectedSubject;
      introMessages = [
        { role: "agent", text: data.senseiLine },
        { role: "agent", text: data.tomoLine },
      ];
    } catch {
      const subjectEmoji = SUBJECTS.find((s) => s.id === selectedSubject)?.emoji ?? "";
      introMessages = [{ role: "agent", text: `${subjectEmoji} ${selectedSubject}について一緒に考えよう！` }];
    }

    setTheme(introTheme);
    setMessages(introMessages);
    setLoadingPhase("idle");

    if (studentId) {
      const supabase = createClient();
      const { data } = await supabase.from("conversations")
        .insert({ student_id: studentId, grade, subject: selectedSubject, messages: introMessages })
        .select("id").single();
      setConversationId(data?.id ?? null);
    }

    // TTS で読み上げ
    setSpeaking(true);
    try {
      setTalkingChar(teacher);
      await speakText(introMessages[0].text, teacher);
      setTalkingChar(null);
      if (introMessages[1]) {
        setTalkingChar(friend);
        await speakText(introMessages[1].text, friend);
        setTalkingChar(null);
      }
    } finally {
      setSpeaking(false);
      setTalkingChar(null);
    }
  }

  async function send(textOverride?: string) {
    const text = (textOverride ?? input).trim();
    if (!text || loadingPhase !== "idle" || speaking || grade === null || subject === null) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "child", text }]);
    setLoadingPhase("thinking");

    const teacher = teacherGender ?? "female";
    const friend: TeacherGender = teacher === "female" ? "male" : "female";
    const speechItems: Array<{ text: string; char: TeacherGender }> = [];

    try {
      const res = await fetch("/api/branch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, grade, subject, characterMode: "both", studentId, conversationId }),
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
            speechItems.push({ text: chunk.text, char: teacher });

          } else if (chunk.type === "immediate") {
            setMessages((prev) => [...prev, { role: "agent", text: chunk.text }]);
            setLoadingPhase("checking");
            speechItems.push({ text: chunk.text, char: teacher });

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
              speechItems.push({ text: chunk.childFacingSummary, char: friend });
            } else if (chunk.judgeStatus === "judge_rejected") {
              const rejMsg = "その問い、すごく面白いんだけど、今すぐ正しい答えが確認できなかったんだ。メンターの先生に聞いてみようね！";
              setMessages((prev) => [...prev, { role: "agent", text: rejMsg }]);
              speechItems.push({ text: rejMsg, char: teacher });
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

    if (speechItems.length > 0) {
      setSpeaking(true);
      try {
        for (const item of speechItems) {
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
      if (currentSource) { currentSource.stop(); currentSource = null; }
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

  function stopSpeaking() {
    if (currentSource) { currentSource.stop(); currentSource = null; }
    setSpeaking(false);
    setTalkingChar(null);
  }

  const micDisabled = loadingPhase !== "idle" || speaking;

  // ── ウェルカム ──────────────────────────────────────────
  if (phase === "welcome") {
    const resumeSubjects = Object.keys(savedConversations);
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
        <p className="text-green-600 mb-6 text-sm">おかえり、{profile.nickname ?? ""}！</p>

        {/* 先生選択 */}
        {!teacherGender ? (
          <>
            <p className="text-gray-700 font-bold mb-4">どっちの先生と話す？</p>
            <div className="flex gap-4 mb-6">
              {(["female", "male"] as TeacherGender[]).map((g) => (
                <button key={g} onClick={() => selectTeacher(g)}
                  className="flex flex-col items-center gap-2 bg-white rounded-2xl px-6 py-4 shadow-md border-2 border-green-200 hover:border-green-400 active:scale-95 transition-all">
                  <CharacterAvatar character={g} size={80} />
                  <span className={`text-sm font-bold ${g === "female" ? "text-pink-600" : "text-blue-600"}`}>
                    {g === "female" ? "女の先生" : "男の先生"}
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-col items-center mb-4">
              <CharacterAvatar character={teacherGender} size={100} />
              <p className={`font-bold mt-2 ${teacherGender === "female" ? "text-pink-600" : "text-blue-600"}`}>
                {teacherGender === "female" ? "女の先生" : "男の先生"}
              </p>
              <button onClick={() => { localStorage.removeItem("teacher_gender"); setTeacherGender(null); }}
                className="text-xs text-gray-400 hover:text-gray-600 mt-1 underline">
                変える
              </button>
            </div>

            {resumeSubjects.length > 0 && (
              <div className="w-full max-w-sm mb-4">
                <p className="text-xs text-gray-400 mb-2 text-center">続きがある教科</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {resumeSubjects.map((s) => {
                    const info = SUBJECTS.find((sub) => sub.id === s);
                    return (
                      <span key={s} className="bg-green-100 text-green-700 text-xs font-bold px-3 py-1 rounded-full border border-green-200">
                        {info?.emoji} {s}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            <button
              onClick={() => setPhase("grade")}
              className="bg-green-500 text-white font-bold py-4 px-10 rounded-2xl hover:bg-green-600 transition-all shadow-md active:scale-95 text-lg"
            >
              はじめる →
            </button>
          </>
        )}

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
            <CharacterAvatar character="female" size={68} />
            <span className="text-sm font-bold text-pink-600">女の先生</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <CharacterAvatar character="male" size={68} />
            <span className="text-sm font-bold text-blue-600">男の先生</span>
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
          {SUBJECTS.map((s) => {
            const hasSaved = !!savedConversations[s.id];
            return (
              <button
                key={s.id}
                onClick={() => handleSubjectSelect(s.id)}
                className={`relative bg-white border-2 text-gray-700 font-bold py-3 sm:py-5 rounded-2xl hover:border-green-400 hover:bg-green-50 transition-all shadow-sm flex flex-col items-center gap-1 sm:gap-2 active:scale-95 ${
                  hasSaved ? "border-green-400" : "border-green-200"
                }`}
              >
                {hasSaved && (
                  <span className="absolute -top-2 -right-2 bg-green-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-tight">
                    続き
                  </span>
                )}
                <span className="text-2xl sm:text-3xl">{s.emoji}</span>
                <span className="text-xs sm:text-sm">{toGradeDisplay(s.id, grade!)}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── 続きから／はじめから選択 ─────────────────────────────────
  if (phase === "resume" && subject) {
    const saved = savedConversations[subject];
    const subjectInfo = SUBJECTS.find((s) => s.id === subject);
    const lastAgentMsg = saved
      ? [...saved.messages].reverse().find((m) => m.role === "agent")?.text ?? ""
      : "";
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-amber-50 flex flex-col items-center justify-center p-6">
        <button
          onClick={() => setPhase("subject")}
          className="absolute top-5 left-5 text-green-600 hover:text-green-800 flex items-center gap-1 text-sm font-medium"
        >
          ← 教科えらびにもどる
        </button>

        <div className="text-5xl mb-3">{subjectInfo?.emoji}</div>
        <h2 className="text-xl font-bold text-green-800 mb-1">
          {toGradeDisplay(subject, grade!)}
        </h2>
        <p className="text-sm text-green-600 mb-6">続きがあるよ！どうする？</p>

        <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-green-100 p-4 mb-6">
          <p className="text-xs text-gray-400 mb-1">まえのトークのつづき</p>
          <p className="text-sm text-gray-700 line-clamp-3">{lastAgentMsg}</p>
        </div>

        <div className="flex flex-col gap-3 w-full max-w-sm">
          <button
            onClick={() => {
              if (!saved) return;
              setMessages(saved.messages);
              setConversationId(saved.id);
              setTheme(null);
              setPhase("chat");
            }}
            className="bg-green-500 text-white font-bold py-4 rounded-2xl hover:bg-green-600 transition-all shadow-md active:scale-95 text-lg"
          >
            🌿 続きからはじめる
          </button>
          <button
            onClick={() => {
              setMessages([]);
              setConversationId(null);
              setTheme(null);
              startChat(subject);
            }}
            className="bg-white border-2 border-green-400 text-green-700 font-bold py-4 rounded-2xl hover:bg-green-50 transition-all shadow-sm active:scale-95 text-lg"
          >
            はじめから
          </button>
        </div>
      </div>
    );
  }

  // ── チャット ────────────────────────────────────────────
  const subjectInfo = SUBJECTS.find((s) => s.id === subject);

  return (
    <div className="h-[100dvh] bg-[#ebe5d9] sm:bg-amber-50 flex flex-col">
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


      {/* メッセージ */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {theme && (
          <div className="flex justify-center pt-1 pb-2">
            <span className="bg-white/80 text-green-700 text-xs font-bold px-4 py-1.5 rounded-full shadow-sm border border-green-200">
              📚 今日のテーマ：{theme}
            </span>
          </div>
        )}
        {messages.map((msg, i) => {
          if (msg.role === "child") {
            return (
              <div key={i} className="flex justify-end items-end gap-2">
                <div className="bg-blue-500 text-white px-4 py-3 rounded-2xl rounded-tr-sm max-w-[78%] sm:max-w-sm text-sm shadow">
                  {msg.text}
                </div>
                <div className="w-9 h-9 rounded-full bg-green-100 flex-shrink-0 overflow-hidden flex items-center justify-center border-2 border-white shadow-md">
                  {profile.avatar_url
                    ? <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                    : <span className="text-lg">👤</span>}
                </div>
              </div>
            );
          }

          const teacher = teacherGender ?? "female";
          const friend: TeacherGender = teacher === "female" ? "male" : "female";
          const bubbleChar = msg.isBranch ? friend : teacher;
          return (
            <div key={i}>
              {msg.isBranch ? (
                <div className="flex items-end gap-2">
                  <div className="flex-shrink-0">
                    <CharacterAvatar character={friend} size={52} />
                  </div>
                  <div className="bg-gradient-to-r from-green-50 to-yellow-50 border-2 border-green-300 rounded-2xl rounded-bl-sm px-4 py-3 max-w-[72%] sm:max-w-sm shadow-sm">
                    <div className="flex items-center gap-1 mb-1">
                      <span className="text-xs">🌿</span>
                      <span className="text-xs font-bold text-green-700">{msg.branchLabel}</span>
                    </div>
                    <p className="text-sm text-green-900">{msg.text}</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-end gap-2">
                  <div className="flex-shrink-0">
                    <CharacterAvatar character={teacher} size={52} />
                  </div>
                  <div className="bg-white text-gray-800 px-4 py-3 rounded-2xl rounded-bl-sm max-w-[72%] sm:max-w-sm text-sm shadow">
                    {msg.text}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {loadingPhase === "thinking" && (
          <div className="flex items-end gap-2">
            <CharacterAvatar character={teacherGender ?? "female"} size={52} />
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

      {/* 入力エリア（LINE風） */}
      <div className="bg-white border-t border-gray-200 px-3 py-2 pb-3">
        <div className="flex items-center gap-2 max-w-2xl mx-auto">
          <button
            onClick={speaking ? stopSpeaking : recording ? stopRecording : startRecording}
            disabled={!speaking && micDisabled}
            className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-xl transition-all ${
              speaking
                ? "bg-orange-400 text-white hover:bg-orange-500 active:scale-95 shadow-md"
                : loadingPhase !== "idle"
                ? "bg-gray-100 text-gray-300 cursor-not-allowed"
                : recording
                ? "bg-red-500 text-white animate-pulse shadow-lg shadow-red-200"
                : "bg-green-100 text-green-600 hover:bg-green-200 active:scale-95"
            }`}
          >
            {speaking ? "⏹" : recording ? "⏹" : "🎤"}
          </button>

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={recording ? "話し中..." : micDisabled ? "少し待ってね..." : "メッセージを入力..."}
            disabled={micDisabled}
            className="flex-1 bg-gray-100 rounded-full px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-green-300 focus:bg-white transition-colors disabled:opacity-50 text-gray-800 placeholder-gray-400 text-sm"
          />

          <button
            onClick={() => { unlockSpeech(); send(); }}
            disabled={micDisabled || !input.trim()}
            className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-lg transition-all ${
              input.trim() && !micDisabled
                ? "bg-green-500 text-white hover:bg-green-600 active:scale-95 shadow-md"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
            }`}
          >
            ↑
          </button>
        </div>

        {(speaking || recording) && (
          <p className="text-xs text-center text-gray-400 mt-1.5">
            {speaking ? "⏹ タップで読み上げ停止" : "⏹ タップして停止"}
          </p>
        )}
      </div>
    </div>
  );
}
