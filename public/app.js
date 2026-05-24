const apiBaseInput = document.getElementById("apiBaseUrl");
const activeApiDisplay = document.getElementById("activeApiDisplay");
const platformGrid = document.getElementById("platformGrid");
const qrcodeContainer = document.getElementById("qrcodeContainer");
const checkSessionBtn = document.getElementById("checkSessionBtn");
const clearSessionBtn = document.getElementById("clearSessionBtn");
const uuidDisplay = document.getElementById("uuidDisplay");
const loginStatus = document.getElementById("loginStatus");
const protocolValue = document.getElementById("protocolValue");
const sessionNameValue = document.getElementById("sessionNameValue");
const sessionIdValue = document.getElementById("sessionIdValue");
const codeValue = document.getElementById("codeValue");
const latestApiValue = document.getElementById("latestApiValue");
const singleApiValue = document.getElementById("singleApiValue");
const pollStatusBadge = document.getElementById("pollStatusBadge");
const pollCount = document.getElementById("pollCount");
const pollInterval = document.getElementById("pollInterval");
const copyCodeBtn = document.getElementById("copyCodeBtn");
const logPanel = document.getElementById("logPanel");

let API_BASE = localStorage.getItem("wechat_web_api") || "http://127.0.0.1:3218";
let protocols = [];
let currentSession = null;
let pollTimer = null;
let pollTimes = 0;

const platformIcons = {
  ipad: "iPad",
  mac: "Mac",
  android: "Android",
  windows: "Windows",
  "windows-unified": "Win统一版",
  "windows-uwp": "Win UWP",
  car: "Car",
  special: "特殊通道",
};

function setApiBase(value) {
  API_BASE = value.replace(/\/+$/, "");
  localStorage.setItem("wechat_web_api", API_BASE);
  apiBaseInput.value = API_BASE;
  activeApiDisplay.textContent = API_BASE;
  renderEndpointHints();
}

function addLog(message, type = "info") {
  const div = document.createElement("div");
  div.className = `log-item ${type}`;
  const time = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  div.innerHTML = `<span class="log-time">[${time}]</span><span>${message}</span>`;
  logPanel.appendChild(div);
  div.scrollIntoView({ behavior: "smooth", block: "nearest" });
  while (logPanel.children.length > 120) {
    logPanel.removeChild(logPanel.children[0]);
  }
}

async function requestJson(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "请求失败");
  }
  return data;
}

async function loadProtocols() {
  protocols = await requestJson("/api/protocols");
  renderProtocolButtons();
}

function renderProtocolButtons() {
  platformGrid.innerHTML = "";
  for (const protocol of protocols) {
    const button = document.createElement("button");
    button.className = "btn btn-primary";
    button.textContent = platformIcons[protocol.id] || protocol.name;
    button.addEventListener("click", () => createSession(protocol));
    platformGrid.appendChild(button);
  }
}

