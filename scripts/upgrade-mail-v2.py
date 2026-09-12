from pathlib import Path
import re

app_path = Path('assets/app.js')
css_path = Path('assets/modern.css')
app = app_path.read_text()
css = css_path.read_text()


def replace_once(old, new, label):
    global app
    if old not in app:
        raise SystemExit(f'Missing patch target: {label}')
    app = app.replace(old, new, 1)

replace_once(
    "const defaultFromAddress=()=>state.accounts.find(a=>a.is_primary)?.address||state.accounts[0]?.address||CONFIG.mailbox;",
    "const defaultFromAddress=()=>state.accounts.find(a=>a.address===state.settings?.default_sender_address)?.address||state.accounts.find(a=>a.is_primary)?.address||state.accounts[0]?.address||CONFIG.mailbox;",
    'default sender'
)

replace_once(
    "function threadFor(m){return m?.thread_id?state.messages.filter(x=>x.thread_id===m.thread_id).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at)):[m].filter(Boolean);}",
    "function threadFor(m){if(state.settings?.conversation_view===false)return[m].filter(Boolean);return m?.thread_id?state.messages.filter(x=>x.thread_id===m.thread_id).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at)):[m].filter(Boolean);}",
    'conversation view'
)

replace_once(
    "  document.body.dataset.density=state.settings?.density||'comfortable';\n}",
    "  document.body.dataset.density=state.settings?.density||'comfortable';\n  document.body.dataset.showPreview=state.settings?.show_message_preview===false?'false':'true';\n  document.body.dataset.previewPane=state.settings?.preview_pane||'right';\n}",
    'theme settings'
)

replace_once('<div class="login-logo">F</div>', '<div class="login-logo mail-logo">${icon(\'mail\')}</div>', 'login mail logo')
replace_once('<div class="brand"><div class="brand-mark">F</div><div class="words"><strong>FrankiFlow Mail</strong><small>Mehr als Reinigung.</small></div></div>', '<div class="brand"><div class="brand-mark">${icon(\'mail\')}</div><div class="words"><strong>FrankiFlow Mail</strong></div></div>', 'sidebar mail logo')
replace_once("if(m&&!m.is_read&&m.direction==='inbound')await patchMessage(m.id,{is_read:true},false);", "if(m&&!m.is_read&&m.direction==='inbound'&&state.settings?.mark_read_on_open!==false)await patchMessage(m.id,{is_read:true},false);", 'mark read setting')

context_target = "  box.querySelectorAll('[data-star]').forEach(b=>b.onclick=async e=>{e.stopPropagation();const m=state.messages.find(x=>x.id===b.dataset.star);await patchMessage(m.id,{is_starred:!m.is_starred});});\n}"
context_replacement = "  box.querySelectorAll('[data-star]').forEach(b=>b.onclick=async e=>{e.stopPropagation();const m=state.messages.find(x=>x.id===b.dataset.star);await patchMessage(m.id,{is_starred:!m.is_starred});});\n  box.oncontextmenu=e=>{const row=e.target.closest('.mail-row');if(!row)return;e.preventDefault();const m=state.messages.find(x=>x.id===row.dataset.id);if(!m)return;const items=m.folder==='trash'?[['Restore to Inbox','restore_from_trash',()=>moveMessage(m.id,'inbox')],['Delete forever','delete_forever',()=>confirmPermanentDelete([m.id]),true]]:[['Archive','archive',()=>moveMessage(m.id,'archive')],['Labels','label',()=>openApplyLabel([m.id])],[m.is_read?'Mark unread':'Mark read',m.is_read?'mark_email_unread':'mark_email_read',()=>patchMessage(m.id,{is_read:!m.is_read})],[m.is_starred?'Unstar':'Star','star',()=>patchMessage(m.id,{is_starred:!m.is_starred})],['Delete','delete',()=>moveMessage(m.id,'trash'),true]];showContextMenu(e.clientX,e.clientY,items);};\n}"
replace_once(context_target, context_replacement, 'mail context menu')

