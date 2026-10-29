// POST /api/tracking-status
// Input : { resi: ['resi1', 'resi2', ...] }
// Output: [{ resi, status_resi, status_resi_step, status_resi_updated_at, status_resi_detail, ekspedisi }]
//
// Proxy ke akuisisi_orders di Akuisisi Tracking Supabase.
// CS Input tidak perlu webhook sendiri — Mengantar sudah push ke Akuisisi,
// kita tinggal baca statusnya dari sana.

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { resi } = req.body || {};
  if (!Array.isArray(resi) || !resi.length) return res.status(200).json([]);

  const AKUISISI_URL = process.env.AKUISISI_SUPABASE_URL;
  const AKUISISI_KEY = process.env.AKUISISI_SERVICE_KEY;

  if (!AKUISISI_URL || !AKUISISI_KEY) {
    return res.status(500).json({ error: 'AKUISISI_SUPABASE_URL / AKUISISI_SERVICE_KEY belum di-set di Vercel env' });
  }

  const headers = {
    apikey: AKUISISI_KEY,
    Authorization: `Bearer ${AKUISISI_KEY}`,
    'Content-Type': 'application/json',
  };

  const CHUNK = 500;
  const trackMap = {};
  const rwMap    = {};

  // 1. Query akuisisi_orders — status resi per resi
  for (let i = 0; i < resi.length; i += CHUNK) {
    const chunk    = resi.slice(i, i + CHUNK);
    const inFilter = chunk.map(r => `"${String(r).replace(/"/g, '')}"`).join(',');
    const url = `${AKUISISI_URL}/rest/v1/akuisisi_orders`
      + `?select=id,status_resi,status_resi_step,status_resi_updated_at,status_resi_detail,ekspedisi`
      + `&id=in.(${inFilter})`;
    try {
      const r = await fetch(url, { headers });
      if (r.ok) {
        const data = await r.json();
        (Array.isArray(data) ? data : []).forEach(t => { trackMap[t.id] = t; });
      }
    } catch (_) {}
  }

  // 2. Query room_work — data FU otomatis per resi
  for (let i = 0; i < resi.length; i += CHUNK) {
    const chunk    = resi.slice(i, i + CHUNK);
    const inFilter = chunk.map(r => `"${String(r).replace(/"/g, '')}"`).join(',');
    const url = `${AKUISISI_URL}/rest/v1/room_work`
      + `?select=resi,fu_count,fu_info_at,fu_1_at,fu_2_at,fu_3_at,cs_responded,cs_responded_at,lapor_ekspedisi,lapor_ekspedisi_at`
      + `&resi=in.(${inFilter})`;
    try {
      const r = await fetch(url, { headers });
      if (r.ok) {
        const data = await r.json();
        (Array.isArray(data) ? data : []).forEach(t => { rwMap[t.resi] = t; });
      }
    } catch (_) {}
  }

  // 3. Merge dan return
  const results = resi
    .filter(id => trackMap[id] || rwMap[id])
    .map(id => {
      const t = trackMap[id] || {};
      return {
        resi:                    id,
        ekspedisi:               t.ekspedisi               || null,
        status_resi:             t.status_resi             || null,
        status_resi_step:        t.status_resi_step        || null,
        status_resi_updated_at:  t.status_resi_updated_at  || null,
        status_resi_detail:      t.status_resi_detail      || null,
        _rw:                     rwMap[id]                 || null,
      };
    });

  res.status(200).json(results);
};
