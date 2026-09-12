import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.116.0';
import { CONFIG } from './config.js';

const supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabasePublishableKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

const root = document.querySelector('#app');
const state = { session:null, all:[], folder:'inbox', activeId:null, search:'' };
const folders = ['inbox','starred','sent','drafts','archive','spam','trash'];
const labels = {inbox:'Inbox',starred:'Starred',sent:'Sent',drafts:'Drafts',archive:'Archive',spam:'Spam',trash:'Trash'};

const esc = (v='') => String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
const fmtDate = v => { if(!v) return ''; const d=new Date(v), now=new Date(); return d.toDateString()===now.toDateString()?d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):d.toLocaleDateString([], {day:'2-digit',month:'short'}); };
const addresses = v => Array.isArray(v)?v.join(', '):(v||'');
const toast = msg => { const el=document.createElement('div'); el.className='toast'; el.textContent=msg; document.body.append(el); setTimeout(()=>el.remove(),2600); };

function loginView(message=''){
  root.innerHTML=`<section class="login"><form class="login-card" id="loginForm"><div class="logo"><div class="logo-mark">F</div><div><h1>FrankiFlow Mail</h1><p>Secure company mailbox</p></div></div><div class="field"><label>Email</label><input id="email" type="email" value="${esc(CONFIG.mailbox)}" autocomplete="username" required></div><div class="field"><label>Password</label><input id="password" type="password" autocomplete="current-password" required></div><button class="btn-primary" type="submit">Sign in</button><div id="loginError" class="error">${esc(message)}</div></form></section>`;
  document.querySelector('#loginForm').addEventListener('submit', async e=>{
    e.preventDefault(); const btn=e.currentTarget.querySelector('button'); btn.disabled=true; btn.textContent='Signing in…';
    const {error}=await supabase.auth.signInWithPassword({email:document.querySelector('#email').value.trim(),password:document.querySelector('#password').value});
    if(error){document.querySelector('#loginError').textContent=error.message;btn.disabled=false;btn.textContent='Sign in';}
  });
}

function counts(){
  const c={}; folders.forEach(f=>c[f]=0);
  state.all.forEach(m=>{ if(m.folder)c[m.folder]=(c[m.folder]||0)+1; if(m.is_starred)c.starred++; });
  return c;
}
function currentMessages(){
  let arr=state.folder==='starred'?state.all.filter(m=>m.is_starred && m.folder!=='trash'):state.all.filter(m=>m.folder===state.folder);
  if(state.search){const q=state.search.toLowerCase();arr=arr.filter(m=>[m.from_address,m.from_name,m.subject,m.preview,m.text_body,...(m.to_addresses||[])].filter(Boolean).join(' ').toLowerCase().includes(q));}
  return arr;
}
function senderName(m){return m.direction==='outbound'||m.folder==='sent'?addresses(m.to_addresses):(m.from_name||m.from_address||'Unknown');}

function appView(){
  const c=counts();
  root.innerHTML=`<main class="app"><aside class="sidebar"><div class="side-brand"><div class="logo-mark">F</div><div class="words"><strong>FrankiFlow Mail</strong><small>Mehr als Reinigung.</small></div></div><button class="compose-main" id="composeMain">＋ Compose</button><nav class="nav">${folders.map(f=>`<button data-folder="${f}" class="${state.folder===f?'active':''}"><span class="label">${labels[f]}</span><span class="badge">${c[f]||''}</span></button>`).join('')}</nav><div class="side-foot"><span class="address">${esc(CONFIG.mailbox)}</span><button id="logout">Sign out</button></div></aside><section class="list-panel"><div class="topbar"><input class="search" id="search" type="search" placeholder="Search mail" value="${esc(state.search)}"><button class="icon-btn" id="refresh" title="Refresh">↻</button></div><div class="list-title"><h2>${labels[state.folder]}</h2><span>${currentMessages().length} messages</span></div><div class="messages" id="messages"></div></section><section class="reader" id="reader"></section></main>`;
  document.querySelectorAll('[data-folder]').forEach(b=>b.onclick=()=>{state.folder=b.dataset.folder;state.activeId=null;appView();});
  document.querySelector('#composeMain').onclick=()=>openCompose();
  document.querySelector('#logout').onclick=()=>supabase.auth.signOut();
  document.querySelector('#refresh').onclick=load;
  document.querySelector('#search').addEventListener('input',e=>{state.search=e.target.value;renderList();});
  renderList(); renderReader();
}

