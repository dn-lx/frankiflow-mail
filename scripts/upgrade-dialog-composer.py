from pathlib import Path

path = Path('assets/enhancements.js')
text = path.read_text(encoding='utf-8')

# 1) Toolbar/menu/send-group styles.
old_css = '''    .ff-dialog-editor-toolbar{display:flex;align-items:center;gap:3px;border:1px solid var(--line,#dfe8eb);border-bottom:0;border-radius:12px 12px 0 0;padding:5px 7px;background:var(--surface-2,#f8fafb)}.ff-dialog-editor-toolbar button{width:32px;height:30px;border:0;background:transparent;border-radius:7px;color:inherit;display:grid;place-items:center;cursor:pointer}.ff-dialog-editor-toolbar button:hover{background:var(--surface-3,#edf3f4)}\n'''
new_css = '''    .ff-dialog-editor-toolbar{display:flex;align-items:center;gap:3px;flex-wrap:wrap;border:1px solid var(--line,#dfe8eb);border-bottom:0;border-radius:12px 12px 0 0;padding:5px 7px;background:var(--surface-2,#f8fafb)}.ff-dialog-editor-toolbar button{width:32px;height:30px;border:0;background:transparent;border-radius:7px;color:inherit;display:grid;place-items:center;cursor:pointer}.ff-dialog-editor-toolbar button:hover{background:var(--surface-3,#edf3f4)}\n    .ff-dialog-toolbar-sep{width:1px;height:22px;background:var(--line,#dfe8eb);margin:0 3px}\n    .ff-dialog-tool-menu{position:fixed;z-index:14050;min-width:210px;max-width:min(320px,calc(100vw - 24px));padding:6px;background:var(--surface,#fff);color:var(--text,#17343d);border:1px solid var(--line,#dce8e5);border-radius:12px;box-shadow:0 16px 42px rgba(8,42,56,.18)}\n    .ff-dialog-tool-menu button{width:100%;border:0;background:transparent;color:inherit;border-radius:9px;padding:9px 10px;display:flex;align-items:center;gap:9px;text-align:left;cursor:pointer;font:inherit;font-size:13px}.ff-dialog-tool-menu button:hover{background:var(--surface-3,#eef4f5)}.ff-dialog-tool-menu button:disabled{opacity:.55;cursor:default;background:transparent}\n    .ff-dialog-tool-menu .material-symbols-rounded{font-size:18px;color:#0b6670}\n'''
if old_css not in text:
    raise SystemExit('Expected dialog toolbar CSS not found; refusing unsafe patch.')
text = text.replace(old_css, new_css, 1)

old_send_css = '''    .ff-dialog-compose-foot{display:flex;align-items:center;gap:8px;margin-top:10px}.ff-dialog-compose-foot .ff-status{font-size:12px;color:var(--muted,#6b8088);min-height:18px}.ff-dialog-compose-foot .ff-status.error{color:#b33b32}.ff-dialog-compose-foot .ff-status.ok{color:#13725f}.ff-dialog-compose-foot .spacer{flex:1}.ff-dialog-send{border:0;border-radius:10px;background:#0b3447;color:#fff;padding:9px 14px;font-weight:800;display:inline-flex;align-items:center;gap:7px;cursor:pointer}.ff-dialog-send:disabled{opacity:.6;cursor:wait}\n'''
new_send_css = '''    .ff-dialog-compose-foot{display:flex;align-items:center;gap:8px;margin-top:10px}.ff-dialog-compose-foot .ff-status{font-size:12px;color:var(--muted,#6b8088);min-height:18px}.ff-dialog-compose-foot .ff-status.error{color:#b33b32}.ff-dialog-compose-foot .ff-status.ok{color:#13725f}.ff-dialog-compose-foot .spacer{flex:1}.ff-dialog-send-group{display:flex;align-items:stretch}.ff-dialog-send{border:0;background:#0b3447;color:#fff;padding:9px 14px;font-weight:800;display:inline-flex;align-items:center;gap:7px;cursor:pointer}.ff-dialog-send:first-child{border-radius:10px 0 0 10px}.ff-dialog-send-menu{width:36px;border:0;border-left:1px solid rgba(255,255,255,.22);border-radius:0 10px 10px 0;background:#0b3447;color:#fff;display:grid;place-items:center;cursor:pointer}.ff-dialog-send:disabled,.ff-dialog-send-menu:disabled{opacity:.6;cursor:wait}\n    .ff-dialog-ai-modal{width:min(650px,94vw)}.ff-dialog-ai-body{padding:22px 24px 24px}.ff-dialog-ai-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.ff-dialog-ai-status{font-size:12px;color:var(--muted,#6b8088);min-height:18px;margin-top:8px}.ff-dialog-ai-status.error{color:#b33b32}.ff-dialog-ai-note{display:flex;align-items:flex-start;gap:7px;margin-top:10px;color:var(--muted,#657a83);font-size:12px;line-height:1.45}\n'''
if old_send_css not in text:
    raise SystemExit('Expected dialog send CSS not found; refusing unsafe patch.')
