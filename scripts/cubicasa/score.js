/* Local-only, dependency-free room-box scoring. Also usable by Node tests. */
(function (root) {
  'use strict';
  const key = s => s.trim().replace(/\s+/g, ' ').toUpperCase();
  function parse(text) {
    let s = text.trim();
    if (s.startsWith('```')) s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    let items = JSON.parse(s);
    if (!Array.isArray(items)) items = [items];
    if (items.length > 100) throw Error('Jawapan melebihi 100 objek.');
    return items.map((r, i) => {
      const b = r && r.bbox_2d;
      if (!r || typeof r.label !== 'string' || !key(r.label) || !Array.isArray(b) || b.length !== 4 ||
          !b.every(Number.isFinite) || !(0 <= b[0] && b[0] < b[2] && b[2] <= 1000 &&
          0 <= b[1] && b[1] < b[3] && b[3] <= 1000)) {
        throw Error('Objek ' + (i + 1) + ': label/bbox_2d tidak sah untuk koordinat 0–1000.');
      }
      return { label: r.label.trim(), bbox_2d: b.slice() };
    });
  }
  function iou(a, b) {
    const area = x => (x[2] - x[0]) * (x[3] - x[1]);
    const overlap = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) *
                    Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
    return overlap / (area(a) + area(b) - overlap);
  }
  // Rectangular Hungarian assignment, with a private dummy column for every row.
  // Polynomial time even when a plan has many bedrooms or a model repeats labels.
  function assign(weights) {
    const n = weights.length;
    if (!n) return [];
    const real = weights[0].length, m = real + n;
    const u = Array(n + 1).fill(0), v = Array(m + 1).fill(0);
    const p = Array(m + 1).fill(0), way = Array(m + 1).fill(0);
    for (let i = 1; i <= n; i++) {
      p[0] = i;
      const min = Array(m + 1).fill(Infinity), used = Array(m + 1).fill(false);
      let j0 = 0;
      do {
        used[j0] = true;
        const i0 = p[j0]; let delta = Infinity, j1 = 0;
        for (let j = 1; j <= m; j++) if (!used[j]) {
          const cost = -(j <= real ? weights[i0 - 1][j - 1] : 0) - u[i0] - v[j];
          if (cost < min[j]) { min[j] = cost; way[j] = j0; }
          if (min[j] < delta) { delta = min[j]; j1 = j; }
        }
        for (let j = 0; j <= m; j++) {
          if (used[j]) { u[p[j]] += delta; v[j] -= delta; }
          else min[j] -= delta;
        }
        j0 = j1;
      } while (p[j0] !== 0);
      do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
    }
    const out = Array(n).fill(-1);
    for (let j = 1; j <= real; j++) if (p[j] && weights[p[j] - 1][j - 1] > 0) out[p[j] - 1] = j - 1;
    return out;
  }
  function score(pred, gt) {
    const per = gt.map(g => ({ label: g.label, bbox_2d: g.bbox_2d, iou: 0, prediction_index: null }));
    let hits = 0;
    for (const label of new Set(gt.map(g => key(g.label)))) {
      const gi = gt.map((g, i) => key(g.label) === label ? i : -1).filter(i => i >= 0);
      const pi = pred.map((p, i) => key(p.label) === label ? i : -1).filter(i => i >= 0);
      const weights = gi.map(g => pi.map(p => iou(gt[g].bbox_2d, pred[p].bbox_2d)));
      assign(weights).forEach((j, i) => {
        if (j >= 0) { per[gi[i]].iou = weights[i][j]; per[gi[i]].prediction_index = pi[j]; }
      });
      // Detection TP maximizes cardinality at the threshold, separately from mean-IoU matching.
      const valid = weights.map(row => row.map(x => x >= 0.5 ? 1 : 0));
      hits += assign(valid).filter(j => j >= 0).length;
    }
    const sum = per.reduce((a, r) => a + r.iou, 0);
    return { expected: gt.length, returned: pred.length, iou_sum: sum,
      mean_iou: gt.length ? sum / gt.length : null, matches_at_iou_05: hits,
      false_positives_at_05: pred.length - hits, false_negatives_at_05: gt.length - hits,
      precision_at_05: pred.length ? hits / pred.length : 0,
      recall_at_05: gt.length ? hits / gt.length : null, per_reference: per };
  }
  function aggregate(records, model) {
    if (!records.length) return null;
    const scores = records.map(r => r.models[model]);
    const sum = k => scores.reduce((n, s) => n + s[k], 0);
    const expected = sum('expected'), returned = sum('returned'), hits = sum('matches_at_iou_05');
    return { images: scores.length, expected, returned, matches_at_iou_05: hits,
      mean_iou_per_image: scores.reduce((n, s) => n + s.mean_iou, 0) / scores.length,
      mean_iou_per_reference: sum('iou_sum') / expected,
      precision_at_05: returned ? hits / returned : 0, recall_at_05: hits / expected,
      false_positives_at_05: returned - hits, false_negatives_at_05: expected - hits };
  }
  function inspect(text, gt) {
    if (typeof text !== 'string' || !text.trim() || text.length > 1000000) {
      throw Error('Tampal jawapan asal lengkap (maksimum satu juta aksara); ruangan kosong belum dianggap cubaan model.');
    }
    try {
      const predictions = parse(text);
      return { status: 'valid', raw_response: text, predictions, metrics: score(predictions, gt) };
    } catch (e) {
      return { status: 'invalid_output', raw_response: text, error: e.message, predictions: null, metrics: null };
    }
  }
  root.CubiScore = { parse, iou, assign, score, aggregate, inspect };
})(globalThis);
