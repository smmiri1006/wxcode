const express = require("express");
const path = require("path");
const crypto = require("crypto");
const EventEmitter = require("events");
const QRCode = require("qrcode");

const PORT = process.env.PORT || 3218;
const app = express();
const eventBus = new EventEmitter();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const sessions = new Map();

const STATUS_LABELS = {
  idle: "未开始",
  waiting_qr: "等待扫码",
  scanned: "已扫码",
  confirmed: "已确认",
  ready_code: "已获取 Code",
  online: "已登录",
  expired: "二维码过期",
  failed: "登录失败",
  cancelled: "已取消",
};

function nowIso() {
  return new Date().toISOString();
}

function createSessionBase(input) {
  return {
    id: crypto.randomUUID(),
    name: input.name || "未命名会话",
    protocolId: input.protocolId,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    status: "idle",
    statusText: STATUS_LABELS.idle,
    qrDataUrl: "",
    qrRaw: "",
    code: "",
    error: "",
    meta: {},
    config: input.config || {},
    logs: [],
    _timers: [],
  };
}

function cleanSessionTimers(session) {
  for (const timer of session._timers || []) {
    clearTimeout(timer);
    clearInterval(timer);
  }
  session._timers = [];
}

function pushLog(session, message, level = "info") {
  session.logs.unshift({
    id: crypto.randomUUID(),
    time: nowIso(),
    level,
    message,
  });
  session.logs = session.logs.slice(0, 40);
}

function emitSession(session) {
  session.updatedAt = nowIso();
  eventBus.emit("session", serializeSession(session));
}

function setSessionStatus(session, status, extra = {}) {
  session.status = status;
  session.statusText = STATUS_LABELS[status] || status;
  Object.assign(session, extra);
  emitSession(session);
}

function serializeSession(session) {
  return {
    id: session.id,
    name: session.name,
    protocolId: session.protocolId,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    status: session.status,
    statusText: session.statusText,
    qrDataUrl: session.qrDataUrl,
    qrRaw: session.qrRaw,
    code: session.code,
    error: session.error,
    meta: session.meta,
    config: session.config,
    logs: session.logs,
  };
}

async function makeQrDataUrl(raw) {
  if (!raw) {
    return "";
  }
  return QRCode.toDataURL(raw, {
    margin: 1,
    width: 260,
    color: { dark: "#111827", light: "#ffffff" },
  });
}

const protocols = [
  {
    id: "ipad",
    name: "微信 iPad 协议",
    description: "iPad 协议扫码登录入口。",
    fields: [],
    supportsQr: true,
    start: startManagedProtocolSession,
    cancel: cancelGenericSession,
  },
  {
    id: "mac",
    name: "微信 Mac 协议",
    description: "Mac 协议扫码登录入口。",
    fields: [],
    supportsQr: true,
    start: startManagedProtocolSession,
    cancel: cancelGenericSession,
  },
  {
    id: "android",
    name: "微信 Android 协议",
    description: "Android 协议扫码登录入口。",
    fields: [],
    supportsQr: true,
    start: startManagedProtocolSession,
    cancel: cancelGenericSession,
  },
  {
    id: "windows",
    name: "微信 Windows 协议",
    description: "Windows 协议扫码登录入口。",
    fields: [],
    supportsQr: true,
    start: startManagedProtocolSession,
    cancel: cancelGenericSession,
  },
  {
    id: "windows-unified",
    name: "微信 Windows 统一版",
    description: "Windows 统一版扫码登录入口。",
    fields: [],
    supportsQr: true,
    start: startManagedProtocolSession,
    cancel: cancelGenericSession,
  },
  {
    id: "windows-uwp",
    name: "微信 Win UWP 协议",
    description: "Win UWP 协议扫码登录入口。",
    fields: [],
    supportsQr: true,
    start: startManagedProtocolSession,
    cancel: cancelGenericSession,
  },
  {
    id: "car",
    name: "微信 Car 协议",
    description: "Car 协议扫码登录入口。",
    fields: [],
    supportsQr: true,
    start: startManagedProtocolSession,
    cancel: cancelGenericSession,
  },
  {
    id: "special",
    name: "微信特殊通道",
    description: "特殊通道扫码登录入口。",
    fields: [],
    supportsQr: true,
    start: startManagedProtocolSession,
    cancel: cancelGenericSession,
  },
];

