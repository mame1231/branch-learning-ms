"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CharacterAvatar, CharacterKey } from "@/components/CharacterAvatar";
import { GRADE_LABELS, SUBJECTS, toGradeDisplay } from "@/lib/config/grades";
import { createClient } from "@/lib/supabase";

type Profile = { nickname: string | null; avatar_url: string | null };

type Phase = "welcome" | "subject" | "resume" | "chat";
type SettingSection = "grade" | "teacher" | "friend" | null;
type TeacherGender = "female" | "male";
type FriendType = "friend_1" | "friend_2";

const FRIEND_OPTIONS: { type: FriendType; label: string }[] = [
  { type: "friend_1", label: "のぞみ" },
  { type: "friend_2", label: "けんた" },
];

const BRANCH_CHARACTER = "friend_3" as const; // エイリアンは常に横道担当

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
  character?: CharacterKey;
  isBranch?: boolean;
  branchLabel?: string;
  imageUrl?: string;
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

// 解除用（サイレント再生）と再生用を分ける → unlockAudio が TTS を再再生しないように
let unlockEl: HTMLAudioElement | null = null;
let playEl: HTMLAudioElement | null = null;
let currentBlobUrl: string | null = null;
const SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";

function getUnlockEl(): HTMLAudioElement {
  if (!unlockEl) {
    unlockEl = document.createElement("audio");
    unlockEl.style.display = "none";
    document.body?.appendChild(unlockEl);
  }
  return unlockEl;
}

function getPlayEl(): HTMLAudioElement {
  if (!playEl) {
    playEl = document.createElement("audio");
    playEl.style.display = "none";
    document.body?.appendChild(playEl);
  }
  return playEl;
}

function unlockAudio() {
  // 解除専用要素で無音を再生 → TTS再生用要素には触らない
  const el = getUnlockEl();
  el.src = SILENT_WAV;
  el.play().catch(() => {});
  // 再生用要素も同時にiOS向け初期化（srcなしでplay→失敗するが解除される）
  const pel = getPlayEl();
  if (!pel.src || pel.src === window.location.href) {
    pel.src = SILENT_WAV;
    pel.play().catch(() => {});
  }
}

function stopAudio() {
  const el = getPlayEl();
  el.pause();
  el.onended = null;
  el.onerror = null;
  if (currentBlobUrl) { URL.revokeObjectURL(currentBlobUrl); currentBlobUrl = null; }
}

