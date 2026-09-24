const $ = (id) => document.getElementById(id);
const views = ['loginView', 'mainView', 'garageView', 'raceView', 'profileView', 'rankingView', 'resultView'];
const ROAD = { left: 220, right: 780, center: 500 };

const TRACKS = {
  'neon-city': {
    key: 'neon-city', name: 'NEON CITY', subtitle: 'Metrópole noturna', length: 5200, laps: 4, coinCount: 28, coinValue: 25,
    a: '#1de3ff', b: '#ff4fd8', road: '#2c3039', shoulder: '#151a24', sky: '#08111d', grip: 1,
  },
  'desert-pulse': {
    key: 'desert-pulse', name: 'DESERT PULSE', subtitle: 'Calor, poeira e velocidade', length: 6000, laps: 4, coinCount: 32, coinValue: 30,
    a: '#ffb347', b: '#ff5c57', road: '#37312d', shoulder: '#6c4a2b', sky: '#25140f', grip: 0.94,
  },
  'arctic-circuit': {
    key: 'arctic-circuit', name: 'ARCTIC CIRCUIT', subtitle: 'Gelo, neve e reflexos', length: 5600, laps: 4, coinCount: 30, coinValue: 30,
    a: '#8cecff', b: '#6b7cff', road: '#283644', shoulder: '#d8f4ff', sky: '#07131f', grip: 0.88,
  },
};

const UPGRADE_STATS = [
  ['speed', 'VELOCIDADE'],
  ['acceleration', 'ACELERAÇÃO'],
  ['braking', 'FREIO'],
  ['handling', 'CONTROLE'],
  ['nitro', 'NITRO'],
];

const state = {
  token: localStorage.getItem('neonApexToken') || '',
  profile: null,
  cars: [],
  upgrades: {},
  car: 'red',
  track: localStorage.getItem('neonApexTrack') || 'neon-city',
  createMode: false,
  currentView: 'loginView',
  running: false,
  animation: 0,
  raceGeneration: 0,
  raceId: '',
  lastFrame: 0,
  startedAt: 0,
  elapsed: 0,
  distance: 0,
  trackScroll: 0,
  speed: 0,
  nitro: 100,
  collectedCoins: 0,
  player: { x: 500, y: 525, angle: 0 },
  rivals: [],
  pickups: [],
  keys: new Set(),
};
window.__state = state;

function showView(id) {
  views.forEach((view) => $(view).classList.toggle('active', view === id));
  state.currentView = id;
}

