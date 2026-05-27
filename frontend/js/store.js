const API = '/api';

const ZONES = [];
const SPOTS = [];
const SPOT_PRICES = { Standard:3, Compact:2, Disabled:2, 'EV Charging':5, Reserved:6 };

const cache = {
  users: [],
  bookings: [],
  history: [],
  current: null,
  adminStats: null,
  loaded: false,
};

let simCallbacks = [];
let simTimer = null;

function getToken() { return localStorage.getItem('up_token') || ''; }
function setToken(t) { if (t) localStorage.setItem('up_token', t); }
function clearToken() {
  localStorage.removeItem('up_token');
  localStorage.removeItem('up_current');
}

// sync XHR keeps things simple, no async chains needed
function request(method, path, body) {
  const xhr = new XMLHttpRequest();
  xhr.open(method, API + path, false);
  xhr.setRequestHeader('Content-Type', 'application/json');
  if (getToken()) xhr.setRequestHeader('Authorization', 'Bearer ' + getToken());
  try {
    xhr.send(body === undefined ? null : JSON.stringify(body));
  } catch (err) {
    return { ok:false, error:'Backend is not reachable. Start the Python server and reload.' };
  }
  let data = null;
  try { data = JSON.parse(xhr.responseText || '{}'); }
  catch { data = { ok:false, error:'Invalid backend response.' }; }
  if (xhr.status >= 400 && data.ok !== false) data = { ok:false, error:'Request failed.' };
  return data;
}

function bootstrap() {
  const r = request('GET', '/bootstrap');
  if (!r.ok) {
    console.error('bootstrap failed:', r.error);
    return;
  }
  ZONES.splice(0, ZONES.length, ...(r.zones || []));
  SPOTS.splice(0, SPOTS.length, ...(r.spots || []));
}

function refreshAuthUser() {
  // TODO: handle token expiry/refresh properly
  if (!getToken()) { cache.current = null; return null; }
  const r = request('GET', '/me');
  if (!r.ok) { clearToken(); cache.current = null; return null; }
  cache.current = r.user;
  localStorage.setItem('up_current', JSON.stringify(r.user));
  return cache.current;
}

function refreshData() {
  bootstrap();
  if (!cache.current) refreshAuthUser();
  if (!cache.current) return;

  const b = request('GET', '/bookings');
  if (b.ok) cache.bookings = b.bookings || [];

  const h = request('GET', '/history');
  if (h.ok) cache.history = h.history || [];

  if (cache.current.role === 'admin') {
    const u = request('GET', '/users');
    if (u.ok) cache.users = u.users || [];
    const s = request('GET', '/admin-stats');
    if (s.ok) cache.adminStats = s.stats;
  }
  cache.loaded = true;
}

bootstrap();
try {
  cache.current = JSON.parse(localStorage.getItem('up_current')) || null;
} catch { cache.current = null; }

function daysAgo(n) { const d = new Date(); d.setDate(d.getDate()-n); return d.toISOString(); }
function randId() { return Math.random().toString(36).slice(2,8).toUpperCase(); }

function getUsers() { return cache.users || []; }
function saveUsers(_) {}

function getCurrentUser() {
  if (cache.current) return cache.current;
  return refreshAuthUser();
}

function login(email, password) {
  const r = request('POST', '/login', { email, password });
  if (!r.ok) return { ok:false, error:r.error || 'Invalid email or password.' };
  setToken(r.token);
  cache.current = r.user;
  localStorage.setItem('up_current', JSON.stringify(r.user));
  refreshData();
  return { ok:true, user:r.user };
}

function register({ name, email, password, plate, role, subscription }) {
  const r = request('POST', '/register', { name, email, password, plate, role, subscription });
  if (!r.ok) return { ok:false, error:r.error || 'Registration failed.' };
  setToken(r.token);
  cache.current = r.user;
  localStorage.setItem('up_current', JSON.stringify(r.user));
  refreshData();
  return { ok:true, user:r.user };
}

function logout() {
  request('POST', '/logout');
  clearToken();
  cache.current = null;
  cache.bookings = [];
  cache.users = [];
}

function requireAuth() {
  const u = getCurrentUser();
  if (!u) { window.location.href = 'index.html'; return null; }
  if (u.role === 'admin') { window.location.href = 'admin.html'; return null; }
  refreshData();
  return cache.current;
}

function requireAdmin() {
  const u = getCurrentUser();
  if (!u) { window.location.href = 'index.html'; return null; }
  if (u.role !== 'admin') { window.location.href = 'dashboard.html'; return null; }
  refreshData();
  return cache.current;
}

