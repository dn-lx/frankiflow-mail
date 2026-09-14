from pathlib import Path

APP = Path('assets/app.js')
ENH = Path('assets/enhancements.js')
SW = Path('sw.js')

app = APP.read_text(encoding='utf-8')
enh = ENH.read_text(encoding='utf-8')
sw = SW.read_text(encoding='utf-8')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, found {count}')
    return text.replace(old, new, 1)


# 1) Drafts must never render as conversation messages. This removes the
# empty/ghost thread card that appeared after opening and closing a reply composer.
old_thread = "function threadFor(m){if(state.settings?.conversation_view===false)return[m].filter(Boolean);return m?.thread_id?state.messages.filter(x=>x.thread_id===m.thread_id).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at)):[m].filter(Boolean);}"
new_thread = """function threadFor(m){
  if(state.settings?.conversation_view===false)return[m].filter(Boolean);
  if(!m?.thread_id)return[m].filter(Boolean);
  const visible=state.messages.filter(x=>x.thread_id===m.thread_id&&x.folder!=='drafts'&&x.direction!=='draft').sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
  return visible.length?visible:[m].filter(Boolean);
}"""
app = replace_once(app, old_thread, new_thread, 'thread draft filtering')

# 2) Closing an untouched reply composer should not manufacture an empty draft.
old_close = "async function closeComposer(){if(!state.composer)return;clearTimeout(state.composer.saveTimer);const d=composerData();if(!state.composer.draftId&&!composerHasMeaningfulContent(d)){state.composer.el.remove();state.composer=null;return;}await saveDraft();state.composer?.el.remove();state.composer=null;}"
new_close = """function composerBodyHasMeaningfulContent(){
  const editor=state.composer?.el?.querySelector('#cEditor');if(!editor)return false;
  const clone=editor.cloneNode(true);
  clone.querySelectorAll('.signature[data-ff-signature],[data-ff-meeting]').forEach(x=>x.remove());
  return Boolean(stripHtml(clone.innerHTML).trim()||clone.querySelector('img'));
}
async function closeComposer(){
  if(!state.composer)return;
  clearTimeout(state.composer.saveTimer);
  const d=composerData();
  const replyContext=Boolean(state.composer.seed?.thread_id||state.composer.seed?.in_reply_to);
  const hasReplyContent=composerBodyHasMeaningfulContent()||Boolean(state.composer.files?.length)||Boolean(state.composer.meeting);
  if(replyContext&&!hasReplyContent){
    const draftId=state.composer.draftId;
    if(draftId)await supabase.from('frankiflow_mail_messages').delete().eq('id',draftId);
    state.composer.el.remove();state.composer=null;
    if(draftId)await loadAll();
    return;
  }
  if(!state.composer.draftId&&!composerHasMeaningfulContent(d)){state.composer.el.remove();state.composer=null;return;}
  await saveDraft();state.composer?.el.remove();state.composer=null;
}"""
app = replace_once(app, old_close, new_close, 'composer close behavior')

