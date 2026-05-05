// Standalone CHIP-8 emulator core (ES module)
export default class Chip8 {
  constructor() {
    this.reset();
    this._loadFontset();
  }

  reset() {
    this.memory = new Uint8Array(4096);
    this.V = new Uint8Array(16);
    this.I = 0;
    this.pc = 0x200;
    this.stack = new Uint16Array(16);
    this.sp = 0;
    this.delayTimer = 0;
    this.soundTimer = 0;
    this.gfx = new Uint8Array(64 * 32); 
    this.keys = new Uint8Array(16); 
    this.drawFlag = false;
    this.paused = true;
    this.opcode = 0;
    this.waitKey = null; 
  }

  _loadFontset() {
    const fontset = [
      0xF0,0x90,0x90,0x90,0xF0, 0x20,0x60,0x20,0x20,0x70,
      0xF0,0x10,0xF0,0x80,0xF0, 0xF0,0x10,0xF0,0x10,0xF0,
      0x90,0x90,0xF0,0x10,0x10, 0xF0,0x80,0xF0,0x10,0xF0,
      0xF0,0x80,0xF0,0x90,0xF0, 0xF0,0x10,0x20,0x40,0x40,
      0xF0,0x90,0xF0,0x90,0xF0, 0xF0,0x90,0xF0,0x10,0xF0,
      0xF0,0x90,0xF0,0x90,0x90, 0xE0,0x90,0xE0,0x90,0xE0,
      0xF0,0x80,0x80,0x80,0xF0, 0xE0,0x90,0x90,0x90,0xE0,
      0xF0,0x80,0xF0,0x80,0xF0, 0xF0,0x80,0xF0,0x80,0x80
    ];
    for (let i = 0; i < fontset.length; i++) this.memory[i] = fontset[i];
  }

  loadRom(arrayBuffer) {
    this.reset();
    const bytes = new Uint8Array(arrayBuffer);
    for (let i = 0; i < bytes.length && (0x200 + i) < this.memory.length; i++) {
      this.memory[0x200 + i] = bytes[i];
    }
    this.paused = true;
    this.drawFlag = true;
  }

