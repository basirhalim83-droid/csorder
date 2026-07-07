const { trackShipment, trackPos } = require('../lib/mengantar');

const COURIER_MAP = {
  'JNE':'JNE','JNT':'JT','SICEPAT':'SiCepat','LION':'lion',
  'SAP':'SAP','ANTERAJA':'anteraja','NINJA':'Ninja','IDEXPRESS':'iDexpress'
};

// Sama daftar dengan EKSPEDISI_LIST di js/app.js — disinkron manual (tidak ada build step)
const EKSPEDISI_LIST = [
  { key: 'JNE',      pattern: /\bJNE\b/i },
  { key: 'JNT',      pattern: /\bJ[&\+]?T\b|JALUR\s*NUGRAHA/i },
  { key: 'SICEPAT',  pattern: /\bSICEPAT\b|\bSICE\b/i },
  { key: 'ANTERAJA', pattern: /\bANTERAJA\b|\bANTER\b/i },
  { key: 'NINJA',    pattern: /\bNINJA\b/i },
  { key: 'SAP',      pattern: /\bSAP\b/i },
  { key: 'LION',     pattern: /\bLION\b/i },
  { key: 'TIKI',     pattern: /\bTIKI\b/i },
  { key: 'POS',      pattern: /\bPOS\s*INDONESIA\b|\bPOS\b/i },
  { key: 'REX',      pattern: /\bREX\b/i },
  { key: 'IDEXPRESS',pattern: /\bID\s*EXPRESS\b|\bIDEX\b/i },
  { key: 'GRAB',     pattern: /\bGRAB\b/i },
  { key: 'GOJEK',    pattern: /\bGOJEK\b|\bGOSEND\b/i },
];

function extractEkspedisi(text) {
  if (!text) return null;
  for (const e of EKSPEDISI_LIST) {
    if (e.pattern.test(text)) return e.key;
  }
  return null;
}

const ROWS_PER_RUN = 300; // batasi per invocation biar tidak kena timeout serverless
const CONCURRENCY = 8;

// Sinyal "bermasalah" terstruktur per kurir (bukan tebak kata) — disinkronkan manual dengan js/app.js:
// - JNE (via Mengantar): history[].type.group === 'UNDELIVERED' atau type.tag === 'actionRequired'
// - POS Indonesia: history[].reason_delivery terisi
// Kurir lain (J&T dkk) belum expose field terstruktur di Mengantar, jadi fallback ke keyword.
const RETUR_PATTERN   = /retur|dikembalikan|\brts\b|\brto\b|return to sender/i;
const PROBLEM_PATTERN = /gagal|kendala|bermasalah|problematic|tidak ditemukan|alamat tidak (lengkap|dikenal)|tidak ada orang|tidak ditempat|tidak dihuni|menunggu konfirmasi|disimpan di gudang|ditolak|pindah alamat|box undel/i;

// Pola buat hitung step tertinggi yang PERNAH tercapai di seluruh history — disinkronkan manual
// dengan js/app.js. Dipakai supaya resi Bermasalah/Retur nampilin posisi stepper yang beneran
// tercapai (misal OTW), bukan mentok di step tetap, walau status akhirnya gagal.
const OTW_PATTERN         = /sedang diantar|dalam pengantaran|out for delivery|kurir menuju|\botw\b|akan dikirim ke alamat penerima|with delivery courier|delivery courier|diantar ke alamat|on delivery|1st attempt|2nd attempt|percobaan/i;
const KOTA_TUJUAN_PATTERN = /kota tujuan|gudang tujuan|tiba di kota|received at destination|received at warehouse|process and forward|inbound|sti-dest/i;

function computeProgressStep(entries) {
  let step = 2; // resi sudah discan sistem kurir minimal = Dikirim
  (entries || []).forEach(e => {
    const d = (e.desc || '').toLowerCase();
    if (OTW_PATTERN.test(d)) step = Math.max(step, 4);
    else if (KOTA_TUJUAN_PATTERN.test(d)) step = Math.max(step, 3);
  });
  return step;
}

// Heuristik best-effort dari sinyal terstruktur + teks history kurir Indonesia — tuning lanjutan
// kemungkinan masih perlu setelah lihat lebih banyak sampel data asli.
// Return { stage, step } — step = posisi tertinggi di stepper 5 tahap yang pernah tercapai.
function mapTrackingStage({ resi, statusCategory, entries }) {
  if (!resi) return { stage: 'MENUNGGU_RESI', step: 1 };
  const cat = (statusCategory || '').toUpperCase();
  const arr = Array.isArray(entries) ? entries : [];
  const latest = arr.length ? arr[arr.length - 1] : null;
  const latestDesc = (latest && latest.desc || '').toLowerCase();
  const reachedStep = computeProgressStep(arr);

  let stage;
  if (cat.includes('RETUR') || cat.includes('RETURN') || arr.some(e => RETUR_PATTERN.test(e.desc || ''))) {
    stage = 'RETUR';
  } else if (cat === 'DELIVERED' || /diterima oleh|delivered|\bpod\b/.test(latestDesc)) {
    stage = 'SAMPAI';
  } else {
    const hasStructuredProblem = arr.some(e => e.group === 'UNDELIVERED' || e.tag === 'actionRequired' || !!e.reasonDelivery);
    if (hasStructuredProblem || arr.some(e => PROBLEM_PATTERN.test(e.desc || ''))) {
      stage = 'BERMASALAH';
    } else if (reachedStep >= 4) {
      stage = 'OTW';
    } else if (reachedStep >= 3) {
      stage = 'KOTA_TUJUAN';
    } else {
      stage = 'DIKIRIM';
    }
  }
  return { stage, step: stage === 'SAMPAI' ? 5 : reachedStep };
}

