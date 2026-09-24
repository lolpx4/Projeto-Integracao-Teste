
const $ = (id) => document.getElementById(id);
const views = ['loginView', 'mainView', 'garageView', 'raceView', 'profileView', 'rankingView', 'resultView'];

const ROAD = { left: 220, right: 780, center: 500 };
const RACE_LANES = [290, 430, 570, 710];
const WORLD_TO_SCREEN = 0.72;

const TRACKS = {
  'neon-city': {
    key: 'neon-city', name: 'NEON CITY', subtitle: 'Metrópole noturna',
    length: 5200, laps: 4, coinCount: 28, coinValue: 25,
    a: '#1de3ff', b: '#ff4fd8', road: '#2c3039', shoulder: '#151a24',
    sky: '#08111d', grip: 1,
  },
  'desert-pulse': {
    key: 'desert-pulse', name: 'DESERT PULSE', subtitle: 'Calor, poeira e velocidade',
    length: 6000, laps: 4, coinCount: 32, coinValue: 30,
    a: '#ffb347', b: '#ff5c57', road: '#37312d', shoulder: '#6c4a2b',
    sky: '#25140f', grip: 0.94,
  },
  'arctic-circuit': {
    key: 'arctic-circuit', name: 'ARCTIC CIRCUIT', subtitle: 'Gelo, neve e reflexos',
    length: 5600, laps: 4, coinCount: 30, coinValue: 30,
    a: '#8cecff', b: '#6b7cff', road: '#283644', shoulder: '#d8f4ff',
    sky: '#07131f', grip: 0.88,
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
  ownedCars: ['red'],
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
  finalPosition: 4,

  player: {
    x: 570,
    y: 542,
    angle: 0,
    kickY: 0,
  },

  rivals: [],
  pickups: [],
  impacts: [],
  cameraShake: 0,
  keys: new Set(),
};

window.__state = state;

function isTouchDevice() {
  return (
    window.matchMedia('(hover: none)').matches ||
    window.matchMedia('(pointer: coarse)').matches ||
    navigator.maxTouchPoints > 0
  );
}

function updateOrientationHint() {
  const hint = $('orientationHint');
  if (!hint) return;

  const portrait = window.matchMedia('(orientation: portrait)').matches;
  const shouldShow =
    state.currentView === 'raceView' &&
    isTouchDevice() &&
    portrait;

  hint.classList.toggle('visible', shouldShow);
}

function updateControlHint() {
  const hint = $('raceControlHint');
  if (!hint) return;

  hint.textContent = isTouchDevice()
    ? 'ACEL acelera normalmente. NITRO funciona sozinho e aplica o impulso.'
    : 'WASD/SETAS para dirigir. SHIFT ativa nitro. Encoste lateralmente para empurrar rivais.';
}

function showView(id) {
  views.forEach((view) => $(view).classList.toggle('active', view === id));
  state.currentView = id;
  document.body.classList.toggle('race-mode', id === 'raceView');
  updateControlHint();
  updateOrientationHint();
}

async function api(path, options = {}, auth = true) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (auth && state.token) headers.Authorization = `Bearer ${state.token}`;

  const response = await fetch(`/api${path}`, {
    ...options,
    headers,
  });

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
  state.ownedCars = ['red'];
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

function ordinal(position) {
  return `${position}º`;
}

function currentTrack() {
  return TRACKS[state.track] || TRACKS['neon-city'];
}

function carByKey(key) {
  return state.cars.find((car) => car.key === key);
}

function selectedCar() {
  return carByKey(state.car) || state.cars[0] || {
    key: 'red',
    name: 'VOLT R',
    price: 0,
    speed: 72,
    acceleration: 72,
    braking: 68,
    handling: 70,
    nitro: 65,
  };
}

function ownsCar(carKey) {
  return state.ownedCars.includes(carKey);
}

function upgradeLevels(carKey = state.car) {
  return state.upgrades?.[carKey] || {
    speed: 0,
    acceleration: 0,
    braking: 0,
    handling: 0,
    nitro: 0,
  };
}

function effectiveCar(carKey = state.car) {
  const car = carByKey(carKey) || selectedCar();
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

function syncPayload(data) {
  if (data.profile) state.profile = data.profile;
  if (data.upgrades) state.upgrades = data.upgrades;
  if (Array.isArray(data.ownedCars)) state.ownedCars = data.ownedCars;

  if (state.profile?.selectedCar && ownsCar(state.profile.selectedCar)) {
    state.car = state.profile.selectedCar;
  } else if (!ownsCar(state.car)) {
    state.car = 'red';
  }
}

function updateProfileUI() {
  if (!state.profile) return;

  const p = state.profile;
  const car = carByKey(p.selectedCar) || selectedCar();

  if (ownsCar(p.selectedCar)) state.car = p.selectedCar;

  ['menuPlayer', 'garagePlayer', 'racePlayer'].forEach((id) => {
    $(id).textContent = p.player.toUpperCase();
  });

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

  $('selectedCarName').textContent = selectedCar().name;
  $('upgradeCarName').textContent = selectedCar().name;

  $('menuTrackEyebrow').textContent = `TEMPORADA 01 // ${currentTrack().name}`;
  $('selectedTrackName').textContent = currentTrack().name;
}

function renderGarage() {
  const grid = $('carGrid');
  grid.replaceChildren();

  state.cars.forEach((car, index) => {
    const owned = ownsCar(car.key);
    const selected = state.car === car.key;
    const levels = upgradeLevels(car.key);

    const card = document.createElement('article');
    card.className = `car-card ${owned ? 'owned' : 'locked'}${selected ? ' selected' : ''}`;

    const status = document.createElement('span');
    status.className = 'car-status';
    status.textContent = selected ? 'SELECIONADO' : owned ? 'ADQUIRIDO' : 'BLOQUEADO';

    const number = document.createElement('span');
    number.className = 'car-number';
    number.textContent = String(index + 1).padStart(2, '0');

    const visual = document.createElement('span');
    visual.className = `car-visual ${car.key === 'red' ? '' : car.key}`;

    const title = document.createElement('h3');
    title.textContent = car.name;

    const sub = document.createElement('div');
    sub.className = 'car-sub';
    sub.textContent = car.key === 'red'
      ? 'INICIAL / EQUILIBRADO'
      : car.key === 'purple'
        ? 'ACELERAÇÃO / CONTROLE'
        : 'VELOCIDADE / NITRO';

    const stats = document.createElement('div');
    stats.className = 'stat-lines';

    const statValues = [
      ['VEL', car.speed + levels.speed * 4],
      ['ACEL', car.acceleration + levels.acceleration * 4],
      ['FREIO', car.braking + levels.braking * 3],
      ['CTRL', car.handling + levels.handling * 4],
      ['NITRO', car.nitro + levels.nitro * 4],
    ];

    statValues.forEach(([label, value]) => {
      const line = document.createElement('div');

      const name = document.createElement('span');
      name.textContent = label;

      const meter = document.createElement('i');
      const fill = document.createElement('b');
      fill.style.width = `${Math.min(100, value)}%`;
      meter.appendChild(fill);

      const amount = document.createElement('strong');
      amount.textContent = value;

      line.append(name, meter, amount);
      stats.appendChild(line);
    });

    const price = document.createElement('div');
    price.className = 'car-price';

    const priceLabel = document.createElement('span');
    priceLabel.textContent = owned ? 'NA GARAGEM' : 'PREÇO';

    const priceValue = document.createElement('strong');
    priceValue.textContent = owned ? '✓' : `◉ ${formatNumber(car.price)}`;

    price.append(priceLabel, priceValue);

    const action = document.createElement('button');
    action.type = 'button';
    action.className = `car-action${owned ? '' : ' buy'}`;

    if (!owned) {
      action.dataset.buyCar = car.key;
      action.textContent = `COMPRAR · ◉ ${formatNumber(car.price)}`;
    } else if (selected) {
      action.disabled = true;
      action.textContent = 'SELECIONADO';
    } else {
      action.dataset.selectCar = car.key;
      action.textContent = 'SELECIONAR';
    }

    card.append(status, number, visual, title, sub, stats, price, action);
    grid.appendChild(card);
  });

  renderUpgradePanel();
}

function renderUpgradePanel() {
  const panel = $('upgradePanel');
  panel.replaceChildren();

  const car = selectedCar();
  $('upgradeCarName').textContent = car.name;
  $('garageCoins').textContent = formatNumber(state.profile?.coins || 0);

  if (!ownsCar(car.key)) {
    const locked = document.createElement('div');
    locked.className = 'upgrade-locked';
    locked.innerHTML = `<strong>CARRO BLOQUEADO</strong><span>Compre ${car.name} antes de instalar melhorias.</span>`;
    panel.appendChild(locked);
    return;
  }

  const levels = upgradeLevels(car.key);

  UPGRADE_STATS.forEach(([stat, label]) => {
    const level = Number(levels[stat] || 0);
    const cost = upgradeCost(level);

    const row = document.createElement('article');
    row.className = 'upgrade-row';

    const tag = document.createElement('span');
    tag.textContent = label;

    const value = document.createElement('strong');
    value.textContent = `NÍVEL ${level}/5`;

    const bars = document.createElement('div');
    bars.className = 'upgrade-level';

    for (let i = 0; i < 5; i += 1) {
      const b = document.createElement('i');
      if (i < level) b.classList.add('on');
      bars.appendChild(b);
    }

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
    card.innerHTML = `
      <span class="track-kicker">CIRCUITO</span>
      <strong>${track.name}</strong>
      <small>${track.subtitle}</small>
      <div class="track-meta">
        <span>${(track.length / 1000).toFixed(1)} KM</span>
        <span>${track.laps} VOLTAS</span>
        <span>◉ ${track.coinValue}</span>
      </div>
    `;
    grid.appendChild(card);
  });

  $('selectedTrackName').textContent = currentTrack().name;
  $('menuTrackEyebrow').textContent = `TEMPORADA 01 // ${currentTrack().name}`;
}

async function refreshProfile() {
  const data = await api('/profile');

  state.cars = data.cars || state.cars;
  syncPayload(data);

  updateProfileUI();
  renderGarage();
  renderTracks();
}

async function fetchLeaderboard(target = 'leaderboardRows') {
  const container = $(target);
  container.replaceChildren();

  try {
    const data = await api(`/leaderboard?track=${encodeURIComponent(state.track)}`, {}, false);

    if ($('rankingTrackLabel')) {
      $('rankingTrackLabel').textContent = `TOP 10 // ${currentTrack().name}`;
    }

    if (!data.scores?.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-row';
      empty.textContent = 'Ainda não há tempos registrados neste circuito.';
      container.appendChild(empty);
      return;
    }

    data.scores.forEach((score, index) => {
      const row = document.createElement('div');
      row.className = 'leader-row';

      const rank = document.createElement('span');
      rank.className = 'rank';
      rank.textContent = `#${index + 1}`;

      const player = document.createElement('strong');
      player.textContent = score.player;

      const time = document.createElement('time');
      time.textContent = formatTime(score.time);

      row.append(rank, player, time);
      container.appendChild(row);
    });
  } catch (error) {
    const empty = document.createElement('div');
    empty.className = 'empty-row';
    empty.textContent = error.message;
    container.appendChild(empty);
  }
}

function physicsFor(car) {
  const track = currentTrack();

  return {
    maxSpeed: car.speed * 3.72,
    acceleration: car.acceleration * 1.6,
    braking: car.braking * 1.95,
    handling: (245 + car.handling * 2.2) * track.grip,
    nitroTopMultiplier: 1.45 + car.nitro / 520,
  };
}

function setupRivals() {
  const playerPhysics = physicsFor(effectiveCar());

  state.rivals = [
    {
      id: 'rival-a',
      name: 'RAVEN',
      color: '#efa83e',
      x: RACE_LANES[0],
      targetX: RACE_LANES[0],
      distance: 0,
      speed: 0,
      maxSpeed: playerPhysics.maxSpeed * 0.97,
      acceleration: playerPhysics.acceleration * 0.96,
      laneTimer: 1.8,
      pushVelocity: 0,
      collisionCooldown: 0,
      finished: false,
      tieBreak: 3,
    },
    {
      id: 'rival-b',
      name: 'VEX',
      color: '#b86df1',
      x: RACE_LANES[1],
      targetX: RACE_LANES[1],
      distance: 0,
      speed: 0,
      maxSpeed: playerPhysics.maxSpeed * 1.015,
      acceleration: playerPhysics.acceleration * 1.01,
      laneTimer: 2.3,
      pushVelocity: 0,
      collisionCooldown: 0,
      finished: false,
      tieBreak: 2,
    },
    {
      id: 'rival-c',
      name: 'NOVA',
      color: '#d7ff45',
      x: RACE_LANES[3],
      targetX: RACE_LANES[3],
      distance: 0,
      speed: 0,
      maxSpeed: playerPhysics.maxSpeed * 1.045,
      acceleration: playerPhysics.acceleration * 1.035,
      laneTimer: 1.5,
      pushVelocity: 0,
      collisionCooldown: 0,
      finished: false,
      tieBreak: 1,
    },
  ];
}

function setupPickups() {
  const track = currentTrack();

  state.pickups = Array.from({ length: track.coinCount }, (_, index) => {
    const spacing = track.length / (track.coinCount + 1);
    const jitter = ((index * 137) % 170) - 85;

    return {
      distance: Math.max(
        180,
        Math.min(track.length - 180, spacing * (index + 1) + jitter),
      ),
      x: RACE_LANES[(index * 5 + 1) % RACE_LANES.length],
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
  state.finalPosition = 4;
  state.cameraShake = 0;
  state.impacts = [];

  state.player = {
    x: RACE_LANES[2],
    y: 542,
    angle: 0,
    kickY: 0,
  };

  state.keys.clear();
  state.raceId = '';

  setupRivals();
  setupPickups();

  $('timer').textContent = '00:00.000';
  $('speedValue').textContent = '000';
  $('positionValue').textContent = '4';
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

  try {
    await api('/race/cancel', {
      method: 'POST',
      body: JSON.stringify({ raceId }),
    });
  } catch {
    // A corrida pode já ter sido encerrada.
  }
}

async function leaveRace(destination = 'garageView') {
  const hadRace = Boolean(state.raceId);

  stopRaceLoop();

  if (hadRace) await cancelServerRace();

  showView(destination);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startRace() {
  if (!state.token) return showView('loginView');
  if (!ownsCar(state.car)) {
    showView('garageView');
    return;
  }

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
      drawTrack();
      await sleep(500);
    }

    if (generation !== state.raceGeneration) return;

    $('countdown').textContent = 'VAI!';

    const race = await api('/race/start', {
      method: 'POST',
      body: JSON.stringify({
        car: state.car,
        track: state.track,
      }),
    });

    if (generation !== state.raceGeneration) return;

    state.raceId = race.raceId;
    state.running = true;
    state.startedAt = performance.now();
    state.lastFrame = state.startedAt;
    state.animation = requestAnimationFrame(updateRace);

    await sleep(300);

    if (generation === state.raceGeneration) {
      $('countdown').style.display = 'none';
    }
  } catch (error) {
    if (generation !== state.raceGeneration) return;

    $('countdown').textContent = 'ERRO';
    $('raceMessage').style.display = 'flex';
    $('raceMessage').querySelector('strong').textContent = 'Não foi possível iniciar';
    $('raceMessage').querySelector('span').textContent = error.message;
  }
}

function rectFor(x, y, width = 48, height = 82) {
  return {
    left: x - width / 2,
    right: x + width / 2,
    top: y - height / 2,
    bottom: y + height / 2,
  };
}

function overlaps(a, b) {
  return (
    a.left < b.right &&
    a.right > b.left &&
    a.top < b.bottom &&
    a.bottom > b.top
  );
}

function screenYForWorldDistance(worldDistance) {
  return state.player.y - (worldDistance - state.distance) * WORLD_TO_SCREEN;
}

function rivalScreenY(rival) {
  return screenYForWorldDistance(rival.distance);
}

function spawnImpact(x, y, color = '#ffd84a') {
  for (let i = 0; i < 9; i += 1) {
    const angle = (Math.PI * 2 * i) / 9 + Math.random() * 0.4;
    const speed = 70 + Math.random() * 120;

    state.impacts.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.34 + Math.random() * 0.18,
      maxLife: 0.5,
      color,
    });
  }
}

function updateImpacts(dt) {
  for (const p of state.impacts) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= Math.pow(0.16, dt);
    p.vy *= Math.pow(0.16, dt);
    p.life -= dt;
  }

  state.impacts = state.impacts.filter((p) => p.life > 0);
}

function resolveCollisions(proposedX, dt) {
  const halfW = 25;
  const minX = ROAD.left + halfW + 8;
  const maxX = ROAD.right - halfW - 8;

  state.player.x = Math.max(minX, Math.min(maxX, proposedX));

  for (const rival of state.rivals) {
    if (rival.finished) continue;

    rival.collisionCooldown = Math.max(0, rival.collisionCooldown - dt);

    const ry = rivalScreenY(rival);

    if (ry < -120 || ry > 740) continue;

    const playerRect = rectFor(state.player.x, state.player.y, 50, 84);
    const rivalRect = rectFor(rival.x, ry, 48, 82);

    if (!overlaps(playerRect, rivalRect)) continue;

    const overlapX = Math.min(playerRect.right, rivalRect.right) -
      Math.max(playerRect.left, rivalRect.left);

    const overlapY = Math.min(playerRect.bottom, rivalRect.bottom) -
      Math.max(playerRect.top, rivalRect.top);

    if (overlapX < overlapY) {
      const pushDirection = state.player.x < rival.x ? 1 : -1;

      if (rival.collisionCooldown <= 0) {
        const relative = Math.abs(state.speed - rival.speed);
        const impulse = 210 + relative * 0.7;

        rival.pushVelocity += pushDirection * impulse;
        state.player.x -= pushDirection * Math.min(12, overlapX * 0.45 + 3);
        state.speed *= 0.985;
        state.cameraShake = Math.max(state.cameraShake, 7);
        rival.collisionCooldown = 0.16;

        spawnImpact(
          (state.player.x + rival.x) / 2,
          (state.player.y + ry) / 2,
          '#ffd84a',
        );
      }

      state.player.x = Math.max(minX, Math.min(maxX, state.player.x));
      continue;
    }

    const playerBehind = state.player.y >= ry;

    if (rival.collisionCooldown <= 0) {
      if (playerBehind) {
        const relative = Math.max(0, state.speed - rival.speed);

        if (relative > 8) {
          rival.speed += relative * 0.42 + 7;
          state.speed = Math.max(0, state.speed - relative * 0.36 - 6);
          rival.distance += Math.max(0.8, overlapY / WORLD_TO_SCREEN * 0.12);
          state.player.kickY += 15;
        } else {
          state.speed = Math.min(state.speed, rival.speed + 8);
          rival.distance += 0.7;
        }
      } else {
        const relative = Math.max(0, rival.speed - state.speed);

        state.speed += relative * 0.24;
        rival.speed = Math.max(0, rival.speed - relative * 0.18);
        state.player.kickY -= 10;
      }

      state.cameraShake = Math.max(state.cameraShake, 9);
      rival.collisionCooldown = 0.2;

      spawnImpact(
        (state.player.x + rival.x) / 2,
        (state.player.y + ry) / 2,
        '#ff8c66',
      );
    }
  }
}

function collectPickups() {
  for (const coin of state.pickups) {
    if (coin.collected) continue;

    const y = screenYForWorldDistance(coin.distance);

    if (
      Math.abs(y - state.player.y) < 42 &&
      Math.abs(coin.x - state.player.x) < 38
    ) {
      coin.collected = true;
      state.collectedCoins += 1;
      $('raceCoins').textContent = String(state.collectedCoins);
    }
  }
}

function chooseRivalLane(rival) {
  const shuffled = [...RACE_LANES].sort(() => Math.random() - 0.5);

  for (const lane of shuffled) {
    const occupied = state.rivals.some((other) => {
      if (other === rival || other.finished) return false;

      return (
        Math.abs(other.x - lane) < 60 &&
        Math.abs(other.distance - rival.distance) < 28
      );
    });

    if (!occupied) return lane;
  }

  return rival.targetX;
}

function updateRivals(dt) {
  const track = currentTrack();

  state.rivals.forEach((rival, index) => {
    if (rival.finished) return;

    if (rival.speed < rival.maxSpeed) {
      const launchBoost = rival.distance < 120 ? 1.12 : 1;
      rival.speed += rival.acceleration * launchBoost * dt;
    } else {
      rival.speed -= 8 * dt;
    }

    rival.speed = Math.max(
      0,
      Math.min(rival.maxSpeed * 1.035, rival.speed),
    );

    rival.laneTimer -= dt;

    if (rival.laneTimer <= 0 && rival.distance < track.length - 120) {
      rival.targetX = chooseRivalLane(rival);
      rival.laneTimer = 1.15 + Math.random() * 2.2;
    }

    const laneSteer = (rival.targetX - rival.x) * Math.min(1, dt * 2.7);

    rival.x += laneSteer;
    rival.x += rival.pushVelocity * dt;
    rival.pushVelocity *= Math.pow(0.08, dt);

    const minX = ROAD.left + 30;
    const maxX = ROAD.right - 30;

    if (rival.x < minX) {
      rival.x = minX;
      rival.pushVelocity = Math.abs(rival.pushVelocity) * 0.35;
      rival.speed *= 0.82;
      state.cameraShake = Math.max(state.cameraShake, 3);
    }

    if (rival.x > maxX) {
      rival.x = maxX;
      rival.pushVelocity = -Math.abs(rival.pushVelocity) * 0.35;
      rival.speed *= 0.82;
      state.cameraShake = Math.max(state.cameraShake, 3);
    }

    rival.distance += (rival.speed / 3.6) * dt;

    if (rival.distance >= track.length) {
      rival.finished = true;
      rival.finishTime = state.elapsed;
      rival.distance = track.length + 120 + index * 70;
      rival.speed = 0;
      rival.pushVelocity = 0;
    }
  });
}

function currentPosition() {
  const entries = [
    {
      id: 'player',
      distance: state.distance,
      speed: state.speed,
      tieBreak: 0,
    },
    ...state.rivals.map((rival) => ({
      id: rival.id,
      distance: rival.distance,
      speed: rival.speed,
      tieBreak: rival.tieBreak,
    })),
  ];

  entries.sort((a, b) => {
    if (Math.abs(b.distance - a.distance) > 0.15) {
      return b.distance - a.distance;
    }

    if (Math.abs(b.speed - a.speed) > 0.25) {
      return b.speed - a.speed;
    }

    return b.tieBreak - a.tieBreak;
  });

  return entries.findIndex((entry) => entry.id === 'player') + 1;
}

function finalPlacement() {
  return 1 + state.rivals.filter((rival) => rival.finished).length;
}

function updateRace(timestamp) {
  if (!state.running) return;

  const dt = Math.min(
    0.033,
    Math.max(0.001, (timestamp - state.lastFrame) / 1000),
  );

  state.lastFrame = timestamp;
  state.elapsed = timestamp - state.startedAt;

  const car = effectiveCar();
  const physics = physicsFor(car);
  const track = currentTrack();

  const accelerating =
    state.keys.has('ArrowUp') ||
    state.keys.has('w') ||
    state.keys.has('up');

  const braking =
    state.keys.has('ArrowDown') ||
    state.keys.has('s') ||
    state.keys.has('brake');

  const left =
    state.keys.has('ArrowLeft') ||
    state.keys.has('a') ||
    state.keys.has('left');

  const right =
    state.keys.has('ArrowRight') ||
    state.keys.has('d') ||
    state.keys.has('right');

  const nitroPressed =
    state.keys.has('Shift') ||
    state.keys.has('nitro');

  const usingNitro =
    nitroPressed &&
    state.nitro > 0.5;

  const topSpeed =
    physics.maxSpeed *
    (usingNitro ? physics.nitroTopMultiplier : 1);

  if (accelerating || usingNitro) {
    state.speed +=
      physics.acceleration *
      (usingNitro ? 1.38 : 1) *
      dt;
  } else {
    state.speed -= 12 * dt;
  }

  if (braking) {
    state.speed -= physics.braking * dt;
  }

  state.speed = Math.max(
    0,
    Math.min(topSpeed, state.speed),
  );

  if (usingNitro) {
    state.nitro = Math.max(0, state.nitro - 34 * dt);
  } else {
    state.nitro = Math.min(100, state.nitro + 8 * dt);
  }

  let steering = 0;

  if (left) steering -= 1;
  if (right) steering += 1;

  const steeringScale =
    0.62 +
    Math.min(1, state.speed / 180) * 0.38;

  const proposedX =
    state.player.x +
    steering *
    physics.handling *
    steeringScale *
    dt;

  state.player.angle +=
    ((steering * 0.13) - state.player.angle) *
    Math.min(1, dt * 14);

  const speedRatio =
    Math.min(
      1,
      state.speed / Math.max(1, physics.maxSpeed),
    );

  state.player.kickY *= Math.pow(0.06, dt);

  const targetY =
    548 -
    speedRatio * 118 +
    (braking ? 20 : 0) +
    state.player.kickY;

  state.player.y +=
    (targetY - state.player.y) *
    Math.min(1, dt * 6.2);

  state.distance +=
    (state.speed / 3.6) * dt;

  state.trackScroll +=
    state.speed *
    1.55 *
    dt;

  updateRivals(dt);
  resolveCollisions(proposedX, dt);
  collectPickups();
  updateImpacts(dt);

  state.cameraShake *= Math.pow(0.05, dt);

  const lapLength = track.length / track.laps;
  const position = currentPosition();

  $('timer').textContent = formatTime(state.elapsed);
  $('speedValue').textContent = Math.round(state.speed).toString().padStart(3, '0');
  $('positionValue').textContent = String(position);
  $('lapNumber').textContent = Math.min(
    track.laps,
    Math.floor(state.distance / lapLength) + 1,
  ).toString().padStart(2, '0');
  $('nitroValue').textContent = Math.round(state.nitro);
  $('nitroBar').style.width = `${state.nitro}%`;

  drawTrack();

  if (state.distance >= track.length) {
    state.finalPosition = finalPlacement();
    finishRace();
  } else {
    state.animation = requestAnimationFrame(updateRace);
  }
}

async function finishRace() {
  if (!state.running) return;

  state.running = false;

  if (state.animation) cancelAnimationFrame(state.animation);
  state.animation = 0;

  state.raceGeneration += 1;

  $('resultName').textContent = `${state.profile?.player || 'piloto'}.`;
  $('resultPosition').textContent = `${ordinal(state.finalPosition)} / 4`;
  $('resultTime').textContent = formatTime(state.elapsed);
  $('resultCopy').textContent = 'Validando posição, tempo e moedas no servidor...';

  showView('resultView');

  try {
    const result = await api('/race/finish', {
      method: 'POST',
      body: JSON.stringify({
        raceId: state.raceId,
        collectedCoins: state.collectedCoins,
        finalPosition: state.finalPosition,
      }),
    });

    state.raceId = '';
    syncPayload(result);

    updateProfileUI();
    renderGarage();

    $('resultPosition').textContent = `${ordinal(result.finalPosition)} / 4`;
    $('resultTime').textContent = formatTime(result.time);

    $('resultCopy').textContent =
      `◉ ${formatNumber(result.rewards.coins)} moedas ` +
      `(${formatNumber(result.rewards.placementCoins)} pela posição + ` +
      `${formatNumber(result.rewards.pickupCoins)} coletadas) · ` +
      `+${formatNumber(result.rewards.xp)} XP.`;
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
      const y =
        ((i * 95 + scroll * 0.45) % (height + 150)) -
        120;

      const h = 45 + (i % 4) * 18;

      ctx.fillStyle = i % 2 ? '#111c2d' : '#172235';

      ctx.fillRect(
        30 + (i % 3) * 48,
        y,
        34,
        h,
      );

      ctx.fillRect(
        840 + (i % 3) * 45,
        y - 20,
        38,
        h + 12,
      );

      ctx.fillStyle =
        i % 2
          ? 'rgba(29,227,255,.65)'
          : 'rgba(255,79,216,.55)';

      ctx.fillRect(
        38 + (i % 3) * 48,
        y + 10,
        6,
        4,
      );

      ctx.fillRect(
        850 + (i % 3) * 45,
        y,
        6,
        4,
      );
    }
  } else if (track.key === 'desert-pulse') {
    ctx.fillStyle = '#7a512c';

    ctx.fillRect(
      0,
      0,
      ROAD.left,
      height,
    );

    ctx.fillRect(
      ROAD.right,
      0,
      width - ROAD.right,
      height,
    );

    for (let i = 0; i < 12; i += 1) {
      const y =
        ((i * 115 + scroll * 0.55) % (height + 160)) -
        100;

      ctx.fillStyle = '#d99a4a';

      ctx.fillRect(
        60 + (i % 3) * 45,
        y,
        8,
        42,
      );

      ctx.fillRect(
        860 + (i % 2) * 45,
        y - 30,
        8,
        42,
      );

      ctx.fillStyle = '#6c8a3c';

      ctx.fillRect(
        52 + (i % 3) * 45,
        y + 12,
        24,
        5,
      );
    }
  } else {
    ctx.fillStyle = '#d9f5ff';

    ctx.fillRect(
      0,
      0,
      ROAD.left,
      height,
    );

    ctx.fillRect(
      ROAD.right,
      0,
      width - ROAD.right,
      height,
    );

    for (let i = 0; i < 14; i += 1) {
      const y =
        ((i * 100 + scroll * 0.5) % (height + 160)) -
        120;

      ctx.fillStyle =
        i % 2 ? '#8bd5ef' : '#b7ecff';

      ctx.beginPath();
      ctx.moveTo(70, y + 60);
      ctx.lineTo(105, y);
      ctx.lineTo(140, y + 60);
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(855, y + 50);
      ctx.lineTo(890, y - 10);
      ctx.lineTo(930, y + 50);
      ctx.fill();
    }
  }
}

