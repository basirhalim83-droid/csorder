// GET /api/bermasalah
// Ambil semua resi BERMASALAH dari akuisisi_orders + room_work.
// Tidak perlu kirim resi list — langsung filter status='BERMASALAH' di server.
// Paginate akuisisi_orders agar tidak ada yang terpotong (limit=1000/page).

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const AKUISISI_URL = process.env.AKUISISI_SUPABASE_URL;
  const AKUISISI_KEY = process.env.AKUISISI_SERVICE_KEY;
  if (!AKUISISI_URL || !AKUISISI_KEY) {
    return res.status(500).json({ error: 'AKUISISI_SUPABASE_URL / AKUISISI_SERVICE_KEY belum di-set' });
  }

  const headers = { apikey: AKUISISI_KEY, Authorization: `Bearer ${AKUISISI_KEY}` };

  // 1. Ambil SEMUA resi BERMASALAH dari akuisisi_orders — paginate agar tidak terpotong
  let trackData = [];
  const PAGE = 1000;
  let offset = 0;
  while (true) {
    try {
      const r = await fetch(
        `${AKUISISI_URL}/rest/v1/akuisisi_orders`
        + `?select=id,status_resi,status_resi_step,status_resi_updated_at,status_resi_detail,ekspedisi`
        + `&status_resi=eq.BERMASALAH`
        + `&order=status_resi_updated_at.desc`
        + `&limit=${PAGE}&offset=${offset}`,
        { headers }
      );
      if (!r.ok) break;
      const page = await r.json();
      if (!Array.isArray(page) || !page.length) break;
      trackData = trackData.concat(page);
      if (page.length < PAGE) break;
      offset += PAGE;
    } catch(_) { break; }
  }

  if (!trackData.length) return res.status(200).json([]);

  // 2. Ambil room_work untuk resi BERMASALAH tersebut (paralel per chunk 500)
  const resiList = trackData.map(t => t.id);
  const rwMap    = {};
  const CHUNK    = 500;

  await Promise.all(
    Array.from({ length: Math.ceil(resiList.length / CHUNK) }, (_, i) =>
      resiList.slice(i * CHUNK, (i + 1) * CHUNK)
    ).map(async chunk => {
      const inFilter = chunk.map(r => `"${String(r).replace(/"/g, '')}"`).join(',');
      try {
        const r = await fetch(
          `${AKUISISI_URL}/rest/v1/room_work`
          + `?select=resi,order_date,cs_nama,nama_pembeli,hp_pembeli,kota_tujuan,ekspedisi,produk,case_undel,fu_count,fu_info_at,fu_1_at,fu_2_at,fu_3_at,cs_responded,cs_responded_at,lapor_ekspedisi,lapor_ekspedisi_at`
          + `&resi=in.(${inFilter})`,
          { headers }
        );
        if (r.ok) {
          const data = await r.json();
          (Array.isArray(data) ? data : []).forEach(t => { rwMap[t.resi] = t; });
        }
      } catch(_) {}
    })
  );

  // 3. Merge dan return
  const results = trackData.map(t => ({
    resi:                   t.id,
    ekspedisi:              t.ekspedisi              || null,
    status_resi:            t.status_resi            || null,
    status_resi_step:       t.status_resi_step       || null,
    status_resi_updated_at: t.status_resi_updated_at || null,
    status_resi_detail:     t.status_resi_detail     || null,
    _rw:                    rwMap[t.id]              || null,
  }));

  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json(results);
};
