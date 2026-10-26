# Jalankan FCA pada komputer sendiri

Render tidak diperlukan untuk cara ini. Kod, rekod pemeriksaan dan gambar disimpan pada komputer anda. Pemasangan pertama memerlukan Internet. Pemeriksaan manual tidak memerlukan kunci AI. Analisis boleh menggunakan Ollama tempatan selepas muat turun model, atau OpenAI API dengan sambungan Internet, kunci dan kredit API.

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

### Laras kotak ruang dan daftar material

1. Dalam **Pelan & daftar aset**, klik **Tambah ruang** dan klik lokasi pada pelan.
2. Pilih kotak atau nama ruang. Seret pemegang di penjuru/tepi untuk membesar atau mengecilkan kotak; seret bahagian dalam kotak untuk mengalihkannya. Pada telefon, gunakan sentuhan yang sama. Dalam **Ukuran ruang**, masukkan panjang/lebar dalam meter, atau gunakan skala pelan seperti panduan di bawah. Koordinat peratus masih boleh dilihat melalui **Kedudukan kotak (lanjutan)**.
3. Dalam **Butiran ruang**, isi **Material dinding**, **Material lantai** dan **Material siling**. Pilih cadangan atau taip material/kemasan lain, contohnya `Bata berlepa + cat`.
4. Klik **Simpan**. Tunggu mesej **Maklumat ruang disimpan**. Pelarasan dan material kekal selepas muat semula; kod ruang/aset kekal sama apabila hanya saiz/material diubah.
5. Maklumat material semasa turut dipaparkan apabila memilih ruang untuk pemeriksaan, dalam laporan cetak/PDF dan eksport CSV. Medan kosong dilabel **Belum direkodkan** dalam paparan; nilai kosong dalam CSV.

Untuk papan kekunci, fokus pada kotak atau pemegang dan tekan anak panah untuk langkah 1%; tahan Shift untuk langkah 0.1%. Peratus menunjukkan lokasi/saiz relatif pada gambar; meter dan m² memerlukan ukuran manual atau skala rujukan. Maklumat bahan ialah catatan pemeriksa dan boleh dilengkapkan kemudian bagi ruang lama.

### Menyemak cadangan AI sebelum import

Selepas **Analisis pelan**, setiap cadangan mempunyai kotak pilihan. Nyahpilih simbol, perabot atau kawasan yang bukan ruang sebelum klik **Import untuk semakan**. **Pilih semua cadangan** menanda atau mengosongkan semua pilihan. Bilangan dipilih dipaparkan; butang import dinyahaktifkan jika tiada pilihan. Hanya cadangan bertanda akan diberi nombor aset dan dimasukkan ke daftar. Jika import gagal, pilihan dikekalkan untuk anda semak dan cuba semula.

Penapis aplikasi menyisihkan label penuh yang menyerupai tag pintu/tingkap seperti `P1`, `P2`, `T1`, `T2`, `Pintu P1` atau `Window W01`, dan menyatakan label yang disisihkan dalam nota. Pelayan turut menolak import AI yang masih mengandungi label simbol tersebut. Ini penapis nama, bukan pengesahan geometri atau latihan semula model: simbol yang diberi nama lain oleh AI masih memerlukan semakan manusia. Nama seperti **Bilik T1** dikekalkan. Jika organisasi menggunakan `T1` sebagai nama ruang sebenar, ruang itu boleh didaftarkan secara manual; semakan sempadan AI bagi ruang manual tersebut masih tersedia.

Dua ruang berasingan boleh mempunyai nama sama, contohnya **Dapur**. Aplikasi mengekalkan kedua-dua cadangan supaya pemeriksa boleh membandingkan lokasi dan dinding; ia tidak menggabungkan atau memadam cadangan hanya kerana namanya sama. Hasil ini tidak mengubah rekod lama yang sudah diimport; gunakan pilihan pemadaman ruang untuk membersihkan rekod yang salah.

### Memilih dan memadam ruang