function drawCoin(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);

  ctx.shadowBlur = 16;
  ctx.shadowColor = '#ffd84a';

  ctx.fillStyle = '#ffc72c';
  ctx.beginPath();
  ctx.arc(0, 0, 12, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#fff0a2';
  ctx.lineWidth = 3;

  ctx.beginPath();
  ctx.arc(0, 0, 7, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#8a5b00';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('N', 0, 1);

  ctx.restore();
}

function drawCheckeredLine(ctx, y, label) {
  const cell = 28;
  const startX = ROAD.left;
  const cols = Math.ceil((ROAD.right - ROAD.left) / cell);

  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      ctx.fillStyle =
        (row + col) % 2
          ? '#080b12'
          : '#f5f7fb';

      ctx.fillRect(
        startX + col * cell,
        y + row * 18,
        cell + 1,
        18,
      );
    }
  }

  ctx.fillStyle = '#d7ff45';
  ctx.font = 'bold 16px Space Grotesk';
  ctx.textAlign = 'center';
  ctx.fillText(label, ROAD.center, y - 10);
}

function drawImpacts(ctx) {
  for (const p of state.impacts) {
    const alpha = Math.max(0, p.life / p.maxLife);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;

    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

function drawTrack() {
  const canvas = $('raceCanvas');
  const ctx = canvas.getContext('2d');

  const { width, height } = canvas;
  const track = currentTrack();
  const scroll = state.trackScroll;

  ctx.clearRect(0, 0, width, height);

  const shakeX =
    state.cameraShake > 0.2
      ? (Math.random() - 0.5) * state.cameraShake
      : 0;

  const shakeY =
    state.cameraShake > 0.2
      ? (Math.random() - 0.5) * state.cameraShake * 0.35
      : 0;

  ctx.save();
  ctx.translate(shakeX, shakeY);

  drawEnvironment(
    ctx,
    track,
    scroll,
    width,
    height,
  );

  ctx.fillStyle = track.road;

  ctx.fillRect(
    ROAD.left,
    0,
    ROAD.right - ROAD.left,
    height,
  );

  if (track.key === 'neon-city') {
    ctx.fillStyle = track.shoulder;

    ctx.fillRect(
      0,
      0,
      ROAD.left,
      height,
    );

    ctx.fillRect(
      ROAD.right,
      0,
      width - ROAD.right,
      height,
    );
  }

  for (let i = -2; i < 12; i += 1) {
    const y =
      ((i * 72 + scroll * 1.35) % (height + 144)) -
      72;

    ctx.fillStyle =
      i % 2 ? track.a : track.b;

    ctx.fillRect(
      ROAD.left - 8,
      y,
      8,
      42,
    );

    ctx.fillRect(
      ROAD.right,
      y,
      8,
      42,
    );
  }

  ctx.strokeStyle = 'rgba(255,255,255,.42)';
  ctx.lineWidth = 4;
  ctx.setLineDash([38, 42]);
  ctx.lineDashOffset = scroll * 1.8;

  const laneWidth =
    (ROAD.right - ROAD.left) / 4;

  [1, 2, 3].forEach((index) => {
    const x =
      ROAD.left +
      laneWidth * index;

    ctx.beginPath();
    ctx.moveTo(x, -80);
    ctx.lineTo(x, height + 80);
    ctx.stroke();
  });

  ctx.setLineDash([]);

  const visualSpeed =
    Math.min(1, state.speed / 350);

  if (visualSpeed > 0.28) {
    ctx.save();
    ctx.globalAlpha =
      (visualSpeed - 0.28) * 0.72;

    for (let i = 0; i < 22; i += 1) {
      const side =
        i % 2 === 0
          ? ROAD.left - 35
          : ROAD.right + 35;

      const y =
        ((i * 67 + scroll * 2.4) % (height + 110)) -
        55;

      ctx.strokeStyle =
        i % 3 === 0
          ? track.b
          : track.a;

      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.moveTo(side, y);
      ctx.lineTo(
        side,
        y + 40 + visualSpeed * 90,
      );
      ctx.stroke();
    }

    ctx.restore();
  }

  const startY =
    screenYForWorldDistance(0) +
    58;

  if (
    startY > -80 &&
    startY < height + 80
  ) {
    drawCheckeredLine(
      ctx,
      startY,
      'LARGADA',
    );
  }

  for (const coin of state.pickups) {
    if (coin.collected) continue;

    const y =
      screenYForWorldDistance(coin.distance);

    if (
      y > -40 &&
      y < height + 40
    ) {
      drawCoin(
        ctx,
        coin.x,
        y,
      );
    }
  }

  const finishY =
    screenYForWorldDistance(track.length);

  if (
    finishY > -80 &&
    finishY < height + 80
  ) {
    drawCheckeredLine(
      ctx,
      finishY,
      'LINHA DE CHEGADA',
    );
  }

  for (const rival of state.rivals) {
    const y = rivalScreenY(rival);

    if (
      y < -130 ||
      y > height + 130
    ) {
      continue;
    }

    drawCar(
      ctx,
      rival.x,
      y,
      rival.color,
      0.9,
      Math.max(
        -0.12,
        Math.min(
          0.12,
          rival.pushVelocity / 900,
        ),
      ),
    );
  }

  const color =
    state.car === 'red'
      ? '#ff405d'
      : state.car === 'purple'
        ? '#8f4dff'
        : '#42a5ff';

  drawCar(
    ctx,
    state.player.x,
    state.player.y,
    color,
    1,
    state.player.angle,
  );

  drawImpacts(ctx);

  ctx.restore();
}

function drawCar(ctx, x, y, color, scale = 1, angle = 0) {
  ctx.save();

  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);

  ctx.fillStyle = 'rgba(0,0,0,.34)';
  ctx.beginPath();
  ctx.ellipse(
    0,
    8,
    31,
    43,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  ctx.fillStyle = color;
  ctx.shadowBlur = 18;
  ctx.shadowColor = color;

  ctx.beginPath();
  ctx.roundRect(
    -23,
    -40,
    46,
    80,
    12,
  );
  ctx.fill();

  ctx.shadowBlur = 0;

  ctx.fillStyle = '#111827';
  ctx.beginPath();
  ctx.roundRect(
    -16,
    -27,
    32,
    28,
    7,
  );
  ctx.fill();

  ctx.fillStyle = '#080a0f';

  [-28, 21].forEach((wx) => {
    ctx.fillRect(
      wx,
      -25,
      7,
      17,
    );

    ctx.fillRect(
      wx,
      18,
      7,
      17,
    );
  });

  ctx.fillStyle = '#fff49a';
  ctx.fillRect(-15, -37, 9, 4);
  ctx.fillRect(6, -37, 9, 4);

  ctx.fillStyle = '#ff425f';
  ctx.fillRect(-15, 34, 9, 3);
  ctx.fillRect(6, 34, 9, 3);

  ctx.restore();
}

$('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();

  const player = $('playerName').value.trim();
  const password = $('playerPassword').value;
  const endpoint = state.createMode ? '/register' : '/login';

  setStatus(
    state.createMode
      ? 'Criando usuário...'
      : 'Entrando...',
  );

  try {
    const result = await api(
      endpoint,
      {
        method: 'POST',
        body: JSON.stringify({
          player,
          password,
        }),
      },
      false,
    );

    state.token = result.token;
    localStorage.setItem(
      'neonApexToken',
      state.token,
    );

    syncPayload(result);

    const cars = await api('/cars');
    state.cars = cars.cars || [];
    state.ownedCars = cars.ownedCars || state.ownedCars;

    if (!ownsCar(state.car)) state.car = 'red';

    updateProfileUI();
    renderGarage();
    renderTracks();

    setStatus(
      'Conta conectada.',
      'success',
    );

    showView('mainView');
  } catch (error) {
    setStatus(
      error.message,
      'error',
    );
  }
});

$('toggleCreateModeButton').addEventListener('click', () => {
  state.createMode = !state.createMode;

  $('loginTitle').textContent =
    state.createMode
      ? 'CRIAR USUÁRIO'
      : 'FAÇA SEU LOGIN';

  $('authEyebrow').textContent =
    state.createMode
      ? 'NOVO PILOTO'
      : 'ACESSO AO GRID';

  $('submitLoginButton').innerHTML =
    state.createMode
      ? 'CRIAR E ENTRAR <span>↗</span>'
      : 'ENTRAR <span>↗</span>';

  $('toggleCreateModeButton').textContent =
    state.createMode
      ? 'VOLTAR AO LOGIN'
      : 'CRIAR USUÁRIO';

  setStatus(
    state.createMode
      ? 'Todo novo piloto começa com o VOLT R.'
      : 'Somente contas salvas no banco podem acessar.',
  );
});

$('carGrid').addEventListener('click', async (event) => {
  const buyButton = event.target.closest('[data-buy-car]');
  const selectButton = event.target.closest('[data-select-car]');

  if (buyButton) {
    const carKey = buyButton.dataset.buyCar;

    buyButton.disabled = true;
    const original = buyButton.textContent;
    buyButton.textContent = 'COMPRANDO...';

    try {
      const data = await api('/car/buy', {
        method: 'POST',
        body: JSON.stringify({ car: carKey }),
      });

      syncPayload(data);
      state.car = data.purchasedCar || carKey;

      updateProfileUI();
      renderGarage();
    } catch (error) {
      buyButton.disabled = false;
      buyButton.textContent = error.message;

      setTimeout(() => {
        if (buyButton.isConnected) {
          buyButton.textContent = original;
        }
      }, 1800);
    }

    return;
  }

  if (selectButton) {
    const carKey = selectButton.dataset.selectCar;

    selectButton.disabled = true;
    const original = selectButton.textContent;
    selectButton.textContent = 'SELECIONANDO...';

    try {
      const data = await api('/profile/car', {
        method: 'POST',
        body: JSON.stringify({ car: carKey }),
      });

      syncPayload(data);
      state.car = carKey;

      updateProfileUI();
      renderGarage();
    } catch (error) {
      selectButton.disabled = false;
      selectButton.textContent = error.message;

      setTimeout(() => {
        if (selectButton.isConnected) {
          selectButton.textContent = original;
        }
      }, 1600);
    }
  }
});

$('upgradePanel').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-upgrade-stat]');
  if (!button) return;

  const stat = button.dataset.upgradeStat;

  button.disabled = true;

  const original = button.textContent;
  button.textContent = 'PROCESSANDO...';

  try {
    const data = await api('/upgrade', {
      method: 'POST',
      body: JSON.stringify({
        car: state.car,
        stat,
      }),
    });

    syncPayload(data);

    updateProfileUI();
    renderGarage();
  } catch (error) {
    button.disabled = false;
    button.textContent = error.message;

    setTimeout(() => {
      if (button.isConnected) {
        button.textContent = original;
      }
    }, 1600);
  }
});

