import type { DraggableSyntheticListeners } from "@dnd-kit/core";
import type { PointerEvent } from "react";

/**
 * Drag listeners that only start a drag from a real pointer. Pressing Enter on a card makes Motion
 * dispatch a synthetic pointerdown at (0, 0); if dnd-kit took it, the card is played and removed
 * before the matching pointerup, and the next real mouse move would start a phantom drag that
 * swallows the following click.
 */
export function trustedPointerListeners(
  listeners: DraggableSyntheticListeners,
): DraggableSyntheticListeners {
  const onPointerDown = listeners?.onPointerDown as ((event: PointerEvent) => void) | undefined;
  if (!onPointerDown) return listeners;
  return {
    ...listeners,
    onPointerDown: (event: PointerEvent) => {
      if (event.nativeEvent.isTrusted) onPointerDown(event);
    },
  };
}
