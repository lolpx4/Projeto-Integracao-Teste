const $ = (id) => document.getElementById(id);
const views = ['loginView', 'mainView', 'garageView', 'raceView', 'profileView', 'rankingView', 'resultView'];
const TRACK_LENGTH = 1800;
const LAP_LENGTH = TRACK_LENGTH / 3;
const ROAD = { left: 220, right: 780, center: 500 };

const state = {
  token: localStorage.getItem('neonApexToken') || '',
  profile: null,
  cars: [],
  car: 'red',
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
  player: { x: 500, y: 525, angle: 0 },
  rivals: [],
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

function selectedCar() {
  return state.cars.find((car) => car.key === state.car) || state.cars[0] || {
    key: 'red', name: 'VOLT R', speed: 90, acceleration: 84, braking: 77, handling: 72, nitro: 80,
  };
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
  $('profileName').textContent = p.player.toUpperCase();
  $('profileLevel').textContent = p.level;
  $('profileXp').textContent = formatNumber(p.xp);
  $('profileCoins').textContent = formatNumber(p.coins);
  $('profileRaces').textContent = p.races;
  $('profileBest').textContent = p.bestTime == null ? '—' : formatTime(p.bestTime);
  $('profileCar').textContent = car?.name || 'VOLT R';
  $('selectedCarName').textContent = car?.name || 'VOLT R';
}

function renderGarage() {
  const grid = $('carGrid');
  grid.replaceChildren();
  state.cars.forEach((car, index) => {
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
    [['VEL', car.speed], ['ACEL', car.acceleration], ['FREIO', car.braking], ['CTRL', car.handling], ['NITRO', car.nitro]].forEach(([label, value]) => {
      const line = document.createElement('div');
      const name = document.createElement('span'); name.textContent = label;
      const meter = document.createElement('i'); const fill = document.createElement('b'); fill.style.width = `${value}%`; meter.appendChild(fill);
      const amount = document.createElement('strong'); amount.textContent = value;
      line.append(name, meter, amount); stats.appendChild(line);
    });

    button.append(number, check, visual, title, sub, stats);
    grid.appendChild(button);
  });
}

async function refreshProfile() {
  const data = await api('/profile');
  state.profile = data.profile;
  state.cars = data.cars || state.cars;
  state.car = state.profile.selectedCar || 'red';
  updateProfileUI();
  renderGarage();
}

async function fetchLeaderboard(target = 'leaderboardRows') {
  const container = $(target);
  container.replaceChildren();
  try {
    const data = await api('/leaderboard', {}, false);
    if (!data.scores?.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-row';
      empty.textContent = 'Ainda não há tempos registrados.';
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
  return {
    maxSpeed: car.speed * 3.18,
    acceleration: car.acceleration * 1.05,
    braking: car.braking * 1.55,
    handling: 210 + car.handling * 1.9,
    nitroTopMultiplier: 1.13 + car.nitro / 600,
  };
}

function setupRivals() {
  state.rivals = [
    { x: 350, y: 245, speed: 205, color: '#efa83e' },
    { x: 500, y: 115, speed: 225, color: '#b86df1' },
    { x: 650, y: 360, speed: 190, color: '#d7ff45' },
  ];
}

function resetRaceState() {
  state.elapsed = 0;
  state.distance = 0;
  state.trackScroll = 0;
  state.speed = 0;
  state.nitro = 100;
  state.player = { x: 500, y: 525, angle: 0 };
  state.keys.clear();
  state.raceId = '';
  setupRivals();
  $('timer').textContent = '00:00.000';
  $('speedValue').textContent = '000';
  $('lapNumber').textContent = '01';
  $('nitroValue').textContent = '100';
  $('nitroBar').style.width = '100%';
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
  try { await api('/race/cancel', { method: 'POST', body: JSON.stringify({ raceId }) }); } catch { /* corrida já pode estar encerrada */ }
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
      await sleep(650);
    }
    if (generation !== state.raceGeneration) return;
    $('countdown').textContent = 'VAI!';
    const race = await api('/race/start', { method: 'POST', body: JSON.stringify({ car: state.car }) });
    if (generation !== state.raceGeneration) return;
    state.raceId = race.raceId;
    state.running = true;
    state.startedAt = performance.now();
    state.lastFrame = state.startedAt;
    state.animation = requestAnimationFrame(updateRace);
    await sleep(450);
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
      state.speed = Math.min(state.speed, Math.max(40, rival.speed * 0.78));
    } else {
      const direction = state.player.x < rival.x ? -1 : 1;
      state.player.x += direction * (overlapX + 3);
      state.player.x = Math.max(minX, Math.min(maxX, state.player.x));
      state.speed = Math.max(0, state.speed - 55 * dt);
    }
    state.nitro = Math.max(0, state.nitro - 7);
  }
}