$('trackGrid').addEventListener('click', (event) => {
  const card = event.target.closest('.track-card');
  if (!card) return;

  state.track = card.dataset.track;

  localStorage.setItem(
    'neonApexTrack',
    state.track,
  );

  renderTracks();
  updateProfileUI();
});

$('menuPlayButton').addEventListener('click', startRace);
$('startButton').addEventListener('click', startRace);
$('restartButton').addEventListener('click', startRace);
$('raceAgainButton').addEventListener('click', startRace);

$('backGarageButton').addEventListener('click', () => {
  leaveRace('garageView');
});

$('resultGarageButton').addEventListener('click', () => {
  showView('garageView');
});

$('resultMenuButton').addEventListener('click', () => {
  showView('mainView');
});

$('menuGarageButton').addEventListener('click', () => {
  renderTracks();
  renderGarage();
  showView('garageView');
});

$('menuProfileButton').addEventListener('click', async () => {
  try {
    await refreshProfile();
  } catch {
    // Mantém a última informação conhecida.
  }

  showView('profileView');
});

$('menuRankingButton').addEventListener('click', async () => {
  showView('rankingView');
  await fetchLeaderboard('rankingRows');
});

document
  .querySelectorAll('[data-back-main]')
  .forEach((button) => {
    button.addEventListener('click', () => {
      showView('mainView');
    });
  });

