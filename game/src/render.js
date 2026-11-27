// Everything the eye sees: a pseudo-3D chase view over seeded terrain, the runway
// and the rings projected from world space, the aircraft drawn in code, and a lit
// instrument HUD. The logical field is 1280x720; the canvas scales to fit.
import { FIELD, FONT, FONT_MONO, MISSIONS, NM_TO_FT, PALETTE, RUNWAY } from './config.js';

export const SCREEN_TITLE = 0;
export const SCREEN_PLAY = 1;
export const SCREEN_PAUSED = 2;
export const SCREEN_OVER = 3;
export const SCREEN_WIN = 4;
export const SCREEN_MISSION = 5;

const PPD = FIELD.height / 55; // pixels per degree of vertical angle
const FOCAL = 690; // pixels of focal length for sizing world objects
const CX = FIELD.width / 2;
const CY = FIELD.height / 2;

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

function wrapDeg(d) {
  let x = d % 360;
  if (x > 180) x -= 360;
  if (x < -180) x += 360;
  return x;
}

function fmt(n) {
  return Math.round(n).toLocaleString('en-US');
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let view = { scale: 1, ox: 0, oy: 0 };

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    const scale = Math.min(canvas.width / FIELD.width, canvas.height / FIELD.height);
    view = {
      scale,
      ox: (canvas.width - FIELD.width * scale) / 2,
      oy: (canvas.height - FIELD.height * scale) / 2,
    };
  }

  /** Project a world point into unbanked screen space. */
  function project(state, x, z, alt) {
    const dx = (x - state.x) * NM_TO_FT;
    const dz = (z - state.z) * NM_TO_FT;
    const dh = alt - state.alt;
    const dist = Math.hypot(dx, dz);
    const bearing = (Math.atan2(dx, -dz) * 180) / Math.PI;
    const rb = wrapDeg(bearing - state.heading);
    const va = (Math.atan2(dh, Math.max(1, dist)) * 180) / Math.PI;
    const horizonY = CY + state.pitch * PPD;
    const sx = CX + (rb / 70) * (FIELD.width * 0.72);
    const sy = horizonY - va * PPD;
    return { x: sx, y: sy, dist, rb, ok: Math.abs(rb) < 78 };
  }

  /** Rotate a point around the screen centre by the bank angle. */
  function banked(state, x, y) {
    const rad = (-state.bank * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const dx = x - CX;
    const dy = y - CY;
    return { x: CX + dx * cos - dy * sin, y: CY + dx * sin + dy * cos };
  }

  function horizonY(state) {
    return CY + state.pitch * PPD;
  }

  function drawSky(state) {
    const sky = state.mission.sky;
    const g = ctx.createLinearGradient(0, 0, 0, FIELD.height);
    g.addColorStop(0, sky.top);
    g.addColorStop(0.45, sky.mid);
    g.addColorStop(0.62, sky.low);
    g.addColorStop(1, '#5d6b52');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    // Sun with a soft glow.
    const sx = state.mission.sunX * FIELD.width;
    const sy = state.mission.sunY * FIELD.height;
    const glow = ctx.createRadialGradient(sx, sy, 4, sx, sy, 130);
    glow.addColorStop(0, 'rgba(255, 240, 190, 0.9)');
    glow.addColorStop(0.25, 'rgba(255, 220, 140, 0.35)');
    glow.addColorStop(1, 'rgba(255, 220, 140, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sx - 140, sy - 140, 280, 280);
    ctx.fillStyle = sky.sun;
    ctx.beginPath();
    ctx.arc(sx, sy, 26, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawClouds(state) {
    for (const cloud of state.clouds) {
      const p = project(state, cloud.x, cloud.z, cloud.alt);
      if (!p.ok || p.dist > 22 * NM_TO_FT) continue;
      const b = banked(state, p.x, p.y);
      const r = clamp((cloud.scale * 2600) / Math.max(800, p.dist) * FOCAL * 0.2, 14, 170);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
      ctx.beginPath();
      ctx.ellipse(b.x, b.y, r, r * 0.38, 0, 0, Math.PI * 2);
      ctx.ellipse(b.x - r * 0.55, b.y + r * 0.1, r * 0.6, r * 0.3, 0, 0, Math.PI * 2);
      ctx.ellipse(b.x + r * 0.55, b.y + r * 0.08, r * 0.65, r * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawRidges(state) {
    const colors = ['rgba(122, 138, 168, 0.55)', 'rgba(88, 102, 132, 0.75)'];
    state.ridges.forEach((ring, layer) => {
      ctx.fillStyle = colors[layer];
      ctx.beginPath();
      let started = false;
      for (const pt of ring) {
        const rb = wrapDeg(pt.bearing - state.heading);
        if (Math.abs(rb) > 80) {
          started = false;
          continue;
        }
        const p = project(state, Math.sin((pt.bearing * Math.PI) / 180) * pt.dist,
          -Math.cos((pt.bearing * Math.PI) / 180) * pt.dist, pt.height);
        const b = banked(state, p.x, p.y);
        if (!started) {
          ctx.moveTo(b.x, b.y);
          started = true;
        } else ctx.lineTo(b.x, b.y);
      }
      if (started) {
        ctx.lineTo(FIELD.width, FIELD.height);
        ctx.lineTo(0, FIELD.height);
        ctx.closePath();
        ctx.fill();
      }
    });
  }

  function drawGround(state) {
    const hy = horizonY(state);
    ctx.save();
    ctx.translate(CX, CY);
    ctx.rotate((-state.bank * Math.PI) / 180);
    ctx.translate(-CX, -CY);
    // Rolling ground below the horizon.
    const g = ctx.createLinearGradient(0, hy, 0, FIELD.height);
    g.addColorStop(0, '#7d9b5e');
    g.addColorStop(0.5, '#5d8148');
    g.addColorStop(1, '#46663a');
    ctx.fillStyle = g;
    ctx.fillRect(-40, hy, FIELD.width + 80, FIELD.height - hy + 40);
    // Field strips, closer together toward the horizon, with darker field
    // patches scattered on each strip so the ground reads as farmland, not bars.
    const bands = ['#6b8f4e', '#7fa05c', '#5d8148', '#8aa765', '#557a40'];
    for (let i = 0; i < 7; i += 1) {
      const y0 = hy + (i + 1) * (i + 1) * 7;
      const y1 = hy + (i + 2) * (i + 2) * 7;
      if (y0 > FIELD.height) break;
      ctx.fillStyle = bands[i % bands.length];
      ctx.globalAlpha = 0.5;
      ctx.fillRect(-40, y0, FIELD.width + 80, Math.min(y1, FIELD.height) - y0);
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = i % 2 === 0 ? '#4e6e3e' : '#93a95e';
      const ph = Math.min(y1, FIELD.height) - y0;
      for (let k = 0; k < 4; k += 1) {
        const px = ((i * 379 + k * 331) % 1200) - 40;
        const pw = 90 + ((i * 173 + k * 211) % 180);
        ctx.fillRect(px, y0 + 1, pw, Math.max(1, ph - 2));
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    // River: a blue ribbon winding through the valley.
    ctx.strokeStyle = '#5a8fc4';
    ctx.lineCap = 'round';
    ctx.beginPath();
    let pen = false;
    for (const pt of state.river) {
      const p = project(state, pt.x, pt.z, 130);
      if (!p.ok) {
        pen = false;
        continue;
      }
      const b = banked(state, p.x, p.y);
      ctx.lineWidth = clamp(9000 / Math.max(1000, p.dist) * 4, 1, 10);
      if (!pen) {
        ctx.moveTo(b.x, b.y);
        pen = true;
      } else ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
    // Road from the town to the runway.
    ctx.strokeStyle = '#8d8578';
    ctx.beginPath();
    pen = false;
    for (const pt of state.road) {
      const p = project(state, pt.x, pt.z, 130);
      if (!p.ok) {
        pen = false;
        continue;
      }
      const b = banked(state, p.x, p.y);
      ctx.lineWidth = clamp(6000 / Math.max(1000, p.dist) * 3, 1, 6);
      if (!pen) {
        ctx.moveTo(b.x, b.y);
        pen = true;
      } else ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
  }

  function drawRunway(state) {
    const halfW = RUNWAY.widthFt / 2;
    const x0 = RUNWAY.x * NM_TO_FT - RUNWAY.lengthFt / 2;
    const x1 = RUNWAY.x * NM_TO_FT + RUNWAY.lengthFt / 2;
    const corners = [
      project(state, x0 / NM_TO_FT, (-halfW) / NM_TO_FT, 122),
      project(state, x0 / NM_TO_FT, halfW / NM_TO_FT, 122),
      project(state, x1 / NM_TO_FT, halfW / NM_TO_FT, 122),
      project(state, x1 / NM_TO_FT, (-halfW) / NM_TO_FT, 122),
    ];
    const anyVisible = corners.some((c) => c.ok) || corners.some((c) => c.dist < 13 * NM_TO_FT);
    if (!anyVisible) return;
    const pts = corners.map((c) => banked(state, c.x, c.y));
    ctx.fillStyle = '#3c4148';
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < 4; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Centreline dashes.
    ctx.fillStyle = '#f5f5f5';
    for (let d = -2600; d <= 2600; d += 400) {
      const p = project(state, (RUNWAY.x * NM_TO_FT + d) / NM_TO_FT, 0, 123);
      if (!p.ok) continue;
      const b = banked(state, p.x, p.y);
      const w = clamp(3000 / Math.max(800, p.dist) * 6, 2, 14);
      ctx.fillRect(b.x - w / 2, b.y - 1.5, w, 3);
    }
    // Threshold bars and the big 09.
    const th = project(state, (RUNWAY.x * NM_TO_FT - RUNWAY.lengthFt / 2 + 120) / NM_TO_FT, 0, 124);
    if (th.ok) {
      const b = banked(state, th.x, th.y);
      const s = clamp(9000 / Math.max(800, th.dist) * 2.2, 4, 44);
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.round(s)}px ${FONT_MONO}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('09', b.x, b.y - s * 0.4);
    }
    // PAPI lights: white above the glidepath, red below it.
    const distToTh = Math.hypot(state.x * NM_TO_FT - x0, state.z * NM_TO_FT);
    const glideAlt = 120 + distToTh * Math.tan((3 * Math.PI) / 180);
    const papiAbove = state.alt > glideAlt + 120;
    for (let i = 0; i < 4; i += 1) {
      const p = project(state, (x0 + 60) / NM_TO_FT, (halfW + 40 + i * 22) / NM_TO_FT, 126);
      if (!p.ok) continue;
      const b = banked(state, p.x, p.y);
      ctx.fillStyle = papiAbove ? '#ffffff' : '#ff4d42';
      ctx.beginPath();
      ctx.arc(b.x, b.y, clamp(14000 / Math.max(800, p.dist), 2, 7), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawRings(state) {
    const all = [
      ...state.rings.map((r) => ({ ...r, fuel: false })),
      ...state.fuelRings.map((r) => ({ ...r, fuel: true })),
    ];
    const next = state.rings.find((r) => !r.passed);
    for (const ring of all) {
      if (ring.passed) continue;
      const p = project(state, ring.x, ring.z, ring.alt);
      if (!p.ok || p.dist < 200) continue;
      const b = banked(state, p.x, p.y);
      const radius = ring.fuel ? 320 : 420;
      const rPx = (radius / Math.max(300, p.dist)) * FOCAL;
      if (rPx < 3 || rPx > 900) continue;
      const isNext = next === ring || (ring.fuel && !next);
      const color = ring.fuel ? '#58d68d' : '#f2c94c';
      ctx.save();
      ctx.globalAlpha = isNext ? 1 : 0.55;
      ctx.strokeStyle = color;
      ctx.lineWidth = clamp(rPx * 0.09, 2, 10);
      ctx.shadowColor = color;
      ctx.shadowBlur = isNext ? 22 : 8;
      ctx.beginPath();
      ctx.ellipse(b.x, b.y, rPx, rPx * 0.92, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = color;
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(b.x + Math.cos(a) * rPx, b.y + Math.sin(a) * rPx * 0.92, clamp(rPx * 0.06, 1.5, 5), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      if (isNext) {
        // Beacon beam and distance label on the ring to chase.
        const top = banked(state, p.x, p.y - rPx * 1.9);
        const grad = ctx.createLinearGradient(b.x, b.y, top.x, top.y);
        grad.addColorStop(0, 'rgba(242, 201, 76, 0.5)');
        grad.addColorStop(1, 'rgba(242, 201, 76, 0)');
        ctx.strokeStyle = grad;
        ctx.lineWidth = clamp(rPx * 0.12, 3, 12);
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(top.x, top.y);
        ctx.stroke();
        const nm = (p.dist / NM_TO_FT).toFixed(1);
        ctx.fillStyle = '#fff3c4';
        ctx.font = `bold 15px ${FONT_MONO}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(ring.fuel ? `FUEL • ${nm} NM` : `RING ${state.rings.indexOf(ring) + 1} • ${nm} NM`, b.x, b.y - rPx - 10);
      }
    }
  }

  function drawParticles(state) {
    for (const p of state.particles) {
      const pr = project(state, p.x, p.z, p.alt);
      if (!pr.ok) continue;
      const b = banked(state, pr.x, pr.y);
      const alpha = 1 - p.age / p.life;
      ctx.globalAlpha = alpha * 0.9;
      ctx.fillStyle = p.color;
      const r = clamp((p.size * 2200) / Math.max(800, pr.dist) * 3, 1, 9);
      ctx.beginPath();
      ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawAircraft(state) {
    const ax = CX;
    const ay = CY + 62;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate((state.bank * Math.PI) / 180);
    ctx.translate(0, -state.pitch * 1.2);
    // Propeller blur disc at the nose, kept faint so it reads as motion, not a balloon.
    ctx.fillStyle = 'rgba(220, 230, 240, 0.15)';
    ctx.beginPath();
    ctx.ellipse(0, -118, 24, 40, 0, 0, Math.PI * 2);
    ctx.fill();
    // Wings: swept, with tip lights.
    ctx.fillStyle = '#d97b2f';
    ctx.beginPath();
    ctx.moveTo(-14, -58);
    ctx.lineTo(-128, 6);
    ctx.lineTo(-118, 26);
    ctx.lineTo(-10, -34);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(14, -58);
    ctx.lineTo(128, 6);
    ctx.lineTo(118, 26);
    ctx.lineTo(10, -34);
    ctx.closePath();
    ctx.fill();
    // Tailplane and fin.
    ctx.fillStyle = '#b85f1e';
    ctx.beginPath();
    ctx.moveTo(-8, 62);
    ctx.lineTo(-52, 84);
    ctx.lineTo(-46, 96);
    ctx.lineTo(0, 76);
    ctx.lineTo(46, 96);
    ctx.lineTo(52, 84);
    ctx.lineTo(8, 62);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#d97b2f';
    ctx.beginPath();
    ctx.moveTo(0, 58);
    ctx.lineTo(-10, 96);
    ctx.lineTo(10, 96);
    ctx.closePath();
    ctx.fill();
    // Fuselage, tapering to the nose.
    const fg = ctx.createLinearGradient(-16, 0, 16, 0);
    fg.addColorStop(0, '#8a4d16');
    fg.addColorStop(0.5, '#e8963f');
    fg.addColorStop(1, '#8a4d16');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(-13, 92);
    ctx.quadraticCurveTo(-17, 0, -9, -112);
    ctx.quadraticCurveTo(0, -124, 9, -112);
    ctx.quadraticCurveTo(17, 0, 13, 92);
    ctx.quadraticCurveTo(0, 102, -13, 92);
    ctx.closePath();
    ctx.fill();
    // Canopy.
    ctx.fillStyle = '#bfe3f2';
    ctx.beginPath();
    ctx.ellipse(0, -72, 9, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.beginPath();
    ctx.ellipse(-3, -80, 3, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    // Nose cone and spinner.
    ctx.fillStyle = '#5c3a12';
    ctx.beginPath();
    ctx.ellipse(0, -116, 8, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    // Navigation lights: red port, green starboard, white tail.
    const blink = Math.floor(performance.now() / 450) % 2 === 0;
    ctx.fillStyle = '#ff3b30';
    ctx.beginPath();
    ctx.arc(-124, 14, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#34d17b';
    ctx.beginPath();
    ctx.arc(124, 14, 4, 0, Math.PI * 2);
    ctx.fill();
    if (blink) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 98, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    // Engine exhaust glow.
    ctx.fillStyle = 'rgba(255, 190, 90, 0.85)';
    ctx.beginPath();
    ctx.ellipse(0, -104, 4, 8 + Math.sin(performance.now() / 60) * 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = PALETTE.panel;
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();
  }

  function drawTape(x, y, w, h, value, step, unit, label) {
    panel(x, y, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    const mid = y + h / 2;
    const perPx = h / (step * 8);
    const base = Math.round(value / step) * step;
    ctx.font = `12px ${FONT_MONO}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (let v = base - step * 4; v <= base + step * 4; v += step) {
      if (v < 0) continue;
      const ty = mid - (v - value) * perPx;
      // The centre value is drawn once, bold, below: here only its tick.
      if (v !== base) {
        ctx.fillStyle = '#aeb9c6';
        ctx.fillText(String(Math.round(v)), x + 8, ty);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.moveTo(x + w - 14, ty);
      ctx.lineTo(x + w - 4, ty);
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = '#0a101a';
    ctx.beginPath();
    ctx.moveTo(x + w, mid - 11);
    ctx.lineTo(x + w + 10, mid);
    ctx.lineTo(x + w, mid + 11);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 16px ${FONT_MONO}`;
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(value)}`, x + w / 2, mid);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `10px ${FONT_MONO}`;
    ctx.fillText(label, x + w / 2, y - 8);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `10px ${FONT_MONO}`;
    ctx.textAlign = 'right';
    ctx.fillText(unit, x + w - 4, y + h + 14);
  }

  function drawCompass(state) {
    const w = 420;
    const h = 34;
    const x = CX - w / 2;
    const y = FIELD.height - 46;
    panel(x, y, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    const perDeg = w / 90;
    const centre = Math.round(state.heading / 5) * 5;
    ctx.font = `11px ${FONT_MONO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let d = centre - 45; d <= centre + 45; d += 5) {
      const deg = ((d % 360) + 360) % 360;
      const tx = CX + wrapDeg(d - state.heading) * perDeg;
      const major = deg % 15 === 0;
      const names = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
      // Labels every 15 degrees so they never crowd; ticks every 5.
      if (major) {
        ctx.fillStyle = '#ffffff';
        ctx.fillText(names[deg] || String(deg).padStart(3, '0'), tx, y + h / 2);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath();
      ctx.moveTo(tx, y + h - 6);
      ctx.lineTo(tx, y + h - (major ? 12 : 8));
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = '#f2c94c';
    ctx.beginPath();
    ctx.moveTo(CX - 6, y - 2);
    ctx.lineTo(CX + 6, y - 2);
    ctx.lineTo(CX, y + 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 13px ${FONT_MONO}`;
    ctx.fillText(`${String(Math.round(((state.heading % 360) + 360) % 360)).padStart(3, '0')}°`, CX, y - 14);
  }

  function drawAttitude(state) {
    const r = 34;
    const cx = CX;
    const cy = FIELD.height - 108;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate((-state.bank * Math.PI) / 180);
    ctx.translate(0, state.pitch * 1.6);
    ctx.fillStyle = '#3f7fc4';
    ctx.fillRect(-r - 4, -r - 40, r * 2 + 8, r + 40);
    ctx.fillStyle = '#7a5a38';
    ctx.fillRect(-r - 4, 0, r * 2 + 8, r + 40);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-r, 0);
    ctx.lineTo(r, 0);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    // Fixed wings of the attitude indicator.
    ctx.fillStyle = '#f2c94c';
    ctx.fillRect(cx - r - 2, cy - 2, 16, 4);
    ctx.fillRect(cx + r - 14, cy - 2, 16, 4);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  function bar(x, y, w, h, frac, color, label, text) {
    panel(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x + 3, y + 3, Math.max(0, (w - 6) * clamp(frac, 0, 1)), h - 6);
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 11px ${FONT_MONO}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + 8, y + h / 2);
    ctx.textAlign = 'right';
    ctx.fillText(text, x + w - 8, y + h / 2);
  }

  function drawHUD(state, best) {
    // Top bar: mission, objective, score, time.
    panel(16, 12, FIELD.width - 32, 44);
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 17px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`MISSION ${state.missionIndex + 1} · ${state.mission.name.toUpperCase()}`, 30, 34);
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 15px ${FONT_MONO}`;
    ctx.textAlign = 'right';
    const mm = Math.floor(state.time / 60);
    const ss = Math.floor(state.time % 60).toString().padStart(2, '0');
    ctx.fillText(`SCORE ${fmt(state.score)}   ${mm}:${ss}`, FIELD.width - 30, 26);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `11px ${FONT_MONO}`;
    ctx.fillText(`BEST ${fmt(best)}`, FIELD.width - 30, 44);

    // Objective line under the bar.
    ctx.fillStyle = '#fff3c4';
    ctx.font = '13px ' + FONT;
    ctx.textAlign = 'left';
    ctx.fillText(state.objective, 30, 72);

    drawTape(16, 120, 64, 220, state.speed, 20, 'KT', 'AIRSPEED');
    drawTape(FIELD.width - 80, 120, 64, 220, state.alt, 500, 'FT', 'ALTITUDE');
    drawCompass(state);
    drawAttitude(state);

    // Throttle, fuel, damage.
    bar(16, FIELD.height - 46, 210, 24, state.throttle, '#7fb2dd', 'THR', `${Math.round(state.throttle * 100)}%`);
    const fuelColor = state.fuel < 20 ? '#e5534b' : state.fuel < 45 ? '#ffcf5c' : '#58d68d';
    bar(16, FIELD.height - 78, 210, 24, state.fuel / 100, fuelColor, 'FUEL', `${Math.round(state.fuel)}%`);
    const dmgColor = state.damage > 66 ? '#e5534b' : state.damage > 33 ? '#ffcf5c' : '#58d68d';
    bar(FIELD.width - 226, FIELD.height - 46, 210, 24, 1 - state.damage / 100, dmgColor, 'HULL', `${Math.round(100 - state.damage)}%`);
    bar(FIELD.width - 226, FIELD.height - 78, 210, 24, state.ringsPassed / Math.max(1, state.rings.length), '#f2c94c', 'RINGS', `${state.ringsPassed}/${state.rings.length}`);

    // Warning banner.
    if (state.warning) {
      const blink = Math.floor(performance.now() / 350) % 2 === 0;
      if (blink) {
        ctx.fillStyle = '#e5534b';
        ctx.font = `bold 22px ${FONT_MONO}`;
        ctx.textAlign = 'center';
        ctx.fillText(`⚠ ${state.warning} ⚠`, CX, 108);
      }
    }
  }

  function dim() {
    ctx.fillStyle = 'rgba(6, 10, 18, 0.62)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  }

  function drawTitle(state, best) {
    drawSky(state);
    drawRidges(state);
    drawGround(state);
    drawRunway(state);
    drawAircraft(state);
    dim();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 64px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SKYLINE COURIER', CX, 150);
    ctx.fillStyle = '#f2c94c';
    ctx.font = '20px ' + FONT;
    ctx.fillText('Three sorties. One little aeroplane. Bring her home.', CX, 196);
    // Mission list.
    MISSIONS.forEach((m, i) => {
      const y = 268 + i * 62;
      panel(CX - 300, y, 600, 50);
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold 17px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.fillText(`${i + 1}. ${m.name}`, CX - 282, y + 20);
      ctx.fillStyle = PALETTE.muted;
      ctx.font = '13px ' + FONT;
      ctx.fillText(m.briefing, CX - 282, y + 38);
      ctx.fillStyle = '#f2c94c';
      ctx.font = `bold 13px ${FONT_MONO}`;
      ctx.textAlign = 'right';
      ctx.fillText(`${m.rings.length} RINGS`, CX + 282, y + 25);
    });
    ctx.fillStyle = '#ffffff';
    ctx.font = '15px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText('↑↓ pitch · ←→ bank · Shift/Ctrl throttle · P pause · M mute', CX, 478);
    ctx.fillText('Press 1, 2 or 3 to pick a sortie — or Space to fly the first', CX, 504);
    if (best > 0) {
      ctx.fillStyle = '#f2c94c';
      ctx.font = `bold 16px ${FONT_MONO}`;
      ctx.fillText(`BEST TOTAL ${fmt(best)}`, CX, 548);
    }
  }

  function drawPaused() {
    dim();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 44px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', CX, CY - 20);
    ctx.font = '16px ' + FONT;
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText('P or Space to keep flying', CX, CY + 24);
  }

  function drawOver(state, best) {
    dim();
    ctx.fillStyle = '#e5534b';
    ctx.font = 'bold 52px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText(state.crashed ? 'CRASHED' : 'SORTIE OVER', CX, 210);
    ctx.fillStyle = '#ffffff';
    ctx.font = '18px ' + FONT;
    const cause = state.crashed
      ? state.damage >= 100 ? 'The airframe gave out after too many hard knocks.'
        : 'The ground came up too fast.'
      : 'Out of fuel, out of sky.';
    ctx.fillText(cause, CX, 258);
    ctx.font = `bold 22px ${FONT_MONO}`;
    ctx.fillText(`SCORE ${fmt(state.score)}   BEST ${fmt(Math.max(best, state.score))}`, CX, 316);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '15px ' + FONT;
    ctx.fillText('Space or click to fly again', CX, 372);
  }

  function drawWin(state, best) {
    dim();
    ctx.fillStyle = '#f2c94c';
    ctx.font = 'bold 52px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText('ALL THREE SORTIES FLOWN', CX, 190);
    ctx.fillStyle = '#ffffff';
    ctx.font = '18px ' + FONT;
    ctx.fillText('Every ring threaded, every landing greased. The courier rests.', CX, 236);
    for (let i = 0; i < 3; i += 1) {
      ctx.fillStyle = i < state.stars ? '#f2c94c' : 'rgba(255,255,255,0.25)';
      ctx.font = '44px ' + FONT;
      ctx.fillText('★', CX - 60 + i * 60, 300);
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 24px ${FONT_MONO}`;
    ctx.fillText(`TOTAL SCORE ${fmt(state.score)}   BEST ${fmt(Math.max(best, state.score))}`, CX, 360);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '15px ' + FONT;
    ctx.fillText('Space or click to fly again', CX, 412);
  }

  function drawMission(state) {
    dim();
    ctx.fillStyle = '#58d68d';
    ctx.font = 'bold 46px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText('MISSION COMPLETE', CX, 210);
    ctx.fillStyle = '#ffffff';
    ctx.font = '18px ' + FONT;
    ctx.fillText(`Landed clean on runway 09 · mission score ${fmt(state.missionScore)}`, CX, 258);
    ctx.font = `bold 20px ${FONT_MONO}`;
    ctx.fillText(`TOTAL ${fmt(state.score)}`, CX, 306);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '15px ' + FONT;
    ctx.fillText('Space or click for the next sortie', CX, 362);
  }

  function drawWorld(state) {
    drawSky(state);
    drawClouds(state);
    drawRidges(state);
    drawGround(state);
    drawRunway(state);
    drawRings(state);
    drawParticles(state);
    drawAircraft(state);
  }

  function draw(state, screen, best) {
    ctx.setTransform(view.scale, 0, 0, view.scale, view.ox, view.oy);
    ctx.fillStyle = '#0d1420';
    ctx.fillRect(-view.ox / view.scale, -view.oy / view.scale,
      FIELD.width + (2 * view.ox) / view.scale, FIELD.height + (2 * view.oy) / view.scale);
    if (screen === SCREEN_TITLE) {
      drawTitle(state, best);
      return;
    }
    drawWorld(state);
    if (screen === SCREEN_PLAY) {
      drawHUD(state, best);
    } else if (screen === SCREEN_PAUSED) {
      drawHUD(state, best);
      drawPaused();
    } else if (screen === SCREEN_OVER) {
      drawOver(state, best);
    } else if (screen === SCREEN_WIN) {
      drawWin(state, best);
    } else if (screen === SCREEN_MISSION) {
      drawMission(state);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, resize, project };
}