text = text.replace(old_send_css, new_send_css, 1)

# 2) Add helpers before renderDialogHistory.
anchor = '\nasync function renderDialogHistory(mount, messages, selectedId) {'
if anchor not in text:
    raise SystemExit('renderDialogHistory anchor not found.')
helpers = r'''
function dialogOpenToolMenu(anchor, items=[]) {
  qs('.ff-dialog-tool-menu')?.remove();
  const menu = document.createElement('div');
  menu.className = 'ff-dialog-tool-menu';
  menu.innerHTML = items.map((item,index) => `<button type="button" data-dialog-menu-item="${index}" ${item.disabled?'disabled':''}>${icon(item.icon||'chevron_right')}<span>${esc(item.label||'')}</span></button>`).join('');
  document.body.appendChild(menu);
  const rect = anchor.getBoundingClientRect();
  const left = Math.max(12, Math.min(rect.left, window.innerWidth - menu.offsetWidth - 12));
  const below = rect.bottom + 6;
  const top = below + menu.offsetHeight <= window.innerHeight - 12 ? below : Math.max(12, rect.top - menu.offsetHeight - 6);
  menu.style.left = `${left}px`; menu.style.top = `${top}px`;
  qsa('[data-dialog-menu-item]', menu).forEach(btn => btn.onclick = () => {
    const item = items[Number(btn.dataset.dialogMenuItem)];
    if (!item || item.disabled) return;
    menu.remove(); item.action?.();
  });
  const close = event => {
    if (!menu.isConnected) return document.removeEventListener('pointerdown', close, true);
    if (menu.contains(event.target) || event.target === anchor || anchor.contains?.(event.target)) return;
    menu.remove(); document.removeEventListener('pointerdown', close, true);
  };
  setTimeout(() => document.addEventListener('pointerdown', close, true), 0);
}
function dialogSignatureHtml(sig) {
  return cleanDialogComposeHtml(sig?.html_body || esc(sig?.text_body || '').replace(/\n/g,'<br>'));
}
function dialogInsertSignature(editor, signature) {
  qsa('[data-ff-dialog-signature]', editor).forEach(el => el.remove());
  if (!signature) return editor.focus();
  const html = dialogSignatureHtml(signature);
  if (!html) return;
  if (editor.innerHTML.trim() && !editor.innerHTML.endsWith('<br>')) editor.insertAdjacentHTML('beforeend','<br><br>');
  editor.insertAdjacentHTML('beforeend', `<div class="signature" data-ff-dialog-signature="${esc(signature.id||'legacy')}">${html}</div>`);
  editor.focus();
}
async function dialogShowTemplates(anchor, editor) {
  const { data, error } = await mailDb.from('frankiflow_mail_templates').select('*').order('name');
  if (error) return alert(error.message);
  const templates = data || [];
  const items = templates.map(t => ({ label:t.name || 'Template', icon:'article', action:() => {
    const signature = qs('[data-ff-dialog-signature]', editor)?.outerHTML || '';
    const body = cleanDialogComposeHtml(t.html_body || esc(t.text_body || '').replace(/\n/g,'<br>'));
    editor.innerHTML = body + (signature ? `<br><br>${signature}` : '');
    editor.focus();
  }}));
  if (!items.length) items.push({label:'No templates configured',icon:'article',disabled:true});
  dialogOpenToolMenu(anchor, items);
}
async function dialogShowSignatures(anchor, editor, message, accounts) {
  const { data, error } = await mailDb.from('frankiflow_mail_signatures').select('*').order('is_default',{ascending:false}).order('name');
  if (error) return alert(error.message);
  const from = dialogFromAddress(message, accounts);
  const account = (accounts || []).find(a => a.address === from);
  const signatures = (data || []).filter(s => !s.account_id || s.account_id === account?.id);
  const items = signatures.map(s => ({ label:`${s.name || 'Signature'}${s.is_default?' · default':''}`, icon:'draw', action:() => dialogInsertSignature(editor,s) }));
  items.push({label:'Remove signature',icon:'format_clear',action:() => dialogInsertSignature(editor,null)});
  dialogOpenToolMenu(anchor, items);
}
function dialogExtractInlineImages(html='') {
  const box = document.createElement('div'); box.innerHTML = html; const attachments=[];
  [...box.querySelectorAll('img')].forEach((img,index) => {
    const src = img.getAttribute('src') || '';
    const match = src.match(/^data:(image\/(?:png|jpe?g|gif|webp));base64,(.+)$/i);
    if (!match) return;
    const mime = match[1].toLowerCase();
    const contentId = `ff-dialog-inline-${Date.now()}-${index}@frankiflow`;
    const ext = mime.includes('png')?'png':mime.includes('webp')?'webp':mime.includes('gif')?'gif':'jpg';
    attachments.push({filename:`inline-${index+1}.${ext}`,content:match[2],contentType:mime,contentId});
    img.setAttribute('src',`cid:${contentId}`);
  });
  return {html:box.innerHTML,attachments};
}
async function dialogOpenAIAssistant(editor, message) {
  const currentSession = await session();
  if (!currentSession) return;
  const { data:settings } = await mailDb.from('frankiflow_mail_settings').select('*').eq('user_id',currentSession.user.id).maybeSingle();
  if (settings?.ai_enabled === false) return alert('AI writing assistant is disabled in Settings.');
  qs('.ff-dialog-ai-backdrop')?.remove();
  const back = document.createElement('div');
  back.className = 'ff-meeting-backdrop ff-dialog-ai-backdrop';
  back.innerHTML = `<section class="ff-meeting-modal ff-dialog-ai-modal" role="dialog" aria-modal="true"><header class="ff-meeting-head"><div><h2>Write with Gemini</h2><p>Generate, improve, translate or rewrite this reply.</p></div><button class="icon-btn" id="ffDialogAiClose">${icon('close')}</button></header><div class="ff-dialog-ai-body"><div class="ff-dialog-ai-grid"><div class="ff-field"><label>Action</label><select id="ffDialogAiAction"><option value="generate">Generate reply</option><option value="improve" ${editor.innerText.trim()?'selected':''}>Improve writing</option><option value="translate">Translate</option><option value="professional">More professional</option><option value="friendly">More friendly</option><option value="shorten">Make shorter</option><option value="expand">Expand</option></select></div><div class="ff-field"><label>Result</label><select id="ffDialogAiMode"><option value="replace">Replace current body</option><option value="append">Insert below current text</option></select></div></div><div class="ff-field" style="margin-top:12px"><label>Prompt / instruction</label><textarea id="ffDialogAiPrompt" placeholder="Example: Write a friendly reply confirming Tuesday at 10:00, in German."></textarea></div><div class="ff-dialog-ai-note">${icon('lock')} Your request is sent securely through the FrankiFlow server to Gemini.</div><div class="ff-dialog-ai-status" id="ffDialogAiStatus"></div><div class="ff-meeting-actions"><button type="button" class="ff-secondary" id="ffDialogAiCancel">Cancel</button><button type="button" class="ff-primary" id="ffDialogAiGenerate">${icon('auto_awesome')} Generate</button></div></div></section>`;
  document.body.appendChild(back);
  const close = () => back.remove();
  qs('#ffDialogAiClose',back).onclick = close; qs('#ffDialogAiCancel',back).onclick = close;
  back.addEventListener('click',event => { if (event.target === back) close(); });
  qs('#ffDialogAiGenerate',back).onclick = async () => {
    const button = qs('#ffDialogAiGenerate',back), status = qs('#ffDialogAiStatus',back);
    button.disabled=true; button.innerHTML=`${icon('progress_activity')} Generating…`; status.className='ff-dialog-ai-status'; status.textContent='';
    const action = qs('#ffDialogAiAction',back).value, prompt = qs('#ffDialogAiPrompt',back).value.trim();
    const { data, error } = await mailDb.functions.invoke('mail-ai',{body:{action,prompt,subject:dialogReplySubject(message.subject),text:editor.innerText,model:settings?.ai_model||'gemini-3.5-flash-lite',tone:settings?.ai_tone||'professional',language:settings?.ai_language||'auto'}});
    if (error || data?.error) { status.className='ff-dialog-ai-status error'; status.textContent=data?.error || error?.message || 'Gemini request failed.'; button.disabled=false; button.innerHTML=`${icon('auto_awesome')} Generate`; return; }
    const generated = cleanDialogComposeHtml(data?.html || esc(data?.text || '').replace(/\n/g,'<br>'));
    const signature = qs('[data-ff-dialog-signature]',editor)?.outerHTML || '';
    if (qs('#ffDialogAiMode',back).value === 'append' && editor.innerText.trim()) editor.insertAdjacentHTML('beforeend',`<br><br>${generated}`);
    else editor.innerHTML = generated + (signature ? `<br><br>${signature}` : '');
    close(); editor.focus();
  };
}
function dialogTodayAt(hour) { const d=new Date(); d.setHours(hour,0,0,0); if(d<=new Date())d.setDate(d.getDate()+1); return d.toISOString(); }
function dialogTomorrowAt(hour) { const d=new Date(); d.setDate(d.getDate()+1); d.setHours(hour,0,0,0); return d.toISOString(); }
function dialogOpenSchedulePicker(onSelect) {
  const d = new Date(Date.now()+3600e3); const local = new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);
  const back = document.createElement('div'); back.className='ff-meeting-backdrop ff-dialog-ai-backdrop';
  back.innerHTML=`<section class="ff-meeting-modal ff-dialog-ai-modal" role="dialog" aria-modal="true"><header class="ff-meeting-head"><div><h2>Schedule reply</h2><p>Choose when this reply should be sent.</p></div><button class="icon-btn" id="ffDialogScheduleClose">${icon('close')}</button></header><div class="ff-dialog-ai-body"><div class="ff-field"><label>Send date and time</label><input id="ffDialogScheduleAt" type="datetime-local" value="${local}"></div><div class="ff-meeting-actions"><button type="button" class="ff-secondary" id="ffDialogScheduleCancel">Cancel</button><button type="button" class="ff-primary" id="ffDialogScheduleSave">${icon('schedule')} Schedule</button></div></div></section>`;
  document.body.appendChild(back); const close=()=>back.remove(); qs('#ffDialogScheduleClose',back).onclick=close; qs('#ffDialogScheduleCancel',back).onclick=close; back.addEventListener('click',e=>{if(e.target===back)close()});
  qs('#ffDialogScheduleSave',back).onclick=()=>{const value=qs('#ffDialogScheduleAt',back).value;if(!value)return;const when=new Date(value);if(Number.isNaN(when.getTime())||when<=new Date())return alert('Choose a future date and time.');close();onSelect(when.toISOString());};
}
function dialogShowSendMenu(anchor,onSelect) {
  dialogOpenToolMenu(anchor,[
    {label:'Send now',icon:'send',action:()=>onSelect(null)},
    {label:'Later today · 18:00',icon:'schedule',action:()=>onSelect(dialogTodayAt(18))},
    {label:'Tomorrow · 08:00',icon:'calendar_today',action:()=>onSelect(dialogTomorrowAt(8))},
    {label:'Choose date & time',icon:'edit_calendar',action:()=>dialogOpenSchedulePicker(onSelect)}
  ]);
}
'''
if 'function dialogOpenToolMenu(' in text:
    raise SystemExit('Reply composer helper functions already present; refusing duplicate patch.')
