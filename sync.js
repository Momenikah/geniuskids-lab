import { validateFamily, snapshot, sameFamily } from './family-data.js';

// One atomic local record contains both the outbox and the acknowledged cloud revision.
// Stale writes are rejected by Supabase and never silently overwrite another device.
export class FamilySync {
  constructor({ userId, initial, hasLegacy = false, storage = localStorage, transport = (...args) => fetch(...args), onData = () => {}, onStatus = () => {}, canApply = () => true, delay = 900 }) {
    Object.assign(this, { userId, storage, transport, onData, onStatus, canApply, delay });
    this.key = `genius-kids-lab-v1:${userId}`;
    this.raw = storage.getItem(this.key);
    const cached = this.raw ? JSON.parse(this.raw) : null;
    this.record = cached?.profiles ? { data: cached, revision: 0, dirty: true, updatedAt: null } : cached || { data: initial, revision: 0, dirty: hasLegacy, updatedAt: null };
    validateFamily(this.record.data, { limits: false });
    if (!Number.isSafeInteger(this.record.revision) || this.record.revision < 0) throw Error('Cadangan sinkronisasi tidak valid.');
    this.state = 'loading'; this.conflict = null; this.running = null; this.timer = null; this.backoff = 1000;
    onData(structuredClone(this.record.data), false);
  }
  status(state, message) { this.state = state; this.message = message; this.onStatus({ state, message, dirty: this.record.dirty, updatedAt: this.record.updatedAt }); }
  write(record, { force = false } = {}) {
    const stored = this.storage.getItem(this.key);
    if (!force && stored !== this.raw) {
      this.conflict = { ...JSON.parse(stored), source: 'tab' };
      this.draft = structuredClone(record.data);
      this.status('conflict', 'Ada perubahan di tab lain. Pilih versi sebelum melanjutkan.');
      return false;
    }
    try {
      const raw = JSON.stringify(record);
      this.storage.setItem(this.key, raw);
      this.raw = raw; this.record = record;
      return true;
    } catch {
      this.status('error', 'Penyimpanan perangkat penuh. Ekspor jurnal sebelum menutup halaman.');
      return false;
    }
  }
  save(data) {
    let clean;
    try { clean = { ...validateFamily(data, { limits: false }), active: data.active }; }
    catch (error) { this.status('error', error.message); return false; }
    if (this.conflict) {
      this.draft = clean;
      this.status('conflict', 'Selesaikan perbedaan versi sebelum menyimpan perubahan berikutnya.');
      return false;
    }
    const changed = !sameFamily(snapshot(clean), snapshot(this.record.data));
    if (!this.write({ ...this.record, data: clean, dirty: this.record.dirty || changed })) return false;
    try { validateFamily(clean); } catch (error) { clearTimeout(this.timer); this.status('error', error.message); return true; }
    if (this.record.dirty) { this.status('pending', 'Tersimpan di perangkat · menunggu sinkronisasi'); this.schedule(); }
    return true;
  }
  schedule(wait = this.delay, pull = false) { clearTimeout(this.timer); this.timer = setTimeout(() => pull ? this.refresh() : this.flush(), wait); }
  async request(method, body) {
    let response;
    try {
      response = await this.transport('/api/family', { method, credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(20000),
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'GeniusKidsLab', 'X-GKL-User': this.userId },
        ...(body ? { body: JSON.stringify(body) } : {}) });
    } catch { throw Error('Belum terhubung. Perubahan tetap tersimpan di perangkat.'); }
    const data = await response.json();
    if (response.status === 409 && data.conflict) {
      if (data.data) validateFamily(data.data);
      if (!Number.isSafeInteger(data.revision) || data.revision < 0) throw Error('Respons konflik tidak valid.');
      return data;
    }
    if (!response.ok) {
      const error = new Error(data.error || 'Sinkronisasi belum tersedia.'); error.status = response.status; throw error;
    }
    if (data.data) validateFamily(data.data);
    if (!Number.isSafeInteger(data.revision) || data.revision < 0) throw Error('Respons sinkronisasi tidak valid.');
    return data;
  }
  apply(data, revision, updatedAt, dirty = false, force = false) {
    const active = data.profiles.some(p => p.id === this.record.data.active) ? this.record.data.active : data.profiles[0].id;
    const next = { data: { ...data, active }, revision, updatedAt, dirty };
    if (!this.write(next, { force })) return false;
    this.onData(structuredClone(next.data), true);
    return true;
  }
  async work(pull) {
    if (this.conflict) return false;
    if (this.running) return this.running;
    clearTimeout(this.timer);
    this.running = Promise.resolve().then(async () => {
      try {
        if (this.storage.getItem(this.key) !== this.raw) { this.externalChange(); return false; }
        if (pull && !this.record.dirty) {
          this.status('syncing', 'Memeriksa data tersimpan…');
          const before = this.raw, cloud = await this.request('GET');
          if (before !== this.raw) return false; // Edits made during the read win locally and will be sent next.
          if (cloud.data) {
            if (!this.canApply()) { this.status('pending', 'Selesaikan isian lalu sinkronkan kembali.'); return false; }
            if (!sameFamily(snapshot(this.record.data), cloud.data)) {
              if (!this.apply(cloud.data, cloud.revision, cloud.updatedAt)) return false;
            } else if (!this.write({ ...this.record, revision: cloud.revision, updatedAt: cloud.updatedAt })) return false;
          } else if (!this.write({ ...this.record, dirty: true })) return false;
        }
        while (this.record.dirty && !this.conflict) {
          this.status('syncing', 'Menyinkronkan ke akun…');
          const sent = snapshot(this.record.data), revision = this.record.revision;
          try { validateFamily(sent); } catch (error) { error.status = 400; throw error; }
          const cloud = await this.request('POST', { data: sent, revision });
          if (this.storage.getItem(this.key) !== this.raw) { this.externalChange(); return false; }
          if (cloud.conflict) {
            this.conflict = { ...cloud, source: 'cloud' };
            this.status('conflict', 'Data berubah di perangkat lain. Kedua versi tetap tersedia untuk ditinjau.');
            return false;
          }
          if (!this.write({ ...this.record, revision: cloud.revision, updatedAt: cloud.updatedAt, dirty: !sameFamily(sent, snapshot(this.record.data)) })) return false;
        }
        this.backoff = 1000;
        this.status('synced', 'Tersinkron ke akun');
        return true;
      } catch (error) {
        this.status(error.status === 401 ? 'signedout' : error.status && error.status < 500 ? 'error' : 'offline', error.message);
        if (!error.status || error.status >= 500) { this.schedule(this.backoff, true); this.backoff = Math.min(this.backoff * 2, 30000); }
        return false;
      } finally {
        this.running = null;
        if (this.record.dirty && this.state === 'pending') this.schedule();
      }
    });
    return this.running;
  }
  flush() { return this.work(false); }
  refresh() { return this.work(true); }
  externalChange() {
    const raw = this.storage.getItem(this.key);
    if (raw === this.raw) return;
    try {
      const record = JSON.parse(raw);
      validateFamily(record.data, { limits: false });
      if (sameFamily(snapshot(record.data), snapshot(this.record.data)) && !this.conflict) {
        this.raw = raw; this.record = record;
        this.status(record.dirty ? 'pending' : 'synced', record.dirty ? 'Menunggu sinkronisasi tab lain' : 'Tersinkron ke akun');
      } else {
        this.conflict = { ...record, source: 'tab' };
        this.status('conflict', 'Ada perubahan di tab lain. Pilih versi sebelum melanjutkan.');
      }
    } catch { this.status('error', 'Data tab lain tidak dapat dibaca. Ekspor cadangan sebelum memuat ulang.'); }
  }
  async resolve(choice) {
    if (!this.conflict) return false;
    const candidate = this.conflict;
    // Recheck the other tab's record: never accept a version which has already changed again.
    if (candidate.source === 'tab' && this.storage.getItem(this.key) !== JSON.stringify({ data: candidate.data, revision: candidate.revision, dirty: candidate.dirty, updatedAt: candidate.updatedAt })) {
      const latest = JSON.parse(this.storage.getItem(this.key));
      if (!sameFamily(latest, { data: candidate.data, revision: candidate.revision, dirty: candidate.dirty, updatedAt: candidate.updatedAt })) { this.externalChange(); return false; }
    }
    const data = choice === 'remote' ? snapshot(candidate.data || { version: 1, profiles: [{ id: 'first', name: 'Ilmuwan Cilik', age: 8, entries: {} }] }) : snapshot(this.draft || this.record.data);
    const revision = candidate.revision, dirty = choice === 'local' || (candidate.source === 'tab' && candidate.dirty);
    if (!this.apply(data, revision, candidate.updatedAt, dirty, candidate.source === 'tab')) return false;
    this.conflict = null; this.draft = null;
    return this.refresh();
  }
  dispose() { clearTimeout(this.timer); }
}
