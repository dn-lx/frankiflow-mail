from pathlib import Path

app_path = Path('assets/app.js')
css_path = Path('assets/modern.css')
sw_path = Path('sw.js')
app = app_path.read_text()
css = css_path.read_text()
sw = sw_path.read_text()

def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'Missing expected snippet: {label}')
    return text.replace(old, new, 1)

def replace_block(text, start, end, new, label):
    a = text.find(start)
    if a < 0:
        raise SystemExit(f'Missing block start: {label}')
    b = text.find(end, a)
    if b < 0:
        raise SystemExit(f'Missing block end: {label}')
    return text[:a] + new + '\n' + text[b:]

# Remove redundant Inbox category tabs and filtering.
app = app.replace("const CATEGORIES=[['all','All'],['primary','Primary'],['clients','Clients'],['bookings','Bookings'],['finance','Finance']];\n", "")
app = app.replace("  if(state.folder==='inbox'&&state.category!=='all')list=list.filter(m=>(m.category||'primary')===state.category);\n", "")
old_heading = "${state.folder==='inbox'?`<div class=\"category-tabs\">${CATEGORIES.map(([id,n])=>`<button class=\"category-tab ${state.category===id?'active':''}\" data-category=\"${id}\">${n}</button>`).join('')}</div>`:''}"
app = app.replace(old_heading, "")
app = app.replace("  document.querySelectorAll('[data-category]').forEach(b=>b.onclick=()=>{state.category=b.dataset.category;renderApp();});\n", "")

# Add meeting scheduling button to composer.
app = replace_once(
    app,
    '<button class="toolbar-btn" id="signatureBtn" title="Signature">${icon(\'draw\')}</button><button class="toolbar-btn ai-toolbar-btn" id="aiBtn" title="AI writing assistant">${icon(\'auto_awesome\')}</button>',
    '<button class="toolbar-btn" id="signatureBtn" title="Signature">${icon(\'draw\')}</button><button class="toolbar-btn" id="meetingBtn" title="Schedule meeting">${icon(\'event\')}</button><button class="toolbar-btn ai-toolbar-btn" id="aiBtn" title="Gemini-powered writing assistant">${icon(\'auto_awesome\')}</button>',
    'composer meeting button',
)
app = replace_once(
    app,
    "document.body.append(el);state.composer={el,seed,files:[],draftId:seed.draftId||null,saveTimer:null,selectedSignatureId:null};",
    "document.body.append(el);state.composer={el,seed,files:[],draftId:seed.draftId||null,saveTimer:null,selectedSignatureId:null,meeting:seed.meeting||null};",
    'composer meeting state',
)
old_bind = "const linkButton=el.querySelector('#linkBtn'),templateButton=el.querySelector('#templateBtn'),signatureButton=el.querySelector('#signatureBtn'),aiButton=el.querySelector('#aiBtn');linkButton.onclick=()=>{const u=prompt('Paste link URL');if(u)document.execCommand('createLink',false,u)};templateButton.onclick=()=>showTemplatePicker(templateButton);signatureButton.onclick=()=>showSignaturePicker(signatureButton);aiButton.onclick=()=>openAIAssistant();el.querySelector('#cFrom').onchange=()=>{syncDefaultSignature();scheduleAutosave();};"
new_bind = "const linkButton=el.querySelector('#linkBtn'),templateButton=el.querySelector('#templateBtn'),signatureButton=el.querySelector('#signatureBtn'),meetingButton=el.querySelector('#meetingBtn'),aiButton=el.querySelector('#aiBtn');linkButton.onclick=()=>{const u=prompt('Paste link URL');if(u)document.execCommand('createLink',false,u)};templateButton.onclick=()=>showTemplatePicker(templateButton);signatureButton.onclick=()=>showSignaturePicker(signatureButton);meetingButton.onclick=()=>openMeetingScheduler();aiButton.onclick=()=>openAIAssistant();el.querySelector('#cFrom').onchange=()=>{syncDefaultSignature();scheduleAutosave();};"
app = replace_once(app, old_bind, new_bind, 'composer control binding')

