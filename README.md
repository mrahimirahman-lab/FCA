# FCA — Pemeriksaan Bangunan

Aplikasi web Bahasa Melayu untuk pelan lantai, daftar aset ruang, pemeriksaan kerosakan dan laporan. Versi awal untuk satu pemeriksa pada satu pelayan tempatan.

## Jalankan

Prasyarat: Node.js 22.13+ (disahkan dengan Node 24) dan npm.

Untuk menggunakan pada komputer sendiri tanpa Render, ikuti [LOCAL.md](LOCAL.md). Muat turun kod melalui **Code → Download ZIP** di GitHub, ekstrak, dan buka terminal dalam folder yang mengandungi `package.json`:

```text
npm ci --include=dev
npm run build
npm start
```

Pada penggunaan seterusnya, cukup jalankan `npm start`. Hentikan dengan Ctrl+C; rekod dan gambar yang telah disimpan kekal dalam `data/`.

Untuk pembangunan dalam persekitaran Codex:

```bash
cd /workspace/FCA
npm ci --cache /workspace/.npm-cache
npm run dev
```

Vite berjalan pada port 5173 dan API pada port 3001. Untuk binaan produksi tempatan:

```bash
npm run build
npm start
```

API dan binaan web dilayan pada port 3001, terikat kepada `127.0.0.1`. Semak kesediaan dengan `curl -f http://127.0.0.1:3001/api/health`.

## Aliran kerja

1. Cipta projek untuk satu bangunan dan aras. Pasangan kod bangunan–aras mestilah unik.
2. Muat naik PDF atau imej. Bagi PDF, pilih halaman yang mewakili aras tersebut **sebelum** menambah ruang. Satu projek menggunakan satu halaman pelan; cipta projek aras lain untuk halaman lain.
3. Tambah ruang dengan klik pada pelan, atau analisis dengan AI dan import cadangan. Edit nama, sempadan peratus dan pengesahan ruang.
4. Pilih ruang, ambil atau muat naik foto, isi dapatan secara manual atau gunakan analisis AI. Semak jenis kerosakan, deskripsi, keutamaan dan remedial work.
5. Masukkan nama pemeriksa dan sahkan rekod. Rekod boleh disimpan sebagai draf dan diedit kemudian melalui laporan.
6. Tapis rekod, eksport CSV atau gunakan Cetak / PDF untuk laporan bergambar. Draf dilabel dengan jelas.

## Struktur kod DAK

Berdasarkan screenshot pengguna “Jadual 7: Struktur DAK Blok Bangunan Bagi Bangunan”:

| Peringkat | Format | Maksud | Contoh |
| --- | --- | --- | --- |
| 1 | AAA | Kod blok, 1–3 huruf | D |
| 2 | A9 / 99 | Kod aras | B1 (Basement 1), 04 (Aras 4) |
| 3 | 9999 | Kod ruang | 0002 (Bilik AHU) |
| 4–10 | 99 setiap peringkat | Tujuh peringkat kod komponen | 33 25 13 11 00 00 00 |

Kod lokasi dijana sebagai `D B1 0001`, `D B1 0002`, dan seterusnya. Nombor ruang boleh disemak dan diubah supaya sepadan pelan; aplikasi tidak mengandaikan label bilik ialah kod ruang rasmi. Nombor ruang mesti unik pada aras tersebut. Nombor tidak digunakan semula secara automatik selepas pemadaman. Kod ruang dikunci selepas pemeriksaan direkodkan supaya rujukan kekal stabil.

Kod DAK lengkap dijana pada rekod pemeriksaan selepas tujuh kod komponen dipilih. Contoh tepat yang disediakan ialah `D B1 0002 33 25 13 11 00 00 00`. Tujuh peringkat komponen dikaitkan dengan komponen yang diperiksa, bukan digunakan sebagai akhiran yang sama untuk setiap ruang.

Satu pratetap daripada rujukan disediakan: `33` HVAC Specific Products and Equipment / ACMV → `25` Air Handling Units → `13` Customized Air Handling Units → `11` Customized Indoor Air Handling Units → `00 00 00` tidak berkenaan. Pratetap ini hanya untuk komponen yang sepadan. Kategori lain perlu diisi daripada klasifikasi rasmi organisasi; katalog keseluruhan belum dibekalkan. Pemeriksaan tanpa klasifikasi boleh direkodkan, tetapi dilabel “komponen belum ditetapkan” dan tidak mempunyai DAK lengkap. AI tidak meneka kod klasifikasi.

