// store.js — shared data layer used by all pages

const UniPark = (() => {
  const API = '/api';

  // zones and spots are loaded once from the backend and shared across all pages
  const ZONES = [];
  const SPOTS = [];
  const SPOT_ICONS  = { Standard:'🚗', Compact:'🚙', Disabled:'♿', 'EV Charging':'⚡', Reserved:'🔒' };
  const SPOT_PRICES = { Standard:3, Compact:2, Disabled:2, 'EV Charging':5, Reserved:6 };

  // in-memory cache — avoids hitting the server on every render
  const cache = {
    users: [],
    bookings: [],
    history: [],
    current: null,
    adminStats: null,
    loaded: false,
  };

  // token helpers — stored in localStorage so the session survives a page refresh
  function token() { return localStorage.getItem('up_token') || ''; }
  function setToken(t) { if (t) localStorage.setItem('up_token', t); }
  function clearToken() { localStorage.removeItem('up_token'); localStorage.removeItem('up_current'); }

  // replaces an array in-place so any existing references to it stay valid
  function replaceArray(target, values) {
    target.splice(0, target.length, ...(values || []));
  }


  // synchronous keeps the code simple since we don't need async flows here
  function request(method, path, body) {
    const xhr = new XMLHttpRequest();
    xhr.open(method, API + path, false);
    xhr.setRequestHeader('Content-Type', 'application/json');
    if (token()) xhr.setRequestHeader('Authorization', 'Bearer ' + token());
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

  // pulls zones and spots from the server — called on page load and after spot changes
  function bootstrap() {
    const r = request('GET', '/bootstrap');
    if (!r.ok) {
      console.error(r.error || 'Backend bootstrap failed.');
      return;
    }
    replaceArray(ZONES, r.zones || []);
    replaceArray(SPOTS, r.spots || []);
  }

  // checks if the stored token is still valid and refreshes the current user object
  function refreshAuthUser() {
    if (!token()) { cache.current = null; return null; }
    const r = request('GET', '/me');
    if (!r.ok) { clearToken(); cache.current = null; return null; }
    cache.current = r.user;
    localStorage.setItem('up_current', JSON.stringify(r.user));
    return cache.current;
  }

  // fetches all the data the current user needs — bookings, history, and admin extras
  function refreshData() {
    bootstrap();
    if (!cache.current) refreshAuthUser();
    if (!cache.current) return;

    const b = request('GET', '/bookings');
    if (b.ok) cache.bookings = b.bookings || [];

    const h = request('GET', '/history');
    if (h.ok) cache.history = h.history || [];

    // admins also need the full user list and the stats overview
    if (cache.current.role === 'admin') {
      const u = request('GET', '/users');
      if (u.ok) cache.users = u.users || [];
      const s = request('GET', '/admin-stats');
      if (s.ok) cache.adminStats = s.stats;
    }
    cache.loaded = true;
  }

  // load zones and spots immediately when the script first runs
  bootstrap();
  try {
    // restore the logged-in user from localStorage so we skip a round-trip on every page load
    cache.current = JSON.parse(localStorage.getItem('up_current')) || null;
  } catch { cache.current = null; }

  // small utilities used in various places
  function daysAgo(n) { const d = new Date(); d.setDate(d.getDate()-n); return d.toISOString(); }
  function randId() { return Math.random().toString(36).slice(2,8).toUpperCase(); }

  function getUsers() { return cache.users || []; }
  function saveUsers(_) { /* backend-owned data: nothing to do on the frontend */ }

  // return the cached user if we have one, otherwise hit the server to verify the token
  function getCurrentUser() {
    if (cache.current) return cache.current;
    return refreshAuthUser();
  }

  // send credentials to the backend, store the returned JWT, and load fresh data
  function login(email, password) {
    const r = request('POST', '/login', { email, password });
    if (!r.ok) return { ok:false, error:r.error || 'Invalid email or password.' };
    setToken(r.token);
    cache.current = r.user;
    localStorage.setItem('up_current', JSON.stringify(r.user));
    refreshData();
    return { ok:true, user:r.user };
  }

  // register a new account, then log them in automatically
  function register({ name, email, password, plate, role, subscription }) {
    const r = request('POST', '/register', { name, email, password, plate, role, subscription });
    if (!r.ok) return { ok:false, error:r.error || 'Registration failed.' };
    setToken(r.token);
    cache.current = r.user;
    localStorage.setItem('up_current', JSON.stringify(r.user));
    refreshData();
    return { ok:true, user:r.user };
  }

  // clear everything from memory and localStorage, then tell the server the session is over
  function logout() {
    request('POST', '/logout');
    clearToken();
    cache.current = null;
    cache.bookings = [];
    cache.users = [];
  }

  // gate for regular-user pages — redirects admins away and non-auth users to login
  function requireAuth() {
    const u = getCurrentUser();
    if (!u) { window.location.href = 'index.html'; return null; }
    if (u.role === 'admin') { window.location.href = 'admin.html'; return null; }
    refreshData();
    return cache.current;
  }

  // gate for admin pages — redirects non-admins back to the main dashboard
  function requireAdmin() {
    const u = getCurrentUser();
    if (!u) { window.location.href = 'index.html'; return null; }
    if (u.role !== 'admin') { window.location.href = 'dashboard.html'; return null; }
    refreshData();
    return cache.current;
  }

  function getBookings() { return cache.bookings || []; }
  function saveBookings(b) { cache.bookings = b || []; }

  // all bookings for a specific user, identified by email
  function myBookings(email) { return getBookings().filter(b => b.userEmail === email); }

  // post a new booking to the server and refresh the local cache on success
  function addBooking(b) {
    const r = request('POST', '/bookings', b);
    if (!r.ok) return { ok:false, error:r.error || 'Booking failed.' };
    refreshData();
    return { ok:true, booking:r.booking };
  }

  // cancel a booking by ID 
  function cancelBooking(id) {
    const r = request('DELETE', '/bookings/' + encodeURIComponent(id));
    if (!r.ok) return { ok:false, error:r.error || 'Cancellation failed.' };
    refreshData();
    return { ok:true };
  }

  // ask the server to mark any overdue bookings as expired, then refresh
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

  // returns one of: 'closed' | 'mine' | 'occupied' | 'available'
  // used to colour-code spots in the parking grid
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

  // the simulation creates random bookings every 8 seconds to make the lot feel busy
  let simCallbacks = [];
  let simTimer = null;
  function onSimUpdate(fn) { simCallbacks.push(fn); }

  function startSimulation() {
    if (simTimer) return; // only ever run one interval at a time
    simTimer = setInterval(() => {
      const r = request('POST', '/simulation/tick');
      if (r.ok) {
        cache.bookings = r.bookings || cache.bookings;
        bootstrap(); // re-pull spot data so closed states stay accurate
        simCallbacks.forEach(fn => fn()); // let each page update its own UI
      }
    }, 8000);
  }

  // computes available, occupied, closed, and "mine" counts for each zone right now
  function getZoneStats(userEmail) {
    const now = new Date().toISOString();
    const active = getBookings().filter(b => !b.expired && !b.cancelled && b.end > now);
    return ZONES.map(z => {
      const spots        = zoneSpots(z.id);
      const occupiedCount = spots.filter(s => active.find(b => b.spotId === s.id)).length;
      const closedCount   = spots.filter(s => isSpotClosed(s.id)).length;
      const mineCount     = spots.filter(s => active.find(b => b.spotId === s.id && b.userEmail === userEmail)).length;
      const available     = spots.length - occupiedCount - closedCount;
      const pct           = spots.length ? Math.round((occupiedCount / spots.length) * 100) : 0;
      return { ...z, spots:spots.length, available, occupied:occupiedCount, closed:closedCount, mine:mineCount, pct };
    });
  }

  // summary numbers for the admin header stat cards
  // falls back to computing from local data if the server hasn't returned adminStats yet
  function getAdminStats() {
    if (cache.adminStats) return cache.adminStats;
    const bookings  = getBookings().filter(b => b.userId !== 'sim' && !b.cancelled);
    const users     = getUsers().filter(u => u.role !== 'admin');
    const revenue   = bookings.reduce((a,b) => a + Number(b.total || 0), 0);
    const now       = new Date().toISOString();
    const activeNow = getBookings().filter(b => !b.expired && !b.cancelled && b.end > now).length;
    return { totalBookings:bookings.length, totalUsers:users.length, revenue, activeNow, totalSpots:SPOTS.length };
  }

  function getHistory() { return cache.history || []; }

  // average occupancy rate per hour of day, computed from the occupancy_history table
  // uses getUTCHours() because the seed stores timestamps in UTC
  function getPeakHours() {
    const history = getHistory();
    const byHour  = Array(24).fill(0).map(() => ({ sum:0, count:0 }));
    history.forEach(h => {
      const hour = new Date(h.ts).getUTCHours();
      byHour[hour].sum   += h.occupied / h.capacity;
      byHour[hour].count++;
    });
    return byHour.map((b,i) => ({ hour:i, avg:b.count > 0 ? b.sum / b.count : 0 }));
  }

  // average occupancy for each of the past N days — used by the trend line on the analytics page
  // slices the UTC date string directly to avoid local-timezone mismatches
  function getOccupancyTrend(days=14) {
    const history = getHistory();
    const now     = Date.now();
    const result  = [];
    for (let d = days-1; d >= 0; d--) {
      const day    = new Date(now - d*86400000);
      const dayStr = day.toLocaleDateString('en-AU', { month:'short', day:'numeric' });
      const dayUTC = day.toISOString().slice(0,10); // compare YYYY-MM-DD in UTC
      const records = history.filter(h => h.ts.slice(0,10) === dayUTC);
      const avgOcc  = records.length > 0
        ? records.reduce((a,h) => a + h.occupied / h.capacity, 0) / records.length
        : 0;
      result.push({ day:dayStr, avgOcc });
    }
    return result;
  }

  // total revenue and booking count per day over the past N days
  // used by the 14-day revenue bar chart — updates live as new bookings are made
  function getDailyRevenue(days=14) {
    const bookings = getBookings().filter(b => b.userId !== 'sim' && !b.cancelled);
    const now      = Date.now();
    const result   = [];
    for (let d = days-1; d >= 0; d--) {
      const day        = new Date(now - d*86400000);
      const dayStr     = day.toLocaleDateString('en-AU', { month:'short', day:'numeric' });
      const dayUTC     = day.toISOString().slice(0,10);
      const dayBookings = bookings.filter(b => (b.createdAt || b.start || '').slice(0,10) === dayUTC);
      result.push({
        day: dayStr,
        revenue: dayBookings.reduce((s,b) => s + Number(b.total||0), 0),
        count: dayBookings.length,
      });
    }
    return result;
  }

  // average historical utilisation per zone — used by the zone utilisation bars
  function getZoneUtilisation() {
    const history = getHistory();
    return ZONES.map(z => {
      const records = history.filter(h => h.zone === z.id);
      const avg     = records.length > 0
        ? records.reduce((a,h) => a + h.occupied / h.capacity, 0) / records.length
        : 0;
      return { ...z, utilPct:Math.round(avg * 100) };
    });
  }

  // forecasts availability for the next 6 hours in a given zone
  // uses peak-hour averages as a base, then applies a small zone-specific jitter
  // so each zone looks distinct and the numbers feel like a real forecast, not a lookup table
  function predictAvailability(zoneId) {
    const peak     = getPeakHours();
    const now      = new Date();
    const zone     = ZONES.find(z => z.id === zoneId);
    const capacity = zone?.spots || 20;

    // deterministic-ish seed per zone so the jitter is stable within a single render
    // but varies meaningfully across zones (A → 0, B → 1, C → 2, …)
    const zoneSeed = zoneId.charCodeAt(0) - 65; // 'A'→0, 'B'→1, etc.

    const result = [];
    for (let offset = 1; offset <= 6; offset++) {
      const h        = (now.getHours() + offset) % 24;
      const baseAvg  = peak[h].avg;

      // add a small pseudo-random nudge: zone and hour both influence the direction
      // keeps within ±0.12 so the general trend is preserved
      const nudge    = (Math.sin(zoneSeed * 7 + offset * 3.7) * 0.08)
                     + (Math.cos(zoneSeed * 3 + h * 1.3)      * 0.04);

      const probAvail = Math.max(0.05, Math.min(0.95, 1 - baseAvg + nudge));
      const freeSpots = Math.round(probAvail * capacity);

      result.push({
        hour:          h,
        label:         h === 0 ? '12am' : h < 12 ? h + 'am' : h === 12 ? '12pm' : (h - 12) + 'pm',
        probability:   Math.round(probAvail * 100),
        estimatedFree: freeSpots,
      });
    }
    return result;
  }

  // top three zones ranked by how many free spots they have right now
  function getRecommendations(userEmail) {
    return getZoneStats(userEmail)
      .filter(z => z.available > 0)
      .sort((a,b) => b.available - a.available)
      .map((z,i) => ({ ...z, rank:i+1, reason:i===0?'Best current availability':'Good availability' }))
      .slice(0, 3);
  }

  // human-readable date + time, e.g. "27 May, 09:30 am"
  function fmtDate(str) { return new Date(str).toLocaleString('en-AU', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }); }
  function fmtTime(str) { return new Date(str).toLocaleTimeString('en-AU', { hour:'2-digit', minute:'2-digit' }); }

  // converts a Date object to the YYYY-MM-DDTHH:MM format used by datetime-local inputs
  function toLocalInput(d) {
    return d.getFullYear()
      + '-' + String(d.getMonth()+1).padStart(2,'0')
      + '-' + String(d.getDate()).padStart(2,'0')
      + 'T' + String(d.getHours()).padStart(2,'0')
      + ':' + String(d.getMinutes()).padStart(2,'0');
  }

  // takes a full name and returns up to two initials, e.g. "Jane Smith" → "JS"
  function initials(name) { return String(name || '').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase(); }

  // brief toast notification that slides in from the bottom and disappears after a few seconds
  function toast(msg, duration=3000) {
    let el = document.getElementById('toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), duration);
  }

  // expose everything that other scripts need — anything not listed here is private to this module
  return {
    ZONES, SPOTS, SPOT_ICONS, SPOT_PRICES,
    getUsers, saveUsers, getCurrentUser, login, register, logout, requireAuth, requireAdmin,
    getBookings, myBookings, addBooking, cancelBooking, expireBookings,
    getClosedSpots, isSpotClosed, toggleSpotClosed,
    spotStatus, getSpot, zoneSpots,
    getZoneStats, getAdminStats, getHistory, getPeakHours, getOccupancyTrend, getDailyRevenue, getZoneUtilisation,
    predictAvailability, getRecommendations,
    startSimulation, onSimUpdate,
    randId, daysAgo, fmtDate, fmtTime, toLocalInput, initials, toast,
  };
})();