async function api(path, options = {}, auth = true) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (auth && state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(`/api${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && auth) clearSession();
    throw new Error(data.error || 'Não foi possível concluir a operação.');
  }
  return data;
}

function clearSession() {
  state.token = '';
  state.profile = null;
  state.upgrades = {};
  localStorage.removeItem('neonApexToken');
}

function setStatus(message, type = '') {
  $('apiStatus').textContent = message;
  $('apiStatus').className = `api-status${type ? ` ${type}` : ''}`;
}

function formatNumber(value) {
  return new Intl.NumberFormat('pt-BR').format(Number(value || 0));
}

function formatTime(milliseconds) {
  if (!Number.isFinite(Number(milliseconds))) return '—';
  const ms = Math.max(0, Math.round(Number(milliseconds)));
  const minutes = Math.floor(ms / 60000).toString().padStart(2, '0');
  const seconds = Math.floor((ms / 1000) % 60).toString().padStart(2, '0');
  const millis = Math.floor(ms % 1000).toString().padStart(3, '0');
  return `${minutes}:${seconds}.${millis}`;
}

function currentTrack() {
  return TRACKS[state.track] || TRACKS['neon-city'];
}

function selectedCar() {
  return state.cars.find((car) => car.key === state.car) || state.cars[0] || {
    key: 'red', name: 'VOLT R', speed: 90, acceleration: 84, braking: 77, handling: 72, nitro: 80,
  };
}

function upgradeLevels(carKey = state.car) {
  return state.upgrades?.[carKey] || { speed: 0, acceleration: 0, braking: 0, handling: 0, nitro: 0 };
}

function effectiveCar() {
  const car = selectedCar();
  const levels = upgradeLevels(car.key);
  return {
    ...car,
    speed: car.speed + levels.speed * 4,
    acceleration: car.acceleration + levels.acceleration * 4,
    braking: car.braking + levels.braking * 3,
    handling: car.handling + levels.handling * 4,
    nitro: car.nitro + levels.nitro * 4,
  };
}

function upgradeCost(level) {
  return 400 + Number(level || 0) * 550;
}

function updateProfileUI() {
  if (!state.profile) return;
  const p = state.profile;
  const car = state.cars.find((item) => item.key === p.selectedCar) || selectedCar();
  state.car = p.selectedCar || state.car;

  ['menuPlayer', 'garagePlayer', 'racePlayer'].forEach((id) => { $(id).textContent = p.player.toUpperCase(); });
  $('menuLevel').textContent = p.level;
  $('menuCoins').textContent = formatNumber(p.coins);
  $('menuRaces').textContent = p.races;
  $('garageCoins').textContent = formatNumber(p.coins);
  $('profileName').textContent = p.player.toUpperCase();
  $('profileLevel').textContent = p.level;
  $('profileXp').textContent = formatNumber(p.xp);
  $('profileCoins').textContent = formatNumber(p.coins);
  $('profileRaces').textContent = p.races;
  $('profileBest').textContent = p.bestTime == null ? '—' : formatTime(p.bestTime);
  $('profileCar').textContent = car?.name || 'VOLT R';
  $('selectedCarName').textContent = car?.name || 'VOLT R';
  $('upgradeCarName').textContent = car?.name || 'VOLT R';
  $('menuTrackEyebrow').textContent = `TEMPORADA 01 // ${currentTrack().name}`;
  $('selectedTrackName').textContent = currentTrack().name;
}

function renderGarage() {
  const grid = $('carGrid');
  grid.replaceChildren();
  state.cars.forEach((car, index) => {
    const levels = upgradeLevels(car.key);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `car-card${car.key === state.car ? ' selected' : ''}`;
    button.dataset.car = car.key;

    const number = document.createElement('span');
    number.className = 'car-number';
    number.textContent = String(index + 1).padStart(2, '0');

    const check = document.createElement('span');
    check.className = 'check';
    check.textContent = '✓';

    const visual = document.createElement('span');
    visual.className = `car-visual ${car.key === 'red' ? '' : car.key}`;

    const title = document.createElement('h3');
    title.textContent = car.name;
    const sub = document.createElement('div');
    sub.className = 'car-sub';
    sub.textContent = car.key === 'red' ? 'IMPACTO / CLÁSSICO' : car.key === 'purple' ? 'PRECISÃO / ÁGIL' : 'VELOCIDADE / FLUIDO';

    const stats = document.createElement('div');
    stats.className = 'stat-lines';
    [['VEL', car.speed + levels.speed * 4], ['ACEL', car.acceleration + levels.acceleration * 4], ['FREIO', car.braking + levels.braking * 3], ['CTRL', car.handling + levels.handling * 4], ['NITRO', car.nitro + levels.nitro * 4]].forEach(([label, value]) => {
      const line = document.createElement('div');
      const name = document.createElement('span'); name.textContent = label;
      const meter = document.createElement('i'); const fill = document.createElement('b'); fill.style.width = `${Math.min(100, value)}%`; meter.appendChild(fill);
      const amount = document.createElement('strong'); amount.textContent = value;
      line.append(name, meter, amount); stats.appendChild(line);
    });

    button.append(number, check, visual, title, sub, stats);
    grid.appendChild(button);
  });
  renderUpgradePanel();
}

function renderUpgradePanel() {
  const panel = $('upgradePanel');
  panel.replaceChildren();
  const levels = upgradeLevels();
  $('upgradeCarName').textContent = selectedCar().name;
  $('garageCoins').textContent = formatNumber(state.profile?.coins || 0);

  UPGRADE_STATS.forEach(([stat, label]) => {
    const level = Number(levels[stat] || 0);
    const cost = upgradeCost(level);
    const row = document.createElement('article');
    row.className = 'upgrade-row';
    const tag = document.createElement('span'); tag.textContent = label;
    const value = document.createElement('strong'); value.textContent = `NÍVEL ${level}/5`;
    const bars = document.createElement('div'); bars.className = 'upgrade-level';
    for (let i = 0; i < 5; i += 1) { const b = document.createElement('i'); if (i < level) b.classList.add('on'); bars.appendChild(b); }
    const buy = document.createElement('button');
    buy.type = 'button';
    buy.dataset.upgradeStat = stat;
    buy.disabled = level >= 5;
    buy.textContent = level >= 5 ? 'MÁXIMO' : `MELHORAR · ◉ ${formatNumber(cost)}`;
    row.append(tag, value, bars, buy);
    panel.appendChild(row);
  });
}

function renderTracks() {
  const grid = $('trackGrid');
  grid.replaceChildren();
  Object.values(TRACKS).forEach((track) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `track-card${track.key === state.track ? ' selected' : ''}`;
    card.dataset.track = track.key;
    card.style.setProperty('--track-a', track.a);
    card.style.setProperty('--track-b', track.b);
    card.innerHTML = `<span class="track-kicker">CIRCUITO</span><strong>${track.name}</strong><small>${track.subtitle}</small><div class="track-meta"><span>${(track.length / 1000).toFixed(1)} KM</span><span>${track.laps} VOLTAS</span><span>◉ ${track.coinValue}</span></div>`;
    grid.appendChild(card);
  });
  $('selectedTrackName').textContent = currentTrack().name;
  $('menuTrackEyebrow').textContent = `TEMPORADA 01 // ${currentTrack().name}`;
}

