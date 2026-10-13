/* しってるっこ：共通の定数・小道具・汎用UI（ほかの画面スクリプトより先に読み込む）
 * 構成：WebRTC（PeerJS）による P2P。ホストのブラウザが唯一の正（authoritative）で、お題配り・進行・NPCの思考はホストが行います。
 * 参加者に送るのは「その人が見てよい情報」だけ。お題は おだいばん・しってるっこ の端末にだけ送り、たんていの端末には正解が出るまで送りません（役わり・NPCの頭の中も結果発表まで送りません）。
 */
'use strict';
var $ = function (id) { return document.getElementById(id); };
var K = window.SKB, B = window.SKBR, L = window.SKL;
var DB = K.build(window.SK_TOPICS || []);
B.ATTRS = K.ATTRS;
var PW = (window.SK_WEIGHTS && window.SK_WEIGHTS.P) || B.HAND;   // 学習済みの重み（なければ手作りの初期値）
var Q = new URLSearchParams(location.search);
var CFG = window.SK_CONFIG || {};
var ICE = (CFG.iceServers && CFG.iceServers.length) ? CFG.iceServers : [{ urls: 'stun:stun.l.google.com:19302' }];
if (Q.get('ice')) ICE = Q.get('ice').split(',').map(function (u) { return { urls: u }; });   // テスト・独自環境用
var PEER_OPTS = Object.assign({ debug: 1, config: { iceServers: ICE } }, CFG.peer || {});
var ID_PREFIX = 'shitteru-v1-', CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
var TURBO = Q.has('turbo');
var MAX_HUMANS = 8, MAX_TOTAL = 8, MIN_TOTAL = 4, HB_MS = 3000, LOST_MS = 10000;
var LS_ID = 'sk-client-id', LS_NAME = 'sk-name', LS_HOST = 'sk-host-room', SS_CLIENT = 'sk-joined', LS_SOUND = 'sk-sound-off', LS_HIDE = 'sk-hide-word';
var host = null, client = null, lastView = null, pending = '';
function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch (e) {} }
function load(k, json) { try { var v = localStorage.getItem(k); return json ? JSON.parse(v) : v; } catch (e) { return null; } }
function sstore(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function sload(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } }
function rid(n) { var s = ''; for (var i = 0; i < n; i++) s += 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]; return s; }
var myId = load(LS_ID) || (function () { var v = rid(16); store(LS_ID, v); return v; })();
var soundOff = load(LS_SOUND) === '1';
function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
function cleanName(n) { return String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 8); }
var PARTY = window.FuuParty && window.FuuParty.info;   // ひろばの「みんなの部屋」から来たとき
function genCode() { if (PARTY && PARTY.host) return PARTY.code; var c = ''; for (var i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; return c; }
function normCode(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '0').replace(/I/g, '1').slice(0, 4); }
function inviteUrl(code) { var u = location.origin + location.pathname + '?room=' + code; if (Q.get('ice')) u += '&ice=' + encodeURIComponent(Q.get('ice')); return u; }
var NPC_NAMES = window.SK_CHARS.map(function (c) { return c.name; });
function avHtml(pl, cls) {
  if (pl.kind === 'npc') return '<span class="av npc ' + (cls || '') + '" style="--ac:' + pl.col + '">' + pl.e + '</span>';
  var hue = 0; for (var i = 0; i < pl.name.length; i++) hue = (hue * 31 + pl.name.charCodeAt(i)) % 360;
  return '<span class="av ' + (cls || '') + '" style="--ac:hsl(' + hue + ',55%,48%)">' + esc(pl.name.slice(0, 1)) + '</span>';
}
function dispName(pl) { return pl.kind === 'npc' ? pl.name + pl.e : pl.name; }