function speakText(text: string, character: string, onError?: (msg: string) => void): Promise<void> {
  return new Promise(async (resolve) => {
    if (!text?.trim() || !character) { resolve(); return; } // 空テキストはスキップ
    stopAudio();
    const audio = getPlayEl();

    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, character }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        onError?.(`TTS ${res.status}: ${errBody.error ?? ""} text="${errBody.receivedText ?? ""}" char="${errBody.receivedChar ?? ""}" azure=${errBody.azureStatus ?? ""} region=${errBody.region ?? ""} voice=${errBody.voice ?? ""}`);
        resolve(); return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      currentBlobUrl = url;
      audio.onended = () => { URL.revokeObjectURL(url); currentBlobUrl = null; resolve(); };
      audio.onerror = () => { URL.revokeObjectURL(url); currentBlobUrl = null; resolve(); };
      audio.src = url;
      audio.load();
      await audio.play().catch((e) => { onError?.(`play() rejected: ${e}`); resolve(); });
    } catch (e) {
      onError?.(`catch: ${e}`);
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
  const [friendType, setFriendType] = useState<FriendType | null>(null);
  const [grade, setGrade] = useState<number | null>(null);
  const [subject, setSubject] = useState<string | null>(null);
  const [settingSection, setSettingSection] = useState<SettingSection>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const [theme, setTheme] = useState<string | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  // "idle" | "thinking"（即時応答待ち） | "checking"（Judge待ち）
  const [loadingPhase, setLoadingPhase] = useState<"idle" | "thinking" | "checking">("idle");
  const [recording, setRecording] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [talkingChar, setTalkingChar] = useState<CharacterKey | null>(null);
  const [interimText, setInterimText] = useState("");
  const [micPermission, setMicPermission] = useState<"unknown" | "granted" | "denied">("unknown");
  const [ttsDebug, setTtsDebug] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const speechUnlockedRef = useRef(false);
  const interimTextRef = useRef("");
  const photoInputRef = useRef<HTMLInputElement>(null);

  // セッション確認・プロフィール・前回会話取得
  useEffect(() => {
    const id = localStorage.getItem("student_id");
    if (!id) { router.push("/login"); return; }
    setStudentId(id);
    const savedTeacher = localStorage.getItem("teacher_gender") as TeacherGender | null;
    if (savedTeacher) setTeacherGender(savedTeacher);
    const savedFriend = localStorage.getItem("friend_type") as FriendType | null;
    if (savedFriend) setFriendType(savedFriend);
    const savedGrade = localStorage.getItem("grade");
    if (savedGrade) setGrade(Number(savedGrade));
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
        setPhase("welcome");
      });
  }, [router]);

  function unlockSpeech() { unlockAudio(); }

  useEffect(() => {
    if (phase !== "chat") return;
    if (!navigator.permissions) return;
    navigator.permissions.query({ name: "microphone" as PermissionName }).then((result) => {
      if (result.state === "granted") setMicPermission("granted");
      else if (result.state === "denied") setMicPermission("denied");
      // "prompt" → "unknown" のまま（バナーを表示）
    }).catch(() => {/* 非対応ブラウザは無視 */});
  }, [phase]);

  async function requestMicPermission() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMicPermission("granted");
    } catch {
      setMicPermission("denied");
    }
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
    localStorage.setItem("grade", String(g));
    setGrade(g);
  }

  function selectTeacher(gender: TeacherGender) {
    localStorage.setItem("teacher_gender", gender);
    setTeacherGender(gender);
  }

  function selectFriend(type: FriendType) {
    localStorage.setItem("friend_type", type);
    setFriendType(type);
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
    const friend: CharacterKey = friendType ?? "friend_1";
    setPhase("chat");
    setLoadingPhase("thinking");

    let introMessages: Message[] = [];
    let introTheme = selectedSubject;

    try {
      const res = await fetch("/api/intro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grade, subject: selectedSubject, characterMode: "both", teacherGender: teacher }),
      });
      const data = await res.json();
      introTheme = data.theme ?? selectedSubject;
      introMessages = [
        { role: "agent", text: data.senseiLine, character: teacher },
        { role: "agent", text: data.tomoLine, character: friend },
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
      await speakText(introMessages[0].text, teacher, setTtsDebug);
      setTalkingChar(null);
      if (introMessages[1]) {
        setTalkingChar(friend);
        await speakText(introMessages[1].text, friend, setTtsDebug);
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
    const friend: CharacterKey = friendType ?? "friend_1";
    let errorHandled = false;

    // リアルタイム音声キュー
    type SpeechItem = { text: string; char: CharacterKey };
    const queue: SpeechItem[] = [];
    let streamingDone = false;
    const signal = { wake: null as (() => void) | null };

    function enqueue(item: SpeechItem) {
      queue.push(item);
      signal.wake?.();
      signal.wake = null;
    }

    async function drainSpeech() {
      let started = false;
      while (!streamingDone || queue.length > 0) {
        if (queue.length > 0) {
          if (!started) { setSpeaking(true); started = true; }
          const item = queue.shift()!;
          setTalkingChar(item.char);
          await speakText(item.text, item.char, setTtsDebug);
          setTalkingChar(null);
        } else {
          await new Promise<void>((r) => { signal.wake = r; });
        }
      }
      if (started) { setSpeaking(false); setTalkingChar(null); }
    }

    const drainPromise = drainSpeech();

    try {
      const res = await fetch("/api/branch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, grade, subject, characterMode: "both", teacherGender: teacher, studentId, conversationId }),
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
            setMessages((prev) => [...prev, { role: "agent", text: chunk.text, character: teacher }]);
            setLoadingPhase("idle");
            enqueue({ text: chunk.text, char: teacher });

          } else if (chunk.type === "immediate") {
            setMessages((prev) => [...prev, { role: "agent", text: chunk.text, character: teacher }]);
            setLoadingPhase("checking");
            enqueue({ text: chunk.text, char: teacher });

          } else if (chunk.type === "tomo_immediate") {
            setMessages((prev) => [...prev, { role: "agent", text: chunk.text, character: friend }]);
            enqueue({ text: chunk.text, char: friend });

          } else if (chunk.type === "branch") {
            setLoadingPhase("idle");
            if (chunk.judgeStatus === "judge_checked" && chunk.childFacingSummary) {
              setMessages((prev) => [
                ...prev,
                {
                  role: "agent",
                  text: chunk.childFacingSummary,
                  character: BRANCH_CHARACTER,
                  isBranch: true,
                  branchLabel: randomBranchLabel(),
                },
              ]);
              enqueue({ text: chunk.childFacingSummary, char: BRANCH_CHARACTER });
            }
            // judge_rejected: エイリアンは黙っておく（横道があるときだけ出現）

          } else if (chunk.type === "error") {
            errorHandled = true;
            setMessages((prev) => [
              ...prev,
              { role: "agent", text: "ごめん、うまく答えられなかった。もう一度聞いてみて。" },
            ]);
            setLoadingPhase("idle");
          }
        }
      }
    } catch {
      if (!errorHandled) {
        setMessages((prev) => [
          ...prev,
          { role: "agent", text: "ごめん、うまく答えられなかった。もう一度聞いてみて。" },
        ]);
        setLoadingPhase("idle");
      }
    }

    // 会話ログ保存
    setMessages((prev) => { saveMessages(prev); return prev; });

    // ストリーミング完了を通知してドレイン待機
    streamingDone = true;
    signal.wake?.();
    await drainPromise;
  }

  async function sendPhoto(file: File) {
    if (loadingPhase !== "idle" || speaking || grade === null || subject === null) return;

    const dataUrl = URL.createObjectURL(file);
    const base64 = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve((e.target?.result as string).split(",")[1]);
      reader.readAsDataURL(file);
    });

    setMessages((prev) => [...prev, { role: "child", text: "📷 写真を送ったよ", imageUrl: dataUrl }]);
    setLoadingPhase("thinking");

    const teacher = teacherGender ?? "female";

    try {
      const res = await fetch("/api/vision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mimeType: file.type, grade, subject }),
      });
      const data = await res.json();
      const hint: string = data.hint ?? "ごめん、うまく読み取れなかった。もう一度撮ってみて！";

      setMessages((prev) => [...prev, { role: "agent", text: hint, character: teacher }]);
      setLoadingPhase("idle");

      setSpeaking(true);
      setTalkingChar(teacher);
      await speakText(hint, teacher, setTtsDebug);
      setTalkingChar(null);
      setSpeaking(false);
    } catch {
      setMessages((prev) => [...prev, { role: "agent", text: "ごめん、うまく読み取れなかった。もう一度試してね。" }]);
      setLoadingPhase("idle");
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
      stopAudio();   // 再生中のTTSを停止
      unlockAudio(); // マイクタップ時にオーディオ要素を有効化
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
    stopAudio();
    setSpeaking(false);
    setTalkingChar(null);
  }

  const micDisabled = loadingPhase !== "idle" || speaking;

  // ── ウェルカム（設定画面）─────────────────────────────────
  if (phase === "welcome") {
    const canStart = grade !== null && teacherGender !== null && friendType !== null;
    const resumeSubjects = Object.keys(savedConversations);
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-amber-50 flex flex-col">
        {/* 緑ヘッダー */}
        <header className="bg-green-600 text-white px-4 py-3 flex items-center justify-between shadow relative">
          <button onClick={() => router.push("/profile")} className="flex-shrink-0">
            <div className="w-9 h-9 rounded-full overflow-hidden bg-green-400 flex items-center justify-center border-2 border-white">
              {profile.avatar_url
                ? <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                : <span className="text-base">👤</span>}
            </div>
          </button>
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="w-10 h-10 flex flex-col items-center justify-center gap-1.5 rounded-full hover:bg-green-500 transition-colors"
            >
              <span className="w-5 h-0.5 bg-white rounded-full block" />
              <span className="w-5 h-0.5 bg-white rounded-full block" />
              <span className="w-5 h-0.5 bg-white rounded-full block" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-12 z-20 bg-white rounded-2xl shadow-lg border border-green-100 overflow-hidden min-w-[160px]">
                  <a
                    href="/knowledge"
                    onClick={() => setMenuOpen(false)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-green-50 transition-colors"
                  >
                    <span className="text-lg">🌿</span>
                    <span className="text-sm font-bold text-green-700">発見マップ</span>
                  </a>
                  <a
                    href="/admin"
                    onClick={() => setMenuOpen(false)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-green-50 transition-colors"
                  >
                    <span className="text-lg">⚙️</span>
                    <span className="text-sm font-bold text-gray-600">管理者</span>
                  </a>
                  <div className="border-t border-gray-100" />
                  <button
                    onClick={() => { setMenuOpen(false); localStorage.removeItem("student_id"); router.push("/login"); }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-50 transition-colors"
                  >
                    <span className="text-lg">🚪</span>
                    <span className="text-sm font-bold text-red-400">ログアウト</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </header>

        {/* コンテンツ */}
        <div className="flex flex-col items-center p-4 pt-6">
        {/* タイトル */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-3xl">🌿</span>
          <h1 className="text-2xl font-bold text-green-800">ブランチラーニング</h1>
          <span className="text-3xl">🌿</span>
        </div>
        <p className="text-green-600 mb-6 text-base font-medium">おかえり、{profile.nickname ?? ""}！</p>

        <div className="w-full max-w-sm space-y-3 mb-6">
          {/* 学年 */}
          <div className="bg-white rounded-2xl shadow-sm border border-green-100 overflow-hidden">
            <button
              onClick={() => setSettingSection(settingSection === "grade" ? null : "grade")}
              className="w-full flex items-center justify-between px-4 py-4"
            >
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-gray-600">学年をかえる</span>
              </div>
              <div className="flex items-center gap-2">
                {grade ? (
                  <span className="text-base font-bold text-green-700">{GRADE_LABELS[grade - 1]}</span>
                ) : (
                  <span className="text-base text-red-400 font-medium">えらんでね</span>
                )}
                <span className="text-gray-400 text-sm">{settingSection === "grade" ? "▲" : "▼"}</span>
              </div>
            </button>
            {settingSection === "grade" && (
              <div className="border-t border-green-50 p-3">
                <div className="grid grid-cols-3 gap-2">
                  {GRADE_LABELS.map((label, i) => (
                    <button
                      key={i}
                      onClick={() => { handleGradeSelect(i + 1); setSettingSection(null); }}
                      className={`py-2 rounded-xl text-sm font-bold border-2 transition-all active:scale-95 ${
                        grade === i + 1
                          ? "bg-green-500 text-white border-green-500"
                          : "bg-white text-green-800 border-green-200 hover:border-green-400"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 先生 */}
          <div className="bg-white rounded-2xl shadow-sm border border-green-100 overflow-hidden">
            <button
              onClick={() => setSettingSection(settingSection === "teacher" ? null : "teacher")}
              className="w-full flex items-center justify-between px-4 py-4"
            >
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-gray-600">先生をかえる</span>
              </div>
              <div className="flex items-center gap-2">
                {teacherGender ? (
                  <>
                    <CharacterAvatar character={teacherGender} size={32} />
                    <span className="text-base font-bold text-green-700">
                      {teacherGender === "female" ? "あゆみ先生" : "ゆうすけ先生"}
                    </span>
                  </>
                ) : (
                  <span className="text-base text-red-400 font-medium">えらんでね</span>
                )}
                <span className="text-gray-400 text-sm">{settingSection === "teacher" ? "▲" : "▼"}</span>
              </div>
            </button>
            {settingSection === "teacher" && (
              <div className="border-t border-green-50 p-3">
                <div className="flex gap-3 justify-center">
                  {(["female", "male"] as TeacherGender[]).map((g) => (
                    <button
                      key={g}
                      onClick={() => { selectTeacher(g); setSettingSection(null); }}
                      className={`flex flex-col items-center gap-1 px-6 py-3 rounded-2xl border-2 transition-all active:scale-95 ${
                        teacherGender === g ? "border-green-500 bg-green-50" : "border-green-100 bg-white hover:border-green-300"
                      }`}
                    >
                      <CharacterAvatar character={g} size={64} />
                      <span className={`text-xs font-bold ${g === "female" ? "text-pink-600" : "text-blue-600"}`}>
                        {g === "female" ? "あゆみ先生" : "ゆうすけ先生"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 友達 */}
          <div className="bg-white rounded-2xl shadow-sm border border-green-100 overflow-hidden">
            <button
              onClick={() => setSettingSection(settingSection === "friend" ? null : "friend")}
              className="w-full flex items-center justify-between px-4 py-4"
            >
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-gray-600">友達をえらぶ</span>
              </div>
              <div className="flex items-center gap-2">
                {friendType ? (
                  <>
                    <CharacterAvatar character={friendType} size={32} />
                    <span className="text-base font-bold text-green-700">
                      {FRIEND_OPTIONS.find((f) => f.type === friendType)?.label}
                    </span>
                  </>
                ) : (
                  <span className="text-base text-red-400 font-medium">えらんでね</span>
                )}
                <span className="text-gray-400 text-sm">{settingSection === "friend" ? "▲" : "▼"}</span>
              </div>
            </button>
            {settingSection === "friend" && (
              <div className="border-t border-green-50 p-3">
                <div className="flex gap-3 justify-center mb-3">
                  {FRIEND_OPTIONS.map(({ type, label }) => (
                    <button
                      key={type}
                      onClick={() => { selectFriend(type); setSettingSection(null); }}
                      className={`flex flex-col items-center gap-1 px-5 py-3 rounded-2xl border-2 transition-all active:scale-95 ${
                        friendType === type ? "border-green-500 bg-green-50" : "border-green-100 bg-white hover:border-green-300"
                      }`}
                    >
                      <CharacterAvatar character={type} size={56} />
                      <span className="text-xs font-bold text-green-700">{label}</span>
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 bg-purple-50 border border-purple-200 rounded-xl px-3 py-2">
                  <CharacterAvatar character="friend_3" size={36} />
                  <div>
                    <p className="text-xs font-bold text-purple-700">エイリアン</p>
                    <p className="text-[10px] text-purple-500">横道発見の説明担当（固定）</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {resumeSubjects.length > 0 && (
          <div className="w-full max-w-sm mb-4">
            <p className="text-xs text-gray-400 mb-2 text-center">続きがある教科</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {resumeSubjects.map((s) => {
                const info = SUBJECTS.find((sub) => sub.id === s);
                const saved = savedConversations[s];
                return (
                  <button
                    key={s}
                    onClick={() => {
                      if (!canStart || !saved) return;
                      unlockSpeech();
                      setSubject(s);
                      setMessages(saved.messages);
                      setConversationId(saved.id);
                      setTheme(null);
                      setPhase("chat");
                    }}
                    disabled={!canStart}
                    className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-all active:scale-95 ${
                      canStart
                        ? "bg-green-100 text-green-700 border-green-300 hover:bg-green-200"
                        : "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                    }`}
                  >
                    {info?.emoji} {s} →
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <button
          onClick={() => canStart && setPhase("subject")}
          disabled={!canStart}
          className={`w-full max-w-sm font-bold py-4 rounded-2xl transition-all shadow-md text-lg active:scale-95 ${
            canStart
              ? "bg-green-500 text-white hover:bg-green-600"
              : "bg-gray-200 text-gray-400 cursor-not-allowed"
          }`}
        >
          {canStart ? "はじめる →" : "学年・先生・友達をえらんでね"}
        </button>

        </div>{/* /コンテンツ */}
      </div>
    );
  }

  // ── 教科選択 ────────────────────────────────────────────
  if (phase === "subject") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-amber-50 flex flex-col">
        {/* 緑ヘッダー */}
        <header className="bg-green-600 text-white px-4 py-3 flex items-center justify-between shadow">
          <button
            onClick={() => setPhase("welcome")}
            className="text-white hover:text-green-100 flex items-center gap-1 text-sm font-medium"
          >
            ← もどる
          </button>
          <button onClick={() => router.push("/profile")}>
            <div className="w-9 h-9 rounded-full overflow-hidden bg-green-400 flex items-center justify-center border-2 border-white">
              {profile.avatar_url
                ? <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                : <span className="text-base">👤</span>}
            </div>
          </button>
        </header>

        <div className="flex flex-col items-center justify-center flex-1 p-4 sm:p-8">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-3xl">🌿</span>
          <h1 className="text-2xl sm:text-3xl font-bold text-green-800">ブランチラーニング</h1>
          <span className="text-3xl">🌿</span>
        </div>
        <p className="text-green-600 mb-6 sm:mb-8 text-sm sm:text-base">
          {grade ? `${GRADE_LABELS[grade - 1]}・今日は何を学ぶ？` : "今日は何を学ぶ？"}
        </p>

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
        </div>{/* /flex-1 */}
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
        {micPermission === "unknown" && (
          <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-2xl px-4 py-3 gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">🎤</span>
              <p className="text-xs text-green-800 font-medium">声で話しかけてみよう！<br/><span className="font-normal text-green-600">マイクの許可が必要だよ</span></p>
            </div>
            <button
              onClick={requestMicPermission}
              className="flex-shrink-0 bg-green-500 text-white text-xs font-bold px-4 py-2 rounded-full hover:bg-green-600 active:scale-95 transition-all"
            >
              許可する
            </button>
          </div>
        )}
        {micPermission === "denied" && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
            <span className="text-xl">🔇</span>
            <p className="text-xs text-red-600">マイクが使えません。設定 → Safari → マイク → 許可 をオンにしてね</p>
          </div>
        )}
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
                  {msg.imageUrl && (
                    <img src={msg.imageUrl} alt="宿題の写真" className="rounded-xl mb-2 max-w-full" />
                  )}
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

          const avatarChar: CharacterKey = msg.character ?? (teacherGender ?? "female");
          return (
            <div key={i}>
              {msg.isBranch ? (
                <div className="flex items-end gap-2">
                  <div className="flex-shrink-0">
                    <CharacterAvatar character={avatarChar} size={52} />
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
                    <CharacterAvatar character={avatarChar} size={52} />
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
        {ttsDebug && (
          <div className="text-[10px] text-red-400 px-2 py-1 bg-red-50 rounded break-all">
            🔇 {ttsDebug}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 入力エリア（LINE風） */}
      <div className="bg-white border-t border-gray-200 px-3 py-2 pb-3">
        <div className="flex items-center gap-2 max-w-2xl mx-auto">
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) { unlockSpeech(); sendPhoto(file); }
              e.target.value = "";
            }}
          />
          <button
            onClick={() => photoInputRef.current?.click()}
            disabled={loadingPhase !== "idle" || speaking}
            className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-xl transition-all ${
              loadingPhase !== "idle" || speaking
                ? "bg-gray-100 text-gray-300 cursor-not-allowed"
                : "bg-amber-100 text-amber-600 hover:bg-amber-200 active:scale-95"
            }`}
          >
            📷
          </button>
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