text = text.replace(anchor, '\n' + helpers.strip() + anchor, 1)

# 3) Upgrade send function to support inline signature images and scheduled replies.
text = text.replace(
    'async function sendDialogReply({ message, accounts, mode, editor, files, status, button }) {',
    'async function sendDialogReply({ message, accounts, mode, editor, files, status, button, scheduledAt=null }) {',
    1
)
old_html = "  const html = cleanDialogComposeHtml(editor.innerHTML.trim());\n"
new_html = "  const inline = dialogExtractInlineImages(cleanDialogComposeHtml(editor.innerHTML.trim()));\n  const html = inline.html;\n"
if old_html not in text:
    raise SystemExit('Dialog HTML preparation line not found.')
text = text.replace(old_html,new_html,1)
old_attachments = '      attachments: await dialogFilePayloads(files)\n'
new_attachments = '      attachments: [...await dialogFilePayloads(files), ...inline.attachments],\n      scheduledAt\n'
if old_attachments not in text:
    raise SystemExit('Dialog attachments payload line not found.')
text = text.replace(old_attachments,new_attachments,1)
old_status = "    editor.innerHTML = ''; status.className = 'ff-status ok'; status.textContent = mode === 'replyAll' ? 'Reply all sent.' : 'Reply sent.';\n"
new_status = "    editor.innerHTML = ''; status.className = 'ff-status ok'; status.textContent = scheduledAt ? 'Reply scheduled.' : (mode === 'replyAll' ? 'Reply all sent.' : 'Reply sent.');\n"
if old_status not in text:
    raise SystemExit('Dialog sent status line not found.')
