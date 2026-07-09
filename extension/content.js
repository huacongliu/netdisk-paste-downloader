(function installNetdiskDownloader() {
  if (window.__netdiskPasteDownloaderInstalled) return;
  window.__netdiskPasteDownloaderInstalled = true;
  installExternalAppGuards();

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== "RUN_NETDISK_DOWNLOAD") return false;

    run(message.share)
      .then((result) => sendResponse(result))
      .catch((error) => {
        showStatus(error.message || "自动下载失败");
        sendResponse({ ok: false, message: error.message });
      });

    return true;
  });

  resumePendingShare();
})();

let lastDownloadClickAt = 0;

async function run(share) {
  await waitForPageReady();
  showStatus("已接管页面，正在识别按钮...");

  for (let round = 0; round < 36; round += 1) {
    const codeInput = findCodeInput();

    if (share.code && codeInput) {
      showStatus("正在填写提取码...");
      fillInput(codeInput, share.code);
      await sleep(400);

      const extracted = await clickByText(["提取文件", "提取", "确定", "提交", "进入", "确认"], {
        preferClickable: true,
        exactFirst: true
      });

      if (!extracted) {
        pressEnter(codeInput);
      }

      await sleep(1800);
      continue;
    }

    await closeLightDialogs();
    await prepareProviderPage(share);
    await selectFile(share);
    await sleep(600);

    if (await clickDownload(share)) {
      await confirmQuarkDownloadIfNeeded(share);
      showStatus("已点击下载按钮，如有浏览器确认请手动确认。");
      await clearPendingShare();
      return { ok: true };
    }

    if (await maybeSaveQuarkFile(share)) {
      await sleep(1500);
      continue;
    }

    showStatus("等待文件列表或下载按钮出现...");
    await sleep(1000);
  }

  showStatus("没有找到可点击的下载按钮，请手动点一次页面上的下载。");
  return { ok: false, message: "没有找到可点击的下载按钮。" };
}

function findCodeInput() {
  const inputs = visibleElements("input");
  const likely = inputs.find((input) => {
    const text = [
      input.placeholder,
      input.ariaLabel,
      input.name,
      input.id,
      input.className,
      input.getAttribute("maxlength")
    ].filter(Boolean).join(" ");

    return /提取码|访问码|请输入|code|pwd|pass|access|verify/i.test(text);
  });

  return likely || inputs.find((input) => {
    const type = (input.type || "text").toLowerCase();
    return ["text", "search", "tel", "password"].includes(type) && input.maxLength <= 12;
  });
}

function fillInput(input, value) {
  input.focus();
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
}

async function selectFile() {
  if (await clickByText(["全选", "选择全部"], { maxAttempts: 1 })) return true;

  const checkbox = visibleElements("input[type='checkbox'], [role='checkbox'], [class*='checkbox'], [class*='Checkbox'], [class*='check-box']")
    .find((element) => !isDisabled(element));

  if (checkbox) {
    dispatchClick(checkbox);
    return true;
  }

  const row = visibleElements("[class*='file'], [class*='File'], [class*='list'], [class*='List'], tr, li")
    .find((element) => {
      const text = normalizedText(element);
      return text && !/下载|分享|排序|名称|大小|时间|上传|新建|全部/.test(text);
    });

  if (row) {
    dispatchClick(row);
    return true;
  }

  return false;
}

async function prepareProviderPage(share) {
  if (share.provider !== "quark" && !location.host.includes("quark.cn")) return;

  await clickByText(["网页版", "使用网页版", "暂不打开", "取消", "以后再说"], {
    preferClickable: true,
    maxAttempts: 1,
    skipAppLaunchers: true
  });
}

async function clickDownload(share) {
  if (share.provider === "quark" || location.host.includes("quark.cn")) {
    if (await clickQuarkBottomDownloadButton()) return true;
    if (await clickQuarkDownloadControl()) return true;
  } else if (await clickKnownDownloadControl()) {
    return true;
  }

  return clickByText([
    "下载",
    "普通下载",
    "直接下载",
    "高速下载",
    "保存到本地"
  ], {
    preferClickable: true,
    exactFirst: true,
    skipText: appLauncherSkipTexts(),
    skipAppLaunchers: true
  });
}

