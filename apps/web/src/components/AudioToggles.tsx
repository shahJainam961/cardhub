import { play, unlockAudio } from "../audio/sound";
import { useAudioSettings } from "../audio/settings";

const toggle =
  "size-11 cursor-pointer rounded-full bg-white/25 text-xl shadow-[0_3px_0_rgb(31_26_77/0.2)] transition active:translate-y-[2px] active:shadow-none hover:bg-white/35";

/** Sound effects and music switches (remembered on this device). */
export function AudioToggles() {
  const { sound, music, setSound, setMusic } = useAudioSettings();
  return (
    <div className="flex gap-2">
      <button
        type="button"
        className={toggle}
        aria-label="Sound effects"
        aria-pressed={sound}
        title={sound ? "Sound effects on" : "Sound effects off"}
        onClick={() => {
          unlockAudio();
          setSound(!sound);
          if (!sound) queueMicrotask(() => play("pop"));
        }}
      >
        {sound ? "🔊" : "🔇"}
      </button>
      <button
        type="button"
        className={`${toggle} ${music ? "" : "opacity-60"}`}
        aria-label="Music"
        aria-pressed={music}
        title={music ? "Music on" : "Music off"}
        onClick={() => {
          unlockAudio();
          setMusic(!music);
        }}
      >
        🎵
      </button>
    </div>
  );
}
