/* しってるっこ：ゲームの進行（ホストだけが動かす。ブラウザ／Node 共通・DOMなし）
 * 流れ（公式ルールどおり）：役わり配り → 目をとじて（おだいばんがお題を確認 → しってるっこが確認）→ 質問タイム（制限時間・はい/いいえ/わからない）
 *   → 正解が出たら、かかった時間ぶん 話し合い（砂時計をひっくり返す）→ ①正解者は しってるっこ？（過半数）→ ②全員で指さし投票（同数は正解者が決める）→ 結果
 *   時間内に正解が出なければ、全員の負け。
 * 秘密：L.view(G, p) は、お題を「おだいばん」と「しってるっこ」にだけ入れる。しってるっこが誰かは本人（とブラック版のおとも）だけ。
 */
(function (root) {
'use strict';
var K = root.SKB, B = root.SKBR, CH = root.SK_CHARS, L = {};
L.ROLE = { master: { name: 'おだいばん', e: '👑' }, insider: { name: 'しってるっこ', e: '🤫' }, common: { name: 'たんてい', e: '🔍' }, follower: { name: 'おとも', e: '🐾' } };
L.charById = function (id) { for (var i = 0; i < CH.length; i++) if (CH[i].id === id) return CH[i]; return null; };
L.T = { deal: 6500, close: 2600, masterNpc: 2600, masterMax: 45000, insider: 5000, open: 1600, found: 3200, mAns: 25000, npcAns: [900, 2100], off: 8000, gapMin: 3500, talkMin: 15000,
  v1: 45000, npcV: [1500, 4500], v1show: 5200, v2: 60000, v2show: 4800, tie: 30000, tieNpc: [1800, 3000], reveal: 4200, react: [900, 2200], k: 1 };
L.TURBO = { deal: 300, close: 80, masterNpc: 80, masterMax: 4000, insider: 120, open: 60, found: 120, mAns: 2500, npcAns: [30, 80], off: 500, gapMin: 120, talkMin: 400,
  v1: 4000, npcV: [40, 120], v1show: 200, v2: 5000, v2show: 200, tie: 2000, tieNpc: [40, 100], reveal: 150, react: [30, 80], k: 0.03 };
L.DIFF = { easy: ['e'], normal: ['e', 'n'], hard: ['n', 'h'], all: ['e', 'n', 'h'] };
L.DIFF_NAMES = { easy: 'かんたん', normal: 'ふつう', hard: 'むずかしい', all: 'ぜんぶ' };
L.MAX_LOG = 220;
function rr(G, a) { return a[0] + G.rng() * (a[1] - a[0]); }
function pick(G, a) { return a[Math.floor(G.rng() * a.length)]; }
function fill(t, o) { return String(t).replace(/\{(\w+)\}/g, function (_, k) { return o[k] != null ? o[k] : ''; }); }
function shuffle(G, a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(G.rng() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
L.cleanText = function (s, max) { return String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max || 40); };
L.pool = function (db, diff) { var ds = L.DIFF[diff] || L.DIFF.normal; return db.words.filter(function (w) { return ds.indexOf(w.diff) >= 0; }).map(function (w) { return w.id; }); };

// ---------- 開始 ----------
// o = { players:[{kind:'human',sid,name}|{kind:'npc',ch}], lv, diff, limit(秒), follower(bool), blackGuess(bool), turbo, rng, now, recent:[wid], secret(テスト用), roles(テスト用) }
L.newGame = function (db, PW, o) {
  var rng = o.rng || Math.random, now = o.now != null ? o.now : Date.now(), n = o.players.length, T = o.turbo ? L.TURBO : L.T;
  if (n < 4 || n > 8) throw new Error('players 4-8');
  var G = { rng: rng, T: T, db: db, n: n, lv: o.lv || 'normal', diff: o.diff || 'normal', limit: (o.limit || 300) * 1000 * (T.k < 1 ? T.k : 1), limitSec: o.limit || 300,
    blackGuess: !!o.blackGuess, players: [], roles: [], P: [], log: [], lid: 0, qa: [], pending: [], qid: 0, queue: [], said: {},
    phase: 'deal', at: now + T.deal, nstep: '', swaps: 0, guesser: -1, guessEntry: null, v1: null, v2: null, tie: null, result: null, thoughts: [], npcNext: [], lastQ: 0, humans: 0 };
  G.pool = L.pool(db, G.diff);
  // 役わり：マスター1・インサイダー1（6人以上でブラックの「おとも」1）・残り庶民
  var seats = []; for (var i = 0; i < n; i++) seats.push(i); shuffle(G, seats);
  var roles = new Array(n).fill('common');
  if (o.roles) roles = o.roles.slice(); else { roles[seats[0]] = 'master'; roles[seats[1]] = 'insider'; if (o.follower && n >= 6) roles[seats[2]] = 'follower'; }
  G.roles = roles; G.master = roles.indexOf('master'); G.insider = roles.indexOf('insider'); G.follower = roles.indexOf('follower');
  o.players.forEach(function (pl, i) {
    var ch = pl.kind === 'npc' ? L.charById(pl.ch) : null;
    G.players.push(pl.kind === 'npc' ? { kind: 'npc', ch: ch.id, name: ch.name, e: ch.e, col: ch.col } : { kind: 'human', sid: pl.sid, name: pl.name });
    if (pl.kind !== 'npc') G.humans++;
    G.P.push(B.levelP(PW, pl.kind === 'npc' ? G.lv : 'normal'));
    G.thoughts.push([]); G.npcNext.push(0);
  });
  pickSecret(G, o);
  G.pub = B.pub(db, G.pool, { eps: G.players[G.master].kind === 'npc' ? 0.03 : 0.08 });
  sys(G, '🎴 役わりカードが配られました。' + L.ROLE.master.e + ' おだいばんは ' + nameOf(G, G.master) + '！（おだいばんだけ みんなに公開）', { big: 1 });
  return G;
};
function pickSecret(G, o) {
  var recent = (o && o.recent) || [], pool = G.pool.filter(function (w) { return recent.indexOf(w) < 0 && w !== G.secret; });
  if (!pool.length) pool = G.pool;
  G.secret = o && o.secret != null && G.secret == null ? o.secret : pool[Math.floor(G.rng() * pool.length)];
  if (G.pool.indexOf(G.secret) < 0) G.pool.push(G.secret);   // テスト用に範囲外のお題を指定されたとき
}
function push(G, e) { e.id = ++G.lid; G.log.push(e); if (G.log.length > L.MAX_LOG) G.log.splice(0, G.log.length - L.MAX_LOG); return e; }
function sys(G, text, extra) { var e = { t: 'sys', text: text }; if (extra) for (var k in extra) e[k] = extra[k]; return push(G, e); }
function npc(G, p) { return G.players[p] && G.players[p].kind === 'npc' ? L.charById(G.players[p].ch) : null; }
function nameOf(G, p) { return G.players[p].name; }
L.word = function (G) { return G.db.words[G.secret].w; };
function line(G, p, key, o) {
  var ch = npc(G, p); if (!ch) return null;
  var arr = ch.L[key] || []; if (!arr.length) return null;
  var fresh = arr.filter(function (t) { return !G.said[ch.id + t]; }); if (!fresh.length) { arr.forEach(function (t) { delete G.said[ch.id + t]; }); fresh = arr; }
  var t = pick(G, fresh); G.said[ch.id + t] = 1; return fill(t, o || {});
}
function say(G, p, text, kind, delay, now) { if (text) G.queue.push({ at: now + delay, p: p, text: text, kind: kind || 'talk' }); }
function pct(x) { return Math.max(1, Math.min(99, Math.round(x * 100))); }
function isNpc(G, p) { return G.players[p].kind === 'npc'; }

// ---------- 夜（目をとじて…） ----------
function startNight(G, now) { G.phase = 'night'; G.nstep = 'close'; G.at = now + G.T.close; sys(G, '🌙 みんな 目をとじて…', { big: 1 }); }
function nightNext(G, now) {
  if (G.nstep === 'close') { G.nstep = 'master'; G.at = now + (isNpc(G, G.master) ? G.T.masterNpc : G.T.masterMax); sys(G, L.ROLE.master.e + ' おだいばんだけ 目をあけて、お題を確認…'); }
  else if (G.nstep === 'master') { G.nstep = 'insider'; G.at = now + G.T.insider; sys(G, L.ROLE.master.e + ' おだいばんは 目をとじて。' + L.ROLE.insider.e + ' しってるっこ、目をあけて お題を確認…（5びょう）'); }
  else if (G.nstep === 'insider') { G.nstep = 'open'; G.at = now + G.T.open; sys(G, L.ROLE.insider.e + ' しってるっこは 目をとじて…'); }
  else startQA(G, now);
}
// おだいばん（人間）：知らない言葉なら お題を変える（公式ルールどおり：知らない言葉なら別のお題にする）
L.swap = function (G, p, now) {
  if (G.phase !== 'night' || G.nstep !== 'master' || p !== G.master) return 'いまは変えられません';
  if (G.swaps >= 30) return 'これ以上は かえられません';   // 公式：知らない言葉なら別のお題に。回数の制限はない（念のための上限だけ）
  G.swaps++; pickSecret(G, null); return null;
};
L.masterOk = function (G, p, now) { if (G.phase !== 'night' || G.nstep !== 'master' || p !== G.master) return 'いまは進められません'; G.at = now; return null; };

// ---------- 質問タイム ----------
function startQA(G, now) {
  G.phase = 'qa'; G.qStart = now; G.deadline = now + G.limit; G.lastQ = now;
  sys(G, '☀️ みんな 目をあけて！ ⏳ 質問タイム スタート（' + Math.round(G.limitSec / 60 * 10) / 10 + '分）。おだいばんはボタン（はい・いいえ・部分的に…・わからない・近い）で答えます', { big: 1 });
  var m = G.master; if (isNpc(G, m)) say(G, m, line(G, m, 'open'), 'talk', 300 * G.T.k, now);
  G.players.forEach(function (pl, i) { if (pl.kind === 'npc' && i !== G.master) G.npcNext[i] = now + nextGap(G, i) * (0.3 + 0.7 * G.rng()); });
}
function nextGap(G, i) {
  var ch = npc(G, i), L0 = B.LV[G.lv] || B.LV.normal, s = rr(G, L0.gap) * (ch ? ch.ps.gap : 1);
  // 人間がいるときは NPCは ひかえめに（人間が質問するすきまを残す）。NPCが多い卓ほど 一人あたりの間合いを広げる
  if (G.humans > 0) { var asker = 0; G.players.forEach(function (pl, j) { if (pl.kind === 'npc' && j !== G.master) asker++; }); s *= (1 + 0.3 * G.humans) * Math.max(1, asker / 3); }
  return s * 1000 * G.T.k;
}
// 質問を出す。q = 文字列（人間）または {a, neg} / {w}（NPC）
L.ask = function (G, p, q, now, meta) {
  if (G.phase !== 'qa') return 'いまは質問できません';
  if (p === G.master) return 'おだいばんは質問できません';
  var parsed, text;
  if (typeof q === 'string') {
    text = L.cleanText(q, 40); if (!text) return '質問を入力してね';
    parsed = (meta && meta.guess) ? guessParse(G, text) : K.parse(G.db, text);
  } else { parsed = q.w != null ? { t: 'guess', w: q.w, text: G.db.words[q.w].w } : { t: 'attr', a: q.a, neg: !!q.neg }; text = meta && meta.text || (q.w != null ? 'それは「' + G.db.words[q.w].w + '」？' : K.ATTRS[q.a].q); }
  var e = { qid: ++G.qid, p: p, text: text, parsed: parsed, at: now, ans: null };
  push(G, { t: 'q', qid: e.qid, p: p, text: text, guess: parsed.t === 'guess' ? 1 : 0 });
  G.lastQ = now;
  if (parsed.t === 'guess') {   // 「それは○○？」は 自動で判定（ことばが一致すれば正解）
    var ok = parsed.w === G.secret || (parsed.w < 0 && K.isAnswer(G.db, parsed.text, G.secret));
    if (ok) { resolve(G, e, 'correct', now, 'auto'); return null; }
    if (isNpc(G, G.master) || parsed.w >= 0) { e.due = now + rr(G, G.T.npcAns) * (isNpc(G, G.master) ? 1 : 0.3); e.auto = parsed.w >= 0 ? K.answerParsed(G.db, parsed, G.secret) : 'n'; if (e.auto === 'correct') e.auto = 'n'; if (e.auto === 'n' && parsed.w >= 0 && isNpc(G, G.master) && nearRank(G, parsed.w) < 6) e.auto = 'pn'; /* おしい名前には「部分的に違う（近い）」 */ G.pending.push(e); return null; }
  }
  if (isNpc(G, G.master)) { e.due = now + rr(G, G.T.npcAns); e.auto = K.answerParsed(G.db, parsed, G.secret); if (e.auto === 'correct') e.auto = 'n'; G.pending.push(e); }
  else { e.due = now + G.T.mAns; e.human = true; G.pending.push(e); }
  return null;
};
function guessParse(G, text) {
  var core = K.stripGuess(text, G.db); var w = G.db.byNorm[core];
  return { t: 'guess', w: w != null ? w : -1, text: core || text };
}
// おだいばん（人間）が答える：ans = 'y'|'n'|'u'|'correct'
L.answer = function (G, p, qid, ans, now, note) {
  if (G.phase !== 'qa' || p !== G.master) return 'いまは答えられません';
  var e = G.pending.filter(function (x) { return x.qid === qid; })[0]; if (!e) return 'その質問は もう答えました';
  if (K.ANSWERS.indexOf(ans) < 0) return 'はい／いいえ／わからない で答えてね';
  resolve(G, e, ans, now, 'master', note);
  return null;
};
// 親の ひとこと（「概念」「科学的」「もっと具体的」など）を 特ちょうの 弱い証拠にする
var HINTK = [[/(概念|がいねん|抽象|ちゅうしょう|形のない|かたちのない)/, 'abstract', 'y'], [/(科学|かがく|物理|ぶつり|理科|りか)/, 'science', 'y'], [/(時間|じかん|時の|ときの)/, 'time', 'y'],
  [/(人工|じんこう|人が作|ひとがつく)/, 'made', 'y'], [/(もともとある|自然に|しぜんに|天然)/, 'made', 'n'], [/(さわれない|触れない)/, 'touch', 'n'], [/(目に見えない|見えない|みえない)/, 'visible', 'n'], [/(ゲーム)/, 'videogame', 'y'], [/(作品|キャラ|商品|固有)/, 'proper', 'y']];
function hintKeys(G, note) {
  var t = String(note);
  HINTK.forEach(function (h) { var i = K.ATTRS.findIndex(function (a) { return a.id === h[1]; }); if (i >= 0 && h[0].test(t)) { var r = { p: -1, a: i, neg: false, ans: h[2] === 'y' ? 'py' : 'pn' }; B.apply(G.pub, r); } });
}
L.hintKeys = hintKeys;
function nearRank(G, w) { var nv = B.nearVec(G.db, w), me = nv[G.secret], k = 0; for (var j = 0; j < G.db.N; j++) if (j !== w && nv[j] > me) k++; return k; }
function resolve(G, e, ans, now, by, note) {
  G.pending = G.pending.filter(function (x) { return x !== e; });
  e.ans = ans; e.by = by;
  var rec = null;
  if (e.parsed.t === 'guess' && (ans === 'py' || ans === 'pn' || ans === 'sp')) { if (e.parsed.w < 0) e.parsed = { t: 'fact', text: K.normL(e.text) }; }   // 名前でも「もっと具体的に」なら 上位のなかま → 正解ではない
  var ans0 = ans;
  var nearG = e.parsed.t === 'guess' && e.parsed.w >= 0 && (ans === 'py' || ans === 'pn' || ans === 'sp');   // 名前の質問に「近い」「部分的に…」→ はずれ、でも近い
  if (nearG) ans = 'n';
  if (e.parsed.t === 'attr') { rec = { p: e.p, a: e.parsed.a, neg: e.parsed.neg, ans: ans === 'correct' ? 'y' : ans }; if (e.parsed.also && e.parsed.also.length) rec.also = e.parsed.also; }
  else if ((e.parsed.t === 'fact' || e.parsed.t === 'cmp' || e.parsed.t === 'kindof') && ans !== 'correct') rec = { p: e.p, f: e.parsed.text || e.text, pq: e.parsed, ans: ans };
  else if (e.parsed.t === 'guess' && e.parsed.w >= 0) rec = { p: e.p, w: e.parsed.w, ans: ans === 'correct' ? 'correct' : nearG || (note && /(近い|ちかい|おしい|惜しい)/.test(note)) ? 'near' : 'n' };
  else if (e.parsed.t === 'guess' && ans === 'correct') rec = { p: e.p, w: G.secret, ans: 'correct' };
  e.rec = rec; G.qa.push(e);
  var m = G.master, mline = null;
  if (isNpc(G, m)) mline = ans0 === 'pn' && nearG ? line(G, m, 'pn') : ans === 'correct' ? line(G, m, 'correct') : ans === 'y' ? line(G, m, 'yes') : ans === 'n' ? line(G, m, 'no') : ans === 'py' ? line(G, m, 'py') : ans === 'pn' ? line(G, m, 'pn') : ans === 'sp' ? line(G, m, 'sp') : ((e.parsed.t === 'none' || e.parsed.t === 'fact') && G.rng() < 0.6 ? line(G, m, 'unclear') : line(G, m, 'dunno'));
  push(G, { t: 'a', qid: e.qid, p: e.p, ans: ans0 === 'correct' ? ans : ans0, say: mline || (note ? String(note).slice(0, 40) : null), auto: by === 'timeout' ? 1 : 0 });
  var pt0 = B.probs(G.pub).pt;
  if (rec && ans !== 'correct') B.apply(G.pub, rec);
  // おだいばんが 答えといっしょに書いた ひとこと（「オンラインゲームは近い」）は 強い手がかり：そのことばに関係あるお題を 押し上げる
  if (note && ans !== 'correct') hintKeys(G, note);
  if (note && ans !== 'correct') { var nt = K.normL(note).replace(/^(はい|いいえ|ちがう|違う|わからない|部分的に(そう|違う)?)/, ''); if (nt.length >= 2) { e.note = note; var nr = { p: -1, f: nt, pq: { t: 'fact', text: nt }, ans: 'y' }; B.apply(G.pub, nr); B.apply(G.pub, nr); } }
  // NPCおだいばんの ひとこと：みんなの推理（公開情報だけ）が ぐっと しぼれた質問に「いい質問」
  if (rec && ans !== 'correct' && isNpc(G, m) && B.probs(G.pub).pt - pt0 > 0.18 && G.rng() < 0.55) say(G, m, line(G, m, 'mnice'), 'react', rr(G, G.T.react), now);
  if (ans === 'correct') { found(G, e, now); return; }
  // NPCが いい質問に ひとこと
  if (rec && rec.a != null && G.rng() < 0.12) { var cs = []; G.players.forEach(function (pl, i) { if (pl.kind === 'npc' && i !== e.p && i !== m) cs.push(i); }); if (cs.length) { var i2 = pick(G, cs); say(G, i2, line(G, i2, 'nice'), 'react', rr(G, G.T.react), now); } }
}
function found(G, e, now) {
  G.guesser = e.p; G.guessEntry = e; G.elapsed = now - G.qStart;
  G.phase = 'found'; G.at = now + G.T.found; G.pending = []; G.queue = G.queue.filter(function (q) { return q.kind === 'react' && false; });
  sys(G, '🎉 正解！ お題は「' + L.word(G) + '」。当てたのは ' + nameOf(G, e.p) + '（正解者）', { big: 1, found: 1 });
}
// ---------- NPC の質問 ----------
function npcAsk(G, i, now) {
  var role = G.roles[i], P = G.P[i], ch = npc(G, i), frac = (now - G.qStart) / G.limit, r = G.rng, c;
  var Pc = Object.assign({}, P); Pc.gTh = Math.min(0.97, Math.max(0.12, P.gTh + (ch ? ch.ps.eager : 0)));
  if (role === 'insider') c = B.chooseInsider(G.pub, Pc, G.secret, { frac: frac, r: r });
  else c = B.chooseCommon(G.pub, Pc, { frac: frac, r: r });
  var text;
  if (c.w != null) { if (G.pub.dead[c.w] && c.w !== G.secret) return; text = line(G, i, 'guess', { w: G.db.words[c.w].w, p: pct(c.p || 0.5) }); var why = basis(G, c.w); if (why && r() < (role === 'insider' ? 0.85 : 0.4)) text = why + text; L.ask(G, i, { w: c.w }, now, { text: text }); }
  else {
    var used = G._said || (G._said = {}), last = G.qa.length ? G.qa[G.qa.length - 1] : null;
    var q = K.phrase(c.a, r, used, last && G.qa.length && now - (last.at || 0) < 20000 * G.T.k ? last.ans : null);
    text = ch ? ch.ask(q) : q; L.ask(G, i, { a: c.a }, now, { text: text });
  }
}

// NPCが 名前を言うときの「根拠」：これまでの「はい」の答えのうち、その名前にも当てはまるもの（直近から）
function basis(G, w) {
  var v = G.db.words[w].v, qs = G.qa.filter(function (e) { return e.rec && e.rec.a != null && e.rec.ans === 'y' && !e.rec.neg && v[e.rec.a] === 1; });
  if (!qs.length) { var nr = G.qa.filter(function (e) { return e.rec && e.rec.w >= 0 && e.rec.ans === 'near'; }).pop(); return nr ? '「' + G.db.words[nr.rec.w].w + '」が近いなら… ' : ''; }
  var q = K.ATTRS[qs[qs.length - 1].rec.a].q.replace(/^それは\s*/, '').replace(/[？?]$/, '');
  return '「' + q + '」で はいだったから… ';
}
// ---------- 話し合い ----------
function startTalk(G, now) {
  G.phase = 'talk';
  var dur = Math.max(G.T.talkMin, G.elapsed);   // 公式：砂時計をひっくり返す＝質問にかかった時間ぶん
  G.at = now + dur; G.talkDur = dur;
  sys(G, '⏳ 砂時計をひっくり返した！ 話し合いタイム（' + fmtSec(dur / G.T.k) + '）。しってるっこは だれ？ 質問のしかたを ふりかえろう', { big: 1 });
  analyze(G);
  // NPCの発言
  var order = []; G.players.forEach(function (pl, i) { if (pl.kind === 'npc') order.push(i); }); shuffle(G, order);
  var span = Math.max(3000 * G.T.k, dur * 0.75);
  order.forEach(function (i, idx) {
    var ch = npc(G, i); if (G.rng() > ch.ps.talk + 0.25) return;
    var view = npcView(G, i), delay = 500 * G.T.k + span * (idx + G.rng() * 0.6) / Math.max(1, order.length);
    var t = null, target = view.top;
    if (target >= 0 && view.p[target] > Math.max(0.42, 1.4 / view.cands.length) * (1.2 - ch.ps.bold * 0.4)) t = accuse(G, i, target);
    else if (target >= 0 && G.rng() < 0.5) { var low = view.low; t = low >= 0 ? line(G, i, 'clear', { n: nameOf(G, low) }) : line(G, i, 'vague'); }
    else t = line(G, i, 'vague');
    say(G, i, t, 'talk', delay, now);
    if (target >= 0 && t && G.players[target].kind === 'npc' && G.rng() < 0.8) say(G, target, line(G, target, 'defend'), 'defend', delay + rr(G, [1200, 2400]) * G.T.k, now);
    if (G.rng() < 0.35 && order.length > 1) {   // 2回目の発言
      var t2 = target >= 0 && view.p[target] > 0.3 ? accuse(G, i, target) : line(G, i, 'vague');
      say(G, i, t2, 'talk', delay + span * 0.45, now);
    }
  });
}
function fmtSec(ms) { var s = Math.round(ms / 1000); return Math.floor(s / 60) + '分' + ('0' + s % 60).slice(-2) + '秒'; }
function accuse(G, i, j) {
  var f = G.an.per[j], bestQ = f && f.best ? f.best : null;
  if (j === G.guesser && (!bestQ || G.rng() < 0.5)) return line(G, i, 'susG', { n: nameOf(G, j), p: pct(Math.exp(f && f.guessLP != null ? f.guessLP : -1)) });
  var qt = bestQ ? shortQ(bestQ.text) : '…'; return line(G, i, 'susQ', { n: nameOf(G, j), q: qt });
}
function shortQ(t) { t = String(t).replace(/^(質問：|えっと…|ふふ、)/, ''); return t.length > 16 ? t.slice(0, 15) + '…' : t; }
function analyze(G) {
  var qa = G.qa.filter(function (e) { return e.rec; }).map(function (e) { var r = Object.assign({}, e.rec); r.text = e.text; return r; });
  G.an = B.analyze(G.db, G.pool, qa, G.secret, { eps: G.pub.eps });
  // 各質問に「情報もれ」の値をつけておく（結果画面で見せる）
  var k = 0; G.qa.forEach(function (e) { if (e.rec) { var st = G.an.steps[k++]; e.ex = st && st.ex; e.pb = st && st.pb; } });
}
// NPC i から見た「だれが しってるっこ？」
function npcView(G, i, extraV1) {
  var role = G.roles[i], cands = [];
  G.players.forEach(function (_, j) { if (j !== i && j !== G.master) cands.push(j); });
  if (!cands.length) return { cands: [], p: {}, top: -1, low: -1 };
  var P = G.P[i], know = role === 'insider' || role === 'follower';
  var noise = know ? 0 : P.noise;
  var probs = B.suspect(know ? B.levelP(B.HAND, 'smart') : P, G.an, cands, G.guesser, G.v1 && G.v1.yesBy, G.rng, noise * 0.6);
  if (role === 'common' || role === 'master') {
    // 自分は しってるっこではない（自分を候補から外しているので自動的に反映）
  }
  if (know) {   // 知っている側：みんなが疑いそうな人（自分と相棒以外）を責める
    var pal = role === 'insider' ? G.follower : G.insider;
    cands = cands.filter(function (j) { return j !== pal && j !== G.insider; });
  }
  var top = -1, low = -1; cands.forEach(function (j) { if (top < 0 || probs[j] > probs[top]) top = j; if (low < 0 || probs[j] < probs[low]) low = j; });
  return { cands: cands, p: probs, top: top, low: low };
}
L.skip = function (G, now) {
  if (G.phase === 'deal' || G.phase === 'talk') { G.at = now; return null; }
  return 'いまは進められません';
};

// ---------- 投票① 正解者は しってるっこ？ ----------
function startV1(G, now) {
  G.phase = 'v1'; G.deadline = now + G.T.v1; G.queue = G.queue.filter(function (q) { return q.kind === 'defend' && q.at - now < 1500; });
  G.v1 = { votes: {}, voters: [], yesBy: {} };
  G.players.forEach(function (_, i) { if (i !== G.guesser) { G.v1.voters.push(i); if (isNpc(G, i)) G.v1['at' + i] = now + rr(G, G.T.npcV) * (G.T.k < 1 ? 1 : 1); } });
  sys(G, '✋ 投票①：正解者 ' + nameOf(G, G.guesser) + ' は しってるっこ だと思う？（正解者以外の全員・おだいばんも投票。過半数で「しってるっこ」と判定）', { big: 1 });
}
L.vote1 = function (G, p, yes, now) {
  if (G.phase !== 'v1') return 'いまは投票できません';
  if (p === G.guesser) return '正解者は投票しません';
  if (G.v1.votes[p] != null) return 'もう投票しました';
  G.v1.votes[p] = !!yes; if (yes) G.v1.yesBy[p] = true;
  if (G.v1.voters.every(function (i) { return G.v1.votes[i] != null; })) closeV1(G, now);
  return null;
};
function npcVote1(G, i) {
  var role = G.roles[i], g = G.guesser, P = G.P[i];
  if (role === 'insider' || role === 'follower') {   // 正解者が庶民なら「しってるっこだ！」に乗る（誤判定ねらい）。相棒なら かばう
    if (g === G.insider) return false;
    return G.rng() < P.iV1;
  }
  var view = npcView(G, i), pg = view.p[g] || 0;
  return pg > P.th1;
}
function closeV1(G, now) {
  var yes = 0, no = 0; G.v1.voters.forEach(function (i) { if (G.v1.votes[i]) yes++; else no++; });
  var maj = yes * 2 > G.v1.voters.length; G.v1.yes = yes; G.v1.no = no; G.v1.maj = maj;
  var gRole = G.roles[G.guesser], isIns = gRole === 'insider';
  // 公式：多数決のあと、正解者は役わりカードを表にする（過半数かどうかに関係なく）
  push(G, { t: 'v1', votes: Object.assign({}, G.v1.votes), yes: yes, no: no, maj: maj, g: G.guesser, role: gRole });
  G.phase = 'v1show'; G.at = now + G.T.v1show;
  if (isIns && maj) G.pendingEnd = { winner: 'commons', why: 'v1catch' };
  else if (isIns && !maj) G.pendingEnd = { winner: 'insider', why: 'v1miss' };
  else if (!isIns && maj) G.pendingEnd = { winner: 'insider', why: 'v1wrong' };
  else G.pendingEnd = null;
}
// ---------- 投票② 全員で指さし ----------
function startV2(G, now) {
  G.phase = 'v2'; G.deadline = now + G.T.v2;
  G.v2 = { votes: {}, cands: [] };
  G.players.forEach(function (_, i) { if (i !== G.master && i !== G.guesser) G.v2.cands.push(i); });
  G.players.forEach(function (_, i) { if (isNpc(G, i)) G.v2['at' + i] = now + rr(G, G.T.npcV); });
  sys(G, '👉 投票②：正解者は たんていでした。では しってるっこは だれ？ 全員で いっせいに指さし！（おだいばん・正解者も投票。同数なら正解者が決める）', { big: 1 });
}
L.v2Cands = function (G, p) { return G.v2 ? G.v2.cands.filter(function (j) { return j !== p; }) : []; };
L.vote2 = function (G, p, t, now) {
  if (G.phase !== 'v2') return 'いまは投票できません';
  if (G.v2.votes[p] != null) return 'もう投票しました';
  t = +t; if (L.v2Cands(G, p).indexOf(t) < 0) return 'その人には投票できません';
  G.v2.votes[p] = t;
  if (G.players.every(function (_, i) { return G.v2.votes[i] != null || L.v2Cands(G, i).length === 0; })) closeV2(G, now);
  return null;
};
function npcVote2(G, i) {
  var cs = L.v2Cands(G, i); if (!cs.length) return -1;
  var view = npcView(G, i), role = G.roles[i];
  if (role === 'insider' || role === 'follower') { var ok = cs.filter(function (j) { return j !== G.insider && j !== G.follower; }); if (!ok.length) ok = cs.filter(function (j) { return j !== G.insider; }); if (!ok.length) ok = cs; var b = ok[0]; ok.forEach(function (j) { if ((view.p[j] || 0) > (view.p[b] || 0)) b = j; }); return b; }
  var best = cs[0]; cs.forEach(function (j) { if ((view.p[j] || 0) > (view.p[best] || 0)) best = j; }); return best;
}
function closeV2(G, now) {
  var c = {}; Object.keys(G.v2.votes).forEach(function (k) { var t = G.v2.votes[k]; if (t >= 0) c[t] = (c[t] || 0) + 1; });
  var mx = 0; Object.keys(c).forEach(function (k) { if (c[k] > mx) mx = c[k]; });
  var tops = Object.keys(c).filter(function (k) { return c[k] === mx; }).map(Number);
  G.v2.count = c; G.v2.tops = tops;
  push(G, { t: 'v2', votes: Object.assign({}, G.v2.votes), count: c, tops: tops });
  G.phase = 'v2show'; G.at = now + G.T.v2show;
}
L.tiePick = function (G, p, t, now) {
  if (G.phase !== 'tie' || p !== G.guesser) return 'いまは決められません';
  t = +t; if (G.v2.tops.indexOf(t) < 0) return 'その人は選べません';
  accused(G, t, now, true); return null;
};
function accused(G, t, now, byTie) {
  G.v2.accused = t; G.v2.byTie = !!byTie;
  if (byTie) sys(G, '⚖️ 同数！ 正解者 ' + nameOf(G, G.guesser) + ' が ' + nameOf(G, t) + ' を えらびました');
  G.phase = 'reveal'; G.at = now + G.T.reveal;
  G.pendingEnd = t === G.insider ? { winner: 'commons', why: 'v2catch' } : { winner: 'insider', why: 'v2miss' };
}

// ---------- 結果 ----------
function finish(G, now, winner, why) {
  G.phase = 'end'; G.queue = []; G.pending = [];
  var winners = [];
  G.players.forEach(function (_, i) {
    var r = G.roles[i];
    if (winner === 'commons' && (r === 'common' || r === 'master')) winners.push(i);
    else if (winner === 'insider' && (r === 'insider' || r === 'follower')) winners.push(i);
  });
  if (winner === 'insider' && why === 'v1wrong' && G.blackGuess && winners.indexOf(G.guesser) < 0) winners.push(G.guesser);   // ブラック版のルール
  if (G.an == null && G.qa.length) { try { analyze(G); } catch (e) {} }
  G.result = { winner: winner, why: why, winners: winners, word: L.word(G), cat: G.db.words[G.secret].catName, roles: G.roles.slice(), guesser: G.guesser, v1: G.v1 ? { votes: G.v1.votes, yes: G.v1.yes, no: G.v1.no, maj: G.v1.maj } : null,
    v2: G.v2 ? { votes: G.v2.votes, count: G.v2.count, accused: G.v2.accused, byTie: G.v2.byTie } : null, elapsed: G.elapsed || null,
    leak: G.an ? leakTable(G) : null, thoughts: G.players.map(function (pl, i) { return pl.kind === 'npc' ? thoughtText(G, i) : null; }) };
  var txt = { none: '⌛ 時間切れ… 正解が出なかったので 全員の負け', v1catch: '🎯 正解者こそ しってるっこ！ たんていチームの勝ち', v1miss: '🤫 正解者が しってるっこ だったのに 見のがした… しってるっこの勝ち',
    v1wrong: '😱 正解者は たんていだった！ まちがえて つかまえたので しってるっこの勝ち', v2catch: '🎯 しってるっこを 見つけた！ たんていチームの勝ち', v2miss: '🤫 しってるっこを 見のがした… しってるっこの勝ち' }[why] || '';
  sys(G, txt, { big: 1 });
  G.players.forEach(function (pl, i) {
    if (pl.kind !== 'npc') return; var w = winners.indexOf(i) >= 0;
    var key = why === 'none' ? 'timeup' : (G.roles[i] === 'insider' ? (w ? 'escaped' : 'caught') : (w ? 'win' : 'lose'));
    say(G, i, line(G, i, key), 'talk', 0, now);
  });
  G.endLines = G.queue.map(function (q) { return { p: q.p, text: q.text }; }); G.queue = [];
}
function leakTable(G) {   // 人ごと：質問数・情報もれ合計・いちばん“知ってる人っぽい”質問
  return G.players.map(function (_, i) { var f = G.an.per[i]; if (!f) return null; return { n: f.n, ex: Math.round(f.ex * 100) / 100, best: f.best ? f.best.text : null, bestEx: Math.round(f.mx * 100) / 100, guessP: f.guessLP != null ? Math.round(Math.exp(f.guessLP) * 1000) / 10 : null }; });
}
function thoughtText(G, i) {
  var out = [], role = G.roles[i];
  if (role === 'master') out.push('おだいばん：お題は「' + L.word(G) + '」。質問 ' + G.qa.length + ' 件に答えた');
  if (role === 'insider') out.push('しってるっこ：正解に寄る質問を ' + G.qa.filter(function (e) { return e.p === i && e.ex > 0.3; }).length + ' 回まぜた（目立たないように）');
  if (G.an && G.guesser >= 0) {
    var v = npcView(G, i), arr = v.cands.slice().sort(function (a, b) { return (v.p[b] || 0) - (v.p[a] || 0); }).slice(0, 3);
    if (role === 'insider' || role === 'follower') out.push('みんなが疑いそうな人：' + arr.map(function (j) { return nameOf(G, j) + ' ' + pct(v.p[j] || 0) + '%'; }).join('、'));
    else out.push('しってるっこ度：' + arr.map(function (j) { return nameOf(G, j) + ' ' + pct(v.p[j] || 0) + '%'; }).join('、'));
    var f = v.top >= 0 && G.an.per[v.top];
    if (f && f.best) out.push('いちばん気になった質問：' + nameOf(G, v.top) + '「' + shortQ(f.best.text) + '」（情報もれ +' + (Math.round(f.mx * 100) / 100) + '）');
  }
  if (G.v1 && G.v1.votes[i] != null) out.push('投票①：' + (G.v1.votes[i] ? '正解者が しってるっこ' : 'ちがう'));
  if (G.v2 && G.v2.votes[i] != null && G.v2.votes[i] >= 0) out.push('投票②：' + nameOf(G, G.v2.votes[i]));
  return out;
}

// ---------- 進行（ホストのタイマーから呼ぶ） ----------
L.tick = function (G, now, isOff) {
  isOff = isOff || function () { return false; };
  var did = false;
  G.queue.sort(function (a, b) { return a.at - b.at; });
  while (G.queue.length && G.queue[0].at <= now && G.phase !== 'end') { var q = G.queue.shift(); push(G, { t: 'npc', p: q.p, text: q.text, k: q.kind }); did = true; }
  var ph = G.phase;
  if (ph === 'deal') { if (now >= G.at) { startNight(G, now); did = true; } }
  else if (ph === 'night') {
    if (G.nstep === 'master' && !isNpc(G, G.master) && isOff(G.master) && now >= G.at - G.T.masterMax + G.T.off) G.at = now;
    if (now >= G.at) { nightNext(G, now); did = true; }
  } else if (ph === 'qa') {
    // 答え
    G.pending.slice().forEach(function (e) {
      if (G.phase !== 'qa') return;
      var due = e.due;
      if (e.human && isOff(G.master)) due = Math.min(due, e.at + G.T.off);
      if (now >= due) {
        var ans = e.auto || K.answerParsed(G.db, e.parsed, G.secret); if (ans === 'correct' && e.parsed.t !== 'guess') ans = 'y';
        resolve(G, e, ans, now, e.human ? 'timeout' : 'npc'); did = true;
      }
    });
    if (G.phase !== 'qa') return true;
    if (now >= G.deadline) {
      sys(G, '⌛ 時間切れ！ お題は「' + L.word(G) + '」でした', { big: 1 }); G.elapsed = G.limit;
      if (isNpc(G, G.master)) push(G, { t: 'npc', p: G.master, text: line(G, G.master, 'timeup'), k: 'talk' });
      finish(G, now, 'none', 'none'); return true;
    }
    // NPC の質問（おだいばんが人間なら、たまった質問がないときだけ）
    var humanBusy = !isNpc(G, G.master) && G.pending.some(function (e) { return e.human; });
    if (!humanBusy && now - G.lastQ >= G.T.gapMin * (G.T.k < 1 ? 1 : 1)) {
      var ready = []; G.players.forEach(function (pl, i) { if (pl.kind === 'npc' && i !== G.master && now >= G.npcNext[i] && !G.pending.some(function (e) { return e.p === i; })) ready.push(i); });
      if (ready.length) { var i = pick(G, ready); npcAsk(G, i, now); G.npcNext[i] = now + nextGap(G, i); did = true; }
    }
  } else if (ph === 'found') { if (now >= G.at) { startTalk(G, now); did = true; } }
  else if (ph === 'talk') { if (now >= G.at) { startV1(G, now); did = true; } }
  else if (ph === 'v1') {
    G.v1.voters.forEach(function (i) {
      if (G.phase !== 'v1' || G.v1.votes[i] != null) return;
      var due = isNpc(G, i) ? now >= G.v1['at' + i] : (isOff(i) && now >= G.deadline - G.T.v1 + G.T.off) || now >= G.deadline;
      if (due) { L.vote1(G, i, npcVote1(G, i), now); did = true; }
    });
  } else if (ph === 'v1show') {
    if (now >= G.at) { var pe = G.pendingEnd; if (pe) finish(G, now, pe.winner, pe.why); else startV2(G, now); did = true; }
  } else if (ph === 'v2') {
    G.players.forEach(function (pl, i) {
      if (G.phase !== 'v2' || G.v2.votes[i] != null || L.v2Cands(G, i).length === 0) return;
      var due = isNpc(G, i) ? now >= G.v2['at' + i] : (isOff(i) && now >= G.deadline - G.T.v2 + G.T.off) || now >= G.deadline;
      if (due) { L.vote2(G, i, npcVote2(G, i), now); did = true; }
    });
  } else if (ph === 'v2show') {
    if (now >= G.at) {
      if (G.v2.tops.length === 1) accused(G, G.v2.tops[0], now, false);
      else { G.phase = 'tie'; G.deadline = now + (isNpc(G, G.guesser) ? rr(G, G.T.tieNpc) : G.T.tie); sys(G, '⚖️ 同数です！ 正解者 ' + nameOf(G, G.guesser) + ' が、' + G.v2.tops.map(function (j) { return nameOf(G, j); }).join('・') + ' の中から決めます'); }
      did = true;
    }
  } else if (ph === 'tie') {
    if (now >= G.deadline || (isOff(G.guesser) && !isNpc(G, G.guesser))) {
      var v = npcView(G, G.guesser), b = G.v2.tops[0]; G.v2.tops.forEach(function (j) { if ((v.p[j] || 0) > (v.p[b] || 0)) b = j; });
      accused(G, b, now, true); did = true;
    }
  } else if (ph === 'reveal') { if (now >= G.at) { finish(G, now, G.pendingEnd.winner, G.pendingEnd.why); did = true; } }
  return did;
};

// ---------- チャット（自由発言。NPCはキーワードと名前に反応） ----------
var RX = { acc: /あやし|怪し|しってる|知って|インサイダー|犯人|うそ|嘘|ずるい|早すぎ|はやすぎ/, q: /[?？]|だれ|誰|どう思|どっち|教えて/, laugh: /(w|ｗ|笑|草)$/, greet: /よろしく|こんにち|はじめまして|やあ|おはよ|こんばん/ };
L.chat = function (G, p, text, now) {
  if (G.phase === 'end') return 'ゲームは終わりました';
  text = L.cleanText(text, 40); if (!text) return null;
  if (G.phase === 'qa' && p >= 0 && (p === G.master || G.roles[p] === 'insider') && K.isAnswer(G.db, text, G.secret)) return 'お題そのものは言えません';
  if (G.phase === 'qa' && p >= 0 && (p === G.master || G.roles[p] === 'insider') && K.normL(text).indexOf(G.db.words[G.secret].n[0]) >= 0) return 'お題そのものは言えません';
  push(G, { t: 'chat', p: p, text: text });
  var npcs = []; G.players.forEach(function (pl, i) { if (pl.kind === 'npc' && i !== p) npcs.push(i); });
  if (!npcs.length) return null;
  var men = []; G.players.forEach(function (pl, i) { if (i !== p && text.indexOf(pl.name) >= 0) men.push(i); if (pl.kind === 'npc' && pl.ch === 'pochi' && text.indexOf('ポチ') >= 0 && men.indexOf(i) < 0) men.push(i); if (pl.kind === 'npc' && pl.ch === 'robo' && /ロボ/.test(text) && men.indexOf(i) < 0) men.push(i); });
  var d = function () { return rr(G, [800, 2000]) * (G.T.k < 1 ? 0.05 : 1); };
  var acc = RX.acc.test(text), q = RX.q.test(text), talky = G.phase === 'talk' || G.phase === 'v1' || G.phase === 'v2' || G.phase === 'tie';
  var mNpc = men.filter(function (i) { return isNpc(G, i); });
  if (mNpc.length && acc && !q && talky) { var k = mNpc[0]; say(G, k, line(G, k, 'defend'), 'defend', d(), now); return null; }
  if (mNpc.length && talky) { answerWho(G, mNpc[0], now, d()); return null; }
  if (mNpc.length) { say(G, mNpc[0], line(G, mNpc[0], G.rng() < 0.5 ? 'nice' : 'greet'), 'talk', d(), now); return null; }
  if ((acc || q) && talky) { shuffle(G, npcs).slice(0, 1 + (G.rng() < 0.4 ? 1 : 0)).forEach(function (i, x) { answerWho(G, i, now, d() + x * 900 * (G.T.k < 1 ? 0.05 : 1)); }); return null; }
  if (RX.greet.test(text)) { shuffle(G, npcs).slice(0, 2).forEach(function (i, x) { say(G, i, line(G, i, 'greet'), 'talk', d() + x * 700, now); }); return null; }
  if (RX.laugh.test(text) && G.rng() < 0.5) { var i3 = pick(G, npcs); say(G, i3, line(G, i3, 'laugh'), 'talk', d(), now); }
  return null;
};
function answerWho(G, i, now, delay) {
  if (!G.an) { say(G, i, line(G, i, 'dunno'), 'talk', delay, now); return; }
  var v = npcView(G, i); if (v.top < 0 || (v.p[v.top] || 0) < 1.2 / Math.max(2, v.cands.length)) { say(G, i, line(G, i, 'dunno'), 'talk', delay, now); return; }
  say(G, i, G.rng() < 0.55 ? accuse(G, i, v.top) : line(G, i, 'asked', { n: nameOf(G, v.top), p: pct(v.p[v.top]) }), 'talk', delay, now);
}

// ---------- その人に見せてよい情報だけ ----------
L.view = function (G, p, now) {
  var role = p >= 0 ? G.roles[p] : null, end = G.phase === 'end';
  var v = { n: G.n, phase: G.phase, nstep: G.nstep, lv: G.lv, diff: G.diff, limitSec: G.limitSec, blackGuess: G.blackGuess, me: p, master: G.master, guesser: G.guesser, swaps: G.swaps,
    players: G.players.map(function (pl) { return { kind: pl.kind, sid: pl.sid, name: pl.name, ch: pl.ch, e: pl.e, col: pl.col }; }),
    log: G.log.slice(-160), lid: G.lid, role: role,
    left: Math.max(0, (G.phase === 'qa' || G.phase === 'v1' || G.phase === 'v2' || G.phase === 'tie' ? G.deadline : G.at) - now),
    qn: G.players.map(function (_, i) { return G.qa.filter(function (e) { return e.p === i; }).length + G.pending.filter(function (e) { return e.p === i; }).length; }) };
  if (G.phase === 'qa') v.elapsed = now - G.qStart, v.limit = G.limit;
  if (G.phase === 'talk') v.talkDur = G.talkDur;
  // お題：おだいばん（夜の自分の番から）としってるっこ（夜の自分の番から）
  var nightIdx = ['close', 'master', 'insider', 'open'].indexOf(G.nstep), afterNight = ['deal', 'night'].indexOf(G.phase) < 0;
  var seeM = role === 'master' && (afterNight || (G.phase === 'night' && nightIdx >= 1));
  var seeI = role === 'insider' && (afterNight || (G.phase === 'night' && nightIdx >= 2));
  if (end || seeM || seeI || (G.phase !== 'deal' && G.phase !== 'night' && G.phase !== 'qa')) { v.word = L.word(G); v.cat = G.db.words[G.secret].catName; }
  // 自分の見る夜の場面（自分の番だけ目をあける）
  if (G.phase === 'night') v.eyes = (G.nstep === 'master' && role === 'master') || (G.nstep === 'insider' && role === 'insider') ? 'open' : G.nstep === 'open' ? 'wake' : 'closed';
  // 仲間：しってるっこ ⇔ おとも
  if (role === 'insider' && G.follower >= 0) v.pal = G.follower;
  if (role === 'follower') v.pal = G.insider;
  // おだいばん（人間）にだけ：答えを待っている質問
  v.pendingN = G.pending.length;
  v.pend = G.pending.map(function (e) { return { qid: e.qid, p: e.p, text: e.text, human: !!e.human, guess: e.parsed.t === 'guess' }; });
  if (p === G.master && G.phase === 'qa') { var h = G.pending.filter(function (e) { return e.human; })[0]; if (h) v.toAnswer = { qid: h.qid, p: h.p, text: h.text, left: Math.max(0, h.due - now), hint: hintFor(G, h) }; }
  if (G.phase === 'v1' || G.phase === 'v1show') { v.v1 = { voters: G.v1.voters, voted: G.v1.voters.map(function (i) { return G.v1.votes[i] != null; }), mine: p >= 0 ? G.v1.votes[p] : null }; if (G.phase === 'v1show') { v.v1.votes = G.v1.votes; v.v1.yes = G.v1.yes; v.v1.no = G.v1.no; v.v1.maj = G.v1.maj; v.gRole = G.roles[G.guesser]; } }
  if (G.phase === 'v2' || G.phase === 'v2show' || G.phase === 'tie' || G.phase === 'reveal') {
    v.v2 = { cands: L.v2Cands(G, p), all: G.v2.cands, voted: G.players.map(function (_, i) { return G.v2.votes[i] != null; }), mine: p >= 0 ? G.v2.votes[p] : null };
    if (G.phase !== 'v2') { v.v2.votes = G.v2.votes; v.v2.count = G.v2.count; v.v2.tops = G.v2.tops; }
    if (G.phase === 'reveal') { v.v2.accused = G.v2.accused; v.accRole = G.roles[G.v2.accused]; }
  }
  if (G.v2) v.gRole = G.roles[G.guesser];   // 投票②に進んだ＝正解者は たんてい（公開ずみ）
  if (end) { v.result = G.result; v.endLines = G.endLines; v.roles = G.roles.slice(); v.qaFull = G.qa.map(function (e) { return { p: e.p, text: e.text, ans: e.ans, ex: e.ex != null ? Math.round(e.ex * 100) / 100 : null }; }); }
  return v;
};
// おだいばん（人間）向け：知識ベースでの答えの目安（ボタンの横に小さく出す。まちがっていたら無視してOK）
function hintFor(G, e) {
  if (e.parsed.t === 'cmp' || e.parsed.t === 'kindof') { return { ans: K.answerParsed(G.db, e.parsed, G.secret), attr: e.parsed.t === 'cmp' ? '大きさくらべ（「' + G.db.words[e.parsed.w].w + '」と）' : '「' + G.db.words[e.parsed.w].w + '」のなかま', neg: false }; }
  if (e.parsed.t === 'fact') { var fh = K.factHits(G.db, G.secret, e.parsed.text); var a0 = K.answerParsed(G.db, e.parsed, G.secret); return { ans: a0, attr: fh.length ? '「' + fh.map(function (h) { return h.s; }).join('・') + '」は お題に関係あり' : 'ずかんに のっていないことば', neg: false }; }
  if (e.parsed.t !== 'attr') return null; var a = K.answerParsed(G.db, e.parsed, G.secret); return { ans: a, attr: K.ATTRS[e.parsed.a].q, neg: !!e.parsed.neg }; }
if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.SKL = L;
})(this);
