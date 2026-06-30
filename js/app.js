// ── STATE ─────────────────────────────────────────────────────────────────────
let currentUser   = null;
let currentProfile = null;
let parsedData    = null;   // hasil AI parsing
let todayOrders   = [];     // orderan hari ini milik CS ini

// ── DATE RANGE PICKER (port dari BotWA analytics) ────────────────────────────
let drpSelStart = null, drpSelEnd = null, drpPickingEnd = false;
let drpViewYear = new Date().getFullYear(), drpViewMonth = new Date().getMonth();
const MONTHS_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const DAYS_ID   = ['Mo','Tu','We','Th','Fr','Sa','Su'];

// State filter aktif — default hari ini, disimpan sebagai string YYYY-MM-DD (WIB)
let filterDateStart = todayStr();
let filterDateEnd   = todayStr();

function drpFmt(d) {
  if (!d) return '—';
  return d.toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' });
}

function drpToggle() {
  const dd = document.getElementById('drp-dropdown');
  dd.classList.toggle('open');
  if (dd.classList.contains('open')) { drpRender(); document.addEventListener('click', drpOutside); }
  else document.removeEventListener('click', drpOutside);
}

function drpClose() {
  document.getElementById('drp-dropdown').classList.remove('open');
  document.removeEventListener('click', drpOutside);
}

function drpOutside(e) {
  const dd = document.getElementById('drp-dropdown');
  const tr = document.getElementById('drp-trigger');
  if (dd && tr && !dd.contains(e.target) && !tr.contains(e.target)) drpClose();
}

function drpPreset(days, label, btn) {
  drpSelStart = new Date(Date.now() - (days-1)*864e5); drpSelStart.setHours(0,0,0,0);
  drpSelEnd   = new Date(); drpSelEnd.setHours(23,59,59,999);
  document.querySelectorAll('.drp-preset').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  drpUpdateSel(); drpRender();
}

function drpPresetThisMonth(btn) {
  drpSelStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  drpSelEnd   = new Date(); drpSelEnd.setHours(23,59,59,999);
  document.querySelectorAll('.drp-preset').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  drpUpdateSel(); drpRender();
}

function drpPresetLastMonth(btn) {
  const n = new Date();
  drpSelStart = new Date(n.getFullYear(), n.getMonth()-1, 1);
  drpSelEnd   = new Date(n.getFullYear(), n.getMonth(), 0); drpSelEnd.setHours(23,59,59,999);
  document.querySelectorAll('.drp-preset').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  drpUpdateSel(); drpRender();
}

function drpPresetYesterday(btn) {
  drpSelStart = new Date(Date.now()-864e5); drpSelStart.setHours(0,0,0,0);
  drpSelEnd   = new Date(Date.now()-864e5); drpSelEnd.setHours(23,59,59,999);
  document.querySelectorAll('.drp-preset').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  drpUpdateSel(); drpRender();
}

function drpUpdateSel() {
  document.getElementById('drp-sel-start').textContent = drpFmt(drpSelStart);
  document.getElementById('drp-sel-end').textContent   = drpFmt(drpSelEnd);
}

function drpApply() {
  if (!drpSelStart) return;
  const s = drpSelStart;
  const e = drpSelEnd || drpSelStart;
  e.setHours(23,59,59,999);
  // Simpan sebagai YYYY-MM-DD WIB untuk query Supabase
  filterDateStart = s.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
  filterDateEnd   = e.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
  const label = filterDateStart === filterDateEnd
    ? drpFmt(s)
    : drpFmt(s) + ' — ' + drpFmt(e);
  document.getElementById('drp-label').textContent = label;
  drpClose();
  loadDashboard();
}

function drpClickDay(y, m, d) {
  const clicked = new Date(y, m, d);
  if (!drpSelStart || (drpSelStart && drpSelEnd)) {
    drpSelStart = clicked; drpSelEnd = null; drpPickingEnd = true;
  } else {
    if (clicked < drpSelStart) { drpSelEnd = drpSelStart; drpSelStart = clicked; }
    else drpSelEnd = clicked;
    drpPickingEnd = false;
  }
  drpUpdateSel(); drpRender();
}

