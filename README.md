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
2. Muat naik DWG, PDF atau imej. DWG dibaca secara tempatan sebagai paparan 2D Model Space; semak hasil penukaran sebelum menanda ruang. Bagi PDF, pilih halaman yang mewakili aras tersebut **sebelum** menambah ruang. Satu projek menggunakan satu paparan pelan; cipta projek aras lain untuk halaman atau pelan lain.
3. Tambah ruang dengan klik pada pelan, atau analisis dengan AI dan import cadangan. Edit nama, sempadan peratus dan pengesahan ruang.
4. Pilih ruang, ambil atau muat naik foto, isi dapatan secara manual atau gunakan analisis AI. Semak jenis kerosakan, deskripsi, keutamaan dan remedial work.
5. Masukkan nama pemeriksa dan sahkan rekod. Rekod boleh disimpan sebagai draf dan diedit kemudian melalui laporan.
6. Tapis rekod, eksport CSV atau gunakan Cetak / PDF untuk laporan bergambar. Draf dilabel dengan jelas.

Pada **Pelan & daftar aset → Orientasi pelan**, gunakan **Kiri 90°**, **Kanan 90°** atau **Putar 180°** untuk membetulkan pelan JPG/PNG, halaman PDF yang dipilih atau paparan DWG. Putaran disimpan pada imej pelan dan digunakan semasa analisis AI. Sempadan ruang sedia ada turut diputar; kod aset dan rekod pemeriksaan dikekalkan. Cadangan AI yang belum diimport dibersihkan selepas putaran berjaya supaya koordinat lama tidak digunakan. Fail DWG asal dan foto pemeriksaan dikekalkan. Kawalan ini menyokong putaran suku/pusingan separuh, bukan pelurusan sudut kecil untuk foto senget.

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

## Fail AutoCAD DWG

Fail `.dwg` sehingga 25 MB boleh dipilih melalui butang muat naik pelan yang sama. Pembaca berjalan pada pelayan Node tempatan anda, tanpa AutoCAD atau perkhidmatan penukaran awan. Pemasangan `npm ci --include=dev` memasang pembaca WASM bersama aplikasi; tiada pemasangan Chocolatey atau alat binaan C++ tambahan diperlukan untuk pembaca DWG ini.

Paparan yang dihasilkan ialah raster 2D **Model Space**, hitam putih sehingga 2400 piksel pada sisi terpanjang. Fail asal disimpan dalam `data/cad/` dan boleh dimuat turun menggunakan **Fail asal**. Paparan PNG disimpan dalam `data/uploads/` dan digunakan untuk penandaan ruang serta analisis AI jika diaktifkan. DWG asal tidak dihantar kepada penyedia AI oleh proses import.

Sokongan ini bukan pengganti AutoCAD. Paper Space/viewport, XREF, objek 3D atau tersuai, hatch, SHX, dimensi tertentu dan beberapa transformasi blok boleh tiada atau berbeza. Layer off/frozen dan entiti tidak kelihatan dikecualikan. Semak hasil sebelum menanda ruang. Fail yang rosak, Model Space kosong atau tidak boleh dirender akan ditolak dengan mesej; pelan sedia ada dikekalkan. Jika perlu, eksport PDF daripada AutoCAD sebagai pilihan lain. DWG besar memerlukan RAM yang mencukupi; penukaran mempunyai had masa 45 saat dan hanya satu import diproses pada satu masa.

Pembaca ialah komponen CLI berasingan dalam `tools/dwg-reader/`, menggunakan `@mlightcad/libredwg-web` 0.8.2 / GNU LibreDWG (GPL v3). Lesen dan pautan kod sumber disertakan di folder komponen. Ia menghasilkan SVG melalui fail sementara; pelayan menyaring SVG dan menukarnya kepada PNG, tanpa menyampaikan SVG aktif kepada pelayar. Ujian menggunakan DWG binari sebenar format AutoCAD 2000 dan 2018 bagi polyline dan teks. Keserasian setiap fail pengguna dan pelaksanaan pada Windows belum diuji secara langsung dalam persekitaran pembangunan Linux ini.

## Mengaktifkan AI

Pilih penyedia melalui `INSPECTION_AI_PROVIDER`: `openai` (lalai bagi pemasangan lama) atau `ollama` (tempatan). Untuk RAM 32 GB / RTX 4060 Laptop 8 GB, cadangan permulaan ialah Ollama dengan `qwen2.5vl:3b`; lihat [LOCAL-AI.md](LOCAL-AI.md). Arahan `npm run ai:local` memilih penyedia/model tempatan, membuat sandaran `.env` apabila berubah dan mengekalkan tetapan lain. Model/runtime perlu dipasang berasingan. Mod Ollama hanya menghantar imej kepada pelayan loopback tempatan dan tidak jatuh balik kepada OpenAI.

