"use client";

import { useEffect, useMemo, useState } from "react";
import { Archive, CalendarDays, ChevronLeft, FileText, Inbox, LogOut, Mail, Menu, MoreHorizontal, Paperclip, PenLine, RefreshCw, Search, Send, Settings, Star, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Folder = "inbox"|"drafts"|"sent"|"archive"|"trash";
type Message = {
  id:string; thread_id:string|null; folder:string; direction:string; from_address:string; from_name:string|null;
  to_addresses:string[]; subject:string; text_body:string|null; html_body:string|null; preview:string|null;
  is_read:boolean; is_starred:boolean; created_at:string; sent_at:string|null; received_at:string|null;
};
type Account = {id:string;address:string;display_name:string;is_primary:boolean};

const folders:{key:Folder;label:string;icon:any}[] = [
  {key:"inbox",label:"Posteingang",icon:Inbox},
  {key:"drafts",label:"Entwürfe",icon:FileText},
  {key:"sent",label:"Gesendet",icon:Send},
  {key:"archive",label:"Archiv",icon:Archive},
  {key:"trash",label:"Papierkorb",icon:Trash2},
];

function strip(html:string|null){ return (html||"").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim(); }
function when(v:string|null){ if(!v) return ""; const d=new Date(v); return new Intl.DateTimeFormat("de-DE",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}).format(d); }

