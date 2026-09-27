// Overview page: ranked team list + league timeline.
// Interaction: choosing a season (from the select or the timeline) refilters
// the rankings; typing in the search box filters them further.

const state = {
  seasons: [],
  season: null,
  query: '',
  metric: 'avg_points',
  chart: null,
};

const el = {
  pill: document.getElementById('source-pill'),
  seasonLabel: document.getElementById('season-label'),
  seasonSelect: document.getElementById('season-select'),
  search: document.getElementById('search'),
  list: document.getElementById('team-list'),
  status: document.getElementById('list-status'),
  timeline: document.getElementById('season-timeline'),
  metric: document.getElementById('trend-metric'),
};

const METRIC_LABELS = {
  avg_points: 'Points per game',
  avg_assists: 'Assists per game',
  avg_fouls: 'Fouls per game',
  avg_steals: 'Steals per game',
  avg_blocks: 'Blocks per game',
  avg_three_pt_attempts: '3-point attempts per game',
  avg_offensive_rebounds: 'Offensive rebounds per game',
  avg_defensive_rebounds: 'Defensive rebounds per game',
};

async function init() {
  try {
    state.seasons = await DataSource.seasons();
    setStatusPill(el.pill);
  } catch (err) {
    setStatusPill(el.pill, 'No data available');
    el.status.textContent = `Could not load data: ${err.message}`;
    return;
  }

  if (!state.seasons.length) {
    el.status.textContent = 'No seasons returned by the database.';
    return;
  }

  state.season = state.seasons[state.seasons.length - 1].season;

  el.seasonSelect.innerHTML = state.seasons
    .slice()
    .reverse()
    .map(s => `<option value="${s.season}">${fmt.seasonLabel(s.season)}</option>`)
    .join('');
  el.seasonSelect.value = state.season;

  renderTimeline();
  renderTrendChart();
  await loadTeams();

  el.seasonSelect.addEventListener('change', e => selectSeason(Number(e.target.value)));
  el.metric.addEventListener('change', e => {
    state.metric = e.target.value;
    renderTrendChart();
  });

  let debounce;
  el.search.addEventListener('input', e => {
    state.query = e.target.value;
    clearTimeout(debounce);
    debounce = setTimeout(loadTeams, 180);
  });
}

function selectSeason(season) {
  state.season = season;
  el.seasonSelect.value = season;
  renderTimeline();
  renderTrendChart();
  loadTeams();
}

// The timeline doubles as the season filter: each entry is a button.
function renderTimeline() {
  el.timeline.innerHTML = state.seasons
    .slice()
    .reverse()
    .map(s => `
      <button type="button" class="season-button" role="listitem"
              data-season="${s.season}"
              aria-current="${s.season === state.season}">
        ${fmt.seasonLabel(s.season)}
        <span class="season-meta">${fmt.num(s[state.metric])}</span>
      </button>
    `).join('');

  el.timeline.querySelectorAll('.season-button').forEach(btn => {
    btn.addEventListener('click', () => selectSeason(Number(btn.dataset.season)));
  });
}

function renderTrendChart() {
  const labels = state.seasons.map(s => fmt.seasonLabel(s.season));
  const values = state.seasons.map(s => s[state.metric]);
  // Highlight the selected season's point so the chart and list agree.
  const pointColors = state.seasons.map(s =>
    s.season === state.season ? '#b45309' : '#2f5fd0');
  const pointSizes = state.seasons.map(s => s.season === state.season ? 6 : 3);

  if (state.chart) state.chart.destroy();

  state.chart = new Chart(document.getElementById('trend-chart'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: METRIC_LABELS[state.metric],
        data: values,
        borderColor: '#2f5fd0',
        backgroundColor: 'rgba(47, 95, 208, .12)',
        pointBackgroundColor: pointColors,
        pointRadius: pointSizes,
        fill: true,
        tension: .25,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: `League average: ${METRIC_LABELS[state.metric].toLowerCase()}`,
          align: 'start',
          font: { size: 13 },
        },
        tooltip: { enabled: false },
      },
      onClick: (evt, points) => {
        if (points.length) selectSeason(state.seasons[points[0].index].season);
      },
      scales: {
        y: { title: { display: true, text: METRIC_LABELS[state.metric] } },
        x: { ticks: { maxRotation: 0, autoSkipPadding: 12 } },
      },
    },
  });
}

async function loadTeams() {
  el.seasonLabel.textContent = fmt.seasonLabel(state.season);
  el.status.textContent = 'Loading teams...';
  el.list.innerHTML = '';

  let teams;
  try {
    teams = await DataSource.standings(state.season, state.query);
    setStatusPill(el.pill);
  } catch (err) {
    setStatusPill(el.pill, 'No data available');
    el.status.textContent = `Could not load teams: ${err.message}`;
    return;
  }

  if (!teams.length) {
    el.status.textContent = state.query
      ? `No teams match "${state.query}" in ${fmt.seasonLabel(state.season)}.`
      : 'No teams found for this season.';
    return;
  }

  el.status.textContent = `${teams.length} teams, ranked by win rate.`;

  el.list.innerHTML = teams.map((t, i) => `
    <li>
      <button type="button" class="team-row"
              data-team="${t.team_id}" data-season="${state.season}">
        <span class="rank">${i + 1}</span>
        <span class="team-name">${t.team_display_name}</span>
        <span class="record">
          <span class="win-rate">${fmt.pct(t.win_rate)}</span><br>
          <span class="wl">${t.wins}-${t.losses}</span>
        </span>
      </button>
    </li>
  `).join('');

  el.list.querySelectorAll('.team-row').forEach(row => {
    row.addEventListener('click', () => {
      window.location.href =
        `team.html?team_id=${row.dataset.team}&season=${row.dataset.season}`;
    });
  });
}

init();