replace_once(
    "<button class=\"toolbar-btn\" id=\"signatureBtn\" title=\"Signature\">${icon('draw')}</button></div>",
    "<button class=\"toolbar-btn\" id=\"signatureBtn\" title=\"Signature\">${icon('draw')}</button><button class=\"toolbar-btn ai-toolbar-btn\" id=\"aiBtn\" title=\"AI writing assistant\">${icon('auto_awesome')}</button></div>",
    'AI composer button'
)
replace_once(
    "const linkButton=el.querySelector('#linkBtn'),templateButton=el.querySelector('#templateBtn'),signatureButton=el.querySelector('#signatureBtn');linkButton.onclick=()=>{const u=prompt('Paste link URL');if(u)document.execCommand('createLink',false,u)};templateButton.onclick=()=>showTemplatePicker(templateButton);signatureButton.onclick=()=>showSignaturePicker(signatureButton);el.querySelector('#cFrom').onchange=()=>{syncDefaultSignature();scheduleAutosave();};",
    "const linkButton=el.querySelector('#linkBtn'),templateButton=el.querySelector('#templateBtn'),signatureButton=el.querySelector('#signatureBtn'),aiButton=el.querySelector('#aiBtn');linkButton.onclick=()=>{const u=prompt('Paste link URL');if(u)document.execCommand('createLink',false,u)};templateButton.onclick=()=>showTemplatePicker(templateButton);signatureButton.onclick=()=>showSignaturePicker(signatureButton);aiButton.onclick=()=>openAIAssistant();el.querySelector('#cFrom').onchange=()=>{syncDefaultSignature();scheduleAutosave();};",
    'AI composer wiring'
)

composer_marker = "function defaultSignatureFor(address){"
if composer_marker not in app:
    raise SystemExit('Missing composer helper marker')
ai_helpers = r'''function sanitizeRichHtml(html=''){
  const tpl=document.createElement('template');tpl.innerHTML=String(html||'');
  tpl.content.querySelectorAll('script,style,iframe,object,embed,form,input,button,svg,video,audio,meta,link').forEach(x=>x.remove());
  const allowed=new Set(['P','DIV','BR','B','STRONG','I','EM','U','A','UL','OL','LI','SPAN','IMG','TABLE','TBODY','THEAD','TR','TD','TH','HR']);
  [...tpl.content.querySelectorAll('*')].forEach(el=>{
    if(!allowed.has(el.tagName)){el.replaceWith(...el.childNodes);return;}
    [...el.attributes].forEach(a=>{const n=a.name.toLowerCase();if(!['href','target','style','src','alt','width','height','title'].includes(n)||n.startsWith('on'))el.removeAttribute(a.name);});
    if(el.tagName==='A'){const href=el.getAttribute('href')||'';if(href&&!/^(https?:|mailto:)/i.test(href))el.removeAttribute('href');else if(href){el.setAttribute('target','_blank');}}
    if(el.tagName==='IMG'){const src=el.getAttribute('src')||'';if(!/^(data:image\/(png|jpe?g|gif|webp);base64,|https?:|cid:)/i.test(src)){el.remove();return;}el.setAttribute('alt',el.getAttribute('alt')||'Logo');}
    const style=el.getAttribute('style');if(style){const safe=style.split(';').map(x=>x.trim()).filter(Boolean).filter(x=>/^(color|background-color|font-size|font-weight|font-style|text-decoration|text-align|font-family|line-height|width|max-width|height|display|margin|margin-top|margin-bottom|padding|border|border-collapse)\s*:/i.test(x)&&!/url\s*\(|expression\s*\(/i.test(x)).join('; ');safe?el.setAttribute('style',safe):el.removeAttribute('style');}
  });
  return tpl.innerHTML;
}
function extractInlineImages(html=''){
  const box=document.createElement('div');box.innerHTML=html;const attachments=[];
  [...box.querySelectorAll('img')].forEach((img,i)=>{const src=img.getAttribute('src')||'';const m=src.match(/^data:(image\/(?:png|jpe?g|gif|webp));base64,(.+)$/i);if(!m)return;const mime=m[1].toLowerCase();const contentId=`ff-inline-${Date.now()}-${i}@frankiflow`;const ext=mime.includes('png')?'png':mime.includes('webp')?'webp':mime.includes('gif')?'gif':'jpg';attachments.push({filename:`inline-${i+1}.${ext}`,content:m[2],contentType:mime,contentId});img.setAttribute('src',`cid:${contentId}`);});
  return{html:box.innerHTML,attachments};
}
function openAIAssistant(){
  if(state.settings?.ai_enabled===false)return toast('AI writing assistant is disabled in Settings','warning');
  const c=state.composer?.el;if(!c)return;const editor=c.querySelector('#cEditor'),subject=c.querySelector('#cSubject');
  const content=`<div class="ai-assistant"><div class="ai-hero">${icon('auto_awesome')}<div><strong>AI writing assistant</strong><small>Generate, improve, translate or rewrite your email.</small></div></div><div class="settings-grid two"><div class="field"><label>Action</label><select id="aiAction"><option value="generate">Generate email</option><option value="improve" ${editor.innerText.trim()?'selected':''}>Improve writing</option><option value="translate">Translate</option><option value="professional">More professional</option><option value="friendly">More friendly</option><option value="shorten">Make shorter</option><option value="expand">Expand</option></select></div><div class="field"><label>Result</label><select id="aiMode"><option value="replace">Replace current body</option><option value="append">Insert below current text</option></select></div></div><div class="field"><label>Prompt / instruction</label><textarea id="aiPrompt" rows="5" placeholder="Example: Write a friendly follow-up asking whether Tuesday at 10:00 works, in German."></textarea></div><div class="ai-note">${icon('lock')} Your prompt is sent through the FrankiFlow server. Signatures are kept separate.</div></div>`;
  openModal('Write with AI',content,async modal=>{
    const save=modal.closest('.modal-backdrop').querySelector('.modalSave');save.disabled=true;save.innerHTML=`${icon('progress_activity')} Generating…`;
    const action=modal.querySelector('#aiAction').value,prompt=modal.querySelector('#aiPrompt').value.trim();
    const {data,error}=await supabase.functions.invoke('mail-ai',{body:{action,prompt,subject:subject.value,text:editor.innerText,model:state.settings?.ai_model||'gpt-5.6-luna',tone:state.settings?.ai_tone||'professional',language:state.settings?.ai_language||'auto'}});
    if(error||data?.error){save.disabled=false;save.textContent='Generate';return toast(data?.error||error?.message||'AI request failed','error');}
    const html=sanitizeRichHtml(data.html||'');if(modal.querySelector('#aiMode').value==='append'&&editor.innerText.trim())editor.insertAdjacentHTML('beforeend',`<br><br>${html}`);else editor.innerHTML=html;
    if(data.subject&&(action==='generate'||!subject.value.trim()))subject.value=data.subject;
    modal.closest('.modal-backdrop').remove();scheduleAutosave();toast('AI draft inserted','auto_awesome');
  },modal=>{const save=modal.closest('.modal-backdrop').querySelector('.modalSave');save.textContent='Generate';});
}
'''
app = app.replace(composer_marker, ai_helpers + composer_marker, 1)

