import * as THREE from 'three';
import {
  makeKitTexture,
  makeNameTexture,
  makeNumberTexture,
  makeShadowTexture,
} from '../textures';

export interface KitConfig {
  shirt: string;
  accent: string;
  shorts: string;
  socks: string;
  boots: string;
  skin: string;
  hair: string;
  number: number;
  name: string;
  hairStyle?: 'short' | 'buzz' | 'curly' | 'fade';
  heightScale?: number;
}

export interface MotionState {
  speed: number;
  maxSpeed: number;
  forwardSpeed: number;
  turn: number;
  moving: boolean;
}

const shadowTex = makeShadowTexture();

function std(color: THREE.ColorRepresentation, roughness = 0.7, metalness = 0.03) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    envMapIntensity: 0.5,
  });
}

function place<T extends THREE.Object3D>(
  obj: T,
  parent: THREE.Object3D,
  pos: [number, number, number],
  rot?: [number, number, number],
  scale?: [number, number, number],
): T {
  obj.position.set(pos[0], pos[1], pos[2]);
  if (rot) obj.rotation.set(rot[0], rot[1], rot[2]);
  if (scale) obj.scale.set(scale[0], scale[1], scale[2]);
  parent.add(obj);
  return obj;
}

/**
 * A fully articulated procedural footballer. Joints are real Object3D pivots so
 * the run cycle is skeletal rather than baked animation.
 */
export class Footballer {
  readonly group = new THREE.Group();
  private readonly model = new THREE.Group();
  private readonly hips = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly thigh: THREE.Group[] = [];
  private readonly shin: THREE.Group[] = [];
  private readonly foot: THREE.Group[] = [];
  private readonly arm: THREE.Group[] = [];
  private readonly forearm: THREE.Group[] = [];
  private readonly shadow: THREE.Mesh;

  private phase = 0;
  private idleTime = Math.random() * 10;
  private lean = 0;
  private breather = 0;
  private readonly heightScale: number;
  private readonly baseHipY = 0.965;