export default function MailApp(){
  const [session,setSession]=useState<any>(null);
  const [loading,setLoading]=useState(true);
  const [folder,setFolder]=useState<Folder>("inbox");
  const [messages,setMessages]=useState<Message[]>([]);
  const [selected,setSelected]=useState<Message|null>(null);
  const [query,setQuery]=useState("");
  const [sidebar,setSidebar]=useState(false);
  const [compose,setCompose]=useState(false);
  const [accounts,setAccounts]=useState<Account[]>([]);
  const [counts,setCounts]=useState<Record<string,number>>({});
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [authError,setAuthError]=useState("");

  useEffect(()=>{ supabase.auth.getSession().then(({data})=>{setSession(data.session);setLoading(false)});
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));
    return ()=>subscription.unsubscribe();
  },[]);

  async function load(){
    if(!session) return;
    setLoading(true);
    const [{data:m},{data:a}] = await Promise.all([
      supabase.from("frankiflow_mail_messages").select("id,thread_id,folder,direction,from_address,from_name,to_addresses,subject,text_body,html_body,preview,is_read,is_starred,created_at,sent_at,received_at").eq("folder",folder).order("created_at",{ascending:false}).limit(150),
      supabase.from("frankiflow_mail_accounts").select("id,address,display_name,is_primary").order("is_primary",{ascending:false})
    ]);
    setMessages((m||[]) as Message[]); setAccounts((a||[]) as Account[]);
    const {data:all}=await supabase.from("frankiflow_mail_messages").select("folder");
    const next:Record<string,number>={}; (all||[]).forEach((x:any)=>next[x.folder]=(next[x.folder]||0)+1); setCounts(next);
    setLoading(false);
  }
  useEffect(()=>{load()},[session,folder]);

  async function login(e:React.FormEvent){e.preventDefault();setAuthError("");const {error}=await supabase.auth.signInWithPassword({email,password});if(error)setAuthError(error.message)}
  async function logout(){await supabase.auth.signOut();setSelected(null)}
  const filtered=useMemo(()=>messages.filter(m=>!query||[m.from_name,m.from_address,m.subject,m.preview,m.text_body].join(" ").toLowerCase().includes(query.toLowerCase())),[messages,query]);

  if(loading&&!session) return <div className="center"><div className="spinner"/></div>;
  if(!session) return <div className="login-shell"><div className="login-panel"><div className="brand-lockup"><div className="brand-glyph">F</div><div><strong>FrankiFlow</strong><span>Mail</span></div></div><div className="login-copy"><p className="eyebrow">INTERNAL WORKSPACE</p><h1>Dein Postfach.<br/>Ruhiger. Klarer.</h1><p>Ein fokussierter Arbeitsbereich für Kundenkommunikation, Buchungen und das FrankiFlow Team.</p></div><form onSubmit={login} className="login-form"><label>E-Mail<input value={email} onChange={e=>setEmail(e.target.value)} type="email" required placeholder="name@frankiflow.de"/></label><label>Passwort<input value={password} onChange={e=>setPassword(e.target.value)} type="password" required/></label>{authError&&<p className="error">{authError}</p>}<button className="primary" type="submit">Anmelden</button></form></div></div>;

  return <main className="app-shell">
    <aside className={"sidebar "+(sidebar?"open":"")}>
      <div className="side-head"><div className="brand-lockup small"><div className="brand-glyph">F</div><div><strong>FrankiFlow</strong><span>Mail</span></div></div><button className="icon mobile" onClick={()=>setSidebar(false)}><X/></button></div>
      <button className="compose" onClick={()=>{setCompose(true);setSidebar(false)}}><PenLine/>Neue Nachricht</button>
      <nav>{folders.map(f=>{const I=f.icon;return <button key={f.key} className={folder===f.key?"active":""} onClick={()=>{setFolder(f.key);setSelected(null);setSidebar(false)}}><I/><span>{f.label}</span>{counts[f.key]?<b>{counts[f.key]}</b>:null}</button>})}</nav>
      <div className="side-section"><p>KATEGORIEN</p><button><span className="dot clients"/>Kunden</button><button><span className="dot bookings"/>Buchungen</button><button><span className="dot finance"/>Finanzen</button></div>
      <div className="side-foot"><button><Settings/>Einstellungen</button><button onClick={logout}><LogOut/>Abmelden</button></div>
    </aside>

    <section className={"mail-column "+(selected?"has-reader":"")}>
      <header className="topbar"><button className="icon mobile" onClick={()=>setSidebar(true)}><Menu/></button><div className="search"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="E-Mails durchsuchen"/><kbd>⌘ K</kbd></div><button className="icon" onClick={load} aria-label="Aktualisieren"><RefreshCw/></button><div className="avatar">{session.user.email?.slice(0,1).toUpperCase()}</div></header>
      <div className="list-head"><div><p className="eyebrow">MAILBOX</p><h2>{folders.find(f=>f.key===folder)?.label}</h2></div><span>{filtered.length} Nachrichten</span></div>
      <div className="message-list">
        {loading?<div className="empty"><div className="spinner"/></div>:filtered.length===0?<div className="empty"><Mail/><h3>Hier ist es ruhig.</h3><p>{folder==="drafts"?"Noch keine Entwürfe. Gespeicherte Entwürfe erscheinen hier automatisch.":"Keine Nachrichten in diesem Bereich."}</p></div>:
        filtered.map(m=><button className={"message-row "+(!m.is_read?"unread ":"")+(selected?.id===m.id?"selected":"")} key={m.id} onClick={()=>setSelected(m)}>
          <div className="sender-avatar">{(m.direction==="draft"?"E":(m.from_name||m.from_address||"?").slice(0,1)).toUpperCase()}</div>
          <div className="row-main"><div className="row-top"><strong>{m.direction==="draft"?"Entwurf":m.from_name||m.from_address}</strong><time>{when(m.received_at||m.sent_at||m.created_at)}</time></div><div className="row-subject">{m.subject||"(Kein Betreff)"}</div><p>{m.direction==="draft"?"An: "+m.to_addresses.join(", "):m.preview||strip(m.html_body)||m.text_body}</p></div>
          {m.is_starred&&<Star className="star"/>}
        </button>)}
      </div>
    </section>

    <section className={"reader "+(selected?"visible":"")}>
      {selected?<><header className="reader-tools"><button className="icon mobile" onClick={()=>setSelected(null)}><ChevronLeft/></button><div className="spacer"/><button className="icon"><Archive/></button><button className="icon"><Trash2/></button><button className="icon"><MoreHorizontal/></button></header>
        <article className="reader-content"><p className="eyebrow">{selected.direction==="draft"?"ENTWURF":"KONVERSATION"}</p><h1>{selected.subject||"(Kein Betreff)"}</h1><div className="message-card"><div className="message-meta"><div className="sender-avatar large">{(selected.from_name||selected.from_address).slice(0,1).toUpperCase()}</div><div><strong>{selected.direction==="draft"?"FrankiFlow Entwurf":selected.from_name||selected.from_address}</strong><p>{selected.direction==="draft"?"An "+selected.to_addresses.join(", "):selected.from_address}</p></div><time>{when(selected.received_at||selected.sent_at||selected.created_at)}</time></div><div className="message-body" dangerouslySetInnerHTML={{__html:selected.html_body||("<p>"+(selected.text_body||"").replace(/\n/g,"<br/>")+"</p>")}}/></div>
        {selected.direction==="draft"?<button className="primary edit-draft" onClick={()=>setCompose(true)}><PenLine/>Entwurf bearbeiten</button>:<button className="reply">Antworten…</button>}
        </article></>:<div className="reader-empty"><div className="reader-mark"><Mail/></div><h3>Nachricht auswählen</h3><p>Öffne eine Konversation, um sie hier zu lesen.</p></div>}
    </section>
    {compose&&<Composer accounts={accounts} draft={selected?.direction==="draft"?selected:null} onClose={()=>setCompose(false)} onSaved={()=>{setCompose(false);setFolder("drafts");setSelected(null);load()}}/>}
  </main>
}