sig_pattern = re.compile(r"function openSignatureManager\(\)\{.*?\n\}\nfunction addFiles", re.S)
new_sig = r'''function openSignatureManager(){
  const accountOptions=`<option value="">All senders</option>${state.accounts.map(a=>`<option value="${a.id}">${esc(a.address)}</option>`).join('')}`;
  const content=`<div class="signature-manager"><div id="signatureList">${state.signatures.map(s=>`<div class="template-item" data-sig-row="${s.id}"><div class="main"><strong>${esc(s.name)}${s.is_default?' · Default':''}</strong><small>${esc(stripHtml(s.html_body)).slice(0,80)}</small></div><button class="icon-btn" data-sig-edit="${s.id}">${icon('edit')}</button><button class="icon-btn" data-sig-delete="${s.id}">${icon('delete')}</button></div>`).join('')||'<p class="muted">No signatures yet.</p>'}</div><input id="sigId" type="hidden"><div class="settings-grid two"><div class="field"><label>Name</label><input id="sigName" placeholder="FrankiFlow standard"></div><div class="field"><label>Use for sender</label><select id="sigAccount">${accountOptions}</select></div></div><div class="field"><label>Signature design</label><div class="rich-toolbar"><button type="button" data-sig-cmd="bold">${icon('format_bold')}</button><button type="button" data-sig-cmd="italic">${icon('format_italic')}</button><button type="button" data-sig-cmd="underline">${icon('format_underlined')}</button><button type="button" data-sig-cmd="insertUnorderedList">${icon('format_list_bulleted')}</button><button type="button" id="sigLinkBtn">${icon('link')}</button><button type="button" id="sigImageBtn">${icon('image')} Logo</button><input id="sigImageInput" class="hidden" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></div><div id="sigEditor" class="signature-editor" contenteditable="true" data-placeholder="Paste a formatted signature here, or build one with the toolbar."></div><small class="muted">Formatted paste is supported. Logo images are embedded in the sent email so recipients can see them.</small></div><label class="setting-row"><div><strong>Default signature</strong><small>Insert automatically for this sender.</small></div><input id="sigDefault" type="checkbox"></label></div>`;
  openModal('Signatures',content,async modal=>{
    const id=modal.querySelector('#sigId').value,name=modal.querySelector('#sigName').value.trim(),editor=modal.querySelector('#sigEditor'),accountId=modal.querySelector('#sigAccount').value||null,isDefault=modal.querySelector('#sigDefault').checked;const html=sanitizeRichHtml(editor.innerHTML);if(!name||!stripHtml(html).trim()&&!html.includes('<img'))return toast('Add a signature name and content','warning');
    if(isDefault){let q=supabase.from('frankiflow_mail_signatures').update({is_default:false,updated_at:new Date().toISOString()}).eq('user_id',currentUser().id);q=accountId?q.eq('account_id',accountId):q.is('account_id',null);await q;}
    const row={user_id:currentUser().id,account_id:accountId,name,html_body:html,is_default:isDefault,updated_at:new Date().toISOString()};const result=id?await supabase.from('frankiflow_mail_signatures').update(row).eq('id',id):await supabase.from('frankiflow_mail_signatures').insert(row);if(result.error)return toast(result.error.message,'error');modal.closest('.modal-backdrop').remove();await loadAll();toast(id?'Signature updated':'Signature created','draw');
  },modal=>{
    const editor=modal.querySelector('#sigEditor');modal.querySelectorAll('[data-sig-cmd]').forEach(b=>b.onclick=()=>{document.execCommand(b.dataset.sigCmd,false,null);editor.focus();});modal.querySelector('#sigLinkBtn').onclick=()=>{const u=prompt('Paste link URL');if(u&&/^https?:|^mailto:/i.test(u)){document.execCommand('createLink',false,u);editor.focus();}};modal.querySelector('#sigImageBtn').onclick=()=>modal.querySelector('#sigImageInput').click();modal.querySelector('#sigImageInput').onchange=e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>1500*1024)return toast('Keep signature logos under 1.5 MB','warning');const r=new FileReader();r.onload=()=>{editor.focus();document.execCommand('insertHTML',false,`<img src="${r.result}" alt="Logo" style="max-width:220px;height:auto;display:block;margin-top:8px;margin-bottom:8px">`);};r.readAsDataURL(file);};editor.addEventListener('paste',()=>setTimeout(()=>{const clean=sanitizeRichHtml(editor.innerHTML);if(clean!==editor.innerHTML)editor.innerHTML=clean;},0));
    modal.querySelectorAll('[data-sig-edit]').forEach(b=>b.onclick=()=>{const s=state.signatures.find(x=>x.id===b.dataset.sigEdit);if(!s)return;modal.querySelector('#sigId').value=s.id;modal.querySelector('#sigName').value=s.name;modal.querySelector('#sigAccount').value=s.account_id||'';editor.innerHTML=s.html_body||'';modal.querySelector('#sigDefault').checked=s.is_default;});
    modal.querySelectorAll('[data-sig-delete]').forEach(b=>b.onclick=async()=>{if(!confirm('Delete this signature?'))return;const {error}=await supabase.from('frankiflow_mail_signatures').delete().eq('id',b.dataset.sigDelete);if(error)return toast(error.message,'error');b.closest('[data-sig-row]')?.remove();state.signatures=state.signatures.filter(s=>s.id!==b.dataset.sigDelete);});
  });
}
function addFiles'''
app, n = sig_pattern.subn(new_sig, app, count=1)
if n != 1:
    raise SystemExit('Signature manager patch failed')