async function clickQuarkBottomDownloadButton() {
  if (Date.now() - lastDownloadClickAt < 3000) return true;

  const shareDownloadButton = findQuarkShareDownloadButton();
  if (shareDownloadButton) {
    showStatus("正在点击夸克分享下载按钮...");
    lastDownloadClickAt = Date.now();
    return clickElementReliably(shareDownloadButton, { nativeClick: false });
  }

  const nearSaveButton = findDownloadButtonNearSaveButton();
  if (nearSaveButton) {
    showStatus("正在点击保存到网盘旁边的下载按钮...");
    lastDownloadClickAt = Date.now();
    return clickElementReliably(nearSaveButton, { nativeClick: false });
  }

  const targets = visibleElements("button, [role='button'], a, div, span")
    .map((element) => closestClickable(element))
    .filter((element, index, list) => element && list.indexOf(element) === index)
    .filter((element) => {
      if (isAppLauncher(element)) return false;

      const text = normalizedText(element);
      if (!hasLabel(text, "下载")) return false;

      const rect = element.getBoundingClientRect();
      const inBottomActionBar = rect.top > window.innerHeight * 0.55;
      const awayFromRightAd = rect.left < window.innerWidth * 0.78;
      const buttonSized = rect.width > 36 && rect.width < 180 && rect.height > 24 && rect.height < 80;

      return inBottomActionBar && awayFromRightAd && buttonSized;
    })
    .sort((a, b) => {
      const aRect = a.getBoundingClientRect();
      const bRect = b.getBoundingClientRect();
      return bRect.top - aRect.top || aRect.left - bRect.left;
    });

  if (!targets[0]) return false;

  showStatus("正在点击底部下载按钮...");
  lastDownloadClickAt = Date.now();
  return clickElementReliably(targets[0], { nativeClick: false });
}

function findDownloadButtonNearSaveButton() {
  const saveButtons = visibleElements("button, [role='button'], a, div, span")
    .map((element) => closestClickable(element))
    .filter((element, index, list) => element && list.indexOf(element) === index)
    .filter((element) => hasLabel(normalizedText(element), "保存到网盘") || hasLabel(normalizedText(element), "保存至网盘"));

  for (const saveButton of saveButtons) {
    const saveRect = saveButton.getBoundingClientRect();
    const candidates = visibleElements("button, [role='button'], a, div, span")
      .map((element) => closestClickable(element))
      .filter((element, index, list) => element && list.indexOf(element) === index)
      .filter((element) => {
        if (element === saveButton || isAppLauncher(element)) return false;

        const text = normalizedText(element);
        if (!hasLabel(text, "下载")) return false;

        const rect = element.getBoundingClientRect();
        const sameRow = Math.abs(rect.top - saveRect.top) < 18 || Math.abs(rect.bottom - saveRect.bottom) < 18;
        const leftOfSave = rect.right <= saveRect.left + 12;
        const closeEnough = saveRect.left - rect.right < 90;
        const buttonSized = rect.width > 36 && rect.width < 180 && rect.height > 24 && rect.height < 80;

        return sameRow && leftOfSave && closeEnough && buttonSized;
      })
      .sort((a, b) => b.getBoundingClientRect().left - a.getBoundingClientRect().left);

    if (candidates[0]) return candidates[0];

    const probe = findElementByPointNear(saveRect.left - 48, saveRect.top + saveRect.height / 2, "下载");
    if (probe) return probe;
  }

  return null;
}

function findQuarkShareDownloadButton() {
  const directButton = visibleElements(".share-download")
    .find((element) => (
      hasLabel(normalizedText(element), "下载") &&
      !isAppLauncher(element)
    ));

  if (directButton) return directButton;

  const textNodes = visibleElements(".share-download-text")
    .filter((element) => hasLabel(normalizedText(element), "下载"));

  for (const textNode of textNodes) {
    const clickable = closestClickable(textNode);
    if (clickable && !isAppLauncher(clickable)) return clickable;

    let current = textNode.parentElement;
    let depth = 0;

    while (current && depth < 5) {
      if (
        current instanceof HTMLElement &&
        isVisible(current) &&
        !isDisabled(current) &&
        !isAppLauncher(current) &&
        hasLabel(normalizedText(current), "下载")
      ) {
        return current;
      }

      current = current.parentElement;
      depth += 1;
    }

    return textNode;
  }

  return null;
}

