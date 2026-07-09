const shareText = document.querySelector("#shareText");
const providerOutput = document.querySelector("#provider");
const urlOutput = document.querySelector("#urlOutput");
const codeOutput = document.querySelector("#codeOutput");
const startButton = document.querySelector("#startButton");
const statusOutput = document.querySelector("#status");

let currentShare = null;
let currentShares = [];

chrome.storage.local.get(["lastShareText"], ({ lastShareText }) => {
  if (lastShareText) {
    shareText.value = lastShareText;
    updateParsed();
  }
});

shareText.addEventListener("input", () => {
  chrome.storage.local.set({ lastShareText: shareText.value });
  updateParsed();
});

startButton.addEventListener("click", async () => {
  if (currentShares.length === 0) return;

  startButton.disabled = true;
  statusOutput.textContent = "正在打开网盘页面...";

  try {
    const response = await chrome.runtime.sendMessage({
      type: "START_DOWNLOADS",
      shares: currentShares
    });

    if (!response?.ok) {
      throw new Error(response?.message || "启动失败。");
    }

    statusOutput.textContent = "已打开页面，插件会自动填码并尝试点击下载。";
    window.close();
  } catch (error) {
    statusOutput.textContent = error.message || "启动失败。";
    startButton.disabled = false;
  }
});

function updateParsed() {
  currentShares = parseShares(shareText.value);
  currentShare = currentShares[0] || null;

  providerOutput.textContent = currentShares.length > 1 ? `${currentShares.length} 条` : currentShare?.providerLabel || "待识别";
  urlOutput.textContent = currentShare?.url || "-";
  codeOutput.textContent = currentShares.length > 1 ? currentShares.map((share) => share.code || "-").join(", ") : currentShare?.code || "-";
  startButton.disabled = currentShares.length === 0;
  statusOutput.textContent = currentShares.length > 0 ? "" : "请粘贴包含百度或夸克链接的分享文字。";
}

function parseShares(text) {
  const urls = extractUrls(text);
  const shares = [];

  for (let index = 0; index < urls.length; index += 1) {
    const url = urls[index];
    const provider = detectProvider(url);
    if (!provider) continue;

    const start = text.indexOf(url);
    const end = index + 1 < urls.length ? text.indexOf(urls[index + 1]) : text.length;
    const block = text.slice(Math.max(0, start), end);

    shares.push({
      url,
      code: extractCode(block, url),
      provider,
      providerLabel: provider === "baidu" ? "百度" : "夸克"
    });
  }

  return shares;
}

function extractUrls(text) {
  return [...text.matchAll(/https?:\/\/[^\s"'<>，。]+/ig)]
    .map((match) => match[0].replace(/[）)\].,，。；;]+$/, ""));
}

function extractCode(text, rawUrl) {
  try {
    const url = new URL(rawUrl);
    for (const name of ["pwd", "code", "password"]) {
      const value = url.searchParams.get(name);
      if (value) return value.trim();
    }
  } catch {
    // Ignore malformed URLs. The text matcher below still covers common input.
  }

  const decoded = decodeURIComponent(text);
  const match = decoded.match(/(?:提取码|邀请码|访问码|code|pwd|password)[:：\s]*([A-Za-z0-9]{4,12})/i);
  return match?.[1] || "";
}

function detectProvider(rawUrl) {
  try {
    const host = new URL(rawUrl).host;
    if (host.includes("baidu.com")) return "baidu";
    if (host.includes("quark.cn") || host.includes("uc.cn")) return "quark";
  } catch {
    return null;
  }

  return null;
}
