from pathlib import Path
import re

APP = Path('assets/app.js')
CSS = Path('assets/modern.css')
SW = Path('sw.js')

text = APP.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, found {count}')
    text = text.replace(old, new, 1)


def sub_once(pattern: str, replacement: str, label: str, flags=re.S):
    global text
    matches = list(re.finditer(pattern, text, flags))
    if len(matches) != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, found {len(matches)}')
    m = matches[0]
    text = text[:m.start()] + replacement + text[m.end():]


replace_once(
"""const state = {
  session:null, messages:[], labels:[], messageLabels:[], contacts:[], templates:[], settings:null,
  folder:'inbox', category:'all', activeId:null, selected:new Set(), search:'', loading:true,
  composer:null, commandOpen:false, filters:[]
};""",
"""const state = {
  session:null, messages:[], accounts:[], labels:[], messageLabels:[], contacts:[], templates:[], signatures:[], settings:null,
  folder:'inbox', category:'all', activeId:null, selected:new Set(), search:'', loading:true,
  composer:null, commandOpen:false, filters:[], realtimeChannel:null
};""",
'state extensions')

replace_once(
"const currentUser=()=>state.session?.user;",
"""const currentUser=()=>state.session?.user;
const accountByAddress=address=>state.accounts.find(a=>a.address===address)||state.accounts.find(a=>a.is_primary)||null;
const accountForMessage=m=>state.accounts.find(a=>a.id===m?.account_id)||accountByAddress(m?.from_address);
const defaultFromAddress=()=>state.accounts.find(a=>a.is_primary)?.address||state.accounts[0]?.address||CONFIG.mailbox;
const trashDaysLeft=m=>{if(!m?.trashed_at)return 10;const ms=new Date(m.trashed_at).getTime()+10*864e5-Date.now();return Math.max(0,Math.ceil(ms/864e5));};
function updateDocumentTitle(){const n=unreadCount();document.title=n?`(${n}) FrankiFlow Mail`:'FrankiFlow Mail';}""",
'account helpers')

sub_once(
    r"function advancedMatch\(m,query\)\{.*?\n\}\nfunction currentMessages",
"""function advancedMatch(m,query){
  if(!query.trim())return true;
  const tokens=query.match(/(?:[^\\s\"]+|\"[^\"]*\")+/g)||[];let free=[];
  const stamp=new Date(m.received_at||m.sent_at||m.created_at||0);
  for(const raw of tokens){
    const t=raw.replace(/^\"|\"$/g,'');const i=t.indexOf(':');
    if(i>0){
      const k=t.slice(0,i).toLowerCase(),v=t.slice(i+1).toLowerCase();
      if(k==='from'&&!String(m.from_address||'').toLowerCase().includes(v))return false;
      if(k==='to'&&!addresses(m.to_addresses).toLowerCase().includes(v))return false;
      if(k==='subject'&&!String(m.subject||'').toLowerCase().includes(v))return false;
      if(k==='is'&&v==='unread'&&m.is_read)return false;
      if(k==='is'&&v==='read'&&!m.is_read)return false;
      if(k==='is'&&v==='starred'&&!m.is_starred)return false;
      if(k==='is'&&v==='pinned'&&!m.is_pinned)return false;
      if(k==='is'&&v==='important'&&m.priority!=='high')return false;
      if(k==='is'&&v==='muted'&&!m.is_muted)return false;
      if(k==='has'&&v==='attachment'&&!m.has_attachments)return false;
      if(k==='in'&&effectiveFolder(m)!==v)return false;
      if(k==='before'){const d=new Date(v);if(!Number.isNaN(d.getTime())&&stamp>=d)return false;}
      if(k==='after'){const d=new Date(v);if(!Number.isNaN(d.getTime())&&stamp<=d)return false;}
      if(k==='label'){const names=labelsFor(m.id).map(x=>x.name.toLowerCase());if(!names.some(x=>x.includes(v)))return false;}
      continue;
    }
    free.push(t.toLowerCase());
  }
  if(!free.length)return true;
  const hay=[m.from_address,m.from_name,m.subject,m.preview,m.text_body,...arr(m.to_addresses),...arr(m.cc_addresses)].filter(Boolean).join(' ').toLowerCase();
  return free.every(x=>hay.includes(x));
}
function currentMessages""",
    'advanced search')

replace_once(
"<button class=\"icon-btn\" id=\"refreshBtn\" title=\"Refresh\">${icon('refresh')}</button><button class=\"icon-btn\" id=\"themeBtn\" title=\"Theme\">${icon('dark_mode')}</button>",
"<button class=\"icon-btn\" id=\"notifyBtn\" title=\"Desktop notifications\">${icon(typeof Notification!=='undefined'&&Notification.permission==='granted'?'notifications_active':'notifications')}</button><button class=\"icon-btn\" id=\"refreshBtn\" title=\"Refresh\">${icon('refresh')}</button><button class=\"icon-btn\" id=\"themeBtn\" title=\"Theme\">${icon('dark_mode')}</button>",
'topbar notification button')

