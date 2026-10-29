"use client";

/**
 * Petit retour haptique au toucher. Android : vibration courte.
 * iPhone (iOS 18 et plus) : Safari n'a pas de vibration, mais basculer un interrupteur natif
 * (<input type="checkbox" switch>) déclenche le « tic » du système ; on en garde un invisible.
 */
let label: HTMLLabelElement | null = null;

export function vibrer() {
  try {
    if (typeof navigator.vibrate === "function" && navigator.vibrate(8)) return;
  } catch {}
  try {
    if (!label) {
      label = document.createElement("label");
      label.setAttribute("aria-hidden", "true");
      label.style.cssText = "position:fixed;left:-200px;top:0;width:1px;height:1px;opacity:0;overflow:hidden";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.setAttribute("switch", "");
      input.tabIndex = -1;
      label.appendChild(input);
      document.body.appendChild(label);
    }
    label.click();
  } catch {}
}
