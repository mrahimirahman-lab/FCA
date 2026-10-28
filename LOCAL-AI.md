# AI tempatan dengan Ollama pada Windows

FCA boleh menggunakan model vision pada komputer sendiri melalui Ollama. Mod ini tidak memerlukan kredit OpenAI dan tidak beralih secara automatik kepada OpenAI jika model tempatan gagal. Sambungan model dihadkan kepada alamat loopback pada komputer yang sama. Model yang dilaporkan sebagai model jauh/cloud dan model tanpa keupayaan vision ditolak.

Pemasangan runtime dan muat turun model memerlukan Internet serta beberapa GB ruang disk. Pemprosesan menggunakan RAM, GPU/CPU dan elektrik komputer. Model tempatan boleh memberi hasil kurang tepat daripada model awan; setiap nama ruang, sempadan, jenis kerosakan dan remedial work mesti disemak.

## Pilihan permulaan

Untuk komputer pengguna dengan **RAM 32 GB, Intel i5-14500HX dan NVIDIA RTX 4060 Laptop 8 GB**, model permulaan yang dipilih ialah **`qwen2.5vl:3b`**. Ia model vision yang lebih ringan berbanding varian 7B. Saiz ini ialah cadangan permulaan, bukan jaminan kelajuan, ketepatan atau penggunaan penuh GPU. Ollama menentukan offload berdasarkan perkakasan, driver, model dan memori yang tersedia.

Lihat model dan syarat lesennya di https://ollama.com/library/qwen2.5vl.

## 1. Pasang Ollama dan model

1. Muat turun pemasang Windows daripada https://ollama.com/download/windows.
2. Pasang dan buka aplikasi Ollama. Biarkannya berjalan di latar belakang.
3. Buka Command Prompt baharu dan jalankan:

   ```bat
   ollama --version
   ollama pull qwen2.5vl:3b
   ```

4. Tunggu muat turun selesai. Semak:

   ```bat
   ollama list
   ```

   Nama `qwen2.5vl:3b` perlu ada dalam senarai. Jika `ollama` tidak dikenali, tutup dan buka semula Command Prompt selepas pemasangan.

Jangan pilih tag `:cloud` atau model yang dihantar kepada pelayan jauh untuk mod tempatan ini.

## 2. Kemas kini kod FCA

Jika salinan FCA anda belum mempunyai arahan `ai:local`, kemas kini menggunakan **Code → Download ZIP** dari https://github.com/mrahimirahman-lab/FCA. Hentikan FCA lama, sandarkan `data/` dan `.env`, ekstrak ZIP ke folder baharu dan pindahkan `data/` serta `.env` anda. Ikut [LOCAL.md](LOCAL.md) bagi langkah Windows terperinci.

Dalam folder baharu yang mengandungi `package.json`, buka Command Prompt. Jalankan satu demi satu:

```bat
npm ci --include=dev
npm run build
npm run ai:local
npm start
```

`npm run ai:local` memilih tetapan berikut:

```dotenv
INSPECTION_AI_PROVIDER=ollama
OLLAMA_MODEL=qwen2.5vl:3b
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_TIMEOUT_SECONDS=600
```

Arahan ini mencipta sandaran `.env.backup-…` jika tetapan sedia ada berubah, mengekalkan tetapan data/port/kata laluan dan kunci OpenAI yang sedia ada, serta tidak mencetak nilai rahsia. Simpan sandaran `.env` secara peribadi. Kunci OpenAI yang dikekalkan tidak digunakan apabila penyedia ialah `ollama`. Anda juga boleh menetapkan empat nilai tersebut secara manual dalam `.env` tanpa menukar tetapan lain.

## 3. Semak sambungan melalui aplikasi

1. Buka FCA pada pelayar komputer yang sama seperti biasa.
2. Pada **Pelan & daftar aset**, semak kotak **AI tempatan · Ollama**. Tekan **Semak sambungan Ollama** selepas memulakan Ollama atau selesai memuat turun model.
3. Aplikasi menyemak model melalui metadata Ollama sebelum mengaktifkan analisis. Status sedia bermaksud Ollama dapat dicapai dan model menyokong imej; ia belum mengesahkan ketepatan atau bahawa inferens sebenar sudah berjaya.
4. Cuba **satu** analisis pelan. Panggilan pertama mungkin mengambil beberapa minit untuk memuatkan model. Semak cadangan dan pilih **Import untuk semakan** sebelum ruang dimasukkan ke daftar.
5. Cuba satu foto pemeriksaan melalui **Analisis kerosakan**. Semak dan edit dapatan sebelum mengesahkan atau menghasilkan laporan.

