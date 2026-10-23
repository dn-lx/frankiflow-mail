"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  Archive, CalendarDays, Clock, Tag, FileText, ContactRound, Sparkles, Pin,
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  File,
  Inbox,
  LoaderCircle,
  LogOut,
  Mail,
  Menu,
  Moon,
  MoreHorizontal,
  Paperclip,
  PenLine,
  Plus,
  Search,
  ReplyAll,
  RotateCcw,
  Undo2,
  Send,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import { getSupabase, attachmentBucket } from "@/lib/supabase";
import { WorkspaceTools } from "@/components/workspace-tools";
import { WritingAssistant } from "@/components/writing-assistant";
import { AdvancedSettings } from "@/components/advanced-settings";
import { RichEditor } from "@/components/rich-editor";
import { useWorkspace, invokeMail } from "@/hooks/use-workspace";
import { usePush } from "@/hooks/use-push";
import { saveServerDraft, removeDraft } from "@/lib/drafts";
import { sanitizeComposeHtml, htmlText, plainHtml, inlineFiles } from "@/lib/rich-text";
import { calendarText, matchesRule, rulePatch, instantToLocal } from "@/lib/organization.mjs";
import type { Resource, Entry } from "@/lib/workspace";
import { SignatureSettings } from "@/components/signature-settings";
import { useSignatures } from "@/hooks/use-signatures";
import { useDraftRecovery } from "@/hooks/use-draft-recovery";
import { attachmentFiles, encodeFiles, messageText } from "@/lib/attachments";
import { demoAccounts, demoMessages } from "@/lib/demo";
import {
  filterMessages,
  formatBytes,
  recipients,
  replyRecipients,
  fromAddressForMessage,
  validRecipients,
  validateFiles,
} from "@/lib/mail-utils.mjs";
import type { Account, Attachment, Compose, Message } from "@/lib/types";

const folders = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "starred", label: "Starred", icon: Star },
  { id: "sent", label: "Sent", icon: Send },
  { id: "drafts", label: "Drafts", icon: File },
  { id: "scheduled", label: "Scheduled", icon: Clock },
  { id: "snoozed", label: "Snoozed", icon: Clock },
  { id: "all", label: "All mail", icon: Mail },
  { id: "archive", label: "Archive", icon: Archive },
  { id: "spam", label: "Spam", icon: ShieldCheck },
  { id: "trash", label: "Trash", icon: Trash2 },
];
const initials = (s: string) =>
  s
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
const date = (s: string) =>
  new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(s));
const errorText = (e: unknown) =>
  e instanceof Error
    ? e.message
    : typeof e === "object" && e && "message" in e
      ? String(e.message)
      : "Something went wrong. Please try again.";
const storageKey = "frankiflow-demo-v2";
type MoveSnapshot = Pick<Message, "id" | "folder" | "trashed_at" | "snoozed_until">;