async function maybeSaveQuarkFile(share) {
  if (share.provider !== "quark" && !location.host.includes("quark.cn")) return false;

  const saved = await clickByText([
    "保存到网盘",
    "保存至网盘",
    "转存",
    "保存"
  ], {
    preferClickable: true,
    exactFirst: true,
    maxAttempts: 1,
    skipText: appLauncherSkipTexts(),
    skipAppLaunchers: true
  });

  if (!saved) return false;

  showStatus("已尝试保存到夸克网盘，等待下载入口...");
  await sleep(800);
  await clickByText(["确定", "确认", "完成"], {
    preferClickable: true,
    maxAttempts: 2
  });

  return true;
}

async function confirmQuarkDownloadIfNeeded(share) {
  if (share.provider !== "quark" && !location.host.includes("quark.cn")) return;

  await sleep(700);
  await clickByText([
    "继续下载",
    "浏览器下载",
    "普通下载",
    "直接下载",
    "确认下载",
    "确定",
    "确认"
  ], {
    preferClickable: true,
    exactFirst: true,
    maxAttempts: 3,
    skipText: appLauncherSkipTexts(),
    skipAppLaunchers: true
  });
}

async function clickKnownDownloadControl() {
  const target = visibleElements([
    "[title*='下载']",
    "[aria-label*='下载']",
    "button",
    "a",
    "[role='button']",
    "[class*='download']",
    "[class*='Download']",
    "[class*='DownLoad']"
  ].join(",")).find((element) => {
    if (isAppLauncher(element)) return false;
    const text = normalizedText(element);
    const className = String(element.className || "");
    const id = String(element.id || "");
    const signal = `${text} ${className} ${id}`;
    return /下载|download|Download|DownLoad/.test(signal) && !hasAppLauncherSignal(signal);
  });

  if (!target) return false;

  dispatchClick(closestClickable(target));
  return true;
}

async function clickQuarkDownloadControl() {
  const controls = visibleElements("button, a, [role='button'], div, span, i, [title], [aria-label]")
    .map((element) => closestClickable(element))
    .filter((element, index, list) => element && list.indexOf(element) === index)
    .filter((element) => {
      if (isAppLauncher(element)) return false;
      const signal = [
        normalizedText(element),
        element.getAttribute("class"),
        element.getAttribute("data-testid"),
        element.getAttribute("data-click-id"),
        element.getAttribute("data-spm-click"),
        element.getAttribute("href")
      ].filter(Boolean).join(" ");

      if (hasAppLauncherSignal(signal)) return false;
      if (/下载|download|Download|DownLoad/.test(signal)) return true;

      const iconOnly = /download|DownLoad/i.test(signal);
      return iconOnly && scoreClickable(element) >= 2;
    })
    .sort((a, b) => scoreClickable(b) - scoreClickable(a));

  if (!controls[0]) return false;

  return clickElementReliably(controls[0], { nativeClick: false });
}

async function closeLightDialogs() {
  await clickByText(["我知道了", "知道了", "取消", "暂不", "以后再说"], {
    preferClickable: true,
    maxAttempts: 1,
    skipAppLaunchers: true
  });
}

async function clickByText(labels, options = {}) {
  const maxAttempts = options.maxAttempts || 10;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const target = findClickableByText(labels, options);
    if (target) {
      return clickElementReliably(target);
    }

    await sleep(450);
  }

  return false;
}