send_pattern = re.compile(r"async function sendComposer\(scheduledAt=null\)\{.*?\}\nfunction showSendMenu", re.S)
new_send = r'''async function sendComposer(scheduledAt=null){const d=composerData();if(!d?.to.trim())return toast('Add at least one recipient','warning');const b=state.composer.el.querySelector('#sendNow');b.disabled=true;b.innerHTML=`${icon('progress_activity')} Sending`;const inline=extractInlineImages(sanitizeRichHtml(d.html));d.html=inline.html;const attachments=[...await filePayload(),...inline.attachments];const ok=await sendMail({...d,scheduledAt,attachments,draft_id:state.composer.draftId});if(ok){state.composer.el.remove();state.composer=null;}else{b.disabled=false;b.innerHTML=`${icon('send')} Send`;}}
function showSendMenu'''
app, n = send_pattern.subn(new_send, app, count=1)
if n != 1:
    raise SystemExit('sendComposer patch failed')

settings_pattern = re.compile(r"function openSettings\(\)\{.*?\nasync function saveSettings", re.S)
new_settings = r'''function openSettings(){const s=state.settings||{};const notificationState=typeof Notification==='undefined'?'Unsupported':Notification.permission;const accounts=state.accounts.map(a=>`<div class="account-setting-row"><span>${icon(a.is_primary?'mark_email_read':'alternate_email')}</span><div><strong>${esc(a.address)}</strong><small>${a.is_primary?'Primary sender':'Secondary sender'}</small></div></div>`).join('');const content=`<div class="settings-hub"><section class="settings-section"><h4>${icon('palette')} Appearance & reading</h4><div class="settings-grid two"><div class="field"><label>Theme</label><select id="setTheme"><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></div><div class="field"><label>Density</label><select id="setDensity"><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></div><div class="field"><label>Preview pane</label><select id="setPreviewPane"><option value="right">Right side</option><option value="off">Off</option></select></div><div class="field"><label>Conversation view</label><select id="setConversation"><option value="true">Group threads</option><option value="false">Single messages</option></select></div></div><label class="setting-row"><div><strong>Message preview text</strong><small>Show the first lines below each subject.</small></div><input id="setShowPreview" type="checkbox"></label><label class="setting-row"><div><strong>Mark mail read when opened</strong><small>Turn off if you prefer to mark messages manually.</small></div><input id="setMarkRead" type="checkbox"></label></section><section class="settings-section"><h4>${icon('edit_note')} Compose & reply</h4><div class="settings-grid two"><div class="field"><label>Default sender</label><select id="setDefaultSender">${state.accounts.map(a=>`<option value="${esc(a.address)}">${esc(a.address)}</option>`).join('')}</select></div><div class="field"><label>Keyboard shortcuts</label><select id="setShortcuts"><option value="true">Enabled</option><option value="false">Disabled</option></select></div></div><label class="setting-row"><div><strong>Automatic signature</strong><small>Insert the default signature for the selected sender.</small></div><input id="setSignatureEnabled" type="checkbox"></label><label class="setting-row"><div><strong>Confirm permanent deletion</strong><small>Ask before a message is deleted forever.</small></div><input id="setConfirmDelete" type="checkbox"></label></section><section class="settings-section"><h4>${icon('notifications')} Notifications</h4><label class="setting-row"><div><strong>New mail notifications</strong><small>Browser permission: ${esc(notificationState)}</small></div><input id="setNotifications" type="checkbox"></label><label class="setting-row"><div><strong>Notification sound</strong><small>Play a short tone for new inbound mail while the app is open.</small></div><input id="setNotificationSound" type="checkbox"></label><button class="btn" id="enableNotificationsBtn">${icon('notifications_active')} Request browser permission</button></section><section class="settings-section"><h4>${icon('auto_awesome')} AI writing assistant</h4><label class="setting-row"><div><strong>Enable AI assistant</strong><small>Generate, improve and translate directly in Compose.</small></div><input id="setAiEnabled" type="checkbox"></label><div class="settings-grid three"><div class="field"><label>Model</label><select id="setAiModel"><option value="gpt-5.6-luna">GPT-5.6 Luna · low cost</option><option value="gpt-5.6-terra">GPT-5.6 Terra · balanced</option><option value="gpt-5.6-sol">GPT-5.6 Sol · highest quality</option></select></div><div class="field"><label>Default tone</label><select id="setAiTone"><option value="professional">Professional</option><option value="friendly">Friendly</option><option value="concise">Concise</option><option value="formal">Formal</option></select></div><div class="field"><label>Default language</label><select id="setAiLanguage"><option value="auto">Auto</option><option value="German">German</option><option value="English">English</option></select></div></div><small class="muted">AI requires an OpenAI API key configured securely in Supabase. The key is never stored in the browser.</small></section><section class="settings-section"><h4>${icon('alternate_email')} Mail accounts</h4><div class="account-settings">${accounts}</div><small class="muted">Inbound messages automatically receive an Info or Mail label based on the address that received them.</small></section><section class="settings-section"><h4>${icon('tune')} Organization & tools</h4><div class="settings-actions"><button class="btn" id="manageSignaturesBtn">${icon('draw')} Signatures</button><button class="btn" id="manageLabelsBtn">${icon('label')} Labels</button><button class="btn" id="manageTemplatesBtn">${icon('article')} Templates</button><button class="btn" id="manageFiltersBtn">${icon('filter_alt')} Filters</button><button class="btn" id="shortcutsBtn">${icon('keyboard')} Shortcuts</button></div></section><section class="settings-section"><h4>${icon('shield')} Storage & safety</h4><div class="settings-status"><span>${icon('delete_sweep')} Trash is permanently purged after 10 days.</span><span>${icon('sync')} Live mailbox updates are enabled.</span></div></section></div>`;openModal('Settings',content,async modal=>{await saveSettings({theme:modal.querySelector('#setTheme').value,density:modal.querySelector('#setDensity').value,preview_pane:modal.querySelector('#setPreviewPane').value,conversation_view:modal.querySelector('#setConversation').value==='true',show_message_preview:modal.querySelector('#setShowPreview').checked,mark_read_on_open:modal.querySelector('#setMarkRead').checked,default_sender_address:modal.querySelector('#setDefaultSender').value,keyboard_shortcuts:modal.querySelector('#setShortcuts').value==='true',signature_enabled:modal.querySelector('#setSignatureEnabled').checked,confirm_permanent_delete:modal.querySelector('#setConfirmDelete').checked,notifications_enabled:modal.querySelector('#setNotifications').checked,notification_sound:modal.querySelector('#setNotificationSound').checked,ai_enabled:modal.querySelector('#setAiEnabled').checked,ai_model:modal.querySelector('#setAiModel').value,ai_tone:modal.querySelector('#setAiTone').value,ai_language:modal.querySelector('#setAiLanguage').value});modal.closest('.modal-backdrop').remove();toast('Settings saved','settings');renderApp();},modal=>{modal.querySelector('#setTheme').value=s.theme||'system';modal.querySelector('#setDensity').value=s.density||'comfortable';modal.querySelector('#setPreviewPane').value=s.preview_pane||'right';modal.querySelector('#setConversation').value=String(s.conversation_view!==false);modal.querySelector('#setShowPreview').checked=s.show_message_preview!==false;modal.querySelector('#setMarkRead').checked=s.mark_read_on_open!==false;modal.querySelector('#setDefaultSender').value=s.default_sender_address||defaultFromAddress();modal.querySelector('#setShortcuts').value=String(s.keyboard_shortcuts!==false);modal.querySelector('#setSignatureEnabled').checked=s.signature_enabled!==false;modal.querySelector('#setConfirmDelete').checked=s.confirm_permanent_delete!==false;modal.querySelector('#setNotifications').checked=s.notifications_enabled!==false;modal.querySelector('#setNotificationSound').checked=s.notification_sound===true;modal.querySelector('#setAiEnabled').checked=s.ai_enabled!==false;modal.querySelector('#setAiModel').value=s.ai_model||'gpt-5.6-luna';modal.querySelector('#setAiTone').value=s.ai_tone||'professional';modal.querySelector('#setAiLanguage').value=s.ai_language||'auto';modal.querySelector('#enableNotificationsBtn').onclick=requestNotifications;modal.querySelector('#manageSignaturesBtn').onclick=()=>{modal.closest('.modal-backdrop').remove();openSignatureManager()};modal.querySelector('#manageLabelsBtn').onclick=()=>{modal.closest('.modal-backdrop').remove();openLabelManager()};modal.querySelector('#manageTemplatesBtn').onclick=()=>{modal.closest('.modal-backdrop').remove();openTemplateManager()};modal.querySelector('#manageFiltersBtn').onclick=()=>{modal.closest('.modal-backdrop').remove();openFilterManager()};modal.querySelector('#shortcutsBtn').onclick=()=>{modal.closest('.modal-backdrop').remove();showShortcuts()};});}
async function saveSettings'''
app, n = settings_pattern.subn(new_settings, app, count=1)
if n != 1:
    raise SystemExit('Settings patch failed')

