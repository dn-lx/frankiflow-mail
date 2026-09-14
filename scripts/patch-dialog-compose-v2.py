from pathlib import Path
import re

APP = Path('assets/app.js')
ENH = Path('assets/enhancements.js')
WORKFLOW = Path('.github/workflows/deploy-develop.yml')
SW = Path('sw.js')


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 exact match, found {count}')
    return text.replace(old, new, 1)


def sub_once(text, pattern, replacement, label, flags=re.S):
    matches = list(re.finditer(pattern, text, flags))
    if len(matches) != 1:
        raise SystemExit(f'{label}: expected 1 regex match, found {len(matches)}')
    m = matches[0]
    return text[:m.start()] + replacement + text[m.end():]

# --- app.js: make Reply / Reply all participant handling correct in the standard reader too.
app = APP.read_text(encoding='utf-8')
old_reply = """const replySubject=s=>/^re:/i.test(s||'')?s:`Re: ${s||''}`;
async function sendQuickReply(m){const editor=document.querySelector('#quickReplyEditor');const html=editor.innerHTML.trim(),text=editor.innerText.trim();if(!text)return;const ok=await sendMail({fromAddress:accountForMessage(m)?.address||defaultFromAddress(),to:m.reply_to||m.from_address,subject:replySubject(m.subject),text,html,thread_id:m.thread_id,in_reply_to:m.provider_message_id});if(ok)editor.innerHTML='';}"""
new_reply = """const replySubject=s=>/^re:/i.test(s||'')?s:`Re: ${s||''}`;
function replyRecipients(m,includeAll=false){
  const own=new Set(state.accounts.map(a=>String(a.address||'').trim().toLowerCase()).filter(Boolean));
  own.add(String(CONFIG.mailbox||'').trim().toLowerCase());
  const primary=String(m?.reply_to||m?.from_address||'').trim();
  const candidates=[];
  if(primary&&!own.has(primary.toLowerCase()))candidates.push(primary);
  if(includeAll)candidates.push(...arr(m?.to_addresses),...arr(m?.cc_addresses));
  if(!candidates.length)candidates.push(...arr(m?.to_addresses),...arr(m?.cc_addresses));
  const seen=new Set(),unique=[];
  for(const raw of candidates){const value=String(raw||'').trim();const key=value.toLowerCase();if(!value||own.has(key)||seen.has(key))continue;seen.add(key);unique.push(value);}
  return{to:unique[0]||'',cc:includeAll?unique.slice(1):[]};
}
async function sendQuickReply(m){const editor=document.querySelector('#quickReplyEditor');const html=editor.innerHTML.trim(),text=editor.innerText.trim();if(!text)return;const recipients=replyRecipients(m,false);if(!recipients.to)return toast('No reply recipient found','warning');const ok=await sendMail({fromAddress:accountForMessage(m)?.address||defaultFromAddress(),to:recipients.to,cc:recipients.cc.join(', '),subject:replySubject(m.subject),text,html,thread_id:m.thread_id,in_reply_to:m.provider_message_id});if(ok)editor.innerHTML='';}"""
app = replace_once(app, old_reply, new_reply, 'reader reply helper')
old_bindings = """  document.querySelector('#replyCompose')?.addEventListener('click',()=>openComposer({fromAddress:accountForMessage(m)?.address||defaultFromAddress(),to:m.reply_to||m.from_address,subject:replySubject(m.subject),thread_id:m.thread_id,in_reply_to:m.provider_message_id}));
  document.querySelector('#replyAllBtn')?.addEventListener('click',()=>{
    const own=new Set(state.accounts.map(a=>a.address.toLowerCase()));
    const primary=(m.reply_to||m.from_address||'').toLowerCase();
    const cc=[...arr(m.to_addresses),...arr(m.cc_addresses)].map(x=>String(x).trim()).filter(Boolean).filter(x=>!own.has(x.toLowerCase())&&x.toLowerCase()!==primary);
    openComposer({fromAddress:accountForMessage(m)?.address||defaultFromAddress(),to:m.reply_to||m.from_address,cc:[...new Set(cc)].join(', '),subject:replySubject(m.subject),thread_id:m.thread_id,in_reply_to:m.provider_message_id});
  });"""
