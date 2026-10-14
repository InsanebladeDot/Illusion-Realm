"use strict";

// Seeded multiscale displacement keeps photo tears irregular and reproducible.
window.createLegacyPhotoTear = function (vertices, roughness, seed) {
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  return vertices.flatMap((start, index) => {
    const end = vertices[(index + 1) % vertices.length];
    const vx = end.x - start.x, vy = end.y - start.y;
    const length = Math.hypot(vx, vy);
    const amplitude = Math.min(roughness, length * .08);
    const points = [start];
    let distance = 0, drift = 0;
    while ((distance += 6 + random() * 17) < length - 8) {
      const t = distance / length;
      drift = drift * .72 + (random() - .5) * amplitude * .8;
      const displacement = (drift + (random() - .5) * amplitude * .55) * Math.min(1, t * 12, (1 - t) * 12);
      points.push({ x: start.x + vx * t - vy / length * displacement,
        y: start.y + vy * t + vx / length * displacement });
    }
    return points;
  });
};

window.TEAR_PRESETS = {
  photo: { name: "手撕相片", spacing: 12, micro: .12, drift: .65, notch: 1.5, paper: true },
  memory: { name: "毛边回忆", spacing: 6, micro: .28, drift: .36, notch: .45, paper: true },
  impact: { name: "冲击碎裂", spacing: 22, micro: .04, drift: .18, notch: 2.1, paper: false },
};

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function createTearEvents(length, amplitude, preset, random) {
  const events = [];
  let position = 35 + random() * 75;
  while (position < length - 30) {
    events.push({ center: position, radius: 12 + random() * 48,
      depth: amplitude * preset.notch * (.35 + random() * .65) });
    position += 90 + random() * 210;
  }
  return events;
}

function createIrregularEdge(start, end, amplitude, preset, random, inwardOnly, orientation) {
  const vx = end.x - start.x, vy = end.y - start.y, length = Math.hypot(vx, vy);
  const events = createTearEvents(length, amplitude, preset, random);
  const points = [start];
  let distance = 0, drift = 0, target = (random() - .5) * amplitude, nextDrift = 0;
  while ((distance += preset.spacing * (.25 + random() * 1.6)) < length - 6) {
    if (distance > nextDrift) { target = (random() - .5) * amplitude * preset.drift; nextDrift = distance + 45 + random() * 140; }
    drift += (target - drift) * .16;
    const t = distance / length;
    const notch = events.reduce((sum, event) => sum + event.depth * Math.max(0, 1 - Math.abs(distance - event.center) / event.radius), 0);
    const value = drift + (random() - .5) * amplitude * preset.micro + notch;
    const displacement = (inwardOnly ? Math.max(0, value) : value) * Math.min(1, t * 14, (1 - t) * 14);
    points.push({ x: start.x + vx * t - vy / length * displacement * orientation,
      y: start.y + vy * t + vx / length * displacement * orientation });
  }
  return points;
}

window.createPhotoTear = function (vertices, roughness, seed, options = {}) {
  if (options.generatorVersion === 1) return window.createLegacyPhotoTear(vertices, roughness, seed);
  const preset = window.TEAR_PRESETS[options.preset || "photo"];
  const random = seededRandom(seed);
  const area = vertices.reduce((sum, a, i) => {
    const b = vertices[(i + 1) % vertices.length]; return sum + a.x * b.y - b.x * a.y;
  }, 0);
  return vertices.flatMap((start, index) => {
    const end = vertices[(index + 1) % vertices.length];
    const amplitude = Math.min(roughness, Math.hypot(end.x - start.x, end.y - start.y) * .09);
    return createIrregularEdge(start, end, amplitude, preset, random, options.inwardOnly, area >= 0 ? 1 : -1);
  });
};
