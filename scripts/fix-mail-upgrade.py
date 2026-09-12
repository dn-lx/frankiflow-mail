from pathlib import Path

p = Path('assets/app.js')
s = p.read_text(encoding='utf-8')


def replace_once(old, new, label):
    global s
    n = s.count(old)
    if n != 1:
        raise SystemExit(f'{label}: expected 1 match, found {n}')
    s = s.replace(old, new, 1)

# 1) Remove duplicated/broken auth bootstrap left by the first upgrade patch.
replace_once(
"""supabase.auth.onAuthStateChange(async(_event,session)=>{state.session=session;if(session){await loadAll();await setupRealtime();}else{await teardownRealtime();loginView();}});
const {data:{session}}=await supabase.auth.getSession();state.session=session;if(session){await loadAll();await setupRealtime();}else loginView();});
const {data:{session}}=await supabase.auth.getSession();state.session=session;if(session)await loadAll();else loginView();""",
"""supabase.auth.onAuthStateChange(async(_event,session)=>{state.session=session;if(session){await loadAll();await setupRealtime();}else{await teardownRealtime();loginView();}});
const {data:{session}}=await supabase.auth.getSession();
state.session=session;
if(session){await loadAll();await setupRealtime();}else loginView();""",
'auth bootstrap')

# 2) Preserve line breaks when loading a stored signature back into the editor.
replace_once(
"const stripHtml=(html='')=>{const d=document.createElement('div');d.innerHTML=html;return(d.textContent||d.innerText||'').trim()};",
"const stripHtml=(html='')=>{const d=document.createElement('div');d.innerHTML=html;return(d.textContent||d.innerText||'').trim()};\nconst signaturePlainText=(html='')=>{const d=document.createElement('div');d.innerHTML=String(html).replace(/<br\\s*\\/?>/gi,'\\n');return(d.textContent||d.innerText||'').trim()};",
'signature plain text helper')
replace_once(
"modal.querySelector('#sigBody').value=stripHtml(s.html_body).replace(/<br>/g,'\\n');",
"modal.querySelector('#sigBody').value=signaturePlainText(s.html_body);",
'signature editor line breaks')

# 3) Templates should respect the default-on signature setting.
replace_once(
"if(state.settings?.signature_enabled)insertSignature();scheduleAutosave();",
"if(state.settings?.signature_enabled!==false)insertSignature();scheduleAutosave();",
'template signature default')

# 4) Add a Gmail/Outlook-style Reply all action.
replace_once(
"<div class=\"quick-reply-head\"><strong>Reply</strong><div><button class=\"icon-btn\" id=\"forwardBtn\" title=\"Forward\">${icon('forward')}</button></div></div>",
"<div class=\"quick-reply-head\"><strong>Reply</strong><div><button class=\"icon-btn\" id=\"replyAllBtn\" title=\"Reply all\">${icon('reply_all')}</button><button class=\"icon-btn\" id=\"forwardBtn\" title=\"Forward\">${icon('forward')}</button></div></div>",
'reply all button')
replace_once(
"document.querySelector('#forwardBtn')?.addEventListener('click',()=>openComposer({subject:`Fwd: ${m.subject||''}`,text:`\\n\\n---------- Forwarded message ----------\\nFrom: ${m.from_name||m.from_address}\\nDate: ${fmtFull(m.received_at||m.created_at)}\\nSubject: ${m.subject||''}\\n\\n${m.text_body||''}`}));",
"""document.querySelector('#replyAllBtn')?.addEventListener('click',()=>{
    const own=new Set(state.accounts.map(a=>a.address.toLowerCase()));
    const primary=(m.reply_to||m.from_address||'').toLowerCase();
    const cc=[...arr(m.to_addresses),...arr(m.cc_addresses)].map(x=>String(x).trim()).filter(Boolean).filter(x=>!own.has(x.toLowerCase())&&x.toLowerCase()!==primary);
    openComposer({fromAddress:accountForMessage(m)?.address||defaultFromAddress(),to:m.reply_to||m.from_address,cc:[...new Set(cc)].join(', '),subject:replySubject(m.subject),thread_id:m.thread_id,in_reply_to:m.provider_message_id});
  });
  document.querySelector('#forwardBtn')?.addEventListener('click',()=>openComposer({subject:`Fwd: ${m.subject||''}`,text:`\\n\\n---------- Forwarded message ----------\\nFrom: ${m.from_name||m.from_address}\\nDate: ${fmtFull(m.received_at||m.created_at)}\\nSubject: ${m.subject||''}\\n\\n${m.text_body||''}`}));""",
'reply all wiring')

p.write_text(s, encoding='utf-8')
print('Mail post-upgrade integrity fixes applied.')
