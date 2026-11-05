(() => {
const C = window.CONFIG;
const tg = window.Telegram && Telegram.WebApp;
if (tg) { try { tg.ready(); tg.expand(); tg.setHeaderColor('#0f1115'); tg.setBackgroundColor('#0f1115'); } catch (e) {} }
const app = document.getElementById('app'), nav = document.getElementById('nav');

/* ---------- helpers ---------- */
const store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const season = () => { const d = new Date(); return d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1; };
const fmtDate = (d, o) => new Date(d).toLocaleDateString('en-GB', { timeZone: C.TZ, ...o });
const fmtTime = d => new Date(d).toLocaleTimeString('en-GB', { timeZone: C.TZ, hour: '2-digit', minute: '2-digit' });
const ymd = d => new Date(d).toLocaleDateString('en-CA', { timeZone: C.TZ });
const LIVE = ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE', 'SUSP', 'INT'];
const DONE = ['FT', 'AET', 'PEN'];
const MEDIA = 'https://media.api-sports.io/football/';
const num = v => parseFloat(String(v ?? 0).replace('%', '')) || 0;
const PRIORITY = [39, 2, 140, 3, 61, 78, 135, 848, 1, 6];

async function api(path, ttl = 300, map) {
  const key = 'c:' + path;
  const hit = store.get(key);
  if (hit && Date.now() - hit.t < ttl * 1000) return hit.d;
  if (!C.API_KEY || C.API_KEY.startsWith('PASTE')) throw new Error('Add your API key in config.js first.');
  const r = await fetch(C.BASE + path, { headers: { 'x-apisports-key': C.API_KEY } });
  const j = await r.json();
  const errs = j.errors && (Array.isArray(j.errors) ? j.errors : Object.values(j.errors));
  if (errs && errs.length) throw new Error(errs.join(' | '));
  let d = j.response || [];
  if (map) d = map(d);
  store.set(key, { t: Date.now(), d });
  return d;
}

/* favourites + reminders */
const META = {};
const favs = () => store.get('fav', { team: [], player: [], league: [] });
const isFav = (t, id) => favs()[t].some(x => x.id == id);
function toggleFav(type, id) {
  const f = favs(); const i = f[type].findIndex(x => x.id == id);
  if (i >= 0) f[type].splice(i, 1); else if (META[type + ':' + id]) f[type].push(META[type + ':' + id]);
  store.set('fav', f);
}
const starBtn = (type, id, name, img) => { META[type + ':' + id] = { id, name, img }; return `<button class="starbtn" data-fav="${type}:${id}">${isFav(type, id) ? '★' : '☆'}</button>`; };
const isRem = id => store.get('rem', []).includes(id);
function toggleRem(id) { const r = store.get('rem', []); const i = r.indexOf(id); if (i >= 0) r.splice(i, 1); else r.push(id); store.set('rem', r); }

/* UI state */
const st = { day: null, leagueTab: 'Table', tableMode: 'Full', lmode: 'fix', pstat: 'goals', teamTab: 'Info', tmode: 'fix', matchTab: 'Overview', subs: false, favTab: 'Matches', season: null };
let timer = null;

const loading = () => '<div class="loading">Loading…</div>';
const errBox = e => `<div class="err"><b>Couldn't load data</b><br>${esc(e.message || e)}<br><button data-reload>Retry</button></div>`;
const empty = t => `<div class="empty">${esc(t)}</div>`;
const topBar = () => `<div class="top"><h1>${esc(C.APP_NAME)}</h1><button class="ico" data-go="#/search">🔍</button></div>`;

/* ---------- match rows ---------- */
function rowHtml(f, withDate) {
  const s = f.fixture.status.short, live = LIVE.includes(s), done = DONE.includes(s);
  let left;
  if (live) left = `<b class="red">${s === 'HT' ? 'HT' : (f.fixture.status.elapsed || '') + "'"}</b>`;
  else if (done) left = (withDate ? fmtDate(f.fixture.date, { day: 'numeric', month: 'short' }) + '<br>' : '') + 'FT';
  else if (s === 'NS' || s === 'TBD') left = (withDate ? fmtDate(f.fixture.date, { day: 'numeric', month: 'short' }) + '<br>' : '') + fmtTime(f.fixture.date);
  else left = esc(s);
  const sc = live || done ? [f.goals.home ?? 0, f.goals.away ?? 0] : ['', ''];
  const fav = favs().team.map(t => t.id);
  const star = id => fav.includes(id) ? ' <span class="star">★</span>' : '';
  const bell = !done && !live ? `<button class="bell ${isRem(f.fixture.id) ? 'on' : ''}" data-bell="${f.fixture.id}">🔔</button>` : '';
  return `<div class="match" data-go="#/match/${f.fixture.id}"><div class="mt">${left}</div><div class="teams">
    <div><img src="${f.teams.home.logo}" alt=""><span>${esc(f.teams.home.name)}${star(f.teams.home.id)}</span><b>${sc[0]}</b></div>
    <div><img src="${f.teams.away.logo}" alt=""><span>${esc(f.teams.away.name)}${star(f.teams.away.id)}</span><b>${sc[1]}</b></div></div>${bell}</div>`;
}
function groupedByLeague(list) {
  const m = new Map();
  list.forEach(f => { if (!m.has(f.league.id)) m.set(f.league.id, { l: f.league, items: [] }); m.get(f.league.id).items.push(f); });
  const arr = [...m.values()].sort((a, b) => {
    const pa = PRIORITY.indexOf(a.l.id), pb = PRIORITY.indexOf(b.l.id);
    return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb);
  });
  return arr.map(g => `<div class="group"><div class="ghead" data-go="#/league/${g.l.id}"><img src="${g.l.logo || g.l.flag || ''}" alt=""><div class="gt"><b>${esc(g.l.name)}</b><small>${esc(g.l.country)}${g.l.round ? ' | ' + esc(g.l.round.replace('Regular Season - ', 'Round ')) : ''}</small></div>›</div>${g.items.map(f => rowHtml(f)).join('')}</div>`).join('');
}

/* ---------- pages ---------- */
async function pageMatches() {
  const days = [];
  for (let i = -2; i <= 4; i++) {
    const d = new Date(Date.now() + i * 864e5);
    days.push({ k: ymd(d), l: i === -1 ? 'Yesterday' : i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : fmtDate(d, { weekday: 'short', day: 'numeric', month: 'short' }) });
  }
  if (!st.day) st.day = days[2].k;
  if (st.day !== 'live' && !days.find(d => d.k === st.day)) days.push({ k: st.day, l: fmtDate(st.day, { day: 'numeric', month: 'short' }) });
  const strip = `<div class="chips"><button class="chip live ${st.day === 'live' ? 'on' : ''}" data-set="day=live">Live</button>${days.map(d => `<button class="chip ${st.day === d.k ? 'on' : ''}" data-set="day=${d.k}">${d.l}</button>`).join('')}<button class="chip" data-cal>📅</button></div>`;
  app.innerHTML = topBar() + strip + loading();
  try {
    const list = st.day === 'live' ? await api('/fixtures?live=all', 30) : await api(`/fixtures?date=${st.day}&timezone=${C.TZ}`, 300);
    app.innerHTML = topBar() + strip + (list.length ? groupedByLeague(list) : empty(st.day === 'live' ? 'No live matches right now' : 'No matches on this day'));
    if (st.day === 'live') timer = setInterval(route, 30000);
  } catch (e) { app.innerHTML = topBar() + strip + errBox(e); }
}

async function pageFav() {
  const tabs = `<div class="seg">${['Matches', 'Teams', 'Players'].map(t => `<button class="${st.favTab === t ? 'on' : ''}" data-set="favTab=${t}">${t}</button>`).join('')}</div>`;
  const f = favs(); let body = '';
  try {
    if (st.favTab === 'Matches') {
      if (!f.team.length) body = empty('Star some teams to see their upcoming matches here');
      else {
        app.innerHTML = topBar() + tabs + loading();
        const res = await Promise.all(f.team.slice(0, 6).map(t => api(`/fixtures?team=${t.id}&next=5&timezone=${C.TZ}`, 600).catch(() => [])));
        const seen = new Set(); const all = res.flat().filter(x => !seen.has(x.fixture.id) && seen.add(x.fixture.id)).sort((a, b) => a.fixture.timestamp - b.fixture.timestamp);
        const byDay = {}; all.forEach(x => (byDay[ymd(x.fixture.date)] = byDay[ymd(x.fixture.date)] || []).push(x));
        body = all.length ? Object.keys(byDay).map(d => `<div class="sub" style="text-align:center;background:none">${fmtDate(d, { weekday: 'short', day: 'numeric', month: 'short' })}</div>${groupedByLeague(byDay[d])}`).join('') : empty('No upcoming matches found');
      }
    } else if (st.favTab === 'Teams') {
      body = f.team.length ? `<div class="group">${f.team.map(t => `<div class="lrow" data-go="#/team/${t.id}"><img src="${t.img}" alt=""><div class="n">${esc(t.name)}</div>${starBtn('team', t.id, t.name, t.img)}</div>`).join('')}</div>` : empty('No favourite teams yet');
    } else {
      body = f.player.length ? `<div class="group">${f.player.map(p => `<div class="lrow"><img src="${p.img}" style="border-radius:50%" alt=""><div class="n">${esc(p.name)}</div>${starBtn('player', p.id, p.name, p.img)}</div>`).join('')}</div>` : empty('No favourite players yet');
    }
  } catch (e) { body = errBox(e); }
  app.innerHTML = topBar() + tabs + body;
}

const SUGG = [[39, 'Premier League', 'England'], [2, 'UEFA Champions League', 'UEFA'], [140, 'La Liga', 'Spain'], [3, 'UEFA Europa League', 'UEFA'], [61, 'Ligue 1', 'France'], [78, 'Bundesliga', 'Germany'], [135, 'Serie A', 'Italy']];
async function pageLeagues() {
  const head = topBar();
  const lrow = (id, n, c, img) => `<div class="lrow" data-go="#/league/${id}"><img src="${img}" alt=""><div class="n">${esc(n)}<small>${esc(c)}</small></div>${starBtn('league', id, n, img)}</div>`;
  const fl = favs().league;
  const sug = `<div class="group"><div class="ghead"><b>${fl.length ? 'Favourites & suggested' : 'Suggested'}</b></div>${fl.map(l => lrow(l.id, l.name, '', l.img)).join('')}${SUGG.filter(s => !fl.some(l => l.id === s[0])).map(s => lrow(s[0], s[1], s[2], MEDIA + 'leagues/' + s[0] + '.png')).join('')}</div><h3 style="margin:18px 16px 6px">All competitions</h3>`;
  app.innerHTML = head + sug + loading();
  try {
    const all = await api('/leagues?current=true', 86400, d => d.map(x => ({ id: x.league.id, n: x.league.name, lg: x.league.logo, c: x.country.name, fl: x.country.flag })));
    const g = {}; all.forEach(x => (g[x.c] = g[x.c] || { fl: x.fl, items: [] }).items.push(x));
    const names = Object.keys(g).sort((a, b) => a === 'World' ? -1 : b === 'World' ? 1 : a.localeCompare(b));
    app.innerHTML = head + sug + names.map(c => `<details class="g"><summary>${g[c].fl ? `<img src="${g[c].fl}" alt="">` : '🌍'}<span style="flex:1">${esc(c)}</span>▾</summary>${g[c].items.map(x => lrow(x.id, x.n, c, x.lg)).join('')}</details>`).join('');
  } catch (e) { app.innerHTML = head + sug + errBox(e); }
}

async function pageSearch() {
  app.innerHTML = `<div class="top"><button class="ico" data-back>‹</button><h1 style="font-size:20px">Search</h1><span style="width:42px"></span></div><div class="search"><input id="q" placeholder="Team or league (3+ letters)" autofocus></div><div id="res"></div>`;
  const q = document.getElementById('q'); let t;
  q.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(async () => {
      const v = q.value.trim(); const out = document.getElementById('res');
      if (v.length < 3) { out.innerHTML = ''; return; }
      out.innerHTML = loading();
      try {
        const [tm, lg] = await Promise.all([api('/teams?search=' + encodeURIComponent(v), 3600), api('/leagues?search=' + encodeURIComponent(v), 3600).catch(() => [])]);
        out.innerHTML = `<div class="group">${lg.slice(0, 8).map(x => `<div class="lrow" data-go="#/league/${x.league.id}"><img src="${x.league.logo}" alt=""><div class="n">${esc(x.league.name)}<small>${esc(x.country.name)}</small></div></div>`).join('')}${tm.slice(0, 15).map(x => `<div class="lrow" data-go="#/team/${x.team.id}"><img src="${x.team.logo}" alt=""><div class="n">${esc(x.team.name)}<small>${esc(x.team.country || '')}</small></div>${starBtn('team', x.team.id, x.team.name, x.team.logo)}</div>`).join('') || empty('Nothing found')}</div>`;
      } catch (e) { out.innerHTML = errBox(e); }
    }, 400);
  });
}

