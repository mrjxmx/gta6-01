// Solano Heat — keyboard and mouse state. The game polls `keys` each step and consumes
// one-shot presses through `pressed` (cleared by the game at the end of every frame), which
// keeps menus, doors and dialog advances from firing twice on a held key.

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set();
    this.mouse = { x: 0, y: 0, down: false, clicked: false };
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse.down = false; });
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      this.mouse.x = (e.clientX - rect.left) * (canvas.width / rect.width);
      this.mouse.y = (e.clientY - rect.top) * (canvas.height / rect.height);
    });
    canvas.addEventListener('mousedown', (e) => { if (e.button === 0) { this.mouse.down = true; this.mouse.clicked = true; } });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouse.down = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Held-key check accepting any of the given names ('w', 'arrowup', ...). */
  held(...names) { return names.some((n) => this.keys.has(n)); }
  /** True only on the frame the key went down; a press is consumed by its first reader,
   *  so one tap of E can never both open a door and slam it in the same frame. */
  justPressed(...names) {
    const hit = names.some((n) => this.pressed.has(n));
    if (hit) for (const n of names) this.pressed.delete(n);
    return hit;
  }
  /** End-of-frame housekeeping: one-shot presses and clicks last exactly one frame. */
  endFrame() { this.pressed.clear(); this.mouse.clicked = false; }
}