- Dalam **Daftar ruang**, tanda kotak pilihan bagi ruang yang hendak dipadam, kemudian klik **Padam pilihan (bilangan)**. Anda boleh memilih beberapa ruang atau semua ruang tanpa pemeriksaan. Carian membantu mengecilkan senarai; **Pilih semua hasil carian** hanya menanda hasil tersebut, sementara pilihan terdahulu di luar carian kekal dipilih. **Kosongkan pilihan** membuang semua tanda.
- Untuk satu ruang, klik kotaknya pada pelan atau barisnya dalam daftar, kemudian tekan kekunci **Delete**. Anda juga boleh klik **Padam ruang** dalam Butiran ruang. Kekunci Delete semasa menaip dalam medan borang hanya menyunting teks.
- Semak nama dan kod dalam tetingkap pengesahan sebelum menekan **Ya, padam … ruang**. **Batal** atau Escape mengekalkan ruang dan draf. Pemadaman membuang maklumat ruang termasuk material dan dimensi; nombor aset tidak digunakan semula. Sandarkan folder `data` dahulu jika anda mahu salinan yang boleh dipulihkan.
- Ruang dengan rekod pemeriksaan tidak boleh dipadam. Jika pilihan tidak lagi sah atau mengandungi ruang dilindungi, pelayan menolak seluruh permintaan tanpa memadam sebahagian pilihan. Pelan, gambar dan ruang lain dikekalkan.

### Zoom, panjang/lebar dan keluasan m²

- Gunakan **Zoom masuk/keluar** untuk membesarkan atau mengecilkan drawing, antara 25% hingga 400%. Pada zoom besar, skrol di dalam kawasan pelan untuk melihat bahagian lain. Hidupkan **Alih pandangan** jika mahu menyeret paparan tanpa mengalih kotak ruang; matikan semula untuk melaras kotak. **Muat lebar** kembali ke 100%. Zoom tidak mengubah kod aset, saiz ruang atau skala sebenar.
- **Ukuran manual:** dalam Butiran ruang, isi **Panjang (m)** dan **Lebar (m)**. Contoh 3.3 m × 2.9 m menghasilkan 9.57 m². Klik **Simpan**. Ukuran manual kekal apabila kotak dilaras atau AI mencadangkan sempadan baharu.
- **Ukuran daripada pelan:** tekan **Tetapkan skala**. Klik dua hujung garisan yang jarak sebenarnya diketahui, contohnya dimensi 3300 pada drawing. Isi **3300**, pilih unit **mm**, kemudian tekan **Simpan skala**. Titik rujukan mestilah sekurang-kurangnya 5 piksel berjauhan pada imej asal; zoom boleh membantu memilihnya dengan lebih teliti.
- Selepas skala disimpan, ruang tanpa dimensi manual akan memaparkan anggaran panjang, lebar dan m² daripada kotak. Anggaran berubah bersama pelarasan kotak. Panjang automatik ialah sisi terpanjang; lebar sisi terpendek. **Guna ukuran pelan** kembali kepada kiraan ini jika anda pernah mengisi dimensi manual.
- Skala boleh ditetapkan semula atau dipadam melalui panel yang sama. Dimensi manual disimpan pada ruang; skala disimpan pada pelan. Putaran mengekalkan ukuran; mengganti pelan membuang skala imej sebelumnya. Rekod lama kekal boleh digunakan dan menunjukkan ukuran belum tersedia sehingga anda menetapkannya.

Keluasan ialah panjang × lebar bagi segi empat. Bentuk L/tidak sekata atau foto berherotan perspektif memerlukan semakan dan ukuran lanjut. Jangan gunakan tulisan `1:100` sahaja untuk menentukan skala imej digital yang mungkin telah dikecilkan. Paparan pemeriksaan, laporan dan CSV menunjukkan ukuran **semasa**, termasuk sumber manual atau anggaran skala pelan.

### Semak semula sempadan ruang dengan AI

Jika AI sudah mengenal pasti nama ruang tetapi kotaknya terlalu besar:

