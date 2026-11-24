import * as THREE from 'three';
import { makeBallTexture } from '../textures';

const RADIUS = 0.11;

export class Ball {
  readonly mesh: THREE.Mesh;
  readonly position = new THREE.Vector3(0, RADIUS, 0);
  readonly velocity = new THREE.Vector3();
  scored = false;
  private spinAxis = new THREE.Vector3(1, 0, 0);
  private grounded = true;

  constructor() {
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS, 32, 24),
      new THREE.MeshStandardMaterial({
        map: makeBallTexture(),
        roughness: 0.48,
        metalness: 0.04,
        envMapIntensity: 0.6,
      }),
    );
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.position.copy(this.position);
  }

  reset() {
    this.position.set(0, RADIUS, 0);
    this.velocity.set(0, 0, 0);
    this.scored = false;
    this.mesh.position.copy(this.position);
  }

  kick(direction: THREE.Vector3, power: number, lift: number) {
    this.velocity.x = direction.x * power;
    this.velocity.z = direction.z * power;
    this.velocity.y = lift;
    this.grounded = false;
  }

  /**
   * @returns 'goal' | 'post' | null
   */
  update(dt: number): 'goal' | 'post' | null {
    let event: 'goal' | 'post' | null = null;

    this.position.addScaledVector(this.velocity, dt);

    // gravity
    this.velocity.y -= 9.81 * dt;

    const ground = RADIUS;
    if (this.position.y <= ground) {
      this.position.y = ground;
      if (this.velocity.y < 0) {
        if (this.velocity.y < -1.2) {
          this.velocity.y = -this.velocity.y * 0.52;
          this.velocity.x *= 0.92;
          this.velocity.z *= 0.92;
        } else {
          this.velocity.y = 0;
        }
      }
      this.grounded = true;
    } else {
      this.grounded = false;
    }

    const drag = this.grounded ? 1.25 : 0.12;
    const damp = Math.exp(-drag * dt);
    this.velocity.x *= damp;
    this.velocity.z *= damp;
    if (this.grounded && Math.hypot(this.velocity.x, this.velocity.z) < 0.06) {
      this.velocity.x = 0;
      this.velocity.z = 0;
    }

    this.collide(dt, (e) => (event = e));

    this.mesh.position.copy(this.position);
    this.roll(dt);
    return event;
  }

  private collide(dt: number, emit: (e: 'goal' | 'post') => void) {
    const halfLength = 52.5;
    const halfWidth = 34;
    const halfGoal = 3.66;
    const barHeight = 2.44;

    // goal mouth: crossing the line between the posts
    const inMouth = Math.abs(this.position.z) < halfGoal - RADIUS * 0.5 && this.position.y < barHeight - RADIUS * 0.4;
    if (inMouth && Math.abs(this.position.x) > halfLength - RADIUS) {
      if (!this.scored) {
        this.scored = true;
        emit('goal');
      }
      // stop it in the net
      const back = halfLength + 2.1;
      if (Math.abs(this.position.x) > back) {
        this.position.x = Math.sign(this.position.x) * back;
        this.velocity.x *= -0.2;
        this.velocity.y *= 0.4;
        this.velocity.z *= 0.4;
      }
      return;
    }

    // goal frame colliders
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const postX = sx * halfLength;
        const postZ = sz * halfGoal;
        const dx = this.position.x - postX;
        const dz = this.position.z - postZ;
        const dist = Math.hypot(dx, dz);
        if (dist < RADIUS + 0.06 && this.position.y < barHeight) {
          const nx = dx / (dist || 1);
          const nz = dz / (dist || 1);
          this.position.x = postX + nx * (RADIUS + 0.07);
          this.position.z = postZ + nz * (RADIUS + 0.07);
          const dot = this.velocity.x * nx + this.velocity.z * nz;
          this.velocity.x -= 1.6 * dot * nx;
          this.velocity.z -= 1.6 * dot * nz;
          emit('post');
        }
      }
      // crossbar
      if (Math.abs(Math.abs(this.position.x) - halfLength) < 0.3 && Math.abs(this.position.z) < halfGoal && Math.abs(this.position.y - barHeight) < 0.16) {
        this.velocity.y *= -0.5;
        this.velocity.x *= 0.4;
      }
    }

    // touchlines and dead-ball line
    if (Math.abs(this.position.z) > halfWidth - RADIUS) {
      this.position.z = Math.sign(this.position.z) * (halfWidth - RADIUS);
      this.velocity.z *= -0.55;
      this.velocity.x *= 0.9;
    }
    if (Math.abs(this.position.x) > halfLength - RADIUS + 6) {
      this.position.x = Math.sign(this.position.x) * (halfLength - RADIUS + 6);
      this.velocity.x *= -0.55;
      this.velocity.z *= 0.9;
    }

    // soft player-body deflection handled by controller; keep dt used for stability
    void dt;
  }

  private roll(dt: number) {
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (speed < 0.01) return;
    this.spinAxis.set(-this.velocity.z, 0, this.velocity.x).normalize();
    const q = new THREE.Quaternion().setFromAxisAngle(this.spinAxis, (speed / RADIUS) * dt);
    this.mesh.quaternion.premultiply(q);
  }
}