popover_marker = "let popoverEl=null;"
if popover_marker not in app:
    raise SystemExit('Missing popover marker')
context_helpers = r'''let contextMenuEl=null;
function closeContextMenu(){contextMenuEl?.remove();contextMenuEl=null;}
function showContextMenu(x,y,items){closeContextMenu();closePopover();const p=document.createElement('div');p.className='context-menu';p.innerHTML=items.map(([label,ic,,danger])=>`<button class="${danger?'danger':''}">${icon(ic)}<span>${esc(label)}</span></button>`).join('');document.body.append(p);const r=p.getBoundingClientRect();p.style.left=`${Math.min(innerWidth-r.width-8,Math.max(8,x))}px`;p.style.top=`${Math.min(innerHeight-r.height-8,Math.max(8,y))}px`;[...p.querySelectorAll('button')].forEach((b,i)=>b.onclick=()=>{closeContextMenu();items[i][2]?.();});contextMenuEl=p;setTimeout(()=>document.addEventListener('click',()=>closeContextMenu(),{once:true}),0);}
function confirmPermanentDelete(ids){if(state.settings?.confirm_permanent_delete===false)return hardDeleteMessages(ids);if(confirm(`Delete ${ids.length} message${ids.length>1?'s':''} permanently? This cannot be undone.`))return hardDeleteMessages(ids);}
function playNotificationSound(){if(state.settings?.notification_sound!==true)return;try{const C=window.AudioContext||window.webkitAudioContext;const ctx=new C(),o=ctx.createOscillator(),g=ctx.createGain();o.frequency.value=620;g.gain.setValueAtTime(.035,ctx.currentTime);g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.16);o.connect(g);g.connect(ctx.destination);o.start();o.stop(ctx.currentTime+.17);}catch{}}
async function refreshMessageLabels(messageId){const {data}=await supabase.from('frankiflow_mail_message_labels').select('*').eq('message_id',messageId);state.messageLabels=state.messageLabels.filter(x=>x.message_id!==messageId);state.messageLabels.push(...(data||[]));}
'''
app = app.replace(popover_marker, context_helpers + popover_marker, 1)