async function refreshProfile() {
  const data = await api('/profile');
  state.profile = data.profile;
  state.cars = data.cars || state.cars;
  state.upgrades = data.upgrades || state.upgrades || {};
  state.car = state.profile.selectedCar || 'red';
  updateProfileUI();
  renderGarage();
  renderTracks();
}

async function fetchLeaderboard(target = 'leaderboardRows') {
  const container = $(target);
  container.replaceChildren();
  try {
    const data = await api(`/leaderboard?track=${encodeURIComponent(state.track)}`, {}, false);
    if ($('rankingTrackLabel')) $('rankingTrackLabel').textContent = `TOP 10 // ${currentTrack().name}`;
    if (!data.scores?.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-row';
      empty.textContent = 'Ainda não há tempos registrados neste circuito.';
      container.appendChild(empty);
      return;
    }
    data.scores.forEach((score, index) => {
      const row = document.createElement('div'); row.className = 'leader-row';
      const rank = document.createElement('span'); rank.className = 'rank'; rank.textContent = `#${index + 1}`;
      const player = document.createElement('strong'); player.textContent = score.player;
      const time = document.createElement('time'); time.textContent = formatTime(score.time);
      row.append(rank, player, time); container.appendChild(row);
    });
  } catch (error) {
    const empty = document.createElement('div'); empty.className = 'empty-row'; empty.textContent = error.message;
    container.appendChild(empty);
  }
}

function physicsFor(car) {
  const track = currentTrack();
  return {
    maxSpeed: car.speed * 3.75,
    acceleration: car.acceleration * 1.55,
    braking: car.braking * 1.9,
    handling: (245 + car.handling * 2.15) * track.grip,
    nitroTopMultiplier: 1.22 + car.nitro / 520,
  };
}

function setupRivals() {
  state.rivals = [
    { x: 350, targetX: 350, y: 245, speed: 250, color: '#efa83e', laneTimer: 1.2 },
    { x: 500, targetX: 500, y: 115, speed: 285, color: '#b86df1', laneTimer: 2.0 },
    { x: 650, targetX: 650, y: 360, speed: 225, color: '#d7ff45', laneTimer: 1.7 },
  ];
}

function setupPickups() {
  const track = currentTrack();
  const lanes = [350, 500, 650];
  state.pickups = Array.from({ length: track.coinCount }, (_, index) => {
    const spacing = track.length / (track.coinCount + 1);
    const jitter = ((index * 137) % 170) - 85;
    return {
      distance: Math.max(180, Math.min(track.length - 180, spacing * (index + 1) + jitter)),
      x: lanes[(index * 5 + 1) % lanes.length],
      collected: false,
    };
  });
}

function resetRaceState() {
  const track = currentTrack();
  state.elapsed = 0;
  state.distance = 0;
  state.trackScroll = 0;
  state.speed = 0;
  state.nitro = 100;
  state.collectedCoins = 0;
  state.player = { x: 500, y: 525, angle: 0 };
  state.keys.clear();
  state.raceId = '';
  setupRivals();
  setupPickups();
  $('timer').textContent = '00:00.000';
  $('speedValue').textContent = '000';
  $('lapNumber').textContent = '01';
  $('lapTotal').textContent = ` / ${String(track.laps).padStart(2, '0')}`;
  $('nitroValue').textContent = '100';
  $('nitroBar').style.width = '100%';
  $('raceCoins').textContent = '0';
  $('raceTrackName').textContent = track.name;
}

