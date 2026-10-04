# bank.ide.konten V9.1 — Online + AI

## Yang berubah
V9 lokal -> V9.1:
- Konten disimpan di Cloudflare D1, bukan localStorage.
- Generate Script memakai Gemini API melalui Cloudflare Worker.
- Generate Visual Prompt memakai Gemini API melalui Worker.
- Frontend tetap mobile-first.
- API key tidak diletakkan di browser.

## Struktur
- `public/` = website
- `src/index.js` = backend Worker/API
- `schema.sql` = tabel D1
- `wrangler.toml` = konfigurasi Worker + D1

## Deploy
V9.1 menggunakan Cloudflare Workers Static Assets + D1. Cloudflare mendukung Worker dan static assets dalam satu deployment, dan D1 diakses melalui binding Worker.

### 1. Buat/siapkan project Worker
Gunakan Wrangler dari folder ini:
`npx wrangler deploy`

Jika D1 belum dibuat, buat:
`npx wrangler d1 create bank-ide-konten-v91`
Lalu masukkan database_id yang diberikan ke `wrangler.toml` bila diperlukan.

### 2. Buat tabel
`npx wrangler d1 execute bank-ide-konten-v91 --remote --file=schema.sql`

### 3. Pasang Gemini secret
Jangan masukkan API key ke `public/app.js`.
Pasang sebagai Worker Secret:
`npx wrangler secret put GEMINI_API_KEY`

Kemudian paste API key Gemini ketika diminta.

Google saat ini merekomendasikan menjaga Gemini API key di server-side dan tidak mengeksposnya di client. V9.1 mengikuti pola itu.

### 4. Deploy
`npx wrangler deploy`

## Catatan keamanan
V9.1 adalah prototype. Endpoint AI belum memiliki login/multi-user dan rate limit produksi. Jangan membagikan URL publik secara luas sebelum V10/auth dan proteksi penggunaan ditambahkan.

## Model
Backend memakai endpoint Gemini generateContent dengan model `gemini-3.8-flash` pada template ini. Jika model yang tersedia pada project berubah, ganti konstanta model di `src/index.js`.

## Tes
1. Buka URL Worker.
2. Isi judul, niche, target.
3. Tekan GENERATE SCRIPT.
4. Tekan GENERATE VISUAL.
5. Tekan SIMPAN KE DATABASE.
6. Refresh.
7. Pastikan konten tetap ada.
8. Pindahkan status sampai SELESAI.
9. Buka `/api/health` untuk melihat status AI/database.
