// Kirim WA via Fonnte — dipakai api/notif.js (notif manual dari flow submit order)
// dan api/cron-check-resi.js (notif otomatis pas resi berubah jadi Bermasalah/Retur)
async function sendFonnteWA(supaUrl, supaKey, targetWA, message) {
  let noWA = String(targetWA).replace(/\D/g, '');
  if (noWA.startsWith('0')) noWA = '62' + noWA.slice(1);
  if (!noWA.startsWith('62')) noWA = '62' + noWA;

  let fontteKey = process.env.FONNTE_KEY || '';
  let device    = '';

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
        fontteKey = list[0].api_key || fontteKey;
        device    = list[0].device  || '';
      }
    } catch (_) {
      // Supabase gagal → pakai env fallback, tetap lanjut
    }
  }

  if (!fontteKey) throw new Error('Fonnte key belum dikonfigurasi. Tambahkan di Admin → Fonnte atau set FONNTE_KEY di env Vercel.');

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

  return response.json();
}

module.exports = { sendFonnteWA };
