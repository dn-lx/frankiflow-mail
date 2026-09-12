from pathlib import Path

app_path = Path('assets/app.js')
css_path = Path('assets/modern.css')
app = app_path.read_text()
css = css_path.read_text()

old_state = "  folder:'inbox', category:'all', activeId:null, selected:new Set(), search:'', loading:true,"
new_state = "  folder:'inbox', category:'all', mobileQuickFilter:'all', activeId:null, selected:new Set(), search:'', loading:true,"
if old_state not in app:
    raise SystemExit('State anchor not found')
app = app.replace(old_state, new_state, 1)

start = app.find('function currentMessages(){')
end = app.find('\nfunction renderApp(){', start)
if start < 0 or end < 0:
    raise SystemExit('currentMessages block not found')
new_current = r'''function currentMessages(){
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
  return list.sort((a,b)=>(b.is_pinned-a.is_pinned)||new Date(b.received_at||b.sent_at||b.created_at)-new Date(a.received_at||a.sent_at||a.created_at));
}'''
app = app[:start] + new_current + app[end:]

old_count = '<span class="subtle">${currentMessages().length} messages</span>'
new_count = '<span class="subtle" id="messageCount">${currentMessages().length} messages</span>'
if old_count not in app:
    raise SystemExit('Message count anchor not found')
app = app.replace(old_count, new_count, 1)

old_mount = '<div id="bulkMount"></div><div class="filter-hint">Tip: press <b>C</b> to compose, <b>J/K</b> to move, <b>E</b> to archive, <b>?</b> for shortcuts.</div>'
new_mount = '''${state.folder==='inbox'?`<div class="mobile-inbox-filter" aria-label="Inbox quick filters"><button class="mobile-filter-chip ${state.mobileQuickFilter==='all'?'active':''}" data-mobile-filter="all">All</button><button class="mobile-filter-chip ${state.mobileQuickFilter==='unread'?'active':''}" data-mobile-filter="unread">Unread</button><button class="mobile-filter-chip ${state.mobileQuickFilter==='starred'?'active':''}" data-mobile-filter="starred">Starred</button><button class="mobile-filter-chip ${state.mobileQuickFilter==='attachments'?'active':''}" data-mobile-filter="attachments">Attachments</button><button class="mobile-filter-chip ${state.mobileQuickFilter==='info'?'active':''}" data-mobile-filter="info">Info</button><button class="mobile-filter-chip ${state.mobileQuickFilter==='mail'?'active':''}" data-mobile-filter="mail">Mail</button></div>`:''}<div id="bulkMount"></div><div class="filter-hint">Tip: press <b>C</b> to compose, <b>J/K</b> to move, <b>E</b> to archive, <b>?</b> for shortcuts.</div>'''
if old_mount not in app:
    raise SystemExit('Bulk mount anchor not found')
app = app.replace(old_mount, new_mount, 1)

old_wire = "  document.querySelector('#filterBtn').onclick=showSearchHelp;const mobileMore=document.querySelector('#mobileMore');mobileMore.onclick=()=>showPopover(mobileMore,[['Settings','settings',openSettings],['Refresh','refresh',()=>loadAll(true)],['Sign out','logout',()=>supabase.auth.signOut()]]);"
new_wire = old_wire + "\n  document.querySelectorAll('[data-mobile-filter]').forEach(b=>b.onclick=()=>{state.mobileQuickFilter=b.dataset.mobileFilter||'all';state.selected.clear();state.activeId=null;document.querySelectorAll('[data-mobile-filter]').forEach(x=>x.classList.toggle('active',x.dataset.mobileFilter===state.mobileQuickFilter));renderList();renderReader();renderBulk();});"
if old_wire not in app:
    raise SystemExit('Wire anchor not found')
app = app.replace(old_wire, new_wire, 1)

old_switch = "function switchFolder(folder){state.folder=folder;state.activeId=null;state.selected.clear();state.category='all';renderApp();}"
new_switch = "function switchFolder(folder){state.folder=folder;state.activeId=null;state.selected.clear();state.category='all';state.mobileQuickFilter='all';renderApp();}"
if old_switch not in app:
    raise SystemExit('switchFolder anchor not found')
app = app.replace(old_switch, new_switch, 1)

old_render = "  const box=document.querySelector('#messages');if(!box)return;const list=currentMessages();"
new_render = "  const box=document.querySelector('#messages');if(!box)return;const list=currentMessages();const countEl=document.querySelector('#messageCount');if(countEl)countEl.textContent=`${list.length} message${list.length===1?'':'s'}`;"
if old_render not in app:
    raise SystemExit('renderList anchor not found')
app = app.replace(old_render, new_render, 1)

css_add = r'''

/* Mobile Inbox quick filters */
.mobile-inbox-filter{display:none}
@media(max-width:820px){
  .mobile-inbox-filter{
    display:flex;
    gap:7px;
    align-items:center;
    overflow-x:auto;
    overflow-y:hidden;
    padding:9px 10px 10px;
    background:var(--surface);
    border-bottom:1px solid var(--line);
    scrollbar-width:none;
    -ms-overflow-style:none;
    -webkit-overflow-scrolling:touch;
  }
  .mobile-inbox-filter::-webkit-scrollbar{display:none}
  .mobile-filter-chip{
    flex:0 0 auto;
    min-height:32px;
    padding:6px 11px;
    border:1px solid var(--line);
    border-radius:999px;
    background:var(--surface-2);
    color:var(--muted);
    font-size:11px;
    font-weight:700;
    line-height:1;
    white-space:nowrap;
  }
  .mobile-filter-chip.active{
    background:var(--brand-soft);
    color:var(--brand-2);
    border-color:color-mix(in srgb,var(--brand-2) 38%,var(--line));
    box-shadow:0 3px 10px rgba(12,52,71,.07);
  }
  .mobile-filter-chip:active{transform:scale(.97)}
}
'''
if '/* Mobile Inbox quick filters */' not in css:
    css += css_add

app_path.write_text(app)
css_path.write_text(css)