replace_once(
"${state.folder==='inbox'?`<div class=\"category-tabs\">${CATEGORIES.map(([id,n])=>`<button class=\"category-tab ${state.category===id?'active':''}\" data-category=\"${id}\">${n}</button>`).join('')}</div>`:''}</div>",
"${state.folder==='inbox'?`<div class=\"category-tabs\">${CATEGORIES.map(([id,n])=>`<button class=\"category-tab ${state.category===id?'active':''}\" data-category=\"${id}\">${n}</button>`).join('')}</div>`:''}${state.folder==='trash'?`<div class=\"trash-tools\"><span class=\"subtle\">Automatically deleted after 10 days.</span><button class=\"btn btn-danger-soft\" id=\"emptyTrashBtn\">${icon('delete_forever')} Empty trash</button></div>`:''}</div>",
'trash retention heading')

replace_once(
"document.querySelector('#refreshBtn').onclick=()=>loadAll(true);document.querySelector('#themeBtn').onclick=toggleTheme;",
"document.querySelector('#notifyBtn').onclick=requestNotifications;document.querySelector('#refreshBtn').onclick=()=>loadAll(true);document.querySelector('#themeBtn').onclick=toggleTheme;document.querySelector('#emptyTrashBtn')?.addEventListener('click',emptyTrash);",
'wire notification and trash')

sub_once(
    r"function renderBulk\(\)\{.*?\n\}\nasync function bulkAction\(action\)\{.*?\n\}\n\nfunction renderList",
"""function renderBulk(){
  const mount=document.querySelector('#bulkMount');if(!mount)return;const n=state.selected.size;if(!n){mount.innerHTML='';return;}
  if(state.folder==='trash'){
    mount.innerHTML=`<div class=\"bulkbar\"><span class=\"selected-count\">${n} selected</span><button class=\"icon-btn\" data-bulk=\"restore\" title=\"Restore to Inbox\">${icon('restore_from_trash')}</button><button class=\"icon-btn btn-danger\" data-bulk=\"deleteForever\" title=\"Delete forever\">${icon('delete_forever')}</button></div>`;
  }else{
    mount.innerHTML=`<div class=\"bulkbar\"><span class=\"selected-count\">${n} selected</span><button class=\"icon-btn\" data-bulk=\"read\" title=\"Mark read\">${icon('mark_email_read')}</button><button class=\"icon-btn\" data-bulk=\"unread\" title=\"Mark unread\">${icon('mark_email_unread')}</button><button class=\"icon-btn\" data-bulk=\"archive\" title=\"Archive\">${icon('archive')}</button><button class=\"icon-btn\" data-bulk=\"snooze\" title=\"Snooze\">${icon('schedule')}</button><button class=\"icon-btn\" data-bulk=\"label\" title=\"Label\">${icon('label')}</button><button class=\"icon-btn btn-danger\" data-bulk=\"trash\" title=\"Trash\">${icon('delete')}</button></div>`;
  }
  mount.querySelectorAll('[data-bulk]').forEach(b=>b.onclick=()=>bulkAction(b.dataset.bulk));
}
async function bulkAction(action){
  const ids=[...state.selected];if(!ids.length)return;
  if(action==='label')return openApplyLabel(ids);
  if(action==='snooze')return openSnooze(ids);
  if(action==='deleteForever'){
    if(!confirm(`Delete ${ids.length} message${ids.length>1?'s':''} permanently? This cannot be undone.`))return;
    return hardDeleteMessages(ids);
  }
  const now=new Date().toISOString();let patch={updated_at:now};
  if(action==='read')patch.is_read=true;
  if(action==='unread')patch.is_read=false;
  if(action==='archive'){patch.folder='archive';patch.trashed_at=null;}
  if(action==='trash'){patch.folder='trash';patch.trashed_at=now;}
  if(action==='restore'){patch.folder='inbox';patch.trashed_at=null;}
  const {error}=await supabase.from('frankiflow_mail_messages').update(patch).in('id',ids);
  if(error)return toast(error.message,'error');state.selected.clear();toast(`${ids.length} message${ids.length>1?'s':''} updated`);await loadAll();
}

function renderList""",
    'bulk trash behavior')

replace_once(
"document.querySelector('#replyCompose')?.addEventListener('click',()=>openComposer({to:m.reply_to||m.from_address,subject:replySubject(m.subject),thread_id:m.thread_id,in_reply_to:m.provider_message_id}));",
"document.querySelector('#replyCompose')?.addEventListener('click',()=>openComposer({fromAddress:accountForMessage(m)?.address||defaultFromAddress(),to:m.reply_to||m.from_address,subject:replySubject(m.subject),thread_id:m.thread_id,in_reply_to:m.provider_message_id}));",
'reply composer sender')

