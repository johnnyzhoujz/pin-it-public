function createNoiseBuffer(context, duration, random) {
  const frameCount = Math.max(1, Math.round(context.sampleRate * duration));
  const buffer = context.createBuffer(1, frameCount, context.sampleRate);
  const channel = buffer.getChannelData(0);

  for (let index = 0; index < frameCount; index += 1) {
    const decay = 1 - index / frameCount;
    channel[index] = (random() * 2 - 1) * decay;
  }

  return buffer;
}

function safelyCloseContext(context) {
  try {
    const pendingClose = context.close?.();
    pendingClose?.catch?.(() => {});
  } catch {
    // Capture feedback is non-critical.
  }
}

export function playCaptureSound({
  AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext,
  random = Math.random,
  schedule = globalThis.setTimeout
} = {}) {
  if (!AudioContextClass) {
    return false;
  }

  try {
    const context = new AudioContextClass();
    const now = context.currentTime;
    const impactAt = now + 0.032;
    const master = context.createGain();

    master.gain.setValueAtTime(0.82, now);
    master.connect(context.destination);

    const whoosh = context.createBufferSource();
    const whooshFilter = context.createBiquadFilter();
    const whooshGain = context.createGain();
    whoosh.buffer = createNoiseBuffer(context, 0.058, random);
    whooshFilter.type = "bandpass";
    whooshFilter.frequency.setValueAtTime(3600, now);
    whooshFilter.frequency.exponentialRampToValueAtTime(1200, now + 0.055);
    whooshFilter.Q.setValueAtTime(0.7, now);
    whooshGain.gain.setValueAtTime(0.0001, now);
    whooshGain.gain.exponentialRampToValueAtTime(0.014, now + 0.005);
    whooshGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.058);
    whoosh.connect(whooshFilter);
    whooshFilter.connect(whooshGain);
    whooshGain.connect(master);
    whoosh.start(now);
    whoosh.stop(now + 0.062);

    const corkNoise = context.createBufferSource();
    const corkFilter = context.createBiquadFilter();
    const corkGain = context.createGain();
    corkNoise.buffer = createNoiseBuffer(context, 0.082, random);
    corkFilter.type = "lowpass";
    corkFilter.frequency.setValueAtTime(1800, impactAt);
    corkFilter.frequency.exponentialRampToValueAtTime(560, impactAt + 0.074);
    corkFilter.Q.setValueAtTime(1.1, impactAt);
    corkGain.gain.setValueAtTime(0.0001, impactAt);
    corkGain.gain.exponentialRampToValueAtTime(0.072, impactAt + 0.002);
    corkGain.gain.exponentialRampToValueAtTime(0.0001, impactAt + 0.082);
    corkNoise.connect(corkFilter);
    corkFilter.connect(corkGain);
    corkGain.connect(master);
    corkNoise.start(impactAt);
    corkNoise.stop(impactAt + 0.086);

    const thock = context.createOscillator();
    const thockGain = context.createGain();
    thock.type = "triangle";
    thock.frequency.setValueAtTime(190, impactAt);
    thock.frequency.exponentialRampToValueAtTime(82, impactAt + 0.09);
    thockGain.gain.setValueAtTime(0.0001, impactAt);
    thockGain.gain.exponentialRampToValueAtTime(0.064, impactAt + 0.003);
    thockGain.gain.exponentialRampToValueAtTime(0.0001, impactAt + 0.102);
    thock.connect(thockGain);
    thockGain.connect(master);
    thock.start(impactAt);
    thock.stop(impactAt + 0.108);

    const pinContact = context.createOscillator();
    const pinContactGain = context.createGain();
    pinContact.type = "sine";
    pinContact.frequency.setValueAtTime(1500, impactAt);
    pinContact.frequency.exponentialRampToValueAtTime(720, impactAt + 0.018);
    pinContactGain.gain.setValueAtTime(0.022, impactAt);
    pinContactGain.gain.exponentialRampToValueAtTime(0.0001, impactAt + 0.026);
    pinContact.connect(pinContactGain);
    pinContactGain.connect(master);
    pinContact.start(impactAt);
    pinContact.stop(impactAt + 0.03);

    if (context.state === "suspended") {
      context.resume?.().catch?.(() => {});
    }

    schedule(() => safelyCloseContext(context), 220);
    return true;
  } catch {
    return false;
  }
}