document
  .querySelectorAll('.logout-button')
  .forEach((button) => {
    button.addEventListener('click', async () => {
      stopRaceLoop();

      try {
        if (state.token) {
          await api('/logout', {
            method: 'POST',
          });
        }
      } catch {
        // Sessão pode já ter expirado.
      }

      clearSession();
      $('playerPassword').value = '';
      showView('loginView');
      setStatus('Sessão encerrada.');
    });
  });

window.addEventListener('keydown', (event) => {
  if (state.currentView !== 'raceView') return;

  const key =
    event.key.length === 1
      ? event.key.toLowerCase()
      : event.key;

  if (
    [
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      ' ',
      'Shift',
    ].includes(event.key)
  ) {
    event.preventDefault();
  }

  state.keys.add(key);
});

window.addEventListener('keyup', (event) => {
  const key =
    event.key.length === 1
      ? event.key.toLowerCase()
      : event.key;

  state.keys.delete(key);
});

const activeTouchPointers = new Map();

function releaseTouchPointer(pointerId) {
  const entry = activeTouchPointers.get(pointerId);
  if (!entry) return;

  activeTouchPointers.delete(pointerId);
  entry.button.classList.remove('pressed');

  const stillActive = [...activeTouchPointers.values()]
    .some((item) => item.control === entry.control);

  if (!stillActive) state.keys.delete(entry.control);
}

