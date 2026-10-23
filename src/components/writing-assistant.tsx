"use client";
import { useCallback, useState } from "react";
import { WorkspaceModal } from "./workspace-modal";
import { invokeMail } from "@/hooks/use-workspace";
import { sanitizeComposeHtml, htmlText } from "@/lib/rich-text";
import type { Compose } from "@/lib/types";
import type { Preferences } from "@/lib/workspace";
export function WritingAssistant({ composer, preferences, demo, onApply, onClose }: {
  composer: Compose; preferences: Preferences; demo: boolean; onApply: (text: string, html: string, subject: string) => void; onClose: () => void;
}) {
  const [action, setAction] = useState("improve"), [prompt, setPrompt] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [result, setResult] = useState<{ text: string; html: string; subject: string } | null>(null);
  const close = useCallback(() => { if (!busy) onClose(); }, [busy, onClose]);
  return <WorkspaceModal title="Writing assistant" onClose={close}><div className="tools-form"><p>Review a suggestion before inserting it into your message.</p><label>Action<select aria-label="Writing action" value={action} onChange={e => setAction(e.target.value)}>{["generate", "improve", "translate", "shorten", "expand", "professional", "friendly", "reply"].map(a => <option key={a}>{a}</option>)}</select></label><label>Your instructions<textarea aria-label="Writing instructions" maxLength={4000} value={prompt} placeholder="Describe what you would like to write or change…" onChange={e => setPrompt(e.target.value)} /></label><button className="primary-button" disabled={busy || demo || !preferences.ai_enabled || (!prompt.trim() && !composer.text.trim())} onClick={async () => {
    setBusy(true); setError("");
    try {
      const response = await invokeMail("mail-ai", { action, prompt, subject: composer.subject, text: composer.text, model: preferences.ai_model, tone: preferences.ai_tone, language: preferences.ai_language });
      if (typeof response?.html !== "string") throw new Error("The assistant returned no message suggestion.");
      const html = sanitizeComposeHtml(response.html); setResult({ html, text: htmlText(html), subject: String(response.subject || composer.subject) });
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }}>{busy ? "Writing…" : "Create suggestion"}</button>{demo && <p>Sign in to use the writing assistant with your mailbox.</p>}{!preferences.ai_enabled && <p>Enable the writing assistant in workspace preferences.</p>}{error && <p className="form-error" role="alert">{error}</p>}
  {result && <div className="assistant-result"><strong>{result.subject}</strong><div className="email-body">{result.text}</div><button className="primary-button" onClick={() => { onApply(result.text, result.html, result.subject); onClose(); }}>Insert suggestion</button></div>}</div></WorkspaceModal>;
}
