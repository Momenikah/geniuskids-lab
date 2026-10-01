import { test, expect } from '@playwright/test';
const synced = page => expect(page.getByRole('button',{name:'Sinkronisasi: Tersinkron ke akun',exact:true})).toBeVisible();
async function login(page) {
  await page.goto('/#login');
  await page.getByLabel('Alamat email').fill('sync@example.test');
  await page.getByLabel('Password',{exact:true}).fill('browser-sync-password');
  await page.getByRole('button',{name:'Masuk ke lab'}).click();
  await expect(page.getByRole('heading',{name:/Halo,/})).toBeVisible();
  await synced(page);
}
test('two devices share profile, progress and photos; offline drafts survive conflicting writes',async({browser})=>{
  const contextA=await browser.newContext(),contextB=await browser.newContext();
  const a=await contextA.newPage(),b=await contextB.newPage(),errors=[];
  for(const page of [a,b])page.on('pageerror',error=>errors.push(error.message));
  try{
    await login(a);await a.goto('/#parent');
    await a.getByLabel('Nama panggilan').fill('Nara');await a.getByLabel('Usia',{exact:true}).fill('10');
    await a.getByRole('button',{name:'Simpan profil',exact:true}).click();await synced(a);
    await a.goto('/#mission/1');await a.getByLabel('Kami sudah membaca petunjuk keamanan bersama.').check();
    await a.getByRole('button',{name:'Siap, mulai misi'}).click();await a.getByRole('tab',{name:/Catat/}).click();
    await a.getByLabel('Apa yang kamu lihat?').fill('Jurnal dari perangkat A');
    await a.locator('#photo').setInputFiles('assets/icon-192.png');
    await expect(a.getByRole('img',{name:'Foto percobaan',exact:true})).toBeVisible();
    await a.getByRole('button',{name:'Tandai misi selesai'}).click();
    await a.getByRole('button',{name:'Tutup',exact:true}).click();await synced(a);
    await login(b);await expect(b.getByRole('heading',{name:'Halo, Nara!'})).toBeVisible();
    await b.goto('/#parent');await expect(b.getByLabel('Usia',{exact:true})).toHaveValue('10');
    await b.goto('/#journal');await expect(b.getByText('Jurnal dari perangkat A',{exact:true})).toBeVisible();
    await expect(b.getByRole('img',{name:/Foto percobaan/})).toBeVisible();await expect(b.getByText('✓ Selesai',{exact:true})).toBeVisible();
    await contextB.setOffline(true);await b.goto('/#mission/2/journal');
    await b.getByLabel('Apa yang kamu lihat?').fill('Draf offline perangkat B');await b.getByRole('button',{name:'Simpan jurnal',exact:true}).click();
    await expect(b.locator('#sync-status')).toHaveAttribute('data-state','offline');
    await a.goto('/#parent');await a.getByLabel('Nama panggilan').fill('Nara Baru');
    await a.getByRole('button',{name:'Simpan profil',exact:true}).click();await synced(a);
    await contextB.setOffline(false);await expect(b.locator('#sync-status')).toHaveAttribute('data-state','conflict');
    await b.locator('#sync-status').click();const dialog=b.getByRole('dialog');
    await expect(dialog.getByRole('button',{name:'Unduh versi perangkat'})).toBeVisible();
    await expect(dialog.getByRole('button',{name:'Unduh versi lain'})).toBeVisible();
    await b.screenshot({path:'test-results/sync-conflict.png',fullPage:true});
    b.once('dialog',dialog=>dialog.accept());await dialog.getByRole('button',{name:'Gunakan versi perangkat ini',exact:true}).click();await synced(b);
    await a.reload();await a.goto('/#journal');
    await expect(a.getByText('Draf offline perangkat B',{exact:true})).toBeVisible();
    await expect(a.getByText('Jurnal dari perangkat A',{exact:true})).toBeVisible();
    expect(errors).toEqual([]);
  }finally{await contextA.close();await contextB.close()}
});
