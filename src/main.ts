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
const AI_SUPPORT_SPEED = 3.6;
const AI_CHASE_SPEED = 5.7;
const AI_DRIBBLE_SPEED = 4.5;
const FIELD_X = 52.2;
const FIELD_Z = 33.8;
const GOAL_X = 52.5;
/** How far in front of the carrier the ball sits while in possession. */
const CARRY = 0.62;
const CONTROL_RADIUS = 1.25;
const START_HEADING = Math.PI / 2;

/** Home attacks the +x goal, away attacks the -x goal. */
const HOME_ANCHORS: [number, number][] = [
  [-2, 0],
  [-10, -14],
  [-10, 14],
  [-20, 0],
  [-32, 0],
];

const AWAY_ANCHORS: [number, number][] = [
  [-4, 0],
  [12, 0],
  [26, -12],
  [26, 12],
  [34, 0],
];

type Side = 'home' | 'away';

interface Actor {
  side: Side;
  footballer: Footballer;
  kit: KitConfig;
  home: THREE.Vector3;
  velocity: THREE.Vector3;
  heading: number;
  stamina: number;
  cooldown: number;
  isKeeper: boolean;
}

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

/* ----------------------------- match state ----------------------------- */

let homeSquad: Actor[] = [];
let awaySquad: Actor[] = [];
let homeKeeper: Actor | null = null;
let awayKeeper: Actor | null = null;
let controlled = 0;
/** Whoever currently has the ball glued to their feet, if anyone. */
let carrier: Actor | null = null;
let carrierHold = 0;
let carrierGrace = 0;
let recaptureCooldown = 0;
let homeGoals = 0;
let awayGoals = 0;
let stamina = 100;
let resetTimer = 0;
let paused = true;
let started = false;
let flashTimer: number | undefined;
let homeTeam: Team = TEAMS[0];

/* ----------------------------- HUD wiring ----------------------------- */

const el = {
  speedValue: document.getElementById('speed-value')!,
  speedFill: document.getElementById('speed-fill')!,
  staminaValue: document.getElementById('stamina-value')!,
  staminaFill: document.getElementById('stamina-fill')!,
  score: document.getElementById('score-value')!,
  awayScore: document.getElementById('score-away')!,
  chip: document.getElementById('state-chip')!,
  flash: document.getElementById('goal-flash')!,
  flashText: document.getElementById('flash-text')!,
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

function updatePlayerCard(m: Actor) {
  el.name.textContent = m.kit.name;
  el.num.textContent = String(m.kit.number);
  stamina = m.stamina;
}

function updateTeamHud(team: Team) {
  el.teamName.textContent = team.name;
  el.crest.style.background = `linear-gradient(150deg, ${team.kit.shirt}, ${team.kit.trim})`;
}

function flash(text: string) {
  el.flashText.textContent = text;
  el.flash.classList.add('show');
  window.clearTimeout(flashTimer);
  flashTimer = window.setTimeout(() => el.flash.classList.remove('show'), 1500);
}

/* ----------------------------- actors ----------------------------- */

function createActor(kit: KitConfig, side: Side, home: [number, number], heading: number, isKeeper = false): Actor {
  const footballer = new Footballer(kit);
  footballer.group.position.set(home[0], 0, home[1]);
  footballer.group.rotation.y = heading;
  scene.add(footballer.group);
  return {
    side,
    footballer,
    kit,
    home: new THREE.Vector3(home[0], 0, home[1]),
    velocity: new THREE.Vector3(),
    heading,
    stamina: 100,
    cooldown: 0,
    isKeeper,
  };
}

function keeperKit(team: Team): KitConfig {
  const base = squadKits(team)[0];
  return {
    ...base,
    shirt: team.kit.trim,
    accent: team.kit.shirt,
    shorts: '#101418',
    socks: team.kit.trim,
    number: 1,
    name: 'KEEPER',
  };
}

function clearActors() {
  const all = [...homeSquad, ...awaySquad];
  if (homeKeeper) all.push(homeKeeper);
  if (awayKeeper) all.push(awayKeeper);
  for (const a of all) {
    scene.remove(a.footballer.group);
    a.footballer.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) mat.dispose();
    });
  }
  homeSquad = [];
  awaySquad = [];
  homeKeeper = null;
  awayKeeper = null;
}