1. Pilih ruang itu pada pelan atau **Daftar ruang**.
2. Jika kotak berada jauh daripada ruang yang dimaksudkan, alihkan dahulu ke lokasi anggaran yang betul. Nama ruang dan lokasi membantu membezakan ruang yang mempunyai label sama.
3. Dalam **Butiran ruang**, tekan **Semak sempadan AI** dan tunggu cadangan. AI perlu tersedia melalui penyedia yang telah dikonfigurasi.
4. Bandingkan kotak baharu dengan muka dalam dinding. AI diarahkan mengabaikan garisan ukuran, paksi dan tag seperti P1/T1. Laras pemegang jika perlu.
5. Tandakan semakan jika sudah diperiksa dan klik **Simpan**. Kod aset dan rekod pemeriksaan terus menggunakan ruang yang sama. Semakan ini boleh digunakan pada ruang berdaftar tanpa menjalankan semula import seluruh pelan.

Semakan AI ini menghasilkan draf; kegagalan mengekalkan draf sebelumnya. Putaran atau suntingan ruang yang berlaku semasa analisis menyebabkan respons lama ditolak. Kotak masih segi empat dan bukan ukuran keluasan sebenar atau kontur dinding yang tepat. Model tempatan boleh memberi koordinat kurang tepat walaupun nama ruang dibaca dengan betul.

### Lokasi fail dan orientasi

Untuk membetulkan orientasi drawing, buka **Pelan & daftar aset** selepas memuat naik pelan. Di atas gambar, gunakan **Kiri 90°**, **Kanan 90°** atau **Putar 180°**. Setiap klik menyimpan putaran; tunggu mesej **Orientasi disimpan** sebelum meneruskan. Analisis AI menggunakan orientasi yang disimpan. Kedudukan ruang sedia ada diselaraskan bersama putaran dan kod aset kekal sama. Bagi PDF, kawalan ini memutar halaman yang sedang digunakan; memilih halaman PDF lain memulakan orientasi halaman baharu. Butang **Fail asal** untuk DWG masih memuat turun fail sumber asal.

Fungsi orientasi melibatkan kod pelayan dan paparan web. Apabila menaik taraf daripada versi lama, gunakan langkah **Mengemas kini daripada ZIP GitHub tanpa kehilangan data** di atas, termasuk `npm run build` sebelum `npm start`.

- Rekod: `data/database.json`.
- Gambar dan imej halaman pelan: `data/uploads/`.
- DWG asal jika diimport: `data/cad/`.
- Folder `data/` dicipta secara automatik apabila aplikasi berjalan. Lokasi lalai ini terpakai apabila `FCA_DATA_DIR` tidak ditetapkan.
- Untuk sandaran yang konsisten, hentikan aplikasi dahulu, kemudian salin **keseluruhan folder `data/`** ke lokasi sandaran.
- Jangan jalankan dua salinan API terhadap folder data yang sama.

## AI — pilihan

Untuk AI tempatan tanpa kredit OpenAI, ikuti [LOCAL-AI.md](LOCAL-AI.md). Pasang Ollama, muat turun `qwen2.5vl:3b`, kemudian gunakan `npm run ai:local` dan mulakan semula FCA. Sambungan sebenar dan keupayaan vision model diperiksa sebelum analisis diaktifkan.

Langkah berikut ialah untuk pilihan OpenAI API. Caj API berasingan daripada langganan ChatGPT; semak bil/kredit API sebelum membuat analisis.

1. Buka https://platform.openai.com/api-keys, log masuk dan cipta kunci API untuk akaun/projek anda. Pastikan bil atau kredit API tersedia mengikut keperluan akaun.
2. Hentikan FCA dengan Ctrl+C dalam Command Prompt. Pastikan terminal masih berada dalam folder yang mengandungi `package.json`.
3. Jalankan arahan berikut. Arahan pertama mengekalkan `.env` sedia ada:

   ```bat
   if not exist .env copy .env.example .env
   notepad .env
   ```

