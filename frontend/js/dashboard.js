
document.addEventListener('DOMContentLoaded', () => {

  const user = UniPark.requireAuth();
  if (!user) return;

  document.getElementById('user-avatar').textContent = UniPark.initials(user.name);
  document.getElementById('user-name').textContent = user.name.split(' ')[0];
  const subColors = { basic:'badge-blue', premium:'badge-green', staff:'badge-amber' };
  const subEl = document.getElementById('user-sub');
  subEl.className = 'badge ' + (subColors[user.subscription] || 'badge-blue');
  subEl.textContent = user.subscription;

  document.getElementById('btn-logout').addEventListener('click', () => {
    UniPark.logout();
    window.location.href = 'index.html';
  });

  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      const panelId = link.dataset.panel;
      document.querySelectorAll('.panel').forEach(p => p.classList.add('hidden'));
      document.getElementById('panel-' + panelId).classList.remove('hidden');
      if (panelId === 'bookings') renderBookings();
      if (panelId === 'predict') renderPredictions();
    });
  });

  let activeZone = UniPark.ZONES[0].id;
  let activeFilter = 'all';
  let selectedSpot = null;
  let selectedPay = 'card';

  UniPark.startSimulation();
  UniPark.onSimUpdate(() => renderAll());

  function renderStats() {
    const stats = UniPark.getZoneStats(user.email);
    const totAvail = stats.reduce((a, z) => a + z.available, 0);
    const totOcc = stats.reduce((a, z) => a + z.occupied, 0);
    const mine = UniPark.myBookings(user.email)
      .filter(b => !b.expired && b.end > new Date().toISOString()).length;

    document.getElementById('stat-available').textContent = totAvail;
    document.getElementById('stat-occupied').textContent = totOcc;
    document.getElementById('stat-mine').textContent = mine;
  }

  function renderZoneCards() {
    const stats = UniPark.getZoneStats(user.email);
    const recs = UniPark.getRecommendations(user.email);
    const recIds = recs.map(r => r.id);

    document.getElementById('zones-grid').innerHTML = stats.map(z => {
      const availClass = z.available === 0 ? 'full' : z.available <= 3 ? 'low' : '';
      const fillColor = z.pct > 80 ? 'var(--red)' : z.pct > 55 ? 'var(--amber)' : 'var(--green)';
      return `
        <div class="zone-card${recIds[0]===z.id ? ' recommended' : ''}" onclick="goToFind('${z.id}')">
          <div class="zone-name">${z.name}</div>
          <div class="zone-avail ${availClass}">${z.available}</div>
          <div class="zone-total">of ${z.spots} available · ${z.walk} walk</div>
          <div class="zone-bar-wrap">
            <div class="zone-bar" style="width:${z.pct}%;background:${fillColor}"></div>
          </div>
          <div class="zone-tags" style="margin-top:8px">
            ${z.available === 0
              ? '<span class="badge badge-red">Full</span>'
              : z.available <= 3
                ? '<span class="badge badge-amber">Almost Full</span>'
                : '<span class="badge badge-green">Available</span>'}
            ${z.mine > 0 ? '<span class="badge badge-blue">Your spot here</span>' : ''}
          </div>
        </div>`;
    }).join('');
  }

  function renderZoneSwitcher() {
    const wrap = document.getElementById('zone-switcher');
    wrap.innerHTML = UniPark.ZONES.map(z =>
      `<button class="zone-btn${z.id === activeZone ? ' active' : ''}" data-zone="${z.id}">${z.id} – ${z.name.split('–')[1]?.trim() || z.name}</button>`
    ).join('');
    wrap.querySelectorAll('.zone-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        activeZone = btn.dataset.zone;
        activeFilter = 'all';
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        document.querySelector('[data-filter="all"]').classList.add('active');
        renderZoneSwitcher();
        renderGrid();
      });
    });
  }

  window.goToFind = function (zoneId) {
    if (zoneId) activeZone = zoneId;
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.querySelector('[data-panel="find"]').classList.add('active');
    document.querySelectorAll('.panel').forEach(p => p.classList.add('hidden'));
    document.getElementById('panel-find').classList.remove('hidden');
    renderZoneSwitcher();
    renderGrid();
  };

  function renderRecommendations() {
    const recs = UniPark.getRecommendations(user.email);
    if (!recs.length) {
      document.getElementById('rec-list').innerHTML =
        '<p style="color:var(--muted);font-size:13px;text-align:center;padding:1rem">All spots are currently full.</p>';
      return;
    }
    document.getElementById('rec-list').innerHTML = recs.map(r => `
      <div class="rec-item">
        <div class="rec-rank rec-rank-${r.rank}">${r.rank}</div>
        <div class="rec-info">
          <div class="rec-zone">${r.name}</div>
          <div class="rec-reason">${r.reason} · ${r.available} spots free</div>
        </div>
        <div class="rec-walk">🚶 ${r.walk}</div>
        <button class="btn btn-primary btn-sm" onclick="goToFind()">Go →</button>
      </div>`
    ).join('');
  }

  function renderGrid() {
    let spots = UniPark.zoneSpots(activeZone);
    if (activeFilter === 'available')
      spots = spots.filter(s => UniPark.spotStatus(s.id, user.email) === 'available');
    else if (activeFilter !== 'all')
      spots = spots.filter(s => s.type === activeFilter);

    const half = Math.ceil(spots.length / 2);
    const rowA = spots.slice(0, half);
    const rowB = spots.slice(half);

    function renderRow(rowSpots) {
      return rowSpots.map(s => {
        const st = UniPark.spotStatus(s.id, user.email);
        const clickable = st === 'available' || st === 'mine';
        return `
          <div class="spot ${st}" data-spot="${s.id}" ${clickable ? '' : 'tabindex="-1"'}>
            <span class="spot-id">${s.id}</span>
            <span class="spot-type">${s.type}</span>
            <span class="spot-price">$${s.price}/hr</span>
          </div>`;
      }).join('');
    }

    document.getElementById('parking-grid').innerHTML = `
      <div class="lot-row-label">Row 1</div>
      <div class="spots-row">${renderRow(rowA)}</div>
      <div class="drive-lane"><span class="drive-lane-text">← Drive lane →</span></div>
      <div class="lot-row-label">Row 2</div>
      <div class="spots-row">${renderRow(rowB)}</div>`;

    document.querySelectorAll('.spot.available, .spot.mine').forEach(el => {
      el.addEventListener('click', () => {
        const spot = UniPark.getSpot(el.dataset.spot);
        const st = UniPark.spotStatus(spot.id, user.email);
        if (st === 'mine') {
          const b = UniPark.myBookings(user.email).find(b => b.spotId===spot.id && !b.expired);
          UniPark.toast(`📋 Already booked — Ref #UP-${b?.id}`);
          return;
        }
        openBookingModal(spot);
      });
    });
  }

  function renderPredictions() {
    const stats = UniPark.getZoneStats(user.email);
    document.getElementById('predict-grid').innerHTML = stats.map(z => {
      const pred = UniPark.predictAvailability(z.id);
      const bars = pred.map(p => {
        const height = Math.round((p.probability / 100) * 50);
        const color = p.probability > 60 ? 'var(--green)' : p.probability > 35 ? 'var(--amber)' : 'var(--red)';
        return `<div class="hour-bar" style="height:${height}px;background:${color}" title="${p.label}: ${p.probability}% available"></div>`;
      }).join('');
      const labels = pred.map(p => `<span class="predict-label">${p.label}</span>`).join('');
      const rows = pred.slice(0, 3).map(p => {
        const color = p.probability > 60 ? 'var(--green)' : p.probability > 35 ? 'var(--amber)' : 'var(--red)';
        return `
          <div class="predict-prob">
            <span class="predict-prob-name">${p.label}</span>
            <span class="predict-prob-val" style="color:${color}">${p.probability}% free</span>
          </div>`;
      }).join('');
      return `
        <div class="predict-card">
          <div class="predict-title">${z.name}</div>
          <div style="font-size:11px;color:var(--muted);margin-bottom:.75rem">Next 6 hours availability forecast</div>
          <div class="predict-hours">${bars}</div>
          <div class="predict-labels">${labels}</div>
          ${rows}
        </div>`;
    }).join('');
  }

  function renderBookings() {
    UniPark.expireBookings();
    const now = new Date().toISOString();
    const mine = UniPark.myBookings(user.email)
      .filter(b => b.userId !== 'sim')
      .reverse();

    const wrap = document.getElementById('bookings-list');
    if (!mine.length) {
      wrap.innerHTML = `
        <div class="bookings-empty">
          <div class="bookings-empty-icon">🅿️</div>
          <div class="bookings-empty-title">No bookings yet</div>
          <p>Find a spot and reserve it to see it here.</p>
        </div>`;
      return;
    }

    wrap.innerHTML = mine.map(b => {
      const spot = UniPark.getSpot(b.spotId);
      const expired = b.expired || b.end <= now;
      return `
        <div class="booking-item">
          <div class="booking-left">
            <div class="booking-spot-pill">${b.spotId}</div>
            <div>
              <div class="booking-type">
                ${spot?.type} · Zone ${spot?.zone}
                ${expired
                  ? '<span class="badge badge-red" style="margin-left:6px">Expired</span>'
                  : '<span class="badge badge-green" style="margin-left:6px">Active</span>'}
              </div>
              <div class="booking-time">${UniPark.fmtDate(b.start)} → ${UniPark.fmtDate(b.end)}</div>
            </div>
          </div>
          <div class="booking-right">
            <div class="booking-total">$${b.total.toFixed(2)}</div>
            ${!expired ? `<button class="btn btn-danger btn-sm" data-cancel="${b.id}">Cancel</button>` : ''}
          </div>
        </div>`;
    }).join('');

    wrap.querySelectorAll('[data-cancel]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!confirm('Cancel this booking?')) return;
        UniPark.cancelBooking(btn.dataset.cancel);
        renderAll();
        UniPark.toast('Booking cancelled.');
      });
    });
  }

  function openBookingModal(spot) {
    selectedSpot = spot;
    document.getElementById('modal-spot-subtitle').textContent = `Spot ${spot.id} · ${spot.type}`;
    document.getElementById('preview-id').textContent = spot.id;
    document.getElementById('preview-meta').textContent = `Zone ${spot.zone} · ${spot.type} · $${spot.price}/hr`;

    // default to next whole hour, 2hr duration
    const start = new Date(); start.setMinutes(0,0,0); start.setHours(start.getHours()+1);
    const end = new Date(start); end.setHours(end.getHours()+2);
    document.getElementById('book-start').value = UniPark.toLocalInput(start);
    document.getElementById('book-end').value = UniPark.toLocalInput(end);
    updatePrice();
    openModal('modal-booking');
  }

  function updatePrice() {
    const s = document.getElementById('book-start').value;
    const e = document.getElementById('book-end').value;
    if (!s || !e || !selectedSpot) return;
    const hrs = (new Date(e) - new Date(s)) / 3600000;
    if (hrs <= 0) {
      ['pb-dur','pb-rate','pb-total'].forEach(id => document.getElementById(id).textContent = '—');
      return;
    }
    document.getElementById('pb-dur').textContent = hrs % 1 === 0 ? hrs+' hrs' : hrs.toFixed(1)+' hrs';
    document.getElementById('pb-rate').textContent = `$${selectedSpot.price}/hr`;
    document.getElementById('pb-total').textContent = `$${(hrs * selectedSpot.price).toFixed(2)}`;
  }

  document.getElementById('book-start').addEventListener('input', updatePrice);
  document.getElementById('book-end').addEventListener('input', updatePrice);

  document.querySelectorAll('.pay-opt').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.pay-opt').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      selectedPay = opt.dataset.pay;
      document.getElementById('card-fields').classList.toggle('hidden', selectedPay !== 'card');
    });
  });

  document.getElementById('card-number').addEventListener('input', function () {
    const v = this.value.replace(/\D/g,'').slice(0,16);
    this.value = v.match(/.{1,4}/g)?.join(' ') || v;
  });

  document.getElementById('card-expiry').addEventListener('input', function () {
    let v = this.value.replace(/\D/g,'').slice(0,4);
    if (v.length >= 3) v = v.slice(0,2) + ' / ' + v.slice(2);
    this.value = v;
  });

  document.getElementById('btn-confirm').addEventListener('click', () => {
    const s = document.getElementById('book-start').value;
    const e = document.getElementById('book-end').value;
    if (!s || !e) return UniPark.toast('⚠️ Please choose start and end times.');
    if (new Date(e) <= new Date(s)) return UniPark.toast('⚠️ End time must be after start time.');

    const hrs = (new Date(e) - new Date(s)) / 3600000;
    const total = +(hrs * selectedSpot.price).toFixed(2);
    const id = UniPark.randId();

    const result = UniPark.addBooking({
      id, spotId: selectedSpot.id, zone: selectedSpot.zone,
      userEmail: user.email, userId: user.id,
      start: new Date(s).toISOString(), end: new Date(e).toISOString(),
      total, payMethod: selectedPay,
      createdAt: new Date().toISOString(),
    });

    if (!result.ok) return UniPark.toast('⚠️ ' + (result.error || 'Booking failed. Please try again.'));

    closeModal('modal-booking');
    document.getElementById('success-ref').textContent = `REF: #UP-${result.booking?.id || id}`;
    document.getElementById('success-detail').textContent =
      `${selectedSpot.id} · ${UniPark.fmtDate(s)} → ${UniPark.fmtDate(e)} · $${total.toFixed(2)} paid`;
    openModal('modal-success');
    renderAll();
  });

  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeFilter = chip.dataset.filter;
      renderGrid();
    });
  });

  function openModal(id) { document.getElementById(id).classList.add('open'); }
  function closeModal(id) { document.getElementById(id).classList.remove('open'); }

  document.querySelectorAll('.btn-close').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });
  document.querySelectorAll('.modal-overlay').forEach(o => {
    o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); });
  });

  document.getElementById('btn-success-done').addEventListener('click', () => {
    closeModal('modal-success');
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.querySelector('[data-panel="bookings"]').classList.add('active');
    document.querySelectorAll('.panel').forEach(p => p.classList.add('hidden'));
    document.getElementById('panel-bookings').classList.remove('hidden');
    renderBookings();
  });

  function renderAll() {
    renderStats();
    renderZoneCards();
    renderRecommendations();
    renderZoneSwitcher();
    renderGrid();
  }

  renderAll();
  renderPredictions();
});
