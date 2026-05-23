"use client";

import { useRef, useEffect, useCallback } from "react";

export type FaceExpression = "happy" | "sad" | "angry" | "surprised" | "disgusted" | "fearful" | "neutral";

type Callback = (expression: FaceExpression, confidence: number) => void;

export function useFaceExpression(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  enabled: boolean,
  onExpression: Callback,
  intervalMs = 2500,
) {
  const rafRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedRef = useRef(false);

  const runDetection = useCallback(async () => {
    const faceapi = (await import("@vladmandic/face-api")).default;
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;

    const result = await faceapi
      .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceExpressions();

    if (!result) return;

    const expMap = result.expressions as unknown as Record<string, number>;
    const top = Object.entries(expMap).sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] > 0.5) {
      onExpression(top[0] as FaceExpression, top[1]);
    }
  }, [videoRef, onExpression]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    async function init() {
      const faceapi = (await import("@vladmandic/face-api")).default;
      if (loadedRef.current) return;
      await faceapi.nets.tinyFaceDetector.loadFromUri("/models");
      await faceapi.nets.faceExpressionNet.loadFromUri("/models");
      loadedRef.current = true;
    }

    async function loop() {
      if (cancelled) return;
      try { await runDetection(); } catch { /* ignore */ }
      if (!cancelled) {
        rafRef.current = setTimeout(loop, intervalMs);
      }
    }

    init().then(loop).catch(() => {});

    return () => {
      cancelled = true;
      if (rafRef.current) clearTimeout(rafRef.current);
    };
  }, [enabled, intervalMs, runDetection]);
}
