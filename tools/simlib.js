// しってるっこ：自己対戦シミュレーター（本物の logic.js をターボ時間で動かす）。人間役のボットも用意
'use strict';
const C = require('./load.js')();
const K = C.SKB, B = C.SKBR, L = C.SKL;
const DB = K.build(C.SK_TOPICS);
const CH = ['fuu', 'mimi', 'nyaco', 'pochi', 'robo', 'kon'];
function split() { const train = [], test = []; DB.words.forEach(w => (w.id % 5 === 2 ? test : train).push(w.id)); return { train, test }; }
// 人間役：質問はゆるめ（τ大きめ・2割は読めない質問）、しってるっこ役は σ がまちまち（あからさま〜控えめ）
function humanBot(r) { return { tau: 0.6 + r() * 0.6, junk: 0.1 + r() * 0.2, sig: 0.3 + r() * 3.5, iTh: 0.2 + r() * 0.6, gTh: 0.35 + r() * 0.4, gap: 0.8 + r() * 0.8, noise: 1.0 + r() * 0.8, err: 0.03 + r() * 0.05 }; }
// seats: [{kind:'npc', P} | {kind:'human', hb}]、o: {roles?, limit, diff}
function play(seats, o, r) {
  const players = seats.map((s, i) => s.kind === 'npc' ? { kind: 'npc', ch: CH[i % 6] } : { kind: 'human', sid: i + 1, name: 'H' + i });
  const G = L.newGame(DB, B.HAND, { players, lv: o.lv || 'ultra', diff: o.diff || 'normal', limit: o.limit || 300, turbo: true, rng: r, now: 0, roles: o.roles, secret: o.secret, follower: o.follower });
  if (o.secret != null) G.secret = o.secret;
  seats.forEach((s, i) => { if (s.kind === 'npc') { const P = Object.assign({}, s.P); if (!s.lvP) { P.noise = s.noise || 0; P.slop = 0; } G.P[i] = P; } else G.P[i] = Object.assign({}, B.HAND, { noise: s.hb.noise, th1: 0.5 }); });
  const hNext = seats.map(() => 0);
  let now = 0;
  while (G.phase !== 'end' && now < 60000) {
    now += 25;
    // 人間役の行動
    seats.forEach((s, i) => {
      if (s.kind !== 'human') return; const hb = s.hb;
      if (G.phase === 'night' && G.nstep === 'master' && i === G.master) L.masterOk(G, i, now);
      if (G.phase === 'qa') {
        if (i === G.master) { const e = G.pending.find(x => x.human); if (e && now - e.at > (hb.delay || 150)) { const h = hb.hedge ? hedgeAnswer(G, e, r, hb) : null; if (h) { L.answer(G, i, e.qid, h.a, now, h.note); return; } let a = K.answerParsed(DB, e.parsed, G.secret); if (a !== 'correct' && r() < hb.err) a = a === 'y' ? 'n' : a === 'n' ? 'y' : 'u'; if (e.parsed.t === 'guess') a = a === 'correct' ? 'correct' : 'n'; L.answer(G, i, e.qid, a === 'correct' && e.parsed.t !== 'guess' ? 'y' : a, now); } return; }
        if (!hNext[i]) hNext[i] = now + 300 * hb.gap * r();
        if (now >= hNext[i] && !G.pending.some(e => e.p === i)) {
          hNext[i] = now + 330 * hb.gap * (0.6 + r() * 0.8);
          if (r() < hb.junk) { L.ask(G, i, 'どんな感じのもの？', now); return; }
          const frac = (now - G.qStart) / G.limit, P = Object.assign({}, B.HAND, { tau: hb.tau, gTh: hb.gTh, sig: hb.sig, sigLate: hb.sig, iTh: hb.iTh });
          const c = G.roles[i] === 'insider' ? B.chooseInsider(G.pub, P, G.secret, { frac, r }) : B.chooseCommon(G.pub, P, { frac, r });
          if (c.w != null) L.ask(G, i, { w: c.w }, now); else L.ask(G, i, { a: c.a }, now);
        }
      }
    });
    L.tick(G, now, () => false);
  }
  return G;
}
// 人間っぽい おだいばん（本物の対局から）：あいまいに答える・固有名詞のお題だと「ゲーム？」に いいえ・近い答えに「近い」・ときどき ひとこと
function hedgeAnswer(G, e, r, hb) {
  const sec = DB.words[G.secret], p = e.parsed;
  let a = K.answerParsed(DB, p, G.secret);
  if (p.t === 'guess') {
    if (a === 'correct') return { a: 'correct' };
    if (p.w >= 0 && DB.words[p.w].cat === sec.cat && r() < 0.5) return { a: 'pn', note: r() < 0.5 ? '近い' : '' };   // 同じなかま →「いいえ、だいぶ近い」
    return { a: a === 'sp' ? 'sp' : 'n' };
  }
  if (a === 'correct') a = 'y';
  const kind = p.t === 'attr' && K.ATTRS[p.a].g === 'kind';
  if (kind && sec.v[K.AI.proper] === 1 && a === 'y' && r() < 0.4) a = 'n';   // 「ゲーム？」→ ひとつの作品なので いいえ
  const u = r();
  if (a === 'u') a = u < 0.45 ? 'u' : u < 0.75 ? 'py' : 'pn';
  else if (a === 'y') a = u < hb.err ? 'n' : u < 0.12 ? 'py' : u < 0.16 && kind ? 'sp' : 'y';
  else if (a === 'n') a = u < hb.err ? 'y' : u < 0.1 ? 'pn' : u < 0.13 ? 'u' : 'n';
  let note = '';
  if ((a === 'py' || a === 'pn' || a === 'sp') && r() < hb.note) { const fs = sec.facts || []; if (fs.length) note = fs[Math.floor(r() * fs.length)][0] + 'は近い'; }
  return { a, note };
}
function wonBy(G, i) { return G.result && G.result.winners.indexOf(i) >= 0; }
module.exports = { C, K, B, L, DB, CH, split, humanBot, play, wonBy, hedgeAnswer };
