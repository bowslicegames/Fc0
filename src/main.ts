import './style.css';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildStadium } from './world/stadium';
import { buildPitch } from './world/pitch';
import { Footballer, type KitConfig } from './entities/footballer';
import { Ball } from './entities/ball';
import { Input } from './input';
import { TouchControls } from './touch';
import { CameraRig } from './camera';
import { TEAMS, squadKits, type Team } from './teams';

const RUN_SPEED = 5.5;
const SPRINT_SPEED = 8.9;
const AI_SUPPORT_SPEED = 4;
const AI_CHASE_SPEED = 5.6;
const FIELD_X = 52.2;
const FIELD_Z = 33.8;

/* ----------------------------- device tier ----------------------------- */

const isTouch = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
const PIXEL_CAP = isTouch ? 1.6 : 2;
document.body.classList.toggle('touch', isTouch);

/* ----------------------------- renderer ----------------------------- */

const container = document.getElementById('app')!;
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, PIXEL_CAP));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = isTouch ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
pmrem.dispose();

const rig = new CameraRig(window.innerWidth / window.innerHeight);
const input = new Input(renderer.domElement);
new TouchControls(input);

buildStadium(scene, isTouch ? 1024 : 2048);
buildPitch(scene, isTouch ? 14000 : 32000);

const ball = new Ball();
scene.add(ball.mesh);

/* ----------------------------- squad state ----------------------------- */

/** Formation anchors, matching the player order in teams.ts. */
const ANCHORS: [number, number][] = [
  [0, 0],
  [-9, -14],
  [-9, 14],
  [-18, 0],
  [-30, 0],
];

interface Member {
  footballer: Footballer;
  kit: KitConfig;
  home: THREE.Vector3;
  velocity: THREE.Vector3;
  heading: number;
  stamina: number;
  touchCooldown: number;
}

let members: Member[] = [];
let active = 0;
let currentTeam: Team = TEAMS[0];
let score = 0;
let stamina = 100;
let resetTimer = 0;
let shotCooldown = 0;
let paused = true;
let started = false;
let flashTimer: number | undefined;

const START_HEADING = Math.PI / 2;

/* ----------------------------- HUD wiring ----------------------------- */

const el = {
  speedValue: document.getElementById('speed-value')!,
  speedFill: document.getElementById('speed-fill')!,
  staminaValue: document.getElementById('stamina-value')!,
  staminaFill: document.getElementById('stamina-fill')!,
  score: document.getElementById('score-value')!,
  chip: document.getElementById('state-chip')!,
  flash: document.getElementById('goal-flash')!,
  name: document.getElementById('player-name')!,
  num: document.getElementById('player-num')!,
  teamName: document.getElementById('score-team')!,
  crest: document.getElementById('score-crest')!,
  loading: document.getElementById('loading')!,
  overlay: document.getElementById('team-select')!,
  grid: document.getElementById('team-grid')!,
  kickoff: document.getElementById('kickoff')!,
  clubs: document.getElementById('open-teams')!,
};

function showGoal() {
  score += 1;
  el.score.textContent = String(score);
  el.flash.classList.add('show');
  window.clearTimeout(flashTimer);
  flashTimer = window.setTimeout(() => el.flash.classList.remove('show'), 1500);
  resetTimer = 2.1;
}

function updateTeamHud(team: Team) {
  el.teamName.textContent = team.name;
  el.crest.style.background = `linear-gradient(150deg, ${team.kit.shirt}, ${team.kit.trim})`;
}

function updatePlayerCard(m: Member) {
  el.name.textContent = m.kit.name;
  el.num.textContent = String(m.kit.number);
  stamina = m.stamina;
}

/* ----------------------------- squads ----------------------------- */

function clearSquad() {
  for (const m of members) {
    scene.remove(m.footballer.group);
    m.footballer.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) mat.dispose();
    });
  }
  members = [];
}

function resetBall() {
  ball.position.set(1.9, 0.11, 0.15);
  ball.velocity.set(0, 0, 0);
  ball.scored = false;
  ball.mesh.position.copy(ball.position);
}