text = text.replace(old_status,new_status,1)

# 4) Replace the limited toolbar and simple send button.
old_toolbar = '''<div class="ff-dialog-editor-toolbar"><button type="button" data-dialog-format="bold" title="Bold">${icon('format_bold')}</button><button type="button" data-dialog-format="italic" title="Italic">${icon('format_italic')}</button><button type="button" data-dialog-format="underline" title="Underline">${icon('format_underlined')}</button><button type="button" data-dialog-format="insertUnorderedList" title="Bulleted list">${icon('format_list_bulleted')}</button></div>'''
new_toolbar = '''<div class="ff-dialog-editor-toolbar"><button type="button" data-dialog-format="bold" title="Bold">${icon('format_bold')}</button><button type="button" data-dialog-format="italic" title="Italic">${icon('format_italic')}</button><button type="button" data-dialog-format="underline" title="Underline">${icon('format_underlined')}</button><span class="ff-dialog-toolbar-sep"></span><button type="button" data-dialog-format="insertUnorderedList" title="Bulleted list">${icon('format_list_bulleted')}</button><button type="button" data-dialog-format="insertOrderedList" title="Numbered list">${icon('format_list_numbered')}</button><button type="button" id="ffDialogLink" title="Insert link">${icon('link')}</button><span class="ff-dialog-toolbar-sep"></span><button type="button" id="ffDialogTemplate" title="Templates">${icon('article')}</button><button type="button" id="ffDialogSignature" title="Signature">${icon('draw')}</button><button type="button" id="ffDialogAi" title="Gemini-powered writing assistant">${icon('auto_awesome')}</button></div>'''
if old_toolbar not in text:
    raise SystemExit('Limited dialog toolbar not found.')