function stopRaceLoop() {
  state.running = false;
  state.raceGeneration += 1;
  if (state.animation) cancelAnimationFrame(state.animation);
  state.animation = 0;
  state.keys.clear();
  $('countdown').style.display = 'none';
}

async function cancelServerRace() {
  const raceId = state.raceId;
  state.raceId = '';
  if (!raceId || !state.token) return;
  try { await api('/race/cancel', { method: 'POST', body: JSON.stringify({ raceId }) }); } catch { /* já encerrada */ }
}

async function leaveRace(destination = 'garageView') {
  const hadRace = Boolean(state.raceId);
  stopRaceLoop();
  if (hadRace) await cancelServerRace();
  showView(destination);
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function startRace() {
  if (!state.token) return showView('loginView');
  if (state.currentView === 'raceView') await cancelServerRace();
  stopRaceLoop();
  resetRaceState();
  showView('raceView');
  drawTrack();
  $('raceMessage').style.display = 'flex';
  $('countdown').style.display = 'grid';
  const generation = ++state.raceGeneration;

  try {
    for (const value of ['3', '2', '1']) {
      if (generation !== state.raceGeneration) return;
      $('countdown').textContent = value;
      await sleep(450);
    }
    if (generation !== state.raceGeneration) return;
    $('countdown').textContent = 'VAI!';
    const race = await api('/race/start', { method: 'POST', body: JSON.stringify({ car: state.car, track: state.track }) });
    if (generation !== state.raceGeneration) return;
    state.raceId = race.raceId;
    state.running = true;
    state.startedAt = performance.now();
    state.lastFrame = state.startedAt;
    state.animation = requestAnimationFrame(updateRace);
    await sleep(280);
    if (generation === state.raceGeneration) $('countdown').style.display = 'none';
  } catch (error) {
    if (generation !== state.raceGeneration) return;
    $('countdown').textContent = 'ERRO';
    $('raceMessage').style.display = 'flex';
    $('raceMessage').querySelector('strong').textContent = 'Não foi possível iniciar';
    $('raceMessage').querySelector('span').textContent = error.message;
  }
}

function rectFor(x, y, width = 48, height = 82) {
  return { left: x - width / 2, right: x + width / 2, top: y - height / 2, bottom: y + height / 2 };
}

function overlaps(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function resolveCollisions(proposedX, dt) {
  const halfW = 25;
  const minX = ROAD.left + halfW + 8;
  const maxX = ROAD.right - halfW - 8;
  let nextX = Math.max(minX, Math.min(maxX, proposedX));
  const playerRectAtNextX = () => rectFor(nextX, state.player.y, 50, 84);

  for (const rival of state.rivals) {
    if (overlaps(playerRectAtNextX(), rectFor(rival.x, rival.y, 46, 78))) {
      nextX = state.player.x;
      break;
    }
  }
  state.player.x = nextX;

  for (const rival of state.rivals) {
    const playerRect = rectFor(state.player.x, state.player.y, 50, 84);
    const rivalRect = rectFor(rival.x, rival.y, 46, 78);
    if (!overlaps(playerRect, rivalRect)) continue;

    const overlapX = Math.min(playerRect.right, rivalRect.right) - Math.max(playerRect.left, rivalRect.left);
    const overlapY = Math.min(playerRect.bottom, rivalRect.bottom) - Math.max(playerRect.top, rivalRect.top);
    if (overlapY <= overlapX) {
      if (state.player.y >= rival.y) state.player.y = rival.y + 84;
      else state.player.y = rival.y - 84;
      state.speed = Math.min(state.speed, Math.max(45, rival.speed * 0.8));
    } else {
      const direction = state.player.x < rival.x ? -1 : 1;
      state.player.x += direction * (overlapX + 3);
      state.player.x = Math.max(minX, Math.min(maxX, state.player.x));
      state.speed = Math.max(0, state.speed - 65 * dt);
    }
    state.nitro = Math.max(0, state.nitro - 8);
  }
}

function screenYForWorldDistance(worldDistance) {
  return state.player.y - (worldDistance - state.distance) * 0.72;
}

function collectPickups() {
  for (const coin of state.pickups) {
    if (coin.collected) continue;
    const y = screenYForWorldDistance(coin.distance);
    if (Math.abs(y - state.player.y) < 42 && Math.abs(coin.x - state.player.x) < 38) {
      coin.collected = true;
      state.collectedCoins += 1;
      $('raceCoins').textContent = String(state.collectedCoins);
    }
  }
}

function updateRivals(dt) {
  state.rivals.forEach((rival) => {
    rival.y += (state.speed - rival.speed) * 0.65 * dt;
    rival.laneTimer -= dt;
    if (rival.laneTimer <= 0) {
      rival.targetX = [350, 500, 650][Math.floor(Math.random() * 3)];
      rival.laneTimer = 1.2 + Math.random() * 2.4;
    }
    rival.x += (rival.targetX - rival.x) * Math.min(1, dt * 2.8);
    if (rival.y > 730) {
      rival.y = -130 - Math.random() * 220;
      rival.targetX = [350, 500, 650][Math.floor(Math.random() * 3)];
      rival.x = rival.targetX;
      rival.speed = 220 + Math.random() * 110;
    } else if (rival.y < -190) {
      rival.y = 700 + Math.random() * 100;
      rival.targetX = [350, 500, 650][Math.floor(Math.random() * 3)];
      rival.x = rival.targetX;
      rival.speed = 210 + Math.random() * 100;
    }
  });
}

function updateRace(timestamp) {
  if (!state.running) return;
  const dt = Math.min(0.033, Math.max(0.001, (timestamp - state.lastFrame) / 1000));
  state.lastFrame = timestamp;
  state.elapsed = timestamp - state.startedAt;

  const car = effectiveCar();
  const physics = physicsFor(car);
  const track = currentTrack();
  const accelerating = state.keys.has('ArrowUp') || state.keys.has('w') || state.keys.has('up');
  const braking = state.keys.has('ArrowDown') || state.keys.has('s') || state.keys.has('brake');
  const left = state.keys.has('ArrowLeft') || state.keys.has('a') || state.keys.has('left');
  const right = state.keys.has('ArrowRight') || state.keys.has('d') || state.keys.has('right');
  const nitroPressed = state.keys.has('Shift') || state.keys.has('nitro');
  const usingNitro = nitroPressed && state.nitro > 0.5 && accelerating;
  const topSpeed = physics.maxSpeed * (usingNitro ? physics.nitroTopMultiplier : 1);

  if (accelerating) state.speed += physics.acceleration * (usingNitro ? 1.38 : 1) * dt;
  else state.speed -= 12 * dt;
  if (braking) state.speed -= physics.braking * dt;
  state.speed = Math.max(0, Math.min(topSpeed, state.speed));

  if (usingNitro) state.nitro = Math.max(0, state.nitro - 34 * dt);
  else state.nitro = Math.min(100, state.nitro + 8 * dt);

  let steering = 0;
  if (left) steering -= 1;
  if (right) steering += 1;
  const steeringScale = 0.65 + Math.min(1, state.speed / 180) * 0.35;
  const proposedX = state.player.x + steering * physics.handling * steeringScale * dt;
  state.player.angle += ((steering * 0.12) - state.player.angle) * Math.min(1, dt * 14);

  const speedRatio = Math.min(1, state.speed / Math.max(1, physics.maxSpeed));
  const targetY = 540 - speedRatio * 92 + (braking ? 18 : 0);
  state.player.y += (targetY - state.player.y) * Math.min(1, dt * 5.5);

  state.distance += (state.speed / 3.6) * dt;
  state.trackScroll += state.speed * 1.35 * dt;
  updateRivals(dt);
  resolveCollisions(proposedX, dt);
  collectPickups();

  const lapLength = track.length / track.laps;
  $('timer').textContent = formatTime(state.elapsed);
  $('speedValue').textContent = Math.round(state.speed).toString().padStart(3, '0');
  $('lapNumber').textContent = Math.min(track.laps, Math.floor(state.distance / lapLength) + 1).toString().padStart(2, '0');
  $('nitroValue').textContent = Math.round(state.nitro);
  $('nitroBar').style.width = `${state.nitro}%`;

  drawTrack();
  if (state.distance >= track.length) finishRace();
  else state.animation = requestAnimationFrame(updateRace);
}

async function finishRace() {
  if (!state.running) return;
  state.running = false;
  if (state.animation) cancelAnimationFrame(state.animation);
  state.animation = 0;
  state.raceGeneration += 1;

  $('resultName').textContent = `${state.profile?.player || 'piloto'}.`;
  $('resultTime').textContent = formatTime(state.elapsed);
  $('resultCopy').textContent = 'Validando o tempo e as moedas no servidor...';
  showView('resultView');

  try {
    const result = await api('/race/finish', { method: 'POST', body: JSON.stringify({ raceId: state.raceId, collectedCoins: state.collectedCoins }) });
    state.raceId = '';
    state.profile = result.profile;
    state.upgrades = result.upgrades || state.upgrades;
    updateProfileUI();
    $('resultTime').textContent = formatTime(result.time);
    $('resultCopy').textContent = `◉ ${formatNumber(result.rewards.coins)} moedas (${state.collectedCoins} coletadas) · +${formatNumber(result.rewards.xp)} XP · resultado salvo.`;
  } catch (error) {
    $('resultCopy').textContent = `Resultado não publicado: ${error.message}`;
  }
  await fetchLeaderboard('leaderboardRows');
}

function drawEnvironment(ctx, track, scroll, width, height) {
  ctx.fillStyle = track.sky;
  ctx.fillRect(0, 0, width, height);

  if (track.key === 'neon-city') {
    for (let i = 0; i < 18; i += 1) {
      const y = ((i * 95 + scroll * 0.45) % (height + 150)) - 120;
      const h = 45 + (i % 4) * 18;
      ctx.fillStyle = i % 2 ? '#111c2d' : '#172235';
      ctx.fillRect(30 + (i % 3) * 48, y, 34, h);
      ctx.fillRect(840 + (i % 3) * 45, y - 20, 38, h + 12);
      ctx.fillStyle = i % 2 ? 'rgba(29,227,255,.65)' : 'rgba(255,79,216,.55)';
      ctx.fillRect(38 + (i % 3) * 48, y + 10, 6, 4);
      ctx.fillRect(850 + (i % 3) * 45, y, 6, 4);
    }
  } else if (track.key === 'desert-pulse') {
    ctx.fillStyle = '#7a512c'; ctx.fillRect(0, 0, ROAD.left, height); ctx.fillRect(ROAD.right, 0, width - ROAD.right, height);
    for (let i = 0; i < 12; i += 1) {
      const y = ((i * 115 + scroll * 0.55) % (height + 160)) - 100;
      ctx.fillStyle = '#d99a4a'; ctx.fillRect(60 + (i % 3) * 45, y, 8, 42); ctx.fillRect(860 + (i % 2) * 45, y - 30, 8, 42);
      ctx.fillStyle = '#6c8a3c'; ctx.fillRect(52 + (i % 3) * 45, y + 12, 24, 5);
    }
  } else {
    ctx.fillStyle = '#d9f5ff'; ctx.fillRect(0, 0, ROAD.left, height); ctx.fillRect(ROAD.right, 0, width - ROAD.right, height);
    for (let i = 0; i < 14; i += 1) {
      const y = ((i * 100 + scroll * 0.5) % (height + 160)) - 120;
      ctx.fillStyle = i % 2 ? '#8bd5ef' : '#b7ecff';
      ctx.beginPath(); ctx.moveTo(70, y + 60); ctx.lineTo(105, y); ctx.lineTo(140, y + 60); ctx.fill();
      ctx.beginPath(); ctx.moveTo(855, y + 50); ctx.lineTo(890, y - 10); ctx.lineTo(930, y + 50); ctx.fill();
    }
  }
}

function drawCoin(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.shadowBlur = 16; ctx.shadowColor = '#ffd84a';
  ctx.fillStyle = '#ffc72c'; ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0; ctx.strokeStyle = '#fff0a2'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#8a5b00'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('N', 0, 1);
  ctx.restore();
}

function drawFinishLine(ctx, y) {
  const cell = 28;
  const startX = ROAD.left;
  const cols = Math.ceil((ROAD.right - ROAD.left) / cell);
  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      ctx.fillStyle = (row + col) % 2 ? '#080b12' : '#f5f7fb';
      ctx.fillRect(startX + col * cell, y + row * 18, cell + 1, 18);
    }
  }
  ctx.fillStyle = '#d7ff45'; ctx.font = 'bold 16px Space Grotesk'; ctx.textAlign = 'center'; ctx.fillText('LINHA DE CHEGADA', ROAD.center, y - 10);
}