function buildSquad(team: Team) {
  clearSquad();
  squadKits(team).forEach((kit, i) => {
    const footballer = new Footballer(kit);
    const [x, z] = ANCHORS[i];
    footballer.group.position.set(x, 0, z);
    footballer.group.rotation.y = START_HEADING;
    scene.add(footballer.group);
    members.push({
      footballer,
      kit,
      home: new THREE.Vector3(x, 0, z),
      velocity: new THREE.Vector3(),
      heading: START_HEADING,
      stamina: 100,
      touchCooldown: 0,
    });
  });
  active = 0;
  resetBall();
  rig.snap(members[0].footballer.group.position, START_HEADING);
  el.speedValue.innerHTML = '0.0 <em>km/h</em>';
  el.speedFill.style.width = '0%';
  updatePlayerCard(members[0]);
}

function selectTeam(team: Team) {
  currentTeam = team;
  score = 0;
  el.score.textContent = '0';
  buildSquad(team);
  updateTeamHud(team);
  for (const card of el.grid.querySelectorAll<HTMLElement>('.team-card')) {
    card.classList.toggle('selected', card.dataset.id === team.id);
  }
}

/* ----------------------------- team select UI ----------------------------- */

function buildTeamCards() {
  el.grid.innerHTML = TEAMS.map(
    (t) => `
      <button class="team-card${t.id === currentTeam.id ? ' selected' : ''}" data-id="${t.id}" type="button">
        <span class="team-crest" style="--shirt:${t.kit.shirt};--trim:${t.kit.trim}"></span>
        <span class="team-name">${t.name}</span>
        <span class="team-meta">OVR ${t.rating} · ${t.code}</span>
        <span class="team-kit">
          <i style="background:${t.kit.shirt}"></i>
          <i style="background:${t.kit.shorts}"></i>
          <i style="background:${t.kit.socks}"></i>
        </span>
      </button>`,
  ).join('');
}

el.grid.addEventListener('click', (e) => {
  const card = (e.target as HTMLElement).closest<HTMLElement>('.team-card');
  const id = card?.dataset.id;
  const team = TEAMS.find((t) => t.id === id);
  if (team) selectTeam(team);
});

el.kickoff.addEventListener('click', () => {
  el.overlay.classList.remove('open');
  paused = false;
  clock.getDelta();
});

el.clubs.addEventListener('click', () => {
  paused = true;
  el.overlay.classList.add('open');
});

/* ----------------------------- switching ----------------------------- */

function switchPlayer() {
  if (members.length < 2) return;
  let next = -1;
  let bestD = Infinity;
  for (let i = 0; i < members.length; i++) {
    if (i === active) continue;
    const p = members[i].footballer.group.position;
    const dx = p.x - ball.position.x;
    const dz = p.z - ball.position.z;
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      bestD = d;
      next = i;
    }
  }
  if (next < 0) return;

  active = next;
  const m = members[active];
  const p = m.footballer.group.position;
  m.heading = Math.atan2(ball.position.x - p.x, ball.position.z - p.z);
  m.footballer.group.rotation.y = m.heading;
  m.velocity.set(0, 0, 0);
  rig.snap(p, m.heading);
  updatePlayerCard(m);
}

/* ----------------------------- simulation ----------------------------- */