notify_pattern = re.compile(r"function notifyNewMail\(m\)\{.*?\}\nasync function setupRealtime\(\)\{.*?\}\nasync function teardownRealtime", re.S)
new_notify = r'''function notifyNewMail(m){const who=m.from_name||m.from_address||'New sender';toast(`New mail from ${who}: ${m.subject||'(no subject)'}`,'mark_email_unread');updateDocumentTitle();playNotificationSound();if(state.settings?.notifications_enabled!==false&&typeof Notification!=='undefined'&&Notification.permission==='granted'&&(document.hidden||!document.hasFocus())){const n=new Notification(`FrankiFlow Mail · ${who}`,{body:m.subject||m.preview||'New email',icon:'/assets/icon.svg',tag:`ffmail-${m.id}`});n.onclick=()=>{window.focus();state.folder='inbox';state.activeId=m.id;renderApp();n.close();};}}
async function setupRealtime(){if(state.realtimeChannel||!state.session)return;state.realtimeChannel=supabase.channel(`frankiflow-mail-live-${currentUser().id}`).on('postgres_changes',{event:'*',schema:'public',table:'frankiflow_mail_messages'},async payload=>{if(payload.eventType==='INSERT'){const row=payload.new;if(!state.messages.some(m=>m.id===row.id))state.messages.unshift(row);await refreshMessageLabels(row.id);if(row.direction==='inbound'&&row.folder==='inbox'){notifyNewMail(row);await applyFilters();}}else if(payload.eventType==='UPDATE'){const i=state.messages.findIndex(m=>m.id===payload.new.id);if(i>=0)state.messages[i]={...state.messages[i],...payload.new};else state.messages.unshift(payload.new);}else if(payload.eventType==='DELETE'){state.messages=state.messages.filter(m=>m.id!==payload.old.id);state.messageLabels=state.messageLabels.filter(x=>x.message_id!==payload.old.id);state.selected.delete(payload.old.id);if(state.activeId===payload.old.id)state.activeId=null;}renderApp();updateDocumentTitle();}).subscribe(status=>{if(status==='CHANNEL_ERROR')toast('Live mailbox connection interrupted','warning');});}
async function teardownRealtime'''
app, n = notify_pattern.subn(new_notify, app, count=1)
if n != 1:
    raise SystemExit('Realtime patch failed')

