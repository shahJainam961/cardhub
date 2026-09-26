import { create } from "zustand";

interface AudioSettings {
  sound: boolean;
  music: boolean;
  setSound(on: boolean): void;
  setMusic(on: boolean): void;
}

const KEY = "cardhub.audio";

function load(): { sound: boolean; music: boolean } {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<{
      sound: boolean;
      music: boolean;
    }>;
    return { sound: saved.sound ?? true, music: saved.music ?? false };
  } catch {
    // Private mode / blocked storage: fall back to defaults.
    return { sound: true, music: false };
  }
}

function save(settings: { sound: boolean; music: boolean }) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Not critical: the choice just won't be remembered.
  }
}

/** Sound effects on by default; music off by default (it starts only when chosen). */
export const useAudioSettings = create<AudioSettings>()((set, get) => ({
  ...load(),
  setSound(sound) {
    set({ sound });
    save({ sound, music: get().music });
  },
  setMusic(music) {
    set({ music });
    save({ sound: get().sound, music });
  },
}));