# Replace OpenAI UI with Gemini UI.
ai_start = "function openAIAssistant(){"
ai_end = "function defaultSignatureFor(address){"
ai_block = r'''function openAIAssistant(){
  if(state.settings?.ai_enabled===false)return toast('AI writing assistant is disabled in Settings','warning');
  const c=state.composer?.el;if(!c)return;const editor=c.querySelector('#cEditor'),subject=c.querySelector('#cSubject');
  const content=`<div class="ai-assistant"><div class="ai-hero">${icon('auto_awesome')}<div><strong>Gemini-powered writing assistant</strong><small>Generate, improve, translate or rewrite your email with Gemini.</small></div><span class="gemini-badge">Powered by Gemini</span></div><div class="settings-grid two"><div class="field"><label>Action</label><select id="aiAction"><option value="generate">Generate email</option><option value="improve" ${editor.innerText.trim()?'selected':''}>Improve writing</option><option value="translate">Translate</option><option value="professional">More professional</option><option value="friendly">More friendly</option><option value="shorten">Make shorter</option><option value="expand">Expand</option></select></div><div class="field"><label>Result</label><select id="aiMode"><option value="replace">Replace current body</option><option value="append">Insert below current text</option></select></div></div><div class="field"><label>Prompt / instruction</label><textarea id="aiPrompt" rows="5" placeholder="Example: Write a friendly follow-up asking whether Tuesday at 10:00 works, in German."></textarea></div><div class="ai-note">${icon('lock')} Your prompt is sent securely through the FrankiFlow server to Gemini. Signatures are kept separate.</div></div>`;
  openModal('Write with Gemini',content,async modal=>{
    const save=modal.closest('.modal-backdrop').querySelector('.modalSave');save.disabled=true;save.innerHTML=`${icon('progress_activity')} Generating…`;
    const action=modal.querySelector('#aiAction').value,prompt=modal.querySelector('#aiPrompt').value.trim();
    const {data,error}=await supabase.functions.invoke('mail-ai',{body:{action,prompt,subject:subject.value,text:editor.innerText,model:state.settings?.ai_model||'gemini-3.5-flash-lite',tone:state.settings?.ai_tone||'professional',language:state.settings?.ai_language||'auto'}});
    if(error||data?.error){save.disabled=false;save.textContent='Generate';let detail=await edgeFunctionErrorMessage(error,data,'Gemini request failed');if(detail.includes('GEMINI_API_KEY')||detail.includes('GOOGLE_API_KEY'))detail='Gemini is not configured yet. Add GEMINI_API_KEY in Supabase → Edge Function Secrets.';return toast(detail,'error');}
    const html=sanitizeRichHtml(data.html||'');if(modal.querySelector('#aiMode').value==='append'&&editor.innerText.trim())editor.insertAdjacentHTML('beforeend',`<br><br>${html}`);else editor.innerHTML=html;
    if(data.subject&&(action==='generate'||!subject.value.trim()))subject.value=data.subject;
    modal.closest('.modal-backdrop').remove();scheduleAutosave();toast('Gemini draft inserted','auto_awesome');
  },modal=>{const save=modal.closest('.modal-backdrop').querySelector('.modalSave');save.textContent='Generate';});
}'''
app = replace_block(app, ai_start, ai_end, ai_block, 'Gemini assistant')