/* standings table */
const rc = d => !d ? '' : /Champions League/i.test(d) ? '#3b5bff' : /Europa/i.test(d) ? '#2bb39a' : /Conference/i.test(d) ? '#7ac943' : /Relegation/i.test(d) ? '#ff4d4f' : /Promotion/i.test(d) ? '#3b5bff' : '';
function tableHtml(groups, mode, highlight = []) {
  return groups.map(g => {
    const th = mode === 'Short' ? '<th>#</th><th>Team</th><th>P</th><th>GD</th><th>Pts</th>' : mode === 'Form' ? '<th>#</th><th>Team</th><th>Last 5</th><th>Pts</th>' : '<th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>F/A</th><th>GD</th><th>Pts</th>';
    const rows = g.map(r => {
      const nm = `<td class="tm" data-go="#/team/${r.team.id}"><img src="${r.team.logo}" alt="">${esc(r.team.name)}</td>`;
      const a = r.all, rk = `<td class="rk" style="--rc:${rc(r.description)}">${r.rank}</td>`;
      let mid;
      if (mode === 'Short') mid = `<td>${a.played}</td><td>${r.goalsDiff}</td><td><b>${r.points}</b></td>`;
      else if (mode === 'Form') mid = `<td><span class="form">${(r.form || '').split('').slice(-5).map(c => `<i class="${c}">${c}</i>`).join('')}</span></td><td><b>${r.points}</b></td>`;
      else mid = `<td>${a.played}</td><td>${a.win}</td><td>${a.draw}</td><td>${a.lose}</td><td>${a.goals.for}/${a.goals.against}</td><td>${r.goalsDiff}</td><td><b>${r.points}</b></td>`;
      return `<tr class="${highlight.includes(r.team.id) ? 'me' : ''}">${rk}${nm}${mid}</tr>`;
    }).join('');
    return `<div class="group" style="overflow-x:auto"><table><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }).join('');
}
const modeSeg = () => `<div class="seg">${['Short', 'Full', 'Form'].map(m => `<button class="${st.tableMode === m ? 'on' : ''}" data-set="tableMode=${m}">${m}</button>`).join('')}</div>`;

/* fixtures list with Fixtures/Results toggle */
function fixturesView(list, modeKey) {
  const seg = `<div class="seg"><button class="${st[modeKey] === 'fix' ? 'on' : ''}" data-set="${modeKey}=fix">Fixtures</button><button class="${st[modeKey] === 'res' ? 'on' : ''}" data-set="${modeKey}=res">Results</button></div>`;
  let l = list.filter(f => st[modeKey] === 'res' ? DONE.includes(f.fixture.status.short) : !DONE.includes(f.fixture.status.short));
  l.sort((a, b) => st[modeKey] === 'res' ? b.fixture.timestamp - a.fixture.timestamp : a.fixture.timestamp - b.fixture.timestamp);
  const m = new Map();
  l.forEach(f => { const k = f.league.name + (f.league.round ? ' · ' + f.league.round.replace('Regular Season - ', 'Round ') : ''); if (!m.has(k)) m.set(k, []); m.get(k).push(f); });
  return seg + (l.length ? [...m].map(([k, v]) => `<div class="group"><div class="sub">${esc(k)}</div>${v.map(f => rowHtml(f, true)).join('')}</div>`).join('') : empty('Nothing to show'));
}

async function pageLeague(id) {
  app.innerHTML = loading();
  try {
    const info = (await api('/leagues?id=' + id, 86400))[0];
    const seasons = info.seasons.map(s => s.year).sort((a, b) => b - a);
    if (!st.season || !seasons.includes(st.season)) st.season = (info.seasons.find(s => s.current) || {}).year || seasons[0];
    const se = info.seasons.find(s => s.year === st.season) || {};
    const pr = se.start && se.end ? Math.max(0, Math.min(100, (Date.now() - new Date(se.start)) / (new Date(se.end) - new Date(se.start)) * 100)) : 0;
    const tabs = ['Table', 'Matches', 'Player stats', 'Team stats'];
    const head = `<div class="hero" style="--hc:#4a1111"><div class="hbar"><button data-back>‹</button><div>${starBtn('league', id, info.league.name, info.league.logo)}</div></div>
      <div class="hid"><img src="${info.league.logo}" alt=""><div><h2>${esc(info.league.name)}</h2><small>${esc(info.country.name)}</small><br><select data-season>${seasons.map(y => `<option ${y === st.season ? 'selected' : ''} value="${y}">${y}/${y + 1}</option>`).join('')}</select></div></div>
      <div class="bar"><i style="width:${pr}%"></i></div><div><span>${se.start ? fmtDate(se.start, { day: '2-digit', month: '2-digit' }) : ''}</span><span>${se.end ? fmtDate(se.end, { day: '2-digit', month: '2-digit' }) : ''}</span></div>
      <div class="tabs">${tabs.map(t => `<button class="${st.leagueTab === t ? 'on' : ''}" data-set="leagueTab=${t}">${t}</button>`).join('')}</div></div>`;
    app.innerHTML = head + loading();
    let body = '';
    const S = st.season;
    if (st.leagueTab === 'Table') {
      const s = await api(`/standings?league=${id}&season=${S}`, 600);
      body = s.length ? modeSeg() + tableHtml(s[0].league.standings, st.tableMode) : empty('No table for this season');
    } else if (st.leagueTab === 'Matches') {
      body = fixturesView(await api(`/fixtures?league=${id}&season=${S}&timezone=${C.TZ}`, 600), 'lmode');
    } else if (st.leagueTab === 'Player stats') {
      const kind = st.pstat === 'goals' ? 'topscorers' : 'topassists';
      const l = await api(`/players/${kind}?league=${id}&season=${S}`, 3600);
      body = `<div class="seg"><button class="${st.pstat === 'goals' ? 'on' : ''}" data-set="pstat=goals">Goals</button><button class="${st.pstat === 'assists' ? 'on' : ''}" data-set="pstat=assists">Assists</button></div><div class="group">${l.map(x => { const p = x.player, s = x.statistics[0]; return `<div class="prow2"><img class="p" src="${p.photo}" alt=""><div class="n">${esc(p.name)}<small>${esc(s.team.name)}</small></div><b class="v">${st.pstat === 'goals' ? s.goals.total : s.goals.assists}</b>${starBtn('player', p.id, p.name, p.photo)}</div>`; }).join('') || empty('No data')}</div>`;
    } else {
      const s = await api(`/standings?league=${id}&season=${S}`, 600);
      const rows = s.length ? s[0].league.standings.flat() : [];
      const top = (t, fn, lab) => `<div class="group"><div class="sub">${t}</div>${[...rows].sort(fn).slice(0, 5).map(r => `<div class="prow2"><img class="tl" src="${r.team.logo}" alt=""><div class="n">${esc(r.team.name)}</div><b class="v">${lab(r)}</b></div>`).join('')}</div>`;
      body = rows.length ? top('Most goals scored', (a, b) => b.all.goals.for - a.all.goals.for, r => r.all.goals.for) + top('Best defence (goals conceded)', (a, b) => a.all.goals.against - b.all.goals.against, r => r.all.goals.against) + top('Most wins', (a, b) => b.all.win - a.all.win, r => r.all.win) : empty('No data');
    }
    app.innerHTML = head + body;
  } catch (e) { app.innerHTML = `<div class="top"><button class="ico" data-back>‹</button></div>` + errBox(e); }
}

async function pageTeam(id) {
  app.innerHTML = loading();
  try {
    const S = season();
    const t = (await api('/teams?id=' + id, 86400))[0];
    const tabs = ['Info', 'Matches', 'Table', 'Squad', 'Player stats', 'Team stats', 'Transfers'];
    const head = `<div class="hero" style="--hc:#5a4710"><div class="hbar"><button data-back>‹</button><div>${starBtn('team', id, t.team.name, t.team.logo)}</div></div>
      <div class="hid"><img src="${t.team.logo}" alt=""><div><h2>${esc(t.team.name)}</h2><small>${esc(t.team.country || '')}</small></div></div>
      <div class="tabs">${tabs.map(x => `<button class="${st.teamTab === x ? 'on' : ''}" data-set="teamTab=${x}">${x}</button>`).join('')}</div></div>`;
    app.innerHTML = head + loading();
    const leagues = () => api(`/leagues?team=${id}&season=${S}`, 86400);
    const domestic = async () => { const l = await leagues(); return (l.find(x => x.league.type === 'League') || l[0]); };
    let body = '';
    const tb = st.teamTab;
    if (tb === 'Info') {
      body = `<div class="group">${[['Full name', t.team.name], ['Country', t.team.country], ['Founded', t.team.founded], ['Stadium', t.venue.name], ['City', t.venue.city], ['Capacity', t.venue.capacity]].map(([k, v]) => `<div class="kv"><span>${k}</span><span>${esc(v ?? '-')}</span></div>`).join('')}</div>`;
    } else if (tb === 'Matches') {
      body = fixturesView(await api(`/fixtures?team=${id}&season=${S}&timezone=${C.TZ}`, 600), 'tmode');
    } else if (tb === 'Table') {
      const d = await domestic(); if (!d) body = empty('No league found');
      else { const s = await api(`/standings?league=${d.league.id}&season=${S}`, 600); body = `<div class="sub" style="margin:8px 12px 0;border-radius:10px">${esc(d.league.name)}</div>` + modeSeg() + (s.length ? tableHtml(s[0].league.standings, st.tableMode, [+id]) : empty('No table')); }
    } else if (tb === 'Squad') {
      const sq = (await api('/players/squads?team=' + id, 3600))[0];
      const order = ['Goalkeeper', 'Defender', 'Midfielder', 'Attacker'];
      body = sq ? order.map(pos => { const p = sq.players.filter(x => x.position === pos); return p.length ? `<div class="group"><div class="sub">${pos}s</div>${p.map(x => `<div class="prow2"><img class="p" src="${x.photo}" alt=""><div class="n">${esc(x.name)}<small>${x.age ? x.age + ' yrs' : ''}</small></div><b class="v" style="color:var(--mut)">${x.number ?? ''}</b>${starBtn('player', x.id, x.name, x.photo)}</div>`).join('')}</div>` : ''; }).join('') : empty('No squad data');
    } else if (tb === 'Player stats') {
      const d = await domestic();
      const l = await api(`/players?team=${id}&season=${S}`, 3600);
      body = `<div class="group">${l.map(x => { const s = x.statistics[0] || {}; return `<div class="prow2"><img class="p" src="${x.player.photo}" alt=""><div class="n">${esc(x.player.name)}<small>${s.games?.appearences ?? 0} apps · ${s.goals?.total ?? 0} goals · ${s.goals?.assists ?? 0} assists</small></div><b class="v">${s.games?.rating ? (+s.games.rating).toFixed(1) : '-'}</b></div>`; }).join('') || empty('No data')}</div>`;
    } else if (tb === 'Team stats') {
      const d = await domestic();
      if (!d) body = empty('No league found');
      else {
        const s = await api(`/teams/statistics?league=${d.league.id}&season=${S}&team=${id}`, 3600);
        const f = s.fixtures || {};
        const rows = [['Played', f.played?.total], ['Wins', f.wins?.total], ['Draws', f.draws?.total], ['Losses', f.loses?.total], ['Goals for', s.goals?.for?.total?.total], ['Goals against', s.goals?.against?.total?.total], ['Avg goals scored', s.goals?.for?.average?.total], ['Avg goals conceded', s.goals?.against?.average?.total], ['Clean sheets', s.clean_sheet?.total], ['Biggest win', s.biggest?.wins?.home || s.biggest?.wins?.away], ['Form', s.form]];
        body = `<div class="sub" style="margin:8px 12px 0;border-radius:10px">${esc(d.league.name)}</div><div class="group">${rows.map(([k, v]) => `<div class="kv"><span>${k}</span><span>${esc(v ?? '-')}</span></div>`).join('')}</div>`;
      }
    } else {
      const tr = await api('/transfers?team=' + id, 3600);
      const all = []; tr.forEach(p => p.transfers.forEach(x => all.push({ p: p.player, ...x })));
      all.sort((a, b) => new Date(b.date) - new Date(a.date));
      body = `<div class="group">${all.slice(0, 40).map(x => { const into = x.teams.in.id == id; return `<div class="prow2"><div class="n">${esc(x.p.name)}<small>${into ? 'From ' + esc(x.teams.out.name) : 'To ' + esc(x.teams.in.name)} · ${fmtDate(x.date, { day: 'numeric', month: 'short', year: 'numeric' })}</small></div><b class="v" style="color:${into ? 'var(--grn)' : 'var(--red)'};font-size:13px">${into ? 'IN' : 'OUT'}${x.type ? ' · ' + esc(x.type) : ''}</b></div>`; }).join('') || empty('No transfers')}</div>`;
    }
    app.innerHTML = head + body;
  } catch (e) { app.innerHTML = `<div class="top"><button class="ico" data-back>‹</button></div>` + errBox(e); }
}

/* ---------- match page ---------- */
function icon(e) {
  if (e.type === 'Goal') return e.detail === 'Missed Penalty' ? '❌' : '⚽';
  if (e.type === 'Card') return e.detail.includes('Red') || e.detail.includes('Second') ? '🟥' : '🟨';
  if (e.type === 'subst') return '🔁';
  if (e.type === 'Var') return '📺';
  return '•';
}
function eventsHtml(f, newestFirst) {
  const evs = (f.events || []).slice();
  let h = 0, a = 0;
  const own = { h: f.teams.home.id, a: f.teams.away.id };
  const out = evs.map(e => {
    let pill = '';
    if (e.type === 'Goal' && e.detail !== 'Missed Penalty') {
      const forHome = (e.team.id === own.h) !== (e.detail === 'Own Goal');
      forHome ? h++ : a++; pill = `<span class="pill">${h} - ${a}</span>`;
    }
    return { e, pill };
  });
  if (newestFirst) out.reverse();
  const items = out.filter(({ e }) => st.subs || e.type !== 'subst').map(({ e, pill }) => {
    const m = e.time.elapsed + (e.time.extra ? '+' + e.time.extra : '') + "'";
    const txt = e.type === 'subst' ? `<b>${esc(e.assist.name || '')}</b> ↑<small>${esc(e.player.name || '')} ↓</small>` : `<b>${esc(e.player.name || '')}</b>${pill}${e.type === 'Goal' && e.assist?.name ? `<small>${esc(e.assist.name)}</small>` : `<small>${icon(e)} ${esc(e.comments || e.detail)}</small>`}`;
    const isHome = e.team.id === own.h;
    return `<div class="ev"><div class="l">${isHome ? txt : ''}</div><div class="m">${m}<br>${icon(e)}</div><div>${isHome ? '' : txt}</div></div>`;
  });
  return items.join('') || empty('No events yet');
}
function pitchHtml(f) {
  const L = f.lineups || [];
  if (L.length < 2 || !L[0].startXI?.length) return empty('Line-ups are not available yet');
  const rate = {};
  (f.players || []).forEach(t => t.players.forEach(p => rate[p.player.id] = p.statistics[0]?.games?.rating));
  const evs = f.events || [];
  const pl = p => {
    const yc = evs.some(e => e.type === 'Card' && e.player.id === p.id && e.detail === 'Yellow Card');
    const rcard = evs.some(e => e.type === 'Card' && e.player.id === p.id && e.detail !== 'Yellow Card');
    const g = evs.filter(e => e.type === 'Goal' && e.player.id === p.id && e.detail !== 'Own Goal' && e.detail !== 'Missed Penalty').length;
    const r = rate[p.id] ? parseFloat(rate[p.id]) : null;
    const cls = r >= 8.5 ? 'b' : r >= 7 ? 'g' : '';
    const last = p.name.split(' ').slice(-1)[0];
    return `<div class="pl">${yc || rcard ? `<i class="cd ${rcard ? 'r' : ''}"></i>` : ''}${g ? `<span class="gl">⚽ ${g}</span>` : ''}<img class="ph" src="${MEDIA}players/${p.id}.png" alt="">${r ? `<span class="rt ${cls}">${r.toFixed(1)}</span>` : ''}<div class="nm">${p.number} ${esc((p.name.split(' ')[0][0] || '') + '. ' + last)}</div></div>`;
  };
  const half = (l, rev) => {
    const rows = {};
    l.startXI.forEach(x => { const [r, c] = (x.player.grid || '1:1').split(':').map(Number); (rows[r] = rows[r] || []).push({ ...x.player, c }); });
    const keys = Object.keys(rows).map(Number).sort((a, b) => rev ? b - a : a - b);
    const head = `<div class="phead"><span><img src="${l.team.logo}" alt="">${esc(l.team.name)}</span><span>${esc(l.formation || '')}</span></div>`;
    const body = keys.map(k => `<div class="prow">${rows[k].sort((a, b) => a.c - b.c).map(pl).join('')}</div>`).join('');
    return rev ? body + head : head + body;
  };
  const bench = l => `<div class="group"><div class="sub">${esc(l.team.name)} — Substitutes</div><div class="list">${(l.substitutes || []).map(s => `${s.player.number} ${esc(s.player.name)}`).join('<br>') || '-'}</div><div class="list">Coach: ${esc(l.coach?.name || '-')}</div></div>`;
  return `<div class="pitch">${half(L[0], false)}<div class="mid">—</div>${half(L[1], true)}</div>${bench(L[0])}${bench(L[1])}`;
}
function statsHtml(f) {
  const S = f.statistics || [];
  if (S.length < 2) return empty('Stats are not available yet');
  return `<div class="group">${S[0].statistics.map((x, i) => {
    const a = S[0].statistics[i].value, b = S[1].statistics[i]?.value;
    const na = num(a), nb = num(b), tot = na + nb || 1;
    return `<div class="stat"><div class="r"><span>${a ?? 0}</span><span>${esc(x.type)}</span><span>${b ?? 0}</span></div><div class="b"><div><i style="width:${na / tot * 100}%"></i></div><div><i style="width:${nb / tot * 100}%"></i></div></div></div>`;
  }).join('')}</div>`;
}

async function pageMatch(id) {
  app.innerHTML = loading();
  try {
    let f = (await api('/fixtures?id=' + id, 20))[0];
    if (!f) throw new Error('Match not found');
    const s = f.fixture.status.short, live = LIVE.includes(s), done = DONE.includes(s);
    const goals = (f.events || []).filter(e => e.type === 'Goal' && e.detail !== 'Missed Penalty');
    const side = id2 => goals.filter(e => (e.team.id === id2) !== (e.detail === 'Own Goal')).map(e => `${esc(e.player.name)} ${e.time.elapsed}'${e.detail === 'Own Goal' ? ' (OG)' : ''}`).join('<br>');
    const mid = live || done ? `${f.goals.home ?? 0} - ${f.goals.away ?? 0}<small>${live ? (s === 'HT' ? 'HT' : f.fixture.status.elapsed + "'") : s}</small>` : `${fmtTime(f.fixture.date)}<small>${fmtDate(f.fixture.date, { day: 'numeric', month: 'short' })}</small>`;
    const tabs = ['Overview', 'Live', 'Line-up', 'Stats', 'Table', 'H2H'];
    if (!tabs.includes(st.matchTab)) st.matchTab = 'Overview';
    const head = `<div class="hdr"><div class="hbar"><button data-back style="font-size:22px">‹</button><div style="flex:1;padding-left:8px"><b>${esc(f.league.round.replace('Regular Season - ', 'Round '))}</b><div style="color:var(--mut);font-size:13px">${esc(f.league.name)}</div></div>${live || !done ? `<button class="bell ${isRem(f.fixture.id) ? 'on' : ''}" style="border:0;height:40px" data-bell="${f.fixture.id}">🔔</button>` : ''}</div>
      <div class="sc"><div class="t" data-go="#/team/${f.teams.home.id}"><img src="${f.teams.home.logo}" alt=""><div>${esc(f.teams.home.name)}</div></div><div class="res">${mid}</div><div class="t" data-go="#/team/${f.teams.away.id}"><img src="${f.teams.away.logo}" alt=""><div>${esc(f.teams.away.name)}</div></div></div>
      ${goals.length ? `<div class="scorers"><div>${side(f.teams.home.id)}</div><div>${side(f.teams.away.id)}</div></div>` : ''}
      <div class="mtabs">${tabs.map(t => `<button class="${st.matchTab === t ? 'on' : ''}" data-set="matchTab=${t}">${t}</button>`).join('')}</div></div>`;
    let body = '';
    const mt = st.matchTab;
    if (mt === 'Overview') body = `<div class="group"><div class="sw"><b>Key events</b><label style="color:var(--mut)"><input type="checkbox" data-subs ${st.subs ? 'checked' : ''}> Substitutions</label></div><div class="divider">KO ${fmtTime(f.fixture.date)}</div>${eventsHtml(f, false)}${done ? `<div class="divider">FT (${f.goals.home}-${f.goals.away})</div>` : ''}</div>`;
    else if (mt === 'Live') { body = `<div class="group"><div class="sw"><b>${live ? 'Live updates' : 'Match timeline'}</b><label style="color:var(--mut)"><input type="checkbox" data-subs ${st.subs ? 'checked' : ''}> Substitutions</label></div>${eventsHtml(f, true)}</div>`; if (live) timer = setInterval(route, 30000); }
    else if (mt === 'Line-up') body = pitchHtml(f);
    else if (mt === 'Stats') body = statsHtml(f);
    else if (mt === 'Table') {
      app.innerHTML = head + loading();
      const sd = await api(`/standings?league=${f.league.id}&season=${f.league.season}`, 600);
      body = sd.length ? modeSeg() + tableHtml(sd[0].league.standings, st.tableMode, [f.teams.home.id, f.teams.away.id]) : empty('No table for this competition');
    } else {
      app.innerHTML = head + loading();
      const h = await api(`/fixtures/headtohead?h2h=${f.teams.home.id}-${f.teams.away.id}&last=10&timezone=${C.TZ}`, 3600);
      let hw = 0, aw = 0, dr = 0;
      h.forEach(x => { if (x.goals.home == null) return; const hg = x.teams.home.id === f.teams.home.id ? x.goals.home : x.goals.away, ag = x.teams.home.id === f.teams.home.id ? x.goals.away : x.goals.home; hg > ag ? hw++ : hg < ag ? aw++ : dr++; });
      body = `<div class="group"><div class="ev" style="text-align:center"><div class="l"><b style="font-size:24px">${hw}</b><small>${esc(f.teams.home.name)}</small></div><div class="m"><b style="font-size:24px">${dr}</b><small>Draws</small></div><div style="text-align:left"><b style="font-size:24px">${aw}</b><small>${esc(f.teams.away.name)}</small></div></div></div><div class="group"><div class="sub">Previous meetings</div>${h.map(x => rowHtml(x, true)).join('') || empty('No previous meetings')}</div>`;
    }
    app.innerHTML = head + body;
  } catch (e) { app.innerHTML = `<div class="top"><button class="ico" data-back>‹</button></div>` + errBox(e); }
}

/* ---------- router ---------- */
function route() {
  clearInterval(timer);
  const [, page, id] = (location.hash || '#/matches').split('/');
  const top = ['matches', 'fav', 'leagues', undefined, ''].includes(page);
  nav.classList.toggle('hide', !top);
  nav.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.tab === (page || 'matches')));
  if (tg && tg.BackButton) { top ? tg.BackButton.hide() : tg.BackButton.show(); }
  const pages = { matches: pageMatches, fav: pageFav, leagues: pageLeagues, search: pageSearch, league: pageLeague, team: pageTeam, match: pageMatch };
  (pages[page] || pageMatches)(id);
}
let lastKey = '';
window.addEventListener('hashchange', () => {
  const [, p] = (location.hash || '').split('/');
  if (['league', 'team'].includes(p)) { st.leagueTab = 'Table'; st.teamTab = 'Info'; st.season = null; }
  if (p === 'match') st.matchTab = 'Overview';
  window.scrollTo(0, 0); route();
});
if (tg && tg.BackButton) tg.BackButton.onClick(() => history.back());

