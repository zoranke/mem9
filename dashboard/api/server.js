import fs from "node:fs";
import path from "node:path";
import express from "express";
import Database from "better-sqlite3";
import rateLimit from "express-rate-limit";

const app = express();
const port = Number(process.env.PORT || 3101);
const mnemoBaseUrl = (process.env.MNEMO_BASE_URL || "http://localhost:8888").replace(/\/+$/, "");
const fallbackApiKey = process.env.MEM9_API_KEY || "";
const dbPath = process.env.AUDIT_DB_PATH || path.join(process.cwd(), "data", "audit.db");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const auditDb = new Database(dbPath);
auditDb.pragma("journal_mode = WAL");
auditDb.exec(`
  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    method TEXT NOT NULL,
    path TEXT NOT NULL,
    query_text TEXT,
    resource_id TEXT,
    status_code INTEGER NOT NULL,
    ip TEXT,
    user_agent TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_logs(ts);
  CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor);
  CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
`);

const insertAuditStmt = auditDb.prepare(`
  INSERT INTO audit_logs (
    ts, actor, action, method, path, query_text, resource_id, status_code, ip, user_agent
  ) VALUES (
    @ts, @actor, @action, @method, @path, @query_text, @resource_id, @status_code, @ip, @user_agent
  )
`);

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "rate limit exceeded" },
});

function parseBasicAuth(headerValue) {
  if (!headerValue || !headerValue.startsWith("Basic ")) return null;
  const decoded = Buffer.from(headerValue.slice(6), "base64").toString("utf8");
  const splitAt = decoded.indexOf(":");
  if (splitAt === -1) return null;
  return {
    user: decoded.slice(0, splitAt),
    pass: decoded.slice(splitAt + 1),
  };
}

function authMiddleware(req, res, next) {
  const configuredUser = process.env.BASIC_AUTH_USER;
  const configuredPass = process.env.BASIC_AUTH_PASS;

  if (!configuredUser || !configuredPass) {
    next();
    return;
  }

  const parsed = parseBasicAuth(req.headers.authorization);
  if (parsed && parsed.user === configuredUser && parsed.pass === configuredPass) {
    req.dashboardActor = parsed.user;
    next();
    return;
  }

  res.setHeader("WWW-Authenticate", 'Basic realm="mem9-dashboard"');
  res.status(401).json({ error: "authentication required" });
}

function getApiKey(req) {
  const headerKey = String(req.headers["x-api-key"] || "").trim();
  return headerKey || fallbackApiKey;
}

function getAgentId(req) {
  return String(req.headers["x-mnemo-agent-id"] || "dashboard").trim() || "dashboard";
}

function getActor(req) {
  return req.dashboardActor || getAgentId(req);
}

function buildMnemoHeaders(req, includeContentType = true) {
  const apiKey = getApiKey(req);
  if (!apiKey) {
    throw new Error("missing API key");
  }

  const headers = {
    "X-API-Key": apiKey,
    "X-Mnemo-Agent-Id": getAgentId(req),
  };

  if (includeContentType) {
    headers["Content-Type"] = "application/json";
  }

  return headers;
}

