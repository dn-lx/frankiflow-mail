"use client";
import { useEffect, useRef, useState } from "react";
import { Bold, Italic, List, ListOrdered, Link, Underline, ImagePlus } from "lucide-react";
import { htmlText, plainHtml, sanitizeComposeHtml } from "@/lib/rich-text";
export function RichEditor({ text, html, onChange, disabled = false, label = "Message body", textareaRef }: {
  text: string; html?: string; onChange: (text: string, html?: string) => void; disabled?: boolean; label?: string;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const [rich, setRich] = useState(Boolean(html));
  const [link, setLink] = useState(""); const [linkOpen, setLinkOpen] = useState(false);
  const editor = useRef<HTMLDivElement>(null), image = useRef<HTMLInputElement>(null), selection = useRef<Range | null>(null);
  useEffect(() => {
    if (html) setRich(true);
  }, [html]);
  useEffect(() => {
    if (rich && editor.current && document.activeElement !== editor.current) editor.current.innerHTML = sanitizeComposeHtml(html || plainHtml(text));
  }, [html, text, rich]);
  function saveSelection() { const s = window.getSelection(); if (s?.rangeCount && editor.current?.contains(s.anchorNode)) selection.current = s.getRangeAt(0).cloneRange(); }
  function restoreSelection() { editor.current?.focus(); const s = window.getSelection(); if (selection.current && s) { s.removeAllRanges(); s.addRange(selection.current); } }
  function emit() { const value = sanitizeComposeHtml(editor.current?.innerHTML || ""); onChange(htmlText(value), value); saveSelection(); }
  function command(name: string, value?: string) { restoreSelection(); document.execCommand(name, false, value); emit(); }
  return <div className="rich-editor">
    <div className="format-toolbar">
      <button type="button" className="text-button" aria-pressed={rich} disabled={disabled} onClick={() => { setRich(!rich); if (!rich) onChange(text, sanitizeComposeHtml(html || plainHtml(text))); else onChange(text, undefined); }}>{rich ? "Plain text" : "Rich text"}</button>
      {rich && <>
        {[["bold", Bold, "Bold"], ["italic", Italic, "Italic"], ["underline", Underline, "Underline"], ["insertUnorderedList", List, "Bullet list"], ["insertOrderedList", ListOrdered, "Numbered list"]].map(([cmd, Icon, title]) => { const Glyph = Icon as typeof Bold; return <button key={cmd as string} type="button" className="icon-button" aria-label={title as string} title={title as string} disabled={disabled} onMouseDown={event => event.preventDefault()} onClick={() => command(cmd as string)}><Glyph size={15} /></button>; })}
        <button type="button" className="icon-button" aria-label="Insert link" disabled={disabled} onMouseDown={saveSelection} onClick={() => setLinkOpen(!linkOpen)}><Link size={15} /></button>
        <button type="button" className="icon-button" aria-label="Insert image" disabled={disabled} onMouseDown={saveSelection} onClick={() => image.current?.click()}><ImagePlus size={15} /></button>
      </>}
    </div>
    {linkOpen && <div className="link-entry"><input aria-label="Link URL" type="url" placeholder="https://example.com" value={link} onChange={e => setLink(e.target.value)} /><button type="button" className="secondary-button" disabled={!/^https?:\/\//i.test(link)} onClick={() => { command("createLink", link); setLinkOpen(false); setLink(""); }}>Add link</button></div>}
    {rich ? <div ref={editor} contentEditable={!disabled} suppressContentEditableWarning role="textbox" aria-label={label === "Message body" ? "Rich message body" : label} aria-multiline="true" className="compose-body rich-body" onInput={emit} onKeyUp={saveSelection} onMouseUp={saveSelection} onPaste={event => {
      event.preventDefault(); const content = event.clipboardData.getData("text/html"); command("insertHTML", sanitizeComposeHtml(content || plainHtml(event.clipboardData.getData("text/plain"))));
    }} /> : <textarea ref={textareaRef} aria-label={label} className="compose-body" disabled={disabled} placeholder="A good conversation starts with a hello…" value={text} onChange={event => onChange(event.target.value)} />}
    <input ref={image} type={rich ? "file" : "hidden"} accept="image/png,image/jpeg,image/gif,image/webp" className="visually-hidden" aria-label="Inline image file" onChange={async event => {
      const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
      if (file.size > 512 * 1024) { window.alert("Inline images must be 512 KB or smaller. Attach larger images as files."); return; }
      const destination = editor.current;
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!destination?.isConnected || editor.current !== destination) return;
      let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte);
      command("insertHTML", `<img src="data:${file.type};base64,${btoa(binary)}" alt="${file.name.replace(/["<>]/g, "")}" style="max-width:100%">`);
    }} />
  </div>;
}
