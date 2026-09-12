from pathlib import Path

app_path=Path('assets/app.js')
css_path=Path('assets/modern.css')
sw_path=Path('sw.js')
app=app_path.read_text();css=css_path.read_text();sw=sw_path.read_text()

def replace_once(text,old,new,label):
    if old not in text: raise SystemExit(f'Missing {label}')
    return text.replace(old,new,1)

old="function renderMeetingCard(meeting){const provider=meetingProviderLabel(meeting.provider),when=`${new Date(meeting.start).toLocaleString([], {dateStyle:'medium',timeStyle:'short'})} – ${new Date(meeting.end).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`;return`<div class=\"meeting-card\" data-ff-meeting=\"true\"><strong>${esc(meeting.title)}</strong><div>${icon('schedule')} ${esc(when)} · ${esc(meeting.timezone)}</div>${meeting.location?`<div>${icon('location_on')} ${esc(meeting.location)}</div>`:''}${meeting.joinUrl?`<div>${icon(meeting.provider==='teams'?'groups':'videocam')} <a href=\"${esc(meeting.joinUrl)}\" target=\"_blank\">Join ${esc(provider)}</a></div>`:''}${meeting.notes?`<p>${esc(meeting.notes).replace(/\\n/g,'<br>')}</p>`:''}</div>`;}"
new="function renderMeetingCard(meeting){const provider=meetingProviderLabel(meeting.provider),when=`${new Date(meeting.start).toLocaleString([], {dateStyle:'medium',timeStyle:'short'})} – ${new Date(meeting.end).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`;return`<div class=\"meeting-card\" data-ff-meeting=\"true\"><strong>${esc(meeting.title)}</strong><div><b>When:</b> ${esc(when)} · ${esc(meeting.timezone)}</div>${meeting.location?`<div><b>Where:</b> ${esc(meeting.location)}</div>`:''}${meeting.joinUrl?`<div><b>Online:</b> <a href=\"${esc(meeting.joinUrl)}\" target=\"_blank\">Join ${esc(provider)}</a></div>`:''}${meeting.notes?`<p>${esc(meeting.notes).replace(/\\n/g,'<br>')}</p>`:''}</div>`;}"
app=replace_once(app,old,new,'email-safe meeting card')

old_model="modal.querySelector('#setAiModel').value=s.ai_model||'gemini-3.5-flash-lite';"
new_model="modal.querySelector('#setAiModel').value=['gemini-3.5-flash-lite','gemini-3.5-flash','gemini-3.8-flash'].includes(s.ai_model)?s.ai_model:'gemini-3.5-flash-lite';"
app=replace_once(app,old_model,new_model,'Gemini legacy model fallback')

if '.labels-scroll::-webkit-scrollbar{display:none}' not in css:
    css += '\n/* Hide sidebar label scroll chrome while preserving wheel/touch scrolling. */\n.labels-scroll{scrollbar-width:none!important;-ms-overflow-style:none}\n.labels-scroll::-webkit-scrollbar{display:none}\n'

sw=replace_once(sw,'frankiflow-mail-dev-v7','frankiflow-mail-dev-v8','cache v8')
app_path.write_text(app);css_path.write_text(css);sw_path.write_text(sw)
