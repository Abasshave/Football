// ======================
// Phoenix Football Scores
// Free alternative using football-data.org
// ======================

const API_BASE = "https://api.football-data.org/v4";
const STORAGE_KEY = "phoenix_football_api_key";
const FOLLOWING_KEY = "phoenix_following_teams";

// Your API key (hardcoded)
const DEFAULT_API_KEY = "e6728f46be8f4d28890474d0ca1bfce1";

// Competition codes (free tier + extras)
const COMPETITIONS = {
  PL: "Premier League",
  PD: "La Liga",
  SA: "Serie A",
  BL1: "Bundesliga",
  FL1: "Ligue 1",
  CL: "Champions League",
  ELC: "Championship",
  DED: "Eredivisie",
  PPL: "Primeira Liga",
  BSA: "Brazil Serie A",
  TSL: "Süper Lig (Turkey)"
};

// State
let apiKey = localStorage.getItem(STORAGE_KEY) || DEFAULT_API_KEY;
let following = JSON.parse(localStorage.getItem(FOLLOWING_KEY) || "[]");
let currentMatches = [];

// Data-saving: cache matches for 8 minutes so we don't burn mobile data
const CACHE_KEY = "phoenix_matches_cache";
const CACHE_TTL_MS = 8 * 60 * 1000; // 8 minutes

// DOM
const apiBanner = document.getElementById("api-banner");
const apiKeyInput = document.getElementById("api-key-input");
const saveApiKeyBtn = document.getElementById("save-api-key");
const matchesContainer = document.getElementById("matches-container");
const standingsContainer = document.getElementById("standings-container");
const followingContainer = document.getElementById("following-container");
const competitionFilter = document.getElementById("competition-filter");
const standingsSelect = document.getElementById("standings-competition");
const refreshBtn = document.getElementById("refresh-btn");

// ======================
// Init
// ======================
function init() {
  // Key is hardcoded, so hide banner and load data immediately
  if (apiKey) {
    apiBanner.classList.add("hidden");
    loadTodayMatches();
  } else {
    apiBanner.classList.remove("hidden");
  }

  // Navigation
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`view-${btn.dataset.view}`).classList.add("active");

      if (btn.dataset.view === "standings") {
        loadStandings(standingsSelect.value);
      } else if (btn.dataset.view === "following") {
        renderFollowing();
      }
    });
  });

  saveApiKeyBtn.addEventListener("click", saveApiKey);
  competitionFilter.addEventListener("change", () => renderMatches(currentMatches));
  standingsSelect.addEventListener("change", () => loadStandings(standingsSelect.value));
  refreshBtn.addEventListener("click", () => loadTodayMatches(true)); // force = true only when user taps
}

function saveApiKey() {
  const key = apiKeyInput.value.trim();
  if (!key) return alert("Please paste your API key");
  apiKey = key;
  localStorage.setItem(STORAGE_KEY, key);
  apiBanner.classList.add("hidden");
  loadTodayMatches();
}

// ======================
// API Helper
// ======================
async function apiFetch(endpoint) {
  if (!apiKey) throw new Error("No API key");

  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      "X-Auth-Token": apiKey
    }
  });

  if (!res.ok) {
    if (res.status === 429) throw new Error("Rate limit reached (10 req/min). Wait a moment.");
    if (res.status === 403) throw new Error("Invalid API key or free tier limit.");
    throw new Error(`API error: ${res.status}`);
  }

  return res.json();
}

// ======================
// Live / Today Matches
// ======================
async function loadTodayMatches(force = false) {
  // Use cache first so we don't waste mobile data
  if (!force) {
    const cached = getCachedMatches();
    if (cached) {
      currentMatches = cached;
      renderMatches(currentMatches);
      return;
    }
  }

  matchesContainer.innerHTML = `<div class="loading">Loading matches...</div>`;

  try {
    // Reasonable range: yesterday + today + next 5 days (keeps payload small)
    const from = dateOffset(-1);
    const to = dateOffset(5);
    const data = await apiFetch(`/matches?dateFrom=${from}&dateTo=${to}`);
    currentMatches = data.matches || [];
    saveMatchesCache(currentMatches);
    renderMatches(currentMatches);
  } catch (err) {
    // If network fails, try to show old cache
    const cached = getCachedMatches(true); // ignore expiry
    if (cached && cached.length) {
      currentMatches = cached;
      renderMatches(currentMatches);
      matchesContainer.insertAdjacentHTML("afterbegin",
        `<div class="cache-note">Showing saved data (offline / data-saving mode)</div>`);
    } else {
      matchesContainer.innerHTML = `
        <div class="error">
          <p>${err.message}</p>
          <p style="margin-top:12px;font-size:0.9rem">
            Check connection or wait a few seconds.
          </p>
        </div>`;
    }
  }
}