function renderList(){
  const box=document.querySelector('#messages'); if(!box)return; const rows=currentMessages();
  box.innerHTML=rows.length?rows.map(m=>`<article class="row ${m.is_read?'':'unread'} ${state.activeId===m.id?'active':''}" data-id="${m.id}"><span>${m.is_read?'':'<span class="dot"></span>'}</span><div><div class="sender">${esc(senderName(m))}</div><div class="subject">${esc(m.subject||'(no subject)')}</div><div class="snippet">${esc(m.preview||m.text_body||'')}</div></div><time class="time">${fmtDate(m.received_at||m.sent_at||m.created_at)}</time></article>`).join(''):`<div class="empty"><div><strong>No messages here</strong>This folder is currently empty.</div></div>`;
  box.querySelectorAll('.row').forEach(r=>r.onclick=async()=>{state.activeId=r.dataset.id; const m=state.all.find(x=>x.id===state.activeId); if(m&&!m.is_read&&m.direction==='inbound'){await updateMessage(m.id,{is_read:true});} renderList();renderReader();});
  const title=document.querySelector('.list-title span'); if(title)title.textContent=`${rows.length} messages`;
}

function renderReader(){
  const panel=document.querySelector('#reader'); if(!panel)return; const m=state.all.find(x=>x.id===state.activeId);
  if(!m){panel.classList.remove('open');panel.innerHTML='<div class="empty"><div><strong>Select an email</strong>Choose a message from the list to read it.</div></div>';return;}
  const thread=m.thread_id?state.all.filter(x=>x.thread_id===m.thread_id).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at)):[m];
  panel.classList.add('open'); panel.innerHTML=`<div class="reader-head"><div><button class="btn-secondary mobile-back" id="back">←</button> <span class="reader-title">${esc(m.subject||'(no subject)')}</span></div><div class="reader-tools"><button class="icon-btn" id="star" title="Star">${m.is_starred?'★':'☆'}</button><button class="icon-btn" id="archive" title="Archive">⌄</button><button class="icon-btn" id="trash" title="Trash">♲</button></div></div><div class="thread">${thread.map(x=>`<article class="card"><header><div><div class="from">${esc(x.from_name||x.from_address)}</div><div class="meta">From ${esc(x.from_address)} · to ${esc(addresses(x.to_addresses))}</div></div><time class="meta">${esc(new Date(x.received_at||x.sent_at||x.created_at).toLocaleString())}</time></header><div class="body">${esc(x.text_body||x.preview||'').replace(/\n/g,'<br>')}</div></article>`).join('')}</div><div class="reply"><div class="reply-box"><textarea id="replyText" placeholder="Reply to ${esc(m.from_name||m.from_address)}…"></textarea><div class="reply-actions"><button class="btn-secondary" id="replyCompose">Open composer</button><button class="btn-primary" id="quickReply">Reply</button></div></div></div>`;
  panel.querySelector('#back')?.addEventListener('click',()=>panel.classList.remove('open'));
  panel.querySelector('#star').onclick=async()=>{await updateMessage(m.id,{is_starred:!m.is_starred});};
  panel.querySelector('#archive').onclick=async()=>{await updateMessage(m.id,{folder:'archive'});state.activeId=null;await load();};
  panel.querySelector('#trash').onclick=async()=>{await updateMessage(m.id,{folder:'trash'});state.activeId=null;await load();};
  panel.querySelector('#replyCompose').onclick=()=>openCompose({to:m.reply_to||m.from_address,subject:/^re:/i.test(m.subject||'')?m.subject:`Re: ${m.subject||''}`,thread_id:m.thread_id,in_reply_to:m.provider_message_id});
  panel.querySelector('#quickReply').onclick=async()=>{const text=panel.querySelector('#replyText').value.trim();if(!text)return;await sendMail({to:m.reply_to||m.from_address,subject:/^re:/i.test(m.subject||'')?m.subject:`Re: ${m.subject||''}`,text,thread_id:m.thread_id,in_reply_to:m.provider_message_id});};
}

