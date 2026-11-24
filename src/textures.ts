import * as THREE from 'three';

/** Deterministic RNG so the stadium looks identical every reload. */
export function rng(seed = 20260214) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return { c, ctx };
}

function toTexture(c: HTMLCanvasElement, srgb = true) {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/* ------------------------------------------------------------------ */
/* Grass                                                               */
/* ------------------------------------------------------------------ */

export function makeGrassTexture(): THREE.Texture {
  const { c, ctx } = canvas(1024, 1024);
  const r = rng(7);
  ctx.fillStyle = '#2e6b32';
  ctx.fillRect(0, 0, 1024, 1024);

  // broad tonal patches
  for (let i = 0; i < 90; i++) {
    const g = 70 + r() * 45;
    ctx.fillStyle = `rgba(${22 + r() * 20}, ${g}, ${30 + r() * 20}, 0.16)`;
    ctx.beginPath();
    ctx.ellipse(r() * 1024, r() * 1024, 40 + r() * 200, 30 + r() * 140, r() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  // fine blade noise
  for (let i = 0; i < 42000; i++) {
    const x = r() * 1024;
    const y = r() * 1024;
    const g = 78 + r() * 78;
    ctx.fillStyle = `rgba(${18 + r() * 34}, ${g}, ${26 + r() * 30}, ${0.25 + r() * 0.5})`;
    ctx.fillRect(x, y, 1 + r() * 2, 2 + r() * 4);
  }

  // tiny dry flecks for variety
  for (let i = 0; i < 500; i++) {
    ctx.fillStyle = `rgba(${120 + r() * 40}, ${140 + r() * 30}, 70, ${0.05 + r() * 0.08})`;
    ctx.fillRect(r() * 1024, r() * 1024, 2, 2);
  }

  const tex = toTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(26, 18);
  return tex;
}

/** Soft translucent mowing bands laid over the grass. */
export function makeMowTexture(): THREE.Texture {
  const { c, ctx } = canvas(1024, 128);
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.055)' : 'rgba(0,0,0,0.075)';
    ctx.fillRect(i * 128, 0, 128, 128);
  }
  const tex = toTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 1);
  return tex;
}

/* ------------------------------------------------------------------ */
/* Pitch markings                                                      */
/* ------------------------------------------------------------------ */

export const PITCH = {
  length: 105,
  width: 68,
  goalWidth: 7.32,
  goalHeight: 2.44,
  goalDepth: 2.2,
  penDepth: 16.5,
  penWidth: 40.32,
  goalAreaDepth: 5.5,
  goalAreaWidth: 18.32,
  circle: 9.15,
};

export function makeMarkingsTexture(): THREE.Texture {
  const W = 2048;
  const H = Math.round((W * PITCH.width) / PITCH.length);
  const { c, ctx } = canvas(W, H);
  const s = W / PITCH.length; // px per metre
  const cx = W / 2;
  const cy = H / 2;
  const px = (x: number) => cx + x * s;
  const py = (z: number) => cy + z * s;

  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(248,255,250,0.94)';
  ctx.fillStyle = 'rgba(248,255,250,0.94)';
  ctx.lineWidth = 3.4;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const rect = (x1: number, z1: number, x2: number, z2: number) => {
    ctx.beginPath();
    ctx.rect(px(x1), py(z1), (x2 - x1) * s, (z2 - z1) * s);
    ctx.stroke();
  };

  // outer boundary
  rect(-52.5, -34, 52.5, 34);
  // halfway line
  ctx.beginPath();
  ctx.moveTo(px(0), py(-34));
  ctx.lineTo(px(0), py(34));
  ctx.stroke();
  // centre circle + spot
  ctx.beginPath();
  ctx.arc(px(0), py(0), PITCH.circle * s, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(px(0), py(0), 0.22 * s, 0, Math.PI * 2);
  ctx.fill();

  for (const sign of [-1, 1]) {
    const goalLine = 52.5 * sign;
    // penalty area
    rect(goalLine, -PITCH.penWidth / 2, goalLine - PITCH.penDepth * sign, PITCH.penWidth / 2);
    // six yard box
    rect(goalLine, -PITCH.goalAreaWidth / 2, goalLine - PITCH.goalAreaDepth * sign, PITCH.goalAreaWidth / 2);
    // penalty spot
    const spotX = goalLine - 11 * sign;
    ctx.beginPath();
    ctx.arc(px(spotX), py(0), 0.22 * s, 0, Math.PI * 2);
    ctx.fill();
    // "D" arc — only the part outside the box
    const ratio = (PITCH.penDepth - 11) / PITCH.circle;
    const half = Math.acos(Math.abs(ratio));
    const start = sign > 0 ? Math.PI - half : -half;
    const end = sign > 0 ? Math.PI + half : half;
    ctx.beginPath();
    ctx.arc(px(spotX), py(0), PITCH.circle * s, start, end);
    ctx.stroke();
    // goal mouth hash marks
    ctx.lineWidth = 4.4;
    ctx.beginPath();
    ctx.moveTo(px(goalLine), py(-PITCH.goalWidth / 2));
    ctx.lineTo(px(goalLine), py(PITCH.goalWidth / 2));
    ctx.stroke();
    ctx.lineWidth = 3.4;
  }

  // corner arcs
  const corners: [number, number, number][] = [
    [-52.5, -34, 0],
    [52.5, -34, Math.PI / 2],
    [52.5, 34, Math.PI],
    [-52.5, 34, -Math.PI / 2],
  ];
  for (const [x, z, rot] of corners) {
    ctx.beginPath();
    ctx.arc(px(x), py(z), 1 * s, rot, rot + Math.PI / 2);
    ctx.stroke();
  }

  const tex = toTexture(c);
  tex.anisotropy = 16;
  return tex;
}

/* ------------------------------------------------------------------ */
/* Kits                                                                */
/* ------------------------------------------------------------------ */

export function makeKitTexture(base: string, accent: string, stripeWidth = 0.16): THREE.Texture {
  const { c, ctx } = canvas(512, 512);
  const r = rng(31);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 512, 512);

  // vertical club stripes
  const bandPx = 512 * stripeWidth;
  for (let x = 0; x < 512; x += bandPx * 2) {
    ctx.fillStyle = accent;
    ctx.fillRect(x, 0, bandPx, 512);
  }

  // fabric grain
  for (let i = 0; i < 12000; i++) {
    const a = r() * 0.09;
    ctx.fillStyle = r() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
    ctx.fillRect(r() * 512, r() * 512, 1, 2);
  }

  // subtle vertical shading so the torso reads as a volume
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, 'rgba(255,255,255,0.08)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.14)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  const tex = toTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  return tex;
}

