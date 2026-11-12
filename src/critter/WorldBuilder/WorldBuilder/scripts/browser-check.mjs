import fs from "node:fs/promises";
import path from "node:path";

// Uses an existing Edge/Chrome remote-debugging session. No npm packages are needed.
const arguments_ = process.argv.slice(2);
const options = {
  url: "http://127.0.0.1:8765/",
  port: "9223",
  width: "1440",
  height: "1000",
};
for (let i = 0; i < arguments_.length; i++) {
  const key = arguments_[i];
  if (key === "--help" || key === "-h") {
    console.log(
      "node browser-check.mjs --url URL [--port 9223] [--width 1440] [--height 1000] [--screenshot PATH] [--evaluate PATH] [--downloads .preview/PATH]",
    );
    process.exit(0);
  }
  if (
    !/^--(url|port|width|height|screenshot|evaluate|downloads)$/.test(key) ||
    !arguments_[i + 1]
  ) {
    console.error(`Unknown or incomplete option: ${key}`);
    process.exit(2);
  }
  options[key.substring(2)] = arguments_[++i];
}

const width = Number(options.width),
  height = Number(options.height),
  port = Number(options.port);
if (
  ![width, height, port].every(Number.isInteger) ||
  width < 240 ||
  height < 240 ||
  port < 1 ||
  port > 65535
) {
  console.error(
    "Width and height must be integers of at least 240; port must be a valid TCP port.",
  );
  process.exit(2);
}

const errors = [];
const failedAssets = [];
const requests = new Map();
const pending = new Map();
const listeners = new Map();
let socket;
let nextId = 0;
const conciseUrl = (url) =>
  typeof url === "string" && url.startsWith("data:")
    ? `${url.substring(0, url.indexOf(",") + 1)}[embedded asset]`
    : String(url || "").substring(0, 700);

function rememberError(error) {
  const details = typeof error === "string" ? { message: error } : error;
  if (!errors.some((existing) => existing.message === details.message))
    errors.push(details);
}

function exceptionDetails(details) {
  return {
    message:
      details.exception?.description || details.text || "Browser exception",
    url: conciseUrl(
      details.url || details.stackTrace?.callFrames?.[0]?.url || "",
    ),
    line:
      (details.lineNumber ??
        details.stackTrace?.callFrames?.[0]?.lineNumber ??
        0) + 1,
  };
}

function onEvent(method, callback) {
  if (!listeners.has(method)) listeners.set(method, new Set());
  listeners.get(method).add(callback);
  return () => listeners.get(method)?.delete(callback);
}

function waitForEvent(method, timeout = 25000) {
  let remove;
  let timer;
  const promise = new Promise((resolve) => {
    remove = onEvent(method, (params) => {
      clearTimeout(timer);
      remove();
      resolve({ received: true, params });
    });
    timer = setTimeout(() => {
      remove();
      resolve({ received: false });
    }, timeout);
  });
  return {
    promise,
    cancel() {
      clearTimeout(timer);
      remove();
    },
  };
}