replace_once(
"async function sendQuickReply(m){const editor=document.querySelector('#quickReplyEditor');const html=editor.innerHTML.trim(),text=editor.innerText.trim();if(!text)return;const ok=await sendMail({to:m.reply_to||m.from_address,subject:replySubject(m.subject),text,html,thread_id:m.thread_id,in_reply_to:m.provider_message_id});if(ok)editor.innerHTML='';}",
"async function sendQuickReply(m){const editor=document.querySelector('#quickReplyEditor');const html=editor.innerHTML.trim(),text=editor.innerText.trim();if(!text)return;const ok=await sendMail({fromAddress:accountForMessage(m)?.address||defaultFromAddress(),to:m.reply_to||m.from_address,subject:replySubject(m.subject),text,html,thread_id:m.thread_id,in_reply_to:m.provider_message_id});if(ok)editor.innerHTML='';}",
'quick reply sender')

replace_once(
"document.querySelector('#backReader').onclick=()=>panel.classList.remove('open');document.querySelector('#readerStar').onclick=()=>patchMessage(m.id,{is_starred:!m.is_starred});document.querySelector('#readerArchive').onclick=()=>moveMessage(m.id,'archive');document.querySelector('#readerSnooze').onclick=()=>openSnooze([m.id]);document.querySelector('#readerLabel').onclick=()=>openApplyLabel([m.id]);",
"""document.querySelector('#backReader').onclick=()=>panel.classList.remove('open');document.querySelector('#readerStar').onclick=()=>patchMessage(m.id,{is_starred:!m.is_starred});
  const archiveBtn=document.querySelector('#readerArchive'),snoozeBtn=document.querySelector('#readerSnooze');
  if(m.folder==='trash'){
    archiveBtn.title='Restore to Inbox';archiveBtn.innerHTML=icon('restore_from_trash');archiveBtn.onclick=()=>moveMessage(m.id,'inbox');
    snoozeBtn.title='Delete forever';snoozeBtn.innerHTML=icon('delete_forever');snoozeBtn.onclick=()=>{if(confirm('Delete this message permanently? This cannot be undone.'))hardDeleteMessages([m.id]);};
  }else{
    archiveBtn.onclick=()=>moveMessage(m.id,'archive');snoozeBtn.onclick=()=>openSnooze([m.id]);
  }
  document.querySelector('#readerLabel').onclick=()=>openApplyLabel([m.id]);""",
'reader trash buttons')

replace_once(
"const moreBtn=document.querySelector('#readerMore');moreBtn.onclick=()=>showPopover(moreBtn,[['Mark unread','mark_email_unread',()=>patchMessage(m.id,{is_read:false})],[m.is_pinned?'Unpin':'Pin','keep',()=>patchMessage(m.id,{is_pinned:!m.is_pinned})],[m.priority==='high'?'Normal priority':'High priority','priority_high',()=>patchMessage(m.id,{priority:m.priority==='high'?'normal':'high'})],['Category: Clients','group',()=>patchMessage(m.id,{category:'clients'})],['Category: Bookings','hotel',()=>patchMessage(m.id,{category:'bookings'})],['Category: Finance','payments',()=>patchMessage(m.id,{category:'finance'})],['Move to spam','report',()=>moveMessage(m.id,'spam')],['Print','print',()=>window.print()],['Delete','delete',()=>moveMessage(m.id,'trash'),true]]);",
"""const moreBtn=document.querySelector('#readerMore');
  moreBtn.onclick=()=>showPopover(moreBtn,m.folder==='trash'?
    [['Restore to Inbox','restore_from_trash',()=>moveMessage(m.id,'inbox')],['Print','print',()=>window.print()],['Delete forever','delete_forever',()=>{if(confirm('Delete this message permanently? This cannot be undone.'))hardDeleteMessages([m.id]);},true]]:
    [['Mark unread','mark_email_unread',()=>patchMessage(m.id,{is_read:false})],[m.is_pinned?'Unpin':'Pin','keep',()=>patchMessage(m.id,{is_pinned:!m.is_pinned})],[m.priority==='high'?'Normal priority':'High priority','priority_high',()=>patchMessage(m.id,{priority:m.priority==='high'?'normal':'high'})],['Category: Clients','group',()=>patchMessage(m.id,{category:'clients'})],['Category: Bookings','hotel',()=>patchMessage(m.id,{category:'bookings'})],['Category: Finance','payments',()=>patchMessage(m.id,{category:'finance'})],[m.folder==='spam'?'Not spam':'Move to spam',m.folder==='spam'?'inbox':'report',()=>moveMessage(m.id,m.folder==='spam'?'inbox':'spam')],['Print','print',()=>window.print()],['Delete','delete',()=>moveMessage(m.id,'trash'),true]]);""",
'reader menu')

