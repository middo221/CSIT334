document.addEventListener('DOMContentLoaded',()=>{
  const admin = UniPark.requireAdmin();
  if(!admin) return;

  document.getElementById('admin-avatar').textContent = UniPark.initials(admin.name);
  document.getElementById('admin-name').textContent   = admin.name;

  document.getElementById('btn-logout').addEventListener('click',()=>{
    UniPark.logout(); window.location.href='index.html';
  });

  // ── NAV ──────────────────────────────────────────────────────────────────
  document.querySelectorAll('.nav-link').forEach(link=>{
    link.addEventListener('click',()=>{
      document.querySelectorAll('.nav-link').forEach(l=>l.classList.remove('active'));
      link.classList.add('active');
      const p=link.dataset.panel;
      document.querySelectorAll('.panel').forEach(x=>x.classList.add('hidden'));
      document.getElementById('panel-'+p).classList.remove('hidden');
      if(p==='analytics')  renderAnalytics();
      if(p==='bookings')   renderBookings();
      if(p==='users')      renderUsers();
      if(p==='spots')      renderSpots();
    });
  });

  // ── LIVE SIM ──────────────────────────────────────────────────────────────
  UniPark.startSimulation();
  UniPark.onSimUpdate(()=>{
    renderStats();
    renderLiveGrid();
    if(!document.getElementById('panel-analytics').classList.contains('hidden')){
      renderTodayStats();   // always refresh live cards
      renderRevenueChart(); // picks up any new bookings
      renderQuickStats();
    }
  });

  // ── STATS ─────────────────────────────────────────────────────────────────
  function renderStats(){
    const s = UniPark.getAdminStats();
    document.getElementById('stat-bookings').textContent = s.totalBookings;
    document.getElementById('stat-users').textContent    = s.totalUsers;
    document.getElementById('stat-revenue').textContent  = '$'+s.revenue.toFixed(2);
    document.getElementById('stat-active').textContent   = s.activeNow;
    document.getElementById('stat-spots').textContent    = s.totalSpots;
  }

  // ── LIVE OVERVIEW GRID (overview panel) ───────────────────────────────────
  function renderLiveGrid(){
    const stats = UniPark.getZoneStats('__admin__');
    document.getElementById('live-zones').innerHTML = stats.map(z=>{
      const pct = z.pct;
      const col = pct>80?'var(--red)': pct>55?'var(--amber)':'var(--green)';
      return `<div class="card" style="padding:1rem">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:.6rem">
          <div style="font-weight:700;font-size:13px">${z.name}</div>
          <span class="badge ${pct>80?'badge-red':pct>55?'badge-amber':'badge-green'}">${pct}% full</span>
        </div>
        <div style="display:flex;align-items:baseline;gap:6px;margin-bottom:6px">
          <span style="font-family:var(--font-display);font-size:26px;font-weight:800;color:${col}">${z.available}</span>
          <span style="font-size:12px;color:var(--muted)">/ ${z.spots} free</span>
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${col}"></div></div>
        <div style="font-size:11px;color:var(--muted);margin-top:5px">${z.walk} from campus centre</div>
      </div>`;
    }).join('');
  }

  // ── ANALYTICS ─────────────────────────────────────────────────────────────
  function renderAnalytics(){
    renderTodayStats();
    renderRevenueChart();
    renderPeakBars();
    renderHeatmap();
    renderZoneUtil();
    renderQuickStats();
  }

  // TODAY AT A GLANCE — pure live booking data, reflects new bookings instantly
  function renderTodayStats(){
    const now = new Date();
    const todayUTC = now.toISOString().slice(0,10);
    const allB = UniPark.getBookings().filter(b => b.userId !== 'sim' && !b.cancelled);
    const todayB = allB.filter(b => (b.createdAt || b.start || '').slice(0,10) === todayUTC);
    const activeNow = UniPark.getBookings().filter(b => !b.expired && !b.cancelled && b.end > now.toISOString()).length;
    const revToday = todayB.reduce((s,b) => s + Number(b.total||0), 0);
    const zoneStats = UniPark.getZoneStats('__admin__');
    const totalSpots = zoneStats.reduce((s,z) => s + z.spots, 0);
    const occupiedNow = zoneStats.reduce((s,z) => s + z.occupied, 0);
    const occupancyPct = totalSpots > 0 ? Math.round(occupiedNow / totalSpots * 100) : 0;
    const busiestZone = zoneStats.reduce((a,b) => a.pct > b.pct ? a : b, zoneStats[0]);
    const occCol = occupancyPct > 80 ? 'var(--red)' : occupancyPct > 55 ? 'var(--amber)' : 'var(--green)';

    document.getElementById('today-stats').innerHTML = `
      <div class="stat-card">
        <div class="stat-label">Bookings today</div>
        <div class="stat-value text-blue">${todayB.length}</div>
        <div class="stat-sub">${activeNow} currently active</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Revenue today</div>
        <div class="stat-value text-green">$${revToday.toFixed(2)}</div>
        <div class="stat-sub">from ${todayB.length} booking${todayB.length!==1?'s':''}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Occupancy now</div>
        <div class="stat-value" style="color:${occCol}">${occupancyPct}%</div>
        <div class="stat-sub">${occupiedNow} / ${totalSpots} spots taken</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Busiest zone now</div>
        <div class="stat-value text-amber">${busiestZone ? busiestZone.id : '—'}</div>
        <div class="stat-sub">${busiestZone ? busiestZone.pct + '% full · ' + busiestZone.available + ' free' : ''}</div>
      </div>`;
  }

  // 14-DAY REVENUE CHART — bar chart, updates as new bookings are made
  function renderRevenueChart(){
    const data = UniPark.getDailyRevenue(14);
    const W=600, H=110, PAD=6, GAP=4;
    const maxRev = Math.max(...data.map(d=>d.revenue), 1);
    const barW = (W - PAD*2 - GAP*(data.length-1)) / data.length;

    const bars = data.map((d,i) => {
      const x = PAD + i*(barW+GAP);
      const barH = Math.max(d.revenue>0?3:1, (d.revenue/maxRev)*(H-PAD*2-18));
      const y = H - PAD - 18 - barH;
      const isToday = i === data.length-1;
      const col = isToday ? 'var(--blue)' : d.revenue>0 ? 'var(--blue-dim)' : 'var(--surface3)';
      const borderCol = isToday ? 'var(--blue-dark)' : d.revenue>0 ? 'var(--blue)' : 'var(--border)';
      return `<g>
        <rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="3"
          fill="${col}" stroke="${borderCol}" stroke-width="${isToday?1.5:0}"
          title="${d.day}: $${d.revenue.toFixed(2)} · ${d.count} booking${d.count!==1?'s':''}"/>
        ${d.revenue>0?`<text x="${x+barW/2}" y="${y-3}" text-anchor="middle" fill="var(--blue)" font-size="7" font-weight="700" font-family="system-ui">$${d.revenue<10?d.revenue.toFixed(1):Math.round(d.revenue)}</text>`:''}
        <text x="${x+barW/2}" y="${H-3}" text-anchor="middle" fill="${isToday?'var(--blue)':'var(--muted)'}" font-size="7" font-weight="${isToday?700:400}" font-family="system-ui">${d.day.split(' ')[0]}</text>
      </g>`;
    }).join('');

    const todayRev = data[data.length-1]?.revenue || 0;
    document.getElementById('revenue-chart').innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">
        <span style="font-size:11px;color:var(--muted)">Today highlighted in blue</span>
        <span style="font-size:13px;font-weight:800;color:var(--blue)">Today: $${todayRev.toFixed(2)}</span>
      </div>
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;overflow:visible">
        ${bars}
      </svg>`;
  }

  // PEAK HOURS BAR CHART
  function renderPeakBars(){
    const peak = UniPark.getPeakHours();
    const shown = [6,7,8,9,10,11,12,13,14,15,16,17,18,19,20];
    const max = Math.max(...shown.map(h=>peak[h].avg),0.01);
    document.getElementById('peak-chart').innerHTML = shown.map(h=>{
      const avg = peak[h].avg;
      const pct = Math.round((avg/max)*100);
      const col = avg>0.75?'var(--red)': avg>0.5?'var(--amber)':'var(--green)';
      const label = h===0?'12am': h<12?h+'am': h===12?'12pm':(h-12)+'pm';
      return `<div class="peak-bar-wrap">
        <div class="peak-bar" style="height:${pct}%;background:${col};min-height:3px" title="${label}: ${Math.round(avg*100)}% avg occupancy"></div>
        <div class="peak-bar-label">${label}</div>
      </div>`;
    }).join('');
  }

  // OCCUPANCY HEATMAP — uses UTC hours to match how history is stored
  function renderHeatmap(){
    const history = UniPark.getHistory();
    const hours = [7,8,9,10,11,12,13,14,15,16,17,18,19];
    const zones = UniPark.ZONES;

    function avgOcc(zoneId, hour){
      const recs = history.filter(h=>h.zone===zoneId && new Date(h.ts).getUTCHours()===hour);
      if(!recs.length) return 0;
      return recs.reduce((a,h)=>a+h.occupied/h.capacity,0)/recs.length;
    }

    const wrap = document.getElementById('heatmap');
    let html = '<div class="heatmap-grid">';
    html += '<div class="heatmap-label"></div>';
    hours.forEach(h=>{
      const l = h<12?h+'am': h===12?'12pm':(h-12)+'pm';
      html+=`<div class="heatmap-col-label">${l}</div>`;
    });
    zones.forEach(z=>{
      html+=`<div class="heatmap-label">${z.id}</div>`;
      hours.forEach(h=>{
        const v=avgOcc(z.id,h);
        const alpha=0.1+v*0.85;
        const col=v>0.75?`rgba(240,91,91,${alpha})`:v>0.5?`rgba(240,165,0,${alpha})`:`rgba(52,217,123,${alpha})`;
        html+=`<div class="heatmap-cell" style="background:${col}" title="${z.name} at ${h<12?h+'am':h===12?'12pm':(h-12)+'pm'}: ${Math.round(v*100)}% avg">${Math.round(v*100)}%</div>`;
      });
    });
    html+='</div>';
    wrap.innerHTML=html;
  }

  // ZONE UTILISATION BARS
  function renderZoneUtil(){
    const data = UniPark.getZoneUtilisation();
    document.getElementById('zone-util').innerHTML = data.map(z=>{
      const col=z.utilPct>75?'var(--red)':z.utilPct>50?'var(--amber)':'var(--green)';
      return `<div class="zone-util-row">
        <div class="zone-util-name">${z.name.split('–')[0].trim()}</div>
        <div class="zone-util-bar">
          <div class="progress-bar"><div class="progress-fill" style="width:${z.utilPct}%;background:${col}"></div></div>
        </div>
        <div class="zone-util-pct">${z.utilPct}%</div>
      </div>`;
    }).join('');
  }

  // KEY METRICS — 7 rows
  function renderQuickStats(){
    const zoneUtil     = UniPark.getZoneUtilisation();
    const peak         = UniPark.getPeakHours();
    const history      = UniPark.getHistory();
    const realBookings = UniPark.getBookings().filter(b => b.userId !== 'sim' && !b.cancelled);

    // Busiest zone (historical avg)
    const busiest = zoneUtil.reduce((a,b) => a.utilPct > b.utilPct ? a : b, zoneUtil[0]);
    document.getElementById('qs-busiest-zone').textContent =
      busiest ? 'Zone ' + busiest.id + ' (' + busiest.utilPct + '%)' : '—';

    // Peak hour — restrict to daytime hours to avoid timezone artefacts
    const fmtH = h => h===0?'12am': h<12?h+'am': h===12?'12pm':(h-12)+'pm';
    const dayPeak = peak.filter(p=>p.hour>=6&&p.hour<=22).reduce((a,b)=>a.avg>b.avg?a:b,{hour:9,avg:0});
    document.getElementById('qs-peak-hour').textContent =
      fmtH(dayPeak.hour) + ' (' + Math.round(dayPeak.avg*100) + '% avg)';

    // Avg daily bookings
    const uniqueDays = new Set(history.map(r=>r.ts.slice(0,10))).size || 1;
    document.getElementById('qs-avg-bookings').textContent =
      '~' + Math.round(realBookings.length/uniqueDays) + ' / day';

    // Avg booking duration
    if(realBookings.length>0){
      const hrs = realBookings.reduce((s,b)=>{
        const h=(new Date(b.end)-new Date(b.start))/3600000;
        return s+(isNaN(h)?0:h);
      },0);
      document.getElementById('qs-avg-duration').textContent = (hrs/realBookings.length).toFixed(1)+' hrs';
    }

    // Top payment method
    const payCounts={};
    realBookings.forEach(b=>{payCounts[b.payMethod]=(payCounts[b.payMethod]||0)+1;});
    const topPay=Object.entries(payCounts).sort((a,b)=>b[1]-a[1])[0];
    const payLabels={card:'Card',apple:'Apple Pay',google:'Google Pay'};
    document.getElementById('qs-top-pay').textContent = topPay
      ?(payLabels[topPay[0]]||topPay[0])+' ('+Math.round(topPay[1]/realBookings.length*100)+'%)':'—';

    // Revenue this week
    const weekAgo=new Date(Date.now()-7*86400000).toISOString();
    const weekRev=realBookings.filter(b=>(b.createdAt||b.start)>=weekAgo).reduce((s,b)=>s+Number(b.total||0),0);
    document.getElementById('qs-revenue-week').textContent='$'+weekRev.toFixed(2);

    // Busiest day of week
    const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const dayCounts=Array(7).fill(0);
    realBookings.forEach(b=>{dayCounts[new Date(b.start).getDay()]++;});
    const maxDay=dayCounts.indexOf(Math.max(...dayCounts));
    document.getElementById('qs-busiest-day').textContent=
      days[maxDay]+' ('+dayCounts[maxDay]+' bookings)';
  }

  // ── ALL BOOKINGS ──────────────────────────────────────────────────────────
  let bSearch='';
  document.getElementById('booking-search').addEventListener('input',function(){ bSearch=this.value.toLowerCase(); renderBookings(); });

  function renderBookings(){
    const all = UniPark.getBookings().filter(b=>b.userId!=='sim').slice().reverse();
    const filtered = all.filter(b=>
      b.spotId.toLowerCase().includes(bSearch)||
      b.userEmail.toLowerCase().includes(bSearch)||
      b.id.toLowerCase().includes(bSearch)
    );
    const tbody = document.getElementById('bookings-tbody');
    const recentTbody = document.getElementById('recent-bookings-tbody');
    if(!filtered.length){
        const empty = `<tr><td colspan="6" class="table-empty">No bookings found.</td></tr>`;
        tbody.innerHTML = empty;
        if (recentTbody) recentTbody.innerHTML = empty;
        return;
    }
    const now=new Date().toISOString();
    const rows = filtered.map(b=>{
      const spot=UniPark.getSpot(b.spotId);
      const u=UniPark.getUsers().find(x=>x.email===b.userEmail);
      const expired=b.expired||b.end<=now;
      return `<tr>
        <td><span class="badge badge-blue mono">#UP-${b.id}</span></td>
        <td><div style="font-weight:600">${b.spotId}</div><div style="font-size:11px;color:var(--muted)">${spot?.type} · Zone ${spot?.zone}</div></td>
        <td><div style="font-weight:500">${u?.name||b.userEmail}</div><div style="font-size:11px;color:var(--muted)">${b.userEmail}</div></td>
        <td style="font-family:var(--font-mono);font-size:11px">${UniPark.fmtDate(b.start)}<br><span style="color:var(--muted)">→ ${UniPark.fmtDate(b.end)}</span></td>
        <td style="color:var(--green);font-family:var(--font-display);font-weight:800;font-size:15px">$${b.total.toFixed(2)}</td>
        <td>
          <span class="badge ${expired?'badge-red':'badge-green'}">${expired?'Expired':'Active'}</span>
          ${!expired?`<button class="btn btn-sm btn-danger" style="margin-left:6px" data-cancel="${b.id}">Cancel</button>`:''}
        </td>
      </tr>`;
    }).join('');
    tbody.innerHTML = rows;
    if (recentTbody) recentTbody.innerHTML = filtered.slice(0,5).map(b=>{
        const spot=UniPark.getSpot(b.spotId);
        const u=UniPark.getUsers().find(x=>x.email===b.userEmail);
        const expired=b.expired||b.end<=new Date().toISOString();
        return `<tr>
            <td><span class="badge badge-blue mono">#UP-${b.id}</span></td>
            <td><div style="font-weight:600">${b.spotId}</div><div style="font-size:11px;color:var(--muted)">${spot?.type} · Zone ${spot?.zone}</div></td>
            <td><div style="font-weight:500">${u?.name||b.userEmail}</div><div style="font-size:11px;color:var(--muted)">${b.userEmail}</div></td>
            <td style="font-family:var(--font-mono);font-size:11px">${UniPark.fmtDate(b.start)}<br><span style="color:var(--muted)">→ ${UniPark.fmtDate(b.end)}</span></td>
            <td style="color:var(--green);font-family:var(--font-display);font-weight:800;font-size:15px">$${b.total.toFixed(2)}</td>
            <td><span class="badge ${expired?'badge-red':'badge-green'}">${expired?'Expired':'Active'}</span></td>
          </tr>`;
    }).join('');
    tbody.querySelectorAll('[data-cancel]').forEach(btn=>{
      btn.addEventListener('click',()=>{
        if(!confirm('Cancel this booking?')) return;
        UniPark.cancelBooking(btn.dataset.cancel);
        renderStats(); renderBookings(); UniPark.toast('Booking cancelled.');
      });
    });
  }

  // ── USERS ─────────────────────────────────────────────────────────────────
  let uSearch='';
  document.getElementById('user-search').addEventListener('input',function(){ uSearch=this.value.toLowerCase(); renderUsers(); });

  function renderUsers(){
    const all=UniPark.getUsers().filter(u=>u.role!=='admin');
    const filtered=all.filter(u=>
      u.name.toLowerCase().includes(uSearch)||
      u.email.toLowerCase().includes(uSearch)||
      (u.plate||'').toLowerCase().includes(uSearch)
    );
    const tbody=document.getElementById('users-tbody');
    if(!filtered.length){ tbody.innerHTML=`<tr><td colspan="6" class="table-empty">No users found.</td></tr>`; return; }
    tbody.innerHTML=filtered.map(u=>{
      const bkgs=UniPark.myBookings(u.email).filter(b=>b.userId!=='sim');
      const spent=bkgs.reduce((a,b)=>a+b.total,0);
      return `<tr>
        <td><div style="display:flex;align-items:center;gap:9px">
          <div style="width:30px;height:30px;border-radius:50%;background:var(--surface3);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;font-family:var(--font-display);color:var(--muted);flex-shrink:0">${UniPark.initials(u.name)}</div>
          <div><div style="font-weight:600;font-size:13px">${u.name}</div><div style="font-size:11px;color:var(--muted)">${u.email}</div></div>
        </div></td>
        <td style="font-family:var(--font-mono);font-size:12px">${u.plate||'<span style="color:var(--faint)">—</span>'}</td>
        <td><span class="role-badge role-${u.role}">${u.role}</span></td>
        <td><span class="badge badge-blue">${u.subscription}</span></td>
        <td style="font-family:var(--font-mono);font-size:12px">${bkgs.length}</td>
        <td style="color:var(--green);font-family:var(--font-display);font-weight:800">$${spent.toFixed(2)}</td>
      </tr>`;
    }).join('');
  }

  // ── MANAGE SPOTS ──────────────────────────────────────────────────────────
  let activeZone='A';

  function renderSpotTabs(){
    const wrap=document.getElementById('spot-zone-tabs');
    wrap.innerHTML=UniPark.ZONES.map(z=>
      `<button class="zone-btn${z.id===activeZone?' active':''}" data-zone="${z.id}">${z.id} – ${z.name.split('–')[1]?.trim()||z.name}</button>`
    ).join('');
    wrap.querySelectorAll('.zone-btn').forEach(btn=>{
      btn.addEventListener('click',()=>{ activeZone=btn.dataset.zone; renderSpotTabs(); renderSpots(); });
    });
  }

  function renderSpots(){
    const spots=UniPark.zoneSpots(activeZone);
    const half=Math.ceil(spots.length/2);
    const rowA=spots.slice(0,half), rowB=spots.slice(half);
    function row(rowSpots){
      return rowSpots.map(s=>{
        const booked=!!UniPark.getBookings().find(b=>!b.expired&&b.end>new Date().toISOString()&&b.spotId===s.id&&b.userId!=='sim');
        const simOcc=!!UniPark.getBookings().find(b=>!b.expired&&b.end>new Date().toISOString()&&b.spotId===s.id&&b.userId==='sim');
        const closed=UniPark.isSpotClosed(s.id);
        const st=closed?'closed': (booked||simOcc)?'occupied':'available';
        return `<div class="spot ${st}" data-spot="${s.id}" title="${closed?'Click to reopen':(booked||simOcc)?'Currently occupied':'Click to close'}">
          <span class="spot-id">${s.id}</span>
          <span class="spot-type">${s.type}</span>
          ${closed?'<span style="font-size:8px;font-weight:700;color:var(--amber);text-transform:uppercase;font-family:var(--font-mono)">CLOSED</span>':`<span class="spot-price">$${s.price}/hr</span>`}
        </div>`;
      }).join('');
    }
    document.getElementById('admin-spot-grid').innerHTML=`
      <div class="lot-row-label">Row 1</div><div class="spots-row">${row(rowA)}</div>
      <div class="drive-lane"><span class="drive-lane-text">← Drive lane →</span></div>
      <div class="lot-row-label">Row 2</div><div class="spots-row">${row(rowB)}</div>`;
    document.querySelectorAll('#admin-spot-grid .spot:not(.occupied)').forEach(el=>{
      el.addEventListener('click',()=>{
        const id=el.dataset.spot;
        const closed=UniPark.isSpotClosed(id);
        if(!confirm(closed?`Reopen spot ${id}?`:`Close spot ${id} to new bookings?`)) return;
        UniPark.toggleSpotClosed(id); renderSpots(); renderStats();
        UniPark.toast(closed?`Spot ${id} reopened`:`Spot ${id} closed`);
      });
    });
  }

  // ── INIT ──────────────────────────────────────────────────────────────────
  renderStats();
  renderLiveGrid();
  renderBookings();
  renderSpotTabs();
  renderSpots();
});
