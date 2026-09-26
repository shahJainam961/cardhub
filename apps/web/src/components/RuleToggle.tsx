/** A house-rule switch: a checkbox styled as a chunky toggle, with a title and description. */
export function RuleToggle({
  name,
  description,
  checked,
  disabled = false,
  onChange,
}: {
  name: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange(checked: boolean): void;
}) {
  return (
    <label
      className={`relative flex items-center gap-3 rounded-2xl p-3 transition ${checked ? "bg-grape/10" : "bg-cloud"} ${
        disabled ? "cursor-default" : "cursor-pointer"
      }`}
    >
      <input
        type="checkbox"
        // Invisible but covering the whole row, so the entire row is the tap target.
        className="peer absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-default"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden
        className="relative h-7 w-12 shrink-0 rounded-full bg-ink/20 transition peer-checked:bg-mint peer-focus-visible:ring-4 peer-focus-visible:ring-grape/40 after:absolute after:top-1 after:left-1 after:size-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5"
      />
      <span className="text-left">
        <span className="block font-display text-lg font-semibold">{name}</span>
        <span className="block text-sm font-semibold text-ink/60">{description}</span>
      </span>
    </label>
  );
}