async function createSession(protocol) {
  stopPolling(false);
  addLog(`获取 ${protocol.name} 登录二维码...`);
  const payload = { protocolId: protocol.id, name: `${protocol.name}会话` };
  const result = await requestJson("/api/code/sessions", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  currentSession = result;
  renderSession(result);
  startPolling();
}

function renderQr(session) {
  if (session.qrDataUrl) {
    qrcodeContainer.innerHTML = `<img src="${session.qrDataUrl}" alt="二维码">`;
  } else {
    qrcodeContainer.innerHTML = `<div class="qrcode-placeholder"><div class="placeholder-icon">⌁</div><p>当前会话未返回二维码</p></div>`;
  }
}

function renderEndpointHints() {
  const protocolId = currentSession?.protocolId || "--";
  latestApiValue.textContent = protocolId === "--" ? "--" : `${API_BASE}/api/code/latest?protocolId=${protocolId}`;
  singleApiValue.textContent =
    currentSession?.sessionId ? `${API_BASE}/api/code/sessions/${currentSession.sessionId}/value` : "--";
}

function renderSession(session) {
  renderQr(session);
  uuidDisplay.textContent = `Session ID: ${session.sessionId || session.id || "暂无"}`;
  loginStatus.innerHTML =
    session.ready || session.status === "online"
      ? '<span class="badge-success">已登录</span>'
      : `<span class="badge-warning">${session.statusText || session.status || "处理中"}</span>`;
  protocolValue.textContent = platformIcons[session.protocolId] || session.protocolId || "--";
  sessionNameValue.textContent = session.name || "--";
  sessionIdValue.textContent = session.sessionId || session.id || "--";
  codeValue.textContent = session.code || session.value || "--";
  copyCodeBtn.disabled = !(session.code || session.value);
  checkSessionBtn.disabled = !currentSession?.sessionId;
  clearSessionBtn.disabled = !currentSession?.sessionId;
  renderEndpointHints();
}

async function fetchCurrentSession() {
  if (!currentSession?.sessionId) return;
  try {
    const session = await requestJson(`/api/code/sessions/${currentSession.sessionId}`);
    currentSession = session;
    renderSession(session);
    if (session.ready) {
      addLog(`已获取可用 code: ${session.code}`, "success");
      stopPolling(false);
    } else {
      addLog(`状态更新: ${session.statusText || session.status}`);
    }
  } catch (error) {
    addLog(`轮询失败: ${error.message}`, "error");
  }
}

function setPollBadge(active) {
  if (active) {
    pollStatusBadge.className = "heartbeat-badge heartbeat-active";
    pollStatusBadge.innerHTML = '<span class="heartbeat-dot active"></span> 轮询中';
  } else {
    pollStatusBadge.className = "heartbeat-badge heartbeat-inactive";
    pollStatusBadge.innerHTML = '<span class="heartbeat-dot inactive"></span> 未启动';
  }
}

function startPolling() {
  stopPolling(false);
  if (!currentSession?.sessionId) return;
  pollTimes = 0;
  setPollBadge(true);
  addLog("开始轮询会话状态");
  fetchCurrentSession();
  pollTimer = setInterval(async () => {
    pollTimes += 1;
    pollCount.textContent = String(pollTimes);
    await fetchCurrentSession();
  }, Number(pollInterval.value));
}

function stopPolling(withLog = true) {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  setPollBadge(false);
  if (withLog) addLog("已停止轮询", "warning");
}

async function testApi() {
  try {
    const data = await requestJson("/api/protocols");
    addLog(`接口连接成功，共 ${data.length} 个协议`, "success");
  } catch (error) {
    addLog(`接口连接失败: ${error.message}`, "error");
  }
}

function clearSessionView() {
  stopPolling(false);
  currentSession = null;
  qrcodeContainer.innerHTML = `<div class="qrcode-placeholder"><div class="placeholder-icon">⌁</div><p>选择下方平台获取登录二维码</p></div>`;
  uuidDisplay.textContent = "Session ID: 暂无";
  loginStatus.textContent = "未开始";
  protocolValue.textContent = "--";
  sessionNameValue.textContent = "--";
  sessionIdValue.textContent = "--";
  codeValue.textContent = "--";
  copyCodeBtn.disabled = true;
  checkSessionBtn.disabled = true;
  clearSessionBtn.disabled = true;
  pollCount.textContent = "0";
  renderEndpointHints();
}

document.getElementById("applyApiBtn").addEventListener("click", async () => {
  setApiBase(apiBaseInput.value.trim() || "http://127.0.0.1:3218");
  await loadProtocols();
  addLog("已切换 Web 接口地址");
});

document.getElementById("testApiBtn").addEventListener("click", testApi);
document.getElementById("copyLatestApiBtn").addEventListener("click", async () => {
  if (!currentSession?.protocolId) {
    addLog("请先创建一个协议会话", "warning");
    return;
  }
  const text = `${API_BASE}/api/code/latest?protocolId=${currentSession.protocolId}`;
  await navigator.clipboard.writeText(text);
  addLog("已复制最新取码接口", "success");
});
document.getElementById("startPollBtn").addEventListener("click", startPolling);
document.getElementById("stopPollBtn").addEventListener("click", () => stopPolling(true));
document.getElementById("checkSessionBtn").addEventListener("click", fetchCurrentSession);
document.getElementById("clearSessionBtn").addEventListener("click", () => {
  clearSessionView();
  addLog("已清除当前页面会话展示", "warning");
});
document.getElementById("copyCodeBtn").addEventListener("click", async () => {
  const value = currentSession?.code || currentSession?.value;
  if (!value) return;
  await navigator.clipboard.writeText(value);
  addLog("已复制 Code", "success");
});
pollInterval.addEventListener("change", () => {
  if (pollTimer) startPolling();
});

async function init() {
  setApiBase(API_BASE);
  await loadProtocols();
  renderEndpointHints();
  addLog("系统就绪", "success");
}

init().catch((error) => {
  addLog(`初始化失败: ${error.message}`, "error");
});
