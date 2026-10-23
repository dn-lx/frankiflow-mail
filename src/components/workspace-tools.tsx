"use client";
import { useCallback, useState } from "react";
import { CalendarDays, ContactRound, FileText, Filter, Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { WorkspaceModal } from "./workspace-modal";
import { RichEditor } from "./rich-editor";
import { plainHtml, htmlText } from "@/lib/rich-text";
import { calendarText, localToInstant, instantToLocal } from "@/lib/organization.mjs";
import { recipients, validRecipients } from "@/lib/mail-utils.mjs";
import type { Resource, Entry } from "@/lib/workspace";
import type { Account, Compose } from "@/lib/types";
import type { WorkspaceController } from "@/hooks/use-workspace";
const tabs = [ ["contacts", "Contacts", ContactRound], ["events", "Calendar", CalendarDays], ["labels", "Labels", Tag], ["filters", "Filters", Filter], ["templates", "Templates", FileText], ["signatures", "Signatures", Pencil] ] as const;
const listFolders = ["inbox", "archive", "spam", "trash"];
const field = (form: Record<string, any>, name: string, fallback = "") => form[name] ?? fallback;
function downloadCalendar(event: Entry, from: string) {
  const url = URL.createObjectURL(new Blob([calendarText(event, from)], { type: "text/calendar;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = "meeting.ics"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function WorkspaceTools({ workspace, accounts, initialTab, onClose, onCompose, onInvite, onApplyFilters }: {
  workspace: WorkspaceController; accounts: Account[]; initialTab: Resource; onClose: () => void;
  onCompose: (seed: Partial<Compose>) => void; onInvite: (event: Entry, method: "REQUEST" | "CANCEL") => void;
  onApplyFilters: () => Promise<void>;
}) {
  const [tab, setTab] = useState<Resource>(initialTab), [form, setForm] = useState<Record<string, any> | null>(null);
  const [query, setQuery] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const close = useCallback(onClose, [onClose]);
  const data = workspace.data;
  const rows = data[tab].filter(row => JSON.stringify(row).toLowerCase().includes(query.toLowerCase())).sort((a, b) => tab === "events" ? String(a.start_at).localeCompare(b.start_at) : String(a.display_name || a.name || a.email).localeCompare(String(b.display_name || b.name || b.email)));
  function change(name: string, value: any) { setForm(previous => ({ ...previous, [name]: value })); }
  function edit(row: Entry | null) {
    setError(""); setNotice("");
    const seed: Record<string, any> = row ? { ...row } : {};
    if (tab === "events") {
      const zone = seed.timezone || "Europe/Berlin";
      seed.timezone = zone;
      seed.start = seed.start_at ? instantToLocal(seed.start_at, zone) : instantToLocal(new Date(Date.now() + 3600000).toISOString(), zone);
      seed.end = seed.end_at ? instantToLocal(seed.end_at, zone) : instantToLocal(new Date(Date.now() + 7200000).toISOString(), zone);
      seed.attendees = (seed.required_attendees || []).join(", "); seed.optional = (seed.optional_attendees || []).join(", ");
    }
    if (tab === "filters") { seed.conditions = { ...seed.conditions }; seed.actions = { ...seed.actions }; }
    if (tab === "signatures") seed.signature_text = htmlText(seed.html_body || "");
    setForm(seed);
  }
  async function perform(action: () => Promise<unknown>, done: string) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try { await action(); setNotice(done); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!form) return;
    await perform(async () => {
      const id = form.id;
      let row: Record<string, any> = { ...(id ? { id } : {}) };
      if (tab === "contacts") {
        if (!validRecipients(form.email) || recipients(form.email).length !== 1) throw new Error("Enter one valid email address.");
        row = { ...row, email: recipients(form.email)[0].toLowerCase(), display_name: form.display_name || null, company: form.company || null, phone: form.phone || null, notes: form.notes || null };
      } else if (tab === "labels") row = { ...row, name: String(form.name || "").trim(), color: form.color || "#287a65" };
      else if (tab === "templates") row = { ...row, name: form.name, subject: form.subject || "", text_body: form.text_body || "", html_body: form.html_body || "", is_shared: Boolean(form.is_shared) };
      else if (tab === "signatures") {
        row = { ...row, name: form.name, account_id: form.account_id || null, html_body: form.html_body || plainHtml(form.signature_text || ""), is_default: Boolean(form.is_default) };
        // Clear other defaults only after this signature has been safely saved.
      } else if (tab === "filters") {
        const conditions = Object.fromEntries(Object.entries(form.conditions || {}).filter(([, value]) => value !== "" && value != null));
        const actions = Object.fromEntries(Object.entries(form.actions || {}).filter(([, value]) => value !== "" && value != null));
        if (!Object.keys(conditions).length) throw new Error("Choose at least one matching condition.");
        if (!Object.keys(actions).some(key => key !== "stop_processing")) throw new Error("Choose at least one action.");
        row = { ...row, name: form.name, conditions, actions, active: form.active !== false };
      } else {
        const start_at = localToInstant(form.start, form.timezone), end_at = localToInstant(form.end, form.timezone);
        if (Date.parse(end_at) <= Date.parse(start_at)) throw new Error("The event must end after it starts.");
        if ((form.attendees && !validRecipients(form.attendees)) || (form.optional && !validRecipients(form.optional))) throw new Error("Enter valid attendee email addresses.");
        if (form.meeting_url && !/^https?:\/\//i.test(form.meeting_url)) throw new Error("Use an HTTPS or HTTP meeting link.");
        row = { ...row, title: form.title, start_at, end_at, timezone: form.timezone, all_day: Boolean(form.all_day), required_attendees: recipients(form.attendees), optional_attendees: recipients(form.optional),
          organizer_account_id: form.organizer_account_id || accounts[0]?.id, location: form.location || null, description: form.description || null,
          meeting_provider: form.meeting_provider || "none", meeting_url: form.meeting_url || null, recurrence_rule: form.recurrence_rule || null,
          reminder_minutes: form.reminder_minutes || [15], show_as: form.show_as || "busy", response_requested: form.response_requested !== false,
          status: form.status || "draft", uid: form.uid || `${crypto.randomUUID()}@frankiflow.de`, sequence: Number(form.sequence || 0) };
      }
      if (["labels", "templates", "signatures", "filters"].includes(tab) && !String(row.name || "").trim()) throw new Error("A name is required.");
      const saved = await workspace.save(tab, row);
      setForm(previous => previous ? { ...previous, id: saved.id } : previous);
      if (tab === "signatures" && row.is_default) for (const other of data.signatures.filter(s => s.id !== saved.id && s.account_id === row.account_id && s.is_default)) await workspace.save("signatures", { id: other.id, is_default: false });
      setForm(null);
    }, "Saved.");
  }
  const input = (name: string, label: string, type = "text", required = false) => <label>{label}<input aria-label={label} type={type} required={required} value={field(form!, name)} onChange={e => change(name, e.target.value)} /></label>;
  const condition = (name: string, value: string) => change("conditions", { ...form?.conditions, [name]: value });
  const action = (name: string, value: any) => change("actions", { ...form?.actions, [name]: value });
  return <WorkspaceModal title="Workspace tools" onClose={close}>
    <nav className="tools-tabs" aria-label="Workspace tools">{tabs.map(([id, name, Icon]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => { setTab(id); setForm(null); setQuery(""); setError(""); setNotice(""); }}><Icon size={15} />{name}</button>)}</nav>
    {(error || workspace.error) && <p className="form-error" role="alert">{error || workspace.error} {workspace.error && <button className="text-button" onClick={() => void workspace.refresh()}>Retry loading tools</button>}</p>}
    {notice && <p className="tools-notice" role="status">{notice}</p>}
    {workspace.loading && <p role="status">Loading workspace…</p>}
    {form ? <form onSubmit={save} className="tools-form"><h3>{form.id ? "Edit" : "New"} {tabs.find(x => x[0] === tab)?.[1].replace(/s$/, "")}</h3><fieldset disabled={busy}>
      {tab === "contacts" && <><div className="form-grid">{input("display_name", "Contact name")}{input("email", "Contact email", "email", true)}{input("company", "Company")}{input("phone", "Phone", "tel")}</div><label>Notes<textarea aria-label="Contact notes" value={field(form, "notes")} onChange={e => change("notes", e.target.value)} /></label></>}
      {tab === "labels" && <div className="form-grid">{input("name", "Label name", "text", true)}<label>Label color<input aria-label="Label color" type="color" value={form.color || "#287a65"} onChange={e => change("color", e.target.value)} /></label></div>}
      {tab === "templates" && <>{input("name", "Template name", "text", true)}{input("subject", "Template subject")}<RichEditor label="Template body" text={form.text_body || ""} html={form.html_body} disabled={busy} onChange={(text, html) => setForm(f => ({ ...f, text_body: text, html_body: html }))} /><label className="check-label"><input type="checkbox" checked={Boolean(form.is_shared)} onChange={e => change("is_shared", e.target.checked)} />Shared with the mailbox team</label></>}
      {tab === "signatures" && <>{input("name", "Signature name", "text", true)}<label>Sender account<select aria-label="Signature account" value={form.account_id || ""} onChange={e => change("account_id", e.target.value)}><option value="">All my sender accounts</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.address}</option>)}</select></label><RichEditor label="Saved signature body" text={form.signature_text || ""} html={form.html_body} disabled={busy} onChange={(text, html) => setForm(f => ({ ...f, signature_text: text, html_body: html }))} /><label className="check-label"><input type="checkbox" checked={Boolean(form.is_default)} onChange={e => change("is_default", e.target.checked)} />Default for this account</label></>}
      {tab === "filters" && <>{input("name", "Filter name", "text", true)}<h4>When a new Inbox message matches</h4><div className="form-grid">{[["from_contains", "Sender contains"], ["to_contains", "Recipient contains"], ["subject_contains", "Subject contains"], ["body_contains", "Body contains"]].map(([key, label]) => <label key={key}>{label}<input aria-label={label} value={form.conditions?.[key] || ""} onChange={e => condition(key, e.target.value)} /></label>)}<label>Account<select aria-label="Filter account" value={form.conditions?.account_address || ""} onChange={e => condition("account_address", e.target.value)}><option value="">Any account</option>{accounts.map(a => <option key={a.id}>{a.address}</option>)}</select></label><label>Attachments<select aria-label="Filter attachments" value={form.conditions?.has_attachment || ""} onChange={e => condition("has_attachment", e.target.value)}><option value="">Any</option><option value="yes">Has attachments</option><option value="no">No attachments</option></select></label></div><h4>Apply these actions</h4><div className="form-grid"><label>Move to<select aria-label="Filter destination" value={form.actions?.folder || ""} onChange={e => action("folder", e.target.value)}><option value="">Keep in Inbox</option>{listFolders.filter(x => x !== "inbox").map(x => <option key={x}>{x}</option>)}</select></label><label>Add label<select aria-label="Filter label" value={form.actions?.label_id || ""} onChange={e => action("label_id", e.target.value)}><option value="">None</option>{data.labels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label><label>Priority<select value={form.actions?.priority || ""} onChange={e => action("priority", e.target.value)}><option value="">Unchanged</option><option value="high">High</option><option value="normal">Normal</option></select></label></div>{[["is_read", "Mark read"], ["is_starred", "Star message"], ["is_pinned", "Pin message"], ["stop_processing", "Stop after this rule"]].map(([key, label]) => <label key={key} className="check-label"><input type="checkbox" checked={Boolean(form.actions?.[key])} onChange={e => action(key, e.target.checked ? true : undefined)} />{label}</label>)}<label className="check-label"><input type="checkbox" checked={form.active !== false} onChange={e => change("active", e.target.checked)} />Enabled</label></>}
      {tab === "events" && <>{input("title", "Event title", "text", true)}<div className="form-grid">{input("start", "Event start", "datetime-local", true)}{input("end", "Event end", "datetime-local", true)}{input("timezone", "Event timezone", "text", true)}<label>Organizer<select aria-label="Event organizer" value={form.organizer_account_id || accounts[0]?.id} onChange={e => change("organizer_account_id", e.target.value)}>{accounts.map(a => <option key={a.id} value={a.id}>{a.address}</option>)}</select></label></div><label className="check-label"><input type="checkbox" checked={Boolean(form.all_day)} onChange={e => change("all_day", e.target.checked)} />All day (end date is exclusive)</label>{input("attendees", "Required attendees")}{input("optional", "Optional attendees")}<div className="form-grid">{input("location", "Event location")}<label>Online meeting<select aria-label="Meeting provider" value={form.meeting_provider || "none"} onChange={e => change("meeting_provider", e.target.value)}>{["none", "teams", "zoom", "google_meet", "other"].map(p => <option key={p}>{p}</option>)}</select></label>{input("meeting_url", "Meeting link", "url")}<label>Repeats<select aria-label="Event recurrence" value={form.recurrence_rule || ""} onChange={e => change("recurrence_rule", e.target.value)}><option value="">Does not repeat</option><option value="FREQ=DAILY">Daily</option><option value="FREQ=WEEKLY">Weekly</option><option value="FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR">Weekdays</option><option value="FREQ=MONTHLY">Monthly</option></select></label><label>Availability<select value={form.show_as || "busy"} onChange={e => change("show_as", e.target.value)}>{["busy", "free", "tentative"].map(x => <option key={x}>{x}</option>)}</select></label><label>Reminder<select aria-label="Event reminder" value={Array.isArray(form.reminder_minutes) && !form.reminder_minutes.length ? "none" : form.reminder_minutes?.[0] ?? 15} onChange={e => change("reminder_minutes", e.target.value === "none" ? [] : [Number(e.target.value)])}><option value="none">No reminder</option>{[5, 15, 30, 60, 1440].map(x => <option key={x} value={x}>{x === 1440 ? "1 day" : `${x} minutes`} before</option>)}</select></label></div><label>Event notes<textarea aria-label="Event notes" value={form.description || ""} onChange={e => change("description", e.target.value)} /></label><label className="check-label"><input type="checkbox" checked={form.response_requested !== false} onChange={e => change("response_requested", e.target.checked)} />Request attendee responses</label></>}
      <div className="tools-actions"><button type="submit" className="primary-button">{busy ? "Saving…" : "Save"}</button><button type="button" className="secondary-button" onClick={() => setForm(null)}>Cancel edit</button></div></fieldset></form> : <>
      <div className="tools-list-toolbar"><input aria-label="Search workspace tools" placeholder={`Search ${tabs.find(x => x[0] === tab)?.[1].toLowerCase()}…`} value={query} onChange={e => setQuery(e.target.value)} /><button className="primary-button" disabled={!workspace.ready || busy} onClick={() => edit(null)}><Plus size={15} />New {tab === "events" ? "event" : tab.replace(/s$/, "")}</button></div>
      {tab === "filters" && <p className="tools-help">Rules apply to newly loaded Inbox messages. <button className="text-button" disabled={busy} onClick={() => void perform(onApplyFilters, "Filters applied to current Inbox messages.")}>Apply filters to Inbox now</button></p>}
      {!rows.length && <div className="tools-empty">Nothing here yet. Create your first {tab === "events" ? "event" : tab.replace(/s$/, "")}.</div>}
      <div className="tools-list">{rows.map(row => <article key={row.id} className="tool-card"><div><strong>{row.display_name || row.title || row.name || row.email}</strong><p>{tab === "contacts" ? [row.email, row.company, row.phone].filter(Boolean).join(" · ") : tab === "events" ? `${new Date(row.start_at).toLocaleString()} · ${row.timezone} · ${row.status}` : tab === "filters" ? `${row.active === false ? "Paused" : "Enabled"} · ${Object.keys(row.conditions || {}).join(", ")}` : tab === "signatures" ? `${accounts.find(a => a.id === row.account_id)?.address || "All sender accounts"}${row.is_default ? " · Default" : ""}` : tab === "labels" ? row.name : row.subject}</p>{tab === "labels" && <span className="label-dot" style={{ background: row.color }} />}</div><div className="tools-actions">
        {tab === "contacts" && <button className="secondary-button" onClick={() => { onClose(); onCompose({ to: row.email }); }}>Write email</button>}
        {tab === "templates" && <button className="secondary-button" onClick={() => { onClose(); onCompose({ subject: row.subject, text: row.text_body || htmlText(row.html_body || ""), html: row.html_body || undefined }); }}>Use template</button>}
        {tab === "events" && <><button className="secondary-button" disabled={row.status === "cancelled"} onClick={() => { onClose(); onInvite({ ...row, sequence: row.status === "sent" ? Number(row.sequence || 0) + 1 : Number(row.sequence || 0) }, "REQUEST"); }}>Prepare invitation</button><button className="text-button" onClick={() => downloadCalendar(row, accounts.find(a => a.id === row.organizer_account_id)?.address || accounts[0]?.address || "")}>Download ICS</button>{row.status === "sent" && <button className="text-button" onClick={() => { onClose(); onInvite({ ...row, sequence: Number(row.sequence || 0) + 1 }, "CANCEL"); }}>Prepare cancellation</button>}</>}
        <button className="icon-button" aria-label={`Edit ${row.name || row.title || row.email}`} disabled={busy} onClick={() => edit(row)}><Pencil size={15} /></button><button className="icon-button" aria-label={`Delete ${row.name || row.title || row.email}`} disabled={busy} onClick={() => { if (window.confirm(`Delete ${row.name || row.title || row.email}?${tab === "events" && row.status === "sent" ? " This removes the event but does not send a cancellation." : ""}`)) void perform(() => workspace.remove(tab, row.id), "Deleted."); }}><Trash2 size={15} /></button>
      </div></article>)}</div>
    </>}
  </WorkspaceModal>;
}
