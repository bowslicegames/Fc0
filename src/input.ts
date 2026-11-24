export class Input {
  private readonly down = new Set<string>();
  private readonly pressed = new Set<string>();
  private dragX = 0;
  private dragY = 0;
  private wheelDelta = 0;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;

  constructor(el: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());

    el.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointerup', (e) => {
      this.dragging = false;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    });
    el.addEventListener('pointercancel', () => (this.dragging = false));
    el.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.dragX += e.clientX - this.lastX;
      this.dragY += e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.wheelDelta += e.deltaY;
      },
      { passive: false },
    );
  }

  isDown(code: string) {
    return this.down.has(code);
  }

  justPressed(code: string) {
    return this.pressed.has(code);
  }

  axis() {
    const x = (this.isDown('KeyD') || this.isDown('ArrowRight') ? 1 : 0) - (this.isDown('KeyA') || this.isDown('ArrowLeft') ? 1 : 0);
    const y = (this.isDown('KeyW') || this.isDown('ArrowUp') ? 1 : 0) - (this.isDown('KeyS') || this.isDown('ArrowDown') ? 1 : 0);
    return { x, y };
  }

  takeDrag() {
    const d = { x: this.dragX, y: this.dragY };
    this.dragX = 0;
    this.dragY = 0;
    return d;
  }

  takeWheel() {
    const w = this.wheelDelta;
    this.wheelDelta = 0;
    return w;
  }

  endFrame() {
    this.pressed.clear();
  }
}
