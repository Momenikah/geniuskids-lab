// Shared validation for cloud snapshots and imported backups.
export const MAX_FAMILY_BYTES = 3 * 1024 * 1024;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = message => { throw new Error(message); };
export function validateFamily(value, { limits = true } = {}) {
  if (!plain(value) || value.version !== 1 || !Array.isArray(value.profiles) || value.profiles.length < 1 || value.profiles.length > 5) fail('Data keluarga harus berisi 1–5 profil.');
  const ids = new Set();
  const profiles = value.profiles.map(profile => {
    if (!plain(profile) || typeof profile.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(profile.id) || ids.has(profile.id)) fail('ID profil tidak valid atau duplikat.');
    ids.add(profile.id);
    if (typeof profile.name !== 'string' || !profile.name.trim() || profile.name.length > 35 || !Number.isInteger(profile.age) || profile.age < 4 || profile.age > 17 || !plain(profile.entries)) fail('Nama atau usia profil tidak valid.');
    const entries = {};
    for (const [mission, entry] of Object.entries(profile.entries)) {
      if (!/^(?:[1-9][0-9]?|100)$/.test(mission) || !plain(entry)) fail('Nomor misi atau jurnal tidak valid.');
      const clean = {};
      for (const [key, item] of Object.entries(entry)) {
        if (['prediction','observation','measurement','revision'].includes(key)) {
          if (typeof item !== 'string' || (limits && item.length > 10000)) fail('Setiap kolom jurnal maksimal 10.000 karakter.');
        } else if (['started','safe','learned','done'].includes(key)) {
          if (typeof item !== 'boolean') fail('Status progres tidak valid.');
        } else if (['updated','completedAt'].includes(key)) {
          if (typeof item !== 'string' || item.length > 40 || !Number.isFinite(Date.parse(item))) fail('Tanggal jurnal tidak valid.');
        } else if (['materials','steps'].includes(key)) {
          if (!Array.isArray(item) || item.length > 100 || !item.every(n => Number.isInteger(n) && n >= 0 && n < 100)) fail('Checklist tidak valid.');
        } else if (key === 'trials') {
          if (!Array.isArray(item) || item.length > 30 || !item.every(t => typeof t === 'string' && t.length <= 200)) fail('Tabel percobaan tidak valid.');
        } else if (key === 'photo') {
          if (item !== null && (typeof item !== 'string' || (limits && item.length > 750000) || !/^data:image\/(jpeg|png|webp);base64,[a-zA-Z0-9+/]+={0,2}$/.test(item))) fail('Foto harus berupa JPG, PNG, atau WebP terkompresi, maksimal sekitar 550 KB.');
        } else fail('Jurnal memuat kolom yang tidak dikenal.');
        clean[key] = item;
      }
      entries[mission] = clean;
    }
    return { id: profile.id, name: profile.name, age: profile.age, entries };
  });
  const result = { version: 1, profiles };
  if (limits && new TextEncoder().encode(JSON.stringify(result)).length > MAX_FAMILY_BYTES) fail('Data keluarga melebihi 3 MB. Ekspor cadangan lalu kurangi foto sebelum sinkronisasi.');
  return result;
}
export function snapshot(value) { return { version: 1, profiles: structuredClone(value.profiles) }; }
export function sameFamily(a, b) {
  const stable = value => Array.isArray(value) ? value.map(stable) : plain(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
  return JSON.stringify(stable(a)) === JSON.stringify(stable(b));
}
