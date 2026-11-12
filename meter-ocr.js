// Offline meter reading OCR for the rent ledger.
//
// Runs entirely in the browser: no API key, no network, no Tesseract. It finds
// the row of digits on a single-meter photo, decodes each 32x48 glyph with a
// small template bank, applies the previous reading as a sanity constraint,
// and rounds the 0.1 kWh wheel half-up.
//
// Templates come from three places:
//   1. six glyphs seeded from the first real photo (2 4 7 2 3 0),
//   2. digits rendered at runtime with the device's own fonts,
//   3. glyphs the user confirms on previous bills (IndexedDB, self-learning).
(function () {
  if (window.rentMeter) return;

  const GW = 32, GH = 48;
  const MAX_UP = 2500;          // kWh a room can plausibly add in one period
  const FONT_FAMILIES = ['sans-serif', 'Arial', 'Helvetica', 'Verdana', 'Tahoma', 'Trebuchet MS', 'system-ui', 'monospace', 'Courier New', 'Georgia'];
  const SEEDS = [[2, "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAABAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAQAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAABAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEBAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAQEBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEBAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAQEBAQEBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAQEBAQEBAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEBAQEBAQEBAAAAAAAAAAAAAQAAAQAAAAAAAAAAAQEBAQEBAQEBAQEAAAAAAAAAAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAAAAAAAAAAAAAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQAAAAAAAAAAAAABAQEBAQEBAQEBAQEBAQEBAQEBAQEAAAAAAAAAAAAAAQEBAQEBAQEBAQEBAQEBAQEBAQEBAAAAAAAAAAAAAAABAQEBAQEBAQEBAQEBAQEBAQEBAQEAAAAAAAAAAAAAAAEBAQEBAQEBAQEBAQEBAQEBAQAAAAAAAAAAAAAAAAAAAAABAQEBAQEBAQEBAQEBAQEAAAAAAAAAAAAAAAAAAAAAAAABAQEBAQEBAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEBAQEBAQEBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEBAQEBAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEBAQEBAQEBAQEBAQEBAQEAAAAAAAAAAAAAAAAAAAAAAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEAAAAAAAAAAAABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEAAAAAAAAAAAAAAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQAAAAAAAAAAAAAAAAAAAAABAQEBAQEBAQEBAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"], [4, "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEBAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEBAQEBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEBAQEBAQEBAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAEBAQEBAQEBAQEBAQAAAAAAAAAAAAAAAAAAAAAAAAABAQEBAQEBAQEBAQEBAAAAAAAAAAAAAAAAAAAAAAAAAQEBAQEBAQEAAAEBAQEBAAAAAAAAAAAAAAAAAAAAAAEBAQEBAQEAAAABAQEBAQEAAAAAAAAAAAAAAAAAAAABAQEBAQEBAAAAAAEBAQEBAAAAAAAAAAAAAAAAAAAAAQEBAQEBAQAAAAABAQEBAQEAAAAAAAAAAAAAAAAAAAEBAQEBAQEAAAAAAAEBAQEBAQAAAAAAAAAAAAAAAAEBAQEBAQEBAQAAAAAAAQEBAQEBAQAAAAAAAAAAAAAAAQEBAQEBAQEAAAAAAAABAQEBAQEBAAAAAAAAAAAAAQEBAQEBAQEBAQAAAAAAAQEBAQEBAQEAAAAAAAAAAQEBAQEBAQEBAQEAAAAAAAABAQEBAQEBAAAAAAAAAAABAQEBAQEBAQEBAAAAAAAAAAEBAQEBAQEBAAAAAAAAAAABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEAAAAAAAAAAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEAAAAAAAAAAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEAAAAAAAAAAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQAAAAAAAAAAAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQAAAAAAAAAAAAAAAAEBAQEBAQEBAQEBAQEBAQEBAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"], [7, "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEBAQEBAQEBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAQEBAQEBAQEBAQEBAQEBAQEBAQEAAAAAAAAAAAAAAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQAAAAAAAAABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQAAAAAAAAAAAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAQEBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEBAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEBAQEBAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEBAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEBAQEBAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAQEBAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEBAQEBAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAQEBAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEBAQEBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEBAQEBAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAQEBAQEBAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEBAQEBAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAQEBAQEBAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEBAQEBAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEBAQEBAQEBAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAABAQEBAQEBAQEBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAEBAQEBAQEBAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEBAQEBAQEBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAQEBAQEBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEBAQEBAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEBAQEBAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEBAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAQEBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEBAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"], [2, "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEBAQEBAQEBAQEAAAAAAAAAAAAAAAAAAAAAAAAAAQEBAQEBAQEBAQEBAQEBAQAAAAAAAAAAAAAAAAAAAQEBAQEBAQEBAQEBAQEBAQEBAQAAAAAAAAAAAAAAAAEBAQAAAAAAAAAAAAAAAAABAQEBAQAAAAAAAAAAAAABAQEAAAAAAAAAAAAAAAAAAAAAAQEBAQAAAAAAAAAAAAEBAQAAAAAAAAAAAAAAAAAAAAAAAAEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAQEBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEBAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEBAQEBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEBAQEBAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEBAQEBAQEBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAEBAQEBAQEBAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAABAQEBAQEBAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAABAQEBAQEBAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEBAQEBAQEBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAQEBAQEBAQEBAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAEBAQEBAQEBAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAEBAQEBAQEBAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAABAQEBAQEBAQEBAQAAAAAAAAAAAAAAAAAAAAAAAAABAQEBAQEBAQEBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAQEBAQEBAQEBAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAEBAQEBAQEBAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEBAQEBAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEBAQEBAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEBAQEBAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAQEBAQEBAQEBAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEAAAAAAAAAAAAAAAABAQEBAQEBAQEBAQEBAQEBAQEBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAABAQEBAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"], [3, "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEBAQEBAAEAAQEAAQAAAAAAAAAAAAAAAAAAAAAAAAABAQEBAQEBAQEBAQABAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAEBAQEBAQEBAQEBAQEBAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEBAAEBAQEBAQEBAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAQEBAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAQEBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEBAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEBAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEBAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEBAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEBAQEBAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAQEBAQEBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEBAQEBAQEBAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAEBAQEBAQEBAQEBAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAABAQEBAQEBAQEBAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAABAQEBAQEBAQEBAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAABAQEBAQEBAQEBAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAQEBAQEBAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAQEBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEBAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEBAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAQEBAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEBAQEBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEBAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAQEBAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEBAQEBAQAAAAABAQEBAQAAAAAAAAAAAAAAAAAAAAAAAQEBAQEAAAAAAAEBAQEBAAAAAAAAAAAAAAAAAAAAAAEBAQEBAAAAAAAAAQEBAQEBAAAAAAAAAAAAAAAAAAAAAQEBAQAAAAAAAAAAAQEBAQEBAQEBAAAAAAAAAAAAAQEBAQEAAAAAAAAAAAAAAQEBAQEBAQEBAQEBAQEBAQEBAQEAAAAAAAAAAAAAAAAAAAEBAQEBAQEBAQEBAQEBAQEBAAAAAAAAAAAAAAAAAAAAAAABAQEBAQEBAQEBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"], [0, "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEBAQAAAAAAAAAAAAAAAAAAAAAAAAABAQEAAAAAAAAAAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAEBAQAAAAAAAAABAQEBAAAAAAAAAAAAAAAAAAAAAAAAAQEBAAAAAAAAAQEBAQEAAAAAAAAAAAAAAAAAAAAAAAEBAQEAAAAAAAABAQEBAQAAAAAAAAAAAAAAAAAAAAAAAQEBAQAAAAAAAAEBAQEBAAAAAAAAAAAAAAAAAAAAAAABAQEBAAAAAAAAAQEBAQEAAAAAAAAAAAAAAAAAAAAAAAEBAQEBAAAAAAABAQEBAQAAAAAAAAAAAAAAAAAAAAAAAQEBAQEAAAAAAAEBAQEBAAAAAAAAAAAAAAAAAAAAAAABAQEBAQAAAAAAAQEBAQEAAAAAAAAAAAAAAAAAAAAAAQEBAQEBAAAAAAABAQEBAQAAAAAAAAAAAAAAAAAAAAABAQEBAQEAAAAAAQEBAQEBAAAAAAAAAAAAAAAAAAAAAAEBAQEBAQAAAAABAQEBAQEAAAAAAAAAAAAAAAAAAAABAQEBAQEAAAAAAAEBAQEBAQEBAAAAAAAAAAAAAAAAAAEBAQEBAQAAAAAAAQEBAQEBAQEBAQEAAAAAAAABAQEBAQEBAQEBAAAAAAABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQAAAAAAAAABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAAAAAAAAAAABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQAAAAAAAAAAAAAAAQEBAQEBAQEBAQEBAQEBAQEBAQEAAAAAAAAAAAAAAAAAAAABAQEBAQEBAQEBAQEBAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAEBAQEBAQEBAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"]];

  /* ---------- tiny canvas + array helpers ---------- */
  const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; };
  const g2d = c => c.getContext('2d', { willReadFrequently: true });
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

  function drawTo(src, maxW) {
    const iw = src.width || src.naturalWidth || src.videoWidth || 0;
    const ih = src.height || src.naturalHeight || src.videoHeight || 0;
    if (!iw || !ih) throw new Error('empty image');
    const s = Math.min(1, maxW / iw);
    const c = mkCanvas(Math.round(iw * s), Math.round(ih * s));
    const x = g2d(c);
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = 'high';
    x.drawImage(src, 0, 0, c.width, c.height);
    return c;
  }

  function rotateCanvas(src, ang) {
    const co = Math.abs(Math.cos(ang)), si = Math.abs(Math.sin(ang));
    const w = Math.round(src.width * co + src.height * si);
    const h = Math.round(src.width * si + src.height * co);
    const c = mkCanvas(w, h), x = g2d(c);
    x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
    x.translate(w / 2, h / 2);
    x.rotate(ang);
    x.drawImage(src, -src.width / 2, -src.height / 2);
    return c;
  }

  function percentile(hist, p) {
    let total = 0;
    for (let i = 0; i < 256; i++) total += hist[i];
    const want = total * p;
    let acc = 0;
    for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= want) return i; }
    return 255;
  }

  // Grayscale with a percentile stretch so the same thresholds work on dim
  // and bright photos.
  function analyze(canvas) {
    const w = canvas.width, h = canvas.height;
    const d = g2d(canvas).getImageData(0, 0, w, h).data;
    const gray = new Uint8Array(w * h), hist = new Uint32Array(256);
    for (let i = 0, j = 0; i < gray.length; i++, j += 4) {
      const v = (d[j] * 299 + d[j + 1] * 587 + d[j + 2] * 114) / 1000 | 0;
      gray[i] = v; hist[v]++;
    }
    const lo = percentile(hist, 0.02), hi = percentile(hist, 0.985);
    const span = Math.max(1, hi - lo), lut = new Uint8Array(256);
    for (let i = 0; i < 256; i++) lut[i] = clamp(Math.round((i - lo) * 255 / span), 0, 255);
    for (let i = 0; i < gray.length; i++) gray[i] = lut[gray[i]];
    return { w, h, gray, rgb: d };
  }

  /* ---------- connected components (run-length union-find) ---------- */
  function components(mask, w, h) {
    const parent = [];
    const find = x => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[b] = a; };

    const runs = [];      // flat y,x0,x1,label
    let prev = null;
    for (let y = 0; y < h; y++) {
      const off = y * w, cur = [];
      let x = 0;
      while (x < w) {
        while (x < w && !mask[off + x]) x++;
        if (x >= w) break;
        const x0 = x;
        while (x < w && mask[off + x]) x++;
        const x1 = x - 1;
        const lab = parent.length; parent.push(lab);
        cur.push(x0, x1, lab);
        runs.push(y, x0, x1, lab);
      }
      if (prev) {
        let i = 0, j = 0;
        while (i < prev.length && j < cur.length) {
          const a0 = prev[i], a1 = prev[i + 1], al = prev[i + 2];
          const b0 = cur[j], b1 = cur[j + 1], bl = cur[j + 2];
          if (a1 < b0) i += 3;
          else if (b1 < a0) j += 3;
          else {
            union(al, bl);
            if (a1 <= b1) i += 3;
            if (b1 <= a1) j += 3;
          }
        }
      }
      prev = cur;
    }

    const agg = new Map();
    for (let k = 0; k < runs.length; k += 4) {
      const y = runs[k], x0 = runs[k + 1], x1 = runs[k + 2], r = find(runs[k + 3]);
      let a = agg.get(r);
      if (!a) { a = { x0, x1, y0: y, y1: y, area: 0 }; agg.set(r, a); }
      if (x0 < a.x0) a.x0 = x0;
      if (x1 > a.x1) a.x1 = x1;
      if (y < a.y0) a.y0 = y;
      if (y > a.y1) a.y1 = y;
      a.area += x1 - x0 + 1;
    }
    const out = [];
    for (const a of agg.values()) {
      a.w = a.x1 - a.x0 + 1; a.h = a.y1 - a.y0 + 1;
      a.cx = (a.x0 + a.x1) / 2; a.cy = (a.y0 + a.y1) / 2;
      out.push(a);
    }
    return out;
  }

  const maskAt = (gray, thr, w, h) => {
    const m = new Uint8Array(w * h);
    for (let i = 0; i < m.length; i++) m[i] = gray[i] >= thr ? 1 : 0;
    return m;
  };

  const mean = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
  const std = a => { const m = mean(a); return Math.sqrt(mean(a.map(v => (v - m) * (v - m)))); };

  /* ---------- find the digit row ---------- */
  function scoreGroup(part, thr) {
    if (part.length < 4 || part.length > 8) return null;
    part.sort((a, b) => a.cx - b.cx);
    const hs = part.map(c => c.h), xs = part.map(c => c.cx);
    const hm = mean(hs), hsd = std(hs) / Math.max(1, hm);
    const gaps = [];
    for (let i = 1; i < xs.length; i++) gaps.push(xs[i] - xs[i - 1]);
    const gm = mean(gaps), gsd = gm ? std(gaps) / gm : 1;
    const pitch = gm / Math.max(1, hm);
    let score = part.length * 10 - hsd * 45 - gsd * 30 + hm * 0.80;
    if (pitch < 1.0 || pitch > 3.0) score -= 25;
    if (part.length > 6) score -= (part.length - 6) * 10;
    return { comps: part, score, thr, hm, pitch, angle: fitAngle(part) };
  }

  function pickGroup(comps, w, h, thr) {
    const cand = [];
    for (const c of comps) {
      if (c.x0 <= 1 || c.x1 >= w - 2) continue;
      if (c.h < Math.max(16, h * 0.010) || c.h > h * 0.45) continue;
      if (c.w < 8 || c.w / c.h < 0.18 || c.w / c.h > 2.2) continue;
      if (c.area < 50) continue;
      cand.push(c);
    }
    if (cand.length < 4) return null;

    // Group by vertical overlap rather than y-centre: a hand-held photo is
    // tilted, so the digits' centres drift by tens of pixels across the row.
    const seen = new Uint8Array(cand.length), clusters = [];
    for (let i = 0; i < cand.length; i++) {
      if (seen[i]) continue;
      seen[i] = 1;
      const q = [i], group = [];
      while (q.length) {
        const k = q.pop(), a = cand[k];
        group.push(a);
        for (let j = 0; j < cand.length; j++) {
          if (seen[j]) continue;
          const b = cand[j];
          if (Math.abs(a.cx - b.cx) > Math.max(a.h, b.h) * 8) continue;
          const ov = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
          if (ov > Math.max(4, 0.35 * Math.min(a.h, b.h))) { seen[j] = 1; q.push(j); }
        }
      }
      if (group.length >= 4) clusters.push(group);
    }

    let best = null;
    for (const cl of clusters) {
      const parts = [];
      let part = [cl[0]];
      for (let i = 1; i < cl.length; i++) {
        const c = cl[i], hm = mean(part.map(x => x.h));
        if (c.cx - part[part.length - 1].cx > hm * 2.6) {
          if (part.length >= 4) parts.push(part);
          part = [c];
        } else part.push(c);
      }
      if (part.length >= 4) parts.push(part);
      for (const p of parts) {
        const g = scoreGroup(p, thr);
        if (g && (!best || g.score > best.score)) best = g;
      }
    }
    return best;
  }

  function findDigits(an, opts = {}) {
    let best = null;
    for (const thr of [140, 155, 170, 185]) {
      let comps = components(maskAt(an.gray, thr, an.w, an.h), an.w, an.h);
      if (opts.floor) {
        let maxH = 0;
        const cap = an.h * 0.45;
        for (const c of comps) {
          if (c.x0 <= 1 || c.x1 >= an.w - 2) continue;
          if (c.h < 16 || c.h > cap) continue;
          const asp = c.w / c.h;
          if (asp >= 0.18 && asp <= 2.2 && c.area >= 50 && c.h > maxH) maxH = c.h;
        }
        if (maxH > 0) { const fl = maxH * opts.floor; comps = comps.filter(c => c.h >= fl); }
      }
      const g = pickGroup(comps, an.w, an.h, thr);
      if (g && (!best || g.score > best.score)) best = g;
    }
    return best;
  }

  // The meter's display is a bright, hollow frame around a dark strip. Its
  // component bbox is a reliable region of interest; the digits inside are
  // otherwise merged with the frame at every threshold.
  function frameCandidates(an, comps) {
    const w = an.w, h = an.h;
    const out = [];
    for (const c of comps) {
      if (c.w < 0.10 * w || c.w > 0.85 * w) continue;
      if (c.h < 0.03 * h || c.h > 0.18 * h) continue;
      const asp = c.w / c.h, fill = c.area / (c.w * c.h);
      if (asp < 1.7 || asp > 7 || fill < 0.08 || fill > 0.7) continue;
      let score = Math.log(c.w * c.h);
      score += 4 * (1 - Math.min(1, Math.abs(Math.log(asp / 2.8))));
      score += 3 * (1 - Math.min(1, Math.abs(fill - 0.24) / 0.2));
      if (c.h > 0.12 * h) score -= 2;
      // The display strip is dark with bright digits; the meter case is a
      // fairly uniform bright texture. Inner contrast separates the two.
      const ix0 = Math.round(c.x0 + c.w * 0.15), ix1 = Math.round(c.x1 - c.w * 0.15);
      const iy0 = Math.round(c.y0 + c.h * 0.15), iy1 = Math.round(c.y1 - c.h * 0.15);
      const hist = new Uint32Array(256);
      let n = 0;
      for (let y = iy0; y < iy1; y += 3) for (let x = ix0; x < ix1; x += 3) { hist[an.gray[y * an.w + x]]++; n++; }
      let p20 = 0, p50 = 0, p90 = 0, acc = 0;
      if (n) {
        const q = f => { const want = n * f; let a = 0; for (let i = 0; i < 256; i++) { a += hist[i]; if (a >= want) return i; } return 255; };
        p20 = q(0.20); p50 = q(0.50); p90 = q(0.90);
      }
      score += (p90 - p20) * 0.04 - p20 * 0.015;
      out.push({ ...c, score });
    }
    out.sort((a, b) => b.score - a.score);
    return out;
  }

  const bboxIoU = (a, b) => {
    const x0 = Math.max(a.x0, b.x0), x1 = Math.min(a.x1, b.x1);
    const y0 = Math.max(a.y0, b.y0), y1 = Math.min(a.y1, b.y1);
    if (x1 < x0 || y1 < y0) return 0;
    const inter = (x1 - x0 + 1) * (y1 - y0 + 1);
    return inter / (a.w * a.h + b.w * b.h - inter);
  };

  const cropCanvas = (c, x0, y0, w, h) => {
    const o = mkCanvas(w, h);
    g2d(o).drawImage(c, x0, y0, w, h, 0, 0, o.width, o.height);
    return o;
  };

  const median = a => {
    const b = a.slice().sort((x, y) => x - y);
    return b.length ? b[(b.length - 1) >> 1] : 0;
  };

  // When one or two digit wheels are merged with a reflection/frame and the
  // component trail is short, rebuild the six cell boxes from the pitch and
  // the baseline of the digits that were found.
  function latticeCells(an, comps) {
    const cs = comps.slice().sort((a, b) => a.cx - b.cx);
    if (cs.length < 3) return null;
    const gaps = [];
    for (let i = 1; i < cs.length; i++) gaps.push(cs[i].cx - cs[i - 1].cx);
    const minGap = Math.min(...gaps);
    const base = gaps.filter(g => g < minGap * 1.6);
    const pitch = median(base);
    if (!(pitch > 0)) return null;

    const fit = get => {
      let sx = 0, sy = 0, sxx = 0, sxy = 0;
      for (const c of cs) { const x = c.cx, y = get(c); sx += x; sy += y; sxx += x * x; sxy += x * y; }
      const n = cs.length, den = n * sxx - sx * sx;
      return den ? { a: (n * sxy - sx * sy) / den, b: (sy - ((n * sxy - sx * sy) / den) * sx) / n } : { a: 0, b: sy / n };
    };
    const topLine = fit(c => c.y0), botLine = fit(c => c.y1);
    const hm = median(cs.map(c => c.h));

    // The rightmost found digit anchors the last cell; the TATUNG display has
    // five kWh digits plus one 0.1 wheel.
    const last = cs[cs.length - 1].cx;
    const N = 6;
    const cells = [];
    for (let i = 0; i < N; i++) {
      const cx = last + (i - (N - 1)) * pitch;
      const hit = cs.find(c => Math.abs(c.cx - cx) < pitch * 0.30);
      if (hit) {
        cells.push({ x0: hit.x0, x1: hit.x1, y0: hit.y0, y1: hit.y1, h: hit.h, clean: true });
        continue;
      }
      const hw = pitch * 0.37;
      const y0 = clamp(Math.round(topLine.a * cx + topLine.b) - 8, 0, an.h - 1);
      const y1 = clamp(Math.round(botLine.a * cx + botLine.b) + 8, 0, an.h - 1);
      cells.push({
        x0: clamp(Math.round(cx - hw), 0, an.w - 1), x1: clamp(Math.round(cx + hw), 0, an.w - 1),
        y0, y1, h: Math.max(8, y1 - y0 + 1), clean: false,
      });
    }
    // Reject nonsense: cells must stay inside the strip and have sane width.
    if (cells[0].x0 <= 1 || cells[N - 1].x1 >= an.w - 2) return null;
    return cells;
  }

  function fitAngle(comps) {
    const n = comps.length;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (const c of comps) { sx += c.cx; sy += c.cy; sxx += c.cx * c.cx; sxy += c.cx * c.cy; }
    const den = n * sxx - sx * sx;
    return den ? Math.atan((n * sxy - sx * sy) / den) : 0;
  }

  /* ---------- glyph normalization ---------- */
  function normalizeMask(mask, w, h) {
    let x0 = w, x1 = -1, y0 = h, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (x1 < x0) return null;
    const tw = x1 - x0 + 1, th = y1 - y0 + 1;
    const s = Math.min((GW - 4) / tw, (GH - 4) / th);
    const nw = Math.max(1, Math.round(tw * s)), nh = Math.max(1, Math.round(th * s));
    const ox = (GW - nw) >> 1, oy = (GH - nh) >> 1;
    const out = new Uint8Array(GW * GH);
    for (let y = 0; y < nh; y++) {
      const sy = y0 + Math.min(th - 1, Math.floor(y * th / nh));
      for (let x = 0; x < nw; x++) {
        const sx = x0 + Math.min(tw - 1, Math.floor(x * tw / nw));
        if (mask[sy * w + sx]) out[(oy + y) * GW + ox + x] = 1;
      }
    }
    return out;
  }

  function glyphOf(an, c, thr) {
    const pad = 1;
    const x0 = clamp(c.x0 - pad, 0, an.w - 1), x1 = clamp(c.x1 + pad, 0, an.w - 1);
    const y0 = clamp(c.y0 - pad, 0, an.h - 1), y1 = clamp(c.y1 + pad, 0, an.h - 1);
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    const sub = new Uint8Array(w * h);
    let rr = 0, gg = 0, bb = 0, n = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const gi = (y0 + y) * an.w + (x0 + x);
      if (an.gray[gi] >= thr) {
        sub[y * w + x] = 1;
        const ri = gi * 4;
        rr += an.rgb[ri]; gg += an.rgb[ri + 1]; bb += an.rgb[ri + 2]; n++;
      }
    }
    if (!n) return null;
    const m = normalizeMask(sub, w, h);
    if (!m) return null;
    return { m, red: (rr - (gg + bb) / 2) / n, area: n };
  }

  function dilate(m) {
    const out = new Uint8Array(GW * GH);
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      let v = 0;
      for (let dy = -1; dy <= 1 && !v; dy++) for (let dx = -1; dx <= 1; dx++) {
        const yy = y + dy, xx = x + dx;
        if (yy >= 0 && yy < GH && xx >= 0 && xx < GW && m[yy * GW + xx]) { v = 1; break; }
      }
      out[y * GW + x] = v;
    }
    return out;
  }

  /* ---------- templates ---------- */
  const b64Bytes = s => { const t = atob(s), a = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) a[i] = t.charCodeAt(i); return a; };
  const seedTemplates = SEEDS.map(([label, b64]) => ({ label, m: b64Bytes(b64), bonus: 0.06 }));
  let synth = null, learned = [], bank = null;

  function buildSynth() {
    if (synth) return synth;
    const out = [], c = mkCanvas(140, 180), x = g2d(c);
    for (const fam of FONT_FAMILIES) for (const wt of ['400', '700']) for (let d = 0; d < 10; d++) {
      x.clearRect(0, 0, c.width, c.height);
      x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = wt + ' 140px ' + fam;
      x.fillText(String(d), 70, 92);
      const im = x.getImageData(0, 0, c.width, c.height).data;
      const m = new Uint8Array(c.width * c.height);
      for (let i = 0, j = 3; i < m.length; i++, j += 4) m[i] = im[j] > 128 ? 1 : 0;
      const n = normalizeMask(m, c.width, c.height);
      if (!n) continue;
      out.push({ label: d, m: n, bonus: 0 });
      out.push({ label: d, m: dilate(n), bonus: 0.01 });
    }
    synth = out;
    return out;
  }

  function templates() {
    if (!bank) bank = seedTemplates.concat(learned, buildSynth());
    return bank;
  }
  const invalidate = () => { bank = null; };

  /* ---------- matching ---------- */
  function iou0(a, b) {
    let inter = 0, uni = 0;
    for (let i = 0; i < a.length; i++) { const x = a[i], y = b[i]; inter += x & y; uni += x | y; }
    return uni ? inter / uni : 0;
  }

  function iouShift(a, b) {
    let best = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      let inter = 0, uni = 0;
      for (let y = 0; y < GH; y++) {
        const ay = y * GW, by = (y + dy) * GW;
        if (y + dy < 0 || y + dy >= GH) { for (let x = 0; x < GW; x++) uni += a[ay + x]; continue; }
        for (let x = 0; x < GW; x++) {
          const av = a[ay + x];
          const xx = x + dx;
          const bv = (xx >= 0 && xx < GW) ? b[by + xx] : 0;
          inter += av & bv; uni += av | bv;
        }
      }
      if (uni && inter / uni > best) best = inter / uni;
    }
    return best;
  }

  function classify(mask, tpl) {
    const coarse = [];
    for (let i = 0; i < tpl.length; i++) coarse.push([iou0(mask, tpl[i].m), i]);
    coarse.sort((a, b) => b[0] - a[0]);
    const scores = new Float32Array(10), best = new Array(10).fill(null);
    for (let k = 0; k < coarse.length && k < 50; k++) {
      const t = tpl[coarse[k][1]];
      const s = iouShift(mask, t.m) + t.bonus;
      if (s > scores[t.label]) { scores[t.label] = s; best[t.label] = t; }
    }
    const order = [];
    for (let d = 0; d < 10; d++) order.push([scores[d], d]);
    order.sort((a, b) => b[0] - a[0]);
    return { scores, best, order };
  }

  /* ---------- previous reading constraint + half-up rounding ---------- */
  function beamRead(per, nInt, nDec, prev) {
    const cands = per.map(p => p.order.slice(0, 5).map(([s, d]) => ({ d, s })));
    let beams = [{ s: 0, ds: [] }];
    for (let i = 0; i < cands.length; i++) {
      const next = [];
      for (const b of beams) for (const c of cands[i]) next.push({ s: b.s + c.s, ds: b.ds.concat(c) });
      next.sort((a, b) => b.s - a.s);
      beams = next.slice(0, 48);
    }
    for (const b of beams) {
      let int = 0;
      for (let i = 0; i < nInt; i++) int = int * 10 + b.ds[i].d;
      const dec = nDec ? b.ds[nInt].d : 0;
      b.raw = int + dec / 10;
      b.reading = Math.round(b.raw);         // 四捨五入
      b.diff = prev == null ? null : b.reading - prev;
      let bonus = 0;
      if (b.diff != null) {
        if (b.diff >= 0 && b.diff <= MAX_UP) bonus = 0.45;
        else if (b.diff < 0) bonus = -0.9;
        else bonus = -0.25;
      }
      b.total = b.s + bonus;
    }
    beams.sort((a, b) => b.total - a.total);
    return beams[0];
  }

  /* ---------- main pipeline ---------- */
  function readCanvas(src, ctx = {}) {
    let canvas = src, an = analyze(canvas), g = null;

    // 1) Find the bright display frame and work on the dark strip inside it.
    try {
      const cands = [];
      for (const t of [150, 170, 185, 200]) {
        for (const f of frameCandidates(an, components(maskAt(an.gray, t, an.w, an.h), an.w, an.h))) {
          if (!cands.some(u => bboxIoU(u, f) > 0.7)) cands.push(f);
        }
      }
      cands.sort((a, b) => b.score - a.score);
      let best = null;
      for (const f of cands.slice(0, 5)) {
        try {
          const x0 = clamp(Math.round(f.x0 + f.w * 0.02), 0, an.w - 1);
          const x1 = clamp(Math.round(f.x1 - f.w * 0.02), 0, an.w - 1);
          const y0 = clamp(Math.round(f.y0 + f.h * 0.04), 0, an.h - 1);
          const y1 = clamp(Math.round(f.y0 + f.h * 0.77), 0, an.h - 1);
          const box = { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
          const strip = cropCanvas(canvas, box.x0, box.y0, box.w, box.h);
          const a2 = analyze(strip), g2 = findDigits(a2, { floor: 0.66 });
          const n = g2 ? g2.comps.length : 0, hm = g2 ? g2.hm : 0;
          if (!g2 || hm < a2.h * 0.14) continue;
          const s = g2.score + hm * 1.5 + (n >= 5 && n <= 6 ? 20 : 0);
          if (!best || s > best.s) best = { s, canvas: strip, an: a2, g: g2 };
        } catch (e) {}
      }
      if (best) { canvas = best.canvas; an = best.an; g = best.g; }
    } catch (e) {}

    // 2) Fallback: digits that are not enclosed by a frame.
    if (!g) g = findDigits(an);
    if (!g) return null;

    // 3) Level the digit row, then look again.
    if (Math.abs(g.angle || 0) > 0.008 && Math.abs(g.angle) < 0.4) {
      const c = rotateCanvas(canvas, -g.angle), a = analyze(c), gg = findDigits(a);
      if (gg) { canvas = c; an = a; g = gg; }
    }
    if (!g) return null;

    let parts = g.comps.slice().sort((a, b) => a.cx - b.cx);
    if (parts.length > 6) {
      // drop the worst-fitting extra component until six remain
      while (parts.length > 6) {
        let worst = 1, worstv = 1e9;
        for (let i = 1; i < parts.length - 1; i++) {
          const v = Math.abs((parts[i].cx - parts[i - 1].cx) - (parts[i + 1].cx - parts[i].cx));
          if (v < worstv) { worstv = v; worst = i; }
        }
        parts.splice(worst, 1);
      }
    }
    if (parts.length < 3) return null;

    let boxes = parts;
    if (parts.length < 6) {
      const lat = latticeCells(an, parts);
      if (lat) boxes = lat;
    }
    if (boxes.length > 6) boxes = boxes.slice(boxes.length - 6);

    let glyphs = boxes.map(p => glyphOf(an, p, g.thr));
    if (glyphs.some(x => !x)) {
      boxes = parts; glyphs = parts.map(p => glyphOf(an, p, g.thr));
      if (glyphs.some(x => !x)) return null;
    }

    // A five-digit meter has no decimal wheel: do not let the lattice add a
    // bogus sixth cell unless the last glyph is actually the red 0.1 wheel.
    if (boxes.length === 6 && parts.length === 5 && !(glyphs[5].red > 12)) {
      boxes = parts;
      glyphs = parts.map(p => glyphOf(an, p, g.thr));
      if (glyphs.some(x => !x)) return null;
    }
    const reds = glyphs.map(x => x.red > 12);
    let nInt = boxes.length, nDec = 0;
    if (boxes.length === 6 && (reds[5] || !reds.some(Boolean))) { nInt = 5; nDec = 1; }
    else if (boxes.length === 5) { nInt = 5; nDec = 0; }
    else if (boxes.length === 6) { nInt = 6; nDec = 0; }
    else if (boxes.length > 6) { nInt = boxes.length; }

    const tpl = templates();
    const per = glyphs.slice(0, nInt + nDec).map(gl => classify(gl.m, tpl));
    const bestBeam = beamRead(per, nInt, nDec, ctx.prev);
    if (!bestBeam) return null;

    const ds = bestBeam.ds;
    let minScore = 1, minMargin = 1;
    for (let i = 0; i < ds.length; i++) {
      const o = per[i].order;
      minScore = Math.min(minScore, ds[i].s);
      if (o.length > 1) minMargin = Math.min(minMargin, o[0][0] - o[1][0]);
    }
    const warn = [];
    if (bestBeam.diff != null && (bestBeam.diff < 0 || bestBeam.diff > MAX_UP)) warn.push('與上期差距異常');
    if (nDec && (per[nInt]?.order?.[0]?.[0] || 0) < 0.42) warn.push('小數點不清楚');
    const confidence = minScore >= 0.50 && minMargin >= 0.05 && !warn.length ? 'high'
      : minScore >= 0.40 ? 'medium' : 'low';

    // crop of the digit row for the review dialog
    let crop = '';
    try {
      const pad = Math.round(g.hm * 0.35);
      const x0 = clamp(Math.round(boxes[0].x0 - pad), 0, an.w - 1);
      const x1 = clamp(Math.round(boxes[boxes.length - 1].x1 + pad), 0, an.w - 1);
      const y0 = clamp(Math.round(Math.min(...boxes.map(p => p.y0)) - pad), 0, an.h - 1);
      const y1 = clamp(Math.round(Math.max(...boxes.map(p => p.y1)) + pad), 0, an.h - 1);
      const w = x1 - x0 + 1, h = y1 - y0 + 1;
      const s = Math.min(1, 620 / w);
      const c = mkCanvas(Math.round(w * s), Math.round(h * s));
      g2d(c).drawImage(canvas, x0, y0, w, h, 0, 0, c.width, c.height);
      crop = c.toDataURL('image/jpeg', 0.85);
    } catch (e) {}

    return {
      reading: bestBeam.reading,
      raw: Math.round(bestBeam.raw * 10) / 10,
      diff: bestBeam.diff,
      confidence,
      note: warn.join('・'),
      crop,
      digits: ds.map((c, i) => ({ label: c.d, mask: Array.from(glyphs[i].m), clean: boxes[i].clean !== false })),
    };
  }

  /* ---------- self-learning (IndexedDB) ---------- */
  let dbPromise = null, learnedReady = null;
  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error('no indexedDB'));
      const r = indexedDB.open('rent-ocr', 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('templates')) r.result.createObjectStore('templates', { keyPath: 'id', autoIncrement: true }); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbPromise;
  }
  const idbRun = (mode, fn) => new Promise(async (res, rej) => {
    try {
      const db = await openDb();
      const t = db.transaction('templates', mode), store = t.objectStore('templates');
      const req = fn(store);
      t.oncomplete = () => res(req ? req.result : undefined);
      t.onerror = t.onabort = () => rej(t.error);
    } catch (e) { rej(e); }
  });

  function loadLearned() {
    if (!learnedReady) learnedReady = idbRun('readonly', s => s.getAll()).then(all => {
      learned = (all || []).filter(r => r && r.label >= 0 && r.label <= 9 && r.m && r.m.length === GW * GH)
        .map(r => ({ label: r.label, m: new Uint8Array(r.m), bonus: 0.12 }));
      invalidate();
    }).catch(() => {});
    return learnedReady;
  }

  function learn(digits) {
    if (!Array.isArray(digits) || !digits.length) return;
    const clean = digits.filter(d => d && d.label >= 0 && d.label <= 9 && d.clean !== false && Array.isArray(d.mask) && d.mask.length === GW * GH);
    if (!clean.length) return;
    idbRun('readonly', s => s.getAll()).then(all => {
      all = all || [];
      for (const d of clean) {
        const m = Uint8Array.from(d.mask);
        const dup = all.some(t => t.label === d.label && iou0(new Uint8Array(t.m), m) > 0.96);
        if (dup || all.length >= 600) continue;
        idbRun('readwrite', s => s.add({ label: d.label, m: Array.from(m), ts: Date.now() })).catch(() => {});
        learned.push({ label: d.label, m, bonus: 0.12 });
        all.push({ label: d.label, m: Array.from(m) });
      }
      invalidate();
    }).catch(() => {});
  }

  /* ---------- file loading ---------- */
  async function fileToBitmap(file) {
    if (window.createImageBitmap) {
      try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) {}
    }
    return new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('bad image'));
      i.src = URL.createObjectURL(file);
    });
  }

  const codeErr = (code, msg) => { const e = new Error(msg || code); e.code = code; return e; };

  const sample = {
    async limits() { return { images: { mediaTypes: ['image/jpeg', 'image/png', 'image/webp'] }, floor: false }; },
    async json(prompt, opts = {}) {
      const ctx = opts.context || {};
      if (ctx.mode === 'floor') throw codeErr('not_supported', '整層電箱請改用單顆電表拍照');
      await loadLearned();
      const input = Array.isArray(opts.images) ? opts.images[0] : opts.images;
      if (!input) throw codeErr('image_rejected', '沒有照片');
      let bmp;
      try { bmp = await fileToBitmap(input); } catch (e) { throw codeErr('image_rejected', '這張照片無法讀取'); }
      const canvas = drawTo(bmp, 2000);
      const res = readCanvas(canvas, ctx);
      if (!res) throw codeErr('image_rejected', '找不到電表數字，請靠近一點重拍');
      return {
        meters: [{
          room: ctx.room || '', reading: res.reading, raw: res.raw,
          confidence: res.confidence, matchedBy: 'ocr', note: res.note, digits: res.digits,
        }],
        unassigned: [], note: res.note, crop: res.crop,
      };
    },
  };

  // Keep claude.ai's own sample capability if it exists; otherwise use this one.
  const origUse = window.claude && window.claude.use;
  window.claude = window.claude || {};
  window.claude.use = async name => {
    if (name === 'sample') {
      if (origUse) { try { const s = await origUse('sample'); if (s) return s; } catch (e) {} }
      return sample;
    }
    return origUse ? origUse(name) : null;
  };

  window.rentMeter = { readCanvas, drawTo, learn, sample, templates: () => templates().length, version: '1' };
})();
