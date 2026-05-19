// ─── UNIPARK · DATA STORE ─────────────────────────────────────────────────────
// All app data lives in this file.
// Uses localStorage to persist data between page loads.
// Everything is wrapped in an IIFE so nothing leaks into the global scope.
const UniPark = (() => {

  // ── ZONE DEFINITION ──────────────────────────────────────────────────────
  // Only one parking zone. Change the name, capacity, and walk time here.
  const ZONES = [
    { id:'A', name:'Zone A – Science', capacity:20, walk:'2 min', desc:'Near Science & Engineering buildings' },
  ];

  // Each spot type has an icon and an hourly price.
  const SPOT_ICONS  = { Standard:'🚗', Compact:'🚙', Disabled:'♿', 'EV Charging':'⚡', Reserved:'🔒' };
  const SPOT_PRICES = { Standard:3, Compact:2, Disabled:2, 'EV Charging':5, Reserved:6 };

  // Build the full list of spots from the zone above.
  // Spot IDs are zone letter + number, e.g. "A1", "A2" …
  function buildSpots() {
    const spots = [];
    ZONES.forEach(z => {
      for (let i = 1; i <= z.capacity; i++) {
        // Assign special types at fixed intervals so the layout looks realistic
        let type = 'Standard';
        if      (i % 10 === 0) type = 'EV Charging';
        else if (i % 7  === 0) type = 'Disabled';
        else if (i % 5  === 0) type = 'Compact';
        else if (i % 13 === 0) type = 'Reserved';
        spots.push({ id: z.id+i, zone: z.id, type, price: SPOT_PRICES[type], icon: SPOT_ICONS[type] });
      }
    });
    return spots;
  }

  const SPOTS = buildSpots();

  // ── LOCAL STORAGE HELPERS ─────────────────────────────────────────────────
  // Thin wrappers so we don't repeat JSON.parse / JSON.stringify everywhere.
  const store = {
    get: (k)    => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
    del: (k)    => localStorage.removeItem(k),
  };

  // ── SEED DATA ─────────────────────────────────────────────────────────────
  // Populates the app with demo users, bookings, and history on first load.
  // Won't run again unless you clear localStorage.
  function seedIfNeeded() {
    if (store.get('up_seeded')) return;

    // Some fake names to use when generating random users
    const names = [
      'Alex Johnson','Jordan Lee','Sam Taylor','Casey Morgan','Riley Chen',
      'Drew Parker','Quinn Davis','Avery Wilson','Blake Foster','Cameron Hall',
      'Dakota Smith','Ellis Brown','Finley Jones','Gray Thompson','Harper White',
      'Indigo Clark','Jamie Lewis','Kendall Walker','Logan Allen','Morgan Scott',
    ];
    const roles  = ['student','student','student','student','staff','staff','visitor'];
    const subs   = ['basic','premium'];
    const plates = () => ['ABC','DEF','GHI','JKL','MNO'][Math.floor(Math.random()*5)]
                       + ' ' + (100 + Math.floor(Math.random()*900));

    // The two accounts you can always log in with
    const users = [
      { id:'u0', email:'demo@unipark.edu.au', password:'password', name:'Alex Johnson',
        role:'student', plate:'XYZ 999', subscription:'premium', joinedAt:daysAgo(90) },
      { id:'ua', email:'admin@unipark.edu.au', password:'admin123', name:'Admin User',
        role:'admin',   plate:'',        subscription:'staff',   joinedAt:daysAgo(365) },
    ];

    // 50 extra random users to populate admin stats
    for (let i = 1; i <= 50; i++) {
      const role = roles[Math.floor(Math.random()*roles.length)];
      users.push({
        id: 'u'+i,
        email: `user${i}@unipark.edu.au`,
        password: 'password',
        name: names[i % names.length] + (i > names.length ? ' '+i : ''),
        role,
        plate: plates(),
        subscription: role==='staff' ? 'staff' : subs[Math.floor(Math.random()*2)],
        joinedAt: daysAgo(Math.floor(Math.random()*180)),
      });
    }
    store.set('up_users', users);

    // 80 historical bookings spread over the past 60 days
    const bookings = [];
    const allUsers = users.filter(u => u.role !== 'admin');
    const now = Date.now();
    for (let i = 0; i < 80; i++) {
      const u    = allUsers[Math.floor(Math.random()*allUsers.length)];
      const spot = SPOTS[Math.floor(Math.random()*SPOTS.length)];
      const daysBack = Math.floor(Math.random()*60);
      const hour     = 7 + Math.floor(Math.random()*12);
      const start    = new Date(now - daysBack*86400000);
      start.setHours(hour, 0, 0, 0);
      const dur = 1 + Math.floor(Math.random()*5);
      const end = new Date(start.getTime() + dur*3600000);
      bookings.push({
        id: randId(), spotId: spot.id, zone: spot.zone,
        userEmail: u.email, userId: u.id,
        start: start.toISOString(), end: end.toISOString(),
        total: +(dur * spot.price).toFixed(2),
        payMethod: ['card','apple','google'][Math.floor(Math.random()*3)],
        createdAt: start.toISOString(),
      });
    }
    store.set('up_bookings', bookings);

    // Hourly occupancy records for the past 14 days.
    // The predictions panel uses this to estimate future availability.
    const history = [];
    for (let d = 14; d >= 0; d--) {
      for (let h = 0; h < 24; h++) {
        const ts = new Date(now - d*86400000);
        ts.setHours(h, 0, 0, 0);
        ZONES.forEach(z => {
          // Simulate realistic campus parking: busy 8–10am and 4–6pm, quiet overnight
          let base;
          if      (h >= 8  && h <= 10) base = 0.75 + Math.random()*0.20;
          else if (h >= 12 && h <= 14) base = 0.55 + Math.random()*0.15;
          else if (h >= 16 && h <= 18) base = 0.70 + Math.random()*0.20;
          else if (h >= 7  && h < 8)   base = 0.40 + Math.random()*0.20;
          else if (h >= 19 || h < 7)   base = 0.05 + Math.random()*0.10;
          else                         base = 0.30 + Math.random()*0.15;
          const occ = Math.min(z.capacity, Math.round(z.capacity * base));
          history.push({ ts: ts.toISOString(), zone: z.id, occupied: occ, capacity: z.capacity });
        });
      }
    }
    store.set('up_history', history);
    store.set('up_seeded', true);
  }

  // ── SMALL HELPERS ─────────────────────────────────────────────────────────
  function daysAgo(n) { const d = new Date(); d.setDate(d.getDate()-n); return d.toISOString(); }
  function randId()   { return Math.random().toString(36).slice(2,8).toUpperCase(); }

  // ── AUTH ──────────────────────────────────────────────────────────────────
  function getUsers()       { return store.get('up_users') || []; }
  function saveUsers(u)     { store.set('up_users', u); }
  function getCurrentUser() { return store.get('up_current'); }

  function login(email, password) {
    const u = getUsers().find(u =>
      u.email.toLowerCase() === email.toLowerCase() && u.password === password
    );
    if (!u) return { ok:false, error:'Invalid email or password.' };
    store.set('up_current', u);
    return { ok:true, user:u };
  }

  function register({ name, email, password, plate, role, subscription }) {
    const users = getUsers();
    if (users.find(u => u.email.toLowerCase() === email.toLowerCase()))
      return { ok:false, error:'An account with this email already exists.' };
    const u = {
      id: 'u'+randId(), email, password, name, plate,
      role: role||'student', subscription: subscription||'basic',
      joinedAt: new Date().toISOString(),
    };
    users.push(u);
    saveUsers(users);
    store.set('up_current', u);
    return { ok:true, user:u };
  }

  function logout() { store.del('up_current'); }

  // Redirect to the right page based on who's logged in
  function requireAuth() {
    const u = getCurrentUser();
    if (!u)               { window.location.href = 'index.html'; return null; }
    if (u.role === 'admin'){ window.location.href = 'admin.html'; return null; }
    return u;
  }

  function requireAdmin() {
    const u = getCurrentUser();
    if (!u)               { window.location.href = 'index.html';     return null; }
    if (u.role !== 'admin'){ window.location.href = 'dashboard.html'; return null; }
    return u;
  }

  // ── BOOKINGS ──────────────────────────────────────────────────────────────
  function getBookings()     { return store.get('up_bookings') || []; }
  function saveBookings(b)   { store.set('up_bookings', b); }
  function myBookings(email) { return getBookings().filter(b => b.userEmail === email); }
  function addBooking(b)     { const all = getBookings(); all.push(b); saveBookings(all); }
  function cancelBooking(id) { saveBookings(getBookings().filter(b => b.id !== id)); }

  // Mark any booking whose end time has passed as expired
  function expireBookings() {
    const now = new Date().toISOString();
    const bookings = getBookings();
    let changed = false;
    bookings.forEach(b => {
      if (b.end <= now && !b.expired) { b.expired = true; changed = true; }
    });
    if (changed) saveBookings(bookings);
  }

  // ── CLOSED SPOTS ──────────────────────────────────────────────────────────
  // Admins can close individual spots for maintenance etc.
  function getClosedSpots()     { return store.get('up_closed') || []; }
  function isSpotClosed(id)     { return getClosedSpots().includes(id); }
  function toggleSpotClosed(id) {
    const c = getClosedSpots();
    const i = c.indexOf(id);
    if (i === -1) c.push(id); else c.splice(i, 1);
    store.set('up_closed', c);
  }

  // ── SPOT STATUS ───────────────────────────────────────────────────────────
  // Returns one of: 'closed' | 'mine' | 'occupied' | 'available'
  function spotStatus(spotId, userEmail) {
    if (isSpotClosed(spotId)) return 'closed';
    const now    = new Date().toISOString();
    const active = getBookings().filter(b => !b.expired && b.end > now);
    if (active.find(b => b.spotId === spotId && b.userEmail === userEmail)) return 'mine';
    if (active.find(b => b.spotId === spotId)) return 'occupied';
    return 'available';
  }

  function getSpot(id)       { return SPOTS.find(s => s.id === id); }
  function zoneSpots(zoneId) { return SPOTS.filter(s => s.zone === zoneId); }

  // ── LIVE SIMULATION ───────────────────────────────────────────────────────
  // Every 8 seconds, randomly occupy or free a spot to fake real-time activity.
  let simCallbacks = [];
  function onSimUpdate(fn) { simCallbacks.push(fn); }

  function startSimulation() {
    setInterval(() => {
      const now     = new Date();
      const hour    = now.getHours();
      const now_iso = now.toISOString();

      // Higher chance of a car arriving during peak hours
      const occupyProb = (hour>=8&&hour<=10)||(hour>=16&&hour<=18) ? 0.6
                       : (hour>=11&&hour<=15) ? 0.45 : 0.15;

      const bookings    = getBookings();
      const active      = bookings.filter(b => !b.expired && b.end > now_iso);
      const occupiedIds = new Set(active.map(b => b.spotId));
      const closed      = new Set(getClosedSpots());
      const available   = SPOTS.filter(s => !occupiedIds.has(s.id) && !closed.has(s.id));
      const occupied    = SPOTS.filter(s => occupiedIds.has(s.id));

      if (Math.random() < occupyProb && available.length > 0) {
        // Pick a random free spot and "park" there for 1–3 hours
        const spot = available[Math.floor(Math.random()*available.length)];
        const dur  = 1 + Math.floor(Math.random()*3);
        const end  = new Date(now.getTime() + dur*3600000);
        bookings.push({
          id: randId(), spotId: spot.id, zone: spot.zone,
          userEmail: 'sim@system', userId: 'sim',
          start: now_iso, end: end.toISOString(),
          total: +(dur*spot.price).toFixed(2), payMethod:'sim', createdAt: now_iso,
        });
        saveBookings(bookings);
      } else if (occupied.length > 0 && Math.random() > 0.6) {
        // Randomly free one of the simulated bookings
        const spot = occupied[Math.floor(Math.random()*occupied.length)];
        const idx  = bookings.findIndex(b =>
          b.spotId===spot.id && !b.expired && b.end>now_iso && b.userId==='sim'
        );
        if (idx !== -1) { bookings[idx].expired = true; saveBookings(bookings); }
      }

      expireBookings();
      simCallbacks.forEach(fn => fn()); // tell the dashboard to re-render
    }, 8000);
  }

  // ── ZONE STATS ────────────────────────────────────────────────────────────
  // Returns live counts (available, occupied, mine, pct full) for each zone.
  function getZoneStats(userEmail) {
    expireBookings();
    const now    = new Date().toISOString();
    const active = getBookings().filter(b => !b.expired && b.end > now);
    return ZONES.map(z => {
      const spots        = zoneSpots(z.id);
      const occupiedCount = spots.filter(s => active.find(b => b.spotId===s.id)).length;
      const closedCount   = spots.filter(s => isSpotClosed(s.id)).length;
      const mineCount     = spots.filter(s => active.find(b => b.spotId===s.id && b.userEmail===userEmail)).length;
      const available     = spots.length - occupiedCount - closedCount;
      const pct           = Math.round((occupiedCount / spots.length) * 100); // % full
      return { ...z, spots:spots.length, available, occupied:occupiedCount, closed:closedCount, mine:mineCount, pct };
    });
  }

  // Summary numbers used by the admin dashboard
  function getAdminStats() {
    const bookings  = getBookings().filter(b => b.userId !== 'sim');
    const users     = getUsers().filter(u => u.role !== 'admin');
    const revenue   = bookings.reduce((a,b) => a+b.total, 0);
    const now       = new Date().toISOString();
    const activeNow = getBookings().filter(b => !b.expired && b.end > now).length;
    return { totalBookings:bookings.length, totalUsers:users.length, revenue, activeNow, totalSpots:SPOTS.length };
  }

  function getHistory() { return store.get('up_history') || []; }

  // Average occupancy fraction for each hour of the day (0–23)
  function getPeakHours() {
    const history = getHistory();
    const byHour  = Array(24).fill(0).map(() => ({ sum:0, count:0 }));
    history.forEach(h => {
      const hour = new Date(h.ts).getHours();
      byHour[hour].sum   += h.occupied / h.capacity;
      byHour[hour].count ++;
    });
    return byHour.map((b,i) => ({ hour:i, avg: b.count>0 ? b.sum/b.count : 0 }));
  }

  // Daily average occupancy over the last N days (used in admin charts)
  function getOccupancyTrend(days=14) {
    const history = getHistory();
    const now     = Date.now();
    const result  = [];
    for (let d = days-1; d >= 0; d--) {
      const day     = new Date(now - d*86400000);
      const dayStr  = day.toLocaleDateString('en-AU', { month:'short', day:'numeric' });
      const records = history.filter(h => new Date(h.ts).toDateString() === day.toDateString());
      const avgOcc  = records.length>0
        ? records.reduce((a,h) => a+h.occupied/h.capacity, 0) / records.length
        : 0;
      result.push({ day:dayStr, avgOcc });
    }
    return result;
  }

  // Historical utilisation % per zone (used in admin charts)
  function getZoneUtilisation() {
    const history = getHistory();
    return ZONES.map(z => {
      const records = history.filter(h => h.zone===z.id);
      const avg     = records.length>0
        ? records.reduce((a,h) => a+h.occupied/h.capacity, 0) / records.length
        : 0;
      return { ...z, utilPct: Math.round(avg*100) };
    });
  }

  // ── PREDICTIONS ───────────────────────────────────────────────────────────
  // Estimates availability for the next 6 hours based on historical patterns.
  function predictAvailability(zoneId) {
    const peak = getPeakHours();
    const now  = new Date();
    const zone = ZONES.find(z => z.id===zoneId);
    const result = [];
    for (let offset = 1; offset <= 6; offset++) {
      const h         = (now.getHours() + offset) % 24;
      const probAvail = Math.max(0, Math.min(1, 1 - peak[h].avg)); // invert occupancy → availability
      result.push({
        hour: h,
        label: h===0?'12am': h<12?h+'am': h===12?'12pm':(h-12)+'pm',
        probability:   Math.round(probAvail * 100),
        estimatedFree: Math.round(probAvail * (zone?.capacity || 20)),
      });
    }
    return result;
  }

  // Returns the zone if it has spaces (used for the "Smart recommendations" panel)
  function getRecommendations(userEmail) {
    return getZoneStats(userEmail)
      .filter(z => z.available > 0)
      .map((z, i) => ({ ...z, rank:i+1, reason:'Good availability' }));
  }

  // ── FORMATTERS ────────────────────────────────────────────────────────────
  function fmtDate(str)    { return new Date(str).toLocaleString('en-AU', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }); }
  function fmtTime(str)    { return new Date(str).toLocaleTimeString('en-AU', { hour:'2-digit', minute:'2-digit' }); }
  // Converts a Date object to the "YYYY-MM-DDTHH:MM" format used by <input type="datetime-local">
  function toLocalInput(d) {
    return d.getFullYear()
      +'-'+String(d.getMonth()+1).padStart(2,'0')
      +'-'+String(d.getDate()).padStart(2,'0')
      +'T'+String(d.getHours()).padStart(2,'0')
      +':'+String(d.getMinutes()).padStart(2,'0');
  }
  function initials(name) { return name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase(); }

  // Pops up a small notification at the bottom of the screen
  function toast(msg, duration=3000) {
    let el = document.getElementById('toast');
    if (!el) { el = document.createElement('div'); el.id='toast'; document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), duration);
  }

  // ── INIT ──────────────────────────────────────────────────────────────────
  seedIfNeeded(); // runs once on first ever load

  // Everything the other files are allowed to call
  return {
    ZONES, SPOTS, SPOT_ICONS, SPOT_PRICES,
    getUsers, saveUsers, getCurrentUser, login, register, logout, requireAuth, requireAdmin,
    getBookings, myBookings, addBooking, cancelBooking, expireBookings,
    getClosedSpots, isSpotClosed, toggleSpotClosed,
    spotStatus, getSpot, zoneSpots,
    getZoneStats, getAdminStats, getHistory, getPeakHours, getOccupancyTrend, getZoneUtilisation,
    predictAvailability, getRecommendations,
    startSimulation, onSimUpdate,
    randId, fmtDate, fmtTime, toLocalInput, initials, toast,
  };
})();