  cycle() {
    if (this.paused) return;

    const opcode = (this.memory[this.pc] << 8) | this.memory[this.pc + 1];
    this.opcode = opcode;
    this.pc = (this.pc + 2) & 0xFFF;

    const x = (opcode & 0x0F00) >> 8;
    const y = (opcode & 0x00F0) >> 4;
    const nnn = opcode & 0x0FFF;
    const kk = opcode & 0x00FF;
    const n = opcode & 0x000F;

    switch (opcode & 0xF000) {
      case 0x0000:
        if (opcode === 0x00E0) { 
          this.gfx.fill(0);
          this.drawFlag = true;
        } else if (opcode === 0x00EE) { 
          this.sp = (this.sp - 1) & 0xF;
          this.pc = this.stack[this.sp];
        }
        break;
      case 0x1000: this.pc = nnn; break;
      case 0x2000: 
        this.stack[this.sp] = this.pc;
        this.sp = (this.sp + 1) & 0xF;
        this.pc = nnn;
        break;
      case 0x3000: if (this.V[x] === kk) this.pc = (this.pc + 2) & 0xFFF; break;
      case 0x4000: if (this.V[x] !== kk) this.pc = (this.pc + 2) & 0xFFF; break;
      case 0x5000: if (this.V[x] === this.V[y]) this.pc = (this.pc + 2) & 0xFFF; break;
      case 0x6000: this.V[x] = kk; break;
      case 0x7000: this.V[x] = (this.V[x] + kk) & 0xFF; break;
      case 0x8000:
        switch (n) {
          case 0x0: this.V[x] = this.V[y]; break;
          case 0x1: this.V[x] |= this.V[y]; break;
          case 0x2: this.V[x] &= this.V[y]; break;
          case 0x3: this.V[x] ^= this.V[y]; break;
          case 0x4: {
            const sum = this.V[x] + this.V[y];
            this.V[0xF] = sum > 0xFF ? 1 : 0;
            this.V[x] = sum & 0xFF;
            break;
          }
          case 0x5:
            this.V[0xF] = this.V[x] >= this.V[y] ? 1 : 0;
            this.V[x] = (this.V[x] - this.V[y]) & 0xFF;
            break;
          case 0x6:
            this.V[0xF] = this.V[x] & 0x1;
            this.V[x] = this.V[x] >> 1;
            break;
          case 0x7:
            this.V[0xF] = this.V[y] >= this.V[x] ? 1 : 0;
            this.V[x] = (this.V[y] - this.V[x]) & 0xFF;
            break;
          case 0xE:
            this.V[0xF] = (this.V[x] & 0x80) >> 7;
            this.V[x] = (this.V[x] << 1) & 0xFF;
            break;
        }
        break;
      case 0x9000: if (this.V[x] !== this.V[y]) this.pc = (this.pc + 2) & 0xFFF; break;
      case 0xA000: this.I = nnn; break;
      case 0xB000: this.pc = (nnn + this.V[0]) & 0xFFF; break;
      case 0xC000:
        this.V[x] = (Math.floor(Math.random() * 256) & kk) & 0xFF;
        break;
      case 0xD000: { 
        const vx = this.V[x] % 64;
        const vy = this.V[y] % 32;
        const height = n;
        this.V[0xF] = 0;
        for (let row = 0; row < height; row++) {
          const sprite = this.memory[(this.I + row) & 0xFFF];
          for (let col = 0; col < 8; col++) {
            if ((sprite & (0x80 >> col)) !== 0) {
              const px = (vx + col);
              const py = (vy + row);
              if (px >= 64 || py >= 32) continue;
              const idx = px + (py * 64);
              if (this.gfx[idx] === 1) this.V[0xF] = 1;
              this.gfx[idx] ^= 1;
            }
          }
        }
        this.drawFlag = true;
        break;
      }
      case 0xE000:
        if ((opcode & 0x00FF) === 0x9E) { if (this.keys[this.V[x]] === 1) this.pc = (this.pc + 2) & 0xFFF; }
        if ((opcode & 0x00FF) === 0xA1) { if (this.keys[this.V[x]] === 0) this.pc = (this.pc + 2) & 0xFFF; }
        break;
      case 0xF000:
        switch (opcode & 0x00FF) {
          case 0x07: this.V[x] = this.delayTimer; break;
          case 0x0A: 
            this.paused = true;
            this.waitKey = (k) => { this.V[x] = k & 0xF; this.waitKey = null; this.paused = false; };
            break;
          case 0x15: this.delayTimer = this.V[x]; break;
          case 0x18: this.soundTimer = this.V[x]; break;
          case 0x1E: this.I = (this.I + this.V[x]) & 0xFFFF; break;
          case 0x29: this.I = (this.V[x] & 0xF) * 5; break;
          case 0x33: {
            let val = this.V[x];
            this.memory[this.I + 2] = val % 10;
            val = Math.floor(val / 10);
            this.memory[this.I + 1] = val % 10;
            val = Math.floor(val / 10);
            this.memory[this.I] = val % 10;
            break;
          }
          case 0x55:
            for (let i = 0; i <= x; i++) this.memory[this.I + i] = this.V[i];
            break;
          case 0x65:
            for (let i = 0; i <= x; i++) this.V[i] = this.memory[this.I + i];
            break;
        }
        break;
    }
  }

  tickTimers() {
    if (this.delayTimer > 0) this.delayTimer = Math.max(0, this.delayTimer - 1);
    if (this.soundTimer > 0) this.soundTimer = Math.max(0, this.soundTimer - 1);
  }

  setKey(keyIndex, pressed) {
    keyIndex &= 0xF;
    this.keys[keyIndex] = pressed ? 1 : 0;
    if (this.waitKey && pressed) {
      const cb = this.waitKey;
      this.waitKey = null;
      cb(keyIndex);
    }
  }

  getFramebuffer() { return this.gfx; }
  getDrawFlag() { return this.drawFlag; }
  clearDrawFlag() { this.drawFlag = false; }
}