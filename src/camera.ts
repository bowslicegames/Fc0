import * as THREE from 'three';
import type { Input } from './input';

const TAU = Math.PI * 2;

function wrapAngle(a: number) {
  return ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
}

function damp(current: number, target: number, lambda: number, dt: number) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

/** Pull the camera back on portrait screens so the player stays framed. */
function framingFor(aspect: number) {
  return aspect < 1 ? THREE.MathUtils.clamp(1 + (1 - aspect) * 0.6, 1, 1.45) : 1;
}

/** Third-person follow camera with mouse orbit and sprint FOV kick. */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  private followYaw = 0;
  private manualYaw = 0;
  private manualPitch = 0;
  private distance = 7.8;
  private readonly desiredPos = new THREE.Vector3();
  private readonly lookTarget = new THREE.Vector3();
  private readonly smoothLook = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private initialised = false;
  private framing = 1;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(55, aspect, 0.1, 900);
    this.framing = framingFor(aspect);
  }

  get yaw() {
    return this.followYaw + this.manualYaw;
  }

  update(dt: number, target: THREE.Vector3, heading: number, speedRatio: number, input: Input) {
    const drag = input.takeDrag();
    this.manualYaw = THREE.MathUtils.clamp(this.manualYaw - drag.x * 0.006, -2.2, 2.2);
    this.manualPitch = THREE.MathUtils.clamp(this.manualPitch + drag.y * 0.0035, -0.34, 0.62);

    const wheel = input.takeWheel();
    if (wheel !== 0) this.distance = THREE.MathUtils.clamp(this.distance + wheel * 0.006, 5.5, 17);

    if (speedRatio > 0.15) this.manualYaw *= Math.exp(-dt * 1.4);

    const delta = wrapAngle(heading - this.followYaw);
    this.followYaw += delta * (1 - Math.exp(-dt * 3.2));

    const yaw = this.followYaw + this.manualYaw;
    // a narrow (portrait) viewport pulls the camera back and lifts it
    const pitch = 0.22 + this.manualPitch + (this.framing - 1) * 0.34;
    this.forward.set(Math.sin(yaw), 0, Math.cos(yaw));

    const horizontal = Math.cos(pitch) * this.distance * this.framing;
    const vertical = Math.sin(pitch) * this.distance;

    this.desiredPos
      .copy(target)
      .addScaledVector(this.forward, -horizontal)
      .setY(target.y + vertical + 1.1);

    if (!this.initialised) {
      this.camera.position.copy(this.desiredPos);
      this.smoothLook.copy(target);
      this.initialised = true;
    } else {
      const t = 1 - Math.exp(-dt * 7);
      this.camera.position.lerp(this.desiredPos, t);
    }

    this.lookTarget.copy(target).setY(target.y + 1.35).addScaledVector(this.forward, 1.6);
    this.smoothLook.lerp(this.lookTarget, 1 - Math.exp(-dt * 9));
    this.camera.lookAt(this.smoothLook);

    const targetFov = 55 + speedRatio * 6.5;
    this.camera.fov = damp(this.camera.fov, targetFov, 4, dt);
    this.camera.updateProjectionMatrix();
  }

  resize(aspect: number) {
    this.camera.aspect = aspect;
    this.framing = framingFor(aspect);
    this.camera.updateProjectionMatrix();
  }

  /** Cut straight to a new player after a switch instead of flying across the pitch. */
  snap(target: THREE.Vector3, heading: number) {
    this.followYaw = heading;
    this.manualYaw = 0;
    this.manualPitch = 0;
    this.initialised = false;
    this.smoothLook.copy(target);
  }
}