# Add meeting scheduler + ICS generation.
meeting_code = r'''function localDateTimeValue(date){const d=new Date(date.getTime()-date.getTimezoneOffset()*60000);return d.toISOString().slice(0,16);}
function icsEscape(v=''){return String(v).replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');}
function icsUtc(v){return new Date(v).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');}
function utf8Base64(text){const bytes=new TextEncoder().encode(text);let binary='';for(const b of bytes)binary+=String.fromCharCode(b);return btoa(binary);}
function meetingProviderLabel(provider){return provider==='teams'?'Microsoft Teams':provider==='zoom'?'Zoom':provider==='custom'?'Online meeting':'Meeting';}
function meetingAttachmentPayload(){
  const meeting=state.composer?.meeting;if(!meeting)return null;const d=composerData();if(!d)return null;
  const attendees=[...new Set([...splitAddr(d.to),...splitAddr(d.cc)].map(x=>x.toLowerCase()))];
  const uid=`${crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`}@frankiflow.de`;
  const description=[meeting.notes||'',meeting.joinUrl?`${meetingProviderLabel(meeting.provider)}: ${meeting.joinUrl}`:''].filter(Boolean).join('\n\n');
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//FrankiFlow Mail//Meeting Invitation//EN','CALSCALE:GREGORIAN','METHOD:REQUEST','BEGIN:VEVENT',`UID:${uid}`,`DTSTAMP:${icsUtc(new Date())}`,`DTSTART:${icsUtc(meeting.start)}`,`DTEND:${icsUtc(meeting.end)}`,`SUMMARY:${icsEscape(meeting.title)}`,`ORGANIZER:mailto:${icsEscape(d.fromAddress)}`];
  attendees.forEach(email=>lines.push(`ATTENDEE;ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:${icsEscape(email)}`));
  if(meeting.location)lines.push(`LOCATION:${icsEscape(meeting.location)}`);if(meeting.joinUrl)lines.push(`URL:${icsEscape(meeting.joinUrl)}`);if(description)lines.push(`DESCRIPTION:${icsEscape(description)}`);
  lines.push('STATUS:CONFIRMED','SEQUENCE:0','END:VEVENT','END:VCALENDAR');
  const filename=`${meeting.title||'meeting'}`.replace(/[^a-z0-9_-]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,60)||'meeting';
  return{filename:`${filename}.ics`,content:utf8Base64(lines.join('\r\n')),contentType:'text/calendar; charset=utf-8; method=REQUEST'};
}
function renderMeetingCard(meeting){const provider=meetingProviderLabel(meeting.provider),when=`${new Date(meeting.start).toLocaleString([], {dateStyle:'medium',timeStyle:'short'})} – ${new Date(meeting.end).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`;return`<div class="meeting-card" data-ff-meeting="true"><strong>${esc(meeting.title)}</strong><div>${icon('schedule')} ${esc(when)} · ${esc(meeting.timezone)}</div>${meeting.location?`<div>${icon('location_on')} ${esc(meeting.location)}</div>`:''}${meeting.joinUrl?`<div>${icon(meeting.provider==='teams'?'groups':'videocam')} <a href="${esc(meeting.joinUrl)}" target="_blank">Join ${esc(provider)}</a></div>`:''}${meeting.notes?`<p>${esc(meeting.notes).replace(/\n/g,'<br>')}</p>`:''}</div>`;}
function openMeetingScheduler(){
  const c=state.composer?.el;if(!c)return;const existing=state.composer?.meeting;const base=new Date(Date.now()+60*60000);base.setMinutes(Math.ceil(base.getMinutes()/30)*30,0,0);const finish=new Date(base.getTime()+30*60000);const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone||'Europe/Berlin';
  const attendees=existing?.attendees||[...new Set([...splitAddr(c.querySelector('#cTo').value),...splitAddr(c.querySelector('#cCc').value)])].join(', ');
  const content=`<div class="meeting-scheduler"><div class="meeting-hero">${icon('event')}<div><strong>Meeting invitation</strong><small>Create an .ics calendar invite and include a Teams, Zoom or other meeting link.</small></div></div><div class="field"><label>Meeting title</label><input id="meetTitle" value="${esc(existing?.title||c.querySelector('#cSubject').value||'Meeting')}"></div><div class="settings-grid two"><div class="field"><label>Starts</label><input id="meetStart" type="datetime-local" value="${esc(existing?localDateTimeValue(new Date(existing.start)):localDateTimeValue(base))}"></div><div class="field"><label>Ends</label><input id="meetEnd" type="datetime-local" value="${esc(existing?localDateTimeValue(new Date(existing.end)):localDateTimeValue(finish))}"></div></div><div class="settings-grid two"><div class="field"><label>Time zone</label><input id="meetTimezone" value="${esc(existing?.timezone||timezone)}"></div><div class="field"><label>Meeting type</label><select id="meetProvider"><option value="none">No online link</option><option value="teams">Microsoft Teams</option><option value="zoom">Zoom</option><option value="custom">Other online meeting</option></select></div></div><div class="field" id="meetingUrlField"><label>Meeting link</label><input id="meetUrl" type="url" value="${esc(existing?.joinUrl||'')}" placeholder="https://teams.microsoft.com/... or https://zoom.us/..."></div><div class="field"><label>Location</label><input id="meetLocation" value="${esc(existing?.location||'')}" placeholder="Optional physical location"></div><div class="field"><label>Attendees</label><input id="meetAttendees" value="${esc(attendees)}" placeholder="name@example.com, another@example.com"><small class="muted">Attendees are also added to the email To field if it is empty.</small></div><div class="field"><label>Notes</label><textarea id="meetNotes" rows="4" placeholder="Agenda or preparation notes">${esc(existing?.notes||'')}</textarea></div></div>`;
  openModal(existing?'Edit meeting':'Schedule meeting',content,modal=>{
    const title=modal.querySelector('#meetTitle').value.trim(),start=new Date(modal.querySelector('#meetStart').value),end=new Date(modal.querySelector('#meetEnd').value),provider=modal.querySelector('#meetProvider').value,joinUrl=modal.querySelector('#meetUrl').value.trim();if(!title)return toast('Add a meeting title','warning');if(!start.getTime()||!end.getTime()||end<=start)return toast('Meeting end time must be after the start time','warning');if(['teams','zoom','custom'].includes(provider)&&!/^https:\/\//i.test(joinUrl))return toast('Add a valid https meeting link','warning');
    const meeting={title,start:start.toISOString(),end:end.toISOString(),timezone:modal.querySelector('#meetTimezone').value.trim()||timezone,provider,joinUrl,location:modal.querySelector('#meetLocation').value.trim(),notes:modal.querySelector('#meetNotes').value.trim(),attendees:modal.querySelector('#meetAttendees').value.trim()};state.composer.meeting=meeting;
    const attendeeList=splitAddr(meeting.attendees);if(attendeeList.length&&!c.querySelector('#cTo').value.trim())c.querySelector('#cTo').value=attendeeList.join(', ');if(!c.querySelector('#cSubject').value.trim())c.querySelector('#cSubject').value=meeting.title;
    const editor=c.querySelector('#cEditor');editor.querySelectorAll('[data-ff-meeting]').forEach(x=>x.remove());editor.insertAdjacentHTML('afterbegin',`${renderMeetingCard(meeting)}<br>`);modal.closest('.modal-backdrop').remove();scheduleAutosave();toast('Meeting invitation added','event');
  },modal=>{const provider=modal.querySelector('#meetProvider'),urlField=modal.querySelector('#meetingUrlField'),url=modal.querySelector('#meetUrl');provider.value=existing?.provider||'none';const update=()=>{const online=provider.value!=='none';urlField.classList.toggle('hidden',!online);url.placeholder=provider.value==='teams'?'https://teams.microsoft.com/l/meetup-join/...':provider.value==='zoom'?'https://company.zoom.us/j/...':'https://...';};provider.onchange=update;update();});
}
'''
app = replace_once(app, "function showSendMenu(anchor){", meeting_code + "\nfunction showSendMenu(anchor){", 'meeting helpers')

