/* مخزن في الذاكرة يحاكي واجهة firestoreStore (create-only، batchGet، استعلامات) لاختبار المسار كاملاً بلا شبكة. */
export function fakeStore({ devices = {}, maps = {}, employees = {} } = {}) {
  const records = new Map(), pending = new Map(), calls = { n: 0 };
  const c = f => (...a) => { calls.n++; return f(...a); };
  return {
    records, pending, calls, devices, employees,
    getDevice: c(async id => devices[id] || null),
    findDeviceBySn: c(async sn => { const k = Object.keys(devices).find(k => devices[k].sn === sn); return k ? { id: k, ...devices[k] } : null; }),
    getMaps: c(async ids => new Map(ids.filter(i => maps[i]).map(i => [i, maps[i]]))),
    getEmployees: c(async ids => new Map(ids.filter(i => employees[i]).map(i => [i, employees[i]]))),
    findByBioIds: c(async codes => Object.entries(employees).filter(([, e]) => codes.includes(String(e.bioId))).map(([id, e]) => ({ id, ...e }))),
    dayTimes: c(async (emp, from, to) => [...records.entries()].filter(([k, v]) => k.startsWith(`employees/${emp}/`) && +v.time >= from && +v.time < to).map(([, v]) => +v.time)),
    createRecords: c(async items => items.map(it => { if (records.has(it.path)) return 'exists'; records.set(it.path, it.data); return 'created'; })),
    createPending: c(async items => items.map(it => { if (pending.has(it.path)) return 'exists'; pending.set(it.path, it.data); return 'created'; })),
    touchDevice: c(async (id, patch) => { Object.assign(devices[id], patch); })
  };
}
