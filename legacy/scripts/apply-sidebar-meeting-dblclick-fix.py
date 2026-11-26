from pathlib import Path
import re

p=Path('assets/enhancements.js')
s=p.read_text()

# Sidebar Meeting Scheduler styling.
s=s.replace(
"    #meetingBtn{display:none!important}\n",
"    #meetingBtn{display:none!important}\n    #ffSidebarMeeting{margin:2px 0 8px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.06);color:rgba(255,255,255,.90)}\n    #ffSidebarMeeting:hover{background:rgba(255,255,255,.13);color:#fff;transform:translateX(2px)}\n    #ffSidebarMeeting .material-symbols-rounded{color:#78e0dc}\n",
1)

# Add a persistent left-sidebar scheduler entry and remove the top toolbar duplicate.
marker="function decorateTopbar() {"
if marker not in s:
    raise SystemExit('decorateTopbar marker not found')
sidebar_fn=r'''function decorateSidebarMeeting() {
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
    button.innerHTML = `${icon('calendar_month')}<span class="nav-label">Meeting Scheduler</span>`;
    const compose = qs('#composeMain', sidebar);
    if (compose) compose.insertAdjacentElement('afterend', button);
    else sidebar.prepend(button);
    button.addEventListener('click', () => openMeetingScheduler());
  }
}

'''
s=s.replace(marker, sidebar_fn+marker,1)

pattern=r'''\n  if \(!qs\('#ffMeetingBtn', topbar\)\) \{.*?topbar\.appendChild\(meeting\);\n  \}\n'''
replacement="\n  qs('#ffMeetingBtn', topbar)?.remove();\n"
s2,n=re.subn(pattern,replacement,s,count=1,flags=re.S)
if n!=1:
    raise SystemExit(f'topbar meeting block replacement count={n}')
s=s2

s=s.replace("  decorateTopbar();\n", "  decorateSidebarMeeting();\n  decorateTopbar();\n",1)

# A native dblclick never reliably fires because the first click rerenders the mail row.
# Detect two clicks on the same message in capture phase before the app replaces the DOM node.
pattern=r'''document\.addEventListener\('dblclick', event => \{.*?\}, true\);'''
replacement=r'''let ffLastMailClick = { id:'', at:0 };
document.addEventListener('click', event => {
  const attachment = event.target.closest?.('.ff-attachment-card');
  if (attachment) return;
  const row = event.target.closest?.('.mail-row');
  if (!row || event.target.closest('.row-check,.star-btn,button,a,input')) return;
  const id = row.dataset.id || '';
  const now = Date.now();
  if (id && ffLastMailClick.id === id && now - ffLastMailClick.at <= 450) {
    ffLastMailClick = { id:'', at:0 };
    event.preventDefault();
    event.stopImmediatePropagation();
    openMessageWindow(id);
    return;
  }
  ffLastMailClick = { id, at:now };
}, true);'''
s2,n=re.subn(pattern,replacement,s,count=1,flags=re.S)
if n!=1:
    raise SystemExit(f'double-click handler replacement count={n}')
s=s2

p.write_text(s)
