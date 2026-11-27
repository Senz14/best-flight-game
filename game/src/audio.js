// Procedural sound: no audio files, everything is a WebAudio oscillator shaped in code.
// The engine hum follows the throttle, a chime marks a flown ring, a thud marks a landing
// and a burst of noise marks a crash. Silent until the first user gesture starts it.

export function createAudio() {
  let context = null;
  let engineOsc = null;
  let engineGain = null;
  let muted = false;

  function ensure() {
    if (context !== null) return true;
    try {
      const AudioContext = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      engineOsc = context.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 320;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(filter).connect(engineGain).connect(context.destination);
      engineOsc.start();
      return true;
    } catch {
      return false;
    }
  }

  function blip(frequency, seconds, type, volume, when = 0) {
    if (context === null || muted) return;
    const start = context.currentTime + when;
    const osc = context.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + seconds);
    osc.connect(gain).connect(context.destination);
    osc.start(start);
    osc.stop(start + seconds + 0.02);
  }

  return {
    unlock() {
      if (ensure() && context.state === 'suspended') context.resume().catch(() => {});
    },
    setEngine(throttle, speed) {
      if (context === null || engineOsc === null || engineGain === null) return;
      const target = muted ? 0 : 0.015 + throttle * 0.05;
      engineGain.gain.setTargetAtTime(target, context.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(48 + throttle * 70 + speed * 0.12, context.currentTime, 0.1);
    },
    ring() {
      blip(880, 0.18, 'sine', 0.16);
      blip(1318, 0.3, 'sine', 0.12, 0.09);
    },
    nearMiss() {
      blip(660, 0.12, 'triangle', 0.1);
    },
    land() {
      blip(180, 0.25, 'sine', 0.2);
      blip(120, 0.35, 'sine', 0.16, 0.08);
    },
    crash() {
      if (context === null || muted) return;
      const duration = 0.6;
      const buffer = context.createBuffer(1, context.sampleRate * duration, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let index = 0; index < data.length; index += 1) {
        data[index] = (Math.random() * 2 - 1) * (1 - index / data.length);
      }
      const source = context.createBufferSource();
      source.buffer = buffer;
      const gain = context.createGain();
      gain.gain.value = 0.25;
      source.connect(gain).connect(context.destination);
      source.start();
    },
    toggleMute() {
      muted = !muted;
      if (engineGain !== null && context !== null) {
        engineGain.gain.setTargetAtTime(0, context.currentTime, 0.05);
      }
      return muted;
    },
    isMuted() {
      return muted;
    },
  };
}