function getBookings() { return cache.bookings || []; }
function saveBookings(b) { cache.bookings = b || []; }

function myBookings(email) { return getBookings().filter(b => b.userEmail === email); }

function addBooking(b) {
  const r = request('POST', '/bookings', b);
  if (!r.ok) return { ok:false, error:r.error || 'Booking failed.' };
  refreshData();
  return { ok:true, booking:r.booking };
}

function cancelBooking(id) {
  const r = request('DELETE', '/bookings/' + encodeURIComponent(id));
  if (!r.ok) return { ok:false, error:r.error || 'Cancellation failed.' };
  refreshData();
  return { ok:true };
}

function expireBookings() {
  const r = request('POST', '/bookings/expire');
  if (r.ok) refreshData();
}

function getClosedSpots() { return SPOTS.filter(s => s.closed).map(s => s.id); }
function isSpotClosed(id) { return !!SPOTS.find(s => s.id === id && s.closed); }

function toggleSpotClosed(id) {
  const r = request('PATCH', '/spots/' + encodeURIComponent(id) + '/toggle-closed');
  if (!r.ok) { toast('⚠️ ' + (r.error || 'Could not update spot.')); return { ok:false, error:r.error }; }
  bootstrap();
  refreshData();
  return { ok:true };
}

// returns 'closed' | 'mine' | 'occupied' | 'available'
function spotStatus(spotId, userEmail) {
  if (isSpotClosed(spotId)) return 'closed';
  const now = new Date().toISOString();
  const active = getBookings().filter(b => !b.expired && !b.cancelled && b.end > now);
  if (active.find(b => b.spotId === spotId && b.userEmail === userEmail)) return 'mine';
  if (active.find(b => b.spotId === spotId)) return 'occupied';
  return 'available';
}

function getSpot(id) { return SPOTS.find(s => s.id === id); }
function zoneSpots(zoneId) { return SPOTS.filter(s => s.zone === zoneId); }

function onSimUpdate(fn) { simCallbacks.push(fn); }

function startSimulation() {
  if (simTimer) return;
  simTimer = setInterval(() => {
    const r = request('POST', '/simulation/tick');
    if (r.ok) {
      cache.bookings = r.bookings || cache.bookings;
      bootstrap();
      simCallbacks.forEach(fn => fn());
    }
  }, 8000);
}

function getZoneStats(userEmail) {
  const now = new Date().toISOString();
  const active = getBookings().filter(b => !b.expired && !b.cancelled && b.end > now);
  return ZONES.map(z => {
    const spots = zoneSpots(z.id);
    const occupiedCount = spots.filter(s => active.find(b => b.spotId === s.id)).length;
    const closedCount = spots.filter(s => isSpotClosed(s.id)).length;
    const mineCount = spots.filter(s => active.find(b => b.spotId === s.id && b.userEmail === userEmail)).length;
    const available = spots.length - occupiedCount - closedCount;
    const pct = spots.length ? Math.round((occupiedCount / spots.length) * 100) : 0;
    return { ...z, spots:spots.length, available, occupied:occupiedCount, closed:closedCount, mine:mineCount, pct };
  });
}

function getAdminStats() {
  if (cache.adminStats) return cache.adminStats;
  const bookings = getBookings().filter(b => b.userId !== 'sim' && !b.cancelled);
  const users = getUsers().filter(u => u.role !== 'admin');
  const revenue = bookings.reduce((a,b) => a + Number(b.total || 0), 0);
  const now = new Date().toISOString();
  const activeNow = getBookings().filter(b => !b.expired && !b.cancelled && b.end > now).length;
  return { totalBookings:bookings.length, totalUsers:users.length, revenue, activeNow, totalSpots:SPOTS.length };
}

function getHistory() { return cache.history || []; }

// getUTCHours() because the seed stores timestamps in UTC
function getPeakHours() {
  const history = getHistory();
  const byHour = Array(24).fill(0).map(() => ({ sum:0, count:0 }));
  history.forEach(h => {
    const hour = new Date(h.ts).getUTCHours();
    byHour[hour].sum += h.occupied / h.capacity;
    byHour[hour].count++;
  });
  return byHour.map((b,i) => ({ hour:i, avg:b.count > 0 ? b.sum / b.count : 0 }));
}

