import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.116.0';
import { CONFIG } from './config.js';

const qs = (s, root = document) => root.querySelector(s);
const qsa = (s, root = document) => [...root.querySelectorAll(s)];
const mailDb = createClient(CONFIG.supabaseUrl, CONFIG.supabasePublishableKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
const ATTACHMENT_BUCKET = 'frankiflow-mail-attachments';
const MEETING_TZ = 'Europe/Berlin';
let deferredInstallPrompt = null;
let lastVisibleRefresh = Date.now();
let decorateScheduled = false;
let readerEnhancementKey = '';
let readerEnhancementBusy = false;
let standaloneRenderedFor = '';

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[c]));
}
function icon(name) { return `<span class="material-symbols-rounded">${name}</span>`; }
function fmtBytes(value) {
  const bytes = Number(value || 0);
  if (!bytes) return '0 B';
  const units = ['B','KB','MB','GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
}
function fmtMeetingDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-GB', {
    weekday:'short', day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', timeZone:MEETING_TZ
  }).format(new Date(value));
}
function onlineLabel() { return navigator.onLine ? 'Online' : 'Offline'; }

function injectEnhancementStyles() {
  if (qs('#ffEnhancementStyles')) return;
  const style = document.createElement('style');
  style.id = 'ffEnhancementStyles';
  style.textContent = `
    .ff-rich-message{margin-top:10px}
    .ff-email-frame{display:block;width:100%;min-height:180px;border:0;background:#fff;border-radius:14px;overflow:hidden}
    .ff-attachment-block{margin:16px 0 2px;border-top:1px solid var(--border, #dfe7ea);padding-top:14px}
    .ff-attachment-title{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:800;color:var(--muted,#667b84);margin-bottom:9px;text-transform:uppercase;letter-spacing:.06em}
    .ff-attachment-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}
    .ff-attachment-card{display:flex;align-items:center;gap:11px;padding:11px 12px;border:1px solid var(--border,#dce6e9);border-radius:13px;background:var(--panel,#fff);cursor:pointer;transition:.15s ease;min-width:0}
    .ff-attachment-card:hover{transform:translateY(-1px);box-shadow:0 7px 20px rgba(10,50,70,.08);border-color:#9bcfd0}
    .ff-attachment-icon{width:38px;height:38px;border-radius:10px;display:grid;place-items:center;background:#e8f7f5;color:#0b6f77;flex:0 0 auto}
    .ff-attachment-meta{min-width:0;flex:1}.ff-attachment-meta strong{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:13px}.ff-attachment-meta small{display:block;color:var(--muted,#71848a);margin-top:2px}
    .ff-attachment-actions{display:flex;gap:4px}.ff-mini-btn{width:34px;height:34px;border:0;border-radius:9px;background:transparent;color:inherit;display:grid;place-items:center;cursor:pointer}.ff-mini-btn:hover{background:rgba(14,105,114,.09)}
    #ffMeetingBtn{position:relative}.ff-meeting-dot{position:absolute;right:4px;top:4px;width:7px;height:7px;border-radius:50%;background:#18b8ad;border:2px solid var(--panel,#fff)}
    .ff-meeting-backdrop{position:fixed;inset:0;background:rgba(7,28,42,.48);backdrop-filter:blur(7px);display:grid;place-items:center;padding:20px;z-index:10000}
    .ff-meeting-modal{width:min(980px,96vw);max-height:92vh;overflow:auto;background:var(--panel,#fff);color:var(--text,#17343d);border-radius:22px;border:1px solid var(--border,#dce8e5);box-shadow:0 30px 80px rgba(0,0,0,.25)}
    .ff-meeting-head{display:flex;justify-content:space-between;gap:16px;align-items:center;padding:22px 24px;border-bottom:1px solid var(--border,#e4ecee)}
    .ff-meeting-head h2{margin:0;font-size:22px}.ff-meeting-head p{margin:4px 0 0;color:var(--muted,#71848a);font-size:13px}
    .ff-meeting-content{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(320px,.95fr);gap:22px;padding:22px 24px 26px}
    .ff-meeting-form,.ff-meeting-list{min-width:0}.ff-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.ff-form-grid .full{grid-column:1/-1}
    .ff-field{display:flex;flex-direction:column;gap:6px}.ff-field label{font-size:12px;font-weight:750;color:var(--muted,#647a84)}.ff-field input,.ff-field textarea,.ff-field select{width:100%;box-sizing:border-box;border:1px solid var(--border,#cfdbdf);border-radius:11px;background:var(--input,#fff);color:inherit;padding:10px 11px;font:inherit}.ff-field textarea{min-height:88px;resize:vertical}
    .ff-check{display:flex;align-items:center;gap:9px;font-size:13px;color:var(--muted,#5f747d);margin-top:4px}.ff-meeting-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}.ff-primary,.ff-secondary{border:0;border-radius:11px;padding:10px 14px;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;gap:7px}.ff-primary{background:#0b3447;color:#fff}.ff-secondary{background:#edf5f6;color:#0b4654}
    .ff-meeting-list h3{margin:0 0 10px;font-size:15px}.ff-meeting-item{border:1px solid var(--border,#dce8e5);border-radius:14px;padding:13px;margin-bottom:10px}.ff-meeting-item.cancelled{opacity:.58}.ff-meeting-item-head{display:flex;justify-content:space-between;gap:8px}.ff-meeting-item strong{font-size:14px}.ff-meeting-item time{font-size:11px;color:var(--muted,#71848a)}.ff-meeting-item p{margin:7px 0 0;font-size:12px;color:var(--muted,#607780);line-height:1.5}.ff-meeting-item-actions{display:flex;gap:6px;margin-top:10px;flex-wrap:wrap}.ff-meeting-item-actions button{border:1px solid var(--border,#dce8e5);background:transparent;color:inherit;border-radius:9px;padding:6px 9px;cursor:pointer;font-size:12px}
    .ff-standalone-shell{min-height:100vh;background:#f2f7f8;color:#17343d;padding:28px;box-sizing:border-box;font-family:Inter,system-ui,sans-serif}.ff-standalone-wrap{max-width:1050px;margin:0 auto}.ff-standalone-top{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:18px}.ff-standalone-brand{display:flex;align-items:center;gap:10px;font-weight:850;color:#0b3447}.ff-standalone-card{background:white;border:1px solid #dce8e5;border-radius:20px;box-shadow:0 18px 50px rgba(11,52,71,.08);overflow:hidden}.ff-standalone-head{padding:22px 26px;border-bottom:1px solid #e6eef0}.ff-standalone-head h1{font-size:24px;line-height:1.25;margin:0 0 10px}.ff-standalone-meta{display:flex;flex-wrap:wrap;gap:8px 16px;color:#667c84;font-size:13px}.ff-standalone-body{padding:22px 26px}.ff-close-window{border:1px solid #d4e1e4;background:#fff;border-radius:10px;padding:9px 12px;cursor:pointer;font-weight:700;color:#17343d}
    @media (max-width:780px){.ff-meeting-content{grid-template-columns:1fr}.ff-form-grid{grid-template-columns:1fr}.ff-form-grid .full{grid-column:auto}.ff-standalone-shell{padding:12px}.ff-standalone-body,.ff-standalone-head{padding:16px}}
  `;
  style.textContent += `
    .sidebar .labels-scroll{overflow:visible!important;max-height:none!important;flex:0 0 auto!important}
    #meetingBtn{display:none!important}
    #ffSidebarMeeting{margin:2px 0 8px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.06);color:rgba(255,255,255,.90)}
    #ffSidebarMeeting:hover{background:rgba(255,255,255,.13);color:#fff;transform:translateX(2px)}
    #ffSidebarMeeting .material-symbols-rounded{color:#78e0dc}
    .ff-message-dialog-backdrop{position:fixed;inset:0;z-index:12000;background:rgba(6,25,36,.58);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:22px}
    .ff-message-dialog{width:min(1080px,96vw);max-height:92vh;display:flex;flex-direction:column;background:var(--surface,#fff);color:var(--text,#17343d);border:1px solid var(--line,#dce8e5);border-radius:22px;box-shadow:0 34px 100px rgba(0,0,0,.32);overflow:hidden}
    .ff-message-dialog-head{display:flex;align-items:flex-start;gap:14px;padding:20px 22px;border-bottom:1px solid var(--line,#e4ecee);background:var(--surface,#fff)}
    .ff-message-dialog-title{min-width:0;flex:1}.ff-message-dialog-title h2{margin:0 0 8px;font-size:22px;line-height:1.25;letter-spacing:-.025em}.ff-message-dialog-meta{display:flex;flex-wrap:wrap;gap:5px 16px;font-size:12px;color:var(--muted,#71848a)}
    .ff-message-dialog-close{width:38px;height:38px;border:0;border-radius:10px;background:transparent;color:inherit;display:grid;place-items:center;cursor:pointer}.ff-message-dialog-close:hover{background:var(--surface-3,#eef3f5)}
    .ff-message-dialog-body{overflow:auto;padding:20px 22px 26px;background:var(--surface-2,#f8fafb)}
    .ff-message-dialog-body>.ff-rich-message{background:var(--surface,#fff);border:1px solid var(--line,#e3e9ec);border-radius:16px;padding:14px;box-shadow:0 10px 30px rgba(12,52,71,.06)}
    @media(max-width:700px){.ff-message-dialog-backdrop{padding:0}.ff-message-dialog{width:100vw;height:100vh;max-height:none;border-radius:0}.ff-message-dialog-head{padding:16px}.ff-message-dialog-body{padding:12px}.ff-message-dialog-title h2{font-size:19px}}
  `;

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
    .ff-dialog-editor-toolbar{display:flex;align-items:center;gap:3px;flex-wrap:wrap;border:1px solid var(--line,#dfe8eb);border-bottom:0;border-radius:12px 12px 0 0;padding:5px 7px;background:var(--surface-2,#f8fafb)}.ff-dialog-editor-toolbar button{width:32px;height:30px;border:0;background:transparent;border-radius:7px;color:inherit;display:grid;place-items:center;cursor:pointer}.ff-dialog-editor-toolbar button:hover{background:var(--surface-3,#edf3f4)}
    .ff-dialog-toolbar-sep{width:1px;height:22px;background:var(--line,#dfe8eb);margin:0 3px}
    .ff-dialog-tool-menu{position:fixed;z-index:14050;min-width:210px;max-width:min(320px,calc(100vw - 24px));padding:6px;background:var(--surface,#fff);color:var(--text,#17343d);border:1px solid var(--line,#dce8e5);border-radius:12px;box-shadow:0 16px 42px rgba(8,42,56,.18)}
    .ff-dialog-tool-menu button{width:100%;border:0;background:transparent;color:inherit;border-radius:9px;padding:9px 10px;display:flex;align-items:center;gap:9px;text-align:left;cursor:pointer;font:inherit;font-size:13px}.ff-dialog-tool-menu button:hover{background:var(--surface-3,#eef4f5)}.ff-dialog-tool-menu button:disabled{opacity:.55;cursor:default;background:transparent}
    .ff-dialog-tool-menu .material-symbols-rounded{font-size:18px;color:#0b6670}
    .ff-dialog-editor{min-height:112px;max-height:260px;overflow:auto;border:1px solid var(--line,#dfe8eb);border-radius:0 0 12px 12px;padding:11px 12px;outline:none;line-height:1.55;background:var(--input,#fff)}.ff-dialog-editor:empty:before{content:attr(data-placeholder);color:#93a2a8;pointer-events:none}
    .ff-dialog-files{display:flex;gap:7px;flex-wrap:wrap;margin-top:8px}.ff-dialog-file{display:inline-flex;align-items:center;gap:5px;background:#edf6f6;border:1px solid #d4e8e8;border-radius:999px;padding:5px 8px;font-size:11px}.ff-dialog-file button{border:0;background:transparent;cursor:pointer;display:grid;place-items:center;padding:0;color:inherit}
    .ff-dialog-compose-foot{display:flex;align-items:center;gap:8px;margin-top:10px}.ff-dialog-compose-foot .ff-status{font-size:12px;color:var(--muted,#6b8088);min-height:18px}.ff-dialog-compose-foot .ff-status.error{color:#b33b32}.ff-dialog-compose-foot .ff-status.ok{color:#13725f}.ff-dialog-compose-foot .spacer{flex:1}.ff-dialog-send-group{display:flex;align-items:stretch}.ff-dialog-send{border:0;background:#0b3447;color:#fff;padding:9px 14px;font-weight:800;display:inline-flex;align-items:center;gap:7px;cursor:pointer}.ff-dialog-send:first-child{border-radius:10px 0 0 10px}.ff-dialog-send-menu{width:36px;border:0;border-left:1px solid rgba(255,255,255,.22);border-radius:0 10px 10px 0;background:#0b3447;color:#fff;display:grid;place-items:center;cursor:pointer}.ff-dialog-send:disabled,.ff-dialog-send-menu:disabled{opacity:.6;cursor:wait}
    .ff-dialog-ai-modal{width:min(650px,94vw)}.ff-dialog-ai-body{padding:22px 24px 24px}.ff-dialog-ai-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.ff-dialog-ai-status{font-size:12px;color:var(--muted,#6b8088);min-height:18px;margin-top:8px}.ff-dialog-ai-status.error{color:#b33b32}.ff-dialog-ai-note{display:flex;align-items:flex-start;gap:7px;margin-top:10px;color:var(--muted,#657a83);font-size:12px;line-height:1.45}
    @media(max-width:700px){.ff-dialog-message-head{padding:11px}.ff-dialog-message-content{padding:10px}.ff-dialog-compose{position:relative;bottom:auto;padding:11px}.ff-dialog-compose-top{align-items:flex-start;flex-direction:column}.ff-dialog-editor{min-height:128px}.ff-message-dialog-body{padding:10px}}
  `;
  document.head.appendChild(style);
}

function updateConnectionPill() {
  const pill = qs('#ffConnectionPill');
  if (!pill) return;
  const label = onlineLabel();
  const title = navigator.onLine ? 'Connected' : 'No network connection';
  if (pill.textContent !== label) pill.textContent = label;
  pill.classList.toggle('offline', !navigator.onLine);
  if (pill.title !== title) pill.title = title;
}

function updateUnreadTitle() {
  if (new URLSearchParams(location.search).has('message')) return;
  const countText = qs('[data-folder="inbox"] .count')?.textContent?.trim();
  const count = Number(countText || 0);
  const nextTitle = count > 0 ? `(${count}) FrankiFlow Mail` : 'FrankiFlow Mail';
  if (document.title !== nextTitle) document.title = nextTitle;
}

function decorateBrand() {
  if (CONFIG.mode !== 'develop') return;
  const words = qs('.brand .words');
  if (!words || qs('.dev-pill', words)) return;
  const badge = document.createElement('span');
  badge.className = 'dev-pill';
  badge.textContent = 'Development';
  words.appendChild(badge);
}

function decorateSidebarMeeting() {
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
  }
  const labelsTitle = qsa('.nav-section-title', sidebar).find(el => el.textContent.trim().toLowerCase() === 'labels');
  if (labelsTitle && button.nextElementSibling !== labelsTitle) labelsTitle.insertAdjacentElement('beforebegin', button);
  else if (!labelsTitle && !button.isConnected) sidebar.appendChild(button);
  if (button.dataset.ffBound !== '1') {
    button.dataset.ffBound = '1';
    button.addEventListener('click', () => openMeetingScheduler());
  }
}

function decorateTopbar() {
  const topbar = qs('.topbar');
  if (!topbar) return;

  if (!qs('#ffConnectionPill', topbar)) {
    const pill = document.createElement('span');
    pill.id = 'ffConnectionPill';
    pill.className = 'connection-pill';
    const firstButton = topbar.querySelector('button');
    topbar.insertBefore(pill, firstButton || null);
  }

  qs('#ffMeetingBtn', topbar)?.remove();

  if (deferredInstallPrompt && !qs('#ffInstallApp', topbar)) {
    const install = document.createElement('button');
    install.id = 'ffInstallApp';
    install.className = 'icon-btn';
    install.title = 'Install FrankiFlow Mail';
    install.setAttribute('aria-label', 'Install FrankiFlow Mail');
    install.innerHTML = icon('install_desktop');
    install.addEventListener('click', async () => {
      const prompt = deferredInstallPrompt;
      if (!prompt) return;
      prompt.prompt();
      await prompt.userChoice;
      deferredInstallPrompt = null;
      install.remove();
    });
    topbar.appendChild(install);
  }

  updateConnectionPill();
}

async function session() {
  const { data } = await mailDb.auth.getSession();
  return data.session || null;
}

function sanitizeEmailHtml(html = '') {
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
  doc.querySelectorAll('script,iframe,object,embed,applet,form,input,textarea,select,button,meta[http-equiv="refresh"]').forEach(el => el.remove());
  doc.querySelectorAll('*').forEach(el => {
    [...el.attributes].forEach(attr => {
      if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
      if ((attr.name === 'href' || attr.name === 'src') && /^javascript:/i.test(attr.value.trim())) el.removeAttribute(attr.name);
    });
  });
  doc.querySelectorAll('a[href]').forEach(a => { a.target = '_blank'; a.rel = 'noopener noreferrer'; });
  doc.querySelectorAll('img').forEach(img => { img.loading = 'lazy'; img.referrerPolicy = 'no-referrer'; img.style.maxWidth = '100%'; });
  const base = doc.createElement('base'); base.target = '_blank'; doc.head.prepend(base);
  const fit = doc.createElement('style');
  fit.textContent = 'html,body{max-width:100%;overflow-wrap:anywhere} body{margin:0!important} table{max-width:100%} img{height:auto!important}';
  doc.head.appendChild(fit);
  return '<!doctype html>' + doc.documentElement.outerHTML;
}

function attachmentIcon(type = '', filename = '') {
  const mime = String(type).toLowerCase(), name = String(filename).toLowerCase();
  if (mime.includes('pdf') || name.endsWith('.pdf')) return 'picture_as_pdf';
  if (mime.startsWith('image/')) return 'image';
  if (mime.includes('sheet') || /\.(xlsx?|csv)$/.test(name)) return 'table_view';
  if (mime.includes('word') || /\.(docx?|rtf)$/.test(name)) return 'description';
  if (mime.includes('zip') || /\.(zip|rar|7z)$/.test(name)) return 'folder_zip';
  return 'attach_file';
}

async function signedAttachmentUrls(attachment) {
  const bucket = mailDb.storage.from(ATTACHMENT_BUCKET);
  const [{ data: view }, { data: download }] = await Promise.all([
    bucket.createSignedUrl(attachment.storage_path, 3600),
    bucket.createSignedUrl(attachment.storage_path, 3600, { download: attachment.filename || true })
  ]);
  return { view: view?.signedUrl || '', download: download?.signedUrl || view?.signedUrl || '' };
}

async function renderAttachments(container, messageId) {
  const { data, error } = await mailDb.from('frankiflow_mail_attachments').select('id,filename,content_type,size_bytes,storage_path').eq('message_id', messageId).order('created_at');
  if (error || !data?.length) return;
  const block = document.createElement('div');
  block.className = 'ff-attachment-block';
  block.innerHTML = `<div class="ff-attachment-title">${icon('attach_file')} ${data.length} attachment${data.length === 1 ? '' : 's'}</div><div class="ff-attachment-grid"></div>`;
  container.appendChild(block);
  const grid = qs('.ff-attachment-grid', block);
  for (const attachment of data) {
    const urls = await signedAttachmentUrls(attachment);
    const card = document.createElement('div');
    card.className = 'ff-attachment-card';
    card.title = 'Double-click to open attachment';
    card.innerHTML = `<div class="ff-attachment-icon">${icon(attachmentIcon(attachment.content_type, attachment.filename))}</div><div class="ff-attachment-meta"><strong>${esc(attachment.filename || 'Attachment')}</strong><small>${esc(attachment.content_type || 'file')} · ${fmtBytes(attachment.size_bytes)}</small></div><div class="ff-attachment-actions"><button class="ff-mini-btn ff-preview" title="Open">${icon('open_in_new')}</button><button class="ff-mini-btn ff-download" title="Download">${icon('download')}</button></div>`;
    const open = () => urls.view && window.open(urls.view, '_blank', 'noopener,noreferrer');
    card.addEventListener('dblclick', open);
    qs('.ff-preview', card).addEventListener('click', e => { e.stopPropagation(); open(); });
    qs('.ff-download', card).addEventListener('click', e => {
      e.stopPropagation();
      if (!urls.download) return;
      const a = document.createElement('a'); a.href = urls.download; a.download = attachment.filename || 'attachment'; a.rel = 'noopener'; a.click();
    });
    grid.appendChild(card);
  }
}

function renderHtmlInto(container, html, fallbackText = '') {
  container.innerHTML = '';
  const rich = document.createElement('div'); rich.className = 'ff-rich-message'; container.appendChild(rich);
  if (html) {
    const frame = document.createElement('iframe');
    frame.className = 'ff-email-frame';
    frame.setAttribute('sandbox','allow-same-origin allow-popups allow-popups-to-escape-sandbox');
    frame.setAttribute('referrerpolicy','no-referrer');
    frame.srcdoc = sanitizeEmailHtml(html);
    frame.addEventListener('load', () => {
      try {
        const resize = () => {
          const doc = frame.contentDocument;
          if (!doc) return;
          const h = Math.max(doc.body?.scrollHeight || 0, doc.documentElement?.scrollHeight || 0, 180);
          frame.style.height = `${Math.min(Math.max(h + 6, 180), 5000)}px`;
        };
        resize(); setTimeout(resize, 120); setTimeout(resize, 500);
      } catch (error) { console.warn('Could not auto-size email frame', error); }
    });
    rich.appendChild(frame);
  } else {
    const text = document.createElement('div'); text.style.whiteSpace = 'pre-wrap'; text.style.lineHeight = '1.65'; text.textContent = fallbackText || '';
    rich.appendChild(text);
  }
  return rich;
}

async function enhanceReader() {
  const panel = qs('#reader');
  const active = qs('.mail-row.active');
  if (!panel?.classList.contains('open') || !active?.dataset.id || readerEnhancementBusy) return;
  const activeId = active.dataset.id;
  const cards = qsa('.thread-card', panel);
  const key = `${activeId}:${cards.length}`;
  if (!cards.length || readerEnhancementKey === key) return;
  readerEnhancementBusy = true;
  try {
    const { data: activeMessage, error } = await mailDb.from('frankiflow_mail_messages').select('id,thread_id,reply_to,from_address,subject').eq('id', activeId).maybeSingle();
    if (error || !activeMessage) return;
    let messages = [];
    if (cards.length === 1) {
      const { data } = await mailDb.from('frankiflow_mail_messages').select('*').eq('id', activeId).maybeSingle();
      if (data) messages = [data];
    } else if (activeMessage.thread_id) {
      const { data } = await mailDb.from('frankiflow_mail_messages').select('*').eq('thread_id', activeMessage.thread_id).order('created_at', { ascending:true });
      messages = data || [];
    }
    cards.forEach((card, index) => {
      const message = messages[index];
      if (!message) return;
      card.dataset.messageId = message.id;
      const body = qs('.thread-body', card);
      if (!body || body.dataset.ffRich === '1') return;
      body.dataset.ffRich = '1';
      renderHtmlInto(body, message.html_body, message.text_body);
      renderAttachments(body, message.id);
    });
    readerEnhancementKey = key;
  } finally { readerEnhancementBusy = false; }
}

function dialogEmail(value='') {
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
async function sendDialogReply({ message, accounts, mode, editor, files, status, button, scheduledAt=null }) {
  const currentSession = await session();
  if (!currentSession) throw new Error('Please sign in again.');
  const targets = dialogReplyTargets(message, accounts, mode);
  const text = editor.innerText.trim();
  const inline = dialogExtractInlineImages(cleanDialogComposeHtml(editor.innerHTML.trim()));
  const html = inline.html;
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
      attachments: [...await dialogFilePayloads(files), ...inline.attachments],
      scheduledAt
    };
    const response = await fetch(CONFIG.sendFunctionUrl, { method:'POST', headers:{ 'Content-Type':'application/json', apikey:CONFIG.supabasePublishableKey, Authorization:`Bearer ${currentSession.access_token}` }, body:JSON.stringify(payload) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.error) throw new Error(result?.error || `Send failed (HTTP ${response.status})`);
    editor.innerHTML = ''; status.className = 'ff-status ok'; status.textContent = scheduledAt ? 'Reply scheduled.' : (mode === 'replyAll' ? 'Reply all sent.' : 'Reply sent.');
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
  backdrop.innerHTML = `<section class="ff-message-dialog" role="dialog" aria-modal="true" aria-label="Email conversation"><header class="ff-message-dialog-head"><div class="ff-message-dialog-title"><h2>${esc(message.subject || '(no subject)')}</h2><div class="ff-message-dialog-meta"><span><b>Conversation:</b> ${messages.length} message${messages.length === 1 ? '' : 's'}</span><span><b>Opened from:</b> ${esc(message.from_name || message.from_address || '')}</span><span>${esc(received)}</span></div></div><button class="ff-message-dialog-close" type="button" title="Close" aria-label="Close">${icon('close')}</button></header><div class="ff-message-dialog-body"><div class="ff-dialog-history" id="ffMessageDialogHistory"></div><section class="ff-dialog-compose" aria-label="Reply composer"><div class="ff-dialog-compose-top"><div class="ff-dialog-reply-tabs"><button type="button" class="active" data-dialog-reply-mode="reply">${icon('reply')} Reply</button><button type="button" data-dialog-reply-mode="replyAll">${icon('reply_all')} Reply all</button></div><span class="ff-status" id="ffDialogStatus"></span></div><div class="ff-dialog-recipient" id="ffDialogRecipients"></div><div class="ff-dialog-editor-toolbar"><button type="button" data-dialog-format="bold" title="Bold">${icon('format_bold')}</button><button type="button" data-dialog-format="italic" title="Italic">${icon('format_italic')}</button><button type="button" data-dialog-format="underline" title="Underline">${icon('format_underlined')}</button><span class="ff-dialog-toolbar-sep"></span><button type="button" data-dialog-format="insertUnorderedList" title="Bulleted list">${icon('format_list_bulleted')}</button><button type="button" data-dialog-format="insertOrderedList" title="Numbered list">${icon('format_list_numbered')}</button><button type="button" id="ffDialogLink" title="Insert link">${icon('link')}</button><span class="ff-dialog-toolbar-sep"></span><button type="button" id="ffDialogTemplate" title="Templates">${icon('article')}</button><button type="button" id="ffDialogSignature" title="Signature">${icon('draw')}</button><button type="button" id="ffDialogAi" title="Gemini-powered writing assistant">${icon('auto_awesome')}</button></div><div class="ff-dialog-editor" id="ffDialogEditor" contenteditable="true" data-placeholder="Write your reply…"></div><div class="ff-dialog-files" id="ffDialogFiles"></div><div class="ff-dialog-compose-foot"><button type="button" class="ff-mini-btn" id="ffDialogAttach" title="Attach file">${icon('attach_file')}</button><input id="ffDialogFileInput" type="file" multiple hidden><span class="ff-status" id="ffDialogFootStatus"></span><span class="spacer"></span><div class="ff-dialog-send-group"><button type="button" class="ff-dialog-send" id="ffDialogSend">${icon('send')} Send</button><button type="button" class="ff-dialog-send-menu" id="ffDialogSendMenu" title="Send options" aria-label="Send options">${icon('arrow_drop_down')}</button></div></div></section></div></section>`;
  document.body.appendChild(backdrop);
  const history = qs('#ffMessageDialogHistory', backdrop);
  await renderDialogHistory(history, messages, message.id);

  let mode = 'reply', files = [];
  const editor = qs('#ffDialogEditor', backdrop), recipient = qs('#ffDialogRecipients', backdrop), status = qs('#ffDialogFootStatus', backdrop), send = qs('#ffDialogSend', backdrop), sendMenu = qs('#ffDialogSendMenu', backdrop), fileInput = qs('#ffDialogFileInput', backdrop), fileList = qs('#ffDialogFiles', backdrop);
  const updateRecipients = () => {
    const targets = dialogReplyTargets(message, accounts, mode);
    recipient.innerHTML = targets.to ? `<b>To:</b> ${esc(targets.to)}${targets.cc.length ? ` &nbsp; <b>Cc:</b> ${esc(targets.cc.join(', '))}` : ''}` : '<b>No reply recipient found</b>';
    qsa('[data-dialog-reply-mode]', backdrop).forEach(btn => btn.classList.toggle('active', btn.dataset.dialogReplyMode === mode));
  };
  const renderFiles = () => { fileList.innerHTML = files.map((file, index) => `<span class="ff-dialog-file">${icon('attach_file')} ${esc(file.name)} <button type="button" data-dialog-file-remove="${index}" aria-label="Remove attachment">${icon('close')}</button></span>`).join(''); qsa('[data-dialog-file-remove]', fileList).forEach(btn => btn.onclick = () => { files.splice(Number(btn.dataset.dialogFileRemove),1); renderFiles(); }); };
  qsa('[data-dialog-reply-mode]', backdrop).forEach(btn => btn.onclick = () => { mode = btn.dataset.dialogReplyMode === 'replyAll' ? 'replyAll' : 'reply'; updateRecipients(); editor.focus(); });
  qsa('[data-dialog-format]', backdrop).forEach(btn => btn.onclick = () => { document.execCommand(btn.dataset.dialogFormat,false,null); editor.focus(); });
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

  const close = () => { backdrop.remove(); document.removeEventListener('keydown', onKey); };
  qs('.ff-message-dialog-close', backdrop)?.addEventListener('click', close);
  backdrop.addEventListener('click', event => { if (event.target === backdrop) close(); });
  const onKey = event => { if (event.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(() => editor.focus());
}

async function standaloneView() {
  const id = new URLSearchParams(location.search).get('message');
  if (!id || (standaloneRenderedFor === id && qs('.ff-standalone-shell'))) return false;
  const currentSession = await session();
  if (!currentSession) return false;
  const { data: message, error } = await mailDb.from('frankiflow_mail_messages').select('*').eq('id', id).maybeSingle();
  if (error || !message) return false;
  standaloneRenderedFor = id;
  document.title = `${message.subject || 'Message'} · FrankiFlow Mail`;
  const root = qs('#app');
  root.innerHTML = `<div class="ff-standalone-shell"><div class="ff-standalone-wrap"><div class="ff-standalone-top"><div class="ff-standalone-brand">${icon('mail')} FrankiFlow Mail</div><button class="ff-close-window" id="ffCloseStandalone">Close window</button></div><article class="ff-standalone-card"><header class="ff-standalone-head"><h1>${esc(message.subject || '(no subject)')}</h1><div class="ff-standalone-meta"><span><b>From:</b> ${esc(message.from_name || message.from_address || '')} &lt;${esc(message.from_address || '')}&gt;</span><span><b>To:</b> ${esc((message.to_addresses || []).join(', '))}</span><span>${esc(new Date(message.received_at || message.sent_at || message.created_at).toLocaleString())}</span></div></header><div class="ff-standalone-body" id="ffStandaloneBody"></div></article></div></div>`;
  qs('#ffCloseStandalone')?.addEventListener('click', () => window.close());
  const body = qs('#ffStandaloneBody');
  renderHtmlInto(body, message.html_body, message.text_body);
  await renderAttachments(body, message.id);
  return true;
}

function toLocalInputValue(date) {
  const d = date instanceof Date ? date : new Date(date);
  const pad = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function splitEmails(value) { return [...new Set(String(value || '').split(/[;,\s]+/).map(x => x.trim().toLowerCase()).filter(x => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)))]; }
function icsEscape(value='') { return String(value).replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;'); }
function icsUtc(date) { return new Date(date).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z'); }
function toBase64Utf8(value) { const bytes = new TextEncoder().encode(value); let binary=''; bytes.forEach(b => binary += String.fromCharCode(b)); return btoa(binary); }
function meetingIcs(meeting) {
  const uid = `${meeting.id || crypto.randomUUID()}@frankiflow.de`;
  const description = [meeting.notes, meeting.meeting_url ? `Meeting link: ${meeting.meeting_url}` : ''].filter(Boolean).join('\n');
  return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//FrankiFlow//Mail Scheduler//EN','CALSCALE:GREGORIAN','METHOD:REQUEST','BEGIN:VEVENT',`UID:${uid}`,`DTSTAMP:${icsUtc(new Date())}`,`DTSTART:${icsUtc(meeting.starts_at)}`,`DTEND:${icsUtc(meeting.ends_at)}`,`SUMMARY:${icsEscape(meeting.title)}`,meeting.location?`LOCATION:${icsEscape(meeting.location)}`:'',description?`DESCRIPTION:${icsEscape(description)}`:'','ORGANIZER;CN=FrankiFlow:mailto:info@frankiflow.de',...(meeting.attendees || []).map(email => `ATTENDEE;CN=${icsEscape(email)};RSVP=TRUE:mailto:${email}`),'STATUS:CONFIRMED','END:VEVENT','END:VCALENDAR'].filter(Boolean).join('\r\n');
}

async function sendMeetingInvites(meeting) {
  const currentSession = await session();
  if (!currentSession) throw new Error('Please sign in again.');
  const attendees = meeting.attendees || [];
  if (!attendees.length) return;
  const when = fmtMeetingDate(meeting.starts_at);
  const html = `<!doctype html><html><body style="margin:0;background:#f2f7f8;font-family:Arial,sans-serif;color:#17343d"><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 12px"><table width="620" style="max-width:620px;width:100%;background:#fff;border:1px solid #dce8e5;border-radius:18px;overflow:hidden"><tr><td style="padding:22px 26px;background:#0b3447;color:#fff"><b style="font-size:22px">FrankiFlow</b><span style="float:right;color:#83ddd7;font-size:11px;font-weight:bold">MEETING INVITATION</span></td></tr><tr><td style="padding:26px"><h1 style="font-size:23px;margin:0 0 16px">${esc(meeting.title)}</h1><p style="margin:0 0 8px"><b>When:</b> ${esc(when)} (${esc(meeting.timezone || MEETING_TZ)})</p>${meeting.location?`<p style="margin:0 0 8px"><b>Location:</b> ${esc(meeting.location)}</p>`:''}${meeting.meeting_url?`<p style="margin:18px 0"><a href="${esc(meeting.meeting_url)}" style="display:inline-block;background:#0b3447;color:#fff;text-decoration:none;padding:11px 16px;border-radius:10px;font-weight:bold">Join meeting</a></p>`:''}${meeting.notes?`<p style="line-height:1.6;color:#536b75">${esc(meeting.notes).replace(/\n/g,'<br>')}</p>`:''}<p style="font-size:12px;color:#71848a;margin-top:22px">A calendar invitation (.ics) is attached.</p></td></tr></table></td></tr></table></body></html>`;
  const attachment = { filename:'FrankiFlow-Meeting.ics', content:toBase64Utf8(meetingIcs(meeting)), contentType:'text/calendar; charset=UTF-8; method=REQUEST' };
  for (const attendee of attendees) {
    const response = await fetch(CONFIG.sendFunctionUrl, {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'apikey':CONFIG.supabasePublishableKey, 'Authorization':`Bearer ${currentSession.access_token}` },
      body:JSON.stringify({ fromAddress:'info@frankiflow.de', to:[attendee], subject:`Meeting invitation · ${meeting.title}`, html, text:`FrankiFlow meeting invitation\n\n${meeting.title}\n${when}\n${meeting.location || ''}\n${meeting.meeting_url || ''}\n\n${meeting.notes || ''}`, attachments:[attachment] })
    });
    if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new Error(payload.error || `Could not send invitation to ${attendee}`); }
  }
  await mailDb.from('frankiflow_mail_meetings').update({ invitation_sent_at:new Date().toISOString(), updated_at:new Date().toISOString() }).eq('id', meeting.id);
}

async function loadMeetings() {
  const from = new Date(Date.now() - 7 * 864e5).toISOString();
  const { data, error } = await mailDb.from('frankiflow_mail_meetings').select('*').gte('ends_at', from).order('starts_at', { ascending:true }).limit(100);
  if (error) throw error;
  return data || [];
}

async function openMeetingScheduler(prefill = {}) {
  const currentSession = await session();
  if (!currentSession) return;
  qs('.ff-meeting-backdrop')?.remove();
  const now = new Date(); now.setMinutes(Math.ceil(now.getMinutes()/15)*15,0,0);
  const end = new Date(now.getTime() + 30*60000);
  const backdrop = document.createElement('div');
  backdrop.className = 'ff-meeting-backdrop';
  backdrop.innerHTML = `<section class="ff-meeting-modal" role="dialog" aria-modal="true"><header class="ff-meeting-head"><div><h2>Meeting scheduler</h2><p>Create meetings and send calendar invitations directly from FrankiFlow Mail.</p></div><button class="icon-btn" id="ffMeetingClose">${icon('close')}</button></header><div class="ff-meeting-content"><form class="ff-meeting-form" id="ffMeetingForm"><div class="ff-form-grid"><div class="ff-field full"><label>Meeting title</label><input id="ffMeetTitle" required maxlength="180" value="${esc(prefill.subject ? `Meeting · ${String(prefill.subject).replace(/^re:\s*/i,'')}` : '')}" placeholder="e.g. Cleaning contract discussion"></div><div class="ff-field full"><label>Attendees</label><input id="ffMeetAttendees" value="${esc(prefill.attendee || '')}" placeholder="name@example.com, another@example.com"></div><div class="ff-field"><label>Start</label><input id="ffMeetStart" type="datetime-local" required value="${toLocalInputValue(now)}"></div><div class="ff-field"><label>End</label><input id="ffMeetEnd" type="datetime-local" required value="${toLocalInputValue(end)}"></div><div class="ff-field"><label>Location</label><input id="ffMeetLocation" placeholder="Frankfurt office / phone"></div><div class="ff-field"><label>Meeting link</label><input id="ffMeetUrl" type="url" placeholder="https://meet.google.com/..."></div><div class="ff-field full"><label>Notes / agenda</label><textarea id="ffMeetNotes" placeholder="Topics to discuss…"></textarea></div></div><label class="ff-check"><input id="ffMeetInvite" type="checkbox" checked> Send invitation email with .ics calendar attachment</label><div class="ff-meeting-actions"><button type="button" class="ff-secondary" id="ffMeetCancel">Cancel</button><button type="submit" class="ff-primary">${icon('event_available')} Schedule meeting</button></div></form><aside class="ff-meeting-list"><h3>Upcoming meetings</h3><div id="ffMeetingList">Loading…</div></aside></div></section>`;
  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  qs('#ffMeetingClose', backdrop).onclick = close; qs('#ffMeetCancel', backdrop).onclick = close;
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });

  async function renderList() {
    const mount = qs('#ffMeetingList', backdrop);
    try {
      const meetings = await loadMeetings();
      mount.innerHTML = meetings.length ? meetings.map(m => `<article class="ff-meeting-item ${m.status === 'cancelled' ? 'cancelled' : ''}" data-meeting-id="${m.id}"><div class="ff-meeting-item-head"><strong>${esc(m.title)}</strong><time>${esc(fmtMeetingDate(m.starts_at))}</time></div><p>${m.location?`${esc(m.location)} · `:''}${(m.attendees || []).length} attendee${(m.attendees || []).length===1?'':'s'}${m.invitation_sent_at?' · invitation sent':''}${m.status==='cancelled'?' · cancelled':''}</p><div class="ff-meeting-item-actions">${m.status!=='cancelled'?`<button data-reinvite="${m.id}">Send invite</button><button data-cancel="${m.id}">Cancel meeting</button>`:''}<button data-delete="${m.id}">Delete</button></div></article>`).join('') : '<p style="color:#71848a;font-size:13px">No upcoming meetings yet.</p>';
      qsa('[data-reinvite]', mount).forEach(btn => btn.onclick = async () => { const meeting = meetings.find(x => x.id === btn.dataset.reinvite); if (!meeting) return; btn.disabled=true; btn.textContent='Sending…'; try { await sendMeetingInvites(meeting); btn.textContent='Sent'; await renderList(); } catch (error) { alert(error.message); btn.disabled=false; btn.textContent='Send invite'; } });
      qsa('[data-cancel]', mount).forEach(btn => btn.onclick = async () => { await mailDb.from('frankiflow_mail_meetings').update({ status:'cancelled', updated_at:new Date().toISOString() }).eq('id', btn.dataset.cancel); await renderList(); });
      qsa('[data-delete]', mount).forEach(btn => btn.onclick = async () => { if (!confirm('Delete this meeting?')) return; await mailDb.from('frankiflow_mail_meetings').delete().eq('id', btn.dataset.delete); await renderList(); });
    } catch (error) { mount.textContent = error.message || 'Could not load meetings.'; }
  }
  await renderList();

  qs('#ffMeetingForm', backdrop).onsubmit = async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    const startsAt = new Date(qs('#ffMeetStart', backdrop).value), endsAt = new Date(qs('#ffMeetEnd', backdrop).value);
    if (!(endsAt > startsAt)) return alert('End time must be after the start time.');
    const meeting = {
      created_by: currentSession.user.id,
      title: qs('#ffMeetTitle', backdrop).value.trim(),
      starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(), timezone: MEETING_TZ,
      attendees: splitEmails(qs('#ffMeetAttendees', backdrop).value),
      location: qs('#ffMeetLocation', backdrop).value.trim() || null,
      meeting_url: qs('#ffMeetUrl', backdrop).value.trim() || null,
      notes: qs('#ffMeetNotes', backdrop).value.trim() || null,
      status:'scheduled', updated_at:new Date().toISOString()
    };
    button.disabled=true; button.innerHTML=`${icon('progress_activity')} Saving…`;
    const { data, error } = await mailDb.from('frankiflow_mail_meetings').insert(meeting).select('*').single();
    if (error) { button.disabled=false; button.innerHTML=`${icon('event_available')} Schedule meeting`; return alert(error.message); }
    try { if (qs('#ffMeetInvite', backdrop).checked && data.attendees.length) await sendMeetingInvites(data); } catch (error) { alert(`Meeting was saved, but the invitation could not be sent: ${error.message}`); }
    event.currentTarget.reset();
    qs('#ffMeetStart', backdrop).value = toLocalInputValue(now); qs('#ffMeetEnd', backdrop).value = toLocalInputValue(end); qs('#ffMeetInvite', backdrop).checked = true;
    button.disabled=false; button.innerHTML=`${icon('event_available')} Schedule meeting`;
    await renderList();
  };
}

function decorate() {
  injectEnhancementStyles();
  decorateBrand();
  decorateSidebarMeeting();
  decorateTopbar();
  updateUnreadTitle();
  standaloneView();
  enhanceReader();
}

function scheduleDecorate() {
  if (decorateScheduled) return;
  decorateScheduled = true;
  requestAnimationFrame(() => {
    decorateScheduled = false;
    decorate();
  });
}

function focusSearch() {
  const search = qs('#search');
  if (!search) return false;
  search.focus();
  search.select?.();
  return true;
}

window.addEventListener('online', updateConnectionPill);
window.addEventListener('offline', updateConnectionPill);
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault(); deferredInstallPrompt = event; scheduleDecorate();
});
window.addEventListener('appinstalled', () => { deferredInstallPrompt = null; qs('#ffInstallApp')?.remove(); });

let ffLastMailClick = { id:'', at:0 };
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
}, true);

document.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { if (focusSearch()) event.preventDefault(); }
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const now = Date.now();
  if (now - lastVisibleRefresh > 120000 && navigator.onLine) qs('#refreshBtn')?.click();
  lastVisibleRefresh = now;
});

mailDb.auth.onAuthStateChange((_event, currentSession) => { if (currentSession) { readerEnhancementKey=''; setTimeout(scheduleDecorate, 80); } });

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(error => console.warn('FrankiFlow Mail service worker registration failed', error));
  });
}

const observer = new MutationObserver(() => {
  const activeId = qs('.mail-row.active')?.dataset.id || '';
  if (!activeId) readerEnhancementKey = '';
  scheduleDecorate();
});
observer.observe(document.body, { childList:true, subtree:true });
scheduleDecorate();