function findClickableByText(labels, options = {}) {
  const elements = visibleElements("button, a, span, div, i, svg, [role='button'], [title], [aria-label]");
  const matches = elements
    .map((element) => closestClickable(element))
    .filter((element, index, list) => element && list.indexOf(element) === index)
    .filter((element) => {
      if (options.skipAppLaunchers && isAppLauncher(element)) return false;
      const text = normalizedText(element);
      if (!text) return false;
      if (options.skipText?.some((label) => text.includes(label))) return false;

      if (options.exactFirst && labels.some((label) => hasLabel(text, label))) return true;
      return labels.some((label) => hasLabel(text, label));
    })
    .sort((a, b) => scoreClickable(b) - scoreClickable(a));

  if (options.preferClickable) {
    return matches.find((element) => scoreClickable(element) >= 2) || matches[0];
  }

  return matches[0];
}

function closestClickable(element) {
  return element.closest([
    "button",
    "a",
    "[role='button']",
    "[tabindex]",
    ".share-download",
    ".share-save",
    "[class*='button']",
    "[class*='Button']",
    "[class*='btn']",
    "[class*='Btn']",
    "[class*='g-button']"
  ].join(",")) || element;
}

function scoreClickable(element) {
  let score = 0;
  if (/^(BUTTON|A)$/.test(element.tagName)) score += 4;
  if (element.getAttribute("role") === "button") score += 3;
  if (element.tabIndex >= 0) score += 1;
  if (/button|btn|g-button/i.test(element.className || "")) score += 2;
  return score;
}

function visibleElements(selector) {
  return [...document.querySelectorAll(selector)]
    .filter((element) => element instanceof HTMLElement && isVisible(element) && !isDisabled(element));
}

function isVisible(element) {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
}

function normalizedText(element) {
  return [...new Set([
    element.innerText,
    element.textContent,
    element.title,
    element.ariaLabel,
    element.getAttribute("aria-label")
  ].filter(Boolean))].join(" ").replace(/\s+/g, " ").trim();
}

function hasLabel(text, label) {
  const normalized = text.replace(/\s+/g, "");
  return normalized === label || normalized.includes(label);
}

function findElementByPointNear(x, y, label) {
  for (let offset = -36; offset <= 36; offset += 12) {
    const element = document.elementFromPoint(x + offset, y);
    const clickable = element instanceof Element ? closestClickable(element) : null;

    if (
      clickable instanceof HTMLElement &&
      isVisible(clickable) &&
      !isDisabled(clickable) &&
      !isAppLauncher(clickable) &&
      hasLabel(normalizedText(clickable), label)
    ) {
      return clickable;
    }
  }

  return null;
}

function dispatchClick(element, options = {}) {
  if (isAppLauncher(element)) {
    showStatus("已避开会打开夸克APP的按钮，继续找网页下载按钮...");
    return false;
  }

  element.scrollIntoView({ block: "center", inline: "center" });
  const rect = element.getBoundingClientRect();
  const clientX = rect.left + rect.width / 2;
  const clientY = rect.top + rect.height / 2;
  const eventOptions = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    clientX,
    clientY,
    screenX: window.screenX + clientX,
    screenY: window.screenY + clientY
  };

  element.dispatchEvent(new PointerEvent("pointerover", { ...eventOptions, pointerId: 1, pointerType: "mouse", isPrimary: true }));
  element.dispatchEvent(new PointerEvent("pointerenter", { ...eventOptions, pointerId: 1, pointerType: "mouse", isPrimary: true }));
  element.dispatchEvent(new MouseEvent("mouseover", eventOptions));
  element.dispatchEvent(new MouseEvent("mouseenter", eventOptions));
  element.dispatchEvent(new PointerEvent("pointermove", { ...eventOptions, pointerId: 1, pointerType: "mouse", isPrimary: true }));
  element.dispatchEvent(new MouseEvent("mousemove", eventOptions));
  element.dispatchEvent(new PointerEvent("pointerdown", { ...eventOptions, pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0, buttons: 1 }));
  element.dispatchEvent(new MouseEvent("mousedown", { ...eventOptions, button: 0, buttons: 1 }));
  element.dispatchEvent(new PointerEvent("pointerup", { ...eventOptions, pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0, buttons: 0 }));
  element.dispatchEvent(new MouseEvent("mouseup", { ...eventOptions, button: 0, buttons: 0 }));
  element.dispatchEvent(new MouseEvent("click", { ...eventOptions, button: 0, buttons: 0, detail: 1 }));
  if (options.nativeClick !== false) {
    element.click();
  }
  return true;
}