export default function MailApp({ demo = false }: { demo?: boolean }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(demo);
  const workspace = useWorkspace(demo, session?.user.id);
  const preferences = workspace.data.preferences;
  const push = usePush(demo, session?.user.id);
  const [tools, setTools] = useState<Resource | null>(null);
  const [assistant, setAssistant] = useState(false);
  const [insertMenu, setInsertMenu] = useState(false);
  const [scheduleVisible, setScheduleVisible] = useState(false);
  const [labelPicker, setLabelPicker] = useState(false);
  const [snoozePicker, setSnoozePicker] = useState(false);
  const [snoozeTime, setSnoozeTime] = useState("");
  const preferencesRef = useRef(preferences); preferencesRef.current = preferences;
  const rulesProcessed = useRef(new Set<string>());
  const [messages, setMessages] = useState<Message[]>([]);
  const [accounts, setAccounts] = useState<Account[]>(demo ? demoAccounts : []);
  const [folder, setFolder] = useState("inbox");
  const [active, setActive] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [composer, setComposer] = useState<Compose | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const sendingLock = useRef(false);
  const [forwarding, setForwarding] = useState(false);
  const [mutationBusy, setMutationBusy] = useState(false);
  const mutationLock = useRef(false);
  const [undo, setUndo] = useState<MoveSnapshot[] | null>(null);
  const recovery = useDraftRecovery(
    demo ? "demo" : session?.user.id || null,
    composer,
    files,
  );
  const signatures = useSignatures(demo ? "demo" : session?.user.id || null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [dark, setDark] = useState(false);
  const [settings, setSettings] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const [compact, setCompact] = useState(false);
  const [ccVisible, setCcVisible] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const attachmentCache = useRef(new Map<string, Attachment[]>());
  const loadGeneration = useRef(0);
  const sessionUser = useRef<string | null>(null);
  const message = messages.find((m) => m.id === active);
  const selectedLabel = folder.startsWith("label:") ? folder.slice(6) : null;
  const folderTitle = folders.find(f => f.id === folder)?.label || workspace.data.labels.find(l => l.id === selectedLabel)?.name || "Mail";
  const visible: Message[] = filterMessages(
    messages.filter(m => !selectedLabel || workspace.data.links.some(link => link.message_id === m.id && link.label_id === selectedLabel)).map(m => ({ ...m, label_names: workspace.data.links.filter(link => link.message_id === m.id).map(link => workspace.data.labels.find(l => l.id === link.label_id)?.name || "") })),
    selectedLabel ? "all" : folder, query, unreadOnly,
  );
  const ownAddress = accounts[0]?.address || "";

  const signature = signatures.values[composer?.fromAddress.toLowerCase() || ""] || "";

  const load = useCallback(async () => {
    if (demo) return;
    const generation = ++loadGeneration.current;
    setBusy(true);
    setError("");
    try {
      const [mail, senders] = await Promise.all([
        getSupabase()
          .from("frankiflow_mail_messages")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(1000),
        getSupabase()
          .from("frankiflow_mail_accounts")
          .select("*")
          .order("is_primary", { ascending: false }),
      ]);
      if (mail.error) throw mail.error;
      if (senders.error) throw senders.error;
      if (generation === loadGeneration.current) {
        setMessages(
          (mail.data || []).map((m) => ({
            ...m,
            to_addresses: recipients(m.to_addresses),
            attachments: attachmentCache.current.get(m.id),
          })),
        );
        setAccounts(senders.data || []);
      }
      // Metadata can be present even when the message's attachment flag is stale.
      // Keep mailbox loading independent of this optional index request.
      const ids = (mail.data || []).map((m) => m.id);
      const attachmentIds = new Set<string>();
      try {
        await Promise.all(Array.from({ length: Math.ceil(ids.length / 100) }, async (_, batch) => {
          const batchIds = ids.slice(batch * 100, (batch + 1) * 100);
          for (let offset = 0; ; offset += 1000) {
            const result = await getSupabase().from("frankiflow_mail_attachments")
              .select("message_id").in("message_id", batchIds).range(offset, offset + 999);
            if (result.error) throw result.error;
            for (const item of result.data || []) attachmentIds.add(item.message_id);
            if (!result.data || result.data.length < 1000) break;
          }
        }));
        if (generation === loadGeneration.current) setMessages((previous) => previous.map((m) => ({
          ...m, has_attachments: m.has_attachments || attachmentIds.has(m.id),
        })));
      } catch {
        if (generation === loadGeneration.current) setError("Attachment search could not be refreshed. Open a message to load its files, or refresh to retry.");
      }
    } catch (e) {
      if (generation === loadGeneration.current) setError(errorText(e));
    } finally {
      if (generation === loadGeneration.current) setBusy(false);
    }
  }, [demo]);

  useEffect(() => {
    try {
      setDark(localStorage.getItem("ffmail-v2-theme") === "dark");
      setCompact(localStorage.getItem("ffmail-v2-density") === "compact");
    } catch {
      /* Browser storage may be disabled. */
    }
    if (demo) {
      try {
        const saved = localStorage.getItem(storageKey);
        setMessages(saved ? JSON.parse(saved) : demoMessages());
        const names = JSON.parse(localStorage.getItem("frankiflow-demo-account-names-v2") || "{}");
        setAccounts(demoAccounts.map(a => ({ ...a, display_name: typeof names[a.address] === "string" ? names[a.address] : a.display_name })));
      } catch {
        setMessages(demoMessages());
      }
      return;
    }
    // Supabase callbacks must stay synchronous; fetch outside its auth lock.
    const {
      data: { subscription },
    } = getSupabase().auth.onAuthStateChange((_event, s) => {
      if (sessionUser.current !== (s?.user.id || null)) {
        sessionUser.current = s?.user.id || null;
        loadGeneration.current++;
        attachmentCache.current.clear();
        setMessages([]);
        setAccounts([]);
        setActive(null);
        setSelected(new Set());
        setComposer(null);
        setFiles([]);
        setUndo(null);
        setTools(null); setAssistant(false); rulesProcessed.current.clear();
        setBusy(false);
      }
      setSession(s);
      setReady(true);
    });
    getSupabase()
      .auth.getSession()
      .then(({ data, error }) => {
        setSession(data.session);
        if (error) setError(error.message);
        setReady(true);
      });
    return () => subscription.unsubscribe();
  }, [demo]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker
      .getRegistrations()
      .then(async (registrations) => {
        for (const registration of registrations) {
          const script =
            registration.active?.scriptURL ||
            registration.waiting?.scriptURL ||
            registration.installing?.scriptURL;
          if (
            script &&
            new URL(script).origin === location.origin &&
            new URL(script).pathname === "/sw.js"
          )
            await registration.unregister();
        }
      })
      .catch(() => {
        /* No worker is required for the Next.js app. */
      });
  }, []);

  useEffect(() => {
    if (tools || assistant || (!composer && !settings)) return;
    const previous = document.activeElement as HTMLElement | null;
    const modal = document.querySelector<HTMLElement>('[role="dialog"]');
    const focusable = () =>
      Array.from(
        modal?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href]",
        ) || [],
      ).filter((el) => el.getClientRects().length);
    focusable()
      .find((el) => el.tagName === "INPUT")
      ?.focus();
    if (settings) focusable()[0]?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0];
      const last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      previous?.focus();
    };
    // Focus is initialized when opening a modal, not after every keystroke.
  }, [Boolean(composer), settings, tools, assistant]);

  useEffect(() => {
    if (session && !demo) void load();
  }, [session, demo, load]);
  useEffect(() => {
    if (!session || demo) return;
    const channel = getSupabase()
      .channel("v2-mail")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "frankiflow_mail_messages" },
        (payload) => {
          const incoming = payload.new as Message;
          const prefs = preferencesRef.current;
          if (payload.eventType === "INSERT" && incoming.direction === "inbound" && incoming.folder === "inbox") {
            setNotice(`New mail: ${incoming.subject || "No subject"}`);
            if (prefs.notifications_enabled && !push.active && document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") {
              const notification = new Notification(incoming.from_name || incoming.from_address, { body: incoming.subject || "New message", icon: "/icon-192.png", tag: incoming.id });
              notification.onclick = () => { window.focus(); setFolder("inbox"); setActive(incoming.id); notification.close(); };
            }
            if (prefs.notification_sound) {
              try { const audio = new AudioContext(); const oscillator = audio.createOscillator(); const volume = audio.createGain(); volume.gain.value = 0.035; oscillator.connect(volume); volume.connect(audio.destination); oscillator.frequency.value = 660; oscillator.start(); oscillator.stop(audio.currentTime + 0.12); oscillator.onended = () => void audio.close(); } catch {}
            }
          }
          attachmentCache.current.clear();
          void load();
        },
      )
      .subscribe();
    return () => {
      void getSupabase().removeChannel(channel);
    };
  }, [session, demo, load, push.active]);
  useEffect(() => {
    if (!workspace.ready) return;
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => setDark(preferences.theme === "dark" || (preferences.theme === "system" && media.matches));
    apply(); setCompact(preferences.density === "compact");
    media.addEventListener("change", apply); return () => media.removeEventListener("change", apply);
  }, [workspace.ready, preferences.theme, preferences.density]);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    try {
      localStorage.setItem("ffmail-v2-theme", dark ? "dark" : "light");
    } catch {}
  }, [dark]);
  useEffect(() => {
    try {
      localStorage.setItem(
        "ffmail-v2-density",
        compact ? "compact" : "comfortable",
      );
    } catch {}
  }, [compact]);
  useEffect(() => {
    if (!demo || !messages.length) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(messages));
    } catch {
      setError(
        "Browser storage is full. Demo changes may not survive a refresh.",
      );
    }
  }, [messages, demo]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(
      () => {
        setNotice("");
        setUndo(null);
      },
      undo ? 10000 : 5000,
    );
    return () => clearTimeout(timer);
  }, [notice, undo]);

  function resumeRecovery() {
    if (!recovery.saved) return;
    setComposer(recovery.saved.compose);
    setFiles(recovery.saved.files);
    setCcVisible(
      Boolean(recovery.saved.compose.cc || recovery.saved.compose.bcc),
    );
    setError("");
  }
  function newMessage(seed: Partial<Compose> = {}, initialFiles: File[] = []) {
    if (!recovery.ready) {
      setNotice("Checking for unsent drafts. Please try again in a moment.");
      return false;
    }
    if (composer) {
      setNotice(
        "Save or discard the open draft before starting another message.",
      );
      return false;
    }
    if (recovery.saved) {
      resumeRecovery();
      setNotice(
        "Your unsent draft is open. Save or discard it before starting another message.",
      );
      return false;
    }
    setFiles(initialFiles);
    setScheduleVisible(Boolean(seed.scheduledAt)); setInsertMenu(false);
    setCcVisible(Boolean(seed.cc || seed.bcc));
    const next: Compose = {
      to: "",
      cc: "",
      bcc: "",
      subject: "",
      text: "",
      fromAddress: accounts.find(a => a.address === preferences.default_sender_address)?.address || accounts.find((a) => a.is_primary)?.address || ownAddress,
      ...seed,
    };
    if (preferences.signature_enabled && !seed.id && !seed.text && !seed.html) {
      const account = accounts.find(a => a.address === next.fromAddress);
      const saved = workspace.data.signatures.find(signature => signature.is_default && signature.account_id === account?.id) || workspace.data.signatures.find(signature => signature.is_default && !signature.account_id);
      if (saved) { next.html = sanitizeComposeHtml(saved.html_body); next.text = htmlText(next.html || ""); }
    }
    setComposer(next);
    setError("");
    return true;
  }
  function reply(all = false) {
    if (!message) return;
    const targets = replyRecipients(message, accounts, all);
    if (!targets.to.length) {
      setError("No valid reply recipient was found.");
      return;
    }
    newMessage({
      to: targets.to.join(", "),
      cc: targets.cc.join(", "),
      fromAddress: fromAddressForMessage(message, accounts),
      subject: /^re:/i.test(message.subject)
        ? message.subject
        : `Re: ${message.subject}`,
      thread_id: message.thread_id,
      in_reply_to: message.provider_message_id,
    });
  }
  async function forward() {
    if (!message || forwarding) return;
    if (composer || recovery.saved) {
      newMessage();
      return;
    }
    setForwarding(true);
    setError("");
    try {
      const originalFiles = await attachmentFiles(
        message,
        demo,
        attachmentCache.current,
      );
      newMessage(
        {
          subject: /^fwd:/i.test(message.subject)
            ? message.subject
            : `Fwd: ${message.subject}`,
          fromAddress: fromAddressForMessage(message, accounts),
          text: `\n\n---------- Forwarded message ----------\nFrom: ${message.from_address}\nTo: ${message.to_addresses.join(", ")}\nDate: ${date(message.created_at)}\nSubject: ${message.subject}\n\n${messageText(message)}`,
        },
        originalFiles,
      );
    } catch (e) {
      setError(`Could not forward message: ${errorText(e)}`);
    } finally {
      setForwarding(false);
    }
  }
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key === "Escape") {
        setSettings(false);
        setSidebar(false);
        return;
      }
      if (!preferences.keyboard_shortcuts) return;
      if (
        target.closest("input,textarea,select,[contenteditable]") ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        composer || tools || assistant ||
        settings
      )
        return;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key.toLowerCase() === "c") {
        e.preventDefault();
        newMessage();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  });

  async function patch(ids: string[], updates: Partial<Message>) {
    if (mutationLock.current) return false;
    if (updates.folder && messages.some(message => ids.includes(message.id) && message.folder === "scheduled")) { setError("Cancel the scheduled delivery before moving this message."); return false; }
    mutationLock.current = true;
    setMutationBusy(true);
    setError("");
    const snapshots = messages
      .filter((m) => ids.includes(m.id))
      .map(({ id, folder, trashed_at, snoozed_until }) => ({
        id,
        folder,
        trashed_at: trashed_at || null,
        snoozed_until: snoozed_until || null,
      }));
    const owner = sessionUser.current;
    const changes = {
      ...updates,
      ...(updates.folder
        ? {
            trashed_at:
              updates.folder === "trash" ? new Date().toISOString() : null,
            ...(updates.folder !== "snoozed" ? { snoozed_until: null } : {}),
          }
        : {}),
    };
    try {
      if (!demo) {
        const { error } = await getSupabase()
          .from("frankiflow_mail_messages")
          .update({ ...changes, updated_at: new Date().toISOString() })
          .in("id", ids);
        if (error) throw error;
        if (owner !== sessionUser.current) return false;
      }
      setMessages((previous) =>
        previous.map((m) => (ids.includes(m.id) ? { ...m, ...changes } : m)),
      );
      setSelected(new Set());
      if (updates.folder) {
        setActive(null);
        setUndo(snapshots);
        setNotice(
          `Moved ${ids.length === 1 ? "message" : `${ids.length} messages`} to ${updates.folder}.`,
        );
      }
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      mutationLock.current = false;
      setMutationBusy(false);
    }
  }
  async function undoMove() {
    if (!undo || mutationLock.current) return;
    const snapshots = undo;
    const owner = sessionUser.current;
    mutationLock.current = true;
    setMutationBusy(true);
    setError("");
    try {
      const results = await Promise.all(
        snapshots.map(async (snapshot) => {
          if (demo) return { snapshot, error: null };
          const { error } = await getSupabase()
            .from("frankiflow_mail_messages")
            .update({
              folder: snapshot.folder,
              trashed_at: snapshot.trashed_at || null,
              snoozed_until: snapshot.snoozed_until || null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", snapshot.id);
          return { snapshot, error };
        }),
      );
      if (!demo && owner !== sessionUser.current) return;
      const restored = new Map(
        results.filter((r) => !r.error).map((r) => [r.snapshot.id, r.snapshot]),
      );
      setMessages((previous) =>
        previous.map((m) =>
          restored.has(m.id) ? { ...m, ...restored.get(m.id)! } : m,
        ),
      );
      const failed = results.filter((r) => r.error);
      setUndo(failed.length ? failed.map((r) => r.snapshot) : null);
      if (failed.length) {
        setError(
          `Some messages could not be restored: ${errorText(failed[0].error)}`,
        );
        setNotice(
          "Restored available messages. Retry Undo for the remaining messages.",
        );
      } else setNotice("Move undone.");
    } catch (e) {
      setError(errorText(e));
    } finally {
      mutationLock.current = false;
      setMutationBusy(false);
    }
  }
  async function openMessage(m: Message) {
    if (!m) return;
    if (m.folder === "drafts") {
      try {
        const draftFiles = await attachmentFiles(
          m,
          demo,
          attachmentCache.current,
        );
        newMessage(
          {
            id: m.id,
            deliveryUnconfirmed: m.direction === "outbound",
            to: m.to_addresses.join(", "),
            cc: m.cc_addresses?.join(", ") || "",
            bcc: m.bcc_addresses?.join(", ") || "",
            subject: m.subject,
            text: m.text_body || htmlText(m.html_body || ""),
            html: m.html_body || undefined,
            scheduledAt: m.scheduled_at || undefined,
            fromAddress: m.from_address,
          },
          draftFiles,
        );
      } catch (e) {
        setError(`Could not open draft: ${errorText(e)}`);
      }
      return;
    }
    setActive(m.id);
    if (!m.is_read && preferences.mark_read_on_open) void patch([m.id], { is_read: true });
  }
  function changeFolder(id: string) {
    setFolder(id);
    setActive(null);
    setQuery("");
    setUnreadOnly(false);
    setSelected(new Set());
    setSidebar(false); setLabelPicker(false); setSnoozePicker(false);
    setError("");
  }
  function addFiles(incoming: File[]) {
    const next = [...files, ...incoming];
    const error = validateFiles(next);
    if (error) {
      setError(error);
      return;
    }
    setFiles(next);
  }
  async function saveDraft() {
    if (!composer || sendingLock.current) return;
    const data = composer;
    if (data.deliveryUnconfirmed) { setError("Check delivery status before saving or retrying this message. Your device recovery copy keeps the files and the delivery warning."); return; }
    if (
      !data.to &&
      !data.cc &&
      !data.bcc &&
      !data.subject &&
      !data.text &&
      !data.html &&
      !files.length
    ) {
      await recovery.clear().catch(() => {});
      setComposer(null);
      return;
    }
    sendingLock.current = true;
    setSending(true);
    try {
      const row = {
        account_id: accounts.find((a) => a.address === data.fromAddress)?.id,
        direction: "draft",
        folder: "drafts",
        from_address: data.fromAddress,
        to_addresses: recipients(data.to),
        cc_addresses: recipients(data.cc),
        bcc_addresses: recipients(data.bcc),
        subject: data.subject,
        text_body: data.text,
        html_body: data.html || "",
        scheduled_at: data.scheduledAt || null,
        preview: data.text.slice(0, 180),
        is_read: true,
        updated_at: new Date().toISOString(),
      };
      if (demo) {
        const encoded = await encodeFiles(files);
        const id = data.id || crypto.randomUUID();
        setMessages((prev) => [
          {
            ...row,
            id,
            from_name: "Alex Morgan",
            is_starred: false,
            has_attachments: files.length > 0,
            created_at: new Date().toISOString(),
            attachments: encoded.map((file, index) => ({
              id: crypto.randomUUID(),
              filename: file.filename,
              content_type: file.contentType,
              size_bytes: files[index].size,
              dataUrl: `data:${file.contentType};base64,${file.content}`,
            })),
          },
          ...prev.filter((m) => m.id !== id),
        ]);
      } else {
        const result = await saveServerDraft(data, files, accounts);
        await load();
        if (result.warning) setError(result.warning);
      }
      await recovery.clear().catch(() => {
        setError(
          "Draft saved, but its device recovery copy could not be cleared.",
        );
      });
      setComposer(null);
      setFiles([]);
      setNotice("Draft saved.");
    } catch (e) {
      setError(errorText(e));
    } finally {
      sendingLock.current = false;
      setSending(false);
    }
  }
  async function discardComposer() {
    if (!composer || sendingLock.current) return;
    sendingLock.current = true;
    setSending(true);
    setError("");
    const id = composer.id;
    try {
      if (id && !demo) await removeDraft(id);
      await recovery.clear().catch(() => {
        setError(
          "Draft discarded, but its recovery copy could not be removed from device storage.",
        );
      });
      if (id) setMessages((previous) => previous.filter((m) => m.id !== id));
      setComposer(null);
      setFiles([]);
      setNotice("Draft discarded.");
    } catch (e) {
      setError(`Could not discard draft: ${errorText(e)}`);
    } finally {
      sendingLock.current = false;
      setSending(false);
    }
  }
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!composer || sendingLock.current || composer.deliveryUnconfirmed) return;
    if (composer.scheduledAt && Date.parse(composer.scheduledAt) < Date.now() + 60000) { setError("Schedule delivery at least one minute in the future."); return; }
    if (composer.text.length > 100000 || (composer.html?.length || 0) > 850000) { setError("This message is too large. Attach large images or documents as files."); return; }
    if (
      !validRecipients(composer.to) ||
      [composer.cc, composer.bcc].some((v) => v.trim() && !validRecipients(v))
    ) {
      setError("Enter valid email addresses, separated by commas.");
      return;
    }
    if (!accounts.some((a) => a.address === composer.fromAddress)) {
      setError("Choose an authorized sender account.");
      return;
    }
    const fileError = validateFiles(files);
    if (fileError) {
      setError(fileError);
      return;
    }
    sendingLock.current = true;
    setSending(true);
    setError("");
    let deliveryWarning = "";
    try {
      const formatted = composer.html ? inlineFiles(composer.html) : { html: undefined, inline: [] };
      const allFiles = [...files, ...formatted.inline.map(image => image.file)];
      const sizeError = validateFiles(allFiles); if (sizeError) throw new Error(sizeError);
      const attachments = (await encodeFiles(allFiles)).map((file, index) => ({ ...file, ...(index >= files.length ? { contentId: formatted.inline[index - files.length].contentId } : {}) }));
      if (demo) {
        const sent: Message = {
          id: crypto.randomUUID(),
          from_name: "Alex Morgan",
          from_address: composer.fromAddress,
          to_addresses: recipients(composer.to),
          cc_addresses: recipients(composer.cc),
          bcc_addresses: recipients(composer.bcc),
          thread_id: composer.thread_id,
          subject: composer.subject,
          text_body: composer.text,
          html_body: composer.html,
          scheduled_at: composer.scheduledAt || null,
          folder: composer.scheduledAt ? "scheduled" : "sent",
          direction: "outbound",
          is_read: true,
          is_starred: false,
          has_attachments: attachments.length > 0,
          created_at: new Date().toISOString(),
          attachments: attachments.map((a, i) => ({
            id: crypto.randomUUID(),
            filename: a.filename,
            size_bytes: allFiles[i].size,
            content_type: a.contentType,
            dataUrl: `data:${a.contentType};base64,${a.content}`,
          })),
        };
        setMessages((prev) => [
          sent,
          ...prev.filter((m) => m.id !== composer.id),
        ]);
        setFolder(composer.scheduledAt ? "scheduled" : "sent");
        setActive(sent.id);
        setQuery("");
      } else {
        const data = await invokeMail("send-mail", {
          ...composer, html: formatted.html, archive_html: composer.html ? sanitizeComposeHtml(composer.html) : undefined,
          to: recipients(composer.to), cc: recipients(composer.cc), bcc: recipients(composer.bcc),
          attachments, draft_id: composer.id || null,
        });
        deliveryWarning = typeof data?.warning === "string" ? data.warning : "";
        // A successful delivery must never be reported as failed by later refresh/draft cleanup.
        if (composer.id) {
          try { await removeDraft(composer.id); }
          catch { deliveryWarning = [deliveryWarning,
            "Email sent, but the old draft could not be removed. Refresh before sending again."].filter(Boolean).join(" "); }
        }
        attachmentCache.current.clear();
        await load();
        setFolder(composer.scheduledAt ? "scheduled" : "sent");
        setActive(null);
      }
      if (composer.event_id) {
        const event = workspace.data.events.find(event => event.id === composer.event_id);
        if (event) try { await workspace.save("events", { id: event.id, status: composer.event_method === "CANCEL" ? "cancelled" : "sent", sequence: composer.event_sequence ?? event.sequence }); }
        catch { deliveryWarning = [deliveryWarning, "The invitation was accepted, but its calendar status could not be saved. Do not resend it."].filter(Boolean).join(" "); }
      }
      await recovery.clear().catch(() => {
        deliveryWarning = [deliveryWarning,
          "Email sent, but the device recovery copy could not be removed. Discard it if it reappears."].filter(Boolean).join(" ");
      });
      if (deliveryWarning) setError(deliveryWarning);
      setComposer(null);
      setFiles([]);
      setUnreadOnly(false);
      setNotice(
        demo
          ? composer.scheduledAt ? "Demo message saved to Scheduled. No email will be delivered." : "Demo message saved to Sent. No email was delivered."
          : composer.scheduledAt ? "Email scheduled." : "Email sent.",
      );
    } catch (e) {
      if (e && typeof e === "object" && "deliveryUnconfirmed" in e && e.deliveryUnconfirmed) {
        setComposer(previous => previous ? { ...previous, deliveryUnconfirmed: true } : null);
        setError(errorText(e));
      } else setError(`Send failed: ${errorText(e)}`);
    } finally {
      sendingLock.current = false;
      setSending(false);
    }
  }

  function prepareInvitation(event: Entry, method: "REQUEST" | "CANCEL") {
    const address = accounts.find(a => a.id === event.organizer_account_id)?.address || ownAddress;
    const file = new globalThis.File([calendarText(event, address, method)], "invitation.ics", { type: `text/calendar; charset=utf-8; method=${method}` });
    newMessage({ fromAddress: address, to: (event.required_attendees || []).join(", "), cc: (event.optional_attendees || []).join(", "), subject: `${method === "CANCEL" ? "Cancelled: " : ""}${event.title}`,
      text: `${event.title}\n${new Date(event.start_at).toLocaleString()} – ${new Date(event.end_at).toLocaleString()} (${event.timezone})\n${[event.location, event.meeting_url, event.description].filter(Boolean).join("\n\n")}`,
      event_id: event.id, event_method: method, event_sequence: Number(event.sequence || 0),
    }, [file]);
  }
  async function applyFilters(force = false) {
    const candidates = messages.filter(m => m.direction === "inbound" && m.folder === "inbox" && (force || !rulesProcessed.current.has(m.id)));
    for (const original of candidates) {
      let updated = { ...original };
      const changes: Record<string, any> = {};
      const labelIds = new Set(workspace.data.links.filter(link => link.message_id === original.id).map(link => link.label_id));
      let labelsChanged = false;
      for (const rule of workspace.data.filters) {
        if (!matchesRule(updated, rule, accounts)) continue;
        const change = rulePatch(updated, rule);
        if (Object.keys(change).length) {
          if (!demo) { const result = await getSupabase().from("frankiflow_mail_messages").update({ ...change, updated_at: new Date().toISOString() }).eq("id", original.id); if (result.error) throw result.error; }
          updated = { ...updated, ...change };
          Object.assign(changes, change);
        }
        const label = rule.actions?.label_id;
        if (label && workspace.data.labels.some(l => l.id === label)) {
          if (!labelIds.has(label)) { labelIds.add(label); labelsChanged = true; }
        }
        if (rule.actions?.stop_processing) break;
      }
      if (labelsChanged) await workspace.setLabels(original.id, [...labelIds]);
      rulesProcessed.current.add(original.id);
      setMessages(previous => previous.map(m => m.id === original.id ? { ...m, ...changes } : m));
    }
  }
  useEffect(() => {
    if (!workspace.ready || !workspace.data.filters.length || !messages.length || busy) return;
    void applyFilters().catch(e => setError(`Could not apply filters: ${errorText(e)}`));
  }, [workspace.ready, workspace.data.filters, messages.length, busy]);
  useEffect(() => {
    const wake = async () => {
      const due = messages.filter(m => m.folder === "snoozed" && m.snoozed_until && Date.parse(m.snoozed_until) <= Date.now()).map(m => m.id);
      if (!due.length) return;
      if (!demo) { const result = await getSupabase().from("frankiflow_mail_messages").update({ folder: "inbox", snoozed_until: null }).in("id", due); if (result.error) { setError(errorText(result.error)); return; } }
      setMessages(previous => previous.map(m => due.includes(m.id) ? { ...m, folder: "inbox", snoozed_until: null } : m));
    };
    void wake(); const timer = setInterval(() => void wake(), 30000); return () => clearInterval(timer);
  }, [messages, demo]);
  useEffect(() => {
    if (!messages.length) return;
    const url = new URL(location.href), id = url.searchParams.get("message");
    if (!id) return;
    const target = messages.find(message => message.id === id);
    if (target) { setFolder(target.folder); setActive(target.id); }
    url.searchParams.delete("message"); history.replaceState({}, "", url.pathname + url.search + url.hash);
  }, [messages.length]);
  async function cancelSchedule() {
    if (!message || mutationLock.current) return;
    mutationLock.current = true; setMutationBusy(true); setError("");
    try {
      if (demo) setMessages(previous => previous.map(m => m.id === message.id ? { ...m, folder: "drafts", direction: "draft", scheduled_at: null } : m));
      else { const result = await invokeMail("mail-v2-actions", { action: "cancel-scheduled", message_id: message.id }); await load(); if (result.warning) setError(result.warning); }
      setActive(null); setFolder("drafts"); setNotice("Scheduled delivery canceled. The message is in Drafts.");
    } catch (e) { setError(errorText(e)); } finally { mutationLock.current = false; setMutationBusy(false); }
  }
  async function permanentDelete() {
    if (!message || mutationLock.current || !["trash", "spam"].includes(message.folder)) return;
    if (preferences.confirm_permanent_delete && !window.confirm("Permanently delete this message and its attachments?")) return;
    mutationLock.current = true; setMutationBusy(true);
    try {
      if (!demo) {
        const result = await getSupabase().from("frankiflow_mail_attachments").select("storage_path").eq("message_id", message.id); if (result.error) throw result.error;
        const paths = (result.data || []).map(file => file.storage_path);
        if (paths.length) { const removed = await getSupabase().storage.from(attachmentBucket).remove(paths); if (removed.error) throw removed.error; }
        const deleted = await getSupabase().from("frankiflow_mail_messages").delete().eq("id", message.id).eq("folder", message.folder); if (deleted.error) throw deleted.error;
      }
      setMessages(previous => previous.filter(m => m.id !== message.id)); setActive(null); setNotice("Message permanently deleted.");
    } catch (e) { setError(errorText(e)); } finally { mutationLock.current = false; setMutationBusy(false); }
  }

  if (!ready)
    return (
      <main className="loading-screen">
        <LoaderCircle className="spin" />
        <p>Opening your workspace…</p>
      </main>
    );
  if (!demo && !session) return <Login error={error} onError={setError} />;

  return (
    <div className={`workspace ${compact ? "compact" : ""}`}>
      {sidebar && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setSidebar(false)}
        />
      )}
      <aside className={`sidebar ${sidebar ? "visible" : ""}`}>
        <a className="brand" href={demo ? "/demo" : "/"}>
          <span className="brand-icon">
            <Mail size={23} strokeWidth={1.8} />
          </span>
          <span>
            FrankiFlow<span className="brand-sub">MAIL WORKSPACE</span>
          </span>
        </a>
        <button className="workspace-switch" onClick={() => setSettings(true)}>
          <span className="team-avatar">F</span>
          <span>
            <strong>FrankiFlow Team</strong>
            <small>{demo ? "Sample workspace" : "Company workspace"}</small>
          </span>
          <ChevronDown size={15} />
        </button>
        <button
          className="compose-button"
          disabled={!recovery.ready}
          onClick={() => newMessage()}
        >
          <Plus size={19} />
          New message<span>C</span>
        </button>
        <div className="nav-caption">WORKSPACE</div>
        <nav aria-label="Mail folders">
          {folders.map((item) => {
            const count = messages.filter((m) =>
              item.id === "inbox"
                ? m.folder === "inbox" && !m.is_read
                : item.id === "starred"
                  ? m.is_starred && !["trash", "spam"].includes(m.folder)
                  : item.id === "all" ? !["trash", "spam"].includes(m.folder) : m.folder === item.id,
            ).length;
            return (
              <button
                key={item.id}
                className={`nav-item ${folder === item.id ? "active" : ""}`}
                onClick={() => changeFolder(item.id)}
              >
                <item.icon size={18} />
                <span>{item.label}</span>
                {count > 0 && <span className="nav-count">{count}</span>}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-tools" aria-label="Workspace shortcuts">
          <button className="nav-item" onClick={() => setTools("contacts")}><ContactRound size={17} />Contacts</button>
          <button className="nav-item" onClick={() => setTools("events")}><CalendarDays size={17} />Calendar</button>
          <button className="nav-item" onClick={() => setTools("templates")}><FileText size={17} />Templates & tools</button>
          {workspace.data.labels.map(label => <button key={label.id} className={`nav-item ${selectedLabel === label.id ? "active" : ""}`} onClick={() => changeFolder(`label:${label.id}`)}><span className="label-dot" style={{ background: label.color }} />{label.name}</button>)}
          <button className="text-button sidebar-organize" onClick={() => setTools("labels")}>Manage labels & filters</button>
        </div>
        <div className="sidebar-note">
          <span className="eyebrow">A LITTLE MORE FOCUS</span>
          <p>
            Good conversations.
            <br />
            Less noise.
          </p>
          <span className="note-decoration">✳</span>
        </div>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => setSettings(true)}>
            <Settings size={18} />
            Settings
          </button>
          <a
            className="nav-item"
            href="https://github.com/dn-lx/frankiflow-mail"
            target="_blank"
            rel="noreferrer"
          >
            <CircleHelp size={18} />
            Help & feedback
            <ArrowUpRight size={14} />
          </a>
          <button className="profile" onClick={() => setSettings(true)}>
            <span className="avatar">
              {demo ? "AM" : initials(session?.user.email || "User")}
            </span>
            <span>
              <strong>
                {demo ? "Alex Morgan" : session?.user.email?.split("@")[0]}
              </strong>
              <small>{demo ? "alex@example.com" : session?.user.email}</small>
            </span>
            <MoreHorizontal size={18} />
          </button>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button menu-toggle"
              aria-label="Open navigation"
              onClick={() => setSidebar(true)}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{folderTitle}</strong>
          </div>
          <div className="top-actions">
            {demo && (
              <span className="demo-badge">
                <span />
                Demo workspace
              </span>
            )}
            <button
              className="icon-button"
              title="Toggle color theme"
              aria-label="Toggle color theme"
              onClick={() => { setDark(!dark); void workspace.savePreferences({ theme: dark ? "light" : "dark" }).catch(e => setError(errorText(e))); }}
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              className="icon-button"
              title="Settings"
              aria-label="Open settings"
              onClick={() => setSettings(true)}
            >
              <Settings size={18} />
            </button>
            <span className="top-avatar">
              {demo ? "AM" : initials(ownAddress || "User")}
            </span>
          </div>
        </header>
        <div className="mail-heading">
          <div>
            <div className="eyebrow">YOUR DAY, A LITTLE CLEARER</div>
            <h1>
              {folderTitle}
              <span>{visible.length}</span>
            </h1>
            <p>
              {folder === "inbox"
                ? "A little space for your next great conversation."
                : folder === "sent"
                  ? "Your conversations, delivered and kept together."
                  : "Everything in its right place."}
            </p>
          </div>
          <button
            className="secondary-button refresh-button"
            disabled={busy}
            onClick={() => {
              if (demo) setNotice("Sample mailbox is up to date.");
              else {
                attachmentCache.current.clear();
                void load();
              }
            }}
          >
            <CheckCheck size={16} />
            {busy ? "Refreshing…" : "Refresh mailbox"}
          </button>
        </div>
        {demo && (
          <div className="demo-note">
            <ShieldCheck size={15} />
            <span>
              Try it freely. This mailbox uses sample data and never sends real
              email.
            </span>
            <a href="/">
              Sign in to your mailbox
              <ArrowUpRight size={13} />
            </a>
          </div>
        )}
        {recovery.saved && !composer && (
          <div className="recovery-banner" role="status">
            <span className="recovery-icon">
              <PenLine size={18} />
            </span>
            <div>
              <strong>Your unsent draft is here</strong>
              <small>
                {recovery.saved.compose.subject || "Untitled message"}
                {recovery.saved.files.length
                  ? ` · ${recovery.saved.files.length} attachment${recovery.saved.files.length === 1 ? "" : "s"}`
                  : ""}{" "}
                · saved on this device
              </small>
            </div>
            <button className="secondary-button" onClick={resumeRecovery}>
              Resume draft
              <ArrowUpRight size={14} />
            </button>
          </div>
        )}
        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              <X size={16} />
            </button>
          </div>
        )}
        <section
          className={`mail-surface ${active ? "reading" : ""} ${preferences.preview_pane === "off" ? "preview-off" : ""}`}
          aria-label="Mail workspace"
        >
          <section className="message-list" aria-label="Message list">
            <div className="list-search">
              <Search size={18} />
              <input
                ref={searchRef}
                aria-label="Search mail"
                placeholder="Search your mail…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query ? (
                <button
                  className="icon-button"
                  aria-label="Clear search"
                  onClick={() => setQuery("")}
                >
                  <X size={16} />
                </button>
              ) : (
                <kbd>/</kbd>
              )}
              <button
                className={`icon-button ${unreadOnly ? "selected" : ""}`}
                aria-label="Filter unread messages"
                aria-pressed={unreadOnly}
                onClick={() => setUnreadOnly(!unreadOnly)}
              >
                <SlidersHorizontal size={17} />
              </button>
            </div>
            <div className="list-toolbar">
              <div className="list-tabs">
                <button
                  className={!unreadOnly ? "active" : ""}
                  onClick={() => setUnreadOnly(false)}
                >
                  All mail
                </button>
                <button
                  className={unreadOnly ? "active" : ""}
                  onClick={() => setUnreadOnly(true)}
                >
                  Unread
                  {messages.filter((m) => m.folder === folder && !m.is_read)
                    .length > 0 && (
                    <span>
                      {
                        messages.filter(
                          (m) => m.folder === folder && !m.is_read,
                        ).length
                      }
                    </span>
                  )}
                </button>
              </div>
              <span className="result-count">{visible.length} messages</span>
            </div>
            <div className="bulk-toolbar">
              <input
                type="checkbox"
                aria-label="Select all messages"
                checked={
                  visible.length > 0 && visible.every((m) => selected.has(m.id))
                }
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? new Set(visible.map((m) => m.id))
                      : new Set(),
                  )
                }
              />
              {selected.size ? (
                <>
                  <span>{selected.size} selected</span>
                  <button
                    className="icon-button"
                    aria-label="Archive selected"
                    disabled={mutationBusy}
                    onClick={() =>
                      void patch([...selected], { folder: "archive" })
                    }
                  >
                    <Archive size={16} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Delete selected"
                    disabled={mutationBusy}
                    onClick={() =>
                      void patch([...selected], { folder: "trash" })
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Mark selected as read"
                    disabled={mutationBusy}
                    onClick={() => void patch([...selected], { is_read: true })}
                  >
                    <CheckCheck size={16} />
                  </button>
                </>
              ) : (
                <span>
                  Newest first
                  <ChevronDown size={12} />
                </span>
              )}
            </div>
            <div className="message-rows">
              {busy && !messages.length ? (
                <div className="empty-state">
                  <LoaderCircle className="spin" />
                  <p>Loading your conversations…</p>
                </div>
              ) : visible.length ? (
                visible.map((m, i) => (
                  <article
                    key={m.id}
                    className={`message-row ${active === m.id ? "active" : ""} ${!m.is_read ? "unread" : ""}`}
                  >
                    <div className="row-leading">
                      <input
                        type="checkbox"
                        aria-label={`Select ${m.subject}`}
                        checked={selected.has(m.id)}
                        onChange={(e) =>
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(m.id);
                            else next.delete(m.id);
                            return next;
                          })
                        }
                      />
                      <button
                        className={`star-button ${m.is_starred ? "starred" : ""}`}
                        aria-label={`${m.is_starred ? "Unstar" : "Star"} ${m.subject}`}
                        disabled={mutationBusy}
                        aria-pressed={m.is_starred}
                        onClick={() =>
                          void patch([m.id], { is_starred: !m.is_starred })
                        }
                      >
                        <Star
                          size={15}
                          fill={m.is_starred ? "currentColor" : "none"}
                        />
                      </button>
                    </div>
                    <button
                      className="row-content"
                      onClick={() => void openMessage(m)}
                    >
                      <span className={`avatar tone-${i % 5}`}>
                        {initials(
                          m.direction === "outbound"
                            ? m.to_addresses.join(" ")
                            : m.from_name || m.from_address,
                        )}
                      </span>
                      <span className="message-text">
                        <span className="sender-line">
                          <strong>
                            {m.direction === "outbound"
                              ? `To: ${m.to_addresses.join(", ")}`
                              : m.from_name || m.from_address}
                          </strong>
                          <time>{date(m.created_at).split(",")[0]}</time>
                        </span>
                        <span className="subject-line">
                          {m.subject || "(No subject)"}
                          {(m.has_attachments ||
                            Boolean(m.attachments?.length)) && (
                            <Paperclip size={13} />
                          )}
                        </span>
                        {preferences.show_message_preview && <span className="message-preview">{m.preview || m.text_body}</span>}
                        <span className="message-labels">{m.is_pinned && <Pin size={11} aria-label="Pinned" />}{m.priority === "high" && <span className="priority-marker">Important</span>}{workspace.data.links.filter(link => link.message_id === m.id).map(link => { const label = workspace.data.labels.find(label => label.id === link.label_id); return label && <span key={label.id} className="message-label" style={{ borderColor: label.color }}>{label.name}</span>; })}</span>
                      </span>
                      {!m.is_read && <span className="unread-dot" />}
                    </button>
                  </article>
                ))
              ) : (
                <div className="empty-state">
                  <Inbox size={32} strokeWidth={1.2} />
                  <h3>
                    {query
                      ? "No matching conversations"
                      : "A little breathing room"}
                  </h3>
                  <p>
                    {query
                      ? "Try a different search or clear your filters."
                      : `There are no messages in ${folder} yet.`}
                  </p>
                  {query && (
                    <button
                      className="secondary-button"
                      onClick={() => {
                        setQuery("");
                        setUnreadOnly(false);
                      }}
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              )}
            </div>
            <footer className="list-footer">
              <span>
                {visible.length > 0
                  ? `1–${visible.length} of ${visible.length}`
                  : "0 conversations"}
              </span>
              <span>
                All caught up
                <Check size={13} />
              </span>
            </footer>
          </section>
          {message ? (
            <section className="reader" aria-label="Message reader">
              <div className="reader-toolbar">
                <button
                  className="icon-button"
                  aria-label="Close message"
                  onClick={() => setActive(null)}
                >
                  <ArrowLeft size={18} />
                </button>
                <span className="reader-tool-group">
                  <button
                    className="icon-button"
                    aria-label={
                      message.folder === "trash" || message.folder === "spam"
                        ? "Restore message to Inbox"
                        : "Archive message"
                    }
                    title={
                      message.folder === "trash" || message.folder === "spam"
                        ? "Restore to Inbox"
                        : "Archive"
                    }
                    disabled={mutationBusy}
                    onClick={() =>
                      void patch([message.id], {
                        folder:
                          message.folder === "trash" ||
                          message.folder === "spam"
                            ? "inbox"
                            : "archive",
                      })
                    }
                  >
                    {message.folder === "trash" || message.folder === "spam" ? (
                      <RotateCcw size={18} />
                    ) : (
                      <Archive size={18} />
                    )}
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Move message to trash"
                    disabled={mutationBusy}
                    title="Move to trash"
                    onClick={() =>
                      void patch([message.id], { folder: "trash" })
                    }
                  >
                    <Trash2 size={18} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Mark unread"
                    disabled={mutationBusy}
                    title="Mark unread"
                    onClick={() => {
                      void patch([message.id], { is_read: false }).then(
                        (ok) => {
                          if (ok) setActive(null);
                        },
                      );
                    }}
                  >
                    <Mail size={18} />
                  </button>
                  <button
                    className={`icon-button ${message.is_starred ? "starred" : ""}`}
                    aria-label="Toggle message star"
                    disabled={mutationBusy}
                    onClick={() =>
                      void patch([message.id], {
                        is_starred: !message.is_starred,
                      })
                    }
                  >
                    <Star
                      size={18}
                      fill={message.is_starred ? "currentColor" : "none"}
                    />
                  </button>
                </span>
                <div className="reader-pager">
                  <button
                    className="icon-button"
                    aria-label="Previous message"
                    disabled={visible.findIndex((m) => m.id === active) <= 0}
                    onClick={() =>
                      void openMessage(
                        visible[visible.findIndex((m) => m.id === active) - 1],
                      )
                    }
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Next message"
                    disabled={
                      visible.findIndex((m) => m.id === active) < 0 ||
                      visible.findIndex((m) => m.id === active) >=
                        visible.length - 1
                    }
                    onClick={() =>
                      void openMessage(
                        visible[visible.findIndex((m) => m.id === active) + 1],
                      )
                    }
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
              <div className="reader-scroll">
                <div className="reader-extra-tools">
                  <button className="text-button" onClick={() => setLabelPicker(!labelPicker)}><Tag size={14} />Labels</button>
                  <button className="text-button" onClick={() => setSnoozePicker(!snoozePicker)} disabled={message.folder === "scheduled"}><Clock size={14} />Snooze</button>
                  <button className="text-button" disabled={mutationBusy} onClick={() => void patch([message.id], { is_pinned: !message.is_pinned })}><Pin size={14} />{message.is_pinned ? "Unpin" : "Pin"}</button>
                  <button className="text-button" disabled={mutationBusy} onClick={() => void patch([message.id], { priority: message.priority === "high" ? "normal" : "high" })}>{message.priority === "high" ? "Remove importance" : "Mark important"}</button>
                  {message.folder !== "spam" && <button className="text-button" disabled={mutationBusy || message.folder === "scheduled"} onClick={() => void patch([message.id], { folder: "spam" })}>Report spam</button>}
                  {["trash", "spam"].includes(message.folder) && <button className="text-button" disabled={mutationBusy} onClick={() => void permanentDelete()}>Delete forever</button>}
                </div>
                {labelPicker && <div className="reader-picker" aria-label="Message labels">{workspace.data.labels.length ? workspace.data.labels.map(label => <label className="check-label" key={label.id}><input type="checkbox" checked={workspace.data.links.some(link => link.message_id === message.id && link.label_id === label.id)} disabled={mutationBusy} onChange={async event => { const old = workspace.data.links.filter(link => link.message_id === message.id).map(link => link.label_id); setMutationBusy(true); try { await workspace.setLabels(message.id, event.target.checked ? [...old, label.id] : old.filter(id => id !== label.id)); } catch (e) { setError(errorText(e)); } finally { setMutationBusy(false); } }} /><span className="label-dot" style={{ background: label.color }} />{label.name}</label>) : <p>Create a label in Workspace tools.</p>}<button className="text-button" onClick={() => setTools("labels")}>Manage labels</button></div>}
                {snoozePicker && <div className="reader-picker"><label>Return to Inbox<input aria-label="Snooze until" type="datetime-local" value={snoozeTime} onChange={event => setSnoozeTime(event.target.value)} /></label><button className="secondary-button" disabled={!snoozeTime || mutationBusy} onClick={async () => { if (new Date(snoozeTime).getTime() <= Date.now()) { setError("Choose a future snooze time."); return; } if (await patch([message.id], { folder: "snoozed", snoozed_until: new Date(snoozeTime).toISOString() })) setSnoozePicker(false); }}>Snooze message</button></div>}
                {message.folder === "scheduled" && <div className="scheduled-banner" role="status"><span>Scheduled for {message.scheduled_at ? date(message.scheduled_at) : "delivery"}. Cancel before editing.</span><button className="secondary-button" disabled={mutationBusy} onClick={() => void cancelSchedule()}>Cancel scheduled send</button></div>}
                <div className="reader-subject">
                  <span className="folder-tag">{folderTitle}</span>
                  <h2>{message.subject || "(No subject)"}</h2>
                </div>
                {(message.thread_id && preferences.conversation_view
                  ? messages
                      .filter(
                        (m) =>
                          m.thread_id === message.thread_id &&
                          m.folder !== "drafts" &&
                          (m.folder !== "trash" || folder === "trash") &&
                          (m.folder !== "spam" || folder === "spam"),
                      )
                      .sort(
                        (a, b) =>
                          Date.parse(a.created_at) - Date.parse(b.created_at),
                      )
                  : [message]
                ).map((item) => (
                  <div className="thread-message" key={item.id}>
                    <div className="sender-card">
                      <span className="avatar tone-0">
                        {initials(item.from_name || item.from_address)}
                      </span>
                      <div>
                        <strong>{item.from_name || item.from_address}</strong>
                        <small>
                          {item.from_address}
                          <br />
                          to {item.to_addresses.join(", ")}
                        </small>
                      </div>
                      <time>{date(item.created_at)}</time>
                    </div>
                    <EmailBody message={item} />
                    <Attachments
                      key={item.id}
                      message={item}
                      demo={demo}
                      cache={attachmentCache.current}
                    />
                  </div>
                ))}
                <div className="reply-prompt">
                  <span className="avatar small-avatar">
                    {demo ? "AM" : initials(ownAddress || "User")}
                  </span>
                  <button onClick={() => reply()}>
                    <PenLine size={16} />
                    Write a thoughtful reply…
                    <span>
                      Reply
                      <ArrowUpRight size={14} />
                    </span>
                  </button>
                </div>
                <div className="message-response-actions">
                  <button
                    className="secondary-button"
                    onClick={() => reply(true)}
                  >
                    <ReplyAll size={15} />
                    Reply all
                  </button>
                  <button
                    className="secondary-button"
                    disabled={forwarding}
                    onClick={() => void forward()}
                  >
                    {forwarding ? (
                      <LoaderCircle size={15} className="spin" />
                    ) : (
                      <ArrowUpRight size={15} />
                    )}
                    {forwarding
                      ? "Preparing files…"
                      : "Forward with attachments"}
                  </button>
                </div>
              </div>
            </section>
          ) : (
            <section className="reader reader-welcome">
              <div className="welcome-art">
                <div className="orbit orbit-one" />
                <div className="orbit orbit-two" />
                <span className="floating-spark">✳</span>
                <div className="envelope">
                  <Mail size={62} strokeWidth={1} />
                </div>
              </div>
              <span className="eyebrow">MADE FOR MEANINGFUL CONNECTIONS</span>
              <h2>
                Your next conversation
                <br />
                starts here.
              </h2>
              <p>
                Select a message to settle in.
                <br />
                Or make someone’s day with a new one.
              </p>
              <button className="secondary-button" onClick={() => newMessage()}>
                <PenLine size={16} />
                Start a conversation
                <ArrowUpRight size={15} />
              </button>
              <div className="welcome-shortcuts">
                <span>
                  <kbd>C</kbd>Compose
                </span>
                <span>
                  <kbd>/</kbd>Search
                </span>
              </div>
            </section>
          )}
        </section>
        <footer className="workspace-footer">
          <span>
            <span className="status-dot" />
            {demo
              ? "Demo · changes saved in this browser"
              : "Connected to your workspace"}
          </span>
          <span>
            Thoughtfully connected. <span className="footer-flower">✳</span>
          </span>
        </footer>
      </main>
      {notice && (
        <div className="toast" role="status">
          <Check size={17} />
          {notice}
          {undo && (
            <button
              className="undo-button"
              disabled={mutationBusy}
              onClick={() => void undoMove()}
            >
              <Undo2 size={14} />
              Undo
            </button>
          )}
          <button
            aria-label="Dismiss notification"
            onClick={() => {
              setNotice("");
              setUndo(null);
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}
      <datalist id="mail-contact-options">{workspace.data.contacts.map(contact => <option key={contact.id} value={contact.email}>{contact.display_name}</option>)}</datalist>
      {composer && (
        <div className="modal-backdrop" inert={Boolean(tools || assistant)}>
          <form
            className="composer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="compose-title"
            onSubmit={send}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.requestSubmit();
              }
            }}
          >
            <div className="composer-header">
              <div>
                <PenLine size={18} />
                <strong id="compose-title">
                  {composer.id ? "Edit draft" : "New message"}
                </strong>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="Close and save draft"
                disabled={sending}
                onClick={() => void saveDraft()}
              >
                <X size={19} />
              </button>
            </div>
            <fieldset className="composer-content" disabled={sending}>
              <div className="composer-fields">
                <label>
                  From
                  <select
                    aria-label="From"
                    value={composer.fromAddress}
                    onChange={(e) =>
                      setComposer({ ...composer, fromAddress: e.target.value })
                    }
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.address}>
                        {a.display_name || a.address} · {a.address}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  To
                  <input
                    aria-label="To"
                    autoFocus
                    required
                    placeholder="name@company.com"
                    list="mail-contact-options"
                    value={composer.to}
                    onChange={(e) =>
                      setComposer({ ...composer, to: e.target.value })
                    }
                  />
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setCcVisible(!ccVisible)}
                  >
                    Cc / Bcc
                  </button>
                </label>
                {ccVisible && (
                  <>
                    <label>
                      Cc
                      <input
                        aria-label="Cc"
                        value={composer.cc}
                        onChange={(e) =>
                          setComposer({ ...composer, cc: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Bcc
                      <input
                        aria-label="Bcc"
                        value={composer.bcc}
                        onChange={(e) =>
                          setComposer({ ...composer, bcc: e.target.value })
                        }
                      />
                    </label>
                  </>
                )}
                <label>
                  Subject
                  <input
                    aria-label="Subject"
                    placeholder="What’s on your mind?"
                    value={composer.subject}
                    onChange={(e) =>
                      setComposer({ ...composer, subject: e.target.value })
                    }
                  />
                </label>
              </div>
              <RichEditor key={composer.id || "compose"} textareaRef={bodyRef} text={composer.text} html={composer.html} disabled={sending} onChange={(text, html) => setComposer(previous => previous ? { ...previous, text, html } : null)} />
              {files.length > 0 && (
                <div className="compose-files">
                  {files.map((f, i) => (
                    <span key={`${f.name}-${i}`}>
                      <Paperclip size={14} />
                      {f.name}
                      <small>{formatBytes(f.size)}</small>
                      <button
                        type="button"
                        aria-label={`Remove ${f.name}`}
                        onClick={() =>
                          setFiles(files.filter((_, n) => n !== i))
                        }
                      >
                        <X size={14} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </fieldset>
            {composer.deliveryUnconfirmed && <div className="compose-error" role="alert">Check the provider delivery status before retrying. The original files are kept in a draft. <button type="button" className="text-button" onClick={() => { if (window.confirm("Have you confirmed this email was not delivered or scheduled?")) setComposer({ ...composer, deliveryUnconfirmed: false }); }}>I checked delivery; allow retry</button></div>}
            {(error || recovery.storageError) && (
              <div className="compose-error" role="alert">
                {error || recovery.storageError}
              </div>
            )}
            {insertMenu && <div className="composer-inserts">
              <label>Contact<select disabled={sending} aria-label="Insert contact" defaultValue="" onChange={event => { if (event.target.value) setComposer({ ...composer, to: recipients([composer.to, event.target.value]).join(", ") }); event.target.value = ""; }}><option value="">Choose contact…</option>{workspace.data.contacts.map(contact => <option key={contact.id} value={contact.email}>{contact.display_name || contact.email} · {contact.email}</option>)}</select></label>
              <label>Template (replaces message)<select disabled={sending} aria-label="Insert template" defaultValue="" onChange={event => { const template = workspace.data.templates.find(t => t.id === event.target.value); if (template) setComposer({ ...composer, subject: template.subject || composer.subject, text: template.text_body || htmlText(template.html_body || ""), html: template.html_body ? sanitizeComposeHtml(template.html_body) : undefined }); event.target.value = ""; }}><option value="">Choose template…</option>{workspace.data.templates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>
              <label>Saved signature<select disabled={sending} aria-label="Insert saved signature" defaultValue="" onChange={event => { const signature = workspace.data.signatures.find(t => t.id === event.target.value); if (signature) setComposer({ ...composer, text: `${composer.text}\n\n${htmlText(signature.html_body)}`, html: `${sanitizeComposeHtml(composer.html || plainHtml(composer.text))}<br><br>${sanitizeComposeHtml(signature.html_body)}` }); event.target.value = ""; }}><option value="">Choose signature…</option>{workspace.data.signatures.filter(signature => !signature.account_id || accounts.find(a => a.address === composer.fromAddress)?.id === signature.account_id).map(signature => <option key={signature.id} value={signature.id}>{signature.name}</option>)}</select></label>
            </div>}
            {scheduleVisible && <div className="schedule-entry"><label>Deliver at (your local time)<input disabled={sending} aria-label="Scheduled delivery time" type="datetime-local" value={composer.scheduledAt ? instantToLocal(composer.scheduledAt, Intl.DateTimeFormat().resolvedOptions().timeZone) : ""} onChange={event => setComposer({ ...composer, scheduledAt: event.target.value ? new Date(event.target.value).toISOString() : undefined })} /></label><button type="button" className="text-button" disabled={sending} onClick={() => { setComposer({ ...composer, scheduledAt: undefined }); setScheduleVisible(false); }}>Send immediately instead</button></div>}
            <div className="composer-footer">
              <button
                className="primary-button"
                type="submit"
                disabled={sending || !accounts.length || Boolean(composer.deliveryUnconfirmed)}
              >
                {sending ? (
                  <LoaderCircle size={16} className="spin" />
                ) : (
                  <Send size={16} />
                )}
                {sending ? "Sending…" : composer.scheduledAt ? demo ? "Schedule in demo" : "Schedule message" : demo ? "Send in demo" : "Send message"}
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Attach files"
                title="Attach files (8 MB each, 18 MB total)"
                disabled={sending}
                onClick={() => fileRef.current?.click()}
              >
                <Paperclip size={19} />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Insert signature"
                title={signature ? "Insert signature" : "Add a signature in Settings"}
                disabled={sending || !signature.trim()}
                onClick={() => {
                  if (composer.html) { setComposer({ ...composer, text: `${composer.text}\n\n${signature}`, html: `${sanitizeComposeHtml(composer.html)}<br><br>${plainHtml(signature)}` }); return; }
                  const field = bodyRef.current;
                  if (!field) return;
                  const start = field.selectionStart;
                  const end = field.selectionEnd;
                  const before = composer.text.slice(0, start);
                  const after = composer.text.slice(end);
                  const insert = `${before && !before.endsWith("\n\n") ? "\n\n" : ""}${signature}${after && !after.startsWith("\n") ? "\n\n" : ""}`;
                  setComposer({ ...composer, text: before + insert + after });
                  requestAnimationFrame(() => {
                    field.focus();
                    field.setSelectionRange(start + insert.length, start + insert.length);
                  });
                }}
              >
                <PenLine size={18} />
              </button>
              <button type="button" className="icon-button" aria-label="Insert saved content" title="Contacts, templates and signatures" disabled={sending} onClick={() => setInsertMenu(!insertMenu)}><FileText size={18} /></button>
              <button type="button" className="icon-button" aria-label="Writing assistant" disabled={sending || !preferences.ai_enabled} onClick={() => setAssistant(true)}><Sparkles size={18} /></button>
              <button type="button" className="icon-button" aria-label="Schedule delivery" disabled={sending} onClick={() => setScheduleVisible(!scheduleVisible)}><Clock size={18} /></button>
              <input
                type="file"
                multiple
                ref={fileRef}
                className="visually-hidden"
                onChange={(e) => {
                  addFiles(Array.from(e.target.files || []));
                  e.target.value = "";
                }}
              />
              <span className="composer-hint">
                <span aria-live="polite">
                  {recovery.status === "saved"
                    ? "Draft saved on this device"
                    : recovery.status === "saving"
                      ? "Saving draft…"
                      : "Ctrl / ⌘ + Enter to send"}
                </span>
              </span>
              <button
                type="button"
                className="icon-button"
                aria-label="Discard message"
                disabled={sending}
                onClick={() => void discardComposer()}
              >
                <Trash2 size={18} />
              </button>
            </div>
          </form>
        </div>
      )}
      {settings && (
        <div className="modal-backdrop" inert={Boolean(tools || assistant)}>
          <section
            className="settings-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
          >
            <header>
              <div>
                <span className="eyebrow">MAKE YOURSELF AT HOME</span>
                <h2 id="settings-title">Your workspace</h2>
              </div>
              <button
                className="icon-button"
                aria-label="Close settings"
                onClick={() => setSettings(false)}
              >
                <X size={20} />
              </button>
            </header>
            <div className="setting-row">
              <div>
                <strong>Dark appearance</strong>
                <p>A little easier on the eyes after hours.</p>
              </div>
              <button
                className={`toggle ${dark ? "on" : ""}`}
                role="switch"
                aria-checked={dark}
                aria-label="Dark appearance"
                onClick={() => { setDark(!dark); void workspace.savePreferences({ theme: dark ? "light" : "dark" }).catch(e => setError(errorText(e))); }}
              >
                <span />
              </button>
            </div>
            <div className="setting-row">
              <div>
                <strong>Compact message list</strong>
                <p>Make a little more room for your conversations.</p>
              </div>
              <button
                className={`toggle ${compact ? "on" : ""}`}
                role="switch"
                aria-checked={compact}
                aria-label="Compact message list"
                onClick={() => { setCompact(!compact); void workspace.savePreferences({ density: compact ? "comfortable" : "compact" }).catch(e => setError(errorText(e))); }}
              >
                <span />
              </button>
            </div>
            <div className="setting-row">
              <div>
                <strong>{demo ? "Sample mailbox" : "Signed-in account"}</strong>
                <p>
                  {demo
                    ? "Demo data is separate from real company mail."
                    : session?.user.email}
                </p>
              </div>
              <ShieldCheck size={22} />
            </div>
            {signatures.ready && accounts.length > 0 && (
              <SignatureSettings key={demo ? "demo" : session?.user.id} accounts={accounts} {...signatures} />
            )}
            {workspace.ready && <AdvancedSettings key={demo ? "demo" : session?.user.id} workspace={workspace} accounts={accounts} demo={demo} push={push} onAccounts={setAccounts} />}
            <div className="tools-actions settings-tools-links"><button className="secondary-button" onClick={() => { setSettings(false); setTools("signatures"); }}>Saved signatures</button><button className="secondary-button" onClick={() => { setSettings(false); setTools("filters"); }}>Labels, filters & templates</button></div>
            {demo ? (
              <button
                className="secondary-button"
                onClick={() => {
                  localStorage.removeItem("frankiflow-demo-tools-v2");
                  localStorage.removeItem("frankiflow-demo-account-names-v2");
                  setAccounts(demoAccounts);
                  rulesProcessed.current.clear();
                  void workspace.refresh();
                  setMessages(demoMessages());
                  setActive(null);
                  changeFolder("inbox");
                  setNotice("Sample mailbox reset.");
                  setSettings(false);
                }}
              >
                Reset sample mailbox
              </button>
            ) : (
              <button
                className="secondary-button"
                onClick={async () => {
                  try { await push.disable(); } catch { /* Local subscription is still invalidated before sign-out. */ }
                  const { error } = await getSupabase().auth.signOut();
                  if (error) setError(error.message);
                  else {
                    await recovery.clear().catch(() => {});
                    setMessages([]);
                    setAccounts([]);
                    setActive(null);
                    setComposer(null);
                    setSettings(false);
                    attachmentCache.current.clear();
                  }
                }}
              >
                <LogOut size={16} />
                Sign out
              </button>
            )}
            <p className="settings-footnote">
              FrankiFlow Mail v2 · Built with Next.js
              <br />
              {demo
                ? "No real emails are sent from this demo."
                : "Mail access is enforced by your workspace permissions."}
            </p>
          </section>
        </div>
      )}
      {tools && <WorkspaceTools workspace={workspace} accounts={accounts} initialTab={tools} onClose={() => setTools(null)} onCompose={seed => newMessage(seed)} onInvite={prepareInvitation} onApplyFilters={() => applyFilters(true)} />}
      {assistant && composer && <WritingAssistant composer={composer} preferences={preferences} demo={demo} onClose={() => setAssistant(false)} onApply={(text, html, subject) => setComposer(previous => previous ? { ...previous, text, html, subject } : null)} />}
    </div>
  );
}

function Login({
  error,
  onError,
}: {
  error: string;
  onError: (error: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <main className="login-screen">
      <div className="login-intro">
        <a href="/" className="brand">
          <span className="brand-icon">
            <Mail size={23} />
          </span>
          FrankiFlow
        </a>
        <span className="eyebrow">A CALMER WAY TO CONNECT</span>
        <h1>
          Good conversations.
          <br />A little more flow.
        </h1>
        <p>
          A thoughtful home for your team’s mail.
          <br />
          Everything you need, with room to breathe.
        </p>
        <div className="login-art">✳</div>
        <small>FrankiFlow Mail · Your team, thoughtfully connected.</small>
      </div>
      <div className="login-form-wrap">
        <form
          className="login-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            onError("");
            const data = new FormData(e.currentTarget);
            try {
              const { error } = await getSupabase().auth.signInWithPassword({
                email: String(data.get("email")).trim(),
                password: String(data.get("password")),
              });
              if (error) throw error;
            } catch (err) {
              onError(errorText(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <span className="eyebrow">YOUR WORKSPACE AWAITS</span>
          <h2>Welcome back.</h2>
          <p>Sign in to pick up the conversation.</p>
          <label>
            Email address
            <input
              name="email"
              type="email"
              autoComplete="username"
              placeholder="you@frankiflow.de"
              required
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Your password"
              required
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary-button" disabled={busy}>
            {busy ? (
              <LoaderCircle size={17} className="spin" />
            ) : (
              <ArrowUpRight size={17} />
            )}
            {busy ? "Signing in…" : "Sign in to your workspace"}
          </button>
          <div className="login-divider">
            <span />
            or take a look around
            <span />
          </div>
          <a className="secondary-button" href="/demo">
            Explore the sample mailbox
            <ArrowUpRight size={16} />
          </a>
          <small>
            <ShieldCheck size={14} />
            Your company mail always requires authentication.
          </small>
        </form>
      </div>
    </main>
  );
}

function EmailBody({ message }: { message: Message }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [showImages, setShowImages] = useState(false);
  // Sandbox without scripts or same-origin permission contains hostile email HTML.
  const csp = `default-src 'none'; img-src data: ${showImages ? "https:" : ""}; style-src 'unsafe-inline'; font-src 'none'; base-uri 'none'; form-action 'none'`;
  return message.html_body ? (
    <div className="email-html">
      <button
        className="text-button"
        onClick={() => setShowImages(!showImages)}
      >
        {showImages ? "Block external images" : "Load external images"}
      </button>
      <iframe
        ref={frame}
        title={`Email: ${message.subject}`}
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        srcDoc={`<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>body{font-family:Arial,sans-serif;font-size:14px;line-height:1.8;margin:14px;color:#203c40;overflow-wrap:anywhere}img,table{max-width:100%}a{color:#207269}</style></head><body>${message.html_body}</body></html>`}
      />
    </div>
  ) : (
    <div className="email-body">{message.text_body || "(Empty message)"}</div>
  );
}

function Attachments({
  message,
  demo,
  cache,
}: {
  message: Message;
  demo: boolean;
  cache: Map<string, Attachment[]>;
}) {
  const [items, setItems] = useState<Attachment[]>(
    message.attachments || cache.get(message.id) || [],
  );
  const [busy, setBusy] = useState(!demo);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    if (demo) {
      setItems(message.attachments || []);
      setBusy(false);
      return;
    }
    setBusy(true);
    setError("");
    getSupabase()
      .from("frankiflow_mail_attachments")
      .select("id,filename,content_type,size_bytes,storage_path")
      .eq("message_id", message.id)
      .order("created_at")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setError(error.message);
        else {
          cache.set(message.id, data || []);
          setItems(data || []);
        }
        setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [message.id, message.attachments, demo, cache, retry]);
  async function recover() {
    setBusy(true); setError("");
    try { await invokeMail("send-mail", { action: "repair-attachments", message_id: message.id }); cache.delete(message.id); setRetry(n => n + 1); }
    catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }
  async function download(item: Attachment) {
    setError("");
    try {
      let url = item.dataUrl;
      if (!demo) {
        if (!item.storage_path)
          throw new Error("The attachment storage path is missing.");
        const { data, error } = await getSupabase()
          .storage.from(attachmentBucket)
          .createSignedUrl(item.storage_path, 60, { download: item.filename });
        if (error) throw error;
        url = data.signedUrl;
      }
      if (!url) throw new Error("This attachment is unavailable.");
      if (demo && !url.startsWith("data:"))
        throw new Error("Invalid sample attachment.");
      const link = document.createElement("a");
      link.href = url;
      link.download = item.filename;
      link.rel = "noopener noreferrer";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (e) {
      setError(errorText(e));
    }
  }
  if (!items.length && !busy && !error && !message.has_attachments) return null;
  return (
    <section className="attachments" aria-label="Attachments">
      {busy ? (
        <p className="attachment-status">
          <LoaderCircle size={14} className="spin" />
          Loading attachments…
        </p>
      ) : (
        <>
          <h3>
            <Paperclip size={15} />
            {items.length} attachment{items.length === 1 ? "" : "s"}
          </h3>
          {!items.length && message.has_attachments && !error && (
            <p className="attachment-status">
              This message indicates attachments, but no stored files were
              returned. They may not have been saved by the mail service.
              {!demo && message.direction === "outbound" && <button className="text-button" onClick={() => void recover()}>Recover original attachments</button>}
              <button className="text-button" onClick={() => setRetry(n => n + 1)}>Retry attachments</button>
            </p>
          )}
          {items.map((item) => (
            <button
              className="attachment-card"
              key={item.id}
              onClick={() => void download(item)}
              aria-label={`Download ${item.filename}`}
            >
              <span className="file-icon">
                <File size={20} />
              </span>
              <span>
                <strong>{item.filename}</strong>
                <small>
                  {formatBytes(item.size_bytes)} ·{" "}
                  {item.filename.split(".").pop()?.toUpperCase()}
                </small>
              </span>
              <ArrowDownToLine size={17} />
            </button>
          ))}
        </>
      )}
      {error && (
        <p role="alert" className="form-error">
          Could not load attachment: {error}
          <button
            className="text-button"
            onClick={() => setRetry((n) => n + 1)}
          >
            Retry
          </button>
        </p>
      )}
    </section>
  );
}
