module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const { target, message } = req.body || {};
  if (!target || !message) {
    return res.status(400).json({ error: 'target dan message wajib diisi' });
  }

  // Bersihkan nomor WA
  let noWA = String(target).replace(/\D/g, '');
  if (noWA.startsWith('0')) noWA = '62' + noWA.slice(1);
  if (!noWA.startsWith('62')) noWA = '62' + noWA;

  // Ambil config Fonnte aktif dari Supabase
  // Fallback ke FONNTE_KEY env jika Supabase tidak dikonfigurasi
  let fontteKey = process.env.FONNTE_KEY || '';
  let device    = '';

  const supaUrl = process.env.SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_KEY;

  if (supaUrl && supaKey) {
    try {
      const r = await fetch(
        `${supaUrl}/rest/v1/fonnte_config?is_active=eq.true&order=created_at.asc&limit=1`,
        {
          headers: {
            'apikey'        : supaKey,
            'Authorization' : `Bearer ${supaKey}`
          }
        }
      );
      const list = await r.json();
      if (Array.isArray(list) && list.length > 0) {
        fontteKey = list[0].api_key  || fontteKey;
        device    = list[0].device   || '';
      }
    } catch (_) {
      // Supabase gagal → pakai env fallback, tetap lanjut
    }
  }

  if (!fontteKey) {
    return res.status(500).json({ error: 'Fonnte key belum dikonfigurasi. Tambahkan di Admin → Fonnte atau set FONNTE_KEY di env Vercel.' });
  }

  try {
    const params = new URLSearchParams({ target: noWA, message, countryCode: '62' });
    if (device) params.set('device', device);

    const response = await fetch('https://api.fonnte.com/send', {
      method : 'POST',
      headers: {
        'Authorization': fontteKey,
        'Content-Type' : 'application/x-www-form-urlencoded'
      },
      body: params
    });

    const data = await response.json();
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
