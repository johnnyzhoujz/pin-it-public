import { describe, expect, it } from "vitest";
import { playCaptureSound } from "../src/audio/captureSound.js";

class FakeAudioParam {
  constructor() {
    this.events = [];
  }

  setValueAtTime(value, time) {
    this.events.push({ method: "set", time, value });
  }

  exponentialRampToValueAtTime(value, time) {
    this.events.push({ method: "exponential", time, value });
  }
}

class FakeAudioNode {
  constructor() {
    this.connections = [];
  }

  connect(node) {
    this.connections.push(node);
    return node;
  }
}

class FakeScheduledNode extends FakeAudioNode {
  constructor() {
    super();
    this.startTimes = [];
    this.stopTimes = [];
  }

  start(time) {
    this.startTimes.push(time);
  }

  stop(time) {
    this.stopTimes.push(time);
  }
}

class FakeAudioContext {
  constructor() {
    this.buffers = [];
    this.bufferSources = [];
    this.filters = [];
    this.gains = [];
    this.oscillators = [];
    this.currentTime = 3;
    this.destination = new FakeAudioNode();
    this.sampleRate = 48000;
    this.state = "running";
    this.closed = false;
    FakeAudioContext.instance = this;
  }

  createBuffer(channels, frameCount, sampleRate) {
    const channelData = new Float32Array(frameCount);
    const buffer = {
      channels,
      frameCount,
      sampleRate,
      getChannelData: () => channelData
    };
    this.buffers.push(buffer);
    return buffer;
  }

  createBufferSource() {
    const node = new FakeScheduledNode();
    this.bufferSources.push(node);
    return node;
  }

  createBiquadFilter() {
    const node = new FakeAudioNode();
    node.frequency = new FakeAudioParam();
    node.Q = new FakeAudioParam();
    this.filters.push(node);
    return node;
  }

  createGain() {
    const node = new FakeAudioNode();
    node.gain = new FakeAudioParam();
    this.gains.push(node);
    return node;
  }

  createOscillator() {
    const node = new FakeScheduledNode();
    node.frequency = new FakeAudioParam();
    this.oscillators.push(node);
    return node;
  }

  close() {
    this.closed = true;
    return Promise.resolve();
  }
}

describe("capture sound", () => {
  it("layers a dart whoosh, cork impact, low thock, and pin contact", () => {
    const scheduled = [];
    const played = playCaptureSound({
      AudioContextClass: FakeAudioContext,
      random: () => 0.75,
      schedule: (callback, delay) => scheduled.push({ callback, delay })
    });
    const context = FakeAudioContext.instance;

    expect(played).toBe(true);
    expect(context.buffers).toHaveLength(2);
    expect(context.bufferSources).toHaveLength(2);
    expect(context.filters.map((filter) => filter.type)).toEqual(["bandpass", "lowpass"]);
    expect(context.oscillators.map((oscillator) => oscillator.type)).toEqual(["triangle", "sine"]);
    expect(context.bufferSources[0].startTimes[0]).toBeCloseTo(3);
    expect(context.bufferSources[1].startTimes[0]).toBeCloseTo(3.032);
    expect(context.oscillators[0].stopTimes[0]).toBeLessThan(3.15);
    expect(scheduled[0].delay).toBe(220);

    scheduled[0].callback();
    expect(context.closed).toBe(true);
  });

  it("does nothing when Web Audio is unavailable", () => {
    expect(playCaptureSound({ AudioContextClass: null })).toBe(false);
  });
});