$('touchControls')
  .querySelectorAll('button')
  .forEach((button) => {
    const control = button.dataset.control;

    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();

      try {
        button.setPointerCapture(event.pointerId);
      } catch {
        // Alguns navegadores móveis não implementam pointer capture.
      }

      activeTouchPointers.set(event.pointerId, {
        button,
        control,
      });

      button.classList.add('pressed');
      state.keys.add(control);
    });

    const release = (event) => {
      event.preventDefault();
      releaseTouchPointer(event.pointerId);
    };

    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
    button.addEventListener('contextmenu', (event) => event.preventDefault());
  });

window.addEventListener('blur', () => {
  state.keys.clear();
  activeTouchPointers.clear();

  document
    .querySelectorAll('.touch-button.pressed')
    .forEach((button) => button.classList.remove('pressed'));
});

window.addEventListener('resize', updateOrientationHint);
window.addEventListener('orientationchange', () => {
  setTimeout(updateOrientationHint, 120);
});

document.addEventListener('touchmove', (event) => {
  if (state.currentView === 'raceView') {
    event.preventDefault();
  }
}, { passive: false });

async function toggleFullscreen() {
  const root = document.documentElement;
  const fullscreenElement =
    document.fullscreenElement ||
    document.webkitFullscreenElement;

  try {
    if (!fullscreenElement) {
      const request =
        root.requestFullscreen ||
        root.webkitRequestFullscreen;

      if (request) {
        await request.call(root);

        if (
          isTouchDevice() &&
          screen.orientation &&
          typeof screen.orientation.lock === 'function'
        ) {
          try {
            await screen.orientation.lock('landscape');
          } catch {
            // Rotação continua manual quando o navegador não permite bloquear.
          }
        }
      }
    } else {
      const exit =
        document.exitFullscreen ||
        document.webkitExitFullscreen;

      if (exit) await exit.call(document);
    }
  } catch {
    // Tela cheia é opcional e varia entre navegadores.
  }
}

$('fullscreenButton').addEventListener('click', toggleFullscreen);

function updateFullscreenLabel() {
  const button = $('fullscreenButton');
  if (!button) return;

  const active = Boolean(
    document.fullscreenElement ||
    document.webkitFullscreenElement
  );

  button.textContent = active
    ? 'sair da tela cheia ⛶'
    : 'tela cheia ⛶';
}

document.addEventListener('fullscreenchange', updateFullscreenLabel);
document.addEventListener('webkitfullscreenchange', updateFullscreenLabel);

(async function boot() {
  renderTracks();

  if (!state.token) {
    showView('loginView');
    return;
  }

  try {
    await refreshProfile();
    showView('mainView');
  } catch {
    clearSession();
    showView('loginView');
    setStatus('Entre novamente para continuar.');
  }
})();
