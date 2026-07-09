const pendingShares = new Map();
const shareTtlMs = 5 * 60 * 1000;

chrome.storage.session.setAccessLevel?.({
  accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS"
}).catch(() => {});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "GET_TAB_ID") {
    sendResponse(sender.tab?.id || null);
    return false;
  }

  if (message?.type === "GET_PENDING_SHARE") {
    getPendingShare(sender.tab?.id)
      .then((share) => sendResponse(share || null))
      .catch(() => sendResponse(null));

    return true;
  }

  if (message?.type === "CLEAR_PENDING_SHARE") {
    clearPendingShare(sender.tab?.id)
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));

    return true;
  }

  if (message?.type === "START_DOWNLOADS") {
    startDownloads(message.shares)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, message: error.message }));

    return true;
  }

  if (message?.type !== "START_DOWNLOAD") return false;

  startDownload(message.share)
    .then(() => sendResponse({ ok: true }))
    .catch((error) => sendResponse({ ok: false, message: error.message }));

  return true;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !pendingShares.has(tabId)) return;
  if (!tab.url || !isSupportedUrl(tab.url)) return;

  sendShareToTab(tabId, pendingShares.get(tabId));
});

async function startDownload(share) {
  validateShare(share);

  const tab = await chrome.tabs.create({
    url: share.url,
    active: true
  });

  const pendingShare = {
    ...share,
    createdAt: Date.now()
  };

  pendingShares.set(tab.id, pendingShare);
  await chrome.storage.session.set({
    [`share:${tab.id}`]: pendingShare
  });
}

async function startDownloads(shares) {
  if (!Array.isArray(shares) || shares.length === 0) {
    throw new Error("没有识别到可用链接。");
  }

  for (const share of shares) {
    await startDownload(share);
  }
}

async function sendShareToTab(tabId, share) {
  try {
    if (Date.now() - (share.createdAt || Date.now()) > shareTtlMs) {
      pendingShares.delete(tabId);
      await chrome.storage.session.remove(`share:${tabId}`);
      return;
    }

    await chrome.tabs.sendMessage(tabId, {
      type: "RUN_NETDISK_DOWNLOAD",
      share
    });
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    }).catch(() => {});
    setTimeout(() => sendShareToTab(tabId, share), 1200);
  }
}

async function getPendingShare(tabId) {
  if (!tabId) return null;

  const cached = pendingShares.get(tabId);
  if (cached) return cached;

  const key = `share:${tabId}`;
  const data = await chrome.storage.session.get(key);
  return data[key] || null;
}

async function clearPendingShare(tabId) {
  if (!tabId) return;

  pendingShares.delete(tabId);
  await chrome.storage.session.remove(`share:${tabId}`);
}

function validateShare(share) {
  if (!share?.url) {
    throw new Error("缺少分享链接。");
  }

  if (!isSupportedUrl(share.url)) {
    throw new Error("只支持百度网盘和夸克网盘链接。");
  }
}

function isSupportedUrl(rawUrl) {
  try {
    const host = new URL(rawUrl).host;
    return host.includes("baidu.com") || host.includes("quark.cn") || host.includes("uc.cn");
  } catch {
    return false;
  }
}