Dalam mod Ollama, semakan kesediaan mengesahkan sambungan, model tersedia dan capability vision. Model cloud/remote, destinasi di luar komputer ini dan pengalihan HTTP ditolak. PNG dikecilkan secara berkadar sehingga sisi maksimum 1600 piksel sebelum inferens tempatan. Timeout lalai 600 saat, suhu 0, konteks 8192 dan output JSON berstruktur digunakan; keluaran masih diperiksa dengan skema yang sama. Kapasiti model kecil dan penskalaan imej boleh menjejaskan butiran pelan, jadi semakan manusia tetap diperlukan.

Langkah berikut ialah untuk **mod OpenAI**:

Kunci belum disediakan secara lalai. Salin `.env.example` kepada `.env` **tanpa menimpa fail sedia ada**, kemudian tetapkan `INSPECTION_AI_API_KEY` secara selamat pada pelayan. Pembolehubah `OPENAI_API_KEY` yang sudah disuntik juga boleh digunakan. Jangan komit kunci.

- Penyedia: OpenAI Chat Completions melalui `https://api.openai.com/v1/chat/completions`.
- Model lalai: `gpt-4.1`; boleh diubah melalui `INSPECTION_AI_MODEL` kepada model yang menyokong imej dan Structured Outputs.
- Permintaan memerlukan akses rangkaian kepada `api.openai.com`, kelayakan yang sah dan kuota.
- Kunci digunakan oleh pelayan sahaja. Foto dihantar kepada penyedia apabila pengguna menekan analisis. PDF asal diproses di pelayar; hanya imej halaman terpilih dihantar.
- Tiada hasil AI palsu apabila kunci tiada. Aplikasi memaparkan mod manual; analisis API memberikan status 503.
- Cadangan AI sentiasa draf. Pemeriksa perlu menilai keadaan di tapak. Foto sahaja tidak mengesahkan kestabilan struktur, dimensi, punca tersembunyi atau pematuhan kod. Sempadan ruang AI juga perlu disemak.
- Analisis pelan menunjukkan status pemprosesan berhampiran butang dan menatal ke panel keputusan atau ralat. Hasil kosong, kegagalan dan cadangan berjaya dibezakan. Cadangan hanya disimpan sebagai ruang selepas **Import untuk semakan** dipilih. Kredit API, had kadar, kunci tidak sah dan akses model mempunyai mesej berasingan; mesej mentah penyedia yang boleh mengandungi cebisan kunci tidak dihantar ke pelayar.

## Data dan batasan versi awal

Rekod disimpan di `data/database.json`; imej di `data/uploads/`; DWG asal di `data/cad/`. Imej dinormalkan kepada PNG, diputar mengikut orientasi dan dikecilkan sehingga 2400 piksel; metadata asal dibuang. Folder `data/`, fail `.env` dan binaan diabaikan oleh Git. Sandarkan keseluruhan `data/` bersama sebelum pemindahan atau naik taraf. Jangan jalankan lebih daripada satu proses API terhadap folder data yang sama.

Untuk hosting percubaan, perlindungan kata laluan bersama tersedia melalui `FCA_ACCESS_USER` dan `FCA_ACCESS_PASSWORD`. Server memerlukan kata laluan apabila `HOST` ditetapkan kepada antara muka luar seperti `0.0.0.0`. Lihat [HOSTING.md](HOSTING.md) dan `render.yaml` untuk Render Web Service dengan disk kekal dan HTTPS. Versi ini belum mempunyai akaun individu, pemisahan pengguna, pangkalan data berbilang pengguna, penyegerakan luar talian atau audit perubahan. Akses kamera telefon memerlukan HTTPS; kawalan pilih/ambil foto bergantung pada pelayar dan peranti. HEIC perlu ditukar kepada JPG/PNG terlebih dahulu. Inferens AI sebenar perlu diuji selepas penyedia dan model yang dipilih tersedia.

Had: DWG/PDF 25 MB, imej 20 MB pada API, 60 juta piksel semasa nyahkod imej. OCR/pengecaman ruang ialah cadangan visual, bukan pengiraan keluasan ukur atau tafsiran BIM. Import DWG tidak secara automatik menjadikan setiap poligon sebagai ruang atau menetapkan klasifikasi komponen DAK.

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