function drawTrack() {
  const canvas = $('raceCanvas');
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  const track = currentTrack();
  const scroll = state.trackScroll;
  ctx.clearRect(0, 0, width, height);
  drawEnvironment(ctx, track, scroll, width, height);

  ctx.fillStyle = track.road; ctx.fillRect(ROAD.left, 0, ROAD.right - ROAD.left, height);
  if (track.key === 'neon-city') { ctx.fillStyle = track.shoulder; ctx.fillRect(0, 0, ROAD.left, height); ctx.fillRect(ROAD.right, 0, width - ROAD.right, height); }

  for (let i = -2; i < 12; i += 1) {
    const y = ((i * 72 + scroll * 1.35) % (height + 144)) - 72;
    ctx.fillStyle = i % 2 ? track.a : track.b;
    ctx.fillRect(ROAD.left - 8, y, 8, 42);
    ctx.fillRect(ROAD.right, y, 8, 42);
  }

  ctx.strokeStyle = 'rgba(255,255,255,.42)'; ctx.lineWidth = 4; ctx.setLineDash([38, 42]); ctx.lineDashOffset = scroll * 1.8;
  [ROAD.left + (ROAD.right - ROAD.left) / 3, ROAD.left + (ROAD.right - ROAD.left) * 2 / 3].forEach((x) => {
    ctx.beginPath(); ctx.moveTo(x, -80); ctx.lineTo(x, height + 80); ctx.stroke();
  });
  ctx.setLineDash([]);

  const visualSpeed = Math.min(1, state.speed / 360);
  if (visualSpeed > 0.35) {
    ctx.save(); ctx.globalAlpha = (visualSpeed - 0.35) * 0.65;
    for (let i = 0; i < 20; i += 1) {
      const side = i % 2 === 0 ? ROAD.left - 35 : ROAD.right + 35;
      const y = ((i * 71 + scroll * 2.2) % (height + 100)) - 50;
      ctx.strokeStyle = i % 3 === 0 ? track.b : track.a; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(side, y); ctx.lineTo(side, y + 35 + visualSpeed * 75); ctx.stroke();
    }
    ctx.restore();
  }

  for (const coin of state.pickups) {
    if (coin.collected) continue;
    const y = screenYForWorldDistance(coin.distance);
    if (y > -40 && y < height + 40) drawCoin(ctx, coin.x, y);
  }

  const finishY = screenYForWorldDistance(track.length);
  if (finishY > -80 && finishY < height + 80) drawFinishLine(ctx, finishY);

  state.rivals.forEach((rival) => drawCar(ctx, rival.x, rival.y, rival.color, 0.86, 0));
  const color = state.car === 'red' ? '#ff405d' : state.car === 'purple' ? '#8f4dff' : '#42a5ff';
  drawCar(ctx, state.player.x, state.player.y, color, 1, state.player.angle);
}

