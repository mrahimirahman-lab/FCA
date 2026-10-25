# Jalankan FCA pada komputer sendiri

Render tidak diperlukan untuk cara ini. Kod, rekod pemeriksaan dan gambar disimpan pada komputer anda. Pemasangan pertama memerlukan Internet. Pemeriksaan manual tidak memerlukan kunci AI; analisis AI masih memerlukan sambungan Internet, kunci dan kuota penyedia.

## 1. Pasang Node.js

Buka https://nodejs.org/en/download dan pasang Node.js 24 LTS untuk Windows, macOS atau Linux anda. Npm disertakan bersama Node.js. Selepas pemasangan, tutup dan buka semula terminal.

Semak pemasangan:

```text
node --version
npm --version
```

Jika terminal menyatakan arahan tidak dikenali, buka semula terminal selepas pemasangan dan pastikan Node.js ditambah ke PATH.

## 2. Dapatkan kod dari GitHub

1. Buka https://github.com/mrahimirahman-lab/FCA.
2. Klik butang **Code → Download ZIP** di laman GitHub. Ini muat turun daripada GitHub, bukan panel pratonton arkib dalam chat.
3. Ekstrak ZIP kepada folder biasa, contohnya `Documents/FCA`. Jangan jalankan aplikasi di dalam paparan ZIP.
4. Pastikan folder yang dibuka mengandungi `package.json`, `package-lock.json`, `server/` dan `src/`. GitHub biasanya menamakan folder yang diekstrak `FCA-main`.

## 3. Buka terminal di folder aplikasi

- **Windows:** buka folder aplikasi dalam File Explorer. Klik bar alamat, taip `cmd`, kemudian tekan Enter untuk membuka Command Prompt di folder tersebut. Menggunakan Command Prompt mengelakkan isu polisi skrip `npm.ps1` pada sesetengah pemasangan PowerShell.
- **macOS:** buka Terminal, taip `cd ` (dengan ruang selepasnya), seret folder aplikasi dari Finder ke Terminal, kemudian tekan Enter.
- **Linux:** klik kanan dalam folder dan pilih Open in Terminal, jika tersedia, atau gunakan `cd` ke folder itu.

## 4. Pasang dan bina — kali pertama

Jalankan satu demi satu dan tunggu setiap arahan selesai:

```text
npm ci --include=dev
npm run build
npm start
```

Biarkan terminal terbuka semasa menggunakan aplikasi. Apabila mesej `FCA server listening on port 3001` muncul, buka pelayar **pada komputer yang sama** dan taip alamat loopback port 3001: `http://127.0.0.1:3001`.

Alamat ini merujuk kepada komputer anda sendiri selepas anda menjalankan aplikasi; ia bukan pautan pratonton Codex atau laman yang boleh dibuka dari peranti lain.

## 5. Penggunaan seterusnya

Buka terminal dalam folder yang sama dan jalankan:

```text
npm start
```

Untuk berhenti, kembali ke terminal dan tekan **Ctrl+C**. Dalam Command Prompt Windows, jika ditanya `Terminate batch job (Y/N)?`, tekan `Y` dan Enter. Rekod yang telah disimpan kekal pada disk.

Jika anda mengemas kini kod atau menukar dependencies, jalankan semula `npm ci --include=dev` dan `npm run build` sebelum memulakan aplikasi. Jangan padam folder data semasa kemas kini.

## Mengemas kini daripada ZIP GitHub tanpa kehilangan data

1. Hentikan aplikasi lama dengan Ctrl+C.
2. Sandarkan keseluruhan folder `data/` daripada folder aplikasi lama. Jika anda mempunyai `.env`, simpan fail itu secara peribadi juga.
3. Muat turun ZIP terkini menggunakan **Code → Download ZIP** di GitHub dan ekstrak ke **folder baharu**, contohnya `Documents/FCA-terkini`.
4. Salin folder `data/` lama ke dalam folder baharu, bersebelahan `package.json`. Jika menggunakan `.env`, salin fail itu juga; jangan gantikannya dengan `.env.example`. Jika anda menetapkan `FCA_DATA_DIR`, terus gunakan lokasi data tersebut.
5. Buka Command Prompt dalam folder baharu. Jalankan `npm ci --include=dev`, kemudian `npm run build` dan `npm start`.
6. Buka aplikasi dan pastikan projek/rekod lama masih kelihatan. Kekalkan folder lama dan sandaran sehingga semakan selesai.

Versi terkini menerima pelan AutoCAD `.dwg` melalui butang muat naik yang sama, sehingga 25 MB. Pilih fail dan tunggu paparan 2D Model Space selesai, semak hasilnya, kemudian tambah ruang. **Fail asal** memuat turun DWG yang disimpan. Paparan DWG dijana pada komputer anda tanpa penukaran awan; XREF, objek 3D, hatch, SHX atau sesetengah dimensi mungkin tiada atau berbeza. Fail asal DWG turut disimpan dalam folder `data/cad/`; sertakannya dalam sandaran.

## Rekod, gambar dan sandaran

- Rekod: `data/database.json`.
- Gambar dan imej halaman pelan: `data/uploads/`.
- DWG asal jika diimport: `data/cad/`.
- Folder `data/` dicipta secara automatik apabila aplikasi berjalan. Lokasi lalai ini terpakai apabila `FCA_DATA_DIR` tidak ditetapkan.
- Untuk sandaran yang konsisten, hentikan aplikasi dahulu, kemudian salin **keseluruhan folder `data/`** ke lokasi sandaran.
- Jangan jalankan dua salinan API terhadap folder data yang sama.

## AI — pilihan

Salin `.env.example` kepada `.env` jika `.env` belum wujud. Isi `INSPECTION_AI_API_KEY` secara peribadi pada komputer anda, kemudian mulakan semula aplikasi. Pada Windows, pastikan nama fail benar-benar `.env`, bukan `.env.txt`. Jangan muat naik fail ini ke GitHub atau kongsi nilainya dalam chat.

Model lalai ialah `gpt-4.1`. Tanpa kunci, daftar ruang dan pemeriksaan manual boleh digunakan. Kehadiran kunci sahaja tidak menjamin kuota atau analisis berjaya. Foto dihantar kepada penyedia apabila anda memilih analisis AI.

## Jika ada masalah

- **`package.json` tidak ditemui:** terminal berada di folder yang salah; masuk ke folder yang mengandungi fail itu.
- **Port 3001 sedang digunakan / EADDRINUSE:** aplikasi mungkin sudah berjalan dalam terminal lain. Gunakan sesi itu atau hentikannya dengan Ctrl+C sebelum mula semula.
- **Pelayar tidak dapat menyambung:** pastikan `npm start` masih berjalan tanpa ralat dan gunakan pelayar pada komputer yang sama. Jika `PORT` ditukar dalam `.env`, gunakan port tersebut.
- **Diminta kata laluan:** `FCA_ACCESS_PASSWORD` telah ditetapkan dalam `.env` atau persekitaran. Gunakan nama pengguna `inspector` (atau `FCA_ACCESS_USER` yang ditetapkan) dan kata laluan anda.

## Menggunakan telefon

Alamat `127.0.0.1` pada telefon merujuk kepada telefon itu sendiri, bukan komputer. Untuk permulaan, pindahkan gambar telefon ke komputer dan muat naik melalui aplikasi. Akses langsung dari telefon memerlukan konfigurasi rangkaian, perlindungan akses dan HTTPS yang bersesuaian; ia tidak diaktifkan secara automatik dalam cara tempatan ini.