async function updateMessage(id, patch){
  const {error}=await supabase.from('frankiflow_mail_messages').update({...patch,updated_at:new Date().toISOString()}).eq('id',id); if(error){toast(error.message);return;} Object.assign(state.all.find(x=>x.id===id)||{},patch);appView();
}

function openCompose(seed={}){
  const wrap=document.createElement('div');wrap.className='modal';wrap.innerHTML=`<section class="compose"><div class="compose-head"><strong>New message</strong><button id="closeCompose">×</button></div><div class="compose-body"><div class="compose-field"><span>From</span><input value="${esc(CONFIG.mailbox)}" disabled></div><div class="compose-field"><span>To</span><input id="cTo" value="${esc(seed.to||'')}" placeholder="name@example.com"></div><div class="compose-field"><span>CC</span><input id="cCc" placeholder="Optional"></div><div class="compose-field"><span>BCC</span><input id="cBcc" placeholder="Optional"></div><div class="compose-field"><span>Subject</span><input id="cSubject" value="${esc(seed.subject||'')}"></div><textarea id="cBody" placeholder="Write your message…">${esc(seed.text||'')}</textarea></div><div class="compose-foot"><span class="meta">Secure sending via FrankiFlow backend</span><div class="right"><button class="btn-secondary" id="saveDraft">Save draft</button><button class="btn-primary" id="send">Send</button></div></div></section>`;document.body.append(wrap);
  const close=()=>wrap.remove();wrap.querySelector('#closeCompose').onclick=close;wrap.addEventListener('click',e=>{if(e.target===wrap)close();});
  wrap.querySelector('#saveDraft').onclick=async()=>{const data=composeData(wrap,seed);const account=await primaryAccount();const {error}=await supabase.from('frankiflow_mail_messages').insert({account_id:account.id,thread_id:data.thread_id||null,direction:'draft',folder:'drafts',from_address:CONFIG.mailbox,to_addresses:splitAddr(data.to),cc_addresses:splitAddr(data.cc),bcc_addresses:splitAddr(data.bcc),subject:data.subject,text_body:data.text,preview:data.text.slice(0,180),is_read:true});if(error)toast(error.message);else{toast('Draft saved');close();await load();}};
  wrap.querySelector('#send').onclick=async()=>{const data=composeData(wrap,seed);if(!data.to.trim()){toast('Add a recipient');return;} const ok=await sendMail(data);if(ok)close();};
}
const splitAddr=v=>String(v||'').split(',').map(x=>x.trim()).filter(Boolean);
function composeData(wrap,seed){return {to:wrap.querySelector('#cTo').value,cc:wrap.querySelector('#cCc').value,bcc:wrap.querySelector('#cBcc').value,subject:wrap.querySelector('#cSubject').value,text:wrap.querySelector('#cBody').value,thread_id:seed.thread_id||null,in_reply_to:seed.in_reply_to||null};}
async function primaryAccount(){const {data,error}=await supabase.from('frankiflow_mail_accounts').select('*').eq('is_primary',true).single();if(error)throw error;return data;}
async function sendMail(payload){
  try{const {data,error}=await supabase.functions.invoke('send-mail',{body:{...payload,to:splitAddr(payload.to),cc:splitAddr(payload.cc),bcc:splitAddr(payload.bcc)}});if(error)throw error;if(data?.error)throw new Error(data.error);toast('Email sent');await load();return true;}catch(e){toast(`Send failed: ${e.message}`);return false;}
}

async function load(){
  if(!state.session)return; const {data,error}=await supabase.from('frankiflow_mail_messages').select('*').order('created_at',{ascending:false}).limit(500); if(error){toast(error.message);return;} state.all=data||[];if(!document.querySelector('.app'))appView();else appView();
}

supabase.auth.onAuthStateChange(async(_event,session)=>{state.session=session;if(session)await load();else loginView();});
const {data:{session}}=await supabase.auth.getSession();state.session=session;if(session)await load();else loginView();