function resetBall() {
  ball.position.set(-0.9, 0.11, 0.1);
  ball.velocity.set(0, 0, 0);
  ball.scored = false;
  ball.mesh.position.copy(ball.position);
}

function buildMatch(team: Team, opponent: Team) {
  clearActors();
  const homeKits = squadKits(team);
  const awayKits = squadKits(opponent);
  homeSquad = HOME_ANCHORS.map(([x, z], i) => createActor(homeKits[i], 'home', [x, z], START_HEADING));
  awaySquad = AWAY_ANCHORS.map(([x, z], i) => createActor(awayKits[i], 'away', [x, z], -START_HEADING));
  homeKeeper = createActor(keeperKit(team), 'home', [-50.5, 0], START_HEADING, true);
  awayKeeper = createActor(keeperKit(opponent), 'away', [50.5, 0], -START_HEADING, true);

  controlled = 0;
  carrier = null;
  carrierHold = 0;
  carrierGrace = 0;
  recaptureCooldown = 0;
  resetBall();
  rig.snap(homeSquad[0].footballer.group.position, START_HEADING);
  el.speedValue.innerHTML = '0.0 <em>km/h</em>';
  el.speedFill.style.width = '0%';
  updatePlayerCard(homeSquad[0]);
}

/** Put everybody back in their shape for a kick-off. */
function kickoffReset() {
  const place = (a: Actor, at: [number, number], heading: number) => {
    a.footballer.group.position.set(at[0], 0, at[1]);
    a.footballer.group.rotation.y = heading;
    a.heading = heading;
    a.velocity.set(0, 0, 0);
    a.cooldown = 0;
  };
  HOME_ANCHORS.forEach((at, i) => place(homeSquad[i], at, START_HEADING));
  AWAY_ANCHORS.forEach((at, i) => place(awaySquad[i], at, -START_HEADING));
  if (homeKeeper) place(homeKeeper, [-50.5, 0], START_HEADING);
  if (awayKeeper) place(awayKeeper, [50.5, 0], -START_HEADING);

  controlled = 0;
  carrier = null;
  carrierHold = 0;
  carrierGrace = 0;
  recaptureCooldown = 0.5;
  resetBall();
  rig.snap(homeSquad[0].footballer.group.position, START_HEADING);
  updatePlayerCard(homeSquad[0]);
}

/* ----------------------------- possession ----------------------------- */

function distToBall(a: Actor) {
  const p = a.footballer.group.position;
  return Math.hypot(p.x - ball.position.x, p.z - ball.position.z);
}

function releaseBall(vx: number, vy: number, vz: number) {
  carrier = null;
  carrierHold = 0;
  ball.velocity.set(vx, vy, vz);
  recaptureCooldown = 0.4;
}

/** Nearest player to a slow, low ball takes possession. */
function tryAcquire() {
  if (carrier || recaptureCooldown > 0 || ball.position.y > 0.85) return;
  if (Math.hypot(ball.velocity.x, ball.velocity.z) > 22) return;

  let best: Actor | null = null;
  let bestD = CONTROL_RADIUS;
  for (const a of [...homeSquad, ...awaySquad]) {
    const d = distToBall(a);
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  if (!best) return;
  carrier = best;
  carrierHold = 0;
  carrierGrace = 0.6;
  ball.velocity.set(0, 0, 0);
}

/** While in possession the ball is held at the carrier's feet. */
function glueBall() {
  if (!carrier) return;
  const p = carrier.footballer.group.position;
  const fx = Math.sin(carrier.heading);
  const fz = Math.cos(carrier.heading);
  ball.position.set(p.x + fx * CARRY, 0.11, p.z + fz * CARRY);
  ball.velocity.set(carrier.velocity.x, 0, carrier.velocity.z);
  ball.mesh.position.copy(ball.position);
}

function passBall(from: Actor, to: Actor) {
  const fp = from.footballer.group.position;
  const tp = to.footballer.group.position;
  const dx = tp.x - fp.x;
  const dz = tp.z - fp.z;
  const dist = Math.hypot(dx, dz) || 1;
  const power = THREE.MathUtils.clamp(8 + dist * 0.75, 10, 24);
  const lead = Math.min(0.45, dist / power);
  const tx = tp.x + to.velocity.x * lead - fp.x;
  const tz = tp.z + to.velocity.z * lead - fp.z;
  const len = Math.hypot(tx, tz) || 1;
  releaseBall((tx / len) * power, Math.min(1.1, dist * 0.03), (tz / len) * power);
}

function bestPassTarget(from: Actor): Actor | null {
  const fp = from.footballer.group.position;
  const fx = Math.sin(from.heading);
  const fz = Math.cos(from.heading);
  let best: Actor | null = null;
  let bestScore = Infinity;
  for (const mate of homeSquad) {
    if (mate === from) continue;
    const dx = mate.footballer.group.position.x - fp.x;
    const dz = mate.footballer.group.position.z - fp.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 2.5 || dist > 40) continue;
    const dot = (dx * fx + dz * fz) / dist;
    const score = dist - dot * 16;
    if (score < bestScore) {
      bestScore = score;
      best = mate;
    }
  }
  return best;
}