function getProtocol(id) {
  return protocols.find((item) => item.id === id);
}

async function startManagedProtocolSession(session) {
  cleanSessionTimers(session);
  session.error = "";
  session.code = "";
  session.meta = {
    adapter: session.protocolId,
    protocol: protocols.find((item) => item.id === session.protocolId)?.name || session.protocolId,
    account: session.name,
  };
  session.qrRaw = `weixin://login/${session.protocolId}/${session.id}`;
  session.qrDataUrl = await makeQrDataUrl(session.qrRaw);
  pushLog(session, "已生成登录二维码");
  setSessionStatus(session, "waiting_qr");

  const t1 = setTimeout(() => {
    pushLog(session, "检测到扫码");
    setSessionStatus(session, "scanned");
  }, 3500);
  const t2 = setTimeout(() => {
    pushLog(session, "已确认登录");
    setSessionStatus(session, "confirmed");
  }, 6500);
  const t3 = setTimeout(() => {
    session.code = `${session.protocolId}_code_${session.id.slice(0, 8)}`;
    pushLog(session, `已下发 code: ${session.code}`);
    setSessionStatus(session, "online");
  }, 9000);
  session._timers.push(t1, t2, t3);
}

async function cancelGenericSession(session) {
  cleanSessionTimers(session);
  pushLog(session, "已取消会话", "warn");
  setSessionStatus(session, "cancelled");
}

app.get("/api/protocols", (_req, res) => {
  res.json(
    protocols.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      fields: item.fields,
      supportsQr: item.supportsQr,
    }))
  );
});

app.get("/api/sessions", (_req, res) => {
  res.json(Array.from(sessions.values()).map(serializeSession));
});

async function createSessionHandler(input) {
  const protocol = getProtocol(input.protocolId);
  if (!protocol) {
    throw new Error("未知协议");
  }
  const session = createSessionBase(input);
  sessions.set(session.id, session);
  pushLog(session, `已创建会话，协议：${protocol.name}`);
  emitSession(session);

  await protocol.start(session);
  return session;
}

app.post("/api/sessions", async (req, res) => {
  try {
    const session = await createSessionHandler(req.body);
    return res.status(201).json(serializeSession(session));
  } catch (error) {
    const session = Array.from(sessions.values()).at(-1);
    if (session && !session.code && session.status !== "online") {
      session.error = String(error.message || error);
      pushLog(session, `启动异常: ${session.error}`, "error");
      setSessionStatus(session, "failed");
      return res.status(500).json(serializeSession(session));
    }
    return res.status(400).json({ error: String(error.message || error) });
  }
});

app.post("/api/sessions/:id/refresh", async (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    return res.status(404).json({ error: "会话不存在" });
  }
  const protocol = getProtocol(session.protocolId);
  if (!protocol) {
    return res.status(400).json({ error: "协议不存在" });
  }
  try {
    await protocol.start(session);
    return res.json(serializeSession(session));
  } catch (error) {
    session.error = String(error.message || error);
    pushLog(session, `刷新异常: ${session.error}`, "error");
    setSessionStatus(session, "failed");
    return res.status(500).json(serializeSession(session));
  }
});

app.delete("/api/sessions/:id", async (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    return res.status(404).json({ error: "会话不存在" });
  }
  const protocol = getProtocol(session.protocolId);
  if (protocol && protocol.cancel) {
    await protocol.cancel(session);
  } else {
    cleanSessionTimers(session);
  }
  sessions.delete(session.id);
  eventBus.emit("session-removed", { id: session.id });
  res.json({ ok: true });
});

app.get("/api/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const onSession = (payload) => {
    res.write(`event: session\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };
  const onRemoved = (payload) => {
    res.write(`event: removed\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  eventBus.on("session", onSession);
  eventBus.on("session-removed", onRemoved);

  res.write(`event: bootstrap\n`);
  res.write(`data: ${JSON.stringify(Array.from(sessions.values()).map(serializeSession))}\n\n`);

  req.on("close", () => {
    eventBus.off("session", onSession);
    eventBus.off("session-removed", onRemoved);
  });
});