function Composer({accounts,draft,onClose,onSaved}:{accounts:Account[];draft:Message|null;onClose:()=>void;onSaved:()=>void}){
  const primary=accounts.find(a=>a.is_primary)||accounts[0];
  const [to,setTo]=useState(draft?.to_addresses.join(", ")||"");
  const [subject,setSubject]=useState(draft?.subject||"");
  const [body,setBody]=useState(draft?.html_body||"");
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState(draft?"Entwurf geöffnet":"Nicht gespeichert");

  async function save(){
    if(!primary)return; setBusy(true);
    const payload={account_id:primary.id,direction:"draft",folder:"drafts",from_address:primary.address,from_name:primary.display_name,to_addresses:to.split(",").map(x=>x.trim()).filter(Boolean),cc_addresses:[],bcc_addresses:[],reply_to:primary.address,subject,text_body:strip(body),html_body:body,preview:strip(body).slice(0,180),is_read:true,has_attachments:false};
    const result=draft?await supabase.from("frankiflow_mail_messages").update(payload).eq("id",draft.id):await supabase.from("frankiflow_mail_messages").insert(payload);
    setBusy(false); if(!result.error){setStatus("Gespeichert");onSaved()} else setStatus(result.error.message);
  }
  async function send(){
    if(!primary||!to.trim())return;setBusy(true);
    const {error}=await supabase.functions.invoke("send-mail",{body:{fromAddress:primary.address,to:to.split(",").map(x=>x.trim()).filter(Boolean),subject,text:strip(body),html:body}});
    if(!error){if(draft)await supabase.from("frankiflow_mail_messages").delete().eq("id",draft.id);onSaved()}else{setStatus(error.message);setBusy(false)}
  }
  return <div className="compose-backdrop"><section className="composer"><header><div><span>{draft?"Entwurf bearbeiten":"Neue Nachricht"}</span><small>{status}</small></div><button className="icon invert" onClick={onClose}><X/></button></header><div className="fields"><label>Von<select defaultValue={primary?.address}>{accounts.map(a=><option key={a.id}>{a.address}</option>)}</select></label><label>An<input value={to} onChange={e=>setTo(e.target.value)} placeholder="empfänger@firma.de"/></label><label>Betreff<input value={subject} onChange={e=>setSubject(e.target.value)} placeholder="Betreff"/></label></div><div className="formatbar"><button><strong>B</strong></button><button><em>I</em></button><button><Paperclip/></button><span>Rich text</span></div><div className="editor" contentEditable suppressContentEditableWarning dangerouslySetInnerHTML={{__html:body}} onInput={e=>setBody(e.currentTarget.innerHTML)}/><footer><button className="ghost" onClick={save} disabled={busy}>Als Entwurf speichern</button><div className="spacer"/><button className="primary" onClick={send} disabled={busy||!to.trim()}><Send/>{busy?"Bitte warten…":"Senden"}</button></footer></section></div>
}
