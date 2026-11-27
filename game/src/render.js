// Every pixel of Skyline Courier: sky, sun, clouds, ridges, fields, the runway,
// the rings, the jet itself and the lit instruments. The renderer only reads the
// world and paints it; it never changes the simulation.

import { HORIZON_Y, MISSIONS, PALETTES, RING_RADIUS, RUNWAY_AT, RUNWAY_WIDTH, VIEW_HEIGHT, VIEW_WIDTH } from './config.js';
import { clamp, lerp, wrapAngle } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_LANDED = 'landed';
export const SCREEN_CRASHED = 'crashed';

const DASH_Y = 628;
const FONT = '600 13px system-ui, sans-serif';

function skyGradient(ctx, palette, height) {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, palette.skyTop);
  gradient.addColorStop(0.55, palette.skyMid);
  gradient.addColorStop(1, palette.skyLow);
  return gradient;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const scale = window.devicePixelRatio > 1 ? 2 : 1;
  canvas.width = VIEW_WIDTH * scale;
  canvas.height = VIEW_HEIGHT * scale;
  ctx.scale(scale, scale);

  function drawSky(state, world) {
    const palette = PALETTES[world.mission.palette];
    ctx.fillStyle = skyGradient(ctx, palette, HORIZON_Y + 40);
    ctx.fillRect(0, 0, VIEW_WIDTH, HORIZON_Y + 40);
    // Sun (or moon after dark), sliding with the heading.
    const sunX = VIEW_WIDTH / 2 - wrapAngle(state.heading - 40) * 4;
    const sunY = 110 + state.pitch * 2;
    const glow = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, 120);
    glow.addColorStop(0, palette.sunGlow);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sunX - 120, sunY - 120, 240, 240);
    ctx.fillStyle = palette.sun;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 30, 0, Math.PI * 2);
    ctx.fill();
    // Clouds drift with heading and time.
    ctx.fillStyle = palette.cloud;
    for (const cloud of world.clouds) {
      const x = (((cloud.x + state.time * cloud.speed - state.heading / 720) % 1) + 1) % 1;
      const cx = x * (VIEW_WIDTH + 320) - 160;
      const cy = cloud.y * HORIZON_Y + state.pitch * 1.5;
      const s = cloud.scale;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 70 * s, 16 * s, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 44 * s, cy + 5 * s, 48 * s, 12 * s, 0, 0, Math.PI * 2);
      ctx.ellipse(cx - 48 * s, cy + 6 * s, 42 * s, 11 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function ridgeLine(points, baseY, amplitude, color, headingShift) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-20, VIEW_HEIGHT);
    for (let x = -20; x <= VIEW_WIDTH + 20; x += 40) {
      const t = (((x + headingShift) / (VIEW_WIDTH + 40)) % 1 + 1) % 1;
      const y = baseY - points[Math.floor(t * points.length)] * amplitude;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(VIEW_WIDTH + 20, VIEW_HEIGHT);
    ctx.closePath();
    ctx.fill();
  }

  function drawTerrain(state, world) {
    const palette = PALETTES[world.mission.palette];
    const horizon = HORIZON_Y + state.pitch * 3;
    const drift = -state.heading * 3.2;
    // Two ridge silhouettes for depth, then the field band.
    ridgeLine(world.farRidge, horizon + 6, 46, palette.far, drift * 0.4);
    ridgeLine(world.nearRidge, horizon + 14, 60, palette.near, drift * 0.8);
    const ground = ctx.createLinearGradient(0, horizon, 0, VIEW_HEIGHT);
    ground.addColorStop(0, palette.fieldB);
    ground.addColorStop(1, palette.fieldC);
    ctx.fillStyle = ground;
    ctx.fillRect(0, horizon + 10, VIEW_WIDTH, VIEW_HEIGHT - horizon);
    // Field patches scroll with distance and slide with the lateral offset.
    const patchScroll = (state.dist * 0.02) % 90;
    const latShift = -state.x * 0.06 + drift;
    for (let row = 0; row < 5; row += 1) {
      const y = horizon + 26 + row * 72 + ((patchScroll * (row + 1)) % 72);
      if (y > VIEW_HEIGHT) continue;
      const height = 44 + row * 10;
      for (let col = -1; col < 7; col += 1) {
        const x = ((col * 260 + latShift * (1 + row * 0.22) + row * 97) % (VIEW_WIDTH + 260) + VIEW_WIDTH + 260) % (VIEW_WIDTH + 260) - 130;
        const width = 190 + ((col * 53 + row * 29) % 90);
        ctx.fillStyle = (col + row) % 3 === 0 ? palette.fieldA : (col + row) % 3 === 1 ? palette.fieldB : palette.fieldC;
        ctx.globalAlpha = 0.55;
        ctx.fillRect(x, y, width, height);
      }
    }
    ctx.globalAlpha = 1;
    // A river winds across the fields.
    ctx.strokeStyle = palette.river;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 6 + state.alt / 500;
    ctx.beginPath();
    for (let x = -20; x <= VIEW_WIDTH + 20; x += 40) {
      const y = horizon + 150 + Math.sin((x + latShift * 2 + state.dist * 0.05) * 0.006) * 46 + (x / VIEW_WIDTH) * 120;
      if (x === -20) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    // Haze softens the far ground.
    ctx.fillStyle = palette.haze;
    ctx.fillRect(0, horizon, VIEW_WIDTH, 60);
  }

  function drawRunway(state, world) {
    const palette = PALETTES[world.mission.palette];
    const dz = RUNWAY_AT - state.dist;
    if (dz < -800 || dz > 14000) return;
    const horizon = HORIZON_Y + state.pitch * 3;
    const k = clamp(1500 / Math.max(300, dz), 0.12, 2.4);
    const cx = VIEW_WIDTH / 2 - state.heading * 3.2 + (0 - state.x) * k * 0.32;
    const nearY = DASH_Y;
    const farY = horizon + 8;
    const nearHalf = RUNWAY_WIDTH * k * 0.55;
    const farHalf = Math.max(3, RUNWAY_WIDTH * k * 0.05);
    ctx.fillStyle = palette.runway;
    ctx.beginPath();
    ctx.moveTo(cx - nearHalf, nearY);
    ctx.lineTo(cx - farHalf, farY);
    ctx.lineTo(cx + farHalf, farY);
    ctx.lineTo(cx + nearHalf, nearY);
    ctx.closePath();
    ctx.fill();
    // Centre dashes and the threshold bars.
    ctx.fillStyle = palette.runwayMark;
    const steps = 7;
    for (let index = 0; index < steps; index += 1) {
      const t = index / steps;
      const y = lerp(nearY, farY, t * t);
      const half = lerp(nearHalf, farHalf, t * t);
      ctx.fillRect(cx - Math.max(1.5, half * 0.06), y - 3, Math.max(3, half * 0.12), 7);
    }
    ctx.font = '700 26px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('27', cx, lerp(nearY, farY, 0.86));
  }

  function drawRings(state, world) {
    const horizon = HORIZON_Y + state.pitch * 3;
    const upcoming = world.rings.filter((ring) => !ring.passed && !ring.missed).slice(0, 3);
    for (let index = upcoming.length - 1; index >= 0; index -= 1) {
      const ring = upcoming[index];
      const dz = ring.dist - state.dist;
      if (dz < 60 || dz > 11000) continue;
      const k = clamp(1100 / dz, 0.1, 2.6);
      const cx = VIEW_WIDTH / 2 - state.heading * 3.2 + (ring.x - state.x) * k * 0.5;
      const cy = horizon - (ring.alt - state.alt) * k * 0.5;
      const radius = RING_RADIUS * k * 1.15;
      const glow = ctx.createRadialGradient(cx, cy, radius * 0.4, cx, cy, radius * 1.7);
      glow.addColorStop(0, 'rgba(255, 200, 60, 0.35)');
      glow.addColorStop(1, 'rgba(255, 200, 60, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(cx - radius * 1.8, cy - radius * 1.8, radius * 3.6, radius * 3.6);
      ctx.strokeStyle = '#ffd23c';
      ctx.lineWidth = Math.max(2, radius * 0.14);
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#fff6cf';
      ctx.lineWidth = Math.max(1, radius * 0.05);
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.82, 0, Math.PI * 2);
      ctx.stroke();
      if (index === 0) {
        ctx.fillStyle = '#ffe27a';
        ctx.font = '700 13px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`RING ${world.rings.filter((item) => item.passed).length + 1}`, cx, cy - radius - 10);
      }
    }
  }

  function drawJet(state, time) {
    const cx = VIEW_WIDTH / 2;
    const cy = 468 - state.pitch * 1.2;
    const roll = (state.roll * Math.PI) / 180;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(roll * 0.55);
    // Afterburner flame, flickering with throttle.
    const flame = 26 + state.throttle * 42 + Math.sin(time * 31) * 5;
    const flameGrad = ctx.createLinearGradient(0, 26, 0, 26 + flame);
    flameGrad.addColorStop(0, 'rgba(255, 220, 120, 0.95)');
    flameGrad.addColorStop(0.5, 'rgba(255, 140, 40, 0.8)');
    flameGrad.addColorStop(1, 'rgba(255, 80, 20, 0)');
    ctx.fillStyle = flameGrad;
    ctx.beginPath();
    ctx.moveTo(-13, 24);
    ctx.lineTo(0, 26 + flame);
    ctx.lineTo(13, 24);
    ctx.closePath();
    ctx.fill();
    // Wings, swept back.
    const wingGrad = ctx.createLinearGradient(-150, 0, 150, 0);
    wingGrad.addColorStop(0, '#8d99ae');
    wingGrad.addColorStop(0.5, '#c7d0dd');
    wingGrad.addColorStop(1, '#8d99ae');
    ctx.fillStyle = wingGrad;
    ctx.beginPath();
    ctx.moveTo(-16, -6);
    ctx.lineTo(-158, 34);
    ctx.lineTo(-146, 52);
    ctx.lineTo(-10, 26);
    ctx.lineTo(10, 26);
    ctx.lineTo(146, 52);
    ctx.lineTo(158, 34);
    ctx.lineTo(16, -6);
    ctx.closePath();
    ctx.fill();
    // Tail fins.
    ctx.fillStyle = '#7c8aa0';
    ctx.beginPath();
    ctx.moveTo(-14, -8);
    ctx.lineTo(-34, -52);
    ctx.lineTo(-16, -52);
    ctx.lineTo(-2, -10);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(14, -8);
    ctx.lineTo(34, -52);
    ctx.lineTo(16, -52);
    ctx.lineTo(2, -10);
    ctx.closePath();
    ctx.fill();
    // Fuselage, seen from behind and slightly below.
    const bodyGrad = ctx.createLinearGradient(-18, 0, 18, 0);
    bodyGrad.addColorStop(0, '#5b6b82');
    bodyGrad.addColorStop(0.5, '#dbe4ef');
    bodyGrad.addColorStop(1, '#5b6b82');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.moveTo(-16, -58);
    ctx.quadraticCurveTo(-20, 6, -13, 30);
    ctx.lineTo(13, 30);
    ctx.quadraticCurveTo(20, 6, 16, -58);
    ctx.quadraticCurveTo(0, -72, -16, -58);
    ctx.closePath();
    ctx.fill();
    // Lit cockpit glass.
    const glassGrad = ctx.createLinearGradient(0, -56, 0, -18);
    glassGrad.addColorStop(0, '#bfe9ff');
    glassGrad.addColorStop(1, '#2e6da8');
    ctx.fillStyle = glassGrad;
    ctx.beginPath();
    ctx.ellipse(0, -38, 8, 17, 0, 0, Math.PI * 2);
    ctx.fill();
    // Engine nozzles and navigation lights.
    ctx.fillStyle = '#2c3542';
    ctx.beginPath();
    ctx.arc(-8, 28, 6, 0, Math.PI * 2);
    ctx.arc(8, 28, 6, 0, Math.PI * 2);
    ctx.fill();
    const blink = Math.sin(time * 4) > 0;
    ctx.fillStyle = blink ? '#ff4444' : '#881111';
    ctx.beginPath();
    ctx.arc(-156, 40, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#22cc66';
    ctx.beginPath();
    ctx.arc(156, 40, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawTopHud(state, world, best) {
    ctx.fillStyle = 'rgba(8, 14, 26, 0.72)';
    ctx.fillRect(0, 0, VIEW_WIDTH, 56);
    ctx.fillStyle = '#f4f7fb';
    ctx.font = '700 15px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(world.mission.name.toUpperCase(), 18, 24);
    ctx.font = FONT;
    ctx.fillStyle = '#bcd2e8';
    ctx.fillText(`SCORE ${state.score}   BEST ${Math.max(best, state.score)}`, 18, 44);
    // Centre: the three numbers the brief asks the HUD to carry.
    ctx.textAlign = 'center';
    ctx.font = '700 20px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(
      `ALT ${Math.round(state.alt)} ft    SPD ${Math.round(state.speed)} kt    HDG ${Math.round(((state.heading % 360) + 360) % 360)}°`,
      VIEW_WIDTH / 2, 26,
    );
    // Compass strip under the numbers.
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillStyle = '#9fb8d4';
    const marks = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    for (let index = -2; index <= 2; index += 1) {
      const deg = Math.round(state.heading / 45) * 45 + index * 45;
      const label = marks[((Math.round(deg / 45) % 8) + 8) % 8];
      const x = VIEW_WIDTH / 2 + index * 64 - ((state.heading % 45) / 45) * 64;
      ctx.fillText(label, x, 46);
    }
    // Right: rings, fuel, time.
    ctx.textAlign = 'right';
    ctx.font = '700 15px system-ui, sans-serif';
    ctx.fillStyle = '#ffe27a';
    ctx.fillText(`RINGS ${state.ringsPassed}/${world.mission.rings}`, VIEW_WIDTH - 18, 24);
    ctx.font = FONT;
    ctx.fillStyle = state.fuel < 20 ? '#ff7a6e' : '#bcd2e8';
    ctx.fillText(`FUEL ${Math.round(state.fuel)}%   ${Math.floor(state.time / 60)}:${String(Math.floor(state.time % 60)).padStart(2, '0')}`, VIEW_WIDTH - 18, 44);
    // Warnings flash in the middle of the screen, only while still flying.
    if (state.status === 'flying' && state.warnings.length > 0 && Math.sin(state.time * 8) > -0.2) {
      ctx.textAlign = 'center';
      ctx.font = '800 30px system-ui, sans-serif';
      ctx.fillStyle = '#ff5a4e';
      ctx.fillText(state.warnings.join('  •  '), VIEW_WIDTH / 2, 120);
    }
  }

  function drawDash(state, world, muted) {
    // The lit instrument bar: airspeed tape, artificial horizon, altimeter, fuel.
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, DASH_Y, VIEW_WIDTH, VIEW_HEIGHT - DASH_Y);
    ctx.fillStyle = '#1b2740';
    ctx.fillRect(0, DASH_Y, VIEW_WIDTH, 3);
    const tape = (x, label, value, unit, color) => {
      ctx.fillStyle = '#101a2e';
      ctx.fillRect(x, DASH_Y + 12, 150, 68);
      ctx.strokeStyle = '#2c3d5c';
      ctx.strokeRect(x, DASH_Y + 12, 150, 68);
      ctx.fillStyle = '#8fa8c8';
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(label, x + 10, DASH_Y + 30);
      ctx.fillStyle = color;
      ctx.font = '700 26px system-ui, sans-serif';
      ctx.fillText(`${value}`, x + 10, DASH_Y + 62);
      ctx.fillStyle = '#8fa8c8';
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.fillText(unit, x + 112, DASH_Y + 62);
    };
    tape(24, 'AIRSPEED', Math.round(state.speed), 'kt', '#7ee2a8');
    tape(1106, 'ALTITUDE', Math.round(state.alt), 'ft', '#8ec9ff');
    // Artificial horizon ball.
    const hx = 700;
    const hy = DASH_Y + 46;
    ctx.save();
    ctx.beginPath();
    ctx.arc(hx, hy, 34, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#2f7fd0';
    ctx.fillRect(hx - 34, hy - 34, 68, 34 + state.pitch * 1.2);
    ctx.fillStyle = '#7a5a38';
    ctx.fillRect(hx - 34, hy + state.pitch * 1.2, 68, 34 - state.pitch * 1.2);
    ctx.translate(hx, hy);
    ctx.rotate((-state.roll * Math.PI) / 180);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-34, -1, 68, 2);
    ctx.restore();
    ctx.strokeStyle = '#5a7396';
    ctx.beginPath();
    ctx.arc(hx, hy, 34, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffe27a';
    ctx.beginPath();
    ctx.moveTo(hx - 8, hy + 4);
    ctx.lineTo(hx, hy - 4);
    ctx.lineTo(hx + 8, hy + 4);
    ctx.closePath();
    ctx.fill();
    // Throttle and fuel bars between the tapes.
    const bar = (x, label, frac, color) => {
      ctx.fillStyle = '#8fa8c8';
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(label, x, DASH_Y + 30);
      ctx.fillStyle = '#101a2e';
      ctx.fillRect(x, DASH_Y + 38, 180, 14);
      ctx.fillStyle = color;
      ctx.fillRect(x, DASH_Y + 38, 180 * clamp(frac, 0, 1), 14);
      ctx.strokeStyle = '#2c3d5c';
      ctx.strokeRect(x, DASH_Y + 38, 180, 14);
    };
    bar(200, 'THROTTLE', state.throttle, '#ffb347');
    bar(420, 'FUEL', state.fuel / 100, state.fuel < 20 ? '#ff5a4e' : '#7ee2a8');
    ctx.fillStyle = '#8fa8c8';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`HDG ${Math.round(((state.heading % 360) + 360) % 360)}°`, 1090, DASH_Y + 30);
    ctx.fillText(muted ? 'MUTED (M)' : 'SOUND ON (M)', 1090, DASH_Y + 52);
    ctx.textAlign = 'left';
    ctx.fillText('SKYLINE COURIER', 760, DASH_Y + 30);
    ctx.fillStyle = '#5a7396';
    ctx.fillText('Arrows fly · Shift/Ctrl throttle', 760, DASH_Y + 52);
  }

  function overlay(title, lines, accent) {
    ctx.fillStyle = 'rgba(6, 10, 20, 0.66)';
    ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    ctx.textAlign = 'center';
    ctx.fillStyle = accent;
    ctx.font = '800 54px system-ui, sans-serif';
    ctx.fillText(title, VIEW_WIDTH / 2, 210);
    ctx.fillStyle = '#e8eef7';
    ctx.font = '400 19px system-ui, sans-serif';
    lines.forEach((line, index) => {
      ctx.fillText(line, VIEW_WIDTH / 2, 262 + index * 30);
    });
  }

  function drawTitle(state, world, best) {
    overlay('SKYLINE COURIER', ['Fly the rings. Mind the fuel. Put her down on runway 27.'], '#ffe27a');
    ctx.font = '600 17px system-ui, sans-serif';
    MISSIONS.forEach((mission, index) => {
      const y = 350 + index * 52;
      const selected = world.mission.id === mission.id;
      ctx.fillStyle = selected ? 'rgba(255, 226, 122, 0.16)' : 'rgba(255, 255, 255, 0.05)';
      ctx.fillRect(VIEW_WIDTH / 2 - 330, y - 24, 660, 42);
      ctx.strokeStyle = selected ? '#ffe27a' : '#3a4c68';
      ctx.strokeRect(VIEW_WIDTH / 2 - 330, y - 24, 660, 42);
      ctx.fillStyle = selected ? '#ffe27a' : '#dbe6f4';
      ctx.textAlign = 'left';
      ctx.fillText(`${index + 1} — ${mission.name}`, VIEW_WIDTH / 2 - 312, y + 5);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#9fb8d4';
      ctx.fillText(`${mission.rings} rings`, VIEW_WIDTH / 2 + 312, y + 5);
    });
    ctx.fillStyle = '#bcd2e8';
    ctx.font = '400 16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Press 1, 2 or 3 to pick a sortie — Enter or click to fly. Arrows steer, Shift / Ctrl work the throttle.', VIEW_WIDTH / 2, 530);
    if (best > 0) ctx.fillText(`Best score so far: ${best}`, VIEW_WIDTH / 2, 560);
  }

  function draw(screen, state, world, best, time, muted) {
    ctx.clearRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    // The camera stays level: the jet banks, the world does not roll with it.
    drawSky(state, world);
    drawTerrain(state, world);
    drawRunway(state, world);
    drawRings(state, world);
    drawJet(state, time);
    drawTopHud(state, world, best);
    drawDash(state, world, muted);
    if (screen === SCREEN_TITLE) drawTitle(state, world, best);
    if (screen === SCREEN_PAUSED) {
      overlay('PAUSED', ['Press P to keep flying.', 'R restarts the sortie.'], '#e8eef7');
    }
    if (screen === SCREEN_LANDED) {
      overlay('TOUCHDOWN — RUNWAY 27', [
        `Rings flown: ${state.ringsPassed} of ${world.mission.rings}   •   Fuel left: ${Math.round(state.fuel)}%`,
        `Score: ${state.score}   •   Best: ${Math.max(best, state.score)}`,
        'Press R to fly again, or 1 / 2 / 3 for another sortie.',
      ], '#7ee2a8');
    }
    if (screen === SCREEN_CRASHED) {
      overlay('CRASHED', [
        state.reason,
        `Score: ${state.score}   •   Rings flown: ${state.ringsPassed} of ${world.mission.rings}`,
        'Press R to try the sortie again.',
      ], '#ff7a6e');
    }
  }

  return { draw };
}