export function makeNumberTexture(number: number): THREE.Texture {
  const { c, ctx } = canvas(256, 256);
  ctx.clearRect(0, 0, 256, 256);
  ctx.font = 'italic 900 176px Inter, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 16;
  ctx.strokeStyle = 'rgba(6,12,16,0.94)';
  ctx.strokeText(String(number), 128, 138);
  ctx.fillStyle = '#f7fff8';
  ctx.fillText(String(number), 128, 138);
  return toTexture(c);
}

export function makeNameTexture(name: string): THREE.Texture {
  const { c, ctx } = canvas(512, 128);
  ctx.clearRect(0, 0, 512, 128);
  ctx.font = '800 62px Inter, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(6,12,16,0.8)';
  ctx.strokeText(name, 256, 68);
  ctx.fillStyle = '#f7fff8';
  ctx.fillText(name, 256, 68);
  return toTexture(c);
}

/* ------------------------------------------------------------------ */
/* Ball                                                                */
/* ------------------------------------------------------------------ */

export function makeBallTexture(): THREE.Texture {
  const { c, ctx } = canvas(1024, 512);
  const r = rng(99);
  ctx.fillStyle = '#f6f8f7';
  ctx.fillRect(0, 0, 1024, 512);

  const pentagon = (x: number, y: number, rad: number, rot: number) => {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = rot + (i / 5) * Math.PI * 2;
      const vx = x + Math.cos(a) * rad;
      const vy = y + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(vx, vy);
      else ctx.lineTo(vx, vy);
    }
    ctx.closePath();
    ctx.fill();
  };

  ctx.fillStyle = '#11161c';
  // staggered pentagon field
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 6; col++) {
      const x = col * 180 + (row % 2) * 90 + 40;
      const y = row * 128 + 70;
      pentagon(x, y, 40 + r() * 3, r() * Math.PI);
    }
  }

  // seams
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = 5;
  for (let i = 0; i < 10; i++) {
    ctx.beginPath();
    ctx.moveTo(r() * 1024, r() * 512);
    ctx.quadraticCurveTo(r() * 1024, r() * 512, r() * 1024, r() * 512);
    ctx.stroke();
  }

  // scuffs
  for (let i = 0; i < 140; i++) {
    ctx.fillStyle = `rgba(70,90,70,${0.03 + r() * 0.06})`;
    ctx.beginPath();
    ctx.ellipse(r() * 1024, r() * 512, 2 + r() * 8, 1 + r() * 4, r() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  return toTexture(c);
}

/* ------------------------------------------------------------------ */
/* Stadium dressing                                                    */
/* ------------------------------------------------------------------ */

export function makeAdTexture(): THREE.Texture {
  const { c, ctx } = canvas(1024, 128);
  ctx.fillStyle = '#08131a';
  ctx.fillRect(0, 0, 1024, 128);

  // panel highlights
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(216,255,62,0.16)' : 'rgba(76,224,255,0.12)';
    ctx.fillRect(i * 256, 0, 4, 128);
  }

  ctx.font = 'italic 900 54px Inter, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const labels = ['ULTIMATE XI', 'MATCHDAY', 'FC MOBILE', 'PLAY BOLD'];
  labels.forEach((label, i) => {
    ctx.fillStyle = i % 2 === 0 ? '#d8ff3e' : '#e9fbff';
    ctx.fillText(label, 128 + i * 256, 66);
  });

  const tex = toTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 1);
  return tex;
}

export function makeNetTexture(): THREE.Texture {
  const { c, ctx } = canvas(128, 128);
  ctx.clearRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 128; i += 16) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 128);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(128, i);
    ctx.stroke();
  }
  const tex = toTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function makeGlowTexture(): THREE.Texture {
  const { c, ctx } = canvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,240,1)');
  g.addColorStop(0.25, 'rgba(255,252,220,0.55)');
  g.addColorStop(0.6, 'rgba(210,240,255,0.14)');
  g.addColorStop(1, 'rgba(200,235,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return toTexture(c);
}

export function makeShadowTexture(): THREE.Texture {
  const { c, ctx } = canvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.45, 'rgba(0,0,0,0.28)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return toTexture(c);
}

export function makeCloudTexture(): THREE.Texture {
  const { c, ctx } = canvas(256, 256);
  const r = rng(5);
  for (let i = 0; i < 26; i++) {
    const x = 40 + r() * 176;
    const y = 70 + r() * 110;
    const rad = 26 + r() * 58;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `rgba(255,255,255,${0.16 + r() * 0.18})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  return toTexture(c);
}
