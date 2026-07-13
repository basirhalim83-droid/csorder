// Proxy Cek Ongkir — pakai Public API Mengantar (gak butuh API key asli,
// {API_KEY} di /address/search cuma legacy path, bebas string apa aja).
const BASE_URL  = 'https://api-public.mengantar.com';
const ORIGIN_ID = '5fc63315f8f44b34aa4c44c4'; // Gudang: Galur, Kulon Progo, DI Yogyakarta

// key = kode ekspedisi yang dipakai di app (EKSPEDISI_LIST js/app.js),
// value = key kurir di response allEstimatePublic
const COURIER_MAP = {
  JNE:       'JNE',
  JNT:       'JT',
  SICEPAT:   'SiCepat',
  ANTERAJA:  'anteraja',
  NINJA:     'Ninja',
  LION:      'lion',
  POS:       'pos',
  SAP:       'SAP',
  IDEXPRESS: 'iDexpress',
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const keyword = (req.query.keyword || '').trim();
  const weight  = parseFloat(req.query.weight) || 1;
  if (!keyword) return res.status(400).json({ error: 'keyword wajib diisi' });

  try {
    const searchR = await fetch(
      `${BASE_URL}/api/public/csorder/address/search?keyword=${encodeURIComponent(keyword)}`,
      { headers: { Accept: 'application/json' } }
    );
    const searchJson = await searchR.json();
    const dest = searchJson?.data?.[0];
    if (!dest) return res.status(200).json({ ok: false, reason: 'Alamat tujuan tidak ditemukan' });

    const estR = await fetch(
      `${BASE_URL}/api/order/allEstimatePublic?origin_id=${ORIGIN_ID}&destination_id=${dest._id}&weight=${weight}`,
      { headers: { Accept: 'application/json' } }
    );
    const estJson = await estR.json();
    if (!estJson?.success) return res.status(200).json({ ok: false, reason: 'Gagal ambil estimasi ongkir' });

    const couriers = Object.entries(COURIER_MAP).map(([key, apiKey]) => {
      const d = estJson.data?.[apiKey];
      if (!d) return { key, unsupported: true };
      return {
        key,
        price: d.price,
        unsupported: !!d.unsupported,
        estimate_delivery: d.estimate_delivery || d.estimatedDate || '',
      };
    });

    return res.status(200).json({
      ok: true,
      destination: {
        kecamatan: dest.DISTRICT_NAME,
        kabupaten: dest.CITY_NAME,
        provinsi:  dest.PROVINCE_NAME,
      },
      couriers,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
