const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');
const http = require('http');
const { execSync } = require('child_process');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const PORT = process.env.PORT || 3210;

app.use(express.static(path.join(__dirname, 'public')));

// --- Gateway RPC via CLI (handles auth automatically) ---
function gwCall(method, timeout = 15000) {
  try {
    const raw = execSync(
      `openclaw gateway call ${method} --json 2>/dev/null`,
      { encoding: 'utf-8', timeout, env: { ...process.env, NO_COLOR: '1' } }
    ).trim();
    const start = raw.indexOf('{');
    const startArr = raw.indexOf('[');
    const idx = (start >= 0 && startArr >= 0) ? Math.min(start, startArr)
              : (start >= 0 ? start : startArr);
    if (idx < 0) return null;
    return JSON.parse(raw.slice(idx));
  } catch (e) {
    return null;
  }
}

function getUsageCost() {
  try {
    const raw = execSync(
      'openclaw gateway usage-cost --json 2>/dev/null',
      { encoding: 'utf-8', timeout: 15000, env: { ...process.env, NO_COLOR: '1' } }
    ).trim();
    const idx = raw.indexOf('{');
    if (idx < 0) return null;
    return JSON.parse(raw.slice(idx));
  } catch { return null; }
}

async function collectMetrics() {
  // Run all CLI calls in parallel via promises
  const [health, status, presence, usageCost] = await Promise.all([
    new Promise(r => r(gwCall('health'))),
    new Promise(r => r(gwCall('status'))),
    new Promise(r => r(gwCall('system-presence'))),
    new Promise(r => r(getUsageCost())),
  ]);

  return { timestamp: Date.now(), health, status, presence, usageCost };
}

// REST fallback
app.get('/api/metrics', async (req, res) => {
  try {
    res.json(await collectMetrics());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// WebSocket push
let latestMetrics = null;
let clientCount = 0;

wss.on('connection', (ws) => {
  clientCount++;
  console.log(`[ws] +1 (${clientCount})`);
  if (latestMetrics) ws.send(JSON.stringify({ type: 'metrics', data: latestMetrics }));
  ws.on('close', () => { clientCount--; console.log(`[ws] -1 (${clientCount})`); });
});

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(msg); });
}

async function updateLoop() {
  try {
    latestMetrics = await collectMetrics();
    broadcast({ type: 'metrics', data: latestMetrics });
    console.log(`[update] OK — ${latestMetrics.status?.sessions?.count || '?'} sessions, ${clientCount} viewers`);
  } catch (e) {
    console.error('[update] Error:', e.message);
  }
  setTimeout(updateLoop, 15000);
}

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[dashboard] 🦐 http://127.0.0.1:${PORT}`);
  updateLoop();
});
