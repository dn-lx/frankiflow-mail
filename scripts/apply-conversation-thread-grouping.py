from pathlib import Path

path = Path('assets/app.js')
src = path.read_text(encoding='utf-8')
start = src.find('function currentMessages(){')
end = src.find('function renderApp(){', start)
if start < 0 or end < 0:
    raise SystemExit('currentMessages block not found')

replacement = r'''function currentMessages(){
  let list=state.folder==='starred'?state.messages.filter(m=>m.is_starred&&m.folder!=='trash'):state.messages.filter(m=>effectiveFolder(m)===state.folder);
  list=list.filter(m=>advancedMatch(m,state.search));
  const mobileInbox=state.folder==='inbox'&&window.matchMedia?.('(max-width: 820px)').matches;
  if(mobileInbox&&state.mobileQuickFilter&&state.mobileQuickFilter!=='all'){
    const f=state.mobileQuickFilter;
    if(f==='unread')list=list.filter(m=>!m.is_read);
    if(f==='starred')list=list.filter(m=>m.is_starred);
    if(f==='attachments')list=list.filter(m=>m.has_attachments);
    if(f==='info'||f==='mail')list=list.filter(m=>{
      const labelNames=labelsFor(m.id).map(l=>String(l.name||'').toLowerCase());
      const account=String(accountForMessage(m)?.address||'').toLowerCase();
      return labelNames.includes(f)||account===`${f}@frankiflow.de`;
    });
  }
  list=list.sort((a,b)=>(b.is_pinned-a.is_pinned)||new Date(b.received_at||b.sent_at||b.created_at)-new Date(a.received_at||a.sent_at||a.created_at));
  if(state.settings?.conversation_view!==false){
    const seen=new Set();
    list=list.filter(m=>{
      const key=m.thread_id?`thread:${m.thread_id}`:`message:${m.id}`;
      if(seen.has(key))return false;
      seen.add(key);
      return true;
    });
  }
  return list;
}
'''

out = src[:start] + replacement + src[end:]
if out == src:
    raise SystemExit('No changes made')
path.write_text(out, encoding='utf-8')
print('Conversation list now renders one row per thread.')