old_send = "async function sendComposer(scheduledAt=null){const d=composerData();if(!d?.to.trim())return toast('Add at least one recipient','warning');const b=state.composer.el.querySelector('#sendNow');b.disabled=true;b.innerHTML=`${icon('progress_activity')} Sending`;const inline=extractInlineImages(sanitizeRichHtml(d.html));d.html=inline.html;const attachments=[...await filePayload(),...inline.attachments];const ok=await sendMail({...d,scheduledAt,attachments,draft_id:state.composer.draftId});if(ok){state.composer.el.remove();state.composer=null;}else{b.disabled=false;b.innerHTML=`${icon('send')} Send`;}}"
new_send = "async function sendComposer(scheduledAt=null){const d=composerData();if(!d?.to.trim())return toast('Add at least one recipient','warning');const b=state.composer.el.querySelector('#sendNow');b.disabled=true;b.innerHTML=`${icon('progress_activity')} Sending`;const inline=extractInlineImages(sanitizeRichHtml(d.html));d.html=inline.html;const meetingAttachment=meetingAttachmentPayload();const attachments=[...await filePayload(),...inline.attachments,...(meetingAttachment?[meetingAttachment]:[])];const ok=await sendMail({...d,scheduledAt,attachments,draft_id:state.composer.draftId});if(ok){state.composer.el.remove();state.composer=null;}else{b.disabled=false;b.innerHTML=`${icon('send')} Send`;}}"
app = replace_once(app, old_send, new_send, 'meeting attachment send')