Menukar pelan selepas ruang didaftarkan ditolak supaya pautan aset tidak tersasar.

## Mengaktifkan AI

Kunci belum disediakan secara lalai. Salin `.env.example` kepada `.env` **tanpa menimpa fail sedia ada**, kemudian tetapkan `INSPECTION_AI_API_KEY` secara selamat pada pelayan. Pembolehubah `OPENAI_API_KEY` yang sudah disuntik juga boleh digunakan. Jangan komit kunci.

- Penyedia: OpenAI Chat Completions melalui `https://api.openai.com/v1/chat/completions`.
- Model lalai: `gpt-4.1`; boleh diubah melalui `INSPECTION_AI_MODEL` kepada model yang menyokong imej dan Structured Outputs.
- Permintaan memerlukan akses rangkaian kepada `api.openai.com`, kelayakan yang sah dan kuota.
- Kunci digunakan oleh pelayan sahaja. Foto dihantar kepada penyedia apabila pengguna menekan analisis. PDF asal diproses di pelayar; hanya imej halaman terpilih dihantar.
- Tiada hasil AI palsu apabila kunci tiada. Aplikasi memaparkan mod manual; analisis API memberikan status 503.
- Cadangan AI sentiasa draf. Pemeriksa perlu menilai keadaan di tapak. Foto sahaja tidak mengesahkan kestabilan struktur, dimensi, punca tersembunyi atau pematuhan kod. Sempadan ruang AI juga perlu disemak.

## Data dan batasan versi awal

Rekod disimpan di `data/database.json`; imej di `data/uploads/`. Imej dinormalkan kepada PNG, diputar mengikut orientasi dan dikecilkan sehingga 2400 piksel; metadata asal dibuang. Folder `data/`, fail `.env` dan binaan diabaikan oleh Git. Sandarkan keseluruhan `data/` bersama sebelum pemindahan atau naik taraf. Jangan jalankan lebih daripada satu proses API terhadap folder data yang sama.

Untuk hosting percubaan, perlindungan kata laluan bersama tersedia melalui `FCA_ACCESS_USER` dan `FCA_ACCESS_PASSWORD`. Server memerlukan kata laluan apabila `HOST` ditetapkan kepada antara muka luar seperti `0.0.0.0`. Lihat [HOSTING.md](HOSTING.md) dan `render.yaml` untuk Render Web Service dengan disk kekal dan HTTPS. Versi ini belum mempunyai akaun individu, pemisahan pengguna, pangkalan data berbilang pengguna, penyegerakan luar talian atau audit perubahan. Akses kamera telefon memerlukan HTTPS; kawalan pilih/ambil foto bergantung pada pelayar dan peranti. HEIC perlu ditukar kepada JPG/PNG terlebih dahulu. Panggilan AI sebenar hanya boleh disahkan selepas kelayakan tersedia.

Had: PDF 25 MB di pelayar, imej 20 MB pada API, 60 juta piksel semasa nyahkod. OCR/pengecaman ruang ialah cadangan visual, bukan pengiraan keluasan ukur atau tafsiran CAD/BIM.

## Pengesahan

```bash
npm test
npm run build
```

Ujian API menggunakan direktori sementara: muat naik imej sebenar, daftar ruang, keunikan kod, rekod pemeriksaan, pengesahan, penyimpanan selepas mula semula dan pengendalian respons AI. Ujian dengan respons penyedia terkawal tidak membuktikan ketepatan AI sebenar.

Untuk pembangunan cloud, gunakan checkout sedia ada. Setiap tugas sudah terasing; jangan cipta Git worktree kecuali diminta pengguna. Servis mesti dimulakan semula pada tugas baharu; proses hidup tidak dianggap sebahagian daripada snapshot.

Ujian pelayar desktop dan telefon (Chromium tersedia pada mesin ini):

```bash
npm run test:e2e
```

Tetapkan `PLAYWRIGHT_CHROMIUM_EXECUTABLE` jika Chromium berada di lokasi selain `/usr/bin/chromium`. Ujian menggunakan folder data sementara dan merangkumi PDF dua halaman, penetapan kod DAK, draf, pengesahan, muat semula serta eksport CSV.
