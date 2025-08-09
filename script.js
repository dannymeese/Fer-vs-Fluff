/*
  Fer vs. Fluff — Street Brawler
  Single-file JS game. No external assets required.
*/

(() => {
  'use strict';

  // Canvas setup
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;
  ctx.imageSmoothingEnabled = false;

  // DOM elements
  const overlay = document.getElementById('overlay');
  const startBtn = document.getElementById('startBtn');
  const eggsEl = document.getElementById('eggs');
  const toastEl = document.getElementById('toast');
  const muteBtn = document.getElementById('muteBtn');
  const scoreEntry = document.getElementById('score-entry');
  const usernameInput = document.getElementById('usernameInput');
  const submitScoreBtn = document.getElementById('submitScoreBtn');
  const scoreboardEl = document.getElementById('scoreboard');

  // Game constants
  const GROUND_Y = HEIGHT - 100;
  const GRAVITY = 0.8;
  const FRICTION = 0.8;
  const AIR_FRICTION = 0.95;
  const MAX_EGGS_STORAGE_KEY = 'fer_vs_fluff_eggs';
  const HIGHSCORE_KEY = 'fer_vs_fluff_highscores_v1';

  // Input state
  const keysDown = new Set();

  // Utility
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (min, max) => Math.random() * (max - min) + min;
  const randInt = (min, max) => Math.floor(rand(min, max + 1));
  const now = () => performance.now();
  const TAU = Math.PI * 2;

  // Eggs persistence
  let eggCount = 0;
  try {
    eggCount = parseInt(localStorage.getItem(MAX_EGGS_STORAGE_KEY) || '0', 10) || 0;
  } catch {
    eggCount = 0;
  }
  function setEggs(n) {
    eggCount = Math.max(0, n);
    eggsEl.textContent = `🥚 ${eggCount}`;
    try {
      localStorage.setItem(MAX_EGGS_STORAGE_KEY, String(eggCount));
    } catch {}
  }
  setEggs(eggCount);

  // Highscores (local storage; can be extended later to remote)
  function readScores() { try { return JSON.parse(localStorage.getItem(HIGHSCORE_KEY) || '[]'); } catch { return []; } }
  function writeScores(list) { try { localStorage.setItem(HIGHSCORE_KEY, JSON.stringify(list)); } catch {} }
  function escapeHtml(s){ return s.replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }
  function renderScores() {
    const scores = readScores().sort((a,b)=>b.score-a.score).slice(0, 50);
    if (!scores.length) { scoreboardEl.style.display='none'; return; }
    scoreboardEl.style.display = 'block';
    const rows = scores.map((s,i)=>`<div>${i+1}. ${escapeHtml(s.name)} — ${s.score}</div>`).join('');
    scoreboardEl.innerHTML = '<div style="margin-bottom:6px;"><strong>Scoreboard</strong></div>' + rows;
  }

  // Audio engine (Web Audio API, procedurally generated simple tones)
  const AudioEngine = (() => {
    let ctx = null;
    let masterGain = null;
    let musicGain = null;
    let sfxGain = null;
    let musicNode = null;
    let muted = false;

    function ensureCtx() {
      if (!ctx) {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        masterGain = ctx.createGain();
        musicGain = ctx.createGain();
        sfxGain = ctx.createGain();
        musicGain.gain.value = 0.18;
        sfxGain.gain.value = 0.35;
        musicGain.connect(masterGain);
        sfxGain.connect(masterGain);
        masterGain.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') ctx.resume();
    }

    function setMuted(v) {
      muted = v;
      if (masterGain) masterGain.gain.value = muted ? 0 : 1;
    }
    function isMuted() { return muted; }

    function playTone(freq, dur = 0.12, type = 'sine', gain = 0.5) {
      ensureCtx();
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      g.gain.value = 0;
      osc.connect(g); g.connect(sfxGain);
      const t0 = ctx.currentTime;
      g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    }

    function chord(freqs, dur, type, gainMul = 1) {
      freqs.forEach((f, i) => playTone(f, dur + i * 0.02, type, 0.3 * gainMul));
    }

    function playMusic() {
      ensureCtx();
      if (musicNode) { try { musicNode.stop(); } catch {} musicNode.disconnect(); }
      // Classical motifs: Beethoven (Ode to Joy) and Mozart (Eine kleine Nachtmusik) excerpts
      const odeToJoy = { base: 261.63, seq: [0,0,2,4,4,2,0,-2, -2,0,2,4,4,2,0,-2, -2,0,-2,-5,0, -2,-5,-9] };
      const eineKleine = { base: 392.00, seq: [7,7,7,5,4,5,7,5,4,5,7,7,7,5,4,5,7,5,4,5,7] };
      const motif = (state.waveIndex % 2 === 0) ? odeToJoy : eineKleine;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'square';
      o.connect(g); g.connect(musicGain);
      g.gain.value = 0.12;
      let step = 0;
      const baseInterval = 220; // ms
      const speedup = Math.min(60, state.waveIndex * 6);
      const tickMs = Math.max(120, baseInterval - speedup);
      const interval = setInterval(() => {
        const semis = motif.seq[step % motif.seq.length];
        const f = motif.base * Math.pow(2, semis / 12);
        o.frequency.setValueAtTime(f, ctx.currentTime);
        step++;
      }, tickMs);
      o.start();
      musicNode = { stop: () => { clearInterval(interval); o.stop(); } };
    }

    return { ensureCtx, playTone, chord, playMusic, setMuted, isMuted };
  })();

  function showToast(text, ms = 1200) {
    toastEl.textContent = text;
    toastEl.classList.add('show');
    setTimeout(() => toastEl.classList.remove('show'), ms);
  }

  // Animation variants per spawn
  function pickVariant() {
    return {
      bobSpeed: rand(0.8, 1.3),
      bobMag: rand(1.5, 3.2),
      armSwing: rand(1, 4),
    };
  }

  // Camera (simple shake for hit impact)
  const camera = { shakeMs: 0, shakeMag: 0 };
  function triggerShake(ms = 180, mag = 4) {
    camera.shakeMs = Math.max(camera.shakeMs, ms);
    camera.shakeMag = Math.max(camera.shakeMag, mag);
  }

  // Base entity
  class Entity {
    constructor(x, y, w, h) {
      this.x = x;
      this.y = y;
      this.vx = 0;
      this.vy = 0;
      this.w = w;
      this.h = h;
      this.facing = 1;
      this.onGround = false;
      this.remove = false;
    }
    get rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
  }

  // Particles
  const particles = [];
  function spawnBurst(x, y, color, count = 10, speed = 3) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(0.5, speed);
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(300, 700), color, size: rand(2, 4) });
    }
  }

  // Projectiles
  const projectiles = [];
  class Projectile extends Entity {
    constructor(x, y, w, h, type, facing, damage) {
      super(x, y, w, h);
      this.type = type; // 'heart' | 'flower' | 'cotton' | 'bomb'
      this.facing = facing;
      this.damage = damage;
      this.birth = now();
      this.lifeMs = 2500;
      this.spin = rand(-0.1, 0.1);
      this.rotation = 0;
      this.radius = type === 'bomb' ? 70 : 0; // for AoE
    }
    update(dt) {
      this.vy += this.type === 'flower' ? 0.4 : (this.type === 'cotton' ? 0.2 : (this.type === 'bomb' ? 0.6 : 0));
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.rotation += this.spin * dt;
      if (this.y + this.h > GROUND_Y) {
        this.y = GROUND_Y - this.h;
        if (this.type === 'bomb') {
          this.remove = true; // explode on ground
          // AoE explosion
          spawnBurst(this.x + this.w / 2, this.y + this.h / 2, '#ffdd55', 36, 5);
          triggerShake(320, 8);
          // Damage enemy if within radius
          const ex = this.x + this.w / 2;
          const ey = this.y + this.h / 2;
          const enemy = state.enemy;
          const cx = enemy.x + enemy.w / 2; const cy = enemy.y + enemy.h / 2;
          const dist = Math.hypot(cx - ex, cy - ey);
          if (dist <= this.radius) {
            const killed = enemy.takeDamage(this.damage);
            enemy.vx += Math.sign(cx - ex) * 4;
            enemy.vy -= 5;
            if (killed) onWin();
          }
          AudioEngine.chord([392, 523.25, 659.25], 0.22, 'triangle', 1);
        } else {
          this.vy *= -0.3;
          this.vx *= 0.7;
        }
        if (Math.abs(this.vy) < 0.2) this.vy = 0;
        if (this.type !== 'flower') this.remove = true;
      }
      if (now() - this.birth > this.lifeMs) this.remove = true;
    }
    draw() {
      ctx.save();
      ctx.translate(this.x + this.w / 2, this.y + this.h / 2);
      ctx.rotate(this.rotation);
      if (this.type === 'heart') {
        drawHeart(-this.w / 2, -this.h / 2, this.w, this.h, '#ff4d8d');
      } else if (this.type === 'flower') {
        drawFlower(-this.w / 2, -this.h / 2, this.w, this.h, '#ffd166');
      } else if (this.type === 'cotton') {
        drawPuff(-this.w / 2, -this.h / 2, this.w, this.h, '#ffffff');
      } else if (this.type === 'bomb') {
        drawStar(-this.w / 2, -this.h / 2, this.w, this.h, '#ffec99', '#ff6b6b');
      }
      ctx.restore();
    }
  }

  // Characters
  class Fighter extends Entity {
    constructor(x, y, colorPrimary, colorSecondary) {
      super(x, y, 48, 72);
      this.colorPrimary = colorPrimary;
      this.colorSecondary = colorSecondary;
      this.maxHealth = 100;
      this.health = this.maxHealth;
      this.invMs = 0;
      this.variant = pickVariant();
      this.animT = 0;
    }
    takeDamage(amount) {
      if (this.invMs > 0) return false;
      this.health = clamp(this.health - amount, 0, this.maxHealth);
      this.invMs = 300;
      triggerShake(180, 5);
      spawnBurst(this.x + this.w / 2, this.y + this.h / 2, '#ff6b6b', 12, 3);
      return this.health <= 0;
    }
    updatePhysics(dt) {
      this.animT += dt;
      this.vy += GRAVITY * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if (this.y + this.h >= GROUND_Y) {
        this.y = GROUND_Y - this.h;
        this.vy = 0;
        this.onGround = true;
      } else {
        this.onGround = false;
      }
      if (this.onGround) {
        this.vx *= FRICTION;
      } else {
        this.vx *= AIR_FRICTION;
      }
      this.x = clamp(this.x, 0, WIDTH - this.w);
      if (this.invMs > 0) this.invMs -= dt * 16;
    }
    drawBase() {
      // Body: simple chibi proportions, pixel-arty blocks
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(this.x + this.w / 2, this.y + this.h, this.w * 0.5, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      const flicker = this.invMs > 0 && Math.floor(now() / 60) % 2 === 0;
      if (flicker) return; // blink when invulnerable

      // Leg bob
      const bob = Math.sin(this.animT * this.variant.bobSpeed) * this.variant.bobMag;
      // Legs + cowboy boots
      ctx.fillStyle = '#f3d6b5';
      ctx.fillRect(this.x + 8, this.y + 48 + bob * 0.2, 12, 16);
      ctx.fillRect(this.x + this.w - 20, this.y + 48 - bob * 0.2, 12, 16);
      // Boots
      ctx.fillStyle = '#8b4513';
      ctx.fillRect(this.x + 6, this.y + 64 + bob * 0.2, 16, 8);
      ctx.fillRect(this.x + this.w - 22, this.y + 64 - bob * 0.2, 16, 8);
      // Torso: flowery sundress
      roundedRect(this.x + 6, this.y + 18, this.w - 12, 36, 6, '#ff9ac6', true);
      for (let i = 0; i < 5; i++) {
        drawFlower(this.x + 12 + i * 6, this.y + 24 + (i % 2) * 8, 8, 8, '#ffe27a');
      }
      // Arms swing
      ctx.fillStyle = this.colorSecondary;
      const armSwing = Math.sin(this.animT * (this.variant.bobSpeed + 0.4)) * this.variant.armSwing;
      ctx.fillRect(this.x + (this.facing === 1 ? this.w - 10 : -2), this.y + 24 + armSwing, 12, 18);
      ctx.fillRect(this.x - (this.facing === 1 ? 2 : -this.w + 10), this.y + 28 - armSwing, 12, 18);
      // Head
      roundedRect(this.x + 8, this.y - 4, this.w - 16, 26, 8, '#f8d6c4', true);
      // Hair: long curly black (slightly brown)
      const hairColor = '#2b1a13';
      roundedRect(this.x + 2, this.y - 4, this.w - 4, 16, 10, hairColor, true);
      // Curls
      ctx.fillStyle = hairColor;
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        const cx = this.x + 6 + i * 7;
        const cy = this.y + 18 + Math.sin(this.animT * 0.6 + i) * 1.5;
        ctx.arc(cx, cy, 6, 0, TAU);
        ctx.fill();
      }
      // Eyes
      ctx.fillStyle = '#161616';
      ctx.fillRect(this.x + (this.facing === 1 ? 26 : 14), this.y + 5, 4, 4);
      ctx.fillRect(this.x + (this.facing === 1 ? 34 : 22), this.y + 6, 4, 4);
    }
  }

  class Player extends Fighter {
    constructor() {
      super(120, GROUND_Y - 72, '#ff9ac6', '#ffd166');
      this.kissCooldownMs = 0;
      this.flowerCooldownMs = 0;
      this.bombCooldownMs = 0;
      this.speed = 0.65;
      this.jumpStrength = 15;
      this.name = 'Fer';
    }
    handleInput(dt) {
      const left = keysDown.has('ArrowLeft') || keysDown.has('a');
      const right = keysDown.has('ArrowRight') || keysDown.has('d');
      const jump = keysDown.has('ArrowUp') || keysDown.has('w') || keysDown.has(' ');
      const kiss = keysDown.has('z') || keysDown.has('j');
      const flower = keysDown.has('x') || keysDown.has('k');
      const bomb = keysDown.has('c') || keysDown.has('l');

      if (left && !right) {
        this.vx -= this.speed * dt;
        this.facing = -1;
      } else if (right && !left) {
        this.vx += this.speed * dt;
        this.facing = 1;
      }
      if (jump && this.onGround) {
        this.vy = -this.jumpStrength;
        this.onGround = false;
      }
      if (kiss && this.kissCooldownMs <= 0) {
        this.kissCooldownMs = 300;
        const px = this.facing === 1 ? this.x + this.w - 8 : this.x - 10;
        const py = this.y + 18;
        const proj = new Projectile(px, py, 18, 16, 'heart', this.facing, 10);
        proj.vx = this.facing * 6;
        proj.vy = -0.5;
        projectiles.push(proj);
        AudioEngine.playTone(880, 0.08, 'sine', 0.35);
      }
      if (flower && this.flowerCooldownMs <= 0) {
        this.flowerCooldownMs = 800;
        const px = this.facing === 1 ? this.x + this.w - 8 : this.x - 10;
        const py = this.y + 10;
        const proj = new Projectile(px, py, 16, 16, 'flower', this.facing, 18);
        proj.vx = this.facing * 4.2;
        proj.vy = -4.5;
        projectiles.push(proj);
        AudioEngine.chord([523.25, 659.25, 783.99], 0.18, 'triangle', 0.9); // C5 E5 G5
      }
      if (bomb && this.bombCooldownMs <= 0) {
        this.bombCooldownMs = 2400;
        const px = this.facing === 1 ? this.x + this.w - 8 : this.x - 14;
        const py = this.y + 4;
        const proj = new Projectile(px, py, 20, 20, 'bomb', this.facing, 22);
        proj.vx = this.facing * 3.2;
        proj.vy = -6.5;
        projectiles.push(proj);
        AudioEngine.chord([659.25, 783.99, 987.77], 0.18, 'sawtooth', 0.8); // E5 G5 B5
      }

      if (this.kissCooldownMs > 0) this.kissCooldownMs -= dt * 16;
      if (this.flowerCooldownMs > 0) this.flowerCooldownMs -= dt * 16;
      if (this.bombCooldownMs > 0) this.bombCooldownMs -= dt * 16;
    }
    update(dt) {
      this.handleInput(dt);
      super.updatePhysics(dt);
    }
    draw() {
      this.drawBase();
    }
  }

  class Plush extends Fighter {
    constructor(waveConfig) {
      const w = 92; const h = 118;
      super(WIDTH - 180, GROUND_Y - h, waveConfig.primary, waveConfig.secondary);
      this.w = w; this.h = h;
      this.maxHealth = waveConfig.health;
      this.health = this.maxHealth;
      this.speed = waveConfig.speed;
      this.name = waveConfig.name;
      this.attackCooldownMs = 1000;
      this.attackWindupMs = 0;
      this.projectileCooldownMs = 1500;
      this.variant = pickVariant();
    }
    ai(dt, player) {
      // Face the player
      this.facing = player.x > this.x ? 1 : -1;
      const dist = Math.abs((this.x + this.w / 2) - (player.x + player.w / 2));

      // Movement: approach if far
      if (dist > 120) {
        this.vx += (this.facing === 1 ? this.speed : -this.speed) * 0.4 * dt;
      } else {
        this.vx *= 0.9;
      }

      // Attempt attacks
      this.attackCooldownMs -= dt * 16;
      this.projectileCooldownMs -= dt * 16;

      if (this.attackWindupMs > 0) {
        this.attackWindupMs -= dt * 16;
        if (this.attackWindupMs <= 0) {
          // Deliver swipe attack
          const hitbox = this.facing === 1
            ? { x: this.x + this.w - 14, y: this.y + 20, w: 36, h: 32 }
            : { x: this.x - 22, y: this.y + 20, w: 36, h: 32 };
          if (rectsOverlap(hitbox, player.rect)) {
            const killed = player.takeDamage(14);
            player.vx += this.facing * 3;
            player.vy = -6;
            triggerShake(220, 6);
            spawnBurst(hitbox.x + hitbox.w / 2, hitbox.y + hitbox.h / 2, '#ffffff', 18, 4);
            if (killed) onLose();
            AudioEngine.playTone(196, 0.12, 'square', 0.5);
          }
          this.attackCooldownMs = randInt(600, 1200);
        }
      } else if (this.attackCooldownMs <= 0 && dist < 140) {
        // Start windup
        this.attackWindupMs = 220;
        AudioEngine.playTone(300, 0.08, 'sawtooth', 0.3);
      }

      if (this.projectileCooldownMs <= 0 && dist >= 120) {
        // Launch cotton puff
        const px = this.facing === 1 ? this.x + this.w - 16 : this.x - 16;
        const py = this.y + 24;
        const puff = new Projectile(px, py, 20, 18, 'cotton', this.facing, 10);
        puff.vx = this.facing * rand(2.4, 3.4);
        puff.vy = rand(-3.2, -4.2);
        projectiles.push(puff);
        this.projectileCooldownMs = randInt(1200, 2000);
        AudioEngine.playTone(330, 0.1, 'triangle', 0.35);
      }
    }
    update(dt, player) {
      this.ai(dt, player);
      super.updatePhysics(dt);
    }
    draw() {
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(this.x + this.w / 2, this.y + this.h, this.w * 0.6, 10, 0, 0, Math.PI * 2);
      ctx.fill();

      const flicker = this.invMs > 0 && Math.floor(now() / 60) % 2 === 0;
      if (flicker) return;

      // Big plush body with slight breathing (scale)
      const scale = 1 + Math.sin(this.animT * (0.6 + this.variant.bobSpeed * 0.2)) * 0.02;
      ctx.save();
      ctx.translate(this.x + this.w / 2, this.y + this.h / 2);
      ctx.scale(scale, scale);
      ctx.translate(-this.x - this.w / 2, -this.y - this.h / 2);
      roundedRect(this.x, this.y, this.w, this.h - 12, 18, this.colorPrimary, true);
      // Belly
      roundedRect(this.x + 12, this.y + 22, this.w - 24, this.h - 46, 16, this.colorSecondary, true);
      // Ears
      roundedRect(this.x + 8, this.y - 18, 18, 26, 8, this.colorPrimary, true);
      roundedRect(this.x + this.w - 26, this.y - 18, 18, 26, 8, this.colorPrimary, true);
      // Eyes
      ctx.fillStyle = '#111';
      ctx.fillRect(this.x + (this.facing === 1 ? this.w - 48 : 18), this.y + 18, 6, 8);
      ctx.fillRect(this.x + (this.facing === 1 ? this.w - 30 : 36), this.y + 18, 6, 8);
      // Arms
      const armX = this.facing === 1 ? this.x + this.w - 12 : this.x - 12;
      ctx.fillStyle = this.colorPrimary;
      ctx.fillRect(armX, this.y + 28 + Math.sin(this.animT * 1.1) * 2, 12, 26);
      ctx.restore();
    }
  }

  // Waves (giant stuffed animals)
  const WAVES = [
    { name: 'Plush Bear', health: 90, speed: 0.45, primary: '#8ecae6', secondary: '#edf6f9' },
    { name: 'Mega Bunny', health: 110, speed: 0.50, primary: '#ffc8dd', secondary: '#fff0f6' },
    { name: 'Giga Dino', health: 140, speed: 0.55, primary: '#b9fbc0', secondary: '#e9ffe9' },
    { name: 'Titan Unicorn', health: 160, speed: 0.62, primary: '#cdb4db', secondary: '#f3e8ff' }
  ];

  // Game state
  const state = {
    running: false,
    paused: false,
    lastTs: 0,
    player: null,
    enemy: null,
    waveIndex: 0,
    unlocks: { horse: false, jetpack: false },
    interludeMs: 0,
  };

  function startGame(resetWave = false) {
    overlay.classList.remove('show');
    projectiles.length = 0;
    particles.length = 0;
    state.player = new Player();
    if (resetWave) state.waveIndex = 0;
    spawnWave(state.waveIndex);
    state.running = true;
    state.paused = false;
    state.lastTs = 0;
    requestAnimationFrame(loop);
  }

  function spawnWave(index) {
    const cfg = WAVES[index % WAVES.length];
    // Scale difficulty on cycles
    const cycle = Math.floor(index / WAVES.length);
    const scaled = {
      name: cfg.name + (cycle > 0 ? ` +${cycle}` : ''),
      health: Math.round(cfg.health * (1 + cycle * 0.25)),
      speed: cfg.speed * (1 + cycle * 0.05),
      primary: cfg.primary,
      secondary: cfg.secondary
    };
    state.enemy = new Plush(scaled);
  }

  function nextWave() {
    state.waveIndex += 1;
    spawnWave(state.waveIndex);
  }

  function onWin() {
    setEggs(eggCount + 1);
    awardUnlockForLevel(state.waveIndex + 1);
    startInterlude('You won! +1 🥚');
    AudioEngine.chord([523.25, 659.25, 783.99], 0.5, 'sawtooth', 1);
  }

  function awardUnlockForLevel(level) {
    if (level === 1 && !state.unlocks.horse) {
      state.unlocks.horse = true;
      showToast('Unlocked: Horse 🐴');
    } else if (level === 2 && !state.unlocks.jetpack) {
      state.unlocks.jetpack = true;
      showToast('Unlocked: Jetpack 🚀');
    }
  }

  const ducks = [];
  function startInterlude(message) {
    showToast(message, 1200);
    state.interludeMs = 2200;
    // Spawn a screen of tiny ducks
    ducks.length = 0;
    for (let i = 0; i < 120; i++) {
      ducks.push({
        x: rand(-100, WIDTH + 100),
        y: rand(20, GROUND_Y - 40),
        vx: rand(0.5, 1.8) * (Math.random() < 0.5 ? -1 : 1),
        vy: Math.sin(i) * 0.2,
        t: rand(0, Math.PI * 2),
        s: rand(0.6, 1.2)
      });
    }
    setTimeout(() => {
      nextWave();
      state.interludeMs = 0;
      ducks.length = 0;
    }, state.interludeMs);
  }

  function onLose() {
    state.running = false;
    overlay.querySelector('h1').textContent = 'Fer was overwhelmed!';
    overlay.querySelector('.subtitle').textContent = 'Press Start to try again';
    overlay.querySelector('.desc').textContent = 'Tip: Kisses are fast, flowers hit hard. Jump over puffs!';
    overlay.classList.add('show');
    startBtn.textContent = 'Retry';
    AudioEngine.playTone(130.81, 0.4, 'sine', 0.6);
    // Show score submit UI
    if (typeof scoreEntry !== 'undefined' && scoreEntry) {
      scoreEntry.style.display = 'block';
      renderScores();
    }
  }

  // Collision helpers
  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // Drawing helpers
  function roundedRect(x, y, w, h, r, color, fill = true, stroke = false) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fill) { ctx.fillStyle = color; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = color; ctx.stroke(); }
  }

  function drawHeart(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    const topCurveHeight = h * 0.3;
    ctx.moveTo(x + w / 2, y + h);
    ctx.bezierCurveTo(x + w / 2, y + h - topCurveHeight, x, y + h - topCurveHeight, x, y + h / 2);
    ctx.bezierCurveTo(x, y + h / 4, x + w / 4, y, x + w / 2, y);
    ctx.bezierCurveTo(x + (w * 3) / 4, y, x + w, y + h / 4, x + w, y + h / 2);
    ctx.bezierCurveTo(x + w, y + h - topCurveHeight, x + w / 2, y + h - topCurveHeight, x + w / 2, y + h);
    ctx.fill();
  }

  function drawFlower(x, y, w, h, color) {
    // Simple daisy
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    for (let i = 0; i < 6; i++) {
      ctx.rotate((Math.PI * 2) / 6);
      roundedRect(-w / 2, -h / 6, w, h / 3, 6, color, true);
    }
    roundedRect(-w / 4, -h / 4, w / 2, h / 2, 6, '#ffaf45', true);
    ctx.restore();
  }

  function drawPuff(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + w * 0.3, y + h * 0.6, h * 0.35, 0, Math.PI * 2);
    ctx.arc(x + w * 0.55, y + h * 0.45, h * 0.4, 0, Math.PI * 2);
    ctx.arc(x + w * 0.75, y + h * 0.65, h * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawStar(x, y, w, h, fill, stroke) {
    const cx = x + w / 2; const cy = y + h / 2; const outer = Math.max(w, h) / 2; const inner = outer * 0.5;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const ang = i * (Math.PI / 5) - Math.PI / 2;
      const r = i % 2 === 0 ? outer : inner;
      const px = cx + Math.cos(ang) * r;
      const py = cy + Math.sin(ang) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
  }

function drawBackground(t) {
  // Colorful happy parallax: rainbow, clouds, balloons, grass
  const cx = WIDTH * 0.5;
  const cy = GROUND_Y + 100;
  const colors = ['#ff8da1','#ffd166','#8affc1','#7ad9ff','#c9a0ff'];
  for (let i = 0; i < colors.length; i++) {
    ctx.beginPath();
    ctx.strokeStyle = colors[i];
    ctx.lineWidth = 16;
    ctx.arc(cx, cy, 520 - i * 18, Math.PI, Math.PI * 2);
    ctx.stroke();
  }
  for (let i = 0; i < 6; i++) {
    const x = (t * 0.02 + i * 180) % (WIDTH + 200) - 100;
    drawCloud(x, 80 + (i % 3) * 30, 70 + (i % 2) * 20);
  }
  for (let i = 0; i < 5; i++) {
    const bx = (i * 180 + (t * 0.05)) % (WIDTH + 100) - 50;
    const by = 140 + Math.sin((t * 0.003) + i) * 20;
    drawBalloon(bx, by);
  }
  const grd = ctx.createLinearGradient(0, GROUND_Y, 0, HEIGHT);
  grd.addColorStop(0, '#b7f7a8');
  grd.addColorStop(1, '#88e07f');
  ctx.fillStyle = grd;
  ctx.fillRect(0, GROUND_Y, WIDTH, HEIGHT - GROUND_Y);
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillRect(0, GROUND_Y, WIDTH, 2);
}

function drawCloud(x, y, w) {
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x, y, w * 0.35, 0, TAU);
  ctx.arc(x + w * 0.25, y - 10, w * 0.3, 0, TAU);
  ctx.arc(x + w * 0.5, y, w * 0.35, 0, TAU);
  ctx.fill();
}

