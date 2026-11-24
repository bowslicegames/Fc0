import './style.css';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildStadium } from './world/stadium';
import { buildPitch } from './world/pitch';
import { Footballer, type KitConfig, type MotionState } from './entities/footballer';
import { Ball } from './entities/ball';
import { Input } from './input';
import { CameraRig } from './camera';

const RUN_SPEED = 5.5;
const SPRINT_SPEED = 8.9;
const FIELD_X = 52.2;
const FIELD_Z = 33.8;

/* ----------------------------- renderer ----------------------------- */

const container = document.getElementById('app')!;
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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

buildStadium(scene);
buildPitch(scene);

/* ----------------------------- squad ----------------------------- */

const homeKit = {
  shirt: '#f4f8fb',
  accent: '#0b7f88',
  shorts: '#0d2c3d',
  socks: '#f4f8fb',
  boots: '#ff5a1f',
  skin: '#c98a63',
  hair: '#20150e',
};

const player = new Footballer({
  ...homeKit,
  number: 10,
  name: 'VEGA',
  hairStyle: 'short',
  heightScale: 1,
});
player.group.position.set(0, 0, -6);
player.group.rotation.y = 0;
scene.add(player.group);

const squad: { player: Footballer; kit: KitConfig }[] = [];
const mates: KitConfig[] = [
  {
    ...homeKit,
    number: 7,
    name: 'OKAFOR',
    skin: '#6b4630',
    hair: '#0e0b09',
    hairStyle: 'curly',
    heightScale: 1.04,
  },
  {
    ...homeKit,
    number: 4,
    name: 'LARSEN',
    skin: '#efc8a4',
    hair: '#c9a15c',
    hairStyle: 'fade',
    heightScale: 1.06,
  },
  {
    ...homeKit,
    number: 11,
    name: 'SANTOS',
    skin: '#a9724c',
    hair: '#160f0a',
    hairStyle: 'short',
    heightScale: 0.95,
  },
  {
    ...homeKit,
    number: 8,
    name: 'KIM',
    skin: '#e8c2a0',
    hair: '#0c0b0a',
    hairStyle: 'buzz',
    heightScale: 0.99,
  },
];

const matePositions: [number, number][] = [
  [9, 5],
  [-7, 12],
  [4, 21],
  [-16, 2],
];

mates.forEach((kit, i) => {
  const f = new Footballer(kit);
  const [x, z] = matePositions[i];
  f.group.position.set(x, 0, z);
  f.group.rotation.y = Math.atan2(-x, -z);
  scene.add(f.group);
  squad.push({ player: f, kit });
});

const ball = new Ball();
ball.position.set(0.8, 0.11, -4.6);
ball.mesh.position.copy(ball.position);
scene.add(ball.mesh);

scene.updateMatrixWorld(true);

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
  loading: document.getElementById('loading')!,
};

el.name.textContent = 'VEGA';
el.num.textContent = '10';

let score = 0;
let stamina = 100;
let heading = 0;
let turnRate = 0;
let resetTimer = 0;
let touchCooldown = 0;
let flashTimer: number | undefined;

const velocity = new THREE.Vector3();
const moveDir = new THREE.Vector3();
const facing = new THREE.Vector3();
const flatBall = new THREE.Vector3();

function showGoal() {
  score += 1;
  el.score.textContent = String(score);
  el.flash.classList.add('show');
  window.clearTimeout(flashTimer);
  flashTimer = window.setTimeout(() => el.flash.classList.remove('show'), 1500);
  resetTimer = 2.1;
}

/* ----------------------------- simulation ----------------------------- */

