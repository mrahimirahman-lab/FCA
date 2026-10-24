# Hoskan FCA pada Render

Versi ini sesuai untuk demonstrasi atau percubaan satu pasukan kecil menggunakan satu akaun akses bersama. Aplikasi dan API dihoskan sebagai satu **Web Service Node.js**, bersama **persistent disk** untuk gambar dan rekod. Render menyediakan pautan HTTPS. Semak harga semasa dan caj disk sebelum membuat deployment; pelan percuma tanpa disk kekal tidak sesuai untuk menyimpan rekod pemeriksaan ini.

## 1. Masukkan kod ke GitHub

Gunakan repositori `mrahimirahman-lab/FCA`. Jika memuat naik daripada ZIP, ekstrak dahulu dan muat naik **isi folder FCA**, bukan fail ZIP itu sendiri. `package.json`, `render.yaml`, folder `server/` dan `src/` perlu berada di akar repositori. Sertakan `package-lock.json` dan fail konfigurasi yang lain.

Jangan muat naik `.env`, `data/` atau `node_modules/`. Kod di ruang kerja Codex tidak dihantar ke GitHub secara automatik; pastikan kod benar-benar muncul pada branch yang dipilih sebelum menyambungkan Render.

## 2. Cipta Blueprint

1. Daftar atau log masuk di https://render.com.
2. Sambungkan akaun GitHub dan benarkan akses kepada repositori FCA.
3. Pilih **New → Blueprint** dan pilih repositori serta branch yang mengandungi kod aplikasi.
4. Render akan membaca `render.yaml`. Semak Web Service, pelan berbayar dan disk 1 GB pada `/var/data`, kemudian sahkan hanya apabila bersetuju dengan kosnya.
5. Tunggu build dan deployment selesai. Buka pautan HTTPS yang diberikan Render; jangan gunakan alamat localhost daripada komputer atau sesi Codex.

Nama butang boleh berubah mengikut antaramuka Render. Aplikasi belum diterbitkan hanya dengan kewujudan fail konfigurasi ini.

## 3. Log masuk

Blueprint menetapkan nama pengguna `inspector` dan menjana `FCA_ACCESS_PASSWORD`. Lihat nilai tersebut secara peribadi dalam tetapan Environment service Render, kemudian gunakan apabila pelayar meminta nama pengguna dan kata laluan. Jangan kongsi nilainya dalam chat atau GitHub. Anda boleh menukar kata laluan melalui tetapan Render dan deploy semula.

Perlindungan ini menggunakan HTTP Basic Authentication melalui HTTPS. Ia meliputi halaman web, API dan imej yang dimuat naik. Endpoint kesihatan hanya mendedahkan `{"ok":true}` tanpa log masuk. Pelayar mungkin menyimpan sesi kata laluan; tiada butang log keluar atau akaun individu. Gunakan tetingkap peribadi jika menggunakan peranti berkongsi.

## 4. Aktifkan AI jika diperlukan

Di tetapan **Environment**, tambah `INSPECTION_AI_API_KEY` dengan kunci OpenAI yang sah. Tetapkan `INSPECTION_AI_MODEL=gpt-4.1` jika mahu menyatakan model secara eksplisit, kemudian deploy semula. Caj AI berasingan daripada caj hosting. Kunci hanya disimpan pada pelayan. Tanpa kunci, pemeriksaan manual tetap boleh digunakan.

Selepas diaktifkan, uji satu imej pelan dan satu foto kerosakan yang dibenarkan untuk dihantar kepada penyedia AI. Kehadiran kunci sahaja tidak membuktikan analisis berjaya atau tepat.

## Jika menggunakan Web Service biasa

Gunakan tetapan berikut sebagai alternatif kepada Blueprint:

| Tetapan | Nilai |
| --- | --- |
| Runtime | Node |
| Build command | `npm ci --include=dev && npm run build` |
| Start command | `npm start` |
| Health check | `/api/health` |
| Node version | `NODE_VERSION=24` |
| Host | `HOST=0.0.0.0` |
| Folder data | `FCA_DATA_DIR=/var/data` |
| Nama pengguna | `FCA_ACCESS_USER=inspector` |
| Kata laluan | `FCA_ACCESS_PASSWORD` — nilai kuat dan unik dalam tetapan rahsia |
| Disk | Mount `/var/data`, sekurang-kurangnya 1 GB |

Gunakan satu instance API sahaja. Disk mesti kekal antara deployment; jangan simpan rekod dalam filesystem sementara. Folder data dari sesi Codex tidak berpindah ke Render secara automatik. Jika sudah ada rekod, sandarkan dan pindahkan keseluruhan folder data dengan berhati-hati melalui saluran pentadbiran yang selamat.

## Semakan selepas deploy

- Pautan HTTPS meminta log masuk. API `/api/projects` dan imej tidak boleh dicapai tanpa kelayakan; `/api/health` boleh memberi respons 200 tanpa log masuk.
- Muat naik satu pelan, tambah ruang, simpan pemeriksaan dan pastikan rekod masih ada selepas service dimulakan semula.
- Cuba ambil/pilih gambar melalui telefon pada pautan HTTPS tersebut.
- Buat sandaran berkala bagi keseluruhan disk data; disk kekal bukan pengganti sandaran.

Untuk penggunaan rasmi berbilang pemeriksa, perlu akaun individu, kawalan akses, audit, pangkalan data dan pengurusan sandaran yang bersesuaian. Konfigurasi Render ini telah disediakan untuk semakan; deployment sebenar dan penyimpanan data pada Render belum disahkan.