function drpRender() {
  const y = drpViewYear, m = drpViewMonth;
  const firstDay    = new Date(y, m, 1).getDay();
  const startPad    = firstDay === 0 ? 6 : firstDay - 1;
  const daysInMonth = new Date(y, m+1, 0).getDate();
  const prevDays    = new Date(y, m, 0).getDate();
  const today       = new Date(); today.setHours(0,0,0,0);

  let html = `<div class="drp-cal-hdr">
    <button class="drp-nav" onclick="drpNav(-1)">‹</button>
    <div class="drp-cal-title">${MONTHS_ID[m]} ${y}</div>
    <button class="drp-nav" onclick="drpNav(1)">›</button>
  </div>
  <div class="drp-days-hdr">${DAYS_ID.map(d => '<span>' + d + '</span>').join('')}</div>
  <div class="drp-days">`;

  for (let i = startPad; i > 0; i--) {
    html += `<button class="drp-day other-month" onclick="drpNav(-1)">${prevDays-i+1}</button>`;
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const cur     = new Date(y, m, d);
    const isToday = cur.getTime() === today.getTime();
    const isStart = drpSelStart && cur.getTime() === new Date(drpSelStart.getFullYear(), drpSelStart.getMonth(), drpSelStart.getDate()).getTime();
    const isEnd   = drpSelEnd   && cur.getTime() === new Date(drpSelEnd.getFullYear(),   drpSelEnd.getMonth(),   drpSelEnd.getDate()).getTime();
    const inRange = drpSelStart && drpSelEnd && cur > drpSelStart && cur < drpSelEnd;

    let cls = 'drp-day';
    if (isStart && isEnd) cls += ' selected';
    else if (isStart)     cls += ' range-start';
    else if (isEnd)       cls += ' range-end';
    else if (inRange)     cls += ' in-range';
    if (isToday) cls += ' today';

    html += `<button class="${cls}" onclick="drpClickDay(${y},${m},${d})">${d}</button>`;
  }

  const total = startPad + daysInMonth;
  const rem   = total % 7 === 0 ? 0 : 7 - (total % 7);
  for (let d = 1; d <= rem; d++) {
    html += `<button class="drp-day other-month" onclick="drpNav(1)">${d}</button>`;
  }
  html += '</div>';
  document.getElementById('drp-cal').innerHTML = html;
}

function drpNav(dir) {
  drpViewMonth += dir;
  if (drpViewMonth > 11) { drpViewMonth = 0; drpViewYear++; }
  if (drpViewMonth < 0)  { drpViewMonth = 11; drpViewYear--; }
  drpRender();
}

// Init — set default hari ini sebagai Date object
(function() {
  drpSelStart = new Date(); drpSelStart.setHours(0,0,0,0);
  drpSelEnd   = new Date(); drpSelEnd.setHours(23,59,59,999);
})();