# 3) UX overrides: labels use all available sidebar space, the meeting scheduler
# is a separate Outlook-style surface (not embedded in Compose), and message
# double-click opens an in-app dialog.
old_append = "  document.head.appendChild(style);"
new_append = """  style.textContent += `
    .sidebar .labels-scroll{overflow:visible!important;max-height:none!important;flex:0 0 auto!important}
    #meetingBtn{display:none!important}
    .ff-message-dialog-backdrop{position:fixed;inset:0;z-index:12000;background:rgba(6,25,36,.58);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:22px}
    .ff-message-dialog{width:min(1080px,96vw);max-height:92vh;display:flex;flex-direction:column;background:var(--surface,#fff);color:var(--text,#17343d);border:1px solid var(--line,#dce8e5);border-radius:22px;box-shadow:0 34px 100px rgba(0,0,0,.32);overflow:hidden}
    .ff-message-dialog-head{display:flex;align-items:flex-start;gap:14px;padding:20px 22px;border-bottom:1px solid var(--line,#e4ecee);background:var(--surface,#fff)}
    .ff-message-dialog-title{min-width:0;flex:1}.ff-message-dialog-title h2{margin:0 0 8px;font-size:22px;line-height:1.25;letter-spacing:-.025em}.ff-message-dialog-meta{display:flex;flex-wrap:wrap;gap:5px 16px;font-size:12px;color:var(--muted,#71848a)}
    .ff-message-dialog-close{width:38px;height:38px;border:0;border-radius:10px;background:transparent;color:inherit;display:grid;place-items:center;cursor:pointer}.ff-message-dialog-close:hover{background:var(--surface-3,#eef3f5)}
    .ff-message-dialog-body{overflow:auto;padding:20px 22px 26px;background:var(--surface-2,#f8fafb)}
    .ff-message-dialog-body>.ff-rich-message{background:var(--surface,#fff);border:1px solid var(--line,#e3e9ec);border-radius:16px;padding:14px;box-shadow:0 10px 30px rgba(12,52,71,.06)}
    @media(max-width:700px){.ff-message-dialog-backdrop{padding:0}.ff-message-dialog{width:100vw;height:100vh;max-height:none;border-radius:0}.ff-message-dialog-head{padding:16px}.ff-message-dialog-body{padding:12px}.ff-message-dialog-title h2{font-size:19px}}
  `;
  document.head.appendChild(style);"""
enh = replace_once(enh, old_append, new_append, 'enhancement style overrides')

old_window = """function openMessageWindow(id) {
  if (!id) return;
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('message', id);
  window.open(url.toString(), '_blank', 'noopener');
}"""
new_window = """async function openMessageWindow(id) {
  if (!id) return;
  const currentSession = await session();
  if (!currentSession) return;
  qs('.ff-message-dialog-backdrop')?.remove();
  const { data: message, error } = await mailDb.from('frankiflow_mail_messages').select('*').eq('id', id).maybeSingle();
  if (error || !message) return;
  const backdrop = document.createElement('div');
  backdrop.className = 'ff-message-dialog-backdrop';
  const received = new Date(message.received_at || message.sent_at || message.created_at).toLocaleString();
  backdrop.innerHTML = `<section class="ff-message-dialog" role="dialog" aria-modal="true" aria-label="Email message"><header class="ff-message-dialog-head"><div class="ff-message-dialog-title"><h2>${esc(message.subject || '(no subject)')}</h2><div class="ff-message-dialog-meta"><span><b>From:</b> ${esc(message.from_name || message.from_address || '')} &lt;${esc(message.from_address || '')}&gt;</span><span><b>To:</b> ${esc((message.to_addresses || []).join(', '))}</span><span>${esc(received)}</span></div></div><button class="ff-message-dialog-close" type="button" title="Close" aria-label="Close">${icon('close')}</button></header><div class="ff-message-dialog-body" id="ffMessageDialogBody"></div></section>`;
  document.body.appendChild(backdrop);
  const body = qs('#ffMessageDialogBody', backdrop);
  renderHtmlInto(body, message.html_body, message.text_body);
  await renderAttachments(body, message.id);
  const close = () => backdrop.remove();
  qs('.ff-message-dialog-close', backdrop)?.addEventListener('click', close);
  backdrop.addEventListener('click', event => { if (event.target === backdrop) close(); });
  const onKey = event => { if (event.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);
}"""
enh = replace_once(enh, old_window, new_window, 'double-click message dialog')

# Force installed/PWA clients to pick up the new shell immediately.
if "frankiflow-mail-dev-v11" in sw:
    sw = sw.replace("frankiflow-mail-dev-v11", "frankiflow-mail-dev-v12", 1)
elif "frankiflow-mail-dev-v12" not in sw:
    raise SystemExit('service worker cache marker changed')

APP.write_text(app, encoding='utf-8')
ENH.write_text(enh, encoding='utf-8')
SW.write_text(sw, encoding='utf-8')
print('Applied reader, labels, scheduler, dialog and composer fixes.')
