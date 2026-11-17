// Ashlight — keyboard and mouse. One job: turn raw DOM events into the plain
// input object the world consumes, and report edge-triggered presses.
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.mouseX = 640;
    this.mouseY = 400;
    this.mouseDown = false;
    this.pressed = new Set();
    this.canvas = canvas;
    this.attach(canvas);
  }

  attach(canvas) {
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
    });
    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouseX = ((e.clientX - r.left) / r.width) * canvas.width;
      this.mouseY = ((e.clientY - r.top) / r.height) * canvas.height;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouseDown = true;
      if (e.button === 2) this.pressed.add('DashMouse');
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // Movement vector, normalised, from WASD or arrows.
  moveVector() {
    let x = 0;
    let y = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y += 1;
    if (x !== 0 && y !== 0) {
      const len = Math.hypot(x, y);
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  // The object world.step reads each tick.
  read() {
    const mv = this.moveVector();
    return {
      mx: mv.x,
      my: mv.y,
      aimX: this.mouseX,
      aimY: this.mouseY,
      firing: this.mouseDown || this.keys.has('Space'),
      dash: this.pressed.has('ShiftLeft') || this.pressed.has('ShiftRight') || this.pressed.has('DashMouse'),
    };
  }

  wasPressed(code) {
    return this.pressed.has(code);
  }

  endFrame() {
    this.pressed.clear();
  }
}