replace_once(
"async function moveMessage(id,folder){await patchMessage(id,{folder});state.activeId=null;toast(`Moved to ${folder}`);await loadAll();}",
"""async function moveMessage(id,folder){const patch={folder,trashed_at:folder==='trash'?new Date().toISOString():null};await patchMessage(id,patch);state.activeId=null;toast(folder==='inbox'?'Restored to Inbox':`Moved to ${folder}`);await loadAll();}
async function hardDeleteMessages(ids){
  if(!ids?.length)return;
  const {data:attachments,error:attachmentError}=await supabase.from('frankiflow_mail_attachments').select('storage_path').in('message_id',ids);
  if(attachmentError)return toast(attachmentError.message,'error');
  const paths=(attachments||[]).map(x=>x.storage_path).filter(Boolean);
  if(paths.length){const {error:storageError}=await supabase.storage.from('frankiflow-mail-attachments').remove(paths);if(storageError)return toast(storageError.message,'error');}
  const {error}=await supabase.from('frankiflow_mail_messages').delete().in('id',ids);if(error)return toast(error.message,'error');
  ids.forEach(id=>state.selected.delete(id));if(ids.includes(state.activeId))state.activeId=null;toast(`${ids.length} message${ids.length>1?'s':''} permanently deleted`,'delete_forever');await loadAll();
}
async function emptyTrash(){const ids=state.messages.filter(m=>m.folder==='trash').map(m=>m.id);if(!ids.length)return toast('Trash is already empty','delete');if(!confirm(`Permanently delete all ${ids.length} messages in Trash?`))return;await hardDeleteMessages(ids);}""",
'hard delete support')

replace_once(
"<div class=\"address-row\"><label>From</label><input value=\"${esc(CONFIG.mailbox)}\" disabled></div>",
"<div class=\"address-row\"><label>From</label><select id=\"cFrom\">${state.accounts.map(a=>`<option value=\"${esc(a.address)}\" ${(seed.fromAddress||defaultFromAddress())===a.address?'selected':''}>${esc(a.display_name||'FrankiFlow')} · ${esc(a.address)}</option>`).join('')}</select></div>",
'composer sender selector')

replace_once(
"document.body.append(el);state.composer={el,seed,files:[],draftId:seed.draftId||null,saveTimer:null};\n  if(state.settings?.signature_enabled&&state.settings?.signature_html&&!seed.draftId&&!seed.html&&!seed.text)insertSignature();",
"document.body.append(el);state.composer={el,seed,files:[],draftId:seed.draftId||null,saveTimer:null,selectedSignatureId:null};\n  if(state.settings?.signature_enabled!==false&&!seed.draftId&&!seed.html&&!seed.text)insertDefaultSignature();",
'composer signature bootstrap')

replace_once(
"const linkButton=el.querySelector('#linkBtn'),templateButton=el.querySelector('#templateBtn'),signatureButton=el.querySelector('#signatureBtn');linkButton.onclick=()=>{const u=prompt('Paste link URL');if(u)document.execCommand('createLink',false,u)};templateButton.onclick=()=>showTemplatePicker(templateButton);signatureButton.onclick=insertSignature;",
"const linkButton=el.querySelector('#linkBtn'),templateButton=el.querySelector('#templateBtn'),signatureButton=el.querySelector('#signatureBtn');linkButton.onclick=()=>{const u=prompt('Paste link URL');if(u)document.execCommand('createLink',false,u)};templateButton.onclick=()=>showTemplatePicker(templateButton);signatureButton.onclick=()=>showSignaturePicker(signatureButton);el.querySelector('#cFrom').onchange=()=>{syncDefaultSignature();scheduleAutosave();};",
'composer signature picker')

replace_once(
"el.querySelector('#discardDraft').onclick=()=>discardComposer();['cTo','cCc','cBcc','cSubject'].forEach(id=>el.querySelector(`#${id}`)?.addEventListener('input',scheduleAutosave));editor.addEventListener('input',scheduleAutosave);",
"el.querySelector('#discardDraft').onclick=()=>discardComposer();['cTo','cCc','cBcc','cSubject'].forEach(id=>el.querySelector(`#${id}`)?.addEventListener('input',scheduleAutosave));editor.addEventListener('input',scheduleAutosave);",
'composer autosave anchor')