function updateRace(timestamp) {
  if (!state.running) return;
  const dt = Math.min(0.033, Math.max(0.001, (timestamp - state.lastFrame) / 1000));
  state.lastFrame = timestamp;
  state.elapsed = timestamp - state.startedAt;

  const car = selectedCar();
  const physics = physicsFor(car);
  const accelerating = state.keys.has('ArrowUp') || state.keys.has('w') || state.keys.has('up');
  const braking = state.keys.has('ArrowDown') || state.keys.has('s') || state.keys.has('brake');
  const left = state.keys.has('ArrowLeft') || state.keys.has('a') || state.keys.has('left');
  const right = state.keys.has('ArrowRight') || state.keys.has('d') || state.keys.has('right');
  const nitroPressed = state.keys.has('Shift') || state.keys.has('nitro');
  const usingNitro = nitroPressed && state.nitro > 0.5 && accelerating;
  const topSpeed = physics.maxSpeed * (usingNitro ? physics.nitroTopMultiplier : 1);

  if (accelerating) state.speed += physics.acceleration * (usingNitro ? 1.24 : 1) * dt;
  else state.speed -= 24 * dt;
  if (braking) state.speed -= physics.braking * dt;
  state.speed = Math.max(0, Math.min(topSpeed, state.speed));

  if (usingNitro) state.nitro = Math.max(0, state.nitro - 28 * dt);
  else state.nitro = Math.min(100, state.nitro + 5 * dt);

  let steering = 0;
  if (left) steering -= 1;
  if (right) steering += 1;
  const steeringScale = 0.65 + Math.min(1, state.speed / 160) * 0.35;
  const proposedX = state.player.x + steering * physics.handling * steeringScale * dt;
  state.player.angle += ((steering * 0.08) - state.player.angle) * Math.min(1, dt * 10);

  const speedRatio = Math.min(1, state.speed / Math.max(1, physics.maxSpeed));
  const targetY = 532 - speedRatio * 68 + (braking ? 14 : 0);
  state.player.y += (targetY - state.player.y) * Math.min(1, dt * 4.5);

  state.distance += (state.speed / 3.6) * dt;
  state.trackScroll += state.speed * 0.78 * dt;

  state.rivals.forEach((rival) => {
    rival.y += (state.speed - rival.speed) * 0.52 * dt;
    if (rival.y > 730) {
      rival.y = -120 - Math.random() * 180;
      rival.x = [350, 500, 650][Math.floor(Math.random() * 3)];
      rival.speed = 180 + Math.random() * 70;
    } else if (rival.y < -180) {
      rival.y = 700 + Math.random() * 80;
      rival.x = [350, 500, 650][Math.floor(Math.random() * 3)];
      rival.speed = 170 + Math.random() * 60;
    }
  });

  resolveCollisions(proposedX, dt);

  $('timer').textContent = formatTime(state.elapsed);
  $('speedValue').textContent = Math.round(state.speed).toString().padStart(3, '0');
  $('lapNumber').textContent = Math.min(3, Math.floor(state.distance / LAP_LENGTH) + 1).toString().padStart(2, '0');
  $('nitroValue').textContent = Math.round(state.nitro);
  $('nitroBar').style.width = `${state.nitro}%`;

  drawTrack();

  if (state.distance >= TRACK_LENGTH) finishRace();
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
  $('resultCopy').textContent = 'Validando o tempo no servidor...';
  showView('resultView');

  try {
    const result = await api('/race/finish', { method: 'POST', body: JSON.stringify({ raceId: state.raceId }) });
    state.raceId = '';
    state.profile = result.profile;
    updateProfileUI();
    $('resultTime').textContent = formatTime(result.time);
    $('resultCopy').textContent = `+${formatNumber(result.rewards.coins)} moedas · +${formatNumber(result.rewards.xp)} XP · resultado salvo no banco.`;
  } catch (error) {
    $('resultCopy').textContent = `Resultado não publicado: ${error.message}`;
  }
  await fetchLeaderboard('leaderboardRows');
}