  constructor(kit: KitConfig) {
    this.heightScale = kit.heightScale ?? 1;
    this.group.add(this.model);
    this.model.scale.setScalar(this.heightScale);

    const shirtTex = makeKitTexture(kit.shirt, kit.accent, 0.09);
    const shirtMat = new THREE.MeshStandardMaterial({
      map: shirtTex,
      roughness: 0.78,
      metalness: 0.02,
      envMapIntensity: 0.4,
    });
    const sleeveMat = std(kit.shirt, 0.8);
    const shortMat = std(kit.shorts, 0.82);
    const sockMat = std(kit.socks, 0.86);
    const skinMat = std(kit.skin, 0.62);
    const bootMat = std(kit.boots, 0.36, 0.18);
    const hairMat = std(kit.hair, 0.85);
    const trimMat = std(kit.accent, 0.5, 0.1);
    const darkMat = std('#0a0d10', 0.6);

    this.model.add(this.hips);
    this.hips.position.y = this.baseHipY;
    this.hips.add(this.torso);

    /* ---------------- pelvis / shorts ---------------- */
    place(new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), shortMat), this.hips, [0, -0.03, 0], undefined, [0.175, 0.15, 0.135]);
    // waistband
    place(
      new THREE.Mesh(new THREE.CylinderGeometry(0.183, 0.183, 0.035, 28, 1, true), trimMat),
      this.hips,
      [0, 0.095, 0],
    );

    /* ---------------- torso ---------------- */
    const abdomen = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), shirtMat);
    place(abdomen, this.torso, [0, 0.21, 0], undefined, [0.192, 0.21, 0.142]);
    const chest = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 22), shirtMat);
    place(chest, this.torso, [0, 0.43, 0], undefined, [0.235, 0.24, 0.15]);
    // sculpted upper-chest / trapezius blend
    place(new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), shirtMat), this.torso, [0, 0.53, -0.01], undefined, [0.2, 0.13, 0.13]);

    // collar
    place(
      new THREE.Mesh(new THREE.TorusGeometry(0.078, 0.019, 10, 24), trimMat),
      this.torso,
      [0, 0.585, 0.008],
      [Math.PI / 2, 0, 0],
    );

    // shoulder deltoids (sleeves)
    for (const side of [-1, 1]) {
      place(
        new THREE.Mesh(new THREE.SphereGeometry(1, 18, 14), sleeveMat),
        this.torso,
        [side * 0.216, 0.5, 0.012],
        undefined,
        [0.089, 0.094, 0.104],
      );
    }

    /* ---------------- neck + head ---------------- */
    place(
      new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.062, 0.11, 18), skinMat),
      this.torso,
      [0, 0.615, 0],
    );
    this.torso.add(this.head);
    this.head.position.set(0, 0.69, 0);
    this.buildHead(skinMat, hairMat, darkMat, kit);

    /* ---------------- number + name on the back ---------------- */
    const numberMat = new THREE.MeshStandardMaterial({
      map: makeNumberTexture(kit.number),
      transparent: true,
      roughness: 0.8,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      depthWrite: false,
    });
    place(new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.26), numberMat), this.torso, [0, 0.36, -0.152], [0, Math.PI, 0]);

    const nameMat = new THREE.MeshStandardMaterial({
      map: makeNameTexture(kit.name),
      transparent: true,
      roughness: 0.8,
      metalness: 0,
      depthWrite: false,
    });
    place(new THREE.Mesh(new THREE.PlaneGeometry(0.31, 0.078), nameMat), this.torso, [0, 0.548, -0.146], [0, Math.PI, -0.14]);

    // front crest
    place(
      new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.09), trimMat),
      this.torso,
      [0.105, 0.47, 0.148],
      [0, 0, 0.05],
    );

    /* ---------------- legs ---------------- */
    for (const side of [-1, 1]) {
      const thighGroup = new THREE.Group();
      thighGroup.position.set(side * 0.104, -0.035, 0);
      this.hips.add(thighGroup);
      this.thigh.push(thighGroup);

      // shorts leg
      place(
        new THREE.Mesh(new THREE.CylinderGeometry(0.098, 0.086, 0.2, 20), shortMat),
        thighGroup,
        [0, -0.1, 0],
      );
      // thigh
      place(
        new THREE.Mesh(new THREE.CapsuleGeometry(0.077, 0.24, 6, 16), skinMat),
        thighGroup,
        [0, -0.28, 0],
      );

      const shinGroup = new THREE.Group();
      shinGroup.position.set(0, -0.44, 0);
      thighGroup.add(shinGroup);
      this.shin.push(shinGroup);

      // knee
      place(new THREE.Mesh(new THREE.SphereGeometry(0.066, 16, 12), skinMat), shinGroup, [0, 0, 0.008]);
      // sock
      place(
        new THREE.Mesh(new THREE.CapsuleGeometry(0.062, 0.24, 6, 16), sockMat),
        shinGroup,
        [0, -0.2, 0],
      );
      // sock cuff
      place(
        new THREE.Mesh(new THREE.CylinderGeometry(0.071, 0.071, 0.03, 20), trimMat),
        shinGroup,
        [0, -0.055, 0],
      );
      // calf shaping
      place(new THREE.Mesh(new THREE.SphereGeometry(1, 14, 12), sockMat), shinGroup, [0, -0.17, -0.016], undefined, [0.064, 0.085, 0.066]);

      const footGroup = new THREE.Group();
      footGroup.position.set(0, -0.405, 0.012);
      shinGroup.add(footGroup);
      this.foot.push(footGroup);
      this.buildBoot(footGroup, bootMat, trimMat);

      const armGroup = new THREE.Group();
      armGroup.position.set(side * 0.247, 0.505, 0);
      this.torso.add(armGroup);
      armGroup.rotation.z = side * 0.1;
      this.arm.push(armGroup);

      // sleeve
      place(
        new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.064, 0.12, 18), sleeveMat),
        armGroup,
        [0, -0.06, 0],
      );
      // upper arm
      place(
        new THREE.Mesh(new THREE.CapsuleGeometry(0.056, 0.18, 6, 14), skinMat),
        armGroup,
        [0, -0.2, 0],
      );

      const foreGroup = new THREE.Group();
      foreGroup.position.set(0, -0.315, 0);
      armGroup.add(foreGroup);
      this.forearm.push(foreGroup);
      place(new THREE.Mesh(new THREE.SphereGeometry(0.052, 14, 10), skinMat), foreGroup, [0, 0, 0]);
      place(
        new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.17, 6, 14), skinMat),
        foreGroup,
        [0, -0.145, 0],
      );
      // hand
      place(
        new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), skinMat),
        foreGroup,
        [0, -0.275, 0.01],
        undefined,
        [0.038, 0.055, 0.026],
      );
    }

    /* ---------------- ground shadow ---------------- */
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.25, 1.25),
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.015;
    this.group.add(this.shadow);

    this.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.shadow.castShadow = false;
    this.shadow.receiveShadow = false;
  }

  private buildHead(
    skinMat: THREE.Material,
    hairMat: THREE.Material,
    darkMat: THREE.Material,
    kit: KitConfig,
  ) {
    const skull = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 22), skinMat);
    place(skull, this.head, [0, 0, 0], undefined, [0.104, 0.124, 0.112]);

    // jaw / chin
    place(new THREE.Mesh(new THREE.SphereGeometry(1, 18, 14), skinMat), this.head, [0, -0.062, 0.028], undefined, [0.078, 0.062, 0.088]);

    // ears
    for (const side of [-1, 1]) {
      place(new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), skinMat), this.head, [side * 0.101, -0.004, -0.004], undefined, [0.016, 0.032, 0.022]);
    }

    // eye sockets, eyes, irises
    const white = new THREE.MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.28, metalness: 0 });
    const iris = new THREE.MeshStandardMaterial({ color: '#3a2a1b', roughness: 0.2, metalness: 0 });
    for (const side of [-1, 1]) {
      place(new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), white), this.head, [side * 0.037, 0.014, 0.087], undefined, [0.021, 0.017, 0.014]);
      place(new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), iris), this.head, [side * 0.038, 0.013, 0.097], undefined, [0.0105, 0.0105, 0.006]);
      // brow
      place(
        new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.0085, 0.01), darkMat),
        this.head,
        [side * 0.039, 0.046, 0.096],
        [0, 0, side * 0.13],
      );
    }

    // nose
    place(new THREE.Mesh(new THREE.ConeGeometry(0.019, 0.052, 10), skinMat), this.head, [0, -0.008, 0.108], [Math.PI / 2.1, 0, 0]);
    // mouth
    place(
      new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.008, 0.008), new THREE.MeshStandardMaterial({ color: '#79413f', roughness: 0.6 })),
      this.head,
      [0, -0.058, 0.094],
    );

    // hair
    const style = kit.hairStyle ?? 'short';
    if (style === 'buzz' || style === 'short' || style === 'fade') {
      // cap stops above the brow line; tilted back so the face stays clear
      const cap = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.42), hairMat);
      place(cap, this.head, [0, 0.012, -0.008], [-0.1, 0, 0], [0.11, 0.124, 0.118]);
      // nape / back of the head
      place(new THREE.Mesh(new THREE.SphereGeometry(1, 18, 14), hairMat), this.head, [0, -0.035, -0.055], undefined, [0.092, 0.078, 0.058]);
      if (style === 'short') {
        // textured quiff
        place(new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), hairMat), this.head, [0.02, 0.088, 0.042], [0, 0, -0.22], [0.07, 0.034, 0.058]);
        place(new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), hairMat), this.head, [-0.03, 0.094, 0.028], [0, 0, 0.15], [0.05, 0.028, 0.05]);
      }
      if (style === 'fade') {
        cap.scale.set(0.108, 0.12, 0.116);
      }
    } else {
      // curly volume
      const curls = new THREE.Group();
      this.head.add(curls);
      const r = (i: number) => Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
      for (let i = 0; i < 26; i++) {
        const a = r(i) * Math.PI * 2;
        const rad = 0.075 + r(i + 50) * 0.035;
        const yy = 0.055 + r(i + 99) * 0.075;
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.034, 10, 8), hairMat);
        ball.position.set(Math.cos(a) * rad * 1.05, yy, Math.sin(a) * rad - 0.01);
        curls.add(ball);
      }
    }

    // eyebrows shadow / cheekbone highlight via tiny skin-tone spheres
    place(
      new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), skinMat),
      this.head,
      [0, 0.0, 0.038],
      undefined,
      [0.085, 0.06, 0.075],
    );
  }

  private buildBoot(footGroup: THREE.Group, bootMat: THREE.Material, accentMat: THREE.Material) {
    // ankle
    place(new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), bootMat), footGroup, [0, 0.025, 0], undefined, [0.058, 0.06, 0.062]);
    // main boot body
    place(new THREE.Mesh(new THREE.BoxGeometry(0.104, 0.085, 0.2), bootMat), footGroup, [0, -0.012, 0.065]);
    // rounded toe
    place(new THREE.Mesh(new THREE.SphereGeometry(1, 14, 12), bootMat), footGroup, [0, -0.016, 0.16], undefined, [0.052, 0.042, 0.062]);
    // heel
    place(new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.07), bootMat), footGroup, [0, 0.005, -0.035]);
    // sole
    place(new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.022, 0.275), new THREE.MeshStandardMaterial({ color: '#e8ecf1', roughness: 0.5 })), footGroup, [0, -0.062, 0.055]);
    // accent swoosh
    place(new THREE.Mesh(new THREE.BoxGeometry(0.108, 0.012, 0.05), accentMat), footGroup, [0, 0.005, 0.105], [0.06, 0, 0]);
    // studs
    for (const z of [-0.05, 0.04, 0.13]) {
      for (const x of [-0.035, 0.035]) {
        place(new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.022, 6), bootMat), footGroup, [x, -0.079, z]);
      }
    }
  }

  /** Drives the skeletal run/idle cycle from actual locomotion speed. */
  update(dt: number, m: MotionState) {
    const blend = THREE.MathUtils.clamp(Math.abs(m.speed) / m.maxSpeed, 0, 1);
    const cadence = 0.85 + blend * 1.0;
    this.phase += dt * cadence * Math.PI * 2 * (m.speed > 0.05 ? 1 : 0);
    this.idleTime += dt;

    const amp = 0.28 + blend * 0.82;
    const s = Math.sin(this.phase);
    const c = Math.cos(this.phase);

    // ---- legs ----
    const leftBend = 0.18 + (0.5 + 0.5 * Math.cos(this.phase)) * (0.55 + blend * 1.15);
    const rightBend = 0.18 + (0.5 - 0.5 * Math.cos(this.phase)) * (0.55 + blend * 1.15);
    for (let i = 0; i < 2; i++) {
      const sign = i === 0 ? 1 : -1;
      const thighRot = s * sign * amp + 0.04;
      this.thigh[i].rotation.x = thighRot;
      this.thigh[i].rotation.z = (i === 0 ? -1 : 1) * (0.035 + blend * 0.02);
      this.shin[i].rotation.x = -(i === 0 ? leftBend : rightBend) * (0.6 + blend * 0.55);
      this.foot[i].rotation.x = -(thighRot + this.shin[i].rotation.x) * 0.55;
      // subtle foot roll
      this.foot[i].rotation.y = (i === 0 ? 1 : -1) * 0.06;
    }

    // ---- arms (counter-swing) ----
    for (let i = 0; i < 2; i++) {
      const sign = i === 0 ? 1 : -1;
      const swing = -s * sign * amp * 0.62;
      this.arm[i].rotation.x = swing + 0.06;
      this.arm[i].rotation.z = (i === 0 ? -1 : 1) * (0.1 + blend * 0.07);
      this.forearm[i].rotation.x = -(0.3 + blend * 0.95) - Math.max(0, swing) * 0.25;
      this.forearm[i].rotation.y = (i === 0 ? 1 : -1) * 0.12;
    }

    // ---- hips, torso, head ----
    const bob = Math.abs(Math.sin(this.phase)) * (0.018 + blend * 0.052);
    this.hips.position.y = this.baseHipY + bob * 2 - 0.02 * blend;
    this.hips.rotation.y = -s * 0.13 * blend;
    this.hips.rotation.z = c * 0.045 * blend;

    // lean into acceleration + turning
    const targetLean = 0.04 + blend * 0.17 + THREE.MathUtils.clamp(m.turn * 0.12, -0.12, 0.12);
    this.lean += (targetLean - this.lean) * Math.min(1, dt * 6);
    this.torso.rotation.x = this.lean;
    this.torso.rotation.y = s * 0.1 * blend;
    this.torso.rotation.z = -c * 0.03 * blend;

    this.head.rotation.x = -this.lean * 0.75 + 0.02;
    this.head.rotation.y = -this.torso.rotation.y * 0.5;

    // breathing when stationary
    this.breather = 0.5 + 0.5 * Math.sin(this.idleTime * 1.6);
    if (m.speed < 0.2) {
      const breathe = this.breather * 0.006;
      this.torso.position.y = breathe;
      this.arm[0].rotation.z = -0.12 - this.breather * 0.012;
      this.arm[1].rotation.z = 0.12 + this.breather * 0.012;
      this.torso.rotation.x = 0.035 + this.breather * 0.006;
      this.head.rotation.y += Math.sin(this.idleTime * 0.5) * 0.12;
    } else {
      this.torso.position.y = 0;
    }

    // fade the blob shadow with height of run (keeps feet grounded visually)
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.42 - blend * 0.1;
  }

  /** Idle team-mate: subtle sway plus attention toward a world point. */
  lookAt(point: THREE.Vector3) {
    const local = this.group.worldToLocal(point.clone());
    const target = Math.atan2(local.x, local.z);
    this.head.rotation.y = THREE.MathUtils.clamp(target, -0.7, 0.7);
  }
}