// ── INIT ──────────────────────────────────────────────────────────────────────
(async () => {
  currentUser = await requireAuth();
  if (!currentUser) return;

  // Load profile
  currentProfile = await getProfile(currentUser.id);
  if (!currentProfile) {
    // Buat profile baru kalau belum ada
    const meta = currentUser.user_metadata || {};
    currentProfile = { id: currentUser.id, nama: meta.nama || currentUser.email, no_wa: meta.no_wa || '', email: currentUser.email };
    await sb.from('cs_profiles').upsert(currentProfile);
  }

  // Topbar & avatar
  const nama = currentProfile.nama || currentUser.email;
  document.getElementById('user-nama').textContent         = nama;
  document.getElementById('user-avatar').textContent       = nama.charAt(0).toUpperCase();
  document.getElementById('mobile-avatar').textContent     = nama.charAt(0).toUpperCase();
  document.getElementById('topbar-date').textContent       = new Date().toLocaleDateString('id-ID', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

  // Restore theme
  if (localStorage.getItem('cs_theme') === 'dark') {
    document.documentElement.setAttribute('data-theme','dark');
    document.getElementById('theme-icon').textContent        = '☀️';
    document.getElementById('theme-label').textContent       = 'Terang';
    document.getElementById('theme-icon-mobile').textContent = '☀️';
  }

  await loadDashboard();
  await loadHistoryMini();
})();

// ── NAVIGATION ────────────────────────────────────────────────────────────────
function switchPage(name) {
  ['dashboard','upload','setting'].forEach(p => {
    document.getElementById('page-'+p).classList.toggle('active', p===name);
    // Sidebar nav (desktop)
    const navEl = document.getElementById('nav-'+p);
    if (navEl) navEl.classList.toggle('active', p===name);
    // Bottom nav (mobile)
    const bnavEl = document.getElementById('bnav-'+p);
    if (bnavEl) bnavEl.classList.toggle('active', p===name);
  });
  const titles = { dashboard:'Dashboard', upload:'Upload Order', setting:'Setting' };
  document.getElementById('topbar-title').textContent = titles[name] || '';
  if (name === 'dashboard') loadDashboard();
  if (name === 'upload')    loadHistoryMini();
  if (name === 'setting')   loadSetting();
}

// ── DARK MODE ────────────────────────────────────────────────────────────────
function toggleDark() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  if (isDark) {
    document.documentElement.removeAttribute('data-theme');
    document.getElementById('theme-icon').textContent        = '🌙';
    document.getElementById('theme-label').textContent       = 'Gelap';
    document.getElementById('theme-icon-mobile').textContent = '🌙';
    localStorage.setItem('cs_theme','light');
  } else {
    document.documentElement.setAttribute('data-theme','dark');
    document.getElementById('theme-icon').textContent        = '☀️';
    document.getElementById('theme-label').textContent       = 'Terang';
    document.getElementById('theme-icon-mobile').textContent = '☀️';
    localStorage.setItem('cs_theme','dark');
  }
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
async function loadDashboard() {
  if (!currentUser) return;
  try {
    const { data, error } = await sb.from('orderan_masuk')
      .select('*')
      .eq('cs_id', currentUser.id)
      .gte('tanggal', filterDateStart)
      .lte('tanggal', filterDateEnd)
      .order('created_at', { ascending: false });

    if (error) throw error;
    todayOrders = data || [];

    const total  = todayOrders.length;
    const tunggu = todayOrders.filter(r => !r.acc_spv).length;
    const kirim  = todayOrders.filter(r => r.acc_spv === 'KIRIM').length;
    const hold   = todayOrders.filter(r => r.acc_spv === 'HOLD').length;
    const cancel = todayOrders.filter(r => r.acc_spv === 'CANCEL').length;

    // Label sub sesuai range
    const isSingleDay = filterDateStart === filterDateEnd;
    const subLabel = isSingleDay
      ? drpFmt(drpSelStart)
      : `${drpFmt(drpSelStart)} — ${drpFmt(drpSelEnd)}`;
    document.getElementById('dash-sub').textContent = `Orderan ${subLabel}`;
    document.getElementById('dash-info').textContent = `${total} orderan`;
    document.getElementById('dash-info-mobile').textContent = `${total} orderan`;

    document.getElementById('d-total').textContent  = total;
    document.getElementById('d-tunggu').textContent = tunggu;
    document.getElementById('d-kirim').textContent  = kirim;
    document.getElementById('d-hold').textContent   = hold;
    document.getElementById('d-cancel').textContent = cancel;

    renderDashTable(todayOrders);
    renderOrderCards(todayOrders);
  } catch(e) {
    showToast('Gagal load dashboard: ' + e.message, 'error');
  }
}

function renderDashTable(orders) {
  const tbody = document.getElementById('dash-tbody');
  if (!orders.length) {
    tbody.innerHTML = '<tr><td colspan="10" class="empty-state">Belum ada orderan hari ini. Yuk mulai input!</td></tr>';
    return;
  }
  tbody.innerHTML = orders.map((r, i) => {
    const rowClass = r.acc_spv === 'KIRIM' ? 'row-kirim'
      : r.acc_spv === 'HOLD'   ? 'row-hold'
      : r.acc_spv === 'CANCEL' ? 'row-cancel'
      : r.is_dup_today         ? 'row-dup'
      : r.is_rts               ? 'row-rts' : '';

    const valBadge = r.is_dup_today
      ? '<span class="badge badge-dup">DUP HARI INI</span>'
      : r.is_rts
        ? '<span class="badge badge-rts">PERNAH RTS</span>'
        : r.is_dup_all
          ? '<span class="badge badge-dup">DUP ALL</span>'
          : '<span class="badge badge-ok">AMAN</span>';

    const accBadge = !r.acc_spv
      ? '<span class="badge badge-pending">Menunggu</span>'
      : r.acc_spv === 'KIRIM'  ? '<span class="badge badge-kirim">KIRIM</span>'
      : r.acc_spv === 'HOLD'   ? '<span class="badge badge-hold">HOLD</span>'
      : r.acc_spv === 'CANCEL' ? '<span class="badge badge-cancel">CANCEL</span>'
      : r.acc_spv;

    const waktu = new Date(r.created_at).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'});

    return `<tr class="${rowClass}">
      <td style="font-family:var(--mono);color:var(--muted)">${i+1}</td>
      <td style="font-family:var(--mono)">${waktu}</td>
      <td title="${r.nama||''}">${r.nama||'—'}</td>
      <td style="font-family:var(--mono)">${r.hp||'—'}</td>
      <td>${r.jumlah_pesanan||'—'}</td>
      <td>${r.pembayaran||'—'}</td>
      <td style="font-family:var(--mono)">Rp${Number(r.total_pembayaran||0).toLocaleString('id-ID')}</td>
      <td>${valBadge}</td>
      <td>${accBadge}</td>
      <td style="color:var(--muted);font-size:11px" title="${r.noted||''}">${r.noted||'—'}</td>
    </tr>`;
  }).join('');
}

// ── MOBILE: RENDER ORDER CARDS ───────────────────────────────────────────────
function renderOrderCards(orders) {
  const wrap = document.getElementById('order-cards');
  if (!orders.length) {
    wrap.innerHTML = '<div style="text-align:center;padding:2.5rem;color:var(--muted);font-size:13px">Belum ada orderan hari ini.<br>Yuk mulai input! 💪</div>';
    return;
  }
  wrap.innerHTML = orders.map((r, i) => {
    const cardClass = r.acc_spv === 'KIRIM'  ? 'oc-kirim'
      : r.acc_spv === 'HOLD'   ? 'oc-hold'
      : r.acc_spv === 'CANCEL' ? 'oc-cancel'
      : r.is_dup_today         ? 'oc-dup'
      : r.is_rts               ? 'oc-rts' : '';

    const valBadge = r.is_dup_today
      ? '<span class="badge badge-dup">DUP HARI INI</span>'
      : r.is_rts
        ? '<span class="badge badge-rts">PERNAH RTS</span>'
        : r.is_dup_all
          ? '<span class="badge badge-dup">DUP ALL</span>'
          : '<span class="badge badge-ok">AMAN</span>';

    const accBadge = !r.acc_spv
      ? '<span class="badge badge-pending">Menunggu SPV</span>'
      : r.acc_spv === 'KIRIM'  ? '<span class="badge badge-kirim">✓ KIRIM</span>'
      : r.acc_spv === 'HOLD'   ? '<span class="badge badge-hold">⏸ HOLD</span>'
      : r.acc_spv === 'CANCEL' ? '<span class="badge badge-cancel">✕ CANCEL</span>'
      : r.acc_spv;

    const waktu = new Date(r.created_at).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'});
    const total = r.total_pembayaran ? 'Rp'+Number(r.total_pembayaran).toLocaleString('id-ID') : '—';

    return `<div class="order-card ${cardClass}">
      <div class="oc-header">
        <span class="oc-nama">${i+1}. ${r.nama||'—'}</span>
        <span class="oc-waktu">${waktu}</span>
      </div>
      <div class="oc-row">
        <span class="oc-hp">📱 ${r.hp||'—'}</span>
        <span style="color:var(--border-strong)">·</span>
        <span class="oc-jumlah">${r.jumlah_pesanan||'—'}</span>
      </div>
      <div class="oc-row" style="margin-top:2px">
        <span class="oc-total">${total}</span>
        <span style="color:var(--muted);font-size:12px">${r.pembayaran||''}</span>
      </div>
      <div class="oc-footer">
        <span class="oc-noted">${r.noted ? '📝 '+r.noted : ''}</span>
        <div style="display:flex;gap:4px;flex-shrink:0">
          ${valBadge}
          ${accBadge}
        </div>
      </div>
    </div>`;
  }).join('');
}

// ── UPLOAD ORDER ──────────────────────────────────────────────────────────────
async function doParse() {
  const text = document.getElementById('paste-input').value.trim();
  if (!text) { showToast('Paste teks orderan dulu ya.', 'warn'); return; }

  const btn     = document.getElementById('btn-parse');
  const loading = document.getElementById('loading-parse');
  btn.disabled  = true;
  loading.classList.add('show');
  hideValBanner();

  try {
    const res  = await fetch('/api/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    const json = await res.json();

    if (!json.ok) throw new Error(json.error || 'Parse gagal');

    parsedData = json.data;
    fillPreviewForm(parsedData);
    document.getElementById('preview-card').classList.add('show');
    document.getElementById('btn-submit').disabled = false;
    showToast('Parsing berhasil! Periksa hasilnya.', 'success');

    // Scroll ke preview
    document.getElementById('preview-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch(e) {
    showToast('Gagal parse: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    loading.classList.remove('show');
  }
}

function fillPreviewForm(d) {
  const fields = ['no','nama','hp','pembayaran','alamat','kelurahan','kecamatan',
    'kabupaten','provinsi','kodepos','jumlah','quantity','total','instruksi','rincian','keterangan','keluhan'];
  const keys   = ['no','nama','hp','pembayaran','alamat','kelurahan','kecamatan',
    'kabupaten','provinsi','kodepos','jumlah_pesanan','quantity','total_pembayaran',
    'instruksi_pengiriman','rincian_pembayaran','keterangan','keluhan'];
  fields.forEach((f, i) => {
    const el = document.getElementById('f-'+f);
    if (el) el.value = d[keys[i]] || '';
  });
}

function getFormValues() {
  return {
    no                  : val('f-no'),
    nama                : val('f-nama'),
    hp                  : val('f-hp'),
    pembayaran          : val('f-pembayaran'),
    alamat              : val('f-alamat'),
    kelurahan           : val('f-kelurahan'),
    kecamatan           : val('f-kecamatan'),
    kabupaten           : val('f-kabupaten'),
    provinsi            : val('f-provinsi'),
    kodepos             : val('f-kodepos'),
    jumlah_pesanan      : val('f-jumlah'),
    quantity            : val('f-quantity'),
    total_pembayaran    : val('f-total'),
    instruksi_pengiriman: val('f-instruksi'),
    rincian_pembayaran  : val('f-rincian'),
    keterangan          : val('f-keterangan'),
    keluhan             : val('f-keluhan'),
  };
}

function val(id) {
  return (document.getElementById(id)?.value || '').trim();
}

async function doSubmit() {
  const form = getFormValues();
  if (!form.nama && !form.hp) {
    showToast('Minimal nama atau HP harus diisi.', 'warn');
    return;
  }

  const btn     = document.getElementById('btn-submit');
  const loading = document.getElementById('loading-submit');
  btn.disabled  = true;
  loading.classList.add('show');

  try {
    const today   = todayStr();
    const hpNorm  = normalizeHP(form.hp);           // format 08xxx (untuk orderan_masuk)
    const hpDB    = hpNorm.startsWith('0') ? hpNorm.slice(1) : hpNorm; // format 8xxx (untuk all_orderan)
    const profile  = currentProfile;

    // 1. Insert ke orderan_masuk
    const insertRow = {
      ...form,
      cs_id   : currentUser.id,
      cs_nama : profile.nama,
      tanggal : today,
      raw_input: document.getElementById('paste-input').value.trim()
    };

    const { data: inserted, error: insertErr } = await sb
      .from('orderan_masuk').insert(insertRow).select().single();
    if (insertErr) throw insertErr;

    const insertedId = inserted.id;

    // 2. Validasi — semua query parallel
    const kodepos = String(form.kodepos || '').trim().replace(/\.0$/, '');

    const [dupTodayRes, allOrderanRes, kpStatsRes, eksRes] = await Promise.all([
      // Cek dup hari ini (HP sama, hari sama, bukan row ini sendiri)
      hpNorm ? sb.from('orderan_masuk')
        .select('id, nama, cs_nama, created_at')
        .eq('hp', hpNorm)
        .eq('tanggal', today)
        .neq('id', insertedId)
        .limit(5) : Promise.resolve({ data: [] }),

      // Cek dup all team + ambil status_akhir & resi untuk deteksi RTS
      hpDB ? sb.from('all_orderan')
        .select('nama, hp, tanggal, cs, team, status_akhir, resi')
        .eq('hp', hpDB)
        .limit(10) : Promise.resolve({ data: [] }),

      // Cek wilayah rawan dari kodepos_stats
      kodepos ? sb.from('kodepos_stats')
        .select('kodepos, total, retur, pct')
        .eq('kodepos', kodepos)
        .single() : Promise.resolve({ data: null }),

      // Cek rekomendasi ekspedisi dari ekspedisi_rekomendasi
      kodepos ? sb.from('ekspedisi_rekomendasi')
        .select('kodepos, jne_del, jnt_del, ninja_del, lion_del')
        .eq('kodepos', kodepos)
        .single() : Promise.resolve({ data: null }),
    ]);

    const dupToday   = dupTodayRes.data   || [];
    const allOrderan = allOrderanRes.data || [];
    const kpStat     = kpStatsRes.data    || null;
    const eksData    = eksRes.data        || null;

    // Rekomendasi ekspedisi — sama persis logika ValidasiOrder
    const usedEks = extractEkspedisi(form.pembayaran || '');
    let rekEkspedisi = '';
    let eksColor = 'none'; // 'green' | 'yellow' | 'red' | 'none'
    if (eksData) {
      const candidates = [
        { name: 'JNE',   del: eksData.jne_del   || 0 },
        { name: 'JNT',   del: eksData.jnt_del   || 0 },
        { name: 'Ninja', del: eksData.ninja_del || 0 },
        { name: 'Lion',  del: eksData.lion_del  || 0 },
      ].filter(e => e.del > 0).sort((a, b) => b.del - a.del);
      if (candidates.length) {
        rekEkspedisi = candidates.slice(0, 3).map(e => e.name + '(' + Math.round(e.del) + '%)').join(' > ');
        if (usedEks) {
          const rekList  = candidates.map(e => e.name.toLowerCase());
          const topRek   = candidates[0].name.toLowerCase();
          if (!rekList.includes(usedEks.toLowerCase()))          eksColor = 'red';
          else if (topRek !== usedEks.toLowerCase())             eksColor = 'yellow';
          else                                                    eksColor = 'green';
        }
      }
    }
    const isEkspedisiWrong = eksColor === 'red' || eksColor === 'yellow';

    // Wilayah rawan: sama persis ValidasiOrder
    // pct >= 30 → RAWAN TINGGI, pct >= 15 → PERLU DIPERHATIKAN, pct < 15 → aman
    // Flag notif hanya kalau >= 15 (sama dengan filter dashboard ValidasiOrder)
    const kpPct          = kpStat ? (kpStat.pct || Math.round((kpStat.retur / kpStat.total) * 100)) : 0;
    const kpStatus       = kpPct >= 30 ? 'RAWAN TINGGI' : kpPct >= 15 ? 'PERLU DIPERHATIKAN' : 'RELATIF AMAN';
    const isWilayahRawan = kpStat && kpStat.total >= 5 && kpPct >= 15;

    const isDupToday = dupToday.length > 0;
    const isDupAll   = allOrderan.length > 0;

    // RTS: sama persis ValidasiOrder doValidasiHarian()
    // 1. Cek status_akhir → returMatches = order yang pernah retur
    const returMatches = allOrderan.filter(m =>
      (m.status_akhir||'').toLowerCase().includes('retur')
    );
    const isRetur = returMatches.length > 0;

    // 2. Ambil resi untuk cek detail di all_rts
    //    Kalau ada retur → cek resi dari returMatches saja
    //    Kalau tidak ada retur → tetap cek semua resi (jaga-jaga all_rts punya data)
    const checkMatches = isRetur ? returMatches : allOrderan;
    const resiList = checkMatches.map(m => (m.resi||'').trim().toLowerCase()).filter(Boolean);

    let rtsData = [];
    if (resiList.length) {
      const { data: rtsRows } = await sb.from('all_rts')
        .select('resi, bulan, reason, status, pihak')
        .in('resi', resiList)
        .limit(10);
      rtsData = rtsRows || [];
    }

    // 3. isRTSFinal: positif jika retur di status_akhir ATAU resi ditemukan di all_rts
    const isRTSFinal = isRetur || rtsData.length > 0;
    // Fallback: kalau all_rts kosong tapi ada returMatches, pakai returMatches untuk detail
    if (!rtsData.length && isRetur) rtsData = returMatches;

    // Hitung total RTS dari status_akhir — kebijakan: >= 2x wajib Transfer
    const rtsCount        = returMatches.length;
    const isWajibTransfer = isRTSFinal && rtsCount >= 2;

    // 3. Update row dengan hasil validasi
    const valUpdate = {
      is_dup_today      : isDupToday,
      is_dup_all        : isDupAll,
      is_rts            : isRTSFinal,
      is_wajib_transfer : isWajibTransfer  || false,
      is_wilayah_rawan  : isWilayahRawan   || false,
      is_eks_wrong      : isEkspedisiWrong || false,
      dup_detail        : isDupAll         ? allOrderan : null,
      rts_detail        : isRTSFinal       ? rtsData    : null,
      kp_stat           : kpStat           ? { total: kpStat.total, retur: kpStat.retur, pct: kpStat.pct } : null,
      eks_detail        : rekEkspedisi     ? { dipakai: usedEks, rekomendasi: rekEkspedisi, status: eksColor } : null,
    };

    await sb.from('orderan_masuk').update(valUpdate).eq('id', insertedId);

    // 4. Kirim WA notifikasi kalau ada masalah
    const masalah = [];
    if (isDupToday)        masalah.push('⚠️ DUPLIKAT HARI INI — HP ini sudah diinput ' + dupToday.length + 'x hari ini');
    if (isDupAll)          masalah.push('ℹ️ DUPLIKAT ALL TEAM — HP pernah order sebelumnya');
    if (isRTSFinal)        masalah.push('🔴 PERNAH RTS — customer ini pernah retur barang (' + rtsCount + 'x)');
    if (isWajibTransfer)   masalah.push('🚫 WAJIB TRANSFER — customer sudah RTS ' + rtsCount + 'x, tidak boleh COD');
    if (isWilayahRawan)    masalah.push('📍 WILAYAH ' + kpStatus + ' — ' + kpPct + '% RTS (' + kpStat.retur + '/' + kpStat.total + ' order historis)');
    if (isEkspedisiWrong)  masalah.push('🚚 EKSPEDISI ' + (eksColor === 'red' ? 'TIDAK DIREKOMENDASIKAN' : 'BUKAN TERBAIK') + ' — rekomendasi: ' + rekEkspedisi);

    if (masalah.length > 0 && profile.no_wa) {
      const csName = profile.nama || 'CS';

      // Info customer
      const totalRp = form.total_pembayaran
        ? 'Rp' + Number(form.total_pembayaran).toLocaleString('id-ID')
        : '—';
      const produkLine = [form.jumlah_pesanan, form.pembayaran, totalRp]
        .filter(Boolean).join(' / ');

      // Detail per flag
      const flagLines = [];

      if (isDupToday) {
        const detail = dupToday.map(m => {
          const jam = new Date(m.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
          return `   → Sudah diinput oleh ${m.cs_nama||'CS lain'} jam ${jam}`;
        }).join('\n');
        flagLines.push(`⚠️ *DUPLIKAT HARI INI*\n${detail}`);
      }

      if (isDupAll) {
        const detail = allOrderan.slice(0, 3)
          .map(m => `   → Pernah order${m.tanggal ? ' '+m.tanggal : ''}${m.team ? ' ('+m.team+')' : ''}${m.cs ? ' · CS: '+m.cs : ''}`)
          .join('\n') || '   → Data historis ditemukan';
        flagLines.push(`ℹ️ *DUPLIKAT ALL TEAM*\n${detail}`);
      }

      if (isRTSFinal) {
        const detail = rtsData.slice(0, 3).map(m => {
          const alasan = m.reason || '';
          const tgl    = m.bulan  || m.tanggal || '';
          return `   → ${alasan ? 'Alasan: '+alasan : 'Pernah retur'}${tgl ? ' ('+tgl+')' : ''}`;
        }).join('\n') || '   → Riwayat retur ditemukan';
        flagLines.push(`🔴 *PERNAH RTS* (${rtsCount}x)\n${detail}`);
      }

      if (isWajibTransfer) {
        flagLines.push(
          `🚫 *WAJIB TRANSFER*\n` +
          `   → Customer ini sudah RTS ${rtsCount}x\n` +
          `   → Tidak boleh diproses COD, harus Transfer terlebih dahulu`
        );
      }

      if (isWilayahRawan) {
        flagLines.push(
          `📍 *WILAYAH ${kpStatus}*\n` +
          `   → Kode Pos ${kodepos}: ${kpPct}% RTS (${kpStat.retur}/${kpStat.total} order historis)`
        );
      }

      if (isEkspedisiWrong) {
        const eksLabel = eksColor === 'red' ? 'TIDAK DIREKOMENDASIKAN' : 'BUKAN YANG TERBAIK';
        flagLines.push(
          `🚚 *EKSPEDISI ${eksLabel}*\n` +
          `   → Dipakai: ${usedEks || '—'}\n` +
          `   → Rekomendasi: ${rekEkspedisi}`
        );
      }

      const msg =
        `⚠️ *CS Input — Peringatan Order*\n\n` +
        `Halo ${csName} 👋\n` +
        `Order baru kamu ada masalah:\n\n` +
        `👤 Nama  : ${form.nama||'—'}\n` +
        `📱 HP    : ${form.hp||'—'}\n` +
        `📦 Produk: ${produkLine||'—'}\n\n` +
        flagLines.join('\n\n') +
        `\n\nMohon segera konfirmasi ke validator sebelum order dilanjutkan.\nTerima Kasih 🙏`;

      try {
        await fetch('/api/notif', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target: profile.no_wa, message: msg })
        });
        await sb.from('orderan_masuk').update({ wa_notif_sent: true }).eq('id', insertedId);
      } catch(_) { /* WA notif fail, tetap lanjut */ }
    }

    // 5. Tampilkan hasil validasi
    if (masalah.length > 0) {
      showValBanner('warn', '⚠️ Order tersimpan dengan catatan:\n' + masalah.join('\n'));
    } else {
      showValBanner('aman', '✅ Order aman — tidak ada duplikat dan tidak ada riwayat RTS.');
    }

    showToast('Order berhasil disimpan!', 'success');

    // Reset form paste, sembunyikan preview, refresh history
    document.getElementById('paste-input').value = '';
    document.getElementById('preview-card').classList.remove('show');
    parsedData = null;

    await loadHistoryMini();
    await loadDashboard();

  } catch(e) {
    showToast('Gagal submit: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    loading.classList.remove('show');
  }
}

function clearPaste() {
  document.getElementById('paste-input').value = '';
  document.getElementById('preview-card').classList.remove('show');
  hideValBanner();
  parsedData = null;
}

// ── HISTORY MINI (Upload page) ────────────────────────────────────────────────
async function loadHistoryMini() {
  if (!currentUser) return;
  const today = todayStr();
  const { data } = await sb.from('orderan_masuk')
    .select('id, nama, hp, created_at, acc_spv, is_dup_today, is_rts')
    .eq('cs_id', currentUser.id)
    .eq('tanggal', today)
    .order('created_at', { ascending: false })
    .limit(10);

  const list = data || [];
  const card = document.getElementById('history-card');
  const ul   = document.getElementById('history-list');

  if (!list.length) { card.style.display = 'none'; return; }
  card.style.display = 'block';

  ul.innerHTML = list.map(r => {
    const badge = r.acc_spv === 'KIRIM'  ? '<span class="badge badge-kirim">KIRIM</span>'
      : r.acc_spv === 'HOLD'   ? '<span class="badge badge-hold">HOLD</span>'
      : r.acc_spv === 'CANCEL' ? '<span class="badge badge-cancel">CANCEL</span>'
      : r.is_dup_today         ? '<span class="badge badge-dup">DUP</span>'
      : r.is_rts               ? '<span class="badge badge-rts">RTS</span>'
      : '<span class="badge badge-pending">Menunggu</span>';
    const waktu = new Date(r.created_at).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'});
    return `<div class="history-item">
      <span class="h-nama">${r.nama||'—'}</span>
      <span class="h-hp">${r.hp||''}</span>
      ${badge}
      <span class="h-time">${waktu}</span>
    </div>`;
  }).join('');
}

// ── SETTING ───────────────────────────────────────────────────────────────────
async function loadSetting() {
  if (!currentUser || !currentProfile) return;
  document.getElementById('s-nama').value  = currentProfile.nama  || '';
  document.getElementById('s-wa').value    = currentProfile.no_wa || '';
  document.getElementById('s-email').value = currentProfile.email || currentUser.email || '';
  document.getElementById('info-email').textContent = currentProfile.email || currentUser.email || '—';
  const joined = new Date(currentUser.created_at).toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'});
  document.getElementById('info-join').textContent  = joined;

  const { count } = await sb.from('orderan_masuk')
    .select('*', { count:'exact', head:true })
    .eq('cs_id', currentUser.id)
    .eq('tanggal', todayStr());
  document.getElementById('info-today').textContent = (count||0) + ' order';
}

async function saveProfil() {
  const nama = document.getElementById('s-nama').value.trim();
  const wa   = document.getElementById('s-wa').value.trim();
  const statusEl = document.getElementById('profil-status');

  if (!nama) { showStatus(statusEl, 'Nama tidak boleh kosong.', 'error'); return; }

  try {
    await updateProfile(currentUser.id, { nama, no_wa: wa, updated_at: new Date().toISOString() });
    currentProfile.nama  = nama;
    currentProfile.no_wa = wa;
    document.getElementById('user-nama').textContent   = nama;
    document.getElementById('user-avatar').textContent = nama.charAt(0).toUpperCase();
    showStatus(statusEl, '✓ Profil berhasil disimpan.', 'success');
    showToast('Profil disimpan!', 'success');
  } catch(e) {
    showStatus(statusEl, '✗ Gagal: ' + e.message, 'error');
  }
}

async function savePassword() {
  const pass  = document.getElementById('s-pass').value;
  const pass2 = document.getElementById('s-pass2').value;
  const statusEl = document.getElementById('pass-status');

  if (!pass)        { showStatus(statusEl, 'Password baru wajib diisi.', 'error'); return; }
  if (pass.length < 6) { showStatus(statusEl, 'Password minimal 6 karakter.', 'error'); return; }
  if (pass !== pass2)  { showStatus(statusEl, 'Konfirmasi password tidak cocok.', 'error'); return; }

  try {
    const { error } = await sb.auth.updateUser({ password: pass });
    if (error) throw error;
    document.getElementById('s-pass').value  = '';
    document.getElementById('s-pass2').value = '';
    showStatus(statusEl, '✓ Password berhasil diganti.', 'success');
    showToast('Password diperbarui!', 'success');
  } catch(e) {
    showStatus(statusEl, '✗ Gagal: ' + e.message, 'error');
  }
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function extractEkspedisi(pembayaran) {
  if (!pembayaran) return '';
  const p = String(pembayaran).toUpperCase();
  const list = ['SICEPAT','ANTERAJA','NINJA','LION','TIKI','SAP','IDX','JNE','JNT','SCP','POS'];
  for (const eks of list) {
    if (p.includes(eks)) {
      if (eks === 'SCP' || eks === 'SICEPAT') return 'SiCepat';
      if (eks === 'ANTERAJA') return 'Anteraja';
      if (eks === 'NINJA')    return 'Ninja';
      if (eks === 'LION')     return 'Lion';
      if (eks === 'POS')      return 'POS Indonesia';
      return eks; // JNE, JNT, TIKI, SAP, IDX
    }
  }
  return '';
}

function todayStr() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }); // format YYYY-MM-DD WIB
}

function showValBanner(type, msg) {
  const el = document.getElementById('val-banner');
  el.className = 'val-banner show';
  if (type === 'aman') el.classList.add('val-aman');
  else if (type === 'warn') el.classList.add('val-warn');
  else el.classList.add('val-danger');
  el.textContent = msg;
}

function hideValBanner() {
  const el = document.getElementById('val-banner');
  if (el) el.classList.remove('show','val-aman','val-warn','val-danger');
}

function showStatus(el, msg, type) {
  el.textContent   = msg;
  el.style.display = 'block';
  el.style.color   = type === 'success' ? 'var(--success)' : 'var(--danger)';
  setTimeout(() => { el.style.display = 'none'; }, 4000);
}

function showToast(msg, type = 'info') {
  let wrap = document.getElementById('toast-wrap');
  const t  = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  wrap.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}
