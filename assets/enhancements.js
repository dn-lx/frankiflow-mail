const qs = (s, root = document) => root.querySelector(s);
let deferredInstallPrompt = null;
let lastVisibleRefresh = Date.now();

function onlineLabel() {
  return navigator.onLine ? 'Online' : 'Offline';
}

function updateConnectionPill() {
  const pill = qs('#ffConnectionPill');
  if (!pill) return;
  pill.textContent = onlineLabel();
  pill.classList.toggle('offline', !navigator.onLine);
  pill.title = navigator.onLine ? 'Connected' : 'No network connection';
}

function updateUnreadTitle() {
  const countText = qs('[data-folder="inbox"] .count')?.textContent?.trim();
  const count = Number(countText || 0);
  document.title = count > 0 ? `(${count}) FrankiFlow Mail` : 'FrankiFlow Mail';
}

function decorateBrand() {
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

  if (deferredInstallPrompt && !qs('#ffInstallApp', topbar)) {
    const install = document.createElement('button');
    install.id = 'ffInstallApp';
    install.className = 'icon-btn';
    install.title = 'Install FrankiFlow Mail';
    install.setAttribute('aria-label', 'Install FrankiFlow Mail');
    install.innerHTML = '<span class="material-symbols-rounded">install_desktop</span>';
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

function decorate() {
  decorateBrand();
  decorateTopbar();
  updateUnreadTitle();
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
  event.preventDefault();
  deferredInstallPrompt = event;
  decorateTopbar();
});
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  qs('#ffInstallApp')?.remove();
});

document.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    if (focusSearch()) event.preventDefault();
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const now = Date.now();
  if (now - lastVisibleRefresh > 120000 && navigator.onLine) {
    qs('#refreshBtn')?.click();
  }
  lastVisibleRefresh = now;
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(error => {
      console.warn('FrankiFlow Mail service worker registration failed', error);
    });
  });
}

const observer = new MutationObserver(() => queueMicrotask(decorate));
observer.observe(document.body, { childList: true, subtree: true });
decorate();