document.addEventListener('click', e => {
  const t = e.target.closest('[data-bell],[data-fav],[data-set],[data-back],[data-go],[data-reload],[data-cal]');
  if (!t) return;
  if (t.dataset.bell) { toggleRem(+t.dataset.bell); t.classList.toggle('on'); if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light'); e.stopPropagation(); return; }
  if (t.dataset.fav) { const [ty, id] = t.dataset.fav.split(':'); toggleFav(ty, id); t.textContent = isFav(ty, id) ? '★' : '☆'; if (st.favTab && location.hash === '#/fav') route(); return; }
  if (t.dataset.set) { const [k, ...v] = t.dataset.set.split('='); st[k] = v.join('='); route(); return; }
  if (t.dataset.back !== undefined) { history.back(); return; }
  if (t.dataset.reload !== undefined) { try { Object.keys(localStorage).filter(k => k.startsWith('c:')).forEach(k => localStorage.removeItem(k)); } catch {} route(); return; }
  if (t.dataset.cal !== undefined) { const c = document.getElementById('cal'); c.hidden = false; c.style.cssText = 'position:fixed;opacity:0;top:0'; try { c.showPicker(); } catch { c.click(); } return; }
  if (t.dataset.go) location.hash = t.dataset.go;
});
document.addEventListener('change', e => {
  if (e.target.id === 'cal' && e.target.value) { st.day = e.target.value; location.hash = '#/matches'; route(); }
  if (e.target.dataset.season) { st.season = +e.target.value; route(); }
  if (e.target.dataset.subs !== undefined) { st.subs = e.target.checked; route(); }
});

route();
})();
