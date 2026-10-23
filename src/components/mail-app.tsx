"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  Archive,
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
import { demoAccounts, demoMessages } from "@/lib/demo";
import {
  filterMessages,
  formatBytes,
  recipients,
  replyTargets,
  validRecipients,
  validateFiles,
} from "@/lib/mail-utils.mjs";
import type { Account, Attachment, Compose, Message } from "@/lib/types";

const folders = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "starred", label: "Starred", icon: Star },
  { id: "sent", label: "Sent", icon: Send },
  { id: "drafts", label: "Drafts", icon: File },
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

export default function MailApp({ demo = false }: { demo?: boolean }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(demo);
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
  const visible: Message[] = filterMessages(
    messages,
    folder,
    query,
    unreadOnly,
  );
  const ownAddress = accounts[0]?.address || "";

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
    if (!composer && !settings) return;
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
  }, [Boolean(composer), settings]);

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
        () => {
          attachmentCache.current.clear();
          void load();
        },
      )
      .subscribe();
    return () => {
      void getSupabase().removeChannel(channel);
    };
  }, [session, demo, load]);
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
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  function newMessage(seed: Partial<Compose> = {}) {
    setFiles([]);
    setCcVisible(Boolean(seed.cc || seed.bcc));
    setComposer({
      to: "",
      cc: "",
      bcc: "",
      subject: "",
      text: "",
      fromAddress: accounts.find((a) => a.is_primary)?.address || ownAddress,
      ...seed,
    });
    setError("");
  }
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key === "Escape") {
        setSettings(false);
        setSidebar(false);
        return;
      }
      if (
        target.closest("input,textarea,select,[contenteditable]") ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        composer ||
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
    setError("");
    try {
      if (!demo) {
        const { error } = await getSupabase()
          .from("frankiflow_mail_messages")
          .update({
            ...updates,
            ...(updates.folder === "trash"
              ? { trashed_at: new Date().toISOString() }
              : {}),
            updated_at: new Date().toISOString(),
          })
          .in("id", ids);
        if (error) throw error;
      }
      setMessages((previous) =>
        previous.map((m) => (ids.includes(m.id) ? { ...m, ...updates } : m)),
      );
      setSelected(new Set());
      if (updates.folder) {
        setActive(null);
        setNotice(`Moved to ${updates.folder}.`);
      }
    } catch (e) {
      setError(errorText(e));
    }
  }
  async function openMessage(m: Message) {
    if (m.folder === "drafts") {
      newMessage({
        id: m.id,
        to: m.to_addresses.join(", "),
        cc: m.cc_addresses?.join(", ") || "",
        subject: m.subject,
        text: m.text_body,
        fromAddress: m.from_address,
      });
      return;
    }
    setActive(m.id);
    if (!m.is_read) void patch([m.id], { is_read: true });
  }
  function changeFolder(id: string) {
    setFolder(id);
    setActive(null);
    setQuery("");
    setUnreadOnly(false);
    setSelected(new Set());
    setSidebar(false);
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
    if (!composer) return;
    const data = composer;
    if (!data.to && !data.subject && !data.text && !files.length) {
      setComposer(null);
      return;
    }
    if (files.length) {
      setError(
        "Attachments stay in the open composer. Send them or remove them before saving this text draft.",
      );
      return;
    }
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
        html_body: "",
        preview: data.text.slice(0, 180),
        is_read: true,
        updated_at: new Date().toISOString(),
      };
      if (demo) {
        const id = data.id || crypto.randomUUID();
        setMessages((prev) => [
          {
            ...row,
            id,
            from_name: "Alex Morgan",
            is_starred: false,
            has_attachments: false,
            created_at: new Date().toISOString(),
            attachments: [],
          },
          ...prev.filter((m) => m.id !== id),
        ]);
      } else {
        const result = data.id
          ? await getSupabase()
              .from("frankiflow_mail_messages")
              .update(row)
              .eq("id", data.id)
          : await getSupabase().from("frankiflow_mail_messages").insert(row);
        if (result.error) throw result.error;
        await load();
      }
      setComposer(null);
      setNotice("Draft saved.");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSending(false);
    }
  }
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!composer || sending) return;
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
    setSending(true);
    setError("");
    try {
      const attachments = await Promise.all(
        files.map(async (file) => {
          const bytes = new Uint8Array(await file.arrayBuffer());
          let binary = "";
          for (let i = 0; i < bytes.length; i += 32768)
            binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
          return {
            filename: file.name,
            content: btoa(binary),
            contentType: file.type || "application/octet-stream",
          };
        }),
      );
      if (demo) {
        const sent: Message = {
          id: crypto.randomUUID(),
          from_name: "Alex Morgan",
          from_address: composer.fromAddress,
          to_addresses: recipients(composer.to),
          cc_addresses: recipients(composer.cc),
          subject: composer.subject,
          text_body: composer.text,
          folder: "sent",
          direction: "outbound",
          is_read: true,
          is_starred: false,
          has_attachments: attachments.length > 0,
          created_at: new Date().toISOString(),
          attachments: attachments.map((a, i) => ({
            id: crypto.randomUUID(),
            filename: a.filename,
            size_bytes: files[i].size,
            content_type: a.contentType,
            dataUrl: `data:${a.contentType};base64,${a.content}`,
          })),
        };
        setMessages((prev) => [
          sent,
          ...prev.filter((m) => m.id !== composer.id),
        ]);
        setFolder("sent");
        setActive(sent.id);
        setQuery("");
      } else {
        const { data, error } = await getSupabase().functions.invoke(
          "send-mail",
          {
            body: {
              ...composer,
              to: recipients(composer.to),
              cc: recipients(composer.cc),
              bcc: recipients(composer.bcc),
              attachments,
              draft_id: composer.id || null,
            },
          },
        );
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        // A successful delivery must never be reported as failed by later refresh/draft cleanup.
        if (composer.id) {
          const cleanup = await getSupabase()
            .from("frankiflow_mail_messages")
            .delete()
            .eq("id", composer.id)
            .eq("folder", "drafts");
          if (cleanup.error)
            setError(
              "Email sent, but the old draft could not be removed. Refresh before sending again.",
            );
        }
        attachmentCache.current.clear();
        await load();
        setFolder("sent");
        setActive(null);
      }
      setComposer(null);
      setFiles([]);
      setNotice(
        demo
          ? "Demo message saved to Sent. No email was delivered."
          : "Email sent.",
      );
    } catch (e) {
      setError(`Send failed: ${errorText(e)}`);
    } finally {
      setSending(false);
    }
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
        <button className="compose-button" onClick={() => newMessage()}>
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
                  : m.folder === item.id,
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
            <strong>{folders.find((f) => f.id === folder)?.label}</strong>
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
              onClick={() => setDark(!dark)}
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
              {folders.find((f) => f.id === folder)?.label}
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
        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              <X size={16} />
            </button>
          </div>
        )}
        <section
          className={`mail-surface ${active ? "reading" : ""}`}
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
                    onClick={() =>
                      void patch([...selected], { folder: "archive" })
                    }
                  >
                    <Archive size={16} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Delete selected"
                    onClick={() =>
                      void patch([...selected], { folder: "trash" })
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Mark selected as read"
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
                        <span className="message-preview">
                          {m.preview || m.text_body}
                        </span>
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
                    aria-label="Archive message"
                    title="Archive"
                    onClick={() =>
                      void patch([message.id], { folder: "archive" })
                    }
                  >
                    <Archive size={18} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Move message to trash"
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
                    title="Mark unread"
                    onClick={() => {
                      void patch([message.id], { is_read: false });
                      setActive(null);
                    }}
                  >
                    <Mail size={18} />
                  </button>
                  <button
                    className={`icon-button ${message.is_starred ? "starred" : ""}`}
                    aria-label="Toggle message star"
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
                <div className="reader-subject">
                  <span className="folder-tag">{folder}</span>
                  <h2>{message.subject || "(No subject)"}</h2>
                </div>
                {(message.thread_id
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
                  <button
                    onClick={() =>
                      newMessage({
                        to: replyTargets(message, accounts).join(", "),
                        subject: /^re:/i.test(message.subject)
                          ? message.subject
                          : `Re: ${message.subject}`,
                        thread_id: message.thread_id,
                      })
                    }
                  >
                    <PenLine size={16} />
                    Write a thoughtful reply…
                    <span>
                      Reply
                      <ArrowUpRight size={14} />
                    </span>
                  </button>
                </div>
                <button
                  className="text-button"
                  onClick={() =>
                    newMessage({
                      subject: `Fwd: ${message.subject}`,
                      text: `\n\n---------- Forwarded message ----------\nFrom: ${message.from_address}\nSubject: ${message.subject}\n\n${message.text_body}`,
                    })
                  }
                >
                  Forward message
                  <ArrowUpRight size={13} />
                </button>
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
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {composer && (
        <div className="modal-backdrop">
          <form
            className="composer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="compose-title"
            onSubmit={send}
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
            <textarea
              aria-label="Message body"
              className="compose-body"
              placeholder="A good conversation starts with a hello…"
              value={composer.text}
              onChange={(e) =>
                setComposer({ ...composer, text: e.target.value })
              }
            />
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
                      onClick={() => setFiles(files.filter((_, n) => n !== i))}
                    >
                      <X size={14} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {error && (
              <div className="compose-error" role="alert">
                {error}
              </div>
            )}
            <div className="composer-footer">
              <button
                className="primary-button"
                type="submit"
                disabled={sending || !accounts.length}
              >
                {sending ? (
                  <LoaderCircle size={16} className="spin" />
                ) : (
                  <Send size={16} />
                )}
                {sending ? "Sending…" : demo ? "Send in demo" : "Send message"}
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
                {demo
                  ? "Sample mailbox only"
                  : "Securely sent through your workspace"}
              </span>
              <button
                type="button"
                className="icon-button"
                aria-label="Discard message"
                disabled={sending}
                onClick={() => {
                  setComposer(null);
                  setFiles([]);
                  setError("");
                }}
              >
                <Trash2 size={18} />
              </button>
            </div>
          </form>
        </div>
      )}
      {settings && (
        <div className="modal-backdrop">
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
                onClick={() => setDark(!dark)}
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
                onClick={() => setCompact(!compact)}
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
            {demo ? (
              <button
                className="secondary-button"
                onClick={() => {
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
                  const { error } = await getSupabase().auth.signOut();
                  if (error) setError(error.message);
                  else {
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