# Replace filter UI and logic with a richer rule builder.
filter_block = r'''function openFilterManager(){
  const filters=state.filters||[];const labelOptions=`<option value="">No label</option>${state.labels.map(l=>`<option value="${l.id}">${esc(l.name)}</option>`).join('')}`;const accountOptions=`<option value="">Any receiving address</option>${state.accounts.map(a=>`<option value="${esc(a.address)}">${esc(a.address)}</option>`).join('')}`;
  const content=`<div class="filter-list">${filters.map(f=>`<div class="template-item filter-row"><div class="main"><strong>${esc(f.name)}</strong><small>${esc(filterSummary(f))}</small></div><span class="status-pill ${f.active===false?'off':''}">${f.active===false?'Paused':'Active'}</span><button class="icon-btn" data-filter-toggle="${f.id}" title="${f.active===false?'Enable':'Pause'}">${icon(f.active===false?'play_arrow':'pause')}</button><button class="icon-btn" data-filter-delete="${f.id}">${icon('delete')}</button></div>`).join('')||'<p class="muted">No filters yet. Build rules using sender, recipient, subject, body, attachments and receiving account.</p>'}</div><div class="filter-builder"><div class="field"><label>Filter name</label><input id="filterName" placeholder="Invoices from suppliers"></div><div class="filter-subhead">Match incoming mail when…</div><div class="settings-grid two"><div class="field"><label>From contains</label><input id="filterFrom" placeholder="billing@ or @supplier.com"></div><div class="field"><label>To contains</label><input id="filterTo" placeholder="accounts@client.com"></div><div class="field"><label>Subject contains</label><input id="filterSubject" placeholder="invoice"></div><div class="field"><label>Body contains</label><input id="filterBody" placeholder="payment due"></div><div class="field"><label>Received at</label><select id="filterAccount">${accountOptions}</select></div><div class="field"><label>Attachments</label><select id="filterAttachment"><option value="">Any</option><option value="yes">Has attachment</option><option value="no">No attachment</option></select></div></div><div class="filter-subhead">Then…</div><div class="settings-grid two"><div class="field"><label>Apply label</label><select id="filterLabel">${labelOptions}</select></div><div class="field"><label>Move message</label><select id="filterFolder"><option value="">Leave in Inbox</option><option value="archive">Archive</option><option value="spam">Spam</option><option value="trash">Trash</option></select></div></div><div class="filter-actions-grid"><label><input id="filterRead" type="checkbox"> Mark as read</label><label><input id="filterStar" type="checkbox"> Star</label><label><input id="filterImportant" type="checkbox"> High priority</label><label><input id="filterPin" type="checkbox"> Pin</label><label><input id="filterStop" type="checkbox"> Stop processing more filters</label></div></div>`;
  openModal('Mail filters',content,async modal=>{const name=modal.querySelector('#filterName').value.trim();if(!name)return toast('Add a filter name','warning');const conditions={from_contains:modal.querySelector('#filterFrom').value.trim(),to_contains:modal.querySelector('#filterTo').value.trim(),subject_contains:modal.querySelector('#filterSubject').value.trim(),body_contains:modal.querySelector('#filterBody').value.trim(),account_address:modal.querySelector('#filterAccount').value||'',has_attachment:modal.querySelector('#filterAttachment').value||''};if(!Object.values(conditions).some(Boolean))return toast('Add at least one matching condition','warning');const actions={};const labelId=modal.querySelector('#filterLabel').value,folder=modal.querySelector('#filterFolder').value;if(labelId)actions.label_id=labelId;if(folder)actions.folder=folder;if(modal.querySelector('#filterRead').checked)actions.is_read=true;if(modal.querySelector('#filterStar').checked)actions.is_starred=true;if(modal.querySelector('#filterImportant').checked)actions.priority='high';if(modal.querySelector('#filterPin').checked)actions.is_pinned=true;if(modal.querySelector('#filterStop').checked)actions.stop_processing=true;if(!Object.keys(actions).length)return toast('Choose at least one action','warning');const {error}=await supabase.from('frankiflow_mail_filters').insert({name,conditions,actions,created_by:currentUser().id,active:true});if(error)return toast(error.message,'error');modal.closest('.modal-backdrop').remove();await loadAll();toast('Filter created','filter_alt');},modal=>{modal.querySelectorAll('[data-filter-delete]').forEach(b=>b.onclick=async()=>{const {error}=await supabase.from('frankiflow_mail_filters').delete().eq('id',b.dataset.filterDelete);if(error)return toast(error.message,'error');b.closest('.filter-row')?.remove();state.filters=state.filters.filter(f=>f.id!==b.dataset.filterDelete);});modal.querySelectorAll('[data-filter-toggle]').forEach(b=>b.onclick=async()=>{const f=state.filters.find(x=>x.id===b.dataset.filterToggle);if(!f)return;const active=f.active===false;const {error}=await supabase.from('frankiflow_mail_filters').update({active,updated_at:new Date().toISOString()}).eq('id',f.id);if(error)return toast(error.message,'error');modal.closest('.modal-backdrop').remove();await loadAll();openFilterManager();});});
}
function filterSummary(f){const c=f.conditions||{},a=f.actions||{},parts=[];if(c.from_contains)parts.push(`from “${c.from_contains}”`);if(c.to_contains)parts.push(`to “${c.to_contains}”`);if(c.subject_contains)parts.push(`subject “${c.subject_contains}”`);if(c.body_contains)parts.push(`body “${c.body_contains}”`);if(c.account_address)parts.push(`received at ${c.account_address}`);if(c.has_attachment==='yes')parts.push('has attachment');if(c.has_attachment==='no')parts.push('no attachment');const actions=[];if(a.label_id)actions.push(`label ${state.labels.find(l=>l.id===a.label_id)?.name||'selected'}`);if(a.folder)actions.push(`move to ${a.folder}`);if(a.is_read)actions.push('mark read');if(a.is_starred)actions.push('star');if(a.priority==='high')actions.push('high priority');if(a.is_pinned)actions.push('pin');return`${parts.join(' · ')||'Any inbound mail'} → ${actions.join(', ')||'No action'}`;}
async function applyFilters(){
  if(!state.filters?.length)return;for(const m of state.messages.filter(x=>x.direction==='inbound'&&x.folder==='inbox')){for(const f of state.filters.filter(x=>x.active!==false)){const c=f.conditions||{},account=accountForMessage(m)?.address||arr(m.to_addresses)[0]||'',body=String(m.text_body||stripHtml(m.html_body)||'').toLowerCase();if(c.from_contains&&!String(m.from_address||'').toLowerCase().includes(String(c.from_contains).toLowerCase()))continue;if(c.to_contains&&![...arr(m.to_addresses),...arr(m.cc_addresses)].join(' ').toLowerCase().includes(String(c.to_contains).toLowerCase()))continue;if(c.subject_contains&&!String(m.subject||'').toLowerCase().includes(String(c.subject_contains).toLowerCase()))continue;if(c.body_contains&&!body.includes(String(c.body_contains).toLowerCase()))continue;if(c.account_address&&String(account).toLowerCase()!==String(c.account_address).toLowerCase())continue;if(c.has_attachment==='yes'&&!m.has_attachments)continue;if(c.has_attachment==='no'&&m.has_attachments)continue;const a=f.actions||{},patch={};for(const key of ['folder','is_read','is_starred','priority','is_pinned'])if(a[key]!==undefined)patch[key]=a[key];if(a.folder==='trash')patch.trashed_at=new Date().toISOString();if(Object.keys(patch).length){await supabase.from('frankiflow_mail_messages').update({...patch,updated_at:new Date().toISOString()}).eq('id',m.id);Object.assign(m,patch);}if(a.label_id){await supabase.from('frankiflow_mail_message_labels').upsert({message_id:m.id,label_id:a.label_id},{onConflict:'message_id,label_id'});if(!state.messageLabels.some(x=>x.message_id===m.id&&x.label_id===a.label_id))state.messageLabels.push({message_id:m.id,label_id:a.label_id});}if(a.stop_processing)break;}}
}'''
app = replace_block(app, "function openFilterManager(){", "function openSettings(){", filter_block, 'advanced filters')