replace_once(
"function openComposerFromDraft(m){openComposer({draftId:m.id,to:addresses(m.to_addresses),cc:addresses(m.cc_addresses),bcc:addresses(m.bcc_addresses),subject:m.subject,html:m.html_body||esc(m.text_body||'').replace(/\\n/g,'<br>'),thread_id:m.thread_id});}",
"function openComposerFromDraft(m){openComposer({draftId:m.id,fromAddress:m.from_address,to:addresses(m.to_addresses),cc:addresses(m.cc_addresses),bcc:addresses(m.bcc_addresses),subject:m.subject,html:m.html_body||esc(m.text_body||'').replace(/\\n/g,'<br>'),thread_id:m.thread_id});}",
'draft sender')

replace_once(
"function composerData(){const c=state.composer?.el;if(!c)return null;return{to:c.querySelector('#cTo').value,cc:c.querySelector('#cCc').value,bcc:c.querySelector('#cBcc').value,subject:c.querySelector('#cSubject').value,html:c.querySelector('#cEditor').innerHTML,text:c.querySelector('#cEditor').innerText,thread_id:state.composer.seed.thread_id||null,in_reply_to:state.composer.seed.in_reply_to||null};}",
"function composerData(){const c=state.composer?.el;if(!c)return null;return{fromAddress:c.querySelector('#cFrom').value,to:c.querySelector('#cTo').value,cc:c.querySelector('#cCc').value,bcc:c.querySelector('#cBcc').value,subject:c.querySelector('#cSubject').value,html:c.querySelector('#cEditor').innerHTML,text:c.querySelector('#cEditor').innerText,thread_id:state.composer.seed.thread_id||null,in_reply_to:state.composer.seed.in_reply_to||null};}",
'composer data sender')

replace_once(
"function insertSignature(){const ed=state.composer?.el.querySelector('#cEditor');if(!ed||!state.settings?.signature_html)return;if(ed.innerHTML&&!ed.innerHTML.endsWith('<br>'))ed.innerHTML+='<br><br>';ed.innerHTML+=`<div class=\"signature\">${state.settings.signature_html}</div>`;}",
"""function defaultSignatureFor(address){const account=accountByAddress(address);return state.signatures.find(s=>s.is_default&&s.account_id===account?.id)||state.signatures.find(s=>s.is_default&&!s.account_id)||null;}
function insertSignature(signatureId=null){const ed=state.composer?.el.querySelector('#cEditor');if(!ed)return;ed.querySelectorAll('.signature[data-ff-signature]').forEach(x=>x.remove());const sig=signatureId?state.signatures.find(s=>s.id===signatureId):defaultSignatureFor(state.composer?.el.querySelector('#cFrom')?.value);const html=sig?.html_body||(!state.signatures.length?state.settings?.signature_html:'');if(!html)return;if(ed.innerHTML&&!ed.innerHTML.endsWith('<br>'))ed.innerHTML+='<br><br>';ed.innerHTML+=`<div class=\"signature\" data-ff-signature=\"${esc(sig?.id||'legacy')}\">${html}</div>`;if(state.composer)state.composer.selectedSignatureId=sig?.id||'legacy';scheduleAutosave();}
function insertDefaultSignature(){insertSignature();}
function syncDefaultSignature(){if(state.composer?.el.querySelector('#cEditor .signature[data-ff-signature]'))insertSignature();}
function showSignaturePicker(anchor){const items=state.signatures.map(s=>[`${s.name}${s.is_default?' · default':''}`,'draw',()=>insertSignature(s.id)]);items.push(['Remove signature','format_clear',()=>{state.composer?.el.querySelectorAll('#cEditor .signature[data-ff-signature]').forEach(x=>x.remove());scheduleAutosave();}]);items.push(['Manage signatures','settings',()=>openSignatureManager()]);showPopover(anchor,items);}
function openSignatureManager(){
  const accountOptions=`<option value=\"\">All senders</option>${state.accounts.map(a=>`<option value=\"${a.id}\">${esc(a.address)}</option>`).join('')}`;
  const content=`<div id=\"signatureList\">${state.signatures.map(s=>`<div class=\"template-item\" data-sig-row=\"${s.id}\"><div class=\"main\"><strong>${esc(s.name)}${s.is_default?' · Default':''}</strong><small>${esc(stripHtml(s.html_body)).slice(0,80)}</small></div><button class=\"icon-btn\" data-sig-edit=\"${s.id}\">${icon('edit')}</button><button class=\"icon-btn\" data-sig-delete=\"${s.id}\">${icon('delete')}</button></div>`).join('')||'<p class=\"muted\">No signatures yet.</p>'}</div><input id=\"sigId\" type=\"hidden\"><div class=\"field\"><label>Name</label><input id=\"sigName\" placeholder=\"FrankiFlow standard\"></div><div class=\"field\"><label>Use for sender</label><select id=\"sigAccount\">${accountOptions}</select></div><div class=\"field\"><label>Signature</label><textarea id=\"sigBody\" rows=\"6\" placeholder=\"Best regards,\\nFrankiFlow\"></textarea></div><label class=\"setting-row\"><div><strong>Default signature</strong><small>Insert automatically for this sender.</small></div><input id=\"sigDefault\" type=\"checkbox\"></label>`;
  openModal('Signatures',content,async modal=>{
    const id=modal.querySelector('#sigId').value,name=modal.querySelector('#sigName').value.trim(),body=modal.querySelector('#sigBody').value,accountId=modal.querySelector('#sigAccount').value||null,isDefault=modal.querySelector('#sigDefault').checked;if(!name||!body.trim())return toast('Add a signature name and text','warning');
    if(isDefault){let q=supabase.from('frankiflow_mail_signatures').update({is_default:false,updated_at:new Date().toISOString()}).eq('user_id',currentUser().id);q=accountId?q.eq('account_id',accountId):q.is('account_id',null);await q;}
    const row={user_id:currentUser().id,account_id:accountId,name,html_body:esc(body).replace(/\\n/g,'<br>'),is_default:isDefault,updated_at:new Date().toISOString()};const result=id?await supabase.from('frankiflow_mail_signatures').update(row).eq('id',id):await supabase.from('frankiflow_mail_signatures').insert(row);if(result.error)return toast(result.error.message,'error');modal.closest('.modal-backdrop').remove();await loadAll();toast(id?'Signature updated':'Signature created','draw');
  },modal=>{
    modal.querySelectorAll('[data-sig-edit]').forEach(b=>b.onclick=()=>{const s=state.signatures.find(x=>x.id===b.dataset.sigEdit);if(!s)return;modal.querySelector('#sigId').value=s.id;modal.querySelector('#sigName').value=s.name;modal.querySelector('#sigAccount').value=s.account_id||'';modal.querySelector('#sigBody').value=stripHtml(s.html_body).replace(/<br>/g,'\\n');modal.querySelector('#sigDefault').checked=s.is_default;});
    modal.querySelectorAll('[data-sig-delete]').forEach(b=>b.onclick=async()=>{if(!confirm('Delete this signature?'))return;const {error}=await supabase.from('frankiflow_mail_signatures').delete().eq('id',b.dataset.sigDelete);if(error)return toast(error.message,'error');b.closest('[data-sig-row]')?.remove();state.signatures=state.signatures.filter(s=>s.id!==b.dataset.sigDelete);});
  });
}""",
'signature system')