function normalizeMengantar(json) {
  if (!json || !json.success || !json.data) return null;
  const d = json.data;
  const history = Array.isArray(d.history) ? d.history : [];
  // Gabung desc + code — beberapa kurir (Lion: "STI-DEST"/"POD"/"DEL") taruh sinyal penting di code, bukan desc
  const entries = history.map(h => ({
    desc: [h.desc, h.code].filter(Boolean).join(' '),
    group: (h.type && h.type.group) || null,
    tag: (h.type && h.type.tag) || null,
    reasonDelivery: null
  }));
  return {
    statusCategory: d.statusCategory || d.status || '',
    entries,
    detail: { history, receiver: d.RECEIVER_NAME || null, city: d.RECEIVER_CITY || null }
  };
}

function normalizePos(json) {
  if (!json || !json.success || !json.data) return null;
  const d = json.data;
  const history = Array.isArray(d.connote_history) ? d.connote_history : [];
  const entries = history.map(h => ({
    desc: [h.content, h.content2].filter(Boolean).join(' '),
    group: null, tag: null,
    reasonDelivery: h.reason_delivery || null
  }));
  return {
    statusCategory: d.connote_state || '',
    entries,
    detail: { history, receiver: d.connote_receiver_name || null, city: null }
  };
}

async function checkOneResi(resi, ekspedisi) {
  const eks = (ekspedisi || '').toUpperCase();
  try {
    let normalized;
    if (eks === 'POS' || eks.includes('POS')) {
      normalized = normalizePos(await trackPos(resi));
    } else {
      const courier = COURIER_MAP[ekspedisi] || COURIER_MAP[eks] || ekspedisi;
      if (!courier) return null;
      normalized = normalizeMengantar(await trackShipment(resi, courier));
    }
    if (!normalized) return null;
    const { stage, step } = mapTrackingStage({ resi, ...normalized });
    return { stage, step, detail: normalized.detail };
  } catch (e) {
    return null;
  }
}

module.exports = async function handler(req, res) {
  const secret = req.query.secret || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const sbHeaders = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json'
  };

  let checked = 0, updated = 0, errors = 0;

  try {
    // 1. Ambil kandidat resi dari all_orderan (order masuk lewat csorder-main)
    const candFilter = new URLSearchParams({
      select: 'resi,pembayaran',
      sumber: 'eq.cs_input',
      resi: 'not.is.null',
      order: 'id',
      limit: String(ROWS_PER_RUN)
    });
    const candRes = await fetch(`${SUPABASE_URL}/rest/v1/all_orderan?${candFilter.toString()}`, { headers: sbHeaders });
    const candidates = await candRes.json();
    if (!Array.isArray(candidates)) throw new Error('Gagal ambil data all_orderan: ' + JSON.stringify(candidates));

    // Dedup by resi, derive ekspedisi dari pembayaran
    const byResi = {};
    candidates.forEach(c => {
      const resi = (c.resi || '').trim();
      if (!resi || byResi[resi]) return;
      byResi[resi] = extractEkspedisi(c.pembayaran || '');
    });
    const resiList = Object.keys(byResi);
    if (!resiList.length) {
      res.status(200).json({ checked, updated, errors, rows_this_run: 0 });
      return;
    }

    // 2. Ambil status existing, skip yang udah final
    const existFilter = new URLSearchParams({
      select: 'resi,status_resi',
      resi: `in.(${resiList.map(r => `"${r.replace(/"/g,'')}"`).join(',')})`
    });
    const existRes = await fetch(`${SUPABASE_URL}/rest/v1/cs_order_tracking?${existFilter.toString()}`, { headers: sbHeaders });
    const existing = await existRes.json();
    const finalSet = new Set(
      (Array.isArray(existing) ? existing : [])
        .filter(r => r.status_resi === 'SAMPAI' || r.status_resi === 'RETUR')
        .map(r => r.resi)
    );

    const targets = resiList.filter(r => !finalSet.has(r));

    for (let i = 0; i < targets.length; i += CONCURRENCY) {
      const batch = targets.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(async resi => {
        try {
          checked++;
          const ekspedisi = byResi[resi];
          const result = await checkOneResi(resi, ekspedisi);
          if (!result) return;
          await fetch(`${SUPABASE_URL}/rest/v1/cs_order_tracking?on_conflict=resi`, {
            method: 'POST',
            headers: { ...sbHeaders, Prefer: 'resolution=merge-duplicates,return=minimal' },
            body: JSON.stringify({
              resi,
              ekspedisi,
              status_resi: result.stage,
              status_resi_step: result.step,
              status_resi_updated_at: new Date().toISOString(),
              status_resi_detail: result.detail
            })
          });
          updated++;
        } catch (e) {
          errors++;
        }
      }));
    }

    res.status(200).json({ checked, updated, errors, rows_this_run: targets.length });
  } catch (e) {
    res.status(500).json({ error: e.message, checked, updated, errors });
  }
};