function drawCar(ctx, x, y, color, scale = 1, angle = 0) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(angle); ctx.scale(scale, scale);
  ctx.fillStyle = 'rgba(0,0,0,.34)'; ctx.beginPath(); ctx.ellipse(0, 8, 31, 43, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = color; ctx.shadowBlur = 18; ctx.shadowColor = color;
  ctx.beginPath(); ctx.roundRect(-23, -40, 46, 80, 12); ctx.fill(); ctx.shadowBlur = 0;
  ctx.fillStyle = '#111827'; ctx.beginPath(); ctx.roundRect(-16, -27, 32, 28, 7); ctx.fill();
  ctx.fillStyle = '#080a0f'; [-28, 21].forEach((wx) => { ctx.fillRect(wx, -25, 7, 17); ctx.fillRect(wx, 18, 7, 17); });
  ctx.fillStyle = '#fff49a'; ctx.fillRect(-15, -37, 9, 4); ctx.fillRect(6, -37, 9, 4);
  ctx.fillStyle = '#ff425f'; ctx.fillRect(-15, 34, 9, 3); ctx.fillRect(6, 34, 9, 3);
  ctx.restore();
}

$('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const player = $('playerName').value.trim();
  const password = $('playerPassword').value;
  const endpoint = state.createMode ? '/register' : '/login';
  setStatus(state.createMode ? 'Criando usuário...' : 'Entrando...');
  try {
    const result = await api(endpoint, { method: 'POST', body: JSON.stringify({ player, password }) }, false);
    state.token = result.token;
    localStorage.setItem('neonApexToken', state.token);
    state.profile = result.profile;
    state.upgrades = result.upgrades || {};
    const cars = await api('/cars');
    state.cars = cars.cars || [];
    state.car = state.profile.selectedCar || 'red';
    updateProfileUI(); renderGarage(); renderTracks();
    setStatus('Conta conectada.', 'success');
    showView('mainView');
  } catch (error) { setStatus(error.message, 'error'); }
});