replace_once(
"const account=await primaryAccount();const row={account_id:account.id,thread_id:d.thread_id,direction:'draft',folder:'drafts',from_address:CONFIG.mailbox,",
"const account=accountByAddress(d.fromAddress)||await primaryAccount();const row={account_id:account.id,thread_id:d.thread_id,direction:'draft',folder:'drafts',from_address:d.fromAddress,",
'draft sender persistence')

sub_once(
    r"function openSettings\(\)\{.*?\nasync function saveSettings",
"""function openSettings(){const s=state.settings||{};const notificationState=typeof Notification==='undefined'?'Unsupported':Notification.permission;const content=`<div class=\"setting-row\"><div><strong>Theme</strong><small>Use light, dark or your device preference.</small></div><select id=\"setTheme\"><option value=\"system\">System</option><option value=\"light\">Light</option><option value=\"dark\">Dark</option></select></div><div class=\"setting-row\"><div><strong>Density</strong><small>Control how much mail fits on screen.</small></div><select id=\"setDensity\"><option value=\"comfortable\">Comfortable</option><option value=\"compact\">Compact</option></select></div><div class=\"setting-row\"><div><strong>Keyboard shortcuts</strong><small>C to compose, J/K navigate, E archive and more.</small></div><select id=\"setShortcuts\"><option value=\"true\">Enabled</option><option value=\"false\">Disabled</option></select></div><div class=\"setting-row\"><div><strong>Automatic signature</strong><small>Insert the default signature for the selected sender.</small></div><select id=\"setSignatureEnabled\"><option value=\"true\">Enabled</option><option value=\"false\">Disabled</option></select></div><div class=\"setting-row\"><div><strong>Desktop notifications</strong><small>Current status: ${esc(notificationState)}</small></div><button class=\"btn\" id=\"enableNotificationsBtn\">${icon('notifications')} Enable</button></div><div style=\"display:flex;gap:8px;flex-wrap:wrap\"><button class=\"btn\" id=\"manageSignaturesBtn\">${icon('draw')} Signatures</button><button class=\"btn\" id=\"manageLabelsBtn\">${icon('label')} Labels</button><button class=\"btn\" id=\"manageTemplatesBtn\">${icon('article')} Templates</button><button class=\"btn\" id=\"manageFiltersBtn\">${icon('filter_alt')} Filters</button><button class=\"btn\" id=\"shortcutsBtn\">${icon('keyboard')} Shortcuts</button></div>`;openModal('Settings',content,async modal=>{await saveSettings({theme:modal.querySelector('#setTheme').value,density:modal.querySelector('#setDensity').value,keyboard_shortcuts:modal.querySelector('#setShortcuts').value==='true',signature_enabled:modal.querySelector('#setSignatureEnabled').value==='true'});modal.closest('.modal-backdrop').remove();toast('Settings saved','settings');renderApp();},modal=>{modal.querySelector('#setTheme').value=s.theme||'system';modal.querySelector('#setDensity').value=s.density||'comfortable';modal.querySelector('#setShortcuts').value=String(s.keyboard_shortcuts!==false);modal.querySelector('#setSignatureEnabled').value=String(s.signature_enabled!==false);modal.querySelector('#enableNotificationsBtn').onclick=requestNotifications;modal.querySelector('#manageSignaturesBtn').onclick=()=>{modal.closest('.modal-backdrop').remove();openSignatureManager()};modal.querySelector('#manageLabelsBtn').onclick=()=>{modal.closest('.modal-backdrop').remove();openLabelManager()};modal.querySelector('#manageTemplatesBtn').onclick=()=>{modal.closest('.modal-backdrop').remove();openTemplateManager()};modal.querySelector('#manageFiltersBtn').onclick=()=>{modal.closest('.modal-backdrop').remove();openFilterManager()};modal.querySelector('#shortcutsBtn').onclick=()=>{modal.closest('.modal-backdrop').remove();showShortcuts()};});}
async function saveSettings""",
    'settings redesign')

