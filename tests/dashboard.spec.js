import { test, expect } from '@playwright/test';

function projects() {
  const rooms = Array.from({ length: 12 }, (_, i) => ({ id: `room-${i}`, name: i ? `Ruang ${i + 1}` : 'Pejabat pentadbiran', number: String(i + 1).padStart(4, '0'), code: `D 01 ${String(i + 1).padStart(4, '0')}`, reviewed: i < 8, bounds: { x: 5 + i % 4 * 20, y: 5 + Math.floor(i / 4) * 25, width: 15, height: 15 } }));
  const inspections = [
    { id: 'record-1', roomId: 'room-0', photoId: 'photo-1', damageType: 'Retak pada dinding', description: 'Retak di sudut bukaan.', remedial: 'Ukur dan semak punca retak.', severity: 'Tinggi', reviewed: false, inspector: '', createdAt: '2026-10-28T03:00:00Z' },
    { id: 'record-2', roomId: 'room-1', photoId: 'photo-2', damageType: 'Kesan lembapan pada siling', description: 'Kesan lembapan.', remedial: 'Semak punca kebocoran.', severity: 'Sederhana', reviewed: false, inspector: '', createdAt: '2026-10-27T03:00:00Z' },
    { id: 'record-3', roomId: 'room-2', photoId: 'photo-3', damageType: 'Cat mengelupas', description: 'Cat terkopek.', remedial: 'Semak keadaan permukaan.', severity: 'Rendah', reviewed: true, inspector: 'Pemeriksa ujian', createdAt: '2026-10-26T03:00:00Z' },
  ];
  return [
    { id: 'project-d', name: 'Blok Pentadbiran', building: 'D', floor: '01', plan: { id: 'plan-d', url: '/uploads/plan-d.png', width: 800, height: 600 }, rooms, inspections },
    { id: 'project-b', name: 'Blok Makmal', building: 'B', floor: '02', plan: null, rooms: [], inspections: [] },
    { id: 'project-c', name: 'Blok Perpustakaan', building: 'C', floor: '01', plan: null, rooms: [], inspections: [] },
  ];
}

async function mock(page, data) {
  await page.route('**/api/projects', route => route.fulfill({ json: data }));
  await page.route('**/api/health', route => route.fulfill({ json: { aiEnabled: false, provider: 'openai' } }));
  await page.route('**/uploads/*.png', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#dce1d2"/><path d="M50 50H750V550H50ZM400 50V550M50 300H750" fill="none" stroke="#8d9b7b" stroke-width="5"/></svg>' }));
}

test('dashboard statistics use the active project and link to the correct report filters', async ({ page }, info) => {
  await mock(page, projects());
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Dashboard projek', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Blok Pentadbiran', exact: true })).toBeVisible();
  await expect(page.locator('.dashboard-scope')).toHaveText('Blok D · Aras 01');
  await expect(page.getByRole('button', { name: 'Lihat ruang berdaftar', exact: true }).locator('strong')).toHaveText('12');
  await expect(page.getByRole('button', { name: 'Lihat pemeriksaan draf', exact: true }).locator('strong')).toHaveText('2');
  await expect(page.getByRole('button', { name: 'Lihat pemeriksaan disahkan', exact: true }).locator('strong')).toHaveText('1');
  await page.screenshot({ path: info.outputPath('dashboard-populated.png'), fullPage: true });
  await page.getByRole('button', { name: 'Lihat pemeriksaan draf', exact: true }).click();
  await expect(page).toHaveURL(/#report$/);
  await expect(page.getByLabel('Tapis status laporan')).toHaveValue('draft');
  await expect(page.locator('.report-record')).toHaveCount(2);
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Dashboard projek', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Lihat pemeriksaan disahkan', exact: true }).click();
  await expect(page.getByLabel('Tapis status laporan')).toHaveValue('reviewed');
  await expect(page.locator('.report-record')).toHaveCount(1);
});

test('project search opens the selected floor and preserves it across reloads', async ({ page }, info) => {
  await mock(page, projects());
  await page.goto('/');
  await page.getByLabel('Cari projek').fill('tidak wujud');
  await expect(page.getByRole('heading', { name: 'Tiada projek sepadan' })).toBeVisible();
  await page.getByRole('button', { name: 'Kosongkan carian', exact: true }).click();
  await page.getByLabel('Cari projek').fill('makmal');
  await expect(page.locator('.dashboard-project')).toHaveCount(1);
  await page.getByRole('button', { name: 'Buka projek Blok Makmal, blok B, aras 02', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Pelan & daftar aset', exact: true })).toBeVisible();
  await expect(page.getByLabel(info.project.name === 'desktop' ? 'Projek aktif' : 'Tukar projek')).toHaveValue('project-b');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Pelan & daftar aset', exact: true })).toBeVisible();
  await expect(page.getByLabel(info.project.name === 'desktop' ? 'Projek aktif' : 'Tukar projek')).toHaveValue('project-b');
  await page.getByRole('navigation', { name: 'Navigasi utama' }).getByRole('button', { name: 'Gambaran keseluruhan', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Blok Makmal', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lihat ruang berdaftar', exact: true }).locator('strong')).toHaveText('0');
});

test('project shortcuts retain the existing unsaved-inspection guard', async ({ page }) => {
  await mock(page, projects());
  await page.goto('/#inspection');
  await page.getByLabel('Deskripsi kerosakan').fill('Draf belum disimpan');
  await page.getByRole('navigation').getByRole('button', { name: 'Gambaran keseluruhan', exact: true }).click();
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Buka projek Blok Makmal, blok B, aras 02', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Blok Pentadbiran', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/#overview$/);
  await page.getByRole('navigation').getByRole('button', { name: 'Pemeriksaan', exact: true }).click();
  await expect(page.getByLabel('Deskripsi kerosakan')).toHaveValue('Draf belum disimpan');
});

test('empty dashboard, keyboard navigation and tablet project switching remain usable', async ({ page }, info) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await mock(page, []);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Daftar projek pertama', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lihat ruang berdaftar', exact: true })).toBeDisabled();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Langkau ke kandungan utama' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  await page.screenshot({ path: info.outputPath('dashboard-empty.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(page.getByLabel('Tukar projek')).toBeVisible();
  for (const label of ['Gambaran keseluruhan', 'Pelan & daftar aset', 'Pemeriksaan', 'Laporan']) {
    await expect(page.getByRole('navigation').getByRole('button', { name: label, exact: true })).toBeVisible();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.getByRole('navigation').getByRole('button', { name: 'Laporan', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Laporan pemeriksaan', exact: true })).toBeFocused();
  await expect(page.getByRole('navigation').getByRole('button', { name: 'Laporan', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Dashboard projek', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