text = text.replace(old_toolbar,new_toolbar,1)
old_footer = '''<span class="spacer"></span><button type="button" class="ff-dialog-send" id="ffDialogSend">${icon('send')} Send</button>'''
new_footer = '''<span class="spacer"></span><div class="ff-dialog-send-group"><button type="button" class="ff-dialog-send" id="ffDialogSend">${icon('send')} Send</button><button type="button" class="ff-dialog-send-menu" id="ffDialogSendMenu" title="Send options" aria-label="Send options">${icon('arrow_drop_down')}</button></div>'''
if old_footer not in text:
    raise SystemExit('Dialog send button not found.')
text = text.replace(old_footer,new_footer,1)

# 5) Wire all new controls.
old_refs = "  const editor = qs('#ffDialogEditor', backdrop), recipient = qs('#ffDialogRecipients', backdrop), status = qs('#ffDialogFootStatus', backdrop), send = qs('#ffDialogSend', backdrop), fileInput = qs('#ffDialogFileInput', backdrop), fileList = qs('#ffDialogFiles', backdrop);\n"
new_refs = "  const editor = qs('#ffDialogEditor', backdrop), recipient = qs('#ffDialogRecipients', backdrop), status = qs('#ffDialogFootStatus', backdrop), send = qs('#ffDialogSend', backdrop), sendMenu = qs('#ffDialogSendMenu', backdrop), fileInput = qs('#ffDialogFileInput', backdrop), fileList = qs('#ffDialogFiles', backdrop);\n"
if old_refs not in text:
    raise SystemExit('Dialog element references not found.')
