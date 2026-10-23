"use client";
import { errorText } from "@/lib/mail-utils.mjs";
import { useEffect, useState } from "react";
import type { Account } from "@/lib/types";
import type { Preferences } from "@/lib/workspace";
import type { WorkspaceController } from "@/hooks/use-workspace";
import { invokeMail } from "@/hooks/use-workspace";
import type { usePush } from "@/hooks/use-push";
export function AdvancedSettings({ workspace, accounts, demo, push, onAccounts }: {
  workspace: WorkspaceController; accounts: Account[]; demo: boolean; push: ReturnType<typeof usePush>; onAccounts: (accounts: Account[]) => void;
}) {
  const [form, setForm] = useState<Preferences>(workspace.data.preferences), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  useEffect(() => setForm(previous => ({ ...previous, theme: workspace.data.preferences.theme, density: workspace.data.preferences.density })), [workspace.data.preferences.theme, workspace.data.preferences.density]);
  const [names, setNames] = useState(Object.fromEntries(accounts.map(a => [a.address, a.display_name])));
  useEffect(() => setNames(previous => Object.fromEntries(accounts.map(account => [account.address, previous[account.address] ?? account.display_name]))), [accounts]);
  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); setNotice(message); } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }
  const update = (key: keyof Preferences, value: any) => setForm(previous => ({ ...previous, [key]: value }));
  return <details className="advanced-settings"><summary>Reading, accounts & notifications</summary>
    <div className="tools-form"><fieldset disabled={busy || !workspace.ready}>
      <h3>Reading & composing</h3><div className="form-grid"><label>Appearance<select aria-label="Appearance preference" value={form.theme} onChange={e => update("theme", e.target.value)}><option value="system">Match device</option><option value="light">Light</option><option value="dark">Dark</option></select></label><label>Preview pane<select value={form.preview_pane} onChange={e => update("preview_pane", e.target.value)}><option value="right">Right side</option><option value="off">Message view</option></select></label><label>Default sender<select aria-label="Default sender" value={form.default_sender_address || accounts.find(a => a.is_primary)?.address || ""} onChange={e => update("default_sender_address", e.target.value)}>{accounts.map(a => <option key={a.id} value={a.address}>{a.address}</option>)}</select></label></div>
      {([["conversation_view", "Group conversations"], ["show_message_preview", "Show message previews"], ["mark_read_on_open", "Mark read on open"], ["keyboard_shortcuts", "Keyboard shortcuts"], ["signature_enabled", "Insert the default saved signature automatically"], ["confirm_permanent_delete", "Confirm permanent deletion"], ["notifications_enabled", "Notify about new mail"], ["notification_sound", "Play a new-mail sound"], ["ai_enabled", "Enable writing assistant"]] as const).map(([key, label]) => <label key={key} className="check-label"><input type="checkbox" checked={form[key]} onChange={e => update(key, e.target.checked)} />{label}</label>)}
      <h3>Writing assistant</h3><div className="form-grid"><label>Model<select aria-label="AI model" value={form.ai_model} onChange={e => update("ai_model", e.target.value)}>{["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3.8-flash"].map(m => <option key={m}>{m}</option>)}</select></label><label>Tone<select value={form.ai_tone} onChange={e => update("ai_tone", e.target.value)}>{["professional", "friendly", "concise", "formal"].map(m => <option key={m}>{m}</option>)}</select></label><label>Language<select value={form.ai_language} onChange={e => update("ai_language", e.target.value)}>{["auto", "German", "English"].map(m => <option key={m}>{m}</option>)}</select></label></div>
      <h3>Sender names</h3>{accounts.map(a => <label key={a.id}>{a.address}<input aria-label={`Display name for ${a.address}`} maxLength={80} value={names[a.address] || ""} onChange={e => setNames(previous => ({ ...previous, [a.address]: e.target.value }))} /></label>)}
      <button className="primary-button" onClick={() => void run(async () => {
        if (Object.values(names).some(name => !name.trim())) throw new Error("Every sender needs a display name.");
        if (demo) { localStorage.setItem("frankiflow-demo-account-names-v2", JSON.stringify(names)); onAccounts(accounts.map(a => ({ ...a, display_name: names[a.address] }))); }
        else if (accounts.some(a => a.display_name !== names[a.address])) {
          const result = await invokeMail("mail-account-settings", { accounts: accounts.filter(a => a.display_name !== names[a.address]).map(a => ({ address: a.address, display_name: names[a.address] })) });
          if (!Array.isArray(result.accounts)) throw new Error("The server did not return the saved accounts.");
          onAccounts(result.accounts);
        }
        await workspace.savePreferences(form);
      }, demo ? "Preferences saved in this demo browser." : "Preferences saved to your account.")}>{busy ? "Saving…" : "Save workspace preferences"}</button>
    </fieldset></div>
    <section className="push-settings"><h3>Background notifications</h3><p role="status">{demo ? "Sign in to receive real mail notifications." : push.status}</p><div className="tools-actions"><button className="secondary-button" disabled={demo || busy || push.busy} onClick={() => void run(push.enable, "Notifications enabled.")}>{push.active ? "Repair registration" : "Enable this device"}</button><button className="secondary-button" disabled={demo || !push.active || busy || push.busy} onClick={() => void run(push.test, "Test notification sent.")}>Send test notification</button><button className="text-button" disabled={demo || busy || push.busy} onClick={() => void run(push.disable, "Device notifications disabled.")}>Disable this device</button></div></section>
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="tools-notice" role="status">{notice}</p>}
  </details>;
}
