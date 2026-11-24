import type { Input } from './input';

const KNOB_RADIUS = 46;
const DEAD_ZONE = 0.16;

/**
 * On-screen controls for phones: a left thumb stick for movement and
 * sprint / shoot buttons under the right thumb. It feeds the same Input
 * instance the keyboard uses, so gameplay code needs no special cases.
 */
export class TouchControls {
  private readonly zone: HTMLElement;
  private readonly knob: HTMLElement;
  private readonly shootBtn: HTMLElement;
  private readonly sprintBtn: HTMLElement;
  private readonly switchBtn: HTMLElement;
  private readonly passBtn: HTMLElement;
  private stickPointer: number | null = null;
  private originX = 0;
  private originY = 0;

  constructor(private readonly input: Input) {
    this.zone = document.getElementById('stick-zone')!;
    this.knob = document.getElementById('stick-knob')!;
    this.shootBtn = document.getElementById('btn-shoot')!;
    this.sprintBtn = document.getElementById('btn-sprint')!;
    this.switchBtn = document.getElementById('btn-switch')!;
    this.passBtn = document.getElementById('btn-pass')!;

    this.zone.addEventListener('pointerdown', this.onStickDown);
    this.zone.addEventListener('pointermove', this.onStickMove);
    this.zone.addEventListener('pointerup', this.onStickUp);
    this.zone.addEventListener('pointercancel', this.onStickUp);
    this.zone.addEventListener('lostpointercapture', this.onStickUp);

    this.bindHold(this.sprintBtn, 'ShiftLeft');
    this.bindHold(this.shootBtn, 'Space');
    this.bindTap(this.switchBtn, 'KeyQ');
    this.bindTap(this.passBtn, 'KeyE');
  }

  /** A tap is queued as a key press that lasts exactly one frame. */
  private bindTap(el: HTMLElement, code: string) {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.input.setVirtual(code, true);
      this.input.setVirtual(code, false);
      el.classList.add('held');
      window.setTimeout(() => el.classList.remove('held'), 120);
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private onStickDown = (e: PointerEvent) => {
    if (this.stickPointer !== null) return;
    e.preventDefault();
    this.stickPointer = e.pointerId;
    this.zone.setPointerCapture(e.pointerId);
    this.zone.classList.add('active');

    const rect = this.zone.getBoundingClientRect();
    this.originX = rect.left + rect.width / 2;
    this.originY = rect.top + rect.height / 2;
    this.applyStick(e.clientX, e.clientY);
  };

  private onStickMove = (e: PointerEvent) => {
    if (e.pointerId !== this.stickPointer) return;
    e.preventDefault();
    this.applyStick(e.clientX, e.clientY);
  };

  private onStickUp = (e: PointerEvent) => {
    if (e.pointerId !== this.stickPointer) return;
    this.stickPointer = null;
    this.zone.classList.remove('active');
    this.knob.style.transform = 'translate3d(0, 0, 0)';
    this.input.setTouchAxis(0, 0);
  };

  private applyStick(clientX: number, clientY: number) {
    let dx = clientX - this.originX;
    let dy = clientY - this.originY;
    const dist = Math.hypot(dx, dy);
    if (dist > KNOB_RADIUS) {
      dx = (dx / dist) * KNOB_RADIUS;
      dy = (dy / dist) * KNOB_RADIUS;
    }
    this.knob.style.transform = `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0)`;

    let ax = dx / KNOB_RADIUS;
    let ay = -dy / KNOB_RADIUS;
    const mag = Math.hypot(ax, ay);
    if (mag < DEAD_ZONE) {
      ax = 0;
      ay = 0;
    } else if (mag > 1) {
      ax /= mag;
      ay /= mag;
    }
    this.input.setTouchAxis(ax, ay);
  }

  private bindHold(el: HTMLElement, code: string) {
    const press = (e: PointerEvent) => {
      e.preventDefault();
      this.input.setVirtual(code, true);
      el.classList.add('held');
      el.setPointerCapture?.(e.pointerId);
    };
    const release = () => {
      this.input.setVirtual(code, false);
      el.classList.remove('held');
    };
    el.addEventListener('pointerdown', press);
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('lostpointercapture', release);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}