function getCachedMatches(ignoreExpiry = false) {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { ts, matches } = JSON.parse(raw);
    if (!ignoreExpiry && Date.now() - ts > CACHE_TTL_MS) return null;
    return matches || null;
  } catch {
    return null;
  }
}

function saveMatchesCache(matches) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      ts: Date.now(),
      matches
    }));
  } catch {}
}

function dateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function renderMatches(matches) {
  const filter = competitionFilter.value;
  let list = matches;

  if (filter !== "all") {
    list = matches.filter(m => m.competition?.code === filter);
  }

  if (list.length === 0) {
    matchesContainer.innerHTML = `
      <div class="empty-state">
        <p>No matches found in the selected range/competition.</p>
        <p style="margin-top:8px;font-size:0.9rem">Try "All Competitions" or another league.</p>
      </div>`;
    return;
  }

  // Sort: live first, then by time
  list.sort((a, b) => {
    const aLive = a.status === "IN_PLAY" || a.status === "PAUSED" ? 0 : 1;
    const bLive = b.status === "IN_PLAY" || b.status === "PAUSED" ? 0 : 1;
    if (aLive !== bLive) return aLive - bLive;
    return new Date(a.utcDate) - new Date(b.utcDate);
  });

  matchesContainer.innerHTML = list.map(m => createMatchCard(m)).join("");
  attachFollowListeners();
}

function createMatchCard(match) {
  const home = match.homeTeam || {};
  const away = match.awayTeam || {};
  const isLive = match.status === "IN_PLAY" || match.status === "PAUSED";
  const isFinished = match.status === "FINISHED";

  // Prefer fullTime, fall back to whatever is available so we don't lose live scores
  const ft = match.score?.fullTime;
  const ht = match.score?.halfTime;
  let homeScore = ft?.home;
  let awayScore = ft?.away;

  // If fullTime is null (common for live matches), try to keep showing something useful
  if (homeScore == null && awayScore == null) {
    homeScore = match.score?.home ?? "-";
    awayScore = match.score?.away ?? "-";
  }
  if (homeScore == null) homeScore = "-";
  if (awayScore == null) awayScore = "-";

  const statusText = getStatusText(match);
  const competition = match.competition?.name || match.competition?.code || "";
  const matchday = match.matchday ? `MD ${match.matchday}` : (match.stage || "");
  const matchDate = formatMatchDate(match.utcDate);

  // Always prefer full team name so data is not chopped
  const homeName = home.name || home.shortName || "TBD";
  const awayName = away.name || away.shortName || "TBD";

  const homeFollowed = isFollowing(home.id);
  const awayFollowed = isFollowing(away.id);

  // Half-time score if available
  let htText = "";
  if (ht && (ht.home != null || ht.away != null)) {
    htText = `<div class="ht-score">HT ${ht.home ?? "-"} - ${ht.away ?? "-"}</div>`;
  }

  return `
    <div class="match-card ${isLive ? "live" : ""} ${isFinished ? "finished" : ""}" data-id="${match.id}">
      <div class="match-meta">
        <span class="competition-tag">${competition}</span>
        ${matchday ? `<span class="matchday-tag">${matchday}</span>` : ""}
        <span class="match-date">${matchDate}</span>
      </div>

      <div class="match-body">
        <div class="team home">
          <button class="follow-btn ${homeFollowed ? "active" : ""}" 
                  data-team-id="${home.id}" 
                  data-team-name="${homeName}"
                  data-team-crest="${home.crest || ""}"
                  title="Follow ${homeName}">
            ${homeFollowed ? "★" : "☆"}
          </button>
          ${home.crest ? `<img class="team-crest" src="${home.crest}" alt="" onerror="this.style.display='none'">` : ""}
          <span class="team-name" title="${homeName}">${homeName}</span>
        </div>

        <div class="score-box">
          <div class="score">${homeScore} - ${awayScore}</div>
          <div class="status ${isLive ? "live" : ""}">${statusText}</div>
          ${htText}
        </div>

        <div class="team away">
          ${away.crest ? `<img class="team-crest" src="${away.crest}" alt="" onerror="this.style.display='none'">` : ""}
          <span class="team-name" title="${awayName}">${awayName}</span>
          <button class="follow-btn ${awayFollowed ? "active" : ""}" 
                  data-team-id="${away.id}" 
                  data-team-name="${awayName}"
                  data-team-crest="${away.crest || ""}"
                  title="Follow ${awayName}">
            ${awayFollowed ? "★" : "☆"}
          </button>
        </div>
      </div>
    </div>
  `;
}