Jika pelan sudah mempunyai ruang berdaftar, butang analisis semula pelan disekat bagi mengelakkan kod aset berganda. Pemeriksaan foto bagi ruang sedia ada masih tersedia.

## Prestasi dan masalah biasa

- **Ollama tidak dapat dihubungi:** buka aplikasi Ollama dan tekan semak sambungan. Jika ia belum dimulakan oleh aplikasi, `ollama serve` boleh dijalankan dalam terminal berasingan. Jika port sudah digunakan, servis mungkin sudah berjalan; jangan mulakan salinan kedua.
- **Model belum tersedia:** tunggu `ollama pull qwen2.5vl:3b` selesai dan semak `ollama list`.
- **Model tidak menyokong imej:** gunakan model vision yang betul dan kemas kini Ollama. Model teks sahaja tidak dapat membaca pelan atau foto.
- **Lambat:** semasa analisis berjalan, buka Command Prompt lain dan jalankan `ollama ps`. Lajur PROCESSOR menunjukkan penggunaan GPU/CPU. Bagi masalah GPU, rujuk panduan Ollama dan driver NVIDIA untuk komputer anda. Tutup aplikasi lain yang menggunakan banyak RAM/VRAM.
- **Tamat masa:** had lalai 600 saat boleh diubah melalui `OLLAMA_TIMEOUT_SECONDS`, antara 30 hingga 1800, kemudian mulakan semula FCA. Cuba satu aras/kawasan pelan yang lebih kecil. Jangan jalankan beberapa inferens berat serentak.
- **Hasil melebihi had jawapan:** Ollama melaporkan generasi terpotong (`done_reason: length`). Ini berbeza daripada tamat masa dan tidak membuktikan imej kurang jelas. Versi terkini menggunakan had 8192 token jawapan dan konteks 16384 token untuk pelan, koordinat piksel nombor bulat, skor confidence dengan satu tempat perpuluhan dan nota maksimum 600 aksara. Ini menambah ruang jawapan sambil mengurangkan output yang tidak perlu; ia tidak menjamin model akan menamatkan semua pelan. Konteks lebih besar boleh menggunakan lebih memori dan mengambil lebih masa. Jika berulang, gunakan pelan satu aras yang lebih ringkas atau daftar ruang secara manual. Output yang ditanda terpotong tidak diterima walaupun sebahagian JSON kelihatan lengkap.
- **Jawapan/koordinat tidak sah:** Ollama sudah dapat dihubungi, tetapi output gagal semakan format/nilai. Versi terkini meminta `bbox` dalam bentuk `[kiri, atas, kanan, bawah]` dalam piksel imej yang dihantar; aplikasi mengira lebar/tinggi dan peratus untuk paparan. Model tidak perlu mengira peratus atau menjumlahkan kedudukan dengan saiz ruang. Saiz imej selepas pengecilan dihantar dalam arahan. Unit tidak diteka daripada nilai, penjuru tidak disusun semula dan sempadan di luar imej tidak dipotong untuk meluluskan jawapan. Ralat menyatakan medan bermasalah, contohnya `Ruang 2: confidence mesti nombor 0–1` atau `Ruang 1: bbox ...`. Tiada ruang diimport jika mana-mana cadangan gagal semakan. Cuba sekali lagi melalui **Cuba analisis semula**. Jika berulang, catat mesej penuh yang baharu; anda boleh menggunakan **Tambah ruang** secara manual. Tiada percubaan inferens kedua secara automatik dan tiada respons AI palsu digunakan untuk menggantikan kegagalan.
- **Masih tertera OpenAI:** pastikan anda memulakan FCA daripada folder yang telah dikemas kini, menjalankan `npm run ai:local`, dan memulakan semula FCA. Pembolehubah persekitaran Windows yang telah ditetapkan secara global boleh mengatasi `.env`.

Untuk kembali ke OpenAI, tetapkan `INSPECTION_AI_PROVIDER=openai` dan sediakan kunci/kredit API yang sah; mulakan semula FCA.

## Semak sempadan dan kemas kini aplikasi