function updatePlayer(dt: number) {
  const axis = input.axis();
  const camYaw = rig.yaw;
  const forward = new THREE.Vector3(Math.sin(camYaw), 0, Math.cos(camYaw));
  const right = new THREE.Vector3(-Math.cos(camYaw), 0, Math.sin(camYaw));
  moveDir.set(0, 0, 0).addScaledVector(forward, axis.y).addScaledVector(right, axis.x);
  const moving = moveDir.lengthSq() > 0.001;
  if (moving) moveDir.normalize();

  const wantsSprint = (input.isDown('ShiftLeft') || input.isDown('ShiftRight')) && moving && stamina > 1;
  const targetSpeed = wantsSprint ? SPRINT_SPEED : RUN_SPEED;

  if (moving) {
    const target = moveDir.clone().multiplyScalar(targetSpeed);
    const k = 1 - Math.exp(-dt * (wantsSprint ? 7 : 10));
    velocity.lerp(target, k);
  } else {
    velocity.multiplyScalar(Math.exp(-dt * 12));
    if (velocity.length() < 0.04) velocity.set(0, 0, 0);
  }

  const speed = velocity.length();
  if (speed > 0.35) {
    const targetHeading = Math.atan2(velocity.x, velocity.z);
    let diff = ((targetHeading - heading + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    const maxStep = (9 + speed * 0.6) * dt;
    const step = THREE.MathUtils.clamp(diff, -maxStep, maxStep);
    heading += step;
    turnRate = step / Math.max(dt, 0.0001);
  } else {
    turnRate *= Math.exp(-dt * 8);
  }

  player.group.rotation.y = heading;
  player.group.position.addScaledVector(velocity, dt);
  player.group.position.x = THREE.MathUtils.clamp(player.group.position.x, -FIELD_X, FIELD_X);
  player.group.position.z = THREE.MathUtils.clamp(player.group.position.z, -FIELD_Z, FIELD_Z);

  // stamina
  if (wantsSprint && speed > 2) stamina = Math.max(0, stamina - dt * 17);
  else stamina = Math.min(100, stamina + dt * (speed < 0.5 ? 20 : 9));

  const motion: MotionState = {
    speed,
    maxSpeed: SPRINT_SPEED,
    forwardSpeed: velocity.dot(facing.set(Math.sin(heading), 0, Math.cos(heading))),
    turn: turnRate,
    moving,
  };
  player.update(dt, motion);

  // dribbling
  touchCooldown -= dt;
  flatBall.set(ball.position.x - player.group.position.x, 0, ball.position.z - player.group.position.z);
  const dist = flatBall.length();
  const ballSpeed = Math.hypot(ball.velocity.x, ball.velocity.z);

  if (dist < 0.95 && speed > 0.7 && touchCooldown <= 0 && ball.position.y < 0.55) {
    flatBall.normalize();
    const facingDot = flatBall.x * Math.sin(heading) + flatBall.z * Math.cos(heading);
    if (facingDot > 0.2) {
      ball.velocity.x = velocity.x * 1.02 + flatBall.x * (1.1 + speed * 0.16);
      ball.velocity.z = velocity.z * 1.02 + flatBall.z * (1.1 + speed * 0.16);
      ball.velocity.y = Math.max(ball.velocity.y, 0.22);
      touchCooldown = 0.14;
    }
  }

  // body block if the ball is fired at the player
  if (dist < 0.42 && ballSpeed > 3.5) {
    flatBall.normalize();
    ball.velocity.x = flatBall.x * ballSpeed * 0.45;
    ball.velocity.z = flatBall.z * ballSpeed * 0.45;
    ball.velocity.y = Math.max(ball.velocity.y, 1.1);
  }

  // shooting
  facing.set(Math.sin(heading), 0, Math.cos(heading));
  if (input.justPressed('Space') && dist < 1.45) {
    ball.kick(facing, 20 + stamina * 0.03, 2.1);
    touchCooldown = 0.4;
  }

  // camera
  rig.update(dt, player.group.position, heading, Math.min(1, speed / SPRINT_SPEED), input);

  // HUD
  el.speedValue.innerHTML = `${(speed * 3.6).toFixed(1)} <em>km/h</em>`;
  el.speedFill.style.width = `${Math.min(100, (speed / SPRINT_SPEED) * 100)}%`;
  el.staminaValue.textContent = String(Math.round(stamina));
  el.staminaFill.style.width = `${stamina}%`;
  el.staminaFill.classList.toggle('low', stamina < 30);
  el.chip.textContent = wantsSprint && speed > 6 ? 'SPRINTING' : speed > 0.6 ? 'JOGGING' : 'READY';
}

const clock = new THREE.Clock();
let started = false;

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);

  updatePlayer(dt);

  const event = ball.update(dt);
  if (event === 'goal') showGoal();

  if (resetTimer > 0) {
    resetTimer -= dt;
    if (resetTimer <= 0) ball.reset();
  }

  // team-mates idle and track the ball carrier
  for (const mate of squad) {
    mate.player.update(dt, { speed: 0, maxSpeed: SPRINT_SPEED, forwardSpeed: 0, turn: 0, moving: false });
    mate.player.lookAt(player.group.position);
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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  rig.resize(window.innerWidth / window.innerHeight);
});
