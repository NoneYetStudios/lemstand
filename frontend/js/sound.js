/**
 * Lemonade Stand - Adaptive Sound Engine
 * Supports Retro Apple ][e 1-bit beeps, 8-bit Chiptune arpeggios, and Modern soft chimes.
 * Persists user preference in localStorage ('lemonadestand_sound').
 */
(function (root) {
  'use strict';

  const STORAGE_KEY = 'lemonadestand_sound';
  let audioCtx = null;
  let soundEnabled = true;

  // Load saved preference from localStorage
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) {
      soundEnabled = saved === 'true';
    }
  } catch (_) {
    soundEnabled = true;
  }

  function getContext() {
    if (!audioCtx && typeof window !== 'undefined') {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) {
        audioCtx = new Ctx();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  function getActiveTheme() {
    try {
      return localStorage.getItem('lemonadestand_theme') || 'modern';
    } catch (_) {
      return 'modern';
    }
  }

  /**
   * Play a sequence of notes using Web Audio API tailored to the active visual mode.
   */
  function playNotes(notes, baseWave, gainLevel = 0.12) {
    if (!soundEnabled) return;
    const ctx = getContext();
    if (!ctx) return;

    const theme = getActiveTheme();
    const wave =
      theme === 'retro' ? 'square' :
      theme === '8-bit' ? (baseWave || 'square') :
      'triangle';

    let startOffset = ctx.currentTime;
    for (const [freq, dur] of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = wave;
      osc.frequency.setValueAtTime(freq, startOffset);

      gain.gain.setValueAtTime(gainLevel, startOffset);
      gain.gain.exponentialRampToValueAtTime(0.001, startOffset + dur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startOffset);
      osc.stop(startOffset + dur);
      startOffset += dur * 0.9;
    }
  }

  function play(type) {
    if (!soundEnabled) return;
    const theme = getActiveTheme();

    switch (type) {
      case 'click':
        if (theme === 'retro') {
          playNotes([[1000, 0.035]], 'square', 0.09);
        } else if (theme === '8-bit') {
          playNotes([[660, 0.04], [880, 0.04]], 'square', 0.1);
        } else {
          playNotes([[587.33, 0.05]], 'sine', 0.1);
        }
        break;

      case 'cash':
        if (theme === 'retro') {
          playNotes([[880, 0.07], [1320, 0.12]], 'square', 0.11);
        } else if (theme === '8-bit') {
          playNotes([[987.77, 0.06], [1318.51, 0.18]], 'square', 0.12);
        } else {
          playNotes([[783.99, 0.08], [1046.5, 0.16]], 'triangle', 0.14);
        }
        break;

      case 'dayStart':
        if (theme === '8-bit') {
          playNotes([[523.25, 0.06], [659.25, 0.06], [783.99, 0.06], [1046.5, 0.12]], 'square', 0.11);
        } else {
          playNotes([[440, 0.07], [554.37, 0.07], [659.25, 0.12]], 'triangle', 0.11);
        }
        break;

      case 'event':
        playNotes([[440, 0.08], [349.23, 0.08], [440, 0.12]], 'square', 0.11);
        break;

      case 'storm':
        playNotes([[196, 0.12], [146.83, 0.16], [110, 0.22]], 'sawtooth', 0.12);
        break;

      case 'victory':
        playNotes([
          [523.25, 0.08],
          [659.25, 0.08],
          [783.99, 0.08],
          [1046.5, 0.14],
          [783.99, 0.08],
          [1046.5, 0.24]
        ], 'square', 0.12);
        break;

      case 'error':
        playNotes([[220, 0.1], [164.81, 0.18]], 'sawtooth', 0.12);
        break;

      default:
        playNotes([[660, 0.04]], 'square', 0.08);
    }
  }

  function isEnabled() {
    return soundEnabled;
  }

  function setEnabled(enabled) {
    soundEnabled = Boolean(enabled);
    try {
      localStorage.setItem(STORAGE_KEY, String(soundEnabled));
    } catch (_) {}
    if (soundEnabled) {
      play('click');
    }
    return soundEnabled;
  }

  function toggle() {
    return setEnabled(!soundEnabled);
  }

  root.LemonadeSound = {
    play,
    isEnabled,
    setEnabled,
    toggle
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
