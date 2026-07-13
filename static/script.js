/* ---------- Clock ---------- */
function tickClock() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const str = `${hh}:${mm}:${ss}`;
  document.getElementById('clock').textContent = str;
  document.getElementById('footClock').textContent = now.toLocaleDateString();
  document.getElementById('tz').textContent = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local';
}
tickClock();
setInterval(tickClock, 1000);

/* ---------- Oscilloscope + signal meter ---------- */
const canvas = document.getElementById('scopeCanvas');
const ctx = canvas.getContext('2d');
const HISTORY_LEN = 60;
let history = []; // latency samples in ms, null = dropped
let pingsSent = 0;
let dropped = 0;

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * devicePixelRatio;
  canvas.height = rect.height * devicePixelRatio;
}
window.addEventListener('resize', resizeCanvas);

function classifyLatency(ms) {
  if (ms == null) return 'bad';
  if (ms < 80) return 'good';
  if (ms < 200) return 'warn';
  return 'bad';
}

function drawScope() {
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  // grid
  ctx.strokeStyle = 'rgba(31, 44, 69, 0.6)';
  ctx.lineWidth = 1;
  const cols = 12, rows = 4;
  for (let i = 1; i < cols; i++) {
    const x = (w / cols) * i;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let i = 1; i < rows; i++) {
    const y = (h / rows) * i;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  if (history.length < 2) return;

  const maxVal = Math.max(250, ...history.filter(v => v != null));
  const stepX = w / (HISTORY_LEN - 1);
  const offset = HISTORY_LEN - history.length;

  // glow trace
  ctx.beginPath();
  ctx.lineWidth = 2.2 * devicePixelRatio;
  ctx.strokeStyle = '#f2a65a';
  ctx.shadowColor = '#f2a65a';
  ctx.shadowBlur = 8;
  ctx.lineJoin = 'round';

  let started = false;
  history.forEach((val, i) => {
    const x = (offset + i) * stepX;
    if (val == null) { started = false; return; }
    const y = h - (val / maxVal) * (h * 0.85) - h * 0.05;
    if (!started) { ctx.moveTo(x, y); started = true; }
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.shadowBlur = 0;

  // dots for dropped pings
  history.forEach((val, i) => {
    if (val != null) return;
    const x = (offset + i) * stepX;
    ctx.beginPath();
    ctx.fillStyle = '#eb5757';
    ctx.arc(x, h - 10, 3 * devicePixelRatio, 0, Math.PI * 2);
    ctx.fill();
  });
}

function updateSignalBars(ms) {
  const bars = document.querySelectorAll('.signal-bars .bar');
  let lit = 0;
  if (ms == null) lit = 0;
  else if (ms < 40) lit = 5;
  else if (ms < 80) lit = 4;
  else if (ms < 150) lit = 3;
  else if (ms < 300) lit = 2;
  else lit = 1;

  const cls = classifyLatency(ms);
  bars.forEach((bar, idx) => {
    bar.classList.remove('lit', 'warn', 'bad');
    if (idx < lit) {
      bar.classList.add('lit');
      if (cls === 'warn') bar.classList.add('warn');
      if (cls === 'bad') bar.classList.add('bad');
    }
  });
}

function updateConnBadge(ms, isDrop) {
  const badge = document.getElementById('connState');
  const dot = document.getElementById('statusDot');
  badge.classList.remove('warn', 'bad');
  dot.classList.remove('warn', 'bad');
  if (isDrop) {
    badge.textContent = 'UNSTABLE';
    badge.classList.add('bad');
    dot.classList.add('bad');
    return;
  }
  const cls = classifyLatency(ms);
  if (cls === 'good') { badge.textContent = 'STABLE'; }
  else if (cls === 'warn') { badge.textContent = 'SLOW'; badge.classList.add('warn'); dot.classList.add('warn'); }
  else { badge.textContent = 'DEGRADED'; badge.classList.add('bad'); dot.classList.add('bad'); }
}

async function pingOnce() {
  pingsSent++;
  document.getElementById('pingCount').textContent = pingsSent;
  const start = performance.now();
  let ms = null;
  try {
    const res = await fetch('/api/ping', { cache: 'no-store' });
    if (!res.ok) throw new Error('bad status');
    await res.json();
    ms = performance.now() - start;
  } catch (e) {
    ms = null;
    dropped++;
    document.getElementById('dropCount').textContent = dropped;
  }

  history.push(ms);
  if (history.length > HISTORY_LEN) history.shift();

  const samples = history.filter(v => v != null);
  if (samples.length) {
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    const mean = avg;
    const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length;
    const jitter = Math.sqrt(variance);
    document.getElementById('latencyAvg').textContent = avg.toFixed(0) + ' ms';
    document.getElementById('jitter').textContent = '±' + jitter.toFixed(0) + ' ms';
  }

  document.getElementById('latencyNow').innerHTML = ms == null
    ? 'timeout'
    : ms.toFixed(0) + ' <small>ms</small>';

  updateSignalBars(ms);
  updateConnBadge(ms, ms == null);
  drawScope();
}

resizeCanvas();
pingOnce();
setInterval(pingOnce, 2000);

/* ---------- Page load timing (Navigation Timing API) ---------- */
function renderLoadBars() {
  const container = document.getElementById('loadBars');
  let entries;
  try {
    const nav = performance.getEntriesByType('navigation')[0];
    if (nav) {
      entries = [
        ['DNS lookup', nav.domainLookupEnd - nav.domainLookupStart],
        ['TCP connect', nav.connectEnd - nav.connectStart],
        ['Time to first byte', nav.responseStart - nav.requestStart],
        ['Response download', nav.responseEnd - nav.responseStart],
        ['DOM processing', nav.domComplete - nav.responseEnd],
        ['Total load', nav.loadEventEnd - nav.startTime || nav.duration],
      ];
    }
  } catch (e) { entries = null; }

  if (!entries) {
    const t = performance.timing;
    entries = [
      ['DNS lookup', t.domainLookupEnd - t.domainLookupStart],
      ['TCP connect', t.connectEnd - t.connectStart],
      ['Time to first byte', t.responseStart - t.requestStart],
      ['Response download', t.responseEnd - t.responseStart],
      ['DOM processing', t.domComplete - t.responseEnd],
      ['Total load', t.loadEventEnd - t.navigationStart],
    ];
  }

  const maxMs = Math.max(50, ...entries.map(e => Math.max(0, e[1])));
  container.innerHTML = '';
  entries.forEach(([label, ms]) => {
    const val = Math.max(0, Math.round(ms || 0));
    const pct = Math.min(100, (val / maxMs) * 100);
    const row = document.createElement('div');
    row.className = 'load-item';
    row.innerHTML = `
      <span class="lbl">${label}</span>
      <span class="track"><span class="fill" style="width:${pct}%"></span></span>
      <span class="val">${val} ms</span>
    `;
    container.appendChild(row);
  });
}

window.addEventListener('load', () => setTimeout(renderLoadBars, 150));

/* ---------- Deployment info ---------- */
async function loadInfo() {
  try {
    const res = await fetch('/api/info', { cache: 'no-store' });
    const data = await res.json();
    document.getElementById('infoHostname').textContent = data.hostname;
    document.getElementById('infoBoot').textContent = data.boot_id;
    document.getElementById('infoUptime').textContent = formatUptime(data.uptime_seconds);
    document.getElementById('infoPython').textContent = data.python_version;
    document.getElementById('infoPlatform').textContent = data.platform;
    document.getElementById('infoPort').textContent = data.env.PORT;
    document.getElementById('hostBadge').textContent = data.hostname;
  } catch (e) {
    document.getElementById('hostBadge').textContent = 'unreachable';
  }
}

function formatUptime(sec) {
  if (sec < 60) return sec.toFixed(0) + 's';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

loadInfo();
setInterval(loadInfo, 15000);

/* ---------- Request counter ---------- */
async function loadStats() {
  try {
    const res = await fetch('/api/stats', { cache: 'no-store' });
    const data = await res.json();
    document.getElementById('reqCounter').textContent = data.requests_served;
  } catch (e) { /* ignore */ }
}
loadStats();
setInterval(loadStats, 5000);