$('toggleCreateModeButton').addEventListener('click', () => {
  state.createMode = !state.createMode;
  $('loginTitle').textContent = state.createMode ? 'CRIAR USUÁRIO' : 'FAÇA SEU LOGIN';
  $('authEyebrow').textContent = state.createMode ? 'NOVO PILOTO' : 'ACESSO AO GRID';
  $('submitLoginButton').innerHTML = state.createMode ? 'CRIAR E ENTRAR <span>↗</span>' : 'ENTRAR <span>↗</span>';
  $('toggleCreateModeButton').textContent = state.createMode ? 'VOLTAR AO LOGIN' : 'CRIAR USUÁRIO';
  setStatus(state.createMode ? 'O usuário será salvo diretamente no banco.' : 'Somente contas salvas no banco podem acessar.');
});

$('carGrid').addEventListener('click', async (event) => {
  const card = event.target.closest('.car-card');
  if (!card) return;
  state.car = card.dataset.car;
  document.querySelectorAll('.car-card').forEach((item) => item.classList.toggle('selected', item.dataset.car === state.car));
  $('selectedCarName').textContent = selectedCar().name;
  renderUpgradePanel();
  try {
    const data = await api('/profile/car', { method: 'POST', body: JSON.stringify({ car: state.car }) });
    state.profile = data.profile; updateProfileUI();
  } catch (error) { console.error(error); }
});