4. Dalam Notepad, isi nilai selepas `INSPECTION_AI_API_KEY=` dengan kunci anda sendiri. Model lalai boleh dibiarkan sebagai `INSPECTION_AI_MODEL=gpt-4.1`. Simpan dengan Ctrl+S dan tutup Notepad. Pastikan nama fail benar-benar `.env`, bukan `.env.txt`.
5. Jalankan `npm start` semula dan muat semula halaman aplikasi. Status AI dikonfigurasi menunjukkan kunci telah dibaca, bukan bahawa kunci, kuota atau analisis telah disahkan oleh penyedia. Cuba satu analisis pelan yang dibenarkan dan semak hasilnya.

Jangan muat naik `.env` ke GitHub, kongsi nilainya dalam chat atau masukkan kunci ke kod frontend. Nilai hanya diperlukan pada komputer yang menjalankan pelayan FCA.

Model lalai ialah `gpt-4.1`. Tanpa kunci, daftar ruang dan pemeriksaan manual boleh digunakan. Kehadiran kunci sahaja tidak menjamin kuota atau analisis berjaya. Foto dihantar kepada penyedia apabila anda memilih analisis AI.

## Jika ada masalah

- **`package.json` tidak ditemui:** terminal berada di folder yang salah; masuk ke folder yang mengandungi fail itu.
- **Port 3001 sedang digunakan / EADDRINUSE:** aplikasi mungkin sudah berjalan dalam terminal lain. Gunakan sesi itu atau hentikannya dengan Ctrl+C sebelum mula semula.
- **Pelayar tidak dapat menyambung:** pastikan `npm start` masih berjalan tanpa ralat dan gunakan pelayar pada komputer yang sama. Jika `PORT` ditukar dalam `.env`, gunakan port tersebut.
- **Diminta kata laluan:** `FCA_ACCESS_PASSWORD` telah ditetapkan dalam `.env` atau persekitaran. Gunakan nama pengguna `inspector` (atau `FCA_ACCESS_USER` yang ditetapkan) dan kata laluan anda.
- **Cipta projek memaparkan blok/aras sudah didaftarkan:** keunikan projek berdasarkan gabungan kod blok dan aras, bukan nama projek. Gunakan **Buka projek sedia ada** atau pilih projek tersebut dalam senarai untuk meneruskan kerja pada aras sama. Untuk aras berlainan, gunakan kod aras sebenar yang lain.
- **Tulisan analisis AI hilang tetapi daftar ruang masih kosong:** analisis menghasilkan cadangan terlebih dahulu. Semak panel keputusan, kemudian pilih **Import untuk semakan** untuk memasukkan cadangan ke daftar ruang. Versi terkini menatal ke keputusan atau ralat selepas analisis; versi lama meletakkan cadangan di bawah pelan dan ralat di bahagian atas halaman.
- **AI tidak menemui ruang:** panel akan menyatakan “Tiada ruang dikenal pasti”. Baca nota AI, cuba pelan yang lebih jelas atau tambah ruang secara manual. Tiada ruang disimpan secara automatik.
- **Ralat kredit atau had belanja API:** semak bil, baki kredit dan had belanja akaun OpenAI API. Langganan ChatGPT tidak secara automatik menyediakan kredit API. Ralat kadar permintaan pula memerlukan anda menunggu sebelum mencuba semula. Aplikasi tidak mengulang panggilan berbayar secara automatik.
- **Butang Analisis pelan kelabu:** kunci AI mungkin belum dibaca, atau pelan sudah mempunyai ruang berdaftar. Analisis semula disekat pada pelan yang sudah mempunyai ruang supaya kod aset tidak berulang. Status “AI dikonfigurasi” menunjukkan kunci dibaca, bukan pengesahan kebenaran atau kredit API.

## Menggunakan telefon

Alamat `127.0.0.1` pada telefon merujuk kepada telefon itu sendiri, bukan komputer. Untuk permulaan, pindahkan gambar telefon ke komputer dan muat naik melalui aplikasi. Akses langsung dari telefon memerlukan konfigurasi rangkaian, perlindungan akses dan HTTPS yang bersesuaian; ia tidak diaktifkan secara automatik dalam cara tempatan ini.
