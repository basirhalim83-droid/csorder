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

  const FONNTE_KEY = process.env.FONNTE_KEY;
  if (!FONNTE_KEY) {
    return res.status(500).json({ error: 'Fonnte key belum dikonfigurasi di environment' });
  }

  // Bersihkan nomor WA — pastikan format tanpa + dan tanpa leading 0
  let noWA = String(target).replace(/\D/g, '');
  if (noWA.startsWith('0')) noWA = '62' + noWA.slice(1);
  if (!noWA.startsWith('62')) noWA = '62' + noWA;

  try {
    const response = await fetch('https://api.fonnte.com/send', {
      method: 'POST',
      headers: {
        'Authorization': FONNTE_KEY,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        target: noWA,
        message,
        countryCode: '62'
      })
    });

    const data = await response.json();
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