new_bindings = """  document.querySelector('#replyCompose')?.addEventListener('click',()=>{const recipients=replyRecipients(m,false);if(!recipients.to)return toast('No reply recipient found','warning');openComposer({fromAddress:accountForMessage(m)?.address||defaultFromAddress(),to:recipients.to,subject:replySubject(m.subject),thread_id:m.thread_id,in_reply_to:m.provider_message_id});});
  document.querySelector('#replyAllBtn')?.addEventListener('click',()=>{const recipients=replyRecipients(m,true);if(!recipients.to)return toast('No reply recipient found','warning');openComposer({fromAddress:accountForMessage(m)?.address||defaultFromAddress(),to:recipients.to,cc:recipients.cc.join(', '),subject:replySubject(m.subject),thread_id:m.thread_id,in_reply_to:m.provider_message_id});});"""
app = replace_once(app, old_bindings, new_bindings, 'reader reply bindings')
APP.write_text(app, encoding='utf-8')

# --- enhancements.js: move scheduler, remove reader duplicate, render full conversation and compose inside double-click dialog.
enh = ENH.read_text(encoding='utf-8')
new_sidebar = """function decorateSidebarMeeting() {
  const sidebar = qs('.sidebar');
  if (!sidebar) return;
  let button = qs('#ffSidebarMeeting', sidebar);
  if (!button) {
    button = document.createElement('button');
    button.id = 'ffSidebarMeeting';
    button.className = 'nav-btn';
    button.type = 'button';
    button.title = 'Meeting Scheduler';
    button.setAttribute('aria-label', 'Meeting Scheduler');
    button.innerHTML = `${icon('calendar_month')}<span class=\"nav-label\">Meeting Scheduler</span>`;
  }
  const labelsTitle = qsa('.nav-section-title', sidebar).find(el => el.textContent.trim().toLowerCase() === 'labels');
  if (labelsTitle && button.nextElementSibling !== labelsTitle) labelsTitle.insertAdjacentElement('beforebegin', button);
  else if (!labelsTitle && !button.isConnected) sidebar.appendChild(button);
  if (button.dataset.ffBound !== '1') {
    button.dataset.ffBound = '1';
    button.addEventListener('click', () => openMeetingScheduler());
  }
}

function decorateTopbar"""
enh = sub_once(enh, r"function decorateSidebarMeeting\(\) \{.*?\n\}\n\nfunction decorateTopbar", new_sidebar, 'sidebar scheduler placement')

enh = sub_once(enh, r"\n    const tools = qs\('\.reader-tools', panel\);\n    if \(tools && !qs\('#ffReaderMeeting', tools\)\) \{.*?\n    \}\n", "\n", 'remove duplicate reader scheduler')