// ---------- 汎用UI ----------
function show(id) { ['title', 'lobby', 'game', 'end'].forEach(function (s) { $(s).classList.toggle('active', s === id); }); document.body.classList.toggle('in-game', id === 'game'); }
function overlay(id, on) { $(id).classList.toggle('active', on); }
var toastT;
function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 3000); }
function banner(msg) { var b = $('banner'); b.textContent = msg || ''; b.classList.toggle('show', !!msg); }
function confirmBox(title, text, yes, cb) {
  $('cfTitle').textContent = title; $('cfText').textContent = text; $('cfYes').textContent = yes; $('cfNo').style.display = ''; $('cfNo').textContent = 'やめる';
  overlay('confirmModal', true);
  $('cfYes').onclick = function () { overlay('confirmModal', false); cb(); };
  $('cfNo').onclick = function () { overlay('confirmModal', false); };
}
function alertBox(msg) { confirmBox('お知らせ', msg, 'OK', function () {}); $('cfNo').style.display = 'none'; }
function connecting(on, title, text, onCancel) {
  overlay('connecting', on);
  if (on) { $('connTitle').textContent = title || '接続中…'; $('connText').textContent = text || ''; $('connCancel').onclick = onCancel || function () { location.href = location.pathname; }; }
}
$('rulesBtn1').onclick = $('rulesBtn2').onclick = function () { overlay('rulesModal', true); };
$('rulesClose').onclick = function () { overlay('rulesModal', false); };
['rulesModal', 'menuModal', 'charModal'].forEach(function (id) { $(id).addEventListener('click', function (e) { if (e.target === this) overlay(id, false); }); });
$('rulesList').innerHTML = [
  '<b>4〜8人</b>で遊びます。役わりは3つ：<b>👑 おだいばん</b>（1人・だれなのか みんなに公開）、<b>🤫 しってるっこ</b>（1人・ひみつ）、残りは<b>🔍 たんてい</b>。',
  '<b>夜</b>：みんな目をとじる → おだいばんだけ目をあけて お題を確認（知らない言葉なら かえてOK）→ おだいばんは目をとじて、しってるっこ だけが目をあけて お題を こっそり確認 → みんな目をあける。（画面が自動で進めます）',
  '<b>質問タイム（ふつう5分）</b>：おだいばん以外の全員が、お題を当てるための質問をします。おだいばんは<b>「はい」「いいえ」「わからない」</b>だけで答えます。思いついたら「<b>それは○○？</b>」と答えてOK。',
  '時間内に<b>だれも当てられなかったら、全員の負け</b>（しってるっこも負け）。だから しってるっこは、知らないふりをしながら みんなを正解へ みちびく必要があります。',
  '正解が出たら<b>砂時計をひっくり返す</b>：質問にかかった時間と同じだけ<b>話し合いタイム</b>。正解者は しってるっこ？ だれの質問が「知ってる人っぽかった」？',
  '<b>投票①</b>：正解者 以外の全員（おだいばんも）が「正解者は しってるっこ？」に 🙋／🙅 で投票。そのあと正解者は役わりを明かします。<b>過半数が🙋</b>で正解者が しってるっこ → たんていチームの勝ち／過半数が🙋なのに たんていだった → しってるっこの勝ち／過半数にならず 正解者が しってるっこ だった → しってるっこの勝ち（見のがし）。',
  '<b>投票②</b>（過半数にならず、正解者が たんていだったとき）：全員で「しってるっこは だれ？」を いっせいに指さします（正解者・おだいばんも投票。候補は2人以外。<b>同数なら正解者が決める</b>）。当たれば たんていチーム（おだいばん含む）の勝ち、外れたら しってるっこの勝ち。',
  '<b>ブラック版オプション</b>：🐾 おとも（6人以上・しってるっこ がだれか知っている味方）、🎯 正解者の道づれ（投票①で まちがえて つかまった正解者も いっしょに勝ち）。',
  '<b>質問のしかた</b>：入力欄に ふつうの日本語で（「それって食べられる？」「手より大きい？」など）。🧩 から えらんでもOK。🎤 で話すと そのまま質問になります。おだいばんになったら 大きな ⭕／❌／🤷 ボタンで答えます（🎤で「はい」と言ってもOK）。',
  '<b>NPC</b>（ふーさん🐻・ミミ🐰・ロボミ🤖・ニャコ😺・ポチ太🐶・コンタ🦊）は どの役でもこなします。おだいばんNPCは お題ずかん（475語×130の特ちょう）で答え、わからない質問には「わからない」。たんていNPCは いちばん候補が しぼれる質問をえらび、しってるっこNPCは さりげなく みちびきます。話し合いでは「だれの質問が うまくいきすぎていたか」を計算して 推理します。強さは やさしい／ふつう／かしこい／アストラウルトラ😎（自己対戦で学習した頭脳）。'
].map(function (t) { return '<li>' + t + '</li>'; }).join('');