async function clickElementReliably(element, options = {}) {
  const targets = [
    element,
    element.parentElement,
    element.parentElement?.parentElement,
    element.parentElement?.parentElement?.parentElement
  ].filter((target, index, list) => (
    target instanceof HTMLElement &&
    list.indexOf(target) === index &&
    isVisible(target) &&
    !isDisabled(target) &&
    !isAppLauncher(target)
  ));

  for (const target of targets) {
    if (dispatchClick(target, options)) return true;
  }

  return false;
}

function pressEnter(element) {
  for (const type of ["keydown", "keypress", "keyup"]) {
    element.dispatchEvent(new KeyboardEvent(type, {
      bubbles: true,
      cancelable: true,
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      which: 13
    }));
  }
}

function isDisabled(element) {
  return element.matches("[disabled], [aria-disabled='true'], .disabled, [class*='disabled']");
}

function installExternalAppGuards() {
  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest("a, button, [role='button'], [tabindex], div, span") : null;
    if (!target || !isAppLauncher(target)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    showStatus("已拦截打开夸克APP，继续留在网页内。");
  }, true);

  const originalOpen = window.open;
  window.open = function guardedOpen(url, ...args) {
    if (typeof url === "string" && isExternalAppUrl(url)) {
      showStatus("已拦截打开夸克APP。");
      return null;
    }

    return originalOpen.call(window, url, ...args);
  };
}

function isAppLauncher(element) {
  const signal = [
    normalizedText(element),
    element.getAttribute("href"),
    element.getAttribute("data-href"),
    element.getAttribute("data-url"),
    element.getAttribute("class"),
    element.getAttribute("aria-label"),
    element.getAttribute("title")
  ].filter(Boolean).join(" ");

  return hasAppLauncherSignal(signal) || isExternalAppUrl(element.getAttribute("href") || "");
}

function hasAppLauncherSignal(signal) {
  return /打开.{0,8}(APP|App|app|应用|客户端)|夸克APP|夸克 App|Quark App|下载客户端|客户端下载|安装客户端|手机端|扫码|二维码|唤起|callapp|openapp|scheme|deeplink|deepLink/i.test(signal);
}

function isExternalAppUrl(url) {
  return /^(quark|ucbrowser|uclink|intent|market|itms-apps):\/\//i.test(url);
}

function appLauncherSkipTexts() {
  return [
    "打开夸克APP",
    "夸克APP",
    "打开APP",
    "下载客户端",
    "客户端下载",
    "安装客户端",
    "手机端",
    "扫码"
  ];
}

async function resumePendingShare() {
  const share = await chrome.runtime.sendMessage({ type: "GET_PENDING_SHARE" }).catch(() => null);

  if (!share || Date.now() - (share.createdAt || Date.now()) > 5 * 60 * 1000) return;

  await sleep(1000);
  run(share).catch(() => {});
}

async function clearPendingShare() {
  await chrome.runtime.sendMessage({ type: "CLEAR_PENDING_SHARE" }).catch(() => null);
}

function waitForPageReady() {
  if (document.readyState === "complete" || document.readyState === "interactive") {
    return sleep(800);
  }

  return new Promise((resolve) => {
    window.addEventListener("DOMContentLoaded", () => resolve(sleep(800)), { once: true });
  });
}

function showStatus(text) {
  let node = document.querySelector("#netdisk-paste-downloader-status");

  if (!node) {
    node = document.createElement("div");
    node.id = "netdisk-paste-downloader-status";
    Object.assign(node.style, {
      position: "fixed",
      right: "16px",
      bottom: "16px",
      zIndex: "2147483647",
      maxWidth: "320px",
      padding: "10px 12px",
      borderRadius: "8px",
      color: "#fff",
      background: "rgba(22, 119, 255, 0.95)",
      font: "13px/1.45 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      boxShadow: "0 8px 28px rgba(0, 0, 0, 0.22)"
    });
    document.documentElement.appendChild(node);
  }

  node.textContent = `网盘插件：${text}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