function bestAwayPassTarget(from: Actor): Actor | null {
  const fp = from.footballer.group.position;
  let best: Actor | null = null;
  let bestScore = -Infinity;
  for (const mate of awaySquad) {
    if (mate === from) continue;
    const dx = mate.footballer.group.position.x - fp.x;
    const dz = mate.footballer.group.position.z - fp.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 5 || dist > 38) continue;
    const score = -mate.footballer.group.position.x - dist * 0.35;
    if (score > bestScore) {
      bestScore = score;
      best = mate;
    }
  }
  return best;
}

/* ----------------------------- movement ----------------------------- */

const moveDir = new THREE.Vector3();
const kickDir = new THREE.Vector3();
const tmpVec = new THREE.Vector3();

function wrapAngle(a: number) {
  return (((a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
}

function moveActor(a: Actor, target: THREE.Vector3, maxSpeed: number, dt: number) {
  const p = a.footballer.group.position;
  const dx = target.x - p.x;
  const dz = target.z - p.z;
  const dist = Math.hypot(dx, dz);

  let desiredX = 0;
  let desiredZ = 0;
  if (dist > 0.4) {
    const scale = Math.min(1, (dist - 0.4) / 2.5);
    desiredX = (dx / dist) * maxSpeed * scale;
    desiredZ = (dz / dist) * maxSpeed * scale;
  }

  const k = 1 - Math.exp(-dt * 9);
  a.velocity.x += (desiredX - a.velocity.x) * k;
  a.velocity.z += (desiredZ - a.velocity.z) * k;
  p.x = THREE.MathUtils.clamp(p.x + a.velocity.x * dt, -FIELD_X, FIELD_X);
  p.z = THREE.MathUtils.clamp(p.z + a.velocity.z * dt, -FIELD_Z, FIELD_Z);

  const speed = Math.hypot(a.velocity.x, a.velocity.z);
  let turnRate = 0;
  if (speed > 0.25) {
    const targetHeading = Math.atan2(a.velocity.x, a.velocity.z);
    const diff = wrapAngle(targetHeading - a.heading);
    const step = THREE.MathUtils.clamp(diff, -(8 + speed) * dt, (8 + speed) * dt);
    a.heading += step;
    turnRate = step / Math.max(dt, 0.0001);
    a.footballer.group.rotation.y = a.heading;
  }

  a.footballer.update(dt, {
    speed,
    maxSpeed: SPRINT_SPEED,
    forwardSpeed: speed,
    turn: turnRate,
    moving: speed > 0.25,
  });
}

/* ----------------------------- player ----------------------------- */

function updateControlled(dt: number) {
  const me = homeSquad[controlled];
  if (!me) return;

  const p = me.footballer.group.position;
  const axis = input.axis();
  const camYaw = rig.yaw;
  moveDir.set(
    Math.sin(camYaw) * axis.y - Math.cos(camYaw) * axis.x,
    0,
    Math.cos(camYaw) * axis.y + Math.sin(camYaw) * axis.x,
  );
  const inputMag = Math.min(1, moveDir.length());
  const moving = inputMag > 0.06;
  if (moving) moveDir.normalize();

  const sprintHeld = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
  const wantsSprint = sprintHeld && moving && me.stamina > 1;
  const targetSpeed = moving ? (wantsSprint ? SPRINT_SPEED : RUN_SPEED) * Math.max(0.5, inputMag) : 0;

  const accel = 1 - Math.exp(-dt * (wantsSprint ? 7 : 10));
  me.velocity.x += (moveDir.x * targetSpeed - me.velocity.x) * accel;
  me.velocity.z += (moveDir.z * targetSpeed - me.velocity.z) * accel;
  if (!moving) {
    const decel = Math.exp(-dt * 12);
    me.velocity.x *= decel;
    me.velocity.z *= decel;
    if (me.velocity.length() < 0.04) me.velocity.set(0, 0, 0);
  }

  const speed = me.velocity.length();
  let turnRate = 0;
  if (speed > 0.35) {
    const targetHeading = Math.atan2(me.velocity.x, me.velocity.z);
    const diff = wrapAngle(targetHeading - me.heading);
    const maxStep = (9 + speed * 0.6) * dt;
    const step = THREE.MathUtils.clamp(diff, -maxStep, maxStep);
    me.heading += step;
    turnRate = step / Math.max(dt, 0.0001);
  }

  me.footballer.group.rotation.y = me.heading;
  p.x = THREE.MathUtils.clamp(p.x + me.velocity.x * dt, -FIELD_X, FIELD_X);
  p.z = THREE.MathUtils.clamp(p.z + me.velocity.z * dt, -FIELD_Z, FIELD_Z);

  if (wantsSprint && speed > 2) me.stamina = Math.max(0, me.stamina - dt * 17);
  else me.stamina = Math.min(100, me.stamina + dt * (speed < 0.5 ? 20 : 9));

  me.footballer.update(dt, {
    speed,
    maxSpeed: SPRINT_SPEED,
    forwardSpeed: me.velocity.x * Math.sin(me.heading) + me.velocity.z * Math.cos(me.heading),
    turn: turnRate,
    moving,
  });

  const hasBall = carrier === me;

  // pass
  if (input.justPressed('KeyE') && hasBall) {
    const mate = bestPassTarget(me);
    if (mate) passBall(me, mate);
  }

  // shoot with the ball, otherwise press the ball carrier
  if (input.justPressed('Space')) {
    if (hasBall) {
      kickDir.set(Math.sin(me.heading), 0, Math.cos(me.heading));
      ball.kick(kickDir, 22 + me.stamina * 0.03, 2);
      carrier = null;
      carrierHold = 0;
      recaptureCooldown = 0.45;
    } else if (distToBall(me) < 1.9) {
      carrier = me;
      carrierHold = 0;
      carrierGrace = 0.7;
      ball.velocity.set(0, 0, 0);
    }
  }

  rig.update(dt, p, me.heading, Math.min(1, speed / SPRINT_SPEED), input);

  stamina = me.stamina;
  el.speedValue.innerHTML = `${(speed * 3.6).toFixed(1)} <em>km/h</em>`;
  el.speedFill.style.width = `${Math.min(100, (speed / SPRINT_SPEED) * 100)}%`;
  el.staminaValue.textContent = String(Math.round(stamina));
  el.staminaFill.style.width = `${stamina}%`;
  el.staminaFill.classList.toggle('low', stamina < 30);
  el.chip.textContent = carrier === me ? (wantsSprint && speed > 6 ? 'RUNNING' : 'ON THE BALL') : wantsSprint && speed > 6 ? 'SPRINTING' : speed > 0.6 ? 'JOGGING' : 'READY';
}

function switchPlayer() {
  if (homeSquad.length < 2) return;
  let next = -1;
  let bestD = Infinity;
  for (let i = 0; i < homeSquad.length; i++) {
    if (i === controlled) continue;
    const p = homeSquad[i].footballer.group.position;
    const d = Math.hypot(p.x - ball.position.x, p.z - ball.position.z);
    if (d < bestD) {
      bestD = d;
      next = i;
    }
  }
  if (next < 0) return;

  controlled = next;
  const m = homeSquad[controlled];
  const p = m.footballer.group.position;
  m.heading = Math.atan2(ball.position.x - p.x, ball.position.z - p.z);
  m.footballer.group.rotation.y = m.heading;
  m.velocity.set(0, 0, 0);
  rig.snap(p, m.heading);
  updatePlayerCard(m);
}

/* ----------------------------- team-mates ----------------------------- */

function updateHomeAI(dt: number) {
  const me = homeSquad[controlled];
  const needPress = !carrier || carrier.side === 'away';

  let chaser: Actor | null = null;
  if (needPress) {
    let bestD = Infinity;
    for (const a of homeSquad) {
      if (a === me) continue;
      const d = distToBall(a);
      if (d < bestD) {
        bestD = d;
        chaser = a;
      }
    }
  }

  for (const a of homeSquad) {
    if (a === me || carrier === a) continue;
    moveActor(a, a === chaser ? ball.position : a.home, a === chaser ? AI_CHASE_SPEED : AI_SUPPORT_SPEED, dt);
    if (a !== chaser && a.velocity.length() < 0.5) a.footballer.lookAt(ball.position);
  }
}

/* ----------------------------- opponents ----------------------------- */

function updateAwayAI(dt: number) {
  let chasers: Actor[] = [];
  if (!carrier || carrier.side === 'home') {
    chasers = awaySquad
      .filter((a) => a !== carrier)
      .sort((a, b) => distToBall(a) - distToBall(b))
      .slice(0, 2);
  }

  for (const a of awaySquad) {
    if (carrier === a) {
      botAttack(a, dt);
      continue;
    }
    if (chasers.includes(a)) {
      moveActor(a, ball.position, AI_CHASE_SPEED, dt);
      continue;
    }
    tmpVec.copy(a.home).lerp(ball.position, 0.22);
    moveActor(a, tmpVec, AI_SUPPORT_SPEED, dt);
    if (a.velocity.length() < 0.5) a.footballer.lookAt(ball.position);
  }
}

function botAttack(bot: Actor, dt: number) {
  const p = bot.footballer.group.position;

  // under pressure, look for a pass forward
  if (bot.cooldown <= 0) {
    let pressure = Infinity;
    for (const h of homeSquad) {
      const hp = h.footballer.group.position;
      pressure = Math.min(pressure, Math.hypot(hp.x - p.x, hp.z - p.z));
    }
    if (pressure < 1.6) {
      const mate = bestAwayPassTarget(bot);
      if (mate) {
        passBall(bot, mate);
        bot.cooldown = 1.8;
        return;
      }
    }
  }

  const distGoal = Math.hypot(p.x + GOAL_X, p.z);
  if (distGoal < 24 && Math.abs(p.z) < 16) {
    const dx = -GOAL_X - p.x;
    const dz = -p.z;
    const len = Math.hypot(dx, dz) || 1;
    releaseBall((dx / len) * 24, 1.6, (dz / len) * 24);
    bot.cooldown = 1.6;
    return;
  }

  moveActor(bot, tmpVec.set(-GOAL_X * 0.75, 0, 0), AI_DRIBBLE_SPEED, dt);
}

function updateKeeper(k: Actor, dt: number) {
  const sign = k.side === 'home' ? -1 : 1;
  const lineX = sign * 50.2;
  const targetZ = THREE.MathUtils.clamp(ball.position.z * 0.55, -3.2, 3.2);
  const stepOut = THREE.MathUtils.clamp((Math.abs(ball.position.x - lineX) - 6) * 0.05, 0, 2.5);
  moveActor(k, tmpVec.set(lineX + sign * stepOut, 0, targetZ), 6.5, dt);
  if (k.velocity.length() < 0.6) k.footballer.lookAt(ball.position);
}

function keeperSave(k: Actor) {
  if (carrier) return;
  const p = k.footballer.group.position;
  const dx = ball.position.x - p.x;
  const dz = ball.position.z - p.z;
  const d = Math.hypot(dx, dz);
  if (d > 0.95 || ball.position.y > 2.3) return;

  const nx = dx / (d || 1);
  const nz = dz / (d || 1);
  const speed = Math.hypot(ball.velocity.x, ball.velocity.z);
  const push = Math.max(5, speed * 0.55);
  ball.velocity.x = nx * push;
  ball.velocity.z = nz * push;
  ball.velocity.y = Math.max(1, ball.velocity.y * 0.4);
  ball.position.x = p.x + nx * 0.95;
  ball.position.z = p.z + nz * 0.95;
}

/** Any outfield player can dispossess a carrier of the other side. */
function updateTackles(dt: number) {
  for (const a of [...homeSquad, ...awaySquad]) a.cooldown = Math.max(0, a.cooldown - dt);
  carrierGrace = Math.max(0, carrierGrace - dt);
  if (!carrier || carrierGrace > 0) return;

  const cp = carrier.footballer.group.position;
  const me = homeSquad[controlled];
  const opponents = carrier.side === 'home' ? awaySquad : homeSquad;

  for (const a of opponents) {
    // the human defender tackles by pressing Shoot
    if (a === me || a.cooldown > 0) continue;
    const p = a.footballer.group.position;
    if (Math.hypot(p.x - cp.x, p.z - cp.z) < 0.95) {
      carrier = a;
      carrierHold = 0;
      carrierGrace = 0.7;
      a.cooldown = 1.4;
      break;
    }
  }
}

/* ----------------------------- goals ----------------------------- */

function onGoal() {
  const homeScored = ball.position.x > 0;
  if (homeScored) {
    homeGoals += 1;
    el.score.textContent = String(homeGoals);
    flash('GOAL');
  } else {
    awayGoals += 1;
    el.awayScore.textContent = String(awayGoals);
    flash('CONCEDED');
  }
  carrier = null;
  resetTimer = 2.2;
}

/* ----------------------------- team select UI ----------------------------- */

function opponentOf(team: Team): Team {
  const i = TEAMS.findIndex((t) => t.id === team.id);
  return TEAMS[(i + 1) % TEAMS.length];
}

function buildTeamCards() {
  el.grid.innerHTML = TEAMS.map(
    (t) => `
      <button class="team-card${t.id === homeTeam.id ? ' selected' : ''}" data-id="${t.id}" type="button">
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

function selectTeam(team: Team) {
  homeTeam = team;
  const opponent = opponentOf(team);
  homeGoals = 0;
  awayGoals = 0;
  el.score.textContent = '0';
  el.awayScore.textContent = '0';
  buildMatch(team, opponent);
  updateTeamHud(team);
  el.kickoff.textContent = `Kick off vs ${opponent.name}`;
  for (const card of el.grid.querySelectorAll<HTMLElement>('.team-card')) {
    card.classList.toggle('selected', card.dataset.id === team.id);
  }
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
  el.kickoff.textContent = 'Resume match';
});

/* ----------------------------- loop ----------------------------- */

const clock = new THREE.Clock();

buildTeamCards();
selectTeam(homeTeam);

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);

  if (!paused) {
    if (input.justPressed('KeyQ') || input.justPressed('Tab')) switchPlayer();
    recaptureCooldown = Math.max(0, recaptureCooldown - dt);

    updateControlled(dt);
    updateHomeAI(dt);
    updateAwayAI(dt);
    if (homeKeeper) updateKeeper(homeKeeper, dt);
    if (awayKeeper) updateKeeper(awayKeeper, dt);
    updateTackles(dt);

    if (carrier) {
      glueBall();
    } else {
      const event = ball.update(dt);
      if (homeKeeper) keeperSave(homeKeeper);
      if (awayKeeper) keeperSave(awayKeeper);
      tryAcquire();
      if (event === 'goal') onGoal();
    }

    // a team-mate who wins the ball lays it back to you
    if (carrier && carrier.side === 'home' && carrier !== homeSquad[controlled]) {
      carrierHold += dt;
      if (carrierHold > 0.4) passBall(carrier, homeSquad[controlled]);
    }

    if (resetTimer > 0) {
      resetTimer -= dt;
      if (resetTimer <= 0) kickoffReset();
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