# Correct a quoting typo introduced in the settings replacement.
text = text.replace("signature_enabled:modal.querySelector('#setSignatureEnabled').value==='true'});", "signature_enabled:modal.querySelector('#setSignatureEnabled').value==='true'});")

sub_once(
    r"function showSearchHelp\(\)\{.*?\nfunction openModal",
"""function showSearchHelp(){openModal('Power search',`<p class=\"muted\">Combine terms to narrow the current mailbox.</p><div class=\"setting-row\"><strong>from:alex@example.com</strong><small>Sender address</small></div><div class=\"setting-row\"><strong>to:client@example.com</strong><small>Recipient address</small></div><div class=\"setting-row\"><strong>subject:invoice</strong><small>Subject text</small></div><div class=\"setting-row\"><strong>is:unread · is:starred · is:pinned · is:important</strong><small>Status</small></div><div class=\"setting-row\"><strong>has:attachment</strong><small>Only mail with files</small></div><div class=\"setting-row\"><strong>in:inbox · in:archive · in:trash</strong><small>Folder</small></div><div class=\"setting-row\"><strong>before:2026-09-01 · after:2026-09-01</strong><small>Date filters</small></div><div class=\"setting-row\"><strong>label:Clients</strong><small>Messages with a label</small></div>`,null);}
function openModal""",
    'search help')

replace_once(
"const commands=[['Compose new email','edit_square',()=>openComposer()],['Go to Inbox','inbox',()=>switchFolder('inbox')],['Go to Sent','send',()=>switchFolder('sent')],['Search mail','search',()=>document.querySelector('#search')?.focus()],['Manage labels','label',()=>openLabelManager()],['Email templates','article',()=>openTemplateManager()],['Settings','settings',()=>openSettings()],['Refresh mailbox','refresh',()=>loadAll(true)]];",
"const commands=[['Compose new email','edit_square',()=>openComposer()],['Go to Inbox','inbox',()=>switchFolder('inbox')],['Go to Sent','send',()=>switchFolder('sent')],['Go to Trash','delete',()=>switchFolder('trash')],['Search mail','search',()=>document.querySelector('#search')?.focus()],['Manage signatures','draw',()=>openSignatureManager()],['Manage labels','label',()=>openLabelManager()],['Email templates','article',()=>openTemplateManager()],['Settings','settings',()=>openSettings()],['Refresh mailbox','refresh',()=>loadAll(true)]];",
'command palette')