# Update Settings AI models and Gemini branding.
app = app.replace('<option value="gpt-5.6-luna">GPT-5.6 Luna · low cost</option><option value="gpt-5.6-terra">GPT-5.6 Terra · balanced</option><option value="gpt-5.6-sol">GPT-5.6 Sol · highest quality</option>', '<option value="gemini-3.5-flash-lite">Gemini 3.5 Flash-Lite · low cost</option><option value="gemini-3.5-flash">Gemini 3.5 Flash · balanced</option><option value="gemini-3.8-flash">Gemini 3.8 Flash · highest quality</option>')
app = app.replace('AI requires an OpenAI API key configured securely in Supabase. The key is never stored in the browser.', 'Powered by Gemini. The Gemini API key is stored securely in Supabase and is never exposed to the browser.')
app = app.replace("s.ai_model||'gpt-5.6-luna'", "s.ai_model||'gemini-3.5-flash-lite'")
app = app.replace('Generate, improve and translate directly in Compose.', 'Generate, improve and translate directly in Compose with Gemini.')

# CSS: fix account alignment, scrollbars, filters, meetings, Gemini badge.
css += r'''

/* FrankiFlow Mail v4 polish */
.account-setting-row.editable{display:grid!important;grid-template-columns:30px minmax(0,1fr);gap:12px;align-items:start!important;padding:14px!important;border:1px solid var(--line)!important;border-radius:13px!important;background:var(--surface)!important}
.account-setting-row.editable>.material-symbols-rounded{margin-top:2px;color:var(--brand-2)}
.account-setting-row .account-setting-main{display:block!important;min-width:0}
.account-setting-row .account-edit-grid{display:grid!important;grid-template-columns:minmax(220px,1fr) auto!important;gap:14px!important;align-items:end!important;margin-top:12px!important}
.account-setting-row .account-edit-grid label{display:block!important;min-width:0}
.account-setting-row .account-default{display:flex!important;flex-direction:row!important;align-items:center!important;justify-content:flex-end!important;min-height:40px}
.account-display-name{box-sizing:border-box;height:40px}
@media(max-width:620px){.account-setting-row .account-edit-grid{grid-template-columns:1fr!important}.account-setting-row .account-default{justify-content:flex-start!important}}

/* Calm, narrow scrollbars; never show a horizontal label scrollbar. */
*{scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--muted) 45%,transparent) transparent}
*::-webkit-scrollbar{width:8px;height:8px}
*::-webkit-scrollbar-track{background:transparent}
*::-webkit-scrollbar-thumb{background:color-mix(in srgb,var(--muted) 42%,transparent);border:2px solid transparent;background-clip:content-box;border-radius:999px}
*::-webkit-scrollbar-thumb:hover{background:color-mix(in srgb,var(--muted) 62%,transparent);border:2px solid transparent;background-clip:content-box}
.labels-scroll{overflow-y:auto!important;overflow-x:hidden!important;scrollbar-gutter:stable;padding-right:3px;min-width:0}
.labels-scroll .nav-btn{width:100%;min-width:0;box-sizing:border-box}
.labels-scroll .nav-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

.gemini-badge{margin-left:auto;white-space:nowrap;border:1px solid color-mix(in srgb,var(--brand-2) 28%,var(--line));background:var(--surface);color:var(--brand-2);border-radius:999px;padding:5px 8px;font-size:9px;font-weight:800}
.filter-list{display:grid;gap:8px;margin-bottom:14px}.filter-row{gap:8px}.status-pill{font-size:9px;font-weight:800;border-radius:999px;padding:4px 7px;background:color-mix(in srgb,var(--success) 13%,var(--surface));color:var(--success)}.status-pill.off{background:var(--surface-3);color:var(--muted)}
.filter-builder{border-top:1px solid var(--line);padding-top:14px}.filter-subhead{font-size:11px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin:12px 0 8px}.filter-actions-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 14px;margin-top:12px}.filter-actions-grid label{display:flex;align-items:center;gap:8px;font-size:12px}
.modal:has(.filter-builder){width:min(760px,calc(100vw - 28px));max-height:86vh}.modal:has(.filter-builder) .modal-body{overflow:auto}
.meeting-scheduler{display:grid;gap:11px}.meeting-hero{display:flex;align-items:center;gap:10px;padding:12px;border-radius:13px;background:var(--brand-soft)}.meeting-hero>.material-symbols-rounded{color:var(--brand-2);font-size:28px}.meeting-hero strong,.meeting-hero small{display:block}.meeting-hero small{margin-top:3px;color:var(--muted)}
.meeting-card{border:1px solid color-mix(in srgb,var(--brand-2) 22%,var(--line));background:color-mix(in srgb,var(--brand-soft) 55%,var(--surface));border-radius:12px;padding:12px 14px;margin-bottom:12px;line-height:1.55}.meeting-card>strong{display:block;font-size:14px;margin-bottom:6px}.meeting-card>div{display:flex;align-items:center;gap:6px;color:var(--muted);font-size:12px}.meeting-card .material-symbols-rounded{font-size:16px}.meeting-card p{margin:8px 0 0}.meeting-card a{color:var(--brand-2);font-weight:700}
@media(max-width:620px){.filter-actions-grid{grid-template-columns:1fr}.gemini-badge{display:none}}
'''

# New cache version for clean rollout.
sw = replace_once(sw, 'frankiflow-mail-dev-v6', 'frankiflow-mail-dev-v7', 'service worker cache v7')

app_path.write_text(app)
css_path.write_text(css)
sw_path.write_text(sw)
