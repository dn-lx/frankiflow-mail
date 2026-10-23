"use client";
import { errorText } from "@/lib/mail-utils.mjs";
import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { emptyWorkspace, sampleWorkspace, resourceTables, type Resource, type Entry, type Preferences, type WorkspaceData } from "@/lib/workspace";

export async function invokeMail(name: string, body: Record<string, unknown>) {
  const { data, error } = await getSupabase().functions.invoke(name, { body });
  if (error || data?.error) {
    let detail;
    try { detail = await error?.context?.clone().json(); } catch {}
    throw Object.assign(new Error(detail?.error || data?.error || error?.message || "The mail service request failed."), { deliveryUnconfirmed: Boolean(detail?.delivery_unconfirmed), mailMessageId: detail?.mail_message_id });
  }
  return data;
}
export function useWorkspace(demo: boolean, userId: string | undefined) {
  const scope = demo ? "demo" : userId || null;
  const [data, setData] = useState<WorkspaceData>(emptyWorkspace);
  const [loaded, setLoaded] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const current = useRef(scope); current.current = scope;
  const generation = useRef(0);
  const value = useRef(data); value.current = data;
  const commit = useCallback((next: WorkspaceData) => {
    if (demo) localStorage.setItem("frankiflow-demo-tools-v2", JSON.stringify(next));
    value.current = next;
    setData(next);
  }, [demo]);
  const refresh = useCallback(async () => {
    const version = ++generation.current;
    if (!scope) { setData(emptyWorkspace()); setLoaded(null); return; }
    setLoading(true); setError("");
    try {
      let next = emptyWorkspace();
      if (demo) {
        const saved = localStorage.getItem("frankiflow-demo-tools-v2");
        if (saved) {
          const parsed = JSON.parse(saved);
          next = { ...emptyWorkspace(), ...parsed, preferences: { ...next.preferences, ...parsed.preferences } };
          for (const key of [...Object.keys(resourceTables), "links"] as (Resource | "links")[]) if (!Array.isArray(next[key])) next[key] = [];
        } else next = sampleWorkspace();
      } else {
        const entries = await Promise.all(Object.entries(resourceTables).map(async ([name, table]) => {
          const result = await getSupabase().from(table).select("*").limit(1000);
          if (result.error) throw result.error;
          return [name, Array.isArray(result.data) ? result.data : []] as const;
        }));
        Object.assign(next, Object.fromEntries(entries));
        const [links, preferences] = await Promise.all([
          getSupabase().from("frankiflow_mail_message_labels").select("*").limit(10000),
          getSupabase().from("frankiflow_mail_settings").select("*").eq("user_id", userId).maybeSingle(),
        ]);
        if (links.error) throw links.error; if (preferences.error) throw preferences.error;
        next.links = Array.isArray(links.data) ? links.data : [];
        const saved = preferences.data || {};
        // Only known, typed preferences are exposed to the UI.
        for (const key of Object.keys(next.preferences) as (keyof Preferences)[]) if (saved[key] != null) (next.preferences as any)[key] = saved[key];
      }
      if (!["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3.8-flash"].includes(next.preferences.ai_model)) next.preferences.ai_model = emptyWorkspace().preferences.ai_model;
      if (generation.current === version) { value.current = next; setData(next); setLoaded(scope); }
    } catch (e) { if (generation.current === version) { setError(errorText(e)); setLoaded(scope); } }
    finally { if (generation.current === version) setLoading(false); }
  }, [scope, demo, userId]);
  useEffect(() => { setData(emptyWorkspace()); setLoaded(null); void refresh(); return () => { generation.current++; }; }, [refresh]);
  async function save(kind: Resource, patch: Record<string, any>) {
    if (!scope || current.current !== scope || loaded !== scope || loading || error) throw new Error("Workspace data is unavailable. Retry loading before saving changes.");
    const owner = scope;
    const id = patch.id || crypto.randomUUID();
    let row: Entry = { ...patch, id };
    if (demo) { row = { ...value.current[kind].find(x => x.id === id), ...row }; commit({ ...value.current, [kind]: [...value.current[kind].filter(x => x.id !== id), row] }); }
    else {
      const existing = value.current[kind].some(x => x.id === id);
      if (!existing) {
        if (["labels", "templates", "filters"].includes(kind)) row.created_by = userId;
        if (["signatures", "events"].includes(kind)) row.user_id = userId;
      }
      if (!["labels"].includes(kind)) row.updated_at = new Date().toISOString();
      const result = existing ? await getSupabase().from(resourceTables[kind]).update(row).eq("id", id).select().single()
        : await getSupabase().from(resourceTables[kind]).insert(row).select().single();
      if (result.error) throw result.error;
      if (!result.data) throw new Error("The change was not saved.");
      row = result.data;
      if (current.current === owner) commit({ ...value.current, [kind]: [...value.current[kind].filter(x => x.id !== id), row] });
    }
    return row;
  }
  async function remove(kind: Resource, id: string) {
    if (!scope || current.current !== scope || loaded !== scope || loading || error) throw new Error("Workspace data is unavailable. Retry loading before saving changes.");
    const owner = scope;
    if (!demo) { const result = await getSupabase().from(resourceTables[kind]).delete().eq("id", id); if (result.error) throw result.error; }
    if (current.current !== owner) return;
    const next = { ...value.current, [kind]: value.current[kind].filter(x => x.id !== id),
      ...(kind === "labels" ? { links: value.current.links.filter(link => link.label_id !== id) } : {}) };
    commit(next);
  }
  async function savePreferences(patch: Partial<Preferences>) {
    if (!scope || current.current !== scope || loaded !== scope || loading || error) throw new Error("Workspace data is unavailable. Retry loading before saving changes.");
    const owner = scope;
    if (!demo) {
      const result = await getSupabase().from("frankiflow_mail_settings").upsert({ user_id: userId, ...patch, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (result.error) throw result.error;
    }
    if (current.current !== owner) return;
    commit({ ...value.current, preferences: { ...value.current.preferences, ...patch } });
  }
  async function setLabels(messageId: string, ids: string[]) {
    if (!scope || current.current !== scope || loaded !== scope || loading || error) throw new Error("Workspace data is unavailable. Retry loading before saving changes.");
    const owner = scope;
    const previous = value.current.links.filter(x => x.message_id === messageId);
    const additions = ids.filter(id => !previous.some(link => link.label_id === id));
    const removals = previous.filter(link => !ids.includes(link.label_id));
    if (!demo) {
      if (additions.length) { const result = await getSupabase().from("frankiflow_mail_message_labels").upsert(additions.map(label_id => ({ message_id: messageId, label_id })), { onConflict: "message_id,label_id" }); if (result.error) throw result.error; }
      if (removals.length) { const result = await getSupabase().from("frankiflow_mail_message_labels").delete().eq("message_id", messageId).in("label_id", removals.map(x => x.label_id)); if (result.error) { await refresh(); throw result.error; } }
    }
    if (current.current !== owner) return;
    const next = { ...value.current, links: [...value.current.links.filter(x => x.message_id !== messageId), ...ids.map(label_id => ({ message_id: messageId, label_id }))] };
    commit(next);
  }
  return { data: loaded === scope ? data : emptyWorkspace(), ready: loaded === scope && !loading && !error, loading, error, refresh, save, remove, savePreferences, setLabels };
}
export type WorkspaceController = ReturnType<typeof useWorkspace>;