function drawBalloon(x, y) {
  const colors = ['#ff6b6b','#ffd166','#6bff95','#6bd0ff','#d66bff'];
  const c = colors[Math.floor((x + y) % colors.length)];
  ctx.strokeStyle = '#888';
  ctx.beginPath();
  ctx.moveTo(x + 6, y + 24);
  ctx.lineTo(x + 6, y + 42);
  ctx.stroke();
  roundedRect(x, y, 18, 24, 9, c, true);
}

  function drawUI(player, enemy) {
    // Health bars
    const barWidth = 360;
    const barHeight = 16;
    const pad = 16;
    // Fer
    drawHealthBar(pad, pad, barWidth, barHeight, player.health / player.maxHealth, '#ff4d8d', 'Fer' + (state.unlocks.horse ? ' +🐴' : '') + (state.unlocks.jetpack ? ' +🚀' : ''));
    // Enemy
    drawHealthBar(WIDTH - barWidth - pad, pad, barWidth, barHeight, enemy.health / enemy.maxHealth, '#73a7ff', enemy.name, true);

    // Eggs label shadow to match top bar
    ctx.font = '12px "Press Start 2P", monospace';
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillText('Kiss: Z/J  Flower: X/K  Bomb: C/L  Perk: Q  Jump: ↑/W/Space  Pause: P', pad + 1, HEIGHT - 18 + 1);
    ctx.fillStyle = '#eaeaea';
    ctx.fillText('Kiss: Z/J  Flower: X/K  Bomb: C/L  Perk: Q  Jump: ↑/W/Space  Pause: P', pad, HEIGHT - 18);

    // Level indicator
    ctx.fillStyle = '#ffd166';
    ctx.fillText(`Level ${state.waveIndex + 1}`, WIDTH / 2 - 60, pad + 12);

    // Unlock hint
    if (state.unlocks.horse || state.unlocks.jetpack) {
      ctx.fillStyle = '#8affc1';
      const perks = [state.unlocks.horse ? 'Horse' : null, state.unlocks.jetpack ? 'Jetpack' : null].filter(Boolean).join(' + ');
      ctx.fillText(`Perk: ${perks}`, WIDTH / 2 - 60, pad + 28);
    }
  }

  function drawDucks(ts) {
    for (const d of ducks) {
      d.t += 0.1;
      d.x += d.vx;
      d.y += Math.sin(d.t) * 0.5;
      drawDuck(d.x, d.y, d.s);
    }
  }
  function drawDuck(x, y, s = 1) {
    ctx.save();
    ctx.translate(x, y); ctx.scale(s, s);
    // Body
    roundedRect(-10, -6, 20, 12, 6, '#fff7a1', true);
    // Head
    roundedRect(8, -10, 12, 12, 6, '#fff7a1', true);
    // Beak
    roundedRect(18, -4, 6, 4, 2, '#ffab70', true);
    // Eye
    ctx.fillStyle = '#333'; ctx.fillRect(15, -6, 2, 2);
    ctx.restore();
  }

  function drawHealthBar(x, y, w, h, pct, color, label, right = false) {
    roundedRect(x - 2, y - 2, w + 4, h + 8, 8, 'rgba(0,0,0,0.35)', true);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x, y, w, h);
    const inner = clamp(pct, 0, 1) * w;
    const grad = ctx.createLinearGradient(x, y, x + w, y);
    grad.addColorStop(0, color);
    grad.addColorStop(1, '#222');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, inner, h);
    ctx.fillStyle = '#eaeaea';
    ctx.font = '12px "Press Start 2P", monospace';
    const textY = y + h + 7;
    if (right) {
      ctx.textAlign = 'right';
      ctx.fillText(label, x + w, textY);
      ctx.textAlign = 'left';
    } else {
      ctx.fillText(label, x, textY);
    }
  }

  function drawScanlines() {
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#000';
    for (let y = 0; y < HEIGHT; y += 3) ctx.fillRect(0, y, WIDTH, 1);
    ctx.restore();
  }

  // Main loop
  function loop(ts) {
    if (!state.running) return;
    if (!state.lastTs) state.lastTs = ts;
    const dt = Math.min(2, (ts - state.lastTs) / 16.67); // normalize to ~60fps steps
    state.lastTs = ts;

    // Update
    if (!state.paused) {
      update(dt, ts);
    }

    // Draw with slight camera shake
    ctx.save();
    let ox = 0, oy = 0;
    if (camera.shakeMs > 0) {
      camera.shakeMs -= dt * 16;
      ox = rand(-camera.shakeMag, camera.shakeMag);
      oy = rand(-camera.shakeMag, camera.shakeMag);
    }
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.translate(ox, oy);
    drawBackground(ts);
    state.player.draw();
    state.enemy.draw();
    // Projectiles
    for (const p of projectiles) p.draw();
    // Particles
    for (const p of particles) {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = clamp(p.life / 700, 0, 1);
      ctx.fillRect(p.x, p.y, p.size, p.size);
      ctx.globalAlpha = 1;
    }
    drawUI(state.player, state.enemy);
    if (state.interludeMs > 0) {
      drawDucks(ts);
    }
    drawScanlines();
    ctx.restore();

    requestAnimationFrame(loop);
  }

  function update(dt, ts) {
    const player = state.player;
    const enemy = state.enemy;

    if (state.interludeMs > 0) {
      // Freeze gameplay between levels
      projectiles.length = 0;
      return;
    }

    player.update(dt);
    enemy.update(dt, player);

    // Apply unlock abilities
    if (state.unlocks.horse && state.unlocks._active) {
      // Slight speed boost
      player.vx *= 1.02;
    }
    if (state.unlocks.jetpack && state.unlocks._active && keysDown.has(' ')) {
      // Hold jump to hover a bit
      player.vy = Math.min(player.vy, 1.2);
      if (!player.onGround) spawnBurst(player.x + player.w / 2, player.y + player.h, '#ffffff', 1, 1);
    }

    // Projectile updates and collisions
    for (const proj of projectiles) {
      proj.update(dt);
      // Collisions
      if (proj.type === 'heart' || proj.type === 'flower') {
        if (rectsOverlap(proj.rect, enemy.rect)) {
          proj.remove = true;
          const killed = enemy.takeDamage(proj.damage);
          enemy.vx += proj.facing * 2;
          enemy.vy -= 2;
          spawnBurst(proj.x + proj.w / 2, proj.y + proj.h / 2, '#ffd166', 12, 3);
          if (killed) onWin();
        }
      } else if (proj.type === 'cotton') {
        if (rectsOverlap(proj.rect, player.rect)) {
          proj.remove = true;
          const killed = player.takeDamage(proj.damage);
          player.vx += proj.facing * 2.2;
          player.vy -= 3.2;
          spawnBurst(proj.x + proj.w / 2, proj.y + proj.h / 2, '#ffffff', 10, 2.5);
          AudioEngine.playTone(180, 0.1, 'square', 0.4);
          if (killed) onLose();
        }
      }
    }
    // Remove dead projectiles
    for (let i = projectiles.length - 1; i >= 0; i--) if (projectiles[i].remove) projectiles.splice(i, 1);

    // Particles update
    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 0.05 * dt;
      p.life -= dt * 16;
    }
    for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life <= 0) particles.splice(i, 1);
  }

  // Input
  window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    keysDown.add(key);
    if (key === 'p') {
      state.paused = !state.paused;
      showToast(state.paused ? 'Paused' : 'Resumed', 600);
      if (!state.paused) AudioEngine.ensureCtx();
    }
    if (key === 'q') {
      state.unlocks._active = !state.unlocks._active;
      showToast(state.unlocks._active ? 'Perks ON' : 'Perks OFF');
    }
    if (overlay.classList.contains('show') && (key === 'enter' || key === ' ')) {
      e.preventDefault();
      startGame(startBtn.textContent === 'Retry');
      if (scoreEntry) scoreEntry.style.display = 'none';
      if (scoreboardEl) scoreboardEl.style.display = 'none';
    }
  });
  window.addEventListener('keyup', (e) => {
    keysDown.delete(e.key.toLowerCase());
  });
  window.addEventListener('blur', () => {
    state.paused = true;
  });

  startBtn.addEventListener('click', () => {
    startGame(startBtn.textContent === 'Retry');
    if (scoreEntry) scoreEntry.style.display = 'none';
    if (scoreboardEl) scoreboardEl.style.display = 'none';
  });
  if (typeof submitScoreBtn !== 'undefined' && submitScoreBtn) {
    submitScoreBtn.addEventListener('click', () => {
      const name = (usernameInput?.value || 'Player').trim().slice(0,16) || 'Player';
      const score = eggCount * 100 + state.waveIndex * 10;
      const list = readScores();
      list.push({ name, score, ts: Date.now() });
      writeScores(list);
      renderScores();
    });
  }

  // Mute toggle
  function syncMuteBtn() {
    muteBtn.textContent = AudioEngine.isMuted() ? '🔇' : '🔊';
  }
  muteBtn.addEventListener('click', () => {
    AudioEngine.setMuted(!AudioEngine.isMuted());
    syncMuteBtn();
  });
  syncMuteBtn();

  // Autostart music on first interaction
  function kickMusicOnce() {
    AudioEngine.ensureCtx();
    AudioEngine.playMusic();
    window.removeEventListener('pointerdown', kickMusicOnce);
    window.removeEventListener('keydown', kickMusicOnce);
  }
  window.addEventListener('pointerdown', kickMusicOnce);
  window.addEventListener('keydown', kickMusicOnce);

  // Initial overlay content
  overlay.querySelector('h1').textContent = 'Fer vs. Fluff';
  startBtn.textContent = 'Start';

})();


