"use client";

import { useRef, useEffect, useCallback } from "react";

export type FaceExpression = "happy" | "sad" | "angry" | "surprised" | "disgusted" | "fearful" | "neutral";
export type FaceStatus = "loading" | "no_face" | "detected";

type Callback = (expression: FaceExpression, confidence: number) => void;
type StatusCallback = (status: FaceStatus) => void;

async function getFaceApi() {
  const mod = await import("@vladmandic/face-api");
  // ESM default or namespace どちらにも対応
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (mod.default ?? mod) as any;
}

export function useFaceExpression(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  enabled: boolean,
  onExpression: Callback,
  onStatus?: StatusCallback,
  intervalMs = 2000,
) {
  const rafRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedRef = useRef(false);

  const runDetection = useCallback(async () => {
    const faceapi = await getFaceApi();
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;

    const result = await faceapi
      .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224 }))
      .withFaceExpressions();

    if (!result) {
      onStatus?.("no_face");
      return;
    }

    const expMap = result.expressions as Record<string, number>;
    const top = Object.entries(expMap).sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] > 0.2) {
      onStatus?.("detected");
      onExpression(top[0] as FaceExpression, top[1]);
    } else {
      onStatus?.("no_face");
    }
  }, [videoRef, onExpression, onStatus]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    onStatus?.("loading");

    async function init() {
      const faceapi = await getFaceApi();
      if (loadedRef.current) return;
      await faceapi.nets.tinyFaceDetector.loadFromUri("/models");
      await faceapi.nets.faceExpressionNet.loadFromUri("/models");
      loadedRef.current = true;
    }

    async function loop() {
      if (cancelled) return;
      try { await runDetection(); } catch (e) { console.error("[face] detection error:", e); }
      if (!cancelled) {
        rafRef.current = setTimeout(loop, intervalMs);
      }
    }

    init()
      .then(loop)
      .catch((e) => { console.error("[face] init error:", e); onStatus?.("no_face"); });

    return () => {
      cancelled = true;
      if (rafRef.current) clearTimeout(rafRef.current);
    };
  }, [enabled, intervalMs, runDetection, onStatus]);
}