function command(method, params = {}, timeout = 25000) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${method} timed out.`));
    }, timeout);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function getJson(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok)
    throw new Error(
      `Remote debugging endpoint returned ${response.status}: ${url}`,
    );
  return response.json();
}

async function evaluate(expression) {
  const result = await command(
    "Runtime.evaluate",
    {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
      timeout: 20000,
    },
    25000,
  );
  if (result.exceptionDetails) {
    rememberError(exceptionDetails(result.exceptionDetails));
    return {
      exception:
        result.exceptionDetails.exception?.description ||
        result.exceptionDetails.text,
    };
  }
  if (result.result?.subtype === "error") {
    rememberError(result.result.description || "Evaluation returned an error.");
    return { exception: result.result.description };
  }
  return result.result?.value ?? result.result?.unserializableValue ?? null;
}

try {
  let targets = await getJson(`http://127.0.0.1:${port}/json/list`);
  let page =
    targets.find(
      (target) =>
        target.type === "page" &&
        target.webSocketDebuggerUrl &&
        target.url.split("#")[0] === options.url.split("#")[0],
    ) ||
    targets.find(
      (target) =>
        target.type === "page" &&
        target.webSocketDebuggerUrl &&
        /^(https?:|file:|about:blank)/.test(target.url),
    );
  if (!page)
    page = await getJson(`http://127.0.0.1:${port}/json/new?about:blank`, {
      method: "PUT",
    });
  if (!page.webSocketDebuggerUrl)
    throw new Error(
      "No page target with a remote-debugging WebSocket was available.",
    );

  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Timed out connecting to the browser WebSocket.")),
      10000,
    );
    socket.addEventListener(
      "open",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
    socket.addEventListener(
      "error",
      () => {
        clearTimeout(timer);
        reject(new Error("Could not connect to the browser WebSocket."));
      },
      { once: true },
    );
  });
  socket.addEventListener("message", (event) => {
    let message;
    try {
      message = JSON.parse(String(event.data));
    } catch {
      return;
    }
    if (message.id) {
      const request = pending.get(message.id);
      if (!request) return;
      clearTimeout(request.timer);
      pending.delete(message.id);
      if (message.error)
        request.reject(
          new Error(message.error.message || JSON.stringify(message.error)),
        );
      else request.resolve(message.result || {});
      return;
    }
    for (const listener of listeners.get(message.method) || [])
      listener(message.params || {});
  });
  socket.addEventListener("close", () => {
    for (const [id, request] of pending) {
      clearTimeout(request.timer);
      request.reject(new Error("The browser disconnected."));
      pending.delete(id);
    }
  });

  onEvent("Runtime.exceptionThrown", (params) =>
    rememberError(exceptionDetails(params.exceptionDetails || {})),
  );
  onEvent("Log.entryAdded", (params) => {
    if (params.entry?.level === "error")
      rememberError({
        message: params.entry.text,
        url: conciseUrl(params.entry.url || ""),
        source: params.entry.source,
      });
  });
  onEvent("Network.requestWillBeSent", (params) =>
    requests.set(params.requestId, params.request.url),
  );
  onEvent("Network.loadingFailed", (params) => {
    if (!params.canceled)
      failedAssets.push({
        url: conciseUrl(requests.get(params.requestId) || ""),
        error: params.errorText,
      });
  });
  onEvent("Network.responseReceived", (params) => {
    if (params.response.status >= 400)
      failedAssets.push({
        url: conciseUrl(params.response.url),
        status: params.response.status,
      });
  });

  await Promise.all([
    command("Page.enable"),
    command("Runtime.enable"),
    command("Log.enable"),
    command("Network.enable"),
  ]);
  await command("Network.setCacheDisabled", { cacheDisabled: true });
  if (options.downloads) {
    const downloadPath = path.resolve(options.downloads),
      preview = path.resolve(".preview"),
      relative = path.relative(preview, downloadPath);
    if (relative.startsWith("..") || path.isAbsolute(relative))
      throw new Error("Browser downloads must stay within .preview.");
    await fs.mkdir(downloadPath, { recursive: true });
    await command("Browser.setDownloadBehavior", {
      behavior: "allow",
      downloadPath,
      eventsEnabled: true,
    });
  }
  await command("Log.clear");
  errors.length = 0;
  failedAssets.length = 0;
  requests.clear();
  await command("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const loaded = waitForEvent("Page.loadEventFired");
  const navigation = await command("Page.navigate", { url: options.url });
  if (navigation.errorText) {
    loaded.cancel();
    throw new Error(`Navigation failed: ${navigation.errorText}`);
  }
  const loadResult = navigation.loaderId
    ? await loaded.promise
    : { received: true };
  if (!navigation.loaderId) loaded.cancel();
  if (!loadResult.received)
    rememberError("The page did not finish its load event within 25 seconds.");

  // The app paints thumbnails asynchronously after its document load event.
  await evaluate(
    "(async () => { await document.fonts.ready; await new Promise(resolve => setTimeout(resolve, 1200)); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); return true; })()",
  );
  const evalResult = options.evaluate
    ? await evaluate(await fs.readFile(path.resolve(options.evaluate), "utf8"))
    : null;
  const diagnostics = await evaluate(`(() => {
    const stage = document.querySelector('#stage-status');
    const style = stage ? getComputedStyle(stage) : null;
    return {
      title: document.title,
      viewport: {width: innerWidth, height: innerHeight, devicePixelRatio},
      document: {scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight, bodyScrollWidth: document.body?.scrollWidth || 0},
      stageStatus: stage ? {text: stage.textContent.trim(), hidden: stage.hidden || style.display === 'none' || style.visibility === 'hidden'} : null,
      failedImages: Array.from(document.images).filter(image => image.complete && !image.naturalWidth && !(image.classList.contains('ProseMirror-separator') && !image.getAttribute('src'))).map(image => image.currentSrc || image.src),
      canvas: Array.from(document.querySelectorAll('canvas')).slice(0, 20).map(el => ({id: el.id, width: el.width, height: el.height}))
    };
  })()`);

  let screenshot = null;
  if (options.screenshot) {
    const result = await command("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: false,
    });
    screenshot = path.resolve(options.screenshot);
    await fs.mkdir(path.dirname(screenshot), { recursive: true });
    await fs.writeFile(screenshot, Buffer.from(result.data, "base64"));
  }
  const summary = {
    url: options.url,
    ...(diagnostics || {}),
    failedAssets: [
      ...failedAssets,
      ...(diagnostics?.failedImages || []).map((url) => ({
        url: conciseUrl(url),
        error: "Image did not load.",
      })),
    ].slice(0, 24),
    errors: errors.slice(0, 24),
    ...(options.evaluate ? { evalResult } : {}),
    ...(screenshot ? { screenshot } : {}),
  };
  delete summary.failedImages;
  console.log(JSON.stringify(summary, null, 2));
  if (errors.length || failedAssets.length) process.exitCode = 1;
} catch (error) {
  console.error(
    JSON.stringify(
      {
        error: error.message,
        errors: errors.slice(0, 12),
        failedAssets: failedAssets.slice(0, 12),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  if (socket && socket.readyState <= WebSocket.OPEN) socket.close();
  for (const [, request] of pending) clearTimeout(request.timer);
}
