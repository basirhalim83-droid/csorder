// ── STATE ─────────────────────────────────────────────────────────────────────
let currentUser   = null;
let currentProfile = null;
let parsedData    = null;   // hasil AI parsing
let todayOrders   = [];     // orderan hari ini milik CS ini

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
  const today = todayStr();
  try {
    const { data, error } = await sb.from('orderan_masuk')
      .select('*')
      .eq('cs_id', currentUser.id)
      .eq('tanggal', today)
      .order('created_at', { ascending: false });

    if (error) throw error;
    todayOrders = data || [];

    const total  = todayOrders.length;
    const tunggu = todayOrders.filter(r => !r.acc_spv).length;
    const kirim  = todayOrders.filter(r => r.acc_spv === 'KIRIM').length;
    const hold   = todayOrders.filter(r => r.acc_spv === 'HOLD').length;
    const cancel = todayOrders.filter(r => r.acc_spv === 'CANCEL').length;

    document.getElementById('d-total').textContent  = total;
    document.getElementById('d-tunggu').textContent = tunggu;
    document.getElementById('d-kirim').textContent  = kirim;
    document.getElementById('d-hold').textContent   = hold;
    document.getElementById('d-cancel').textContent = cancel;
    document.getElementById('dash-sub').textContent = `Orderan kamu hari ini — ${new Date().toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'})}`;
    document.getElementById('dash-info').textContent = `${total} orderan`;
    document.getElementById('dash-info-mobile').textContent = `${total} orderan hari ini`;

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
    const hpNorm  = normalizeHP(form.hp);
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

    // 2. Validasi — dupToday & allOrderan parallel
    const [dupTodayRes, allOrderanRes] = await Promise.all([
      // Cek dup hari ini (HP sama, hari sama, bukan row ini sendiri)
      hpNorm ? sb.from('orderan_masuk')
        .select('id, nama, cs_nama, created_at')
        .eq('hp', hpNorm)
        .eq('tanggal', today)
        .neq('id', insertedId)
        .limit(5) : Promise.resolve({ data: [] }),

      // Cek dup all team + ambil status_akhir & resi untuk deteksi RTS
      hpNorm ? sb.from('all_orderan')
        .select('nama, hp, tanggal, cs, team, status_akhir, resi')
        .eq('hp', hpNorm)
        .limit(10) : Promise.resolve({ data: [] }),
    ]);

    const dupToday   = dupTodayRes.data   || [];
    const allOrderan = allOrderanRes.data || [];

    const isDupToday = dupToday.length > 0;
    const isDupAll   = allOrderan.length > 0;

    // RTS: cek status_akhir mengandung kata 'retur' (sama persis dengan ValidasiOrder)
    const returMatches = allOrderan.filter(m =>
      m.status_akhir && m.status_akhir.toLowerCase().includes('retur')
    );
    const isRTS = returMatches.length > 0;

    // Kalau ada retur → ambil detail dari all_rts via resi
    let rtsData = [];
    if (isRTS) {
      const resiList = returMatches.map(m => m.resi).filter(Boolean);
      if (resiList.length) {
        const { data: rtsRows } = await sb.from('all_rts')
          .select('resi, nama, hp, alasan, tanggal')
          .in('resi', resiList)
          .limit(5);
        rtsData = rtsRows || [];
      }
      // Fallback kalau all_rts kosong, pakai data dari all_orderan
      if (!rtsData.length) rtsData = returMatches;
    }

    const dupAll = allOrderan.filter(m =>
      !m.status_akhir || !m.status_akhir.toLowerCase().includes('retur')
    );

    // 3. Update row dengan hasil validasi
    const valUpdate = {
      is_dup_today: isDupToday,
      is_dup_all  : isDupAll,
      is_rts      : isRTS,
      dup_detail  : isDupAll ? allOrderan : null,
      rts_detail  : isRTS ? rtsData : null,
    };

    await sb.from('orderan_masuk').update(valUpdate).eq('id', insertedId);

    // 4. Kirim WA notifikasi kalau ada masalah
    const masalah = [];
    if (isDupToday) masalah.push('⚠️ DUPLIKAT HARI INI — HP ini sudah diinput ' + dupToday.length + 'x hari ini');
    if (isDupAll)   masalah.push('ℹ️ DUPLIKAT ALL TEAM — HP pernah order sebelumnya');
    if (isRTS)      masalah.push('🔴 PERNAH RTS — customer ini pernah retur barang');

    if (masalah.length > 0 && profile.no_wa) {
      const msg = `⚠️ *Notifikasi ValidasiOrder*\n\nHalo ${profile.nama} 👋\n\nOrder yang baru kamu input terdeteksi masalah:\n\n👤 *Nama:* ${form.nama}\n📱 *HP:* ${form.hp}\n\n${masalah.join('\n')}\n\nMohon konfirmasi ke SPV sebelum order dilanjutkan ya!`;
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
function todayStr() {
  return new Date().toISOString().split('T')[0];
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