extra_css = r'''
  style.textContent += `
    .ff-message-dialog{width:min(1160px,97vw);max-height:94vh}
    .ff-message-dialog-body{display:flex;flex-direction:column;gap:18px;padding:18px 20px 22px}
    .ff-dialog-history{display:flex;flex-direction:column;gap:12px}
    .ff-dialog-history-label{display:flex;align-items:center;justify-content:space-between;gap:12px;color:var(--muted,#6a7e86);font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.055em;padding:0 2px}
    .ff-dialog-message{background:var(--surface,#fff);border:1px solid var(--line,#dfe8eb);border-radius:16px;overflow:hidden;box-shadow:0 7px 22px rgba(12,52,71,.045)}
    .ff-dialog-message.current{border-color:#6fc8c4;box-shadow:0 0 0 2px rgba(38,169,163,.10),0 9px 28px rgba(12,52,71,.06)}
    .ff-dialog-message-head{display:flex;align-items:flex-start;gap:11px;padding:13px 15px;border-bottom:1px solid var(--line,#e7edef);background:var(--surface,#fff)}
    .ff-dialog-avatar{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;background:#e7f5f4;color:#0b6670;font-size:12px;font-weight:850;flex:0 0 auto}
    .ff-dialog-message-who{min-width:0;flex:1}.ff-dialog-message-who strong{display:block;font-size:13px}.ff-dialog-message-who small{display:block;margin-top:3px;color:var(--muted,#71848a);font-size:11px;line-height:1.45;overflow-wrap:anywhere}
    .ff-dialog-message-head time{font-size:11px;color:var(--muted,#71848a);white-space:nowrap}
    .ff-dialog-message-content{padding:13px 15px 15px}.ff-dialog-message-content>.ff-rich-message{margin-top:0}
    .ff-dialog-compose{position:sticky;bottom:-22px;background:var(--surface,#fff);border:1px solid var(--line,#dfe8eb);border-radius:17px;box-shadow:0 -8px 28px rgba(12,52,71,.075);padding:14px 15px 13px;z-index:2}
    .ff-dialog-compose-top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:9px}.ff-dialog-reply-tabs{display:flex;gap:5px;padding:3px;background:var(--surface-3,#edf3f4);border-radius:11px}.ff-dialog-reply-tabs button{border:0;background:transparent;color:inherit;border-radius:8px;padding:7px 10px;font-weight:750;font-size:12px;cursor:pointer;display:flex;align-items:center;gap:6px}.ff-dialog-reply-tabs button.active{background:var(--surface,#fff);box-shadow:0 2px 8px rgba(12,52,71,.10);color:#0b6670}
    .ff-dialog-recipient{font-size:12px;color:var(--muted,#647a83);margin:0 2px 8px;overflow-wrap:anywhere}.ff-dialog-recipient b{color:var(--text,#17343d)}
    .ff-dialog-editor-toolbar{display:flex;align-items:center;gap:3px;border:1px solid var(--line,#dfe8eb);border-bottom:0;border-radius:12px 12px 0 0;padding:5px 7px;background:var(--surface-2,#f8fafb)}.ff-dialog-editor-toolbar button{width:32px;height:30px;border:0;background:transparent;border-radius:7px;color:inherit;display:grid;place-items:center;cursor:pointer}.ff-dialog-editor-toolbar button:hover{background:var(--surface-3,#edf3f4)}
    .ff-dialog-editor{min-height:112px;max-height:260px;overflow:auto;border:1px solid var(--line,#dfe8eb);border-radius:0 0 12px 12px;padding:11px 12px;outline:none;line-height:1.55;background:var(--input,#fff)}.ff-dialog-editor:empty:before{content:attr(data-placeholder);color:#93a2a8;pointer-events:none}
    .ff-dialog-files{display:flex;gap:7px;flex-wrap:wrap;margin-top:8px}.ff-dialog-file{display:inline-flex;align-items:center;gap:5px;background:#edf6f6;border:1px solid #d4e8e8;border-radius:999px;padding:5px 8px;font-size:11px}.ff-dialog-file button{border:0;background:transparent;cursor:pointer;display:grid;place-items:center;padding:0;color:inherit}
    .ff-dialog-compose-foot{display:flex;align-items:center;gap:8px;margin-top:10px}.ff-dialog-compose-foot .ff-status{font-size:12px;color:var(--muted,#6b8088);min-height:18px}.ff-dialog-compose-foot .ff-status.error{color:#b33b32}.ff-dialog-compose-foot .ff-status.ok{color:#13725f}.ff-dialog-compose-foot .spacer{flex:1}.ff-dialog-send{border:0;border-radius:10px;background:#0b3447;color:#fff;padding:9px 14px;font-weight:800;display:inline-flex;align-items:center;gap:7px;cursor:pointer}.ff-dialog-send:disabled{opacity:.6;cursor:wait}
    @media(max-width:700px){.ff-dialog-message-head{padding:11px}.ff-dialog-message-content{padding:10px}.ff-dialog-compose{position:relative;bottom:auto;padding:11px}.ff-dialog-compose-top{align-items:flex-start;flex-direction:column}.ff-dialog-editor{min-height:128px}.ff-message-dialog-body{padding:10px}}
  `;
'''
enh = replace_once(enh, "  document.head.appendChild(style);", extra_css + "  document.head.appendChild(style);", 'dialog compose styles')