function formatMatchDate(utcDate) {
  if (!utcDate) return "";
  const d = new Date(utcDate);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  if (isToday) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" }) +
         " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getStatusText(match) {
  switch (match.status) {
    case "IN_PLAY": return "LIVE";
    case "PAUSED": return "HT";
    case "FINISHED": return "FT";
    case "SCHEDULED":
    case "TIMED":
      return new Date(match.utcDate).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    case "POSTPONED": return "POSTPONED";
    case "CANCELLED": return "CANCELLED";
    case "SUSPENDED": return "SUSPENDED";
    case "AWARDED": return "AWARDED";
    default: return match.status || "";
  }
}

// ======================
// Standings
// ======================
async function loadStandings(code) {
  standingsContainer.innerHTML = `<div class="loading">Loading standings...</div>`;

  try {
    const data = await apiFetch(`/competitions/${code}/standings`);
    const table = data.standings?.find(s => s.type === "TOTAL")?.table || data.standings?.[0]?.table || [];

    if (table.length === 0) {
      standingsContainer.innerHTML = `<div class="empty-state">No standings available.</div>`;
      return;
    }

    standingsContainer.innerHTML = `
      <table class="standings-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Team</th>
            <th>P</th>
            <th>W</th>
            <th>D</th>
            <th>L</th>
            <th>GD</th>
            <th>Pts</th>
          </tr>
        </thead>
        <tbody>
          ${table.map(row => `
            <tr>
              <td class="pos">${row.position}</td>
              <td>
                <div class="team-cell">
                  ${row.team.crest ? `<img src="${row.team.crest}" alt="" onerror="this.style.display='none'">` : ""}
                  <span>${row.team.shortName || row.team.name}</span>
                </div>
              </td>
              <td>${row.playedGames}</td>
              <td>${row.won}</td>
              <td>${row.draw}</td>
              <td>${row.lost}</td>
              <td>${row.goalDifference > 0 ? "+" : ""}${row.goalDifference}</td>
              <td><strong>${row.points}</strong></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  } catch (err) {
    standingsContainer.innerHTML = `<div class="error">${err.message}</div>`;
  }
}

// ======================
// Following (localStorage)
// ======================
function isFollowing(teamId) {
  return following.some(t => t.id === teamId);
}

function toggleFollow(teamId, name, crest) {
  const idx = following.findIndex(t => t.id === teamId);
  if (idx > -1) {
    following.splice(idx, 1);
  } else {
    following.push({ id: teamId, name, crest });
  }
  localStorage.setItem(FOLLOWING_KEY, JSON.stringify(following));
  // Re-render current view if needed
  if (document.getElementById("view-live").classList.contains("active")) {
    renderMatches(currentMatches);
  }
  if (document.getElementById("view-following").classList.contains("active")) {
    renderFollowing();
  }
}

function attachFollowListeners() {
  document.querySelectorAll(".follow-btn").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const id = Number(btn.dataset.teamId);
      const name = btn.dataset.teamName;
      const crest = btn.dataset.teamCrest;
      toggleFollow(id, name, crest);
    };
  });
}

function renderFollowing() {
  if (following.length === 0) {
    followingContainer.innerHTML = `
      <div class="empty-state">
        <p>You are not following any teams yet.</p>
        <p>Go to Live scores and click the star next to a team.</p>
      </div>`;
    return;
  }

  followingContainer.innerHTML = `
    <div class="following-list">
      ${following.map(t => `
        <div class="followed-team">
          <div class="info">
            ${t.crest ? `<img src="${t.crest}" alt="" onerror="this.style.display='none'">` : ""}
            <strong>${t.name}</strong>
          </div>
          <button class="unfollow-btn" data-id="${t.id}">Unfollow</button>
        </div>
      `).join("")}
    </div>
  `;

  document.querySelectorAll(".unfollow-btn").forEach(btn => {
    btn.onclick = () => {
      toggleFollow(Number(btn.dataset.id));
      renderFollowing();
    };
  });
}

// Start
init();
