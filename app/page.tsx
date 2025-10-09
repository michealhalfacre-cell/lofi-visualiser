"use client";
import React, { useRef, useEffect, useState } from "react";

type Theme = "neon" | "sunset" | "midnight";

const THEME_CONFIG: Record<
  Theme,
  { hueStart: number; hueRange: number; bgA: string; bgB: string; vignette: string }
> = {
  neon: { hueStart: 200, hueRange: 120, bgA: "hsl(220,80%,15%)", bgB: "hsl(280,70%,12%)", vignette: "rgba(0,0,0,0.45)" },
  sunset: { hueStart: 12, hueRange: 80, bgA: "hsl(12,70%,18%)", bgB: "hsl(42,70%,12%)", vignette: "rgba(0,0,0,0.4)" },
  midnight: { hueStart: 190, hueRange: 60, bgA: "hsl(200,55%,10%)", bgB: "hsl(240,55%,8%)", vignette: "rgba(0,0,0,0.55)" },
};

export default function Home() {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const [theme, setTheme] = useState<Theme>("neon");
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(60); // seconds

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);

  // VIS + audio graph (no MediaStreamDestination — avoids the crash)
  useEffect(() => {
    if (!audio) return;

    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioCtxRef.current = ctx;

    const src = ctx.createMediaElementSource(audio);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyserRef.current = analyser;

    // Playback + analysis only
    src.connect(analyser);
    analyser.connect(ctx.destination);

    // ----- Canvas / draw loop -----
    const canvas = canvasRef.current!;
    const c = canvas.getContext("2d")!;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    // Particles
    const particles: { x: number; y: number; vx: number; vy: number; life: number }[] = [];
    for (let i = 0; i < 80; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.6,
        life: Math.random(),
      });
    }

    let t = 0;
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      t += 0.0035;

      analyser.getByteFrequencyData(dataArray);

      const cfg = THEME_CONFIG[theme];

      // Animated gradient background
      const g = c.createLinearGradient(
        0,
        0,
        canvas.width * (0.5 + 0.5 * Math.cos(t)),
        canvas.height * (0.5 + 0.5 * Math.sin(t * 1.2))
      );
      g.addColorStop(0, cfg.bgA);
      g.addColorStop(1, cfg.bgB);
      c.fillStyle = g;
      c.fillRect(0, 0, canvas.width, canvas.height);

      // Motion trail
      c.fillStyle = "rgba(0,0,0,0.22)";
      c.fillRect(0, 0, canvas.width, canvas.height);

      // Bass energy for pulse
      const lowBins = Math.max(4, Math.floor(bufferLength * 0.08));
      let bass = 0;
      for (let i = 0; i < lowBins; i++) bass += dataArray[i];
      bass /= lowBins;

      // Bass pulse glow
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const pulse = 60 + bass * 1.6;
      const glow = c.createRadialGradient(cx, cy, 0, cx, cy, pulse * 3);
      const cfgHue = THEME_CONFIG[theme];
      glow.addColorStop(0, `hsla(${cfgHue.hueStart + (t * 360) % cfgHue.hueRange},90%,60%,0.45)`);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      c.globalCompositeOperation = "lighter";
      c.fillStyle = glow;
      c.beginPath();
      c.arc(cx, cy, pulse * 3, 0, Math.PI * 2);
      c.fill();
      c.globalCompositeOperation = "source-over";

      // Bars (mirrored)
      const bars = bufferLength;
      const gap = 1;
      const barW = (canvas.width / bars) * 2.25 - gap;
      let x = 0;
      for (let i = 0; i < bars; i++) {
        const mag = dataArray[i];
        const h = mag * 1.1;
        const hue = cfgHue.hueStart + ((i / bars) * cfgHue.hueRange + (t * 80)) % cfgHue.hueRange;

        c.fillStyle = `hsl(${hue},85%,${45 + (mag / 255) * 25}%)`;
        c.fillRect(x, canvas.height - h, barW, h);

        c.fillStyle = `hsla(${hue},85%,60%,0.6)`;
        c.fillRect(x, 0, barW, h * 0.9);

        x += barW + gap;
      }

      // Particles
      c.globalAlpha = 0.75;
      for (const p of particles) {
        p.x += p.vx + 0.15 * Math.sin((p.y + t * 400) / 300);
        p.y += p.vy + 0.15 * Math.cos((p.x + t * 400) / 300);
        p.life += 0.006;

        if (p.x < -5) p.x = canvas.width + 5;
        if (p.x > canvas.width + 5) p.x = -5;
        if (p.y < -5) p.y = canvas.height + 5;
        if (p.y > canvas.height + 5) p.y = -5;

        const hue = cfgHue.hueStart + ((p.x / canvas.width) * cfgHue.hueRange + t * 120) % cfgHue.hueRange;
        c.fillStyle = `hsla(${hue},90%,70%,${0.35 + 0.25 * Math.sin(p.life * 3)})`;
        c.beginPath();
        c.arc(p.x, p.y, 1.8 + 1.2 * Math.sin(p.life * 2 + bass / 60), 0, Math.PI * 2);
        c.fill();
      }
      c.globalAlpha = 1;

      // Vignette
      const vg = c.createRadialGradient(cx, cy, Math.min(cx, cy) * 0.6, cx, cy, Math.max(cx, cy));
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, THEME_CONFIG[theme].vignette);
      c.fillStyle = vg;
      c.fillRect(0, 0, canvas.width, canvas.height);

      // Title
      if (audioFile?.name) {
        c.font = "500 14px ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto";
        c.fillStyle = "rgba(255,255,255,0.7)";
        c.textAlign = "center";
        c.fillText(audioFile.name.replace(/\.[^/.]+$/, ""), cx, canvas.height - 24);
      }
    };

    draw();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(raf);
      try { ctx.close(); } catch {}
    };
  }, [audio, theme, audioFile]);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setAudioFile(f);
    const url = URL.createObjectURL(f);
    const el = new Audio(url);
    el.crossOrigin = "anonymous";
    setAudio(el);
    el.play().catch(() => {});
  };

  const startRecording = async () => {
    if (!canvasRef.current || !audio) return;

    // Ensure audio is playing so captureStream has tracks
    try { if (audio.paused) await audio.play(); } catch {}
    if (audioCtxRef.current?.state === "suspended") {
      try { await audioCtxRef.current.resume(); } catch {}
    }

    const canvasStream = (canvasRef.current as HTMLCanvasElement).captureStream(30);

    // SAFER audio capture: from the <audio> element itself
    const mediaEl: any = audio as any;
    let audioStream: MediaStream | null =
      typeof mediaEl.captureStream === "function" ? mediaEl.captureStream() :
      typeof mediaEl.mozCaptureStream === "function" ? mediaEl.mozCaptureStream() :
      null;

    // Sometimes the track appears a tick later; wait briefly if empty
    if (audioStream && audioStream.getAudioTracks().length === 0) {
      await new Promise((r) => setTimeout(r, 100));
    }

    const audioTracks = audioStream?.getAudioTracks() ?? [];
    if (audioTracks.length > 0) {
      audioTracks.forEach((t) => canvasStream.addTrack(t));
    } else {
      console.warn("No audio track available from captureStream; video-only recording.");
    }

    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
      ? "video/webm;codecs=vp9,opus"
      : MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
      ? "video/webm;codecs=vp8,opus"
      : "video/webm";

    recordedChunksRef.current = [];
    const mr = new MediaRecorder(canvasStream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
    mediaRecorderRef.current = mr;

    mr.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
    mr.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const base = (audioFile?.name ?? "visualizer").replace(/\.[^/.]+$/, "");
      a.href = url;
      a.download = `${base}-${Date.now()}.webm`;
      a.click();
      URL.revokeObjectURL(url);
      setIsRecording(false);
    };

    mr.start(100);
    setIsRecording(true);

    setTimeout(() => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
    }, duration * 1000);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  };

  return (
    <main className="flex flex-col items-center justify-center h-screen bg-[#0a0a19] text-white">
      {/* Optional logo overlay: place /public/logo.png */}
      <img
        src="/logo.png"
        alt="Logo"
        className="fixed bottom-4 right-4 w-24 opacity-80 pointer-events-none select-none drop-shadow-[0_0_12px_rgba(0,0,0,0.6)]"
      />

      <canvas ref={canvasRef} className="fixed top-0 left-0 w-screen h-screen" />

      <div className="z-10 text-center p-6 bg-black/40 rounded-xl backdrop-blur-md space-y-4 border border-white/10">
        <h1 className="text-3xl font-bold">Lo-Fi Beat Visualizer</h1>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <input type="file" accept="audio/*" onChange={handleUpload} />

          <label className="text-sm text-gray-300">Theme:</label>
          <select
            className="bg-black/60 px-2 py-1 rounded-lg"
            value={theme}
            onChange={(e) => setTheme(e.target.value as Theme)}
          >
            <option value="neon">Neon</option>
            <option value="sunset">Sunset</option>
            <option value="midnight">Midnight</option>
          </select>

          <label className="text-sm text-gray-300">Duration:</label>
          <select
            className="bg-black/60 px-2 py-1 rounded-lg"
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
          >
            <option value={15}>15s</option>
            <option value={30}>30s</option>
            <option value={60}>60s</option>
            <option value={90}>90s</option>
          </select>
        </div>

        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => audio?.play()}
            className="px-3 py-1 rounded bg-white/10 hover:bg-white/20"
            disabled={!audio}
          >
            ▶ Play
          </button>
          <button
            onClick={() => audio?.pause()}
            className="px-3 py-1 rounded bg-white/10 hover:bg-white/20"
            disabled={!audio}
          >
            ⏸ Pause
          </button>

          <label className="text-sm text-gray-300 ml-3">Vol</label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            defaultValue={1}
            onChange={(e) => { if (audio) audio.volume = Number(e.target.value); }}
            className="w-32 accent-emerald-500"
          />
        </div>

        {!isRecording ? (
          <button
            onClick={startRecording}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 transition"
            disabled={!audio}
            title={!audio ? "Upload audio first" : "Start recording"}
          >
            ● Record
          </button>
        ) : (
          <button
            onClick={stopRecording}
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 transition"
          >
            ■ Stop & Download
          </button>
        )}

        <p className="text-xs text-gray-400">WebM uploads to YouTube fine. Convert to MP4 later if needed.</p>
      </div>
    </main>
  );
}