# Use the setting-aware confirmation in permanent-delete entry points.
app = app.replace("if(!confirm(`Delete ${ids.length} message${ids.length>1?'s':''} permanently? This cannot be undone.`))return;\n    return hardDeleteMessages(ids);", "return confirmPermanentDelete(ids);")
app = app.replace("snoozeBtn.onclick=()=>{if(confirm('Delete this message permanently? This cannot be undone.'))hardDeleteMessages([m.id]);};", "snoozeBtn.onclick=()=>confirmPermanentDelete([m.id]);")
app = app.replace("['Delete forever','delete_forever',()=>{if(confirm('Delete this message permanently? This cannot be undone.'))hardDeleteMessages([m.id]);},true]", "['Delete forever','delete_forever',()=>confirmPermanentDelete([m.id]),true]")

css_marker = '/* FrankiFlow Mail v2 settings, AI, signatures and context menu */'
if css_marker not in css:
    css += r'''

/* FrankiFlow Mail v2 settings, AI, signatures and context menu */
.brand-mark .material-symbols-rounded,.login-logo .material-symbols-rounded{font-size:24px}
.brand .words{display:flex;flex-direction:column;align-items:flex-start}
[data-show-preview="false"] .mail-row .preview{display:none}
@media(min-width:821px){body[data-preview-pane="off"] .shell{grid-template-columns:var(--sidebar-w) minmax(420px,1fr)}body[data-preview-pane="off"] .reader{display:none}}
.ai-toolbar-btn{color:var(--brand-2)!important;background:color-mix(in srgb,var(--brand-soft) 70%,transparent)!important}
.ai-assistant .ai-hero{display:flex;gap:12px;align-items:center;padding:12px;border-radius:14px;background:var(--brand-soft);margin-bottom:14px}.ai-hero>.material-symbols-rounded{font-size:28px;color:var(--brand-2)}.ai-hero strong,.ai-hero small{display:block}.ai-hero small{margin-top:3px;color:var(--muted)}.ai-note{display:flex;align-items:center;gap:7px;font-size:11px;color:var(--muted);padding-top:5px}
.settings-hub{display:grid;gap:14px}.settings-section{border:1px solid var(--line);background:var(--surface-2);border-radius:16px;padding:14px}.settings-section h4{display:flex;align-items:center;gap:8px;margin:0 0 10px;font-size:13px}.settings-grid{display:grid;gap:10px}.settings-grid.two{grid-template-columns:repeat(2,minmax(0,1fr))}.settings-grid.three{grid-template-columns:repeat(3,minmax(0,1fr))}.settings-actions{display:flex;flex-wrap:wrap;gap:8px}.settings-status{display:grid;gap:8px;color:var(--muted);font-size:12px}.settings-status span{display:flex;align-items:center;gap:8px}.account-settings{display:grid;gap:7px}.account-setting-row{display:flex;align-items:center;gap:10px;padding:9px 10px;border:1px solid var(--line);border-radius:11px;background:var(--surface)}.account-setting-row div{display:flex;flex-direction:column}.account-setting-row small{color:var(--muted);margin-top:2px}
.signature-manager{display:grid;gap:12px}.rich-toolbar{display:flex;gap:5px;flex-wrap:wrap;padding:7px;border:1px solid var(--line);border-bottom:0;border-radius:12px 12px 0 0;background:var(--surface-2)}.rich-toolbar button{border:0;background:transparent;color:var(--muted);border-radius:8px;padding:7px;display:inline-flex;align-items:center;gap:5px}.rich-toolbar button:hover{background:var(--surface-3);color:var(--text)}.signature-editor{min-height:170px;max-height:320px;overflow:auto;border:1px solid var(--line);border-radius:0 0 12px 12px;background:var(--surface);padding:14px;outline:none;line-height:1.5}.signature-editor:empty:before{content:attr(data-placeholder);color:var(--muted-2)}.signature-editor img{max-width:100%;height:auto}
.context-menu{position:fixed;z-index:160;min-width:190px;padding:6px;background:var(--surface);border:1px solid var(--line);border-radius:13px;box-shadow:0 18px 55px rgba(0,0,0,.2)}.context-menu button{width:100%;border:0;background:transparent;color:var(--text);display:flex;align-items:center;gap:9px;padding:9px 10px;border-radius:9px;text-align:left}.context-menu button:hover{background:var(--surface-3)}.context-menu button.danger{color:var(--danger)}
.modal:has(.settings-hub),.modal:has(.signature-manager){width:min(820px,calc(100vw - 28px));max-height:min(86vh,900px)}.modal:has(.settings-hub) .modal-body,.modal:has(.signature-manager) .modal-body{overflow:auto}
@media(max-width:720px){.settings-grid.two,.settings-grid.three{grid-template-columns:1fr}.settings-section{padding:12px}.context-menu{min-width:170px}.modal:has(.settings-hub),.modal:has(.signature-manager){width:calc(100vw - 18px)}}
'''

app_path.write_text(app)
css_path.write_text(css)
print('FrankiFlow Mail v2 upgrade applied')
