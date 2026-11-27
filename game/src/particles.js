// Small bursts in world space: gold sparks when a ring is threaded, green when
// fuel is taken, grey smoke when the airframe is hurt. The renderer projects them.
export function createParticles() {
  return [];
}

export function burst(particles, x, z, alt, count, color) {
  for (let i = 0; i < count; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const r = 40 + Math.random() * 260;
    particles.push({
      x,
      z,
      alt,
      vx: Math.cos(a) * r,
      vz: Math.sin(a) * r,
      va: (Math.random() - 0.5) * 200,
      life: 0.7 + Math.random() * 0.7,
      age: 0,
      color,
      size: 2 + Math.random() * 4,
    });
  }
}

export function updateParticles(particles, dt) {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i];
    p.age += dt;
    if (p.age >= p.life) {
      particles.splice(i, 1);
      continue;
    }
    p.x += (p.vx * dt) / 6076;
    p.z += (p.vz * dt) / 6076;
    p.alt += p.va * dt;
    p.vx *= 0.98;
    p.vz *= 0.98;
    p.va *= 0.98;
  }
}
