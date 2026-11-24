export const collectFlight = async (page, { seconds, altitude, cold, allowRadioPause = false }) => {
  await page.evaluate(async ({ altitude, cold }) => {
    const game = window.__SKIMMER_SCRAPER__;
    game.pause();
    const position = cold ? { x: 4_596, y: altitude, z: 4_436 } : { x: 196, y: altitude, z: 26 };
    await game.setPose(position, { pitch: 0, yaw: 0, roll: 0 });
  }, { altitude, cold });
  if (!cold) await page.waitForFunction(() => {
    const { streaming } = window.__SKIMMER_SCRAPER__.snapshot();
    return streaming.queuedChunks === 0 && streaming.generatingChunks === 0;
  }, null, { timeout: 30_000 });

  return page.evaluate(async ({ seconds, allowRadioPause }) => {
    const game = window.__SKIMMER_SCRAPER__;
    const controlAt = t => {
      // Accelerate, reverse twice using opposite banks, then climb and dive briefly.
      const keys = t < 26 || t >= 36 ? ['ShiftLeft'] : [];
      if (t >= 10 && t < 11.57) keys.push('KeyA', 'KeyQ');
      if (t >= 19 && t < 20.57) keys.push('KeyD', 'KeyE');
      if (t >= 25 && t < 25.15) keys.push('KeyS');
      if (t >= 30 && t < 30.26) keys.push('KeyW');
      if (t >= 35 && t < 35.13) keys.push('KeyS');
      return keys;
    };
    let held = [];
    const press = keys => {
      for (const code of held) if (!keys.includes(code)) window.dispatchEvent(new KeyboardEvent('keyup', { code }));
      for (const code of keys) if (!held.includes(code)) window.dispatchEvent(new KeyboardEvent('keydown', { code }));
      held = keys;
    };

    // Sample the portion of the camera frustum that can see the near city. This is
    // a chunk-readiness projection: intervening buildings can occlude individual rays.
    const viewCoverage = state => {
      const active = new Set(state.chunkStates.filter(chunk => chunk.state === 'ACTIVE').map(chunk => chunk.key));
      const [x, y, z, w] = state.cameraOrientation;
      const ox = state.cameraPosition.x + state.renderOrigin.x;
      const oy = state.cameraPosition.y + state.renderOrigin.y;
      const oz = state.cameraPosition.z + state.renderOrigin.z;
      const vertical = Math.tan(state.fov * Math.PI / 360);
      const horizontal = vertical * innerWidth / innerHeight;
      const visible = new Set();
      for (const row of [-0.82, -0.48, -0.14, 0.2]) for (const column of [-0.8, -0.4, 0, 0.4, 0.8]) {
        const lx = column * horizontal, ly = row * vertical, lz = -1;
        const ax = 2 * (y * lz - z * ly), ay = 2 * (z * lx - x * lz), az = 2 * (x * ly - y * lx);
        const rx = lx + w * ax + y * az - z * ay;
        const ry = ly + w * ay + z * ax - x * az;
        const rz = lz + w * az + x * ay - y * ax;
        if (ry >= -0.015) continue;
        for (const level of [35, 125, 215]) {
          const distance = (level - oy) / ry;
          const horizontalDistance = Math.hypot(rx, rz) * distance;
          if (horizontalDistance < 90 || horizontalDistance > 620) continue;
          visible.add(`${Math.floor((ox + rx * distance) / 220)}:${Math.floor((oz + rz * distance) / 220)}`);
        }
      }
      const missing = [...visible].filter(key => !active.has(key));
      return { tested: visible.size, missing };
    };

    const initial = game.snapshot();
    window.dispatchEvent(new CustomEvent("skimmer-flight-sample-start", { detail: initial.runTime }));
    const frames = [];
    const inferenceFrames = [];
    const samples = [];
    let last = await new Promise(requestAnimationFrame);
    const started = last;
    let lastSample = -1000;
    let oldState = initial;
    let distanceTraveled = 0;
    let visibleFrames = 0;
    let incompleteFrames = 0;
    let maxMissing = 0;
    let bufferingEntries = 0;
    let bufferingFrames = 0;
    let bufferingMs = 0;
    let collisionCellEntries = 0;
    let readyAtPreviousFrame = 0;
    const cell = p => `${Math.floor(p.x / 220)}:${Math.floor(p.z / 220)}`;
    const sample = state => ({ elapsed: state.runTime - initial.runTime, position: state.position,
      attitude: state.attitude, speed: state.speed, buffering: state.buffering, world: state.journey.worldIndex,
      stalledCompanions: state.companions.map(agent => agent.uncovered), deployed: state.companions.filter(agent => agent.deployed).length,
      triangles: state.render.triangles, jsHeap: performance.memory?.usedJSHeapSize ?? null, drawCalls: state.render.calls, renderGeometries: state.render.geometries, textures: state.render.textures,
      gpuMs: state.render.gpuMs ?? null, dynamic: state.dynamicStructures.length, streaming: state.streaming, shieldImpacts: state.shieldImpacts });

    game.resume();
    oldState = game.snapshot();
    press(controlAt(0));
    try {
      while (oldState.runTime - initial.runTime < seconds &&
        (oldState.mode === 'running' || (allowRadioPause && oldState.mode === 'paused'))) {
        const now = await new Promise(requestAnimationFrame);
        const frameTime = now - last;
        if (now - started > (seconds * 1.5 + 50) * 1000) throw new Error('Scripted flight did not progress.');
        last = now;
        const state = game.snapshot();
        const path = state.position;
        const previous = oldState.position;
        distanceTraveled += Math.hypot(path.x - previous.x, path.y - previous.y, path.z - previous.z);
        if (cell(path) !== cell(previous)) {
          collisionCellEntries++;
          const [cx, cz] = cell(path).split(':').map(Number);
          const wasReady = oldState.chunkStates.filter(chunk => {
            if (chunk.state !== 'ACTIVE') return false;
            const [x, z] = chunk.key.split(':').map(Number);
            return Math.abs(x - cx) <= 1 && Math.abs(z - cz) <= 1;
          }).length === 9;
          if (wasReady && !oldState.buffering) readyAtPreviousFrame++;
        }
        const coverage = viewCoverage(state);
        if (coverage.tested > 0) visibleFrames++;
        if (coverage.missing.length > 0) incompleteFrames++;
        if (state.buffering && !oldState.buffering) bufferingEntries++;
        if (state.buffering) { bufferingFrames++; bufferingMs += frameTime; }
        if (now - lastSample >= 500 || coverage.missing.length > maxMissing || state.buffering !== oldState.buffering) {
          samples.push({ ms: now - started, ...sample(state), projectedCells: coverage.tested, missingCells: coverage.missing });
          lastSample = now;
          maxMissing = Math.max(maxMissing, coverage.missing.length);
        }
        frames.push(frameTime);
        if (state.voice.kokoro?.phase === 'generating' || oldState.voice.kokoro?.phase === 'generating') inferenceFrames.push(frameTime);
        press(controlAt(state.runTime - initial.runTime));
        oldState = state;
      }
    } finally {
      press([]);
      game.pause();
    }

    const sorted = frames.sort((a, b) => a - b);
    const percentile = p => sorted[Math.floor(p * (sorted.length - 1))];
    return { initial: sample(initial), end: sample(oldState), mode: oldState.mode, seconds: (last - started) / 1000,
      fps: sorted.length * 1000 / (last - started), frameCount: sorted.length, frameMs: [percentile(.5), percentile(.95), percentile(.99)],
      worstFrameMs: sorted.at(-1), visibleFrames, incompleteFrames, maxMissing, bufferingEntries, bufferingFrames, bufferingMs, collisionCellEntries,
      readyAtPreviousFrame, distanceTraveled,
      inferenceFrames: inferenceFrames.length, inferenceWorstMs: inferenceFrames.length ? Math.max(...inferenceFrames) : null,
      samples };
  }, { seconds, allowRadioPause });
};

