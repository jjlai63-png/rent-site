// GitHub Pages version of the ledger's `window.claude.use('db')` runtime.
//
// The page is hosted on GitHub Pages (static), but the data stays in a private
// GitHub repo. Every document is one file under <path>/<collection>/<id>.json,
// exactly like the local server's db/ folder, and is read/written through the
// GitHub Contents API with a fine-grained token kept in this browser only.
//
// If no GitHub settings are saved it falls back to the local PowerShell server
// (GET /api/db) so the same index.html still works on a Windows PC.
(function () {
  if (window.claude && window.claude.use) return;   // already provided

  const KEY = 'rentdb.github';
  const COLLECTIONS = ['rooms', 'months', 'config'];
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  const merge = (a, b) => { const o = { ...a }; for (const k in b) o[k] = isObj(b[k]) && isObj(o[k]) ? merge(o[k], b[k]) : b[k]; return o; };
  const clone = v => JSON.parse(JSON.stringify(v));

  /* ---------- settings ---------- */
  const detect = () => {
    const out = { owner: '', repo: '', branch: 'main', path: 'db' };
    // <meta name="rent-data" content="owner/repo"> wins: the Pages repo may be a
    // public frontend while the data lives in a separate private repo.
    const meta = typeof document !== 'undefined' && document.querySelector
      ? document.querySelector('meta[name="rent-data"]') : null;
    if (meta && meta.content && meta.content.includes('/')) {
      const [o, r] = meta.content.split('/').map(s => s.trim());
      if (o && r) { out.owner = o; out.repo = r; return out; }
    }
    const m = /^([^.]+)\.github\.io$/i.exec(location.hostname || '');
    if (m) {
      out.owner = m[1];
      const seg = decodeURIComponent((location.pathname.split('/').filter(Boolean)[0] || ''));
      out.repo = seg || (m[1] + '.github.io');
    }
    return out;
  };
  const stored = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } };
  function config() {
    const out = detect(), s = stored();
    for (const k of ['owner', 'repo', 'branch', 'path', 'token']) if (s[k] != null && s[k] !== '') out[k] = s[k];
    return out;
  }
  const configured = c => !!(c.token && c.owner && c.repo);

  /* ---------- base64 / text ---------- */
  function b64ToText(b64) {
    const bin = atob(String(b64 || '').replace(/\s+/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function textToB64(text) {
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  /* ---------- tiny IndexedDB cache keyed by blob sha ----------
     A load only fetches blobs whose sha is new, so a normal reload is one
     request (the tree) instead of one request per month file. */
  const idb = (() => {
    let openP = null;
    const open = () => openP || (openP = new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error('no indexedDB'));
      const r = indexedDB.open('rent-ledger-cache', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('blobs');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }));
    const run = async (mode, fn) => {
      const db = await open();
      return new Promise((res, rej) => {
        const t = db.transaction('blobs', mode);
        const req = fn(t.objectStore('blobs'));
        t.oncomplete = () => res(req ? req.result : undefined);
        t.onerror = t.onabort = () => rej(t.error);
      });
    };
    return {
      get: k => run('readonly', s => s.get(k)).catch(() => null),
      put: (k, v) => run('readwrite', s => s.put(v, k)).catch(() => {}),
      del: k => run('readwrite', s => s.delete(k)).catch(() => {}),
      keys: () => run('readonly', s => s.getAllKeys()).catch(() => []),
    };
  })();

  async function eachLimit(items, limit, fn) {
    let i = 0;
    const run = async () => { while (i < items.length) { const n = i++; await fn(items[n], n); } };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  }

  /* ---------- GitHub REST ---------- */
  const enc = p => String(p).split('/').map(encodeURIComponent).join('/');
  async function api(c, path, opts = {}) {
    const res = await fetch('https://api.github.com' + path, {
      ...opts,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer ' + c.token,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
        ...(opts.headers || {}),
      },
    });
    if (!res.ok) {
      let msg = '';
      try { msg = (await res.json()).message || ''; } catch (e) {}
      const err = new Error(`GitHub ${res.status}${msg ? '：' + msg : ''}`);
      err.status = res.status;
      throw err;
    }
    return res.status === 204 ? null : res.json();
  }

  const filePath = (c, col, id) => `${String(c.path || 'db').replace(/^\/+|\/+$/g, '')}/${col}/${encodeURIComponent(id)}.json`;

  async function ghFile(c, col, id) {
    const p = enc(filePath(c, col, id));
    try {
      const d = await api(c, `/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/contents/${p}?ref=${encodeURIComponent(c.branch || 'main')}`);
      return { sha: d.sha, data: JSON.parse(b64ToText(d.content)) };
    } catch (e) {
      if (e.status === 404) return { sha: null, data: undefined };
      throw e;
    }
  }
  async function ghPut(c, col, id, data, sha) {
    const body = {
      message: `${sha ? 'update' : 'create'} ${col}/${id}`,
      content: textToB64(JSON.stringify(data, null, 2) + '\n'),
      branch: c.branch || 'main',
    };
    if (sha) body.sha = sha;
    const res = await api(c, `/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/contents/${enc(filePath(c, col, id))}`,
      { method: 'PUT', body: JSON.stringify(body) });
    return res.content.sha;
  }
  async function ghDelete(c, col, id, sha) {
    const body = { message: `delete ${col}/${id}`, sha, branch: c.branch || 'main' };
    await api(c, `/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/contents/${enc(filePath(c, col, id))}`,
      { method: 'DELETE', body: JSON.stringify(body) });
  }

  const cache = {};                 // { collection: { id: doc } }
  const colSubs = {}, docSubs = {};
  const chains = {};
  let mode = null;                  // 'github' | 'local'
  let active = null;                // the config used for this session

  async function ghLoad(c) {
    const o = encodeURIComponent(c.owner), r = encodeURIComponent(c.repo), ref = encodeURIComponent(c.branch || 'main');
    const root = String(c.path || 'db').replace(/^\/+|\/+$/g, '');
    const tree = await api(c, `/repos/${o}/${r}/git/trees/${ref}?recursive=1`);
    if (!tree.tree) throw new Error('讀不到 repo 的檔案樹');
    const prefix = root ? root + '/' : '';
    const files = tree.tree
      .filter(x => x.type === 'blob' && x.path.startsWith(prefix) && x.path.endsWith('.json'))
      .map(x => {
        const rel = x.path.slice(prefix.length).split('/');
        return rel.length === 2 ? { col: rel[0], id: rel[1].slice(0, -5), sha: x.sha } : null;
      })
      .filter(f => f && COLLECTIONS.includes(f.col));

    const total = files.length, keep = new Set(files.map(f => f.sha)), sync = document.getElementById('sync');
    let done = 0;
    await eachLimit(files, 6, async f => {
      let text = await idb.get(f.sha);
      if (text == null) {
        const blob = await api(c, `/repos/${o}/${r}/git/blobs/${f.sha}`);
        text = b64ToText(blob.content);
        await idb.put(f.sha, text);
      }
      (cache[f.col] ||= {})[f.id] = JSON.parse(text);
      done++;
      if (sync && total > 20) sync.textContent = `載入中 ${done}/${total}`;
    });
    const keys = await idb.keys();
    for (const k of keys) if (!keep.has(k)) await idb.del(k);
  }

  async function localLoad() {
    const r = await fetch('/api/db', { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    Object.assign(cache, await r.json());
  }

  window.rentGh = {
    lastError: '',
    mode: () => mode,
    config,
    detect,
    saveConfig: c => localStorage.setItem(KEY, JSON.stringify(c)),
    clearConfig: () => localStorage.removeItem(KEY),
    async test(c) {
      if (!c.owner || !c.repo || !c.token) throw new Error('owner、repo、token 都要填');
      const repo = await api(c, `/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}`);
      let pathOk = false;
      try {
        await api(c, `/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/contents/${enc(String(c.path || 'db').replace(/^\/+|\/+$/g, ''))}?ref=${encodeURIComponent(c.branch || 'main')}`);
        pathOk = true;
      } catch (e) { if (e.status !== 404) throw e; }
      return { repo: repo.full_name, private: !!repo.private, push: !!(repo.permissions && repo.permissions.push), pathOk };
    },
  };

  const ready = (async () => {
    const c = config();
    if (configured(c)) {
      try {
        active = c;
        await ghLoad(c);
        mode = 'github';
        return;
      } catch (e) {
        window.rentGh.lastError = e.message || String(e);
      }
    }
    try {
      await localLoad();
      mode = 'local';
      return;
    } catch (e) {
      if (!window.rentGh.lastError) window.rentGh.lastError = '尚未設定 GitHub 連線';
    }
    throw new Error(window.rentGh.lastError);
  })();

  /* ---------- same API surface the page expects ---------- */
  const colSnap = col => ({ docs: Object.keys(cache[col] || {}).sort().map(id => ({ id, data: () => clone(cache[col][id]) })) });
  const docSnap = (col, id) => { const d = cache[col]?.[id]; return { id, exists: d !== undefined, data: () => (d === undefined ? undefined : clone(d)) }; };
  function emit(col, id) {
    (colSubs[col] || []).forEach(cb => cb(colSnap(col)));
    (docSubs[col + '/' + id] || []).forEach(cb => cb(docSnap(col, id)));
  }
  function subscribe(table, key, cb, fail, snap) {
    (table[key] ||= []).push(cb);
    ready.then(() => cb(snap()), err => fail && fail(err));
    return () => { table[key] = table[key].filter(x => x !== cb); };
  }

  function write(col, id, make) {
    const key = col + '/' + id;
    const run = async () => {
      await ready;
      let next;
      if (mode === 'github') {
        for (let attempt = 0; ; attempt++) {
          const f = await ghFile(active, col, id);
          next = make(f.data === undefined ? undefined : clone(f.data));
          try {
            if (next === null) { if (f.sha) await ghDelete(active, col, id, f.sha); }
            else { const sha = await ghPut(active, col, id, next, f.sha); await idb.put(sha, JSON.stringify(next)); }
            break;
          } catch (e) {
            if (attempt < 2 && e.status === 409) continue;   // someone else committed: re-read and retry
            throw e;
          }
        }
      } else {
        next = make(cache[col]?.[id]);
        const r = await fetch(`/api/db/${col}/${encodeURIComponent(id)}`, {
          method: next === null ? 'DELETE' : 'PUT',
          headers: next === null ? {} : { 'Content-Type': 'application/json' },
          body: next === null ? undefined : JSON.stringify(next, null, 2),
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
      }
      cache[col] ||= {};
      if (next === null) delete cache[col][id]; else cache[col][id] = next;
      emit(col, id);
    };
    const p = (chains[key] || Promise.resolve()).then(run, run);
    chains[key] = p.catch(() => {});
    return p;
  }

  const db = {
    collection: col => ({ onSnapshot: (cb, fail) => subscribe(colSubs, col, cb, fail, () => colSnap(col)) }),
    doc: path => {
      const [col, id] = path.split('/');
      return {
        onSnapshot: (cb, fail) => subscribe(docSubs, path, cb, fail, () => docSnap(col, id)),
        set: data => write(col, id, () => clone(data)),
        update: patch => write(col, id, cur => {
          if (cur === undefined) throw new Error('document not found: ' + path);
          return merge(cur, clone(patch));
        }),
        delete: () => write(col, id, () => null),
      };
    },
  };

  const downloads = {
    async save({ filename, data }) {
      const blob = data instanceof Blob ? data : new Blob([data], { type: typeof data === 'string' ? 'text/csv;charset=utf-8' : 'application/octet-stream' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    },
  };

  window.claude = {
    // 'sample' (meter-photo reading by Claude) only exists on claude.ai.
    use: async name => {
      if (name === 'downloads') return downloads;
      if (name !== 'db') return null;
      try { await ready; } catch (e) { return null; }
      return db;
    },
  };
})();