function wrapAngle(a: number) {
  return (((a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
}

const moveDir = new THREE.Vector3();
const kickDir = new THREE.Vector3();

function updateActive(dt: number) {
  const m = members[active];
  if (!m) return;

  const p = m.footballer.group.position;
  const axis = input.axis();
  const camYaw = rig.yaw;
  const rightX = -Math.cos(camYaw);
  const rightZ = Math.sin(camYaw);

  moveDir.set(Math.sin(camYaw) * axis.y + rightX * axis.x, 0, Math.cos(camYaw) * axis.y + rightZ * axis.x);
  const inputMag = Math.min(1, moveDir.length());
  const moving = inputMag > 0.06;
  if (moving) moveDir.normalize();

  const sprintHeld = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
  const wantsSprint = sprintHeld && moving && m.stamina > 1;
  const topSpeed = wantsSprint ? SPRINT_SPEED : RUN_SPEED;
  const targetSpeed = moving ? topSpeed * Math.max(0.5, inputMag) : 0;

  const accel = 1 - Math.exp(-dt * (wantsSprint ? 7 : 10));
  m.velocity.x += (moveDir.x * targetSpeed - m.velocity.x) * accel;
  m.velocity.z += (moveDir.z * targetSpeed - m.velocity.z) * accel;
  if (!moving) {
    const decel = Math.exp(-dt * 12);
    m.velocity.x *= decel;
    m.velocity.z *= decel;
    if (m.velocity.length() < 0.04) m.velocity.set(0, 0, 0);
  }

  const speed = m.velocity.length();
  let turnRate = 0;
  if (speed > 0.35) {
    const targetHeading = Math.atan2(m.velocity.x, m.velocity.z);
    const diff = wrapAngle(targetHeading - m.heading);
    const maxStep = (9 + speed * 0.6) * dt;
    const step = THREE.MathUtils.clamp(diff, -maxStep, maxStep);
    m.heading += step;
    turnRate = step / Math.max(dt, 0.0001);
  } else {
    turnRate *= Math.exp(-dt * 8);
  }

  m.footballer.group.rotation.y = m.heading;
  p.x = THREE.MathUtils.clamp(p.x + m.velocity.x * dt, -FIELD_X, FIELD_X);
  p.z = THREE.MathUtils.clamp(p.z + m.velocity.z * dt, -FIELD_Z, FIELD_Z);

  if (wantsSprint && speed > 2) m.stamina = Math.max(0, m.stamina - dt * 17);
  else m.stamina = Math.min(100, m.stamina + dt * (speed < 0.5 ? 20 : 9));

  const faceX = Math.sin(m.heading);
  const faceZ = Math.cos(m.heading);

  m.footballer.update(dt, {
    speed,
    maxSpeed: SPRINT_SPEED,
    forwardSpeed: m.velocity.x * faceX + m.velocity.z * faceZ,
    turn: turnRate,
    moving,
  });

  // assisted dribbling: the ball is carried in front of the player
  const dx = ball.position.x - p.x;
  const dz = ball.position.z - p.z;
  const dist = Math.hypot(dx, dz);
  if (speed > 0.2 && shotCooldown <= 0 && dist < 2.6 && dist > 0.001 && ball.position.y < 0.8) {
    const facingDot = (dx * faceX + dz * faceZ) / dist;
    if (facingDot > -0.55) {
      const carry = 0.55 + Math.min(speed, SPRINT_SPEED) * 0.05;
      const errX = p.x + faceX * carry - ball.position.x;
      const errZ = p.z + faceZ * carry - ball.position.z;
      // only push the ball forward once it is level with the feet; a ball that is
      // already ahead is left to friction so the run catches up to it naturally
      const along = errX * faceX + errZ * faceZ;
      if (along < 0) {
        const spring = 7.5;
        let targetVX = m.velocity.x + errX * spring;
        let targetVZ = m.velocity.z + errZ * spring;

        // a correction that is too large would look like a rocket first touch
        const extraX = targetVX - m.velocity.x;
        const extraZ = targetVZ - m.velocity.z;
        const extra = Math.hypot(extraX, extraZ);
        const maxExtra = 6.2;
        if (extra > maxExtra) {
          targetVX = m.velocity.x + (extraX / extra) * maxExtra;
          targetVZ = m.velocity.z + (extraZ / extra) * maxExtra;
        }

        const blend = 1 - Math.exp(-dt * 18);
        ball.velocity.x += (targetVX - ball.velocity.x) * blend;
        ball.velocity.z += (targetVZ - ball.velocity.z) * blend;
      }
    }
  }

  // shooting
  if (input.justPressed('Space') && dist < 1.9) {
    kickDir.set(faceX, 0, faceZ);
    ball.kick(kickDir, 20 + m.stamina * 0.03, 2.1);
    shotCooldown = 0.45;
  }

  rig.update(dt, p, m.heading, Math.min(1, speed / SPRINT_SPEED), input);

  stamina = m.stamina;
  el.speedValue.innerHTML = `${(speed * 3.6).toFixed(1)} <em>km/h</em>`;
  el.speedFill.style.width = `${Math.min(100, (speed / SPRINT_SPEED) * 100)}%`;
  el.staminaValue.textContent = String(Math.round(stamina));
  el.staminaFill.style.width = `${stamina}%`;
  el.staminaFill.classList.toggle('low', stamina < 30);
  el.chip.textContent = wantsSprint && speed > 6 ? 'SPRINTING' : speed > 0.6 ? 'JOGGING' : 'READY';
}

/** Team-mates hold their shape, and the closest one presses a loose ball. */
function updateTeammates(dt: number) {
  const activePos = members[active].footballer.group.position;
  const ballToActive = Math.hypot(ball.position.x - activePos.x, ball.position.z - activePos.z);
  const loose = ballToActive > 2.3;

  let chaser = -1;
  let chaserDist = Infinity;
  if (loose) {
    for (let i = 0; i < members.length; i++) {
      if (i === active) continue;
      const p = members[i].footballer.group.position;
      const d = Math.hypot(p.x - ball.position.x, p.z - ball.position.z);
      if (d < chaserDist) {
        chaserDist = d;
        chaser = i;
      }
    }
  }

  for (let i = 0; i < members.length; i++) {
    if (i === active) continue;
    const m = members[i];
    const p = m.footballer.group.position;
    m.touchCooldown = Math.max(0, m.touchCooldown - dt);

    const chasing = i === chaser && chaserDist < 26;
    moveAI(m, chasing ? ball.position : m.home, chasing ? AI_CHASE_SPEED : AI_SUPPORT_SPEED, dt);

    if (chasing && m.touchCooldown <= 0 && ball.position.y < 0.7) {
      const d = Math.hypot(p.x - ball.position.x, p.z - ball.position.z);
      if (d < 0.95) {
        const ax = activePos.x - ball.position.x;
        const az = activePos.z - ball.position.z;
        const len = Math.hypot(ax, az) || 1;
        ball.velocity.x = (ax / len) * 7.2;
        ball.velocity.z = (az / len) * 7.2;
        ball.velocity.y = 0.7;
        m.touchCooldown = 1.1;
      }
    }
  }
}

function moveAI(m: Member, target: THREE.Vector3, maxSpeed: number, dt: number) {
  const p = m.footballer.group.position;
  let dx = target.x - p.x;
  let dz = target.z - p.z;
  const dist = Math.hypot(dx, dz);

  let desiredX = 0;
  let desiredZ = 0;
  if (dist > 0.7) {
    dx /= dist;
    dz /= dist;
    const scale = Math.min(1, (dist - 0.7) / 3);
    desiredX = dx * maxSpeed * scale;
    desiredZ = dz * maxSpeed * scale;
  }

  const k = 1 - Math.exp(-dt * 9);
  m.velocity.x += (desiredX - m.velocity.x) * k;
  m.velocity.z += (desiredZ - m.velocity.z) * k;
  p.x = THREE.MathUtils.clamp(p.x + m.velocity.x * dt, -FIELD_X, FIELD_X);
  p.z = THREE.MathUtils.clamp(p.z + m.velocity.z * dt, -FIELD_Z, FIELD_Z);

  const speed = Math.hypot(m.velocity.x, m.velocity.z);
  let turnRate = 0;
  if (speed > 0.3) {
    const targetHeading = Math.atan2(m.velocity.x, m.velocity.z);
    const diff = wrapAngle(targetHeading - m.heading);
    const step = THREE.MathUtils.clamp(diff, -(8 + speed) * dt, (8 + speed) * dt);
    m.heading += step;
    turnRate = step / Math.max(dt, 0.0001);
    m.footballer.group.rotation.y = m.heading;
  }

  m.footballer.update(dt, {
    speed,
    maxSpeed: SPRINT_SPEED,
    forwardSpeed: speed,
    turn: turnRate,
    moving: speed > 0.25,
  });

  if (speed < 0.35) m.footballer.lookAt(ball.position);
}

/* ----------------------------- loop ----------------------------- */

const clock = new THREE.Clock();

buildTeamCards();
buildSquad(currentTeam);
updateTeamHud(currentTeam);

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);

  if (!paused) {
    if (input.justPressed('KeyQ') || input.justPressed('Tab')) switchPlayer();
    shotCooldown = Math.max(0, shotCooldown - dt);

    updateActive(dt);
    updateTeammates(dt);

    const event = ball.update(dt);
    if (event === 'goal') showGoal();

    if (resetTimer > 0) {
      resetTimer -= dt;
      if (resetTimer <= 0) ball.reset();
    }
  }

  renderer.render(scene, rig.camera);

  if (!started) {
    started = true;
    window.setTimeout(() => el.loading.classList.add('hidden'), 220);
  }
  input.endFrame();
});

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, PIXEL_CAP));
  rig.resize(window.innerWidth / window.innerHeight);
});

window.addEventListener('orientationchange', () => {
  // iOS reports stale sizes immediately after a rotation
  window.setTimeout(() => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    rig.resize(window.innerWidth / window.innerHeight);
  }, 250);
});
