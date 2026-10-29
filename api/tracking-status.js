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
  const results = [];

  for (let i = 0; i < resi.length; i += CHUNK) {
    const chunk = resi.slice(i, i + CHUNK);
    const inFilter = chunk.map(r => `"${String(r).replace(/"/g, '')}"`).join(',');
    const url = `${AKUISISI_URL}/rest/v1/akuisisi_orders`
      + `?select=id,status_resi,status_resi_step,status_resi_updated_at,status_resi_detail,ekspedisi`
      + `&id=in.(${inFilter})`;

    try {
      const r = await fetch(url, { headers });
      if (r.ok) {
        const data = await r.json();
        (Array.isArray(data) ? data : []).forEach(t => {
          results.push({
            resi: t.id,
            ekspedisi: t.ekspedisi || null,
            status_resi: t.status_resi || null,
            status_resi_step: t.status_resi_step || null,
            status_resi_updated_at: t.status_resi_updated_at || null,
            status_resi_detail: t.status_resi_detail || null,
          });
        });
      }
    } catch (_) {
      // skip chunk yang gagal, jangan block seluruh response
    }
  }

  res.status(200).json(results);
};
