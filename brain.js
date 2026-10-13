/* しってるっこ：NPCの頭脳（ブラウザ／Node 共通・DOMなし）
 * ① 推理：知識ベース上の全お題に確率を持ち、公開された Q&A でベイズ更新（マスターの答えまちがい・「わからない」も確率で扱う）
 * ② 質問えらび：期待情報量（エントロピーの期待減少）が大きい質問を選ぶ。十分しぼれたら「それは○○？」と当てに行く
 * ③ しってるっこ（インサイダー）：答えを知っているので「正解に近づく質問」を少しだけ選ぶ（σで強さ）。目立たないよう、ふつうの人と同じ式に“ひと味”足すだけ
 * ④ 見やぶり：正解が出たあと、各質問が「正解の確率をどれだけ押し上げたか − 何も知らない人なら平均どれだけ上がるか（＝情報量）」＝ “知ってる人っぽさ（情報もれ）” を人ごとに集計
 * 公開の推理（みんな共通）は Pub、NPC の性格・強さで 選び方と票の読みが変わる
 */
(function (root) {
'use strict';
var K = root.SKB, B = {};
B.rng = K.rng;
// ---------- パラメータ（tools/train.js が学習。範囲は [名前, 最小, 最大]） ----------
B.PKEYS = [['tau', 0.01, 1.2], ['gTh', 0.2, 0.97], ['gLate', 0, 0.7], ['sig', 0, 4], ['sigLate', 0, 4], ['iTh', 0.15, 1.2], ['iEm', 0.5, 1.0], ['decoy', 0, 0.4],
  ['iV1', 0, 1], ['wE', -1, 3], ['wM', -1, 3], ['wG', -1, 3], ['wB', -2, 2], ['wN', -1, 1], ['wV', -1, 2], ['th1', 0.2, 0.85],
  ['iSub', 0, 0.6], ['iRamp', 0, 0.6], ['wH', -1, 2], ['wP', -2, 3]];   // iSub：しってるっこが わざと“ふつうの人っぽい”まあまあの質問をする割合、iRamp：はじめは誘導をひかえる時間、wH/wP：見やぶりの特徴（目立つ質問の数・正解に寄った質問の割合）
B.HAND = { tau: 0.35, gTh: 0.6, gLate: 0.3, sig: 1.5, sigLate: 1.5, iTh: 0.5, iEm: 0.85, decoy: 0.05, iV1: 0.5, wE: 1, wM: 0.5, wG: 0.5, wB: 0.3, wN: 0, wV: 0.3, th1: 0.5, iSub: 0, iRamp: 0, wH: 0, wP: 0 };
B.toVec = function (P) { return B.PKEYS.map(function (k) { return P[k[0]]; }); };
B.fromVec = function (v) { var P = {}; B.PKEYS.forEach(function (k, i) { P[k[0]] = Math.min(k[2], Math.max(k[1], v[i])); }); return P; };
// 強さ：学習済み方針に どれだけ寄せるか(mix)、判断のブレ(noise)、質問のまちがい率(slop)、間合い(gap 秒)
B.LV = {
  easy:   { mix: 0.0, noise: 1.4, slop: 0.30, gap: [15, 23], sigX: 2.2, gThX: -0.25, name: 'やさしい' },
  normal: { mix: 0.4, noise: 0.8, slop: 0.12, gap: [11, 17], sigX: 1.0, gThX: -0.08, name: 'ふつう' },
  smart:  { mix: 0.8, noise: 0.35, slop: 0.03, gap: [9, 14], sigX: 0, gThX: 0, name: 'かしこい' },
  ultra:  { mix: 1.0, noise: 0.0, slop: 0, gap: [8, 12], sigX: 0, gThX: 0, name: 'アストラウルトラ😎' }
};
B.levelP = function (P, lv) {   // 学習済み P と 手作り HAND をまぜる（弱いほど HAND＋ゆるさ）
  var L = B.LV[lv] || B.LV.normal, out = {};
  Object.keys(B.HAND).forEach(function (k) { out[k] = L.mix * (P[k] != null ? P[k] : B.HAND[k]) + (1 - L.mix) * B.HAND[k]; });
  out.tau = out.tau + L.slop * 1.5; out.sig = out.sig + L.sigX; out.gTh = Math.max(0.15, out.gTh + L.gThX);
  out.noise = L.noise; out.slop = L.slop; out.lv = lv;
  return out;
};

// ---------- 公開の推理（Pub） ----------
// pool：お題の候補（難しさの設定は公開なので、みんな知っている）。leak：候補外にも少し確率を残す
B.pub = function (db, pool, o) {
  o = o || {};
  var N = db.N, lw = new Float64Array(N), inPool = new Uint8Array(N);
  pool.forEach(function (i) { inPool[i] = 1; });
  for (var i = 0; i < N; i++) lw[i] = inPool[i] ? 0 : Math.log(o.leak || 0.02);
  return { db: db, N: N, lw: lw, dead: new Uint8Array(N), eps: o.eps != null ? o.eps : 0.04, du: 0.06, ua: 0.3, asked: {}, n: 0, cache: null };
};
function lik(S, truth, ans) {   // P(答え | 本当の属性値)
  var e = S.eps, d = S.du;
  // あいまいな答え（人間のおだいばん）：やわらかい手がかり
  if (ans === 'py') return truth === 1 ? 0.6 : truth === 2 ? 0.45 : 0.12;
  if (ans === 'pn') return truth === 1 ? 0.25 : truth === 2 ? 0.45 : 0.35;
  if (ans === 'sp') ans = 'y';
  if (truth === 2) return ans === 'u' ? 1 - 2 * S.ua : S.ua;
  if (ans === 'u') return d;
  return (ans === 'y') === (truth === 1) ? 1 - e - d : e;
}
B.probs = function (S) {
  if (S.cache) return S.cache;
  var N = S.N, mx = -Infinity, p = new Float64Array(N), i, s = 0;
  for (i = 0; i < N; i++) if (!S.dead[i] && S.lw[i] > mx) mx = S.lw[i];
  for (i = 0; i < N; i++) { p[i] = S.dead[i] ? 0 : Math.exp(S.lw[i] - mx); s += p[i]; }
  for (i = 0; i < N; i++) p[i] /= s;
  var top = 0; for (i = 1; i < N; i++) if (p[i] > p[top]) top = i;
  S.cache = { p: p, top: top, pt: p[top] };
  return S.cache;
};
// 答えを反映。rec = {a, neg, ans} or {w, ans}
B.apply = function (S, rec) {
  S.cache = null; S.n++;
  if (rec.w != null) {
    if (rec.w >= 0 && rec.ans !== 'correct') S.dead[rec.w] = 1;
    if (rec.w >= 0 && rec.ans === 'near') { var nv = nearVec(S.db, rec.w); for (var k = 0; k < S.N; k++) S.lw[k] += nv[k]; }   // 「いいえ、でも近い」→ 似たお題を 押し上げる
    return;
  }
  if (rec.f != null) {   // 「関係することば」の質問：お題ごとに はい(1)/いいえ(0)/わからない(2)
    if (rec.ans === 'u') return;
    var tv = factVec(S.db, rec);
    for (var j = 0; j < S.N; j++) S.lw[j] += Math.log(lik(S, tv[j], rec.ans));
    return;
  }
  var ans = rec.ans; if (rec.neg && ans !== 'u') ans = { y: 'n', n: 'y', py: 'pn', pn: 'py', sp: 'n' }[ans] || ans;
  var a = rec.a, words = S.db.words;
  for (var i = 0; i < S.N; i++) S.lw[i] += Math.log(lik(S, words[i].v[a], ans));
  S.asked[a] = (S.asked[a] || 0) + 1;
  // 「ボールを蹴る？」のような組み合わせ：はい なら どれも はい
  if (rec.also && rec.ans === 'y') rec.also.forEach(function (x) { var an = x.neg ? 'n' : 'y'; for (var k = 0; k < S.N; k++) S.lw[k] += Math.log(lik(S, words[k].v[x.a], an)); });
};
function factVec(db, rec) {
  if (rec._tv && rec._tv.length === db.N) return rec._tv;
  // おだいばんと同じ答え方（季節・大きさくらべ・なかま など）で、各お題なら どう答えるかを出す
  var tv = new Uint8Array(db.N), p = rec.pq || { t: 'fact', text: rec.f };
  for (var i = 0; i < db.N; i++) { var a = K.answerParsed(db, p, i); tv[i] = a === 'y' || a === 'correct' ? 1 : a === 'n' ? 0 : 2; }
  try { Object.defineProperty(rec, '_tv', { value: tv, enumerable: false, configurable: true, writable: true }); } catch (e) {}
  return tv;
}
B.factVec = factVec;
// お題 w に「近い」お題ほど大きい値（同じカテゴリ・特ちょうの一致・関係ることばのつながり）
var NEARC = {};
function factSet(x) { if (!x._fs) { x._fs = {}; (x.facts || []).forEach(function (g) { g.forEach(function (t) { x._fs[K.normL(t)] = 1; }); }); } return x._fs; }
function hasName(a, b) { var fs = factSet(a); return b.n.some(function (x) { return x.length >= 2 && fs[K.normL(x)]; }); }   // a の関係ることばに b の名前がある
function nearVec(db, w) {
  if (NEARC[w] && NEARC[w].length === db.N) return NEARC[w];
  var out = new Float64Array(db.N), a = db.words[w];
  for (var j = 0; j < db.N; j++) {
    var b = db.words[j], same = 0, tot = 0;
    for (var i = 0; i < K.NA; i++) { if (a.v[i] === 2 || b.v[i] === 2) continue; if (a.v[i] === 1 || b.v[i] === 1) { tot++; if (a.v[i] === b.v[i]) same++; } }
    var sim = tot ? same / tot : 0, link = 0;
    if (hasName(a, b) || hasName(b, a)) link = 1;
    out[j] = 2.5 * sim + (a.cat === b.cat ? 0.8 : 0) + 1.6 * link;
  }
  var m = 0; for (j = 0; j < db.N; j++) m += out[j]; m /= db.N; for (j = 0; j < db.N; j++) out[j] -= m;
  NEARC[w] = out; return out;
}
B.nearVec = nearVec;
B.clone = function (S) { return { db: S.db, N: S.N, lw: new Float64Array(S.lw), dead: new Uint8Array(S.dead), eps: S.eps, du: S.du, ua: S.ua, asked: Object.assign({}, S.asked), n: S.n, cache: null }; };
function H(arr, s) { var h = 0; for (var i = 0; i < arr.length; i++) { var q = arr[i] / s; if (q > 1e-12) h -= q * Math.log(q); } return h; }
// 属性 a を聞いたときの 期待情報量（nats）と、答えごとの確率
B.ig = function (S, a, pr, tvec) {
  pr = pr || B.probs(S);
  var p = pr.p, words = S.db.words, N = S.N, ans = ['y', 'n', 'u'], tot = 0, mi = 0;
  var pa = [0, 0, 0];
  // I(W;Ans) = Σ_w p(w) Σ_ans p(ans|w) log(p(ans|w)/p(ans))
  var L = [[lik(S, 0, 'y'), lik(S, 0, 'n'), lik(S, 0, 'u')], [lik(S, 1, 'y'), lik(S, 1, 'n'), lik(S, 1, 'u')], [lik(S, 2, 'y'), lik(S, 2, 'n'), lik(S, 2, 'u')]];
  var mass = [0, 0, 0];
  for (var i = 0; i < N; i++) { if (p[i] < 1e-9) continue; mass[tvec ? tvec[i] : words[i].v[a]] += p[i]; }
  for (var k = 0; k < 3; k++) for (var t = 0; t < 3; t++) pa[k] += mass[t] * L[t][k];
  for (t = 0; t < 3; t++) { if (mass[t] < 1e-12) continue; for (k = 0; k < 3; k++) { var l = L[t][k]; if (l > 0 && pa[k] > 0) mi += mass[t] * l * Math.log(l / pa[k]); } }
  return { ig: mi, pa: pa, mass: mass };
};
// 「正解 w が本当に答え」のとき、この質問で w の確率がどれだけ上がるか（log 比）。答え ans を使う
B.gainFor = function (S, rec, w) {
  var pr = B.probs(S), before = pr.p[w];
  var T = B.clone(S); B.apply(T, rec); var after = B.probs(T).p[w];
  return Math.log(Math.max(after, 1e-12) / Math.max(before, 1e-12));
};
// ---------- 質問えらび ----------
function softPick(items, tau, r) {   // items: [{s}] スコアが大きいほど選ばれやすい
  if (!items.length) return null;
  var mx = -Infinity; items.forEach(function (x) { if (x.s > mx) mx = x.s; });
  if (tau <= 0.011) return items.filter(function (x) { return x.s === mx; })[0];
  var ws = items.map(function (x) { return Math.exp((x.s - mx) / tau); }), tot = ws.reduce(function (a, b) { return a + b; }, 0), u = r() * tot;
  for (var i = 0; i < items.length; i++) { u -= ws[i]; if (u <= 0) return items[i]; }
  return items[items.length - 1];
}
// 候補の質問を評価（聞きすぎの属性は外す）
function attrCands(S, pr) {
  var out = [], best = 0;
  for (var a = 0; a < K.NA; a++) {
    if (S.asked[a] >= 2) continue;
    var r = B.ig(S, a, pr); if (r.ig < 1e-4) continue;
    out.push({ a: a, ig: r.ig, mass: r.mass }); if (r.ig > best) best = r.ig;
  }
  return { list: out, best: best };
}
// ふつうの人（たんてい・おだいばんを除くNPC）が聞く質問。ctx = {frac:経過割合, r:乱数, wrong:{}(自分がもう外した単語)}
B.chooseCommon = function (S, P, ctx) {
  var pr = B.probs(S), r = ctx.r, th = Math.max(0.12, P.gTh - P.gLate * Math.max(0, ctx.frac - 0.5) * 2);
  if (pr.pt >= th) return { w: pr.top, why: 'guess', p: pr.pt };
  var C = attrCands(S, pr);
  if (!C.list.length || C.best < 0.02) return { w: pr.top, why: 'guess', p: pr.pt };
  var items = C.list.map(function (x) { return { a: x.a, s: x.ig / C.best, ig: x.ig }; });
  var pk = softPick(items, P.tau, r);
  return { a: pk.a, ig: pk.ig, why: 'ask' };
};
// しってるっこ（答え w を知っている）が聞く質問。公開の推理 S を見て、「ふつうに見えて、正解に寄る」質問を選ぶ
// しってるっこの「ばれにくさ」：公開の推理で 上位K位以内＆確率th以上のときだけ 正解を言う。hold：ふつうの人に 先に当てさせる割合
B.ILV = { easy: { K: 6, th: 0.10, hold: 0.10, last: 0.9, bias: 0.3, late: 0.8 }, normal: { K: 4, th: 0.18, hold: 0.30, last: 2, bias: 0.05, late: 0.3 }, smart: { K: 3, th: 0.25, hold: 0.45, last: 2, bias: 0.1, late: 0.5 }, ultra: { K: 3, th: 0.30, hold: 0.55, last: 2, bias: 0.08, late: 0.4 } };
B.pubRank = function (pr, w) { var pw = pr.p[w], k = 0; for (var i = 0; i < pr.p.length; i++) if (pr.p[i] > pw) k++; return k; };
// しってるっこ（答え w を知っている）が聞く質問。公開の推理 S を見て、「ふつうに見えて、正解に寄る」質問を選ぶ
// しってるっこの「ばれにくさ」：公開の推理で 上位K位以内＆確率th以上のときだけ 正解を言う。hold：ふつうの人に 先に当てさせる割合
B.ILV = { easy: { K: 6, th: 0.10, hold: 0.10, last: 0.9, bias: 0.3, late: 0.8 }, normal: { K: 4, th: 0.18, hold: 0.30, last: 2, bias: 0.05, late: 0.3 }, smart: { K: 3, th: 0.25, hold: 0.45, last: 2, bias: 0.1, late: 0.5 }, ultra: { K: 3, th: 0.30, hold: 0.55, last: 2, bias: 0.08, late: 0.4 } };
B.pubRank = function (pr, w) { var pw = pr.p[w], k = 0; for (var i = 0; i < pr.p.length; i++) if (pr.p[i] > pw) k++; return k; };
// 答え w に近くて、公開の推理でも上位にある「おしいハズレ」（言うと おだいばんの「近い」で 正解が浮かびあがる）
function nearMiss(S, pr, w) {
  var nv = nearVec(S.db, w), best = -1, bs = -Infinity, order = [];
  for (var i = 0; i < S.N; i++) if (i !== w && !S.dead[i] && pr.p[i] > 0) order.push(i);
  order.sort(function (x, y) { return pr.p[y] - pr.p[x]; });
  order.slice(0, 10).forEach(function (i, rk) { var s = nv[i] - 0.25 * rk; if (s > bs) { bs = s; best = i; } });
  return bs > 1.2 ? best : -1;
}
// しってるっこ（答え w を知っている）が聞く質問。公開の推理 S を見て、「ふつうに見えて、正解に寄る」質問を選ぶ
B.chooseInsider = function (S, P, w, ctx) {
  var pr = B.probs(S), r = ctx.r, frac = ctx.frac, pw = pr.p[w], IL = B.ILV[P.lv] || B.ILV.normal;
  var rank = B.pubRank(pr, w), ok = rank < IL.K && pw >= IL.th;   // みんなの情報から たどりつける？
  if (ok) {
    var others = pr.top === w ? pr.pt >= 0.45 : false;   // ほかの人も 気づきそう → ときどき ゆずる
    var want = (pr.top === w && pw >= P.iTh) || frac >= P.iEm;
    if (want && !(others && frac < 0.85 && r() < IL.hold)) return { w: w, why: 'guess', p: pw };
  } else if (frac >= IL.last) return { w: w, why: 'guess', p: pw };   // やさしい：時間ぎれ寸前は あてずっぽう
  // ふつうの人と同じ基準で「それは○○？」（公開の推理のいちばん上。ハズレでも自然）
  var th = Math.max(0.12, P.gTh - P.gLate * Math.max(0, frac - 0.5) * 2);
  if (pr.top !== w && pr.pt >= th) return { w: pr.top, why: 'decoy', p: pr.pt };
  var C = attrCands(S, pr); if (!C.list.length || C.best < 0.02) return pr.top !== w ? { w: pr.top, why: 'decoy', p: pr.pt } : { w: w, why: 'guess', p: pw };
  // 質問：ふつうの人と同じ「自然な次の質問」の分布から選ぶ。ときどき（強さで上限）自然な候補の中で 答え寄りのものを選ぶ
  var words = S.db.words, items = C.list.map(function (x) {
    var t = words[w].v[x.a], ans = t === 1 ? 'y' : t === 0 ? 'n' : 'u';
    var g = B.gainFor(S, { a: x.a, ans: ans }, w);
    return { a: x.a, s: x.ig / C.best, ig: x.ig, ex: g - x.ig };
  });
  if (P.sig >= 3) {   // わざと露骨に誘導する設定（テスト・人間役ボット用）
    var sg = P.sig, bl = items.map(function (x) { return { a: x.a, s: (x.ig + sg * x.ex) / C.best, ig: x.ig, ex: x.ex }; }), pb = softPick(bl, P.tau, r);
    return { a: pb.a, ig: pb.ig, ex: pb.ex, why: 'steer' };
  }
  var bias = IL.bias + (!ok ? Math.min(1, Math.max(0, (frac - 0.3) / 0.5)) * IL.late : 0);   // 時間がおすほど 少しずつ 答え寄り（ただし自然な質問の中だけ）
  if (r() < bias) {
    var nat = items.filter(function (x) { return x.ig >= 0.75 * C.best; }), bk = null;
    nat.forEach(function (x) { if (!bk || x.ex > bk.ex) bk = x; });
    if (bk) return { a: bk.a, ig: bk.ig, ex: bk.ex, why: 'steer' };
  }
  var pk = softPick(items, P.tau, r);
  return { a: pk.a, ig: pk.ig, ex: pk.ex, why: 'plain' };
};

// ---------- 見やぶり（正解が出たあとに、全員の質問をふりかえる） ----------
// qa: [{p, a, neg, ans} | {p, w, ans}]（公開ログの順）、wStar: 正解。戻り値：人ごとの特徴
B.analyze = function (db, pool, qa, wStar, o) {
  var S = B.pub(db, pool, o), per = {}, steps = [];
  qa.forEach(function (q) {
    var f = per[q.p] || (per[q.p] = { n: 0, ex: 0, mx: -9, best: null, guessLP: null, wrong: 0, hi: 0, pos: 0 });
    var pr = B.probs(S), before = pr.p[wStar];
    if (q.w != null && q.ans === 'correct') { f.guessLP = Math.log(Math.max(before, 1e-9)); steps.push({ p: q.p, guess: true, pb: before }); B.apply(S, q); return; }
    var ig = q.f != null ? B.ig(S, -1, pr, factVec(db, q)).ig : q.a != null ? B.ig(S, q.a, pr).ig : (function () { var pw = q.w >= 0 ? pr.p[q.w] : 0; return pw > 0 && pw < 1 ? -(pw * Math.log(pw) + (1 - pw) * Math.log(1 - pw)) : 0; })();
    var T = B.clone(S); B.apply(T, q); var after = B.probs(T).p[wStar];
    var gain = Math.log(Math.max(after, 1e-12) / Math.max(before, 1e-12)), ex = gain - ig;
    f.n++; f.ex += ex; if (ex > f.mx) { f.mx = ex; f.best = q; } if (ex > 0.4) f.hi++; if (ex > 0.05) f.pos++;
    if (q.w != null) f.wrong++;
    steps.push({ p: q.p, ex: ex, gain: gain, ig: ig, pb: before, pa: after });
    B.apply(S, q);
  });
  return { per: per, steps: steps };
};
// 特徴 → 「しってるっこ度」スコア（大きいほど あやしい）
B.score = function (P, f, isGuesser, v1yes) {
  if (!f) f = { n: 0, ex: 0, mx: 0 };
  var s = P.wE * f.ex / Math.sqrt(f.n + 1) + P.wM * Math.max(0, f.mx) + P.wN * Math.min(f.n, 10) / 5;
  if (P.wH) s += P.wH * Math.min(f.hi || 0, 4) / 2;
  if (P.wP && f.n) s += P.wP * ((f.pos || 0) / f.n - 0.4) * Math.min(1, f.n / 3);
  if (isGuesser) s += P.wB + P.wG * (f.guessLP != null ? Math.min(6, -f.guessLP) : 0);
  if (v1yes) s += P.wV;
  return s;
};
// cands の中で だれが しってるっこか（確率）。noise は強さ別のブレ
B.suspect = function (P, an, cands, guesser, v1yes, r, noise) {
  var sc = cands.map(function (j) { return B.score(P, an.per[j], j === guesser, v1yes && v1yes[j]) + (noise ? noise * gauss(r) : 0); });
  var mx = Math.max.apply(null, sc), ex = sc.map(function (s) { return Math.exp(s - mx); }), t = ex.reduce(function (a, b) { return a + b; }, 0);
  var out = {}; cands.forEach(function (j, i) { out[j] = ex[i] / t; });
  return out;
};
function gauss(r) { var u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }
B.gauss = gauss;
if (typeof module !== 'undefined' && module.exports) module.exports = B; else root.SKBR = B;
})(this);