Arahan analisis kini meminta kotak mengikut muka dalam dinding bilik serta mengabaikan garisan dimensi, paksi dan tag pintu/tingkap. Ollama menerima imej pelan tanpa grid tambahan. Grid panduan 10×10 daripada versi terdahulu telah dibuang untuk mengelakkan petak tiruan dianggap sebagai bilik. Nisbah aspek dikekalkan semasa pengecilan dan fail pelan asal tidak ditulis semula. Pertindihan ketara antara kotak cadangan ditandakan untuk semakan.

Untuk ruang yang sudah diimport, gunakan **Butiran ruang → Semak sempadan AI**. Model memfokus satu ruang, dan hasilnya hanya dipaparkan dalam draf sebelum **Simpan**. Nama/kod aset, material dan rekod pemeriksaan dikekalkan. Jika hasil masih tidak tepat, laras pemegang secara manual. Pembaikan ini mengubah prompt dan input visual, bukan melatih semula model atau menjamin segmentasi dinding tepat.

Versi terkini menggunakan fail pelayan tambahan dan perubahan paparan web. Kemas kini melalui ZIP penuh mengikut [LOCAL.md](LOCAL.md): hentikan FCA, sandarkan `data` dan `.env`, ekstrak ZIP baharu, salin data/tetapan, kemudian jalankan `npm ci --include=dev`, `npm run build` dan `npm start`. Jangan gunakan panduan lama menggantikan dua fail pelayan sahaja untuk naik taraf ke versi ini.

## Bukti pengesahan dan batasannya

Pengesahan pembangunan merangkumi kontrak HTTP Ollama melalui pelayan ujian loopback: metadata vision, imej PNG, output JSON berstruktur, analisis pelan dan kerosakan, import/persistence, ralat, model jauh/teks ditolak serta tiada penghantaran kunci awan. Ujian pelayar memeriksa status sambungan dan aliran pengguna menggunakan respons terkawal.

Inferens model Ollama sebenar pada Windows/GPU pengguna **belum disahkan**. Runtime Ollama dan model tidak dipasang oleh aplikasi secara automatik. Ketepatan serta masa respons perlu dinilai pada komputer dan imej sebenar anda selepas pemasangan. Dokumentasi kontrak API rasmi: https://github.com/ollama/ollama/blob/main/docs/api.md.

## Percubaan latihan Qwen3-VL V4

[Penjana V4](scripts/dataset-v4/README.md) menyediakan data latihan daripada Parquet gabungan V3 pada komputer pengguna. Ia menggunakan koordinat relatif 0–1000, contoh mencari satu bilik, contoh semua bilik dan contoh sasaran yang tiada. Tiga potongan JKR70 dikekalkan dalam satu kumpulan latihan; pelan Mantin diasingkan untuk penilaian. Bilangan tugasan tidak sama dengan bilangan pelan bebas.

Penjana menghasilkan fail latihan/penilaian berasingan, profil YAML Unsloth dan halaman perbandingan kotak yang boleh dibuka tanpa Internet. Data asal dikekalkan. Ia menggunakan Python dalam persekitaran Unsloth, bukan `npm`, dan tidak memulakan latihan atau memasang model. Contoh kawasan luar disimpan untuk fasa seterusnya sementara percubaan ini memfokus lokasi ruang dalaman.

Output percubaan V4 ialah `label` dan `bbox_2d` relatif 0–1000. Kontrak Ollama FCA di atas masih menggunakan piksel; penyambungan model memerlukan penukar unit yang jelas dan pengesahan berasingan. Kejayaan menyediakan data, penurunan loss atau JSON yang sah tidak menjamin sempadan dinding yang tepat.

## Percubaan augmentasi V5

[Penjana V5](scripts/dataset-v5/README.md) membaca folder V4 yang telah dijana dan menambah dua varian margin serta tugasan pasangan ruang. Ia menyediakan 90 tugasan daripada tiga imej asal JKR70 (satu drawing), bukan 90 pelan bebas. Lapan tugasan MANTIN tidak berubah dan kekal sebagai holdout pembangunan yang telah digunakan berulang kali. Rujukan draf tidak diperbetulkan secara automatik; semak lapisan kotak sebelum latihan. CubiCasa belum dimasukkan. Skrip tidak melatih model atau mengubah integrasi FCA.