sub_once(
    r"async function loadAll\(showToast=false\)\{.*?\n\}\n\nsupabase\.auth\.onAuthStateChange.*?else loginView\(\);",
"""async function loadAll(showToast=false){
  if(!state.session)return;state.loading=true;
  const [m,a,l,ml,c,t,sg,s,f]=await Promise.all([
    supabase.from('frankiflow_mail_messages').select('*').order('created_at',{ascending:false}).limit(1000),
    supabase.from('frankiflow_mail_accounts').select('*').order('is_primary',{ascending:false}),
    supabase.from('frankiflow_mail_labels').select('*').order('name'),
    supabase.from('frankiflow_mail_message_labels').select('*'),
    supabase.from('frankiflow_mail_contacts').select('*').order('last_used_at',{ascending:false}).limit(200),
    supabase.from('frankiflow_mail_templates').select('*').order('name'),
    supabase.from('frankiflow_mail_signatures').select('*').order('is_default',{ascending:false}).order('name'),
    supabase.from('frankiflow_mail_settings').select('*').eq('user_id',currentUser().id).maybeSingle(),
    supabase.from('frankiflow_mail_filters').select('*').order('created_at')
  ]);
  const err=[m,a,l,ml,c,t,sg,s,f].find(x=>x.error)?.error;if(err)return toast(err.message,'error');
  state.messages=m.data||[];state.accounts=a.data||[];state.labels=l.data||[];state.messageLabels=ml.data||[];state.contacts=c.data||[];state.templates=t.data||[];state.signatures=sg.data||[];state.settings=s.data||null;state.filters=f.data||[];
  await wakeSnoozed();await applyFilters();state.loading=false;renderApp();updateDocumentTitle();if(showToast)toast('Mailbox refreshed','refresh');
}

async function requestNotifications(){if(typeof Notification==='undefined')return toast('Desktop notifications are not supported in this browser','warning');if(Notification.permission==='granted')return toast('Desktop notifications are already enabled','notifications_active');const result=await Notification.requestPermission();toast(result==='granted'?'Desktop notifications enabled':'Notifications were not enabled',result==='granted'?'notifications_active':'notifications_off');renderApp();}
function notifyNewMail(m){const who=m.from_name||m.from_address||'New sender';toast(`New mail from ${who}: ${m.subject||'(no subject)'}`,'mark_email_unread');updateDocumentTitle();if(typeof Notification!=='undefined'&&Notification.permission==='granted'&&(document.hidden||!document.hasFocus())){const n=new Notification(`FrankiFlow Mail · ${who}`,{body:m.subject||m.preview||'New email',icon:'/assets/icon.svg',tag:`ffmail-${m.id}`});n.onclick=()=>{window.focus();state.folder='inbox';state.activeId=m.id;renderApp();n.close();};}}
async function setupRealtime(){if(state.realtimeChannel||!state.session)return;state.realtimeChannel=supabase.channel(`frankiflow-mail-live-${currentUser().id}`).on('postgres_changes',{event:'*',schema:'public',table:'frankiflow_mail_messages'},async payload=>{if(payload.eventType==='INSERT'){const row=payload.new;if(!state.messages.some(m=>m.id===row.id))state.messages.unshift(row);if(row.direction==='inbound'&&row.folder==='inbox'){notifyNewMail(row);await applyFilters();}}else if(payload.eventType==='UPDATE'){const i=state.messages.findIndex(m=>m.id===payload.new.id);if(i>=0)state.messages[i]={...state.messages[i],...payload.new};else state.messages.unshift(payload.new);}else if(payload.eventType==='DELETE'){state.messages=state.messages.filter(m=>m.id!==payload.old.id);state.selected.delete(payload.old.id);if(state.activeId===payload.old.id)state.activeId=null;}renderApp();updateDocumentTitle();}).subscribe(status=>{if(status==='CHANNEL_ERROR')toast('Live mailbox connection interrupted','warning');});}
async function teardownRealtime(){if(state.realtimeChannel){await supabase.removeChannel(state.realtimeChannel);state.realtimeChannel=null;}}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateDocumentTitle();});

supabase.auth.onAuthStateChange(async(_event,session)=>{state.session=session;if(session){await loadAll();await setupRealtime();}else{await teardownRealtime();loginView();}});
const {data:{session}}=await supabase.auth.getSession();state.session=session;if(session){await loadAll();await setupRealtime();}else loginView();""",
    'realtime load pipeline')

APP.write_text(text, encoding='utf-8')

css = CSS.read_text(encoding='utf-8')
marker = '/* FrankiFlow Mail power upgrades */'
if marker not in css:
    css += """

/* FrankiFlow Mail power upgrades */
.address-row select { flex: 1; min-width: 0; border: 0; background: transparent; color: inherit; font: inherit; padding: 9px 6px; outline: none; }
.trash-tools { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:8px 0 0 34px; }
.btn-danger-soft { color: #b42318; border-color: rgba(180,35,24,.25); }
.signature { opacity:.88; margin-top:14px; }
[data-theme="dark"] .address-row select { color: #f3f6f8; }
@media (max-width: 760px) { .trash-tools { padding-left: 0; align-items:flex-start; flex-direction:column; } }
"""
    CSS.write_text(css, encoding='utf-8')

sw = SW.read_text(encoding='utf-8')
sw = re.sub(r"const CACHE = 'frankiflow-mail-dev-v\\d+';", "const CACHE = 'frankiflow-mail-dev-v4';", sw)
SW.write_text(sw, encoding='utf-8')

print('FrankiFlow Mail upgrades applied.')
