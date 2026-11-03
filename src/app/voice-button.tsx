"use client";

// "Talk to us": a voice call with the bar's assistant, right in the browser.

import { useEffect, useRef, useState } from "react";

type Status = "idle" | "connecting" | "live" | "error";
// The Vapi client, loaded only when someone taps the button.
type VapiClient = {
  start: (assistant: unknown) => Promise<unknown>;
  stop: () => void;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
};

export function VoiceButton({
  publicKey,
  assistant,
  variant = "card",
}: {
  publicKey: string;
  assistant: unknown;
  variant?: "card" | "button";
}) {
  const vapi = useRef<VapiClient | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => () => vapi.current?.stop(), []);

  async function start() {
    setStatus("connecting");
    try {
      if (!vapi.current) {
        const { default: Vapi } = await import("@vapi-ai/web");
        const client = new Vapi(publicKey) as unknown as VapiClient;
        client.on("call-start", () => setStatus("live"));
        client.on("call-end", () => {
          setStatus("idle");
          setSpeaking(false);
        });
        client.on("speech-start", () => setSpeaking(true));
        client.on("speech-end", () => setSpeaking(false));
        client.on("error", (e) => {
          console.error("Voice call error", e);
          setStatus("error");
        });
        vapi.current = client;
      }
      await vapi.current.start(assistant);
    } catch (error) {
      console.error("Couldn't start the voice call", error);
      setStatus("error");
    }
  }

  function stop() {
    vapi.current?.stop();
    setStatus("idle");
  }

  const active = status === "connecting" || status === "live";
  const label =
    status === "connecting" ? "Connecting…" : status === "live" ? "End call" : "Talk to us";

  const button = (
    <button
      type="button"
      className={`button ${active ? "voice-live" : "primary"} voice-button`}
      onClick={active ? stop : start}
      aria-live="polite"
    >
      <span className={`voice-dot ${speaking ? "is-speaking" : ""}`} aria-hidden="true" />
      {label}
    </button>
  );

  if (variant === "button") return button;

  return (
    <div className="voice-card">
      <div>
        <p className="voice-title">Questions, or ordering ahead?</p>
        <p className="muted">
          {status === "live"
            ? speaking ? "Our assistant is talking…" : "Listening. Go ahead and ask."
            : status === "error"
              ? "That didn't connect. Allow microphone access and try again."
              : "Talk with our voice assistant about hours, the menu, live music, or a pickup order."}
        </p>
      </div>
      {button}
    </div>
  );
}
