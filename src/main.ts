import { Application, BlurFilter, Container, Graphics, Text, TextStyle } from 'pixi.js';

// ---------- Config ----------
const SYMBOLS = ['🍒', '🍋', '🔔', '⭐', '💎', '7️⃣'];
const REEL_COUNT = 5;
const ROWS = 3;
const SYMBOL_SIZE = 120;
const REEL_WIDTH = 130;

const REELS_WIDTH = REEL_COUNT * REEL_WIDTH;
const REELS_HEIGHT = ROWS * SYMBOL_SIZE;
const BUTTON_W = 220;
const BUTTON_H = 64;

// Layout extents (used to center & scale the machine on any screen)
const TOP_SPACE = 90; // room for the "WIN" text above the reels
const FULL_W = REELS_WIDTH + 40;
const FULL_H = TOP_SPACE + REELS_HEIGHT + 50 + BUTTON_H + 20;

type Reel = {
  symbols: Text[];
  position: number;
  previousPosition: number;
  blur: BlurFilter;
};

type Tween = {
  reel: Reel;
  from: number;
  to: number;
  start: number;
  duration: number;
  onComplete: () => void;
};

const randomSymbol = () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];

// Easing with a small overshoot: the reel rolls slightly past the target and settles back
const backout = (amount: number) => (t: number) => --t * t * ((amount + 1) * t + amount) + 1;
const easeBackout = backout(0.5);

async function init() {
  document.body.style.margin = '0';
  document.body.style.overflow = 'hidden';

  const app = new Application();
  await app.init({ background: '#1a1a2e', resizeTo: window, antialias: true });
  document.body.appendChild(app.canvas);

  const machine = new Container();
  app.stage.addChild(machine);

  // ---------- Frame ----------
  const frame = new Graphics()
    .roundRect(-20, -20, REELS_WIDTH + 40, REELS_HEIGHT + 40, 24)
    .fill(0x16213e)
    .stroke({ width: 4, color: 0xf5c518 });
  machine.addChild(frame);

  // ---------- Reels ----------
  const reelsContainer = new Container();
  machine.addChild(reelsContainer);

  const symbolStyle = new TextStyle({ fontSize: 80 });
  const reels: Reel[] = [];

  for (let i = 0; i < REEL_COUNT; i++) {
    const reelContainer = new Container();
    reelContainer.x = i * REEL_WIDTH;
    reelsContainer.addChild(reelContainer);

    const blur = new BlurFilter({ strength: 0 });
    reelContainer.filters = [blur];

    // ROWS visible symbols + 1 hidden above, which gets a new random symbol when it wraps
    const symbols: Text[] = [];
    for (let j = 0; j < ROWS + 1; j++) {
      const symbol = new Text({ text: randomSymbol(), style: symbolStyle });
      symbol.anchor.set(0.5);
      symbol.x = REEL_WIDTH / 2;
      symbols.push(symbol);
      reelContainer.addChild(symbol);
    }

    reels.push({ symbols, position: 0, previousPosition: 0, blur });
  }

  // Mask: only the visible window of the reels is rendered
  const mask = new Graphics().rect(0, 0, REELS_WIDTH, REELS_HEIGHT).fill(0xffffff);
  machine.addChild(mask);
  reelsContainer.mask = mask;

  // ---------- Win highlight & text ----------
  const highlight = new Graphics();
  machine.addChild(highlight);

  const winText = new Text({
    text: '',
    style: { fontFamily: 'Arial', fontSize: 36, fontWeight: 'bold', fill: 0xf5c518 },
  });
  winText.anchor.set(0.5, 1);
  winText.position.set(REELS_WIDTH / 2, -35);
  machine.addChild(winText);

  // ---------- SPIN button ----------
  const button = new Container();
  button.addChild(new Graphics().roundRect(0, 0, BUTTON_W, BUTTON_H, 18).fill(0xe94560));
  const label = new Text({
    text: 'SPIN',
    style: { fontFamily: 'Arial', fontSize: 30, fontWeight: 'bold', fill: 0xffffff },
  });
  label.anchor.set(0.5);
  label.position.set(BUTTON_W / 2, BUTTON_H / 2);
  button.addChild(label);
  button.position.set((REELS_WIDTH - BUTTON_W) / 2, REELS_HEIGHT + 50);
  button.eventMode = 'static';
  button.cursor = 'pointer';
  machine.addChild(button);

  // ---------- Animation loop ----------
  const tweens: Tween[] = [];

  app.ticker.add(() => {
    // 1. Advance tweens
    const now = performance.now();
    for (let i = tweens.length - 1; i >= 0; i--) {
      const t = tweens[i];
      const phase = Math.min(1, (now - t.start) / t.duration);
      t.reel.position = t.from + (t.to - t.from) * easeBackout(phase);
      if (phase === 1) {
        t.reel.position = t.to;
        tweens.splice(i, 1);
        t.onComplete();
      }
    }

    // 2. Place symbols according to reel position
    for (const reel of reels) {
      reel.blur.strengthY = Math.abs(reel.position - reel.previousPosition) * 8;
      reel.previousPosition = reel.position;

      reel.symbols.forEach((symbol, j) => {
        const prevY = symbol.y;
        symbol.y = ((reel.position + j) % reel.symbols.length) * SYMBOL_SIZE - SYMBOL_SIZE / 2;
        // Symbol wrapped from the bottom to the hidden top slot -> give it a new random face
        if (symbol.y < 0 && prevY > SYMBOL_SIZE) {
          symbol.text = randomSymbol();
        }
      });
    }
  });

  // ---------- Game logic ----------
  function symbolAt(reel: Reel, row: number): string {
    const n = reel.symbols.length;
    const index = reel.symbols.findIndex((_, j) => (reel.position + j) % n === row + 1);
    return reel.symbols[index].text;
  }

  function checkWin() {
    highlight.clear();
    let best = 0;

    for (let row = 0; row < ROWS; row++) {
      const line = reels.map((reel) => symbolAt(reel, row));
      let count = 1;
      while (count < line.length && line[count] === line[0]) count++;

      if (count >= 3) {
        best = Math.max(best, count);
        highlight
          .roundRect(4, row * SYMBOL_SIZE + 6, count * REEL_WIDTH - 8, SYMBOL_SIZE - 12, 16)
          .stroke({ width: 4, color: 0xf5c518 });
      }
    }

    winText.text = best ? `WIN! ${best} in a row` : '';
  }

  let running = false;

  function spin() {
    if (running) return;
    running = true;
    button.alpha = 0.5;
    highlight.clear();
    winText.text = '';

    let finished = 0;
    reels.forEach((reel, i) => {
      const extra = Math.floor(Math.random() * 3);
      tweens.push({
        reel,
        from: reel.position,
        to: reel.position + 10 + i * 5 + extra,
        start: performance.now(),
        duration: 2000 + i * 400 + extra * 300,
        onComplete: () => {
          finished++;
          if (finished === reels.length) {
            running = false;
            button.alpha = 1;
            checkWin();
          }
        },
      });
    });
  }

  button.on('pointertap', spin);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      spin();
    }
  });

  // ---------- Responsive layout ----------
  function layout() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const scale = Math.min(1, (w - 20) / FULL_W, (h - 20) / FULL_H);
    machine.scale.set(scale);
    machine.x = Math.round((w - REELS_WIDTH * scale) / 2);
    machine.y = Math.round((h - FULL_H * scale) / 2 + TOP_SPACE * scale);
  }

  layout();
  window.addEventListener('resize', layout);
}

init();