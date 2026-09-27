// Team page: one dot per game, x-axis switchable between box score stats.
// Interaction: the stat toggles redraw the scatter; the season select reloads
// the games from the database.

const params = new URLSearchParams(window.location.search);

const state = {
  teamId: Number(params.get('team_id')),
  season: Number(params.get('season')) || null,
  stat: 'assists',
  seasons: [],
  games: [],
  scatter: null,
  history: null,
};

const el = {
  pill: document.getElementById('source-pill'),
  heading: document.getElementById('team-heading'),
  record: document.getElementById('team-record'),
  seasonSelect: document.getElementById('season-select'),
  toggles: document.getElementById('stat-toggles'),
  status: document.getElementById('scatter-status'),
};

const STATS = [
  { key: 'assists', label: 'Assists' },
  { key: 'total_rebounds', label: 'Rebounds' },
  { key: 'steals', label: 'Steals' },
  { key: 'blocks', label: 'Blocks' },
  { key: 'fouls', label: 'Fouls' },
  { key: 'field_goal_pct', label: 'FG%' },
  { key: 'three_point_field_goals_attempted', label: '3PT attempts' },
];

const WIN_COLOR = '#1f7a5a';
const LOSS_COLOR = '#b4451f';

async function init() {
  if (!state.teamId) {
    el.heading.textContent = 'No team selected';
    el.status.textContent = 'Return to the overview and choose a team.';
    return;
  }

  try {
    state.seasons = await DataSource.teamSeasons(state.teamId);
    setStatusPill(el.pill);
  } catch (err) {
    setStatusPill(el.pill, 'No data available');
    el.status.textContent = `Could not load this team: ${err.message}`;
    return;
  }

  if (!state.seasons.length) {
    el.heading.textContent = 'Team not found';
    el.status.textContent = 'No seasons on record for this team.';
    return;
  }

  const latest = state.seasons[state.seasons.length - 1];
  if (!state.season) state.season = latest.season;

  el.heading.textContent = latest.team_display_name;

  el.seasonSelect.innerHTML = state.seasons
    .slice()
    .reverse()
    .map(s => `<option value="${s.season}">${fmt.seasonLabel(s.season)}</option>`)
    .join('');
  el.seasonSelect.value = state.season;

  el.toggles.innerHTML = STATS.map(s => `
    <button type="button" class="toggle" data-stat="${s.key}"
            aria-pressed="${s.key === state.stat}">${s.label}</button>
  `).join('');

  el.toggles.querySelectorAll('.toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      state.stat = btn.dataset.stat;
      el.toggles.querySelectorAll('.toggle').forEach(b =>
        b.setAttribute('aria-pressed', String(b.dataset.stat === state.stat)));
      renderScatter();
    });
  });

  el.seasonSelect.addEventListener('change', e => {
    state.season = Number(e.target.value);
    loadGames();
  });

  renderHistory();
  await loadGames();
}

function currentSeasonRow() {
  return state.seasons.find(s => s.season === state.season);
}

async function loadGames() {
  el.status.textContent = 'Loading games...';
  try {
    state.games = await DataSource.teamGames(state.teamId, state.season);
    setStatusPill(el.pill);
  } catch (err) {
    setStatusPill(el.pill, 'No data available');
    el.status.textContent = `Could not load games: ${err.message}`;
    return;
  }

  const row = currentSeasonRow();
  el.record.textContent = row
    ? `${fmt.seasonLabel(row.season)} season - ${row.wins}-${row.losses} (${fmt.pct(row.win_rate)} win rate), `
      + `${fmt.num(row.avg_points)} points per game`
    : `${fmt.seasonLabel(state.season)} season`;

  renderHistory();
  renderScatter();
}

function renderScatter() {
  const stat = STATS.find(s => s.key === state.stat);

  if (!state.games.length) {
    if (state.scatter) { state.scatter.destroy(); state.scatter = null; }
    el.status.textContent = DataSource.mode === 'sample'
      ? 'The backup sample only covers the most recent season for the top teams. '
        + 'The live database has every team and season.'
      : 'No games found for this team and season.';
    return;
  }

  const points = state.games
    .filter(g => g[state.stat] !== null && g[state.stat] !== undefined)
    .map(g => ({
      x: g[state.stat],
      y: g.team_score,
      won: g.team_winner === 1,
      meta: g,
    }));

  const wins = points.filter(p => p.won);
  const losses = points.filter(p => !p.won);

  if (state.scatter) state.scatter.destroy();

  state.scatter = new Chart(document.getElementById('scatter-chart'), {
    type: 'scatter',
    data: {
      datasets: [
        {
          label: `Wins (${wins.length})`,
          data: wins,
          backgroundColor: WIN_COLOR,
          pointRadius: 5,
          pointHoverRadius: 7,
        },
        {
          label: `Losses (${losses.length})`,
          data: losses,
          backgroundColor: LOSS_COLOR,
          pointStyle: 'triangle',   // shape as well as color, for color-blind readers
          pointRadius: 6,
          pointHoverRadius: 8,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { usePointStyle: true } },
        title: {
          display: true,
          text: `${stat.label} vs points scored, ${fmt.seasonLabel(state.season)}`,
          align: 'start',
          font: { size: 13 },
        },
        tooltip: {
          callbacks: {
            label: ctx => {
              const g = ctx.raw.meta;
              const result = g.team_winner === 1 ? 'W' : 'L';
              return [
                `${result} ${g.team_score}-${g.opponent_score} vs ${g.opponent}`,
                `${g.game_date} (${g.team_home_away})`,
                `${stat.label}: ${ctx.raw.x}`,
              ];
            },
          },
        },
      },
      scales: {
        x: { title: { display: true, text: stat.label } },
        y: { title: { display: true, text: 'Points scored' } },
      },
    },
  });

  const avg = (arr) => arr.length
    ? (arr.reduce((sum, p) => sum + p.x, 0) / arr.length).toFixed(1) : '--';
  el.status.textContent =
    `${stat.label} in wins: ${avg(wins)} | in losses: ${avg(losses)}`;
}

function renderHistory() {
  if (state.history) state.history.destroy();

  state.history = new Chart(document.getElementById('history-chart'), {
    type: 'bar',
    data: {
      labels: state.seasons.map(s => fmt.seasonLabel(s.season)),
      datasets: [{
        label: 'Win rate',
        data: state.seasons.map(s => s.win_rate),
        backgroundColor: state.seasons.map(s =>
          s.season === state.season ? '#b45309' : '#93a4c8'),
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
      },
      onClick: (evt, bars) => {
        if (!bars.length) return;
        state.season = state.seasons[bars[0].index].season;
        el.seasonSelect.value = state.season;
        loadGames();
      },
      scales: {
        y: {
          min: 0, max: 1,
          title: { display: true, text: 'Win rate' },
          ticks: { callback: v => `${Math.round(v * 100)}%` },
        },
      },
    },
  });
}

init();