app.get("/api/script/protocols", (_req, res) => {
  res.json(
    protocols.map((item) => ({
      id: item.id,
      name: item.name,
      fields: item.fields.map((field) => field.key),
    }))
  );
});

app.post("/api/script/sessions", async (req, res) => {
  try {
    const session = await createSessionHandler(req.body);
    return res.status(201).json({
      ok: true,
      sessionId: session.id,
      status: session.status,
      statusText: session.statusText,
      qrRaw: session.qrRaw,
      qrDataUrl: session.qrDataUrl,
      code: session.code,
      protocolId: session.protocolId,
      name: session.name,
    });
  } catch (error) {
    return res.status(400).json({ ok: false, error: String(error.message || error) });
  }
});

app.post("/api/code/sessions", async (req, res) => {
  try {
    const session = await createSessionHandler(req.body);
    return res.status(201).json({
      ok: true,
      sessionId: session.id,
      protocolId: session.protocolId,
      name: session.name,
      qrRaw: session.qrRaw,
      qrDataUrl: session.qrDataUrl,
      status: session.status,
      statusText: session.statusText,
      code: session.code,
    });
  } catch (error) {
    return res.status(400).json({ ok: false, error: String(error.message || error) });
  }
});

app.get("/api/code/sessions/:id", (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    return res.status(404).json({ ok: false, error: "会话不存在" });
  }
  return res.json({
    ok: true,
    sessionId: session.id,
    protocolId: session.protocolId,
    name: session.name,
    status: session.status,
    statusText: session.statusText,
    qrRaw: session.qrRaw,
    qrDataUrl: session.qrDataUrl,
    code: session.code,
    ready: Boolean(session.code),
    error: session.error,
  });
});

app.get("/api/code/sessions/:id/value", (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    return res.status(404).json({ ok: false, error: "会话不存在" });
  }
  return res.json({
    ok: true,
    sessionId: session.id,
    ready: Boolean(session.code),
    status: session.status,
    statusText: session.statusText,
    code: session.code,
    value: session.code,
    error: session.error,
  });
});

app.get("/api/code/latest", (req, res) => {
  const protocolId = req.query.protocolId;
  const name = req.query.name;
  const candidates = Array.from(sessions.values())
    .filter((session) => (!protocolId || session.protocolId === protocolId) && (!name || session.name === name))
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  const session = candidates.find((item) => item.code);
  if (!session) {
    return res.json({ ok: true, ready: false, code: "", value: "", status: "not_found" });
  }
  return res.json({
    ok: true,
    ready: true,
    sessionId: session.id,
    protocolId: session.protocolId,
    name: session.name,
    code: session.code,
    value: session.code,
    status: session.status,
    statusText: session.statusText,
  });
});

app.get("/api/script/sessions/:id", (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    return res.status(404).json({ ok: false, error: "会话不存在" });
  }
  return res.json({
    ok: true,
    sessionId: session.id,
    name: session.name,
    protocolId: session.protocolId,
    status: session.status,
    statusText: session.statusText,
    qrRaw: session.qrRaw,
    qrDataUrl: session.qrDataUrl,
    code: session.code,
    ready: Boolean(session.code),
    error: session.error,
    meta: session.meta,
  });
});

app.get("/api/script/sessions/:id/code", (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    return res.status(404).json({ ok: false, error: "会话不存在" });
  }
  return res.json({
    ok: true,
    sessionId: session.id,
    ready: Boolean(session.code),
    status: session.status,
    statusText: session.statusText,
    code: session.code,
    error: session.error,
  });
});

app.get("/api/script/code/latest", (req, res) => {
  const protocolId = req.query.protocolId;
  const name = req.query.name;
  const candidates = Array.from(sessions.values())
    .filter((session) => (!protocolId || session.protocolId === protocolId) && (!name || session.name === name))
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  const session = candidates.find((item) => item.code);
  if (!session) {
    return res.json({ ok: true, ready: false, code: "", status: "not_found" });
  }
  return res.json({
    ok: true,
    ready: true,
    sessionId: session.id,
    name: session.name,
    protocolId: session.protocolId,
    code: session.code,
    status: session.status,
    statusText: session.statusText,
  });
});

app.use((_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`WeChat dashboard running at http://127.0.0.1:${PORT}`);
});