new_dialog = r'''function dialogEmail(value='') {
  const raw = String(value || '').trim();
  const match = raw.match(/<?([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})>?/i);
  return (match?.[1] || raw).trim().toLowerCase();
}
function dialogArray(value) { return Array.isArray(value) ? value : []; }
function dialogInitials(value='') { return String(value || '').split(/\s+/).filter(Boolean).slice(0,2).map(x => x[0]?.toUpperCase()).join('') || 'FF'; }
function dialogReplySubject(value='') { return /^re:/i.test(String(value || '')) ? String(value || '') : `Re: ${String(value || '')}`; }
function dialogReplyTargets(message, accounts, mode='reply') {
  const own = new Set((accounts || []).map(a => dialogEmail(a.address)).filter(Boolean));
  own.add(dialogEmail(CONFIG.mailbox));
  const candidates = [];
  const sender = dialogEmail(message.reply_to || message.from_address);
  if (sender && !own.has(sender)) candidates.push(sender);
  if (mode === 'replyAll') candidates.push(...dialogArray(message.to_addresses), ...dialogArray(message.cc_addresses));
  if (!candidates.length) candidates.push(...dialogArray(message.to_addresses), ...dialogArray(message.cc_addresses));
  const seen = new Set(), recipients = [];
  for (const raw of candidates) {
    const email = dialogEmail(raw);
    if (!email || own.has(email) || seen.has(email)) continue;
    seen.add(email); recipients.push(email);
  }
  return { to: recipients[0] || '', cc: mode === 'replyAll' ? recipients.slice(1) : [] };
}
function dialogFromAddress(message, accounts) {
  return (accounts || []).find(a => a.id === message.account_id)?.address || (accounts || []).find(a => a.is_primary)?.address || CONFIG.mailbox;
}
async function dialogAccounts() {
  const { data, error } = await mailDb.from('frankiflow_mail_accounts').select('id,address,is_primary').order('is_primary', { ascending:false }).limit(25);
  return error ? [] : (data || []);
}
async function dialogThread(message) {
  if (!message.thread_id) return [message];
  const { data, error } = await mailDb.from('frankiflow_mail_messages').select('*').eq('thread_id', message.thread_id).order('created_at', { ascending:true }).limit(100);
  if (error || !data?.length) return [message];
  const visible = data.filter(item => item.folder !== 'drafts' && item.direction !== 'draft');
  return visible.length ? visible : [message];
}
async function dialogFilePayloads(files) {
  const out = [];
  for (const file of files || []) {
    const content = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1] || ''); reader.onerror = reject; reader.readAsDataURL(file); });
    out.push({ filename:file.name, content, contentType:file.type || undefined });
  }
  return out;
}
function cleanDialogComposeHtml(html='') {
  const doc = new DOMParser().parseFromString(`<body>${String(html || '')}</body>`, 'text/html');
  doc.querySelectorAll('script,style,iframe,object,embed,form,input,button,meta').forEach(el => el.remove());
  doc.body.querySelectorAll('*').forEach(el => [...el.attributes].forEach(attr => { if (/^on/i.test(attr.name) || ((attr.name === 'href' || attr.name === 'src') && /^javascript:/i.test(attr.value))) el.removeAttribute(attr.name); }));
  return doc.body.innerHTML;
}
async function renderDialogHistory(mount, messages, selectedId) {
  mount.innerHTML = `<div class="ff-dialog-history-label"><span>Message history</span><span>${messages.length} message${messages.length === 1 ? '' : 's'}</span></div>`;
  for (const item of messages) {
    const card = document.createElement('article');
    card.className = `ff-dialog-message ${item.id === selectedId ? 'current' : ''}`;
    card.dataset.messageId = item.id;
    const sender = item.from_name || item.from_address || (item.direction === 'outbound' ? 'FrankiFlow' : 'Unknown sender');
    const to = dialogArray(item.to_addresses).join(', ');
    const cc = dialogArray(item.cc_addresses).join(', ');
    const when = new Date(item.received_at || item.sent_at || item.created_at).toLocaleString();
    card.innerHTML = `<header class="ff-dialog-message-head"><div class="ff-dialog-avatar">${esc(dialogInitials(sender))}</div><div class="ff-dialog-message-who"><strong>${esc(sender)}</strong><small>${esc(item.from_address || '')} → ${esc(to)}${cc ? ` · cc ${esc(cc)}` : ''}</small></div><time>${esc(when)}</time></header><div class="ff-dialog-message-content"></div>`;
    mount.appendChild(card);
    const content = qs('.ff-dialog-message-content', card);
    renderHtmlInto(content, item.html_body, item.text_body);
    await renderAttachments(content, item.id);
  }
}
async function sendDialogReply({ message, accounts, mode, editor, files, status, button }) {
  const currentSession = await session();
  if (!currentSession) throw new Error('Please sign in again.');
  const targets = dialogReplyTargets(message, accounts, mode);
  const text = editor.innerText.trim();
  const html = cleanDialogComposeHtml(editor.innerHTML.trim());
  if (!targets.to) throw new Error('No valid reply recipient was found.');
  if (!text && !(files || []).length) throw new Error('Write a reply or add an attachment first.');
  button.disabled = true; button.innerHTML = `${icon('progress_activity')} Sending…`; status.className = 'ff-status'; status.textContent = '';
  try {
    const payload = {
      fromAddress: dialogFromAddress(message, accounts),
      to: [targets.to], cc: targets.cc, bcc: [],
      subject: dialogReplySubject(message.subject), text, html,
      thread_id: message.thread_id || null,
      in_reply_to: message.provider_message_id || null,
      attachments: await dialogFilePayloads(files)
    };
    const response = await fetch(CONFIG.sendFunctionUrl, { method:'POST', headers:{ 'Content-Type':'application/json', apikey:CONFIG.supabasePublishableKey, Authorization:`Bearer ${currentSession.access_token}` }, body:JSON.stringify(payload) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.error) throw new Error(result?.error || `Send failed (HTTP ${response.status})`);
    editor.innerHTML = ''; status.className = 'ff-status ok'; status.textContent = mode === 'replyAll' ? 'Reply all sent.' : 'Reply sent.';
    qs('#refreshBtn')?.click();
    return true;
  } finally {
    button.disabled = false; button.innerHTML = `${icon('send')} Send`;
  }
}

async function openMessageWindow(id) {
  if (!id) return;
  const currentSession = await session();
  if (!currentSession) return;
  qs('.ff-message-dialog-backdrop')?.remove();
  const { data: message, error } = await mailDb.from('frankiflow_mail_messages').select('*').eq('id', id).maybeSingle();
  if (error || !message) return;
  const [accounts, messages] = await Promise.all([dialogAccounts(), dialogThread(message)]);
  const backdrop = document.createElement('div');
  backdrop.className = 'ff-message-dialog-backdrop';
  const received = new Date(message.received_at || message.sent_at || message.created_at).toLocaleString();
  backdrop.innerHTML = `<section class="ff-message-dialog" role="dialog" aria-modal="true" aria-label="Email conversation"><header class="ff-message-dialog-head"><div class="ff-message-dialog-title"><h2>${esc(message.subject || '(no subject)')}</h2><div class="ff-message-dialog-meta"><span><b>Conversation:</b> ${messages.length} message${messages.length === 1 ? '' : 's'}</span><span><b>Opened from:</b> ${esc(message.from_name || message.from_address || '')}</span><span>${esc(received)}</span></div></div><button class="ff-message-dialog-close" type="button" title="Close" aria-label="Close">${icon('close')}</button></header><div class="ff-message-dialog-body"><div class="ff-dialog-history" id="ffMessageDialogHistory"></div><section class="ff-dialog-compose" aria-label="Reply composer"><div class="ff-dialog-compose-top"><div class="ff-dialog-reply-tabs"><button type="button" class="active" data-dialog-reply-mode="reply">${icon('reply')} Reply</button><button type="button" data-dialog-reply-mode="replyAll">${icon('reply_all')} Reply all</button></div><span class="ff-status" id="ffDialogStatus"></span></div><div class="ff-dialog-recipient" id="ffDialogRecipients"></div><div class="ff-dialog-editor-toolbar"><button type="button" data-dialog-format="bold" title="Bold">${icon('format_bold')}</button><button type="button" data-dialog-format="italic" title="Italic">${icon('format_italic')}</button><button type="button" data-dialog-format="underline" title="Underline">${icon('format_underlined')}</button><button type="button" data-dialog-format="insertUnorderedList" title="Bulleted list">${icon('format_list_bulleted')}</button></div><div class="ff-dialog-editor" id="ffDialogEditor" contenteditable="true" data-placeholder="Write your reply…"></div><div class="ff-dialog-files" id="ffDialogFiles"></div><div class="ff-dialog-compose-foot"><button type="button" class="ff-mini-btn" id="ffDialogAttach" title="Attach file">${icon('attach_file')}</button><input id="ffDialogFileInput" type="file" multiple hidden><span class="ff-status" id="ffDialogFootStatus"></span><span class="spacer"></span><button type="button" class="ff-dialog-send" id="ffDialogSend">${icon('send')} Send</button></div></section></div></section>`;
  document.body.appendChild(backdrop);
  const history = qs('#ffMessageDialogHistory', backdrop);
  await renderDialogHistory(history, messages, message.id);

  let mode = 'reply', files = [];
  const editor = qs('#ffDialogEditor', backdrop), recipient = qs('#ffDialogRecipients', backdrop), status = qs('#ffDialogFootStatus', backdrop), send = qs('#ffDialogSend', backdrop), fileInput = qs('#ffDialogFileInput', backdrop), fileList = qs('#ffDialogFiles', backdrop);
  const updateRecipients = () => {
    const targets = dialogReplyTargets(message, accounts, mode);
    recipient.innerHTML = targets.to ? `<b>To:</b> ${esc(targets.to)}${targets.cc.length ? ` &nbsp; <b>Cc:</b> ${esc(targets.cc.join(', '))}` : ''}` : '<b>No reply recipient found</b>';
    qsa('[data-dialog-reply-mode]', backdrop).forEach(btn => btn.classList.toggle('active', btn.dataset.dialogReplyMode === mode));
  };
  const renderFiles = () => { fileList.innerHTML = files.map((file, index) => `<span class="ff-dialog-file">${icon('attach_file')} ${esc(file.name)} <button type="button" data-dialog-file-remove="${index}" aria-label="Remove attachment">${icon('close')}</button></span>`).join(''); qsa('[data-dialog-file-remove]', fileList).forEach(btn => btn.onclick = () => { files.splice(Number(btn.dataset.dialogFileRemove),1); renderFiles(); }); };
  qsa('[data-dialog-reply-mode]', backdrop).forEach(btn => btn.onclick = () => { mode = btn.dataset.dialogReplyMode === 'replyAll' ? 'replyAll' : 'reply'; updateRecipients(); editor.focus(); });
  qsa('[data-dialog-format]', backdrop).forEach(btn => btn.onclick = () => { document.execCommand(btn.dataset.dialogFormat,false,null); editor.focus(); });
  qs('#ffDialogAttach', backdrop).onclick = () => fileInput.click();
  fileInput.onchange = () => { files.push(...fileInput.files); fileInput.value=''; renderFiles(); };
  send.onclick = async () => { try { const ok = await sendDialogReply({ message, accounts, mode, editor, files, status, button:send }); if (ok) { files=[]; renderFiles(); setTimeout(async () => { const fresh = await dialogThread(message); await renderDialogHistory(history, fresh, message.id); }, 700); } } catch (sendError) { status.className='ff-status error'; status.textContent=sendError.message || 'Could not send reply.'; } };
  updateRecipients();

  const close = () => { backdrop.remove(); document.removeEventListener('keydown', onKey); };
  qs('.ff-message-dialog-close', backdrop)?.addEventListener('click', close);
  backdrop.addEventListener('click', event => { if (event.target === backdrop) close(); });
  const onKey = event => { if (event.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(() => editor.focus());
}

async function standaloneView'''
enh = sub_once(enh, r"async function openMessageWindow\(id\) \{.*?\n\}\n\nasync function standaloneView", new_dialog, 'message dialog')
ENH.write_text(enh, encoding='utf-8')