text = text.replace(old_refs,new_refs,1)
old_wiring = '''  qsa('[data-dialog-format]', backdrop).forEach(btn => btn.onclick = () => { document.execCommand(btn.dataset.dialogFormat,false,null); editor.focus(); });
  qs('#ffDialogAttach', backdrop).onclick = () => fileInput.click();
  fileInput.onchange = () => { files.push(...fileInput.files); fileInput.value=''; renderFiles(); };
  send.onclick = async () => { try { const ok = await sendDialogReply({ message, accounts, mode, editor, files, status, button:send }); if (ok) { files=[]; renderFiles(); setTimeout(async () => { const fresh = await dialogThread(message); await renderDialogHistory(history, fresh, message.id); }, 700); } } catch (sendError) { status.className='ff-status error'; status.textContent=sendError.message || 'Could not send reply.'; } };
  updateRecipients();
'''
new_wiring = '''  qsa('[data-dialog-format]', backdrop).forEach(btn => btn.onclick = () => { document.execCommand(btn.dataset.dialogFormat,false,null); editor.focus(); });
  qs('#ffDialogLink',backdrop).onclick=()=>{const url=prompt('Paste link URL');if(url){document.execCommand('createLink',false,url);editor.focus();}};
  qs('#ffDialogTemplate',backdrop).onclick=event=>dialogShowTemplates(event.currentTarget,editor);
  qs('#ffDialogSignature',backdrop).onclick=event=>dialogShowSignatures(event.currentTarget,editor,message,accounts);
  qs('#ffDialogAi',backdrop).onclick=()=>dialogOpenAIAssistant(editor,message);
  qs('#ffDialogAttach', backdrop).onclick = () => fileInput.click();
  fileInput.onchange = () => { files.push(...fileInput.files); fileInput.value=''; renderFiles(); };
  const performSend = async scheduledAt => { try { const ok = await sendDialogReply({ message, accounts, mode, editor, files, status, button:send, scheduledAt }); if (ok) { files=[]; renderFiles(); setTimeout(async () => { const fresh = await dialogThread(message); await renderDialogHistory(history, fresh, message.id); }, 700); } } catch (sendError) { status.className='ff-status error'; status.textContent=sendError.message || 'Could not send reply.'; } };
  send.onclick = () => performSend(null);
  sendMenu.onclick = event => dialogShowSendMenu(event.currentTarget,performSend);
  updateRecipients();
'''
if old_wiring not in text:
    raise SystemExit('Dialog wiring block not found.')
text = text.replace(old_wiring,new_wiring,1)

path.write_text(text,encoding='utf-8')
print('Reply composer upgraded to full feature parity.')