function drawTrack() {
  const canvas = $('raceCanvas');
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);

  const scroll = state.trackScroll;
  ctx.fillStyle = '#08111d'; ctx.fillRect(0, 0, width, height);

  // Cidade lateral com parallax.
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

  ctx.fillStyle = '#2c3039'; ctx.fillRect(ROAD.left, 0, ROAD.right - ROAD.left, height);
  ctx.fillStyle = '#151a24'; ctx.fillRect(0, 0, ROAD.left, height); ctx.fillRect(ROAD.right, 0, width - ROAD.right, height);

  // Faixas laterais móveis deixam claro que a pista está passando sob os carros.
  for (let i = -2; i < 12; i += 1) {
    const y = ((i * 72 + scroll * 1.35) % (height + 144)) - 72;
    ctx.fillStyle = i % 2 ? '#1de3ff' : '#ff4fd8';
    ctx.fillRect(ROAD.left - 8, y, 8, 42);
    ctx.fillRect(ROAD.right, y, 8, 42);
  }

  ctx.strokeStyle = 'rgba(255,255,255,.38)'; ctx.lineWidth = 4; ctx.setLineDash([38, 42]); ctx.lineDashOffset = scroll * 1.8;
  [ROAD.left + (ROAD.right - ROAD.left) / 3, ROAD.left + (ROAD.right - ROAD.left) * 2 / 3].forEach((x) => {
    ctx.beginPath(); ctx.moveTo(x, -80); ctx.lineTo(x, height + 80); ctx.stroke();
  });
  ctx.setLineDash([]);

  // Reflexos/luzes no asfalto também acompanham o scroll.
  for (let i = 0; i < 10; i += 1) {
    const y = ((i * 115 + scroll * 1.05) % (height + 130)) - 90;
    ctx.fillStyle = i % 2 ? 'rgba(29,227,255,.06)' : 'rgba(255,79,216,.05)';
    ctx.fillRect(ROAD.left + 25, y, ROAD.right - ROAD.left - 50, 18);
  }

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
    const cars = await api('/cars');
    state.cars = cars.cars || [];
    state.car = state.profile.selectedCar || 'red';
    updateProfileUI(); renderGarage();
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
  try {
    const data = await api('/profile/car', { method: 'POST', body: JSON.stringify({ car: state.car }) });
    state.profile = data.profile; updateProfileUI();
  } catch (error) { console.error(error); }
});

$('menuPlayButton').addEventListener('click', startRace);
$('startButton').addEventListener('click', startRace);
$('restartButton').addEventListener('click', startRace);
$('raceAgainButton').addEventListener('click', startRace);
$('backGarageButton').addEventListener('click', () => leaveRace('garageView'));
$('resultGarageButton').addEventListener('click', () => showView('garageView'));
$('resultMenuButton').addEventListener('click', () => showView('mainView'));
$('menuGarageButton').addEventListener('click', () => showView('garageView'));
$('menuProfileButton').addEventListener('click', async () => { try { await refreshProfile(); } catch {} showView('profileView'); });
$('menuRankingButton').addEventListener('click', async () => { showView('rankingView'); await fetchLeaderboard('rankingRows'); });
document.querySelectorAll('[data-back-main]').forEach((button) => button.addEventListener('click', () => showView('mainView')));

document.querySelectorAll('.logout-button').forEach((button) => button.addEventListener('click', async () => {
  stopRaceLoop();
  try { if (state.token) await api('/logout', { method: 'POST' }); } catch { /* sessão já pode ter expirado */ }
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