# --- service worker cache bump.
sw = SW.read_text(encoding='utf-8')
sw = re.sub(r"const CACHE = 'frankiflow-mail-dev-v\d+';", "const CACHE = 'frankiflow-mail-dev-v13';", sw, count=1)
SW.write_text(sw, encoding='utf-8')

# --- deployment workflow: require the new code and run a real headless interaction test.
wf = WORKFLOW.read_text(encoding='utf-8')
wf = replace_once(wf,
"""          grep -q \"openMessageWindow(id)\" _site/assets/enhancements.js
          grep -q \"composerBodyHasMeaningfulContent\" _site/assets/app.js""",
"""          grep -q \"openMessageWindow(id)\" _site/assets/enhancements.js
          grep -q \"ff-dialog-compose\" _site/assets/enhancements.js
          grep -q \"dialogReplyTargets\" _site/assets/enhancements.js
          grep -q \"replyRecipients\" _site/assets/app.js
          ! grep -q \"ffReaderMeeting\" _site/assets/enhancements.js
          grep -q \"composerBodyHasMeaningfulContent\" _site/assets/app.js""",
'workflow build assertions')

interaction_step = r'''
      - name: Headless dialog compose and reply-all test
        run: |
          set -euo pipefail
          CHROME="$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)"
          test -n "$CHROME"
          rm -rf /tmp/ff-dialog-test
          mkdir -p /tmp/ff-dialog-test
          node <<'NODE'
          const fs=require('fs');
          let src=fs.readFileSync('assets/enhancements.js','utf8');
          const start=src.indexOf("import { createClient }");
          const end=src.indexOf("const ATTACHMENT_BUCKET");
          if(start<0||end<0) throw new Error('Could not prepare dialog interaction test');
          const stub=`const qs=(s,r=document)=>r.querySelector(s);
          const qsa=(s,r=document)=>[...r.querySelectorAll(s)];
          const CONFIG={mode:'develop',mailbox:'info@frankiflow.de',sendFunctionUrl:'https://send.test/functions/v1/send-mail',supabasePublishableKey:'test'};
          const testMessage={id:'test-message',account_id:'acc-info',thread_id:'thread-1',direction:'inbound',folder:'inbox',subject:'UI double-click test',from_name:'Customer',from_address:'customer@example.com',reply_to:'customer@example.com',to_addresses:['info@frankiflow.de'],cc_addresses:['partner@example.com'],provider_message_id:'provider-1',html_body:'<div style="padding:18px"><b>Customer request</b><p>Please confirm the appointment.</p></div>',text_body:'Customer request',created_at:'2026-09-14T08:00:00Z'};
          const sentMessage={id:'sent-message',account_id:'acc-info',thread_id:'thread-1',direction:'outbound',folder:'sent',subject:'Re: UI double-click test',from_name:'FrankiFlow',from_address:'info@frankiflow.de',to_addresses:['customer@example.com'],cc_addresses:[],provider_message_id:'provider-2',html_body:'<p>Earlier answer from FrankiFlow.</p>',text_body:'Earlier answer from FrankiFlow.',created_at:'2026-09-14T08:05:00Z'};
          const accounts=[{id:'acc-info',address:'info@frankiflow.de',is_primary:true},{id:'acc-mail',address:'mail@frankiflow.de',is_primary:false}];
          function dbResult(table,filters){if(table==='frankiflow_mail_messages'){if(filters.id==='test-message')return{data:testMessage,error:null};if(filters.thread_id==='thread-1')return{data:[testMessage,sentMessage],error:null};return{data:[],error:null}}if(table==='frankiflow_mail_accounts')return{data:accounts,error:null};return{data:[],error:null}}
          function dbChain(table){const filters={};const chain={select(){return chain},eq(k,v){filters[k]=v;return chain},gte(){return chain},update(){return chain},order(){return chain},limit(){return Promise.resolve(dbResult(table,filters))},maybeSingle(){return Promise.resolve(dbResult(table,filters))},then(resolve,reject){return Promise.resolve(dbResult(table,filters)).then(resolve,reject)}};return chain}
          const mailDb={auth:{getSession:async()=>({data:{session:{access_token:'test',user:{id:'user-1'}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from:dbChain,storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'about:blank'}})})}};
          `;
          src=stub+src.slice(end);
          fs.writeFileSync('/tmp/ff-dialog-test/enhancements.js',src);
          const labels=Array.from({length:5},(_,i)=>`<button class="nav-btn"><span>Label ${i+1}</span></button>`).join('');
          const html=`<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font-family:Arial}.shell{display:grid;grid-template-columns:244px 420px 1fr;height:800px}.sidebar{background:#0c3447;color:white;padding:12px;display:flex;flex-direction:column}.nav-btn{display:flex;padding:8px}.mail-row{padding:18px;border:1px solid #ddd;cursor:pointer}.topbar{height:60px}.reader{display:none}</style></head><body><div id="app"><main class="shell"><aside class="sidebar"><button id="composeMain">Compose</button><div class="nav"><button>Inbox</button></div><div class="nav-section-title">More</div><div class="nav" id="moreNav"><button>Archive</button><button>Spam</button><button>Trash</button></div><div class="nav-section-title" id="labelsTitle">Labels</div><div class="labels-scroll">${labels}</div></aside><section><div class="topbar"><button id="refreshBtn">Refresh</button></div><div class="mail-row" data-id="test-message"><span class="subject">UI double-click test</span></div></section><section id="reader" class="reader"></section></main></div><script>window.__uiErrors=[];window.__sendCalls=[];const nativeFetch=window.fetch.bind(window);window.fetch=async(url,opts={})=>{if(String(url).includes('send.test')){const body=JSON.parse(opts.body||'{}');window.__sendCalls.push(body);return{ok:true,status:200,json:async()=>({ok:true})}}return nativeFetch(url,opts)};window.addEventListener('error',e=>window.__uiErrors.push(e.message));window.addEventListener('unhandledrejection',e=>window.__uiErrors.push(String(e.reason)));function waitFor(sel,timeout=5000){return new Promise(resolve=>{const started=Date.now();const t=setInterval(()=>{const el=document.querySelector(sel);if(el){clearInterval(t);resolve(el)}else if(Date.now()-started>=timeout){clearInterval(t);resolve(null)}},40)})}function sleep(ms){return new Promise(r=>setTimeout(r,ms))}</script><script type="module" src="./enhancements.js"></script><script>(async()=>{const results={};const scheduler=await waitFor('#ffSidebarMeeting');const labelsTitle=document.querySelector('#labelsTitle');results.schedulerPosition=!!scheduler&&labelsTitle?.previousElementSibling===scheduler;scheduler?.click();await sleep(150);results.schedulerDialog=!!document.querySelector('.ff-meeting-backdrop');document.querySelector('.ff-meeting-backdrop')?.remove();let row=document.querySelector('.mail-row');row.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));const replacement=row.cloneNode(true);row.replaceWith(replacement);await sleep(80);replacement.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));const dialog=await waitFor('.ff-message-dialog-backdrop');await sleep(250);results.dialog=!!dialog;results.history=document.querySelectorAll('.ff-dialog-message').length===2;results.composer=!!document.querySelector('#ffDialogEditor')&&document.querySelector('#ffDialogEditor').isContentEditable;const replyAll=document.querySelector('[data-dialog-reply-mode="replyAll"]');replyAll?.click();await sleep(40);const allText=document.querySelector('#ffDialogRecipients')?.textContent||'';results.replyAllRecipients=allText.includes('customer@example.com')&&allText.includes('partner@example.com')&&!allText.includes('info@frankiflow.de');const reply=document.querySelector('[data-dialog-reply-mode="reply"]');reply?.click();await sleep(30);const replyText=document.querySelector('#ffDialogRecipients')?.textContent||'';results.replyRecipients=replyText.includes('customer@example.com')&&!replyText.includes('partner@example.com');replyAll?.click();const editor=document.querySelector('#ffDialogEditor');editor.innerHTML='<p>Confirmed from dialog.</p>';document.querySelector('#ffDialogSend')?.click();for(let i=0;i<30&&!window.__sendCalls.length;i++)await sleep(50);const call=window.__sendCalls[0]||{};results.sent=window.__sendCalls.length===1;results.sendTo=Array.isArray(call.to)&&call.to[0]==='customer@example.com';results.sendCc=Array.isArray(call.cc)&&call.cc.includes('partner@example.com')&&!call.cc.includes('info@frankiflow.de');results.threading=call.thread_id==='thread-1'&&call.in_reply_to==='provider-1'&&call.subject==='Re: UI double-click test';results.runtimeErrors=window.__uiErrors.length===0;const pass=Object.values(results).every(Boolean);document.body.dataset.testStatus=pass?'PASS':'FAIL';document.body.dataset.testDetails=JSON.stringify(results);document.body.dataset.testErrors=JSON.stringify(window.__uiErrors)})();</script></body></html>`;
          fs.writeFileSync('/tmp/ff-dialog-test/index.html',html);
          NODE
          node --check /tmp/ff-dialog-test/enhancements.js
          python3 -m http.server 8124 --directory /tmp/ff-dialog-test >/tmp/ff-dialog-server.log 2>&1 &
          SERVER_PID=$!
          trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT
          sleep 0.4
          "$CHROME" --headless --no-sandbox --disable-gpu --virtual-time-budget=9000 --dump-dom http://127.0.0.1:8124/index.html > /tmp/ff-dialog-dom.txt
          grep -q 'data-test-status="PASS"' /tmp/ff-dialog-dom.txt
          grep -q '"history":true' /tmp/ff-dialog-dom.txt
          grep -q '"composer":true' /tmp/ff-dialog-dom.txt
          grep -q '"replyAllRecipients":true' /tmp/ff-dialog-dom.txt
          grep -q '"threading":true' /tmp/ff-dialog-dom.txt
          echo "Dialog interaction test passed: message history, inline composer, Reply, Reply all, correct recipients, send payload/threading, and scheduler position."

'''
wf = replace_once(wf, "      - name: Deploy development to ShipStatic\n", interaction_step + "      - name: Deploy development to ShipStatic\n", 'insert dialog interaction test')
wf = replace_once(wf,
"""          grep -q \"openMessageWindow(id)\" /tmp/mail-enhancements.js
          curl -fsSL \"${DEV_URL}/assets/app.js?verify=${GITHUB_SHA}\" -o /tmp/mail-app.js
          grep -q \"composerBodyHasMeaningfulContent\" /tmp/mail-app.js""",
"""          grep -q \"openMessageWindow(id)\" /tmp/mail-enhancements.js
          grep -q \"ff-dialog-compose\" /tmp/mail-enhancements.js
          grep -q \"dialogReplyTargets\" /tmp/mail-enhancements.js
          ! grep -q \"ffReaderMeeting\" /tmp/mail-enhancements.js
          curl -fsSL \"${DEV_URL}/assets/app.js?verify=${GITHUB_SHA}\" -o /tmp/mail-app.js
          grep -q \"replyRecipients\" /tmp/mail-app.js
          grep -q \"composerBodyHasMeaningfulContent\" /tmp/mail-app.js""",
'live verification assertions')
WORKFLOW.write_text(wf, encoding='utf-8')

print('Patched dialog compose, reply/reply-all, scheduler placement, workflow tests, and cache version.')