$('upgradePanel').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-upgrade-stat]');
  if (!button) return;
  const stat = button.dataset.upgradeStat;
  button.disabled = true;
  const original = button.textContent;
  button.textContent = 'PROCESSANDO...';
  try {
    const data = await api('/upgrade', { method: 'POST', body: JSON.stringify({ car: state.car, stat }) });
    state.profile = data.profile;
    state.upgrades = data.upgrades;
    updateProfileUI();
    renderGarage();
  } catch (error) {
    button.disabled = false;
    button.textContent = error.message;
    setTimeout(() => { if (button.isConnected) button.textContent = original; }, 1600);
  }
});

$('trackGrid').addEventListener('click', (event) => {
  const card = event.target.closest('.track-card');
  if (!card) return;
  state.track = card.dataset.track;
  localStorage.setItem('neonApexTrack', state.track);
  renderTracks();
  updateProfileUI();
});

$('menuPlayButton').addEventListener('click', startRace);
$('startButton').addEventListener('click', startRace);
$('restartButton').addEventListener('click', startRace);
$('raceAgainButton').addEventListener('click', startRace);
$('backGarageButton').addEventListener('click', () => leaveRace('garageView'));
$('resultGarageButton').addEventListener('click', () => showView('garageView'));
$('resultMenuButton').addEventListener('click', () => showView('mainView'));
$('menuGarageButton').addEventListener('click', () => { renderTracks(); renderUpgradePanel(); showView('garageView'); });
$('menuProfileButton').addEventListener('click', async () => { try { await refreshProfile(); } catch {} showView('profileView'); });
$('menuRankingButton').addEventListener('click', async () => { showView('rankingView'); await fetchLeaderboard('rankingRows'); });
document.querySelectorAll('[data-back-main]').forEach((button) => button.addEventListener('click', () => showView('mainView')));

document.querySelectorAll('.logout-button').forEach((button) => button.addEventListener('click', async () => {
  stopRaceLoop();
  try { if (state.token) await api('/logout', { method: 'POST' }); } catch { /* sessão expirada */ }
  clearSession();
  $('playerPassword').value = '';
  showView('loginView');
  setStatus('Sessão encerrada.');
}));

window.addEventListener('keydown', (event) => {
  if (state.currentView !== 'raceView') return;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','Shift'].includes(event.key)) event.preventDefault();
  state.keys.add(key);
});
window.addEventListener('keyup', (event) => {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  state.keys.delete(key);
});

$('touchControls').querySelectorAll('button').forEach((button) => {
  const control = button.dataset.control;
  const press = (event) => { event.preventDefault(); state.keys.add(control); };
  const release = (event) => { event.preventDefault(); state.keys.delete(control); };
  button.addEventListener('pointerdown', press);
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('pointerleave', release);
});

(async function boot() {
  renderTracks();
  if (!state.token) { showView('loginView'); return; }
  try {
    await refreshProfile();
    showView('mainView');
  } catch {
    clearSession();
    showView('loginView');
    setStatus('Entre novamente para continuar.');
  }
})();