function getOccupancyTrend(days=14) {
  const history = getHistory();
  const now = Date.now();
  const result = [];
  for (let d = days-1; d >= 0; d--) {
    const day = new Date(now - d*86400000);
    const dayStr = day.toLocaleDateString('en-AU', { month:'short', day:'numeric' });
    const dayUTC = day.toISOString().slice(0,10);
    const records = history.filter(h => h.ts.slice(0,10) === dayUTC);
    const avgOcc = records.length > 0
      ? records.reduce((a,h) => a + h.occupied / h.capacity, 0) / records.length
      : 0;
    result.push({ day:dayStr, avgOcc });
  }
  return result;
}

function getDailyRevenue(days=14) {
  const bookings = getBookings().filter(b => b.userId !== 'sim' && !b.cancelled);
  const now = Date.now();
  const result = [];
  for (let d = days-1; d >= 0; d--) {
    const day = new Date(now - d*86400000);
    const dayStr = day.toLocaleDateString('en-AU', { month:'short', day:'numeric' });
    const dayUTC = day.toISOString().slice(0,10);
    const dayBookings = bookings.filter(b => (b.createdAt || b.start || '').slice(0,10) === dayUTC);
    result.push({
      day: dayStr,
      revenue: dayBookings.reduce((s,b) => s + Number(b.total||0), 0),
      count: dayBookings.length,
    });
  }
  return result;
}

function getZoneUtilisation() {
  const history = getHistory();
  return ZONES.map(z => {
    const records = history.filter(h => h.zone === z.id);
    const avg = records.length > 0
      ? records.reduce((a,h) => a + h.occupied / h.capacity, 0) / records.length
      : 0;
    return { ...z, utilPct:Math.round(avg * 100) };
  });
}

function predictAvailability(zoneId) {
  const peak = getPeakHours();
  const now = new Date();
  const zone = ZONES.find(z => z.id === zoneId);
  const capacity = zone?.spots || 20;

  // 'A'->0, 'B'->1 etc, gives each zone a different jitter without randomness
  const zoneSeed = zoneId.charCodeAt(0) - 65;

  const result = [];
  for (let offset = 1; offset <= 6; offset++) {
    const h = (now.getHours() + offset) % 24;
    const baseAvg = peak[h].avg;
    const nudge = (Math.sin(zoneSeed * 7 + offset * 3.7) * 0.08)
                + (Math.cos(zoneSeed * 3 + h * 1.3) * 0.04);
    const probAvail = Math.max(0.05, Math.min(0.95, 1 - baseAvg + nudge));
    const freeSpots = Math.round(probAvail * capacity);
    result.push({
      hour: h,
      label: h === 0 ? '12am' : h < 12 ? h + 'am' : h === 12 ? '12pm' : (h - 12) + 'pm',
      probability: Math.round(probAvail * 100),
      estimatedFree: freeSpots,
    });
  }
  return result;
}

function getRecommendations(userEmail) {
  return getZoneStats(userEmail)
    .filter(z => z.available > 0)
    .sort((a,b) => b.available - a.available)
    .map((z,i) => ({ ...z, rank:i+1, reason:i===0?'Best current availability':'Good availability' }))
    .slice(0, 3);
}

function fmtDate(str) { return new Date(str).toLocaleString('en-AU', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }); }
function fmtTime(str) { return new Date(str).toLocaleTimeString('en-AU', { hour:'2-digit', minute:'2-digit' }); }

function toLocalInput(d) {
  return d.getFullYear()
    + '-' + String(d.getMonth()+1).padStart(2,'0')
    + '-' + String(d.getDate()).padStart(2,'0')
    + 'T' + String(d.getHours()).padStart(2,'0')
    + ':' + String(d.getMinutes()).padStart(2,'0');
}

function initials(name) { return String(name || '').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase(); }

function toast(msg, duration=3000) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), duration);
}

const UniPark = {
  ZONES, SPOTS, SPOT_PRICES,
  getUsers, saveUsers, getCurrentUser, login, register, logout, requireAuth, requireAdmin,
  getBookings, myBookings, addBooking, cancelBooking, expireBookings,
  getClosedSpots, isSpotClosed, toggleSpotClosed,
  spotStatus, getSpot, zoneSpots,
  getZoneStats, getAdminStats, getHistory, getPeakHours, getOccupancyTrend, getDailyRevenue, getZoneUtilisation,
  predictAvailability, getRecommendations,
  startSimulation, onSimUpdate,
  randId, daysAgo, fmtDate, fmtTime, toLocalInput, initials, toast,
};