function normalizeQuery(query) {
  const params = new URLSearchParams();
  for (const [key, rawValue] of Object.entries(query)) {
    if (rawValue == null || rawValue === "") continue;
    if (Array.isArray(rawValue)) {
      for (const value of rawValue) {
        if (value != null && value !== "") params.append(key, String(value));
      }
      continue;
    }
    params.set(key, String(rawValue));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

async function fetchMnemo(req, method, resourcePath, body) {
  const response = await fetch(`${mnemoBaseUrl}/v1alpha2/mem9s${resourcePath}`, {
    method,
    headers: buildMnemoHeaders(req, body !== undefined),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let payload = null;
  if (text.length > 0) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
  }

  return {
    ok: response.ok,
    status: response.status,
    payload,
    headers: response.headers,
  };
}

function writeAudit(req, { action, statusCode, resourceId = "", queryText = "" }) {
  insertAuditStmt.run({
    ts: new Date().toISOString(),
    actor: getActor(req),
    action,
    method: req.method,
    path: req.path,
    query_text: queryText,
    resource_id: resourceId,
    status_code: statusCode,
    ip: req.ip,
    user_agent: req.get("user-agent") || "",
  });
}

function sendProxyResult(req, res, result, action, resourceId = "", queryText = "") {
  writeAudit(req, {
    action,
    statusCode: result.status,
    resourceId,
    queryText,
  });
  if (result.payload === null) {
    res.status(result.status).end();
    return;
  }
  res.status(result.status).json(result.payload);
}

async function listAllMemories(req) {
  const pageSize = 200;
  const baseParams = { ...req.query };
  delete baseParams.limit;
  delete baseParams.offset;

  const memories = [];
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;

  while (offset < total) {
    const pageQuery = normalizeQuery({
      ...baseParams,
      limit: pageSize,
      offset,
    });
    const result = await fetchMnemo(req, "GET", `/memories${pageQuery}`);
    if (!result.ok) {
      const error = new Error((result.payload && result.payload.error) || `HTTP ${result.status}`);
      error.statusCode = result.status;
      throw error;
    }
    const pageMemories = Array.isArray(result.payload?.memories) ? result.payload.memories : [];
    memories.push(...pageMemories);
    total = Number(result.payload?.total || 0);
    offset += Number(result.payload?.limit || pageSize);
    if (pageMemories.length === 0) break;
  }

  return memories;
}

function getTodayStartIso() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.getTime();
}

function buildStats(memories) {
  const todayStart = getTodayStartIso();
  const agents = new Map();
  let pinned = 0;
  let insight = 0;
  let todayAdded = 0;

  for (const memory of memories) {
    if (memory.memory_type === "pinned") pinned += 1;
    if (memory.memory_type === "insight") insight += 1;

    const createdAt = Date.parse(memory.created_at || "");
    if (Number.isFinite(createdAt) && createdAt >= todayStart) {
      todayAdded += 1;
    }

    const agentId = String(memory.agent_id || "unknown").trim() || "unknown";
    agents.set(agentId, (agents.get(agentId) || 0) + 1);
  }

  const total = memories.length;
  const agentDistribution = [...agents.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([agent_id, count]) => ({
      agent_id,
      count,
      ratio: total === 0 ? 0 : count / total,
    }));

  return {
    total,
    pinned,
    insight,
    today_added: todayAdded,
    agent_distribution: agentDistribution,
  };
}

function escapeCsv(value) {
  const stringValue = value == null ? "" : String(value);
  if (!/[",\n]/.test(stringValue)) return stringValue;
  return `"${stringValue.replace(/"/g, '""')}"`;
}

function toCsv(rows) {
  const headers = ["id", "ts", "actor", "action", "method", "path", "query_text", "resource_id", "status_code", "ip", "user_agent"];
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => escapeCsv(row[header])).join(","));
  }
  return lines.join("\n");
}

const router = express.Router();

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

router.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

router.use(authMiddleware);
router.use(limiter);

router.get("/memories", asyncHandler(async (req, res) => {
  const queryString = normalizeQuery(req.query);
  const result = await fetchMnemo(req, "GET", `/memories${queryString}`);
  sendProxyResult(req, res, result, req.query.q ? "memory.search" : "memory.list", "", String(req.query.q || ""));
}));

router.get("/memories/stats", asyncHandler(async (req, res) => {
  try {
    const memories = await listAllMemories(req);
    const stats = buildStats(memories);
    writeAudit(req, {
      action: "memory.stats",
      statusCode: 200,
      queryText: String(req.query.q || ""),
    });
    res.json(stats);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    writeAudit(req, {
      action: "memory.stats",
      statusCode,
      queryText: String(req.query.q || ""),
    });
    res.status(statusCode).json({ error: error.message || "stats request failed" });
  }
}));

router.get("/memories/:id", asyncHandler(async (req, res) => {
  const result = await fetchMnemo(req, "GET", `/memories/${encodeURIComponent(req.params.id)}`);
  sendProxyResult(req, res, result, "memory.get", req.params.id);
}));

router.post("/memories", asyncHandler(async (req, res) => {
  const result = await fetchMnemo(req, "POST", "/memories", req.body);
  sendProxyResult(req, res, result, "memory.create");
}));

router.put("/memories/:id", asyncHandler(async (req, res) => {
  const result = await fetchMnemo(req, "PUT", `/memories/${encodeURIComponent(req.params.id)}`, req.body);
  sendProxyResult(req, res, result, "memory.update", req.params.id);
}));

router.delete("/memories/:id", asyncHandler(async (req, res) => {
  const result = await fetchMnemo(req, "DELETE", `/memories/${encodeURIComponent(req.params.id)}`);
  sendProxyResult(req, res, result, "memory.delete", req.params.id);
}));

router.get("/session-messages", asyncHandler(async (req, res) => {
  const queryString = normalizeQuery(req.query);
  const result = await fetchMnemo(req, "GET", `/session-messages${queryString}`);
  sendProxyResult(req, res, result, "session.list", "", String(req.query.session_id || ""));
}));

router.get("/audit", (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 500);
  const rows = auditDb
    .prepare(`
      SELECT id, ts, actor, action, method, path, query_text, resource_id, status_code, ip, user_agent
      FROM audit_logs
      ORDER BY ts DESC
      LIMIT ?
    `)
    .all(limit);
  writeAudit(req, { action: "audit.list", statusCode: 200 });
  res.json({ logs: rows, total: rows.length });
});

router.get("/audit/export", (req, res) => {
  const format = req.query.format === "csv" ? "csv" : "json";
  const rows = auditDb
    .prepare(`
      SELECT id, ts, actor, action, method, path, query_text, resource_id, status_code, ip, user_agent
      FROM audit_logs
      ORDER BY ts DESC
    `)
    .all();

  writeAudit(req, { action: "audit.export", statusCode: 200 });

  if (format === "csv") {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="audit-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(toCsv(rows));
    return;
  }

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="audit-${new Date().toISOString().slice(0, 10)}.json"`);
  res.send(JSON.stringify({ exported_at: new Date().toISOString(), logs: rows }, null, 2));
});

app.use("/api", router);
app.use("/your-memory/api", router);

app.use((error, req, res, _next) => {
  const statusCode = Number(error?.statusCode || 500);
  writeAudit(req, {
    action: "request.error",
    statusCode,
    queryText: String(req.query?.q || ""),
  });
  res.status(statusCode).json({ error: error?.message || "internal server error" });
});

app.listen(port, () => {
  console.log(`mem9 dashboard-api listening on ${port}`);
});
