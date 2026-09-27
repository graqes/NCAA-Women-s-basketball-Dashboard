// Data layer.
//
// First choice:  api/data.php -> MySQL database baird32 (the live site)
// Backup:        data/sample.js, used only if that request fails
//
// The label in the page header always says which one produced the numbers on
// screen, so a reader is never misled about where the data came from.

const DataSource = {
  mode: null,      // 'live' or 'sample'
  _sample: null,

  async _loadSample() {
    // data/sample.js sets window.SAMPLE_DATA via a <script> tag, which works
    // even when the page is opened straight from the folder.
    if (!window.SAMPLE_DATA) throw new Error('backup data not loaded');
    this.mode = 'sample';
    return window.SAMPLE_DATA;
  },

  async _api(type, params = {}) {
    const url = new URL('api/data.php', window.location.href);
    url.searchParams.set('type', type);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    });

    const res = await fetch(url);
    const json = await res.json();
    if (json && json.error) throw new Error(json.error);
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    this.mode = 'live';
    return json;
  },

  async seasons() {
    try {
      return await this._api('seasons');
    } catch (err) {
      return (await this._loadSample()).seasons;
    }
  },

  async standings(season, query = '') {
    try {
      return await this._api('standings', { season, q: query });
    } catch (err) {
      const data = await this._loadSample();
      const needle = query.trim().toLowerCase();
      return data.standings
        .filter(r => r.season === Number(season))
        .filter(r => !needle
          || r.team_display_name.toLowerCase().includes(needle)
          || r.team_abbreviation.toLowerCase().includes(needle))
        .sort((a, b) => b.win_rate - a.win_rate || b.avg_points - a.avg_points);
    }
  },

  async teamSeasons(teamId) {
    try {
      return await this._api('team_seasons', { team_id: teamId });
    } catch (err) {
      const data = await this._loadSample();
      return data.standings
        .filter(r => r.team_id === Number(teamId))
        .sort((a, b) => a.season - b.season);
    }
  },

  async teamGames(teamId, season) {
    try {
      return await this._api('games', { team_id: teamId, season });
    } catch (err) {
      const data = await this._loadSample();
      if (Number(season) !== data.game_season) return [];
      return data.games[String(teamId)] || [];
    }
  },
};

// Shared formatting helpers.
const fmt = {
  pct: v => (v === null || v === undefined) ? '--' : `${(v * 100).toFixed(1)}%`,
  num: (v, d = 1) => (v === null || v === undefined) ? '--' : Number(v).toFixed(d),
  // Season 2026 covers games played from Nov 2025 through Apr 2026.
  seasonLabel: s => `${s - 1}-${String(s).slice(2)}`,
};

// Says whether the numbers on screen came from the live database.
function setStatusPill(el, message) {
  if (!el) return;
  if (message) {
    el.textContent = message;
    el.className = 'source-pill is-fallback';
    return;
  }
  const live = DataSource.mode === 'live';
  el.textContent = live
    ? 'Live data: MySQL database baird32'
    : 'Backup sample data (database unavailable)';
  el.className = `source-pill ${live ? 'is-live' : 'is-fallback'}`;
}
