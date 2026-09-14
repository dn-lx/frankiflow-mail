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

  if (!qs('#ffMeetingBtn', topbar)) {
    const meeting = document.createElement('button');
    meeting.id = 'ffMeetingBtn';
    meeting.className = 'icon-btn';
    meeting.title = 'Meeting scheduler';
    meeting.setAttribute('aria-label','Meeting scheduler');
    meeting.innerHTML = `${icon('calendar_add_on')}<span class="ff-meeting-dot" aria-hidden="true"></span>`;
    meeting.addEventListener('click', () => openMeetingScheduler());
    topbar.appendChild(meeting);
  }

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
    const tools = qs('.reader-tools', panel);
    if (tools && !qs('#ffReaderMeeting', tools)) {
      const button = document.createElement('button');
      button.id = 'ffReaderMeeting'; button.className = 'icon-btn'; button.title = 'Schedule meeting with sender'; button.innerHTML = icon('calendar_add_on');
      button.addEventListener('click', () => openMeetingScheduler({ attendee: activeMessage.reply_to || activeMessage.from_address, subject: activeMessage.subject }));
      tools.prepend(button);
    }
    readerEnhancementKey = key;
  } finally { readerEnhancementBusy = false; }
}

function openMessageWindow(id) {
  if (!id) return;
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('message', id);
  window.open(url.toString(), '_blank', 'noopener');
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

document.addEventListener('dblclick', event => {
  const attachment = event.target.closest?.('.ff-attachment-card');
  if (attachment) return;
  const row = event.target.closest?.('.mail-row');
  if (!row || event.target.closest('.row-check,.star-btn,button,a,input')) return;
  event.preventDefault(); event.stopPropagation(); openMessageWindow(row.dataset.id);
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
