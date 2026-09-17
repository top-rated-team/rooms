/**
 * The two ways this menu used to take itself away mid-typing.
 *
 * There is no DOM in this test runner, so these read the source. That is the
 * right shape for this particular bug anyway: both regressions would be a
 * handler losing its guard, and a guard is visible in the text. Run it with:
 *
 *   npx tsx --test client/src/components/site/room-menu.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/* fileURLToPath, not `.pathname`: this repository's directory has a space in
   its name and a URL keeps it as %20. */
const source = readFileSync(fileURLToPath(new URL("./RoomMenu.tsx", import.meta.url)), "utf8");

function handler(name: string): string {
  const at = source.indexOf(name);
  assert.ok(at >= 0, `${name} has moved or been renamed`);
  return source.slice(at, at + 1400);
}

describe("reaching for the browser's saved address does not close the menu", () => {
  /*
   * THE ONE THAT ACTUALLY BIT. The saved-address list is a native layer drawn
   * over the page, so moving onto it fires mouseleave on the page beneath —
   * on hover alone, with no click anywhere. The menu closed and took the
   * half-typed address with it.
   */
  it("mouse-leave does not close while an input in here has focus", () => {
    const leave = handler("onMouseLeave={");
    assert.ok(leave.includes("document.activeElement"), "mouse-leave no longer looks at what has focus");
    assert.ok(
      leave.includes("HTMLInputElement"),
      "mouse-leave no longer spares a field being typed in, so hovering the browser's autofill list closes the form again",
    );
    const guard = leave.indexOf("HTMLInputElement");
    const close = leave.indexOf("setOpen(false)");
    assert.ok(guard >= 0 && close >= 0 && guard < close, "the guard runs after the close, so it guards nothing");
  });

  /*
   * The second path, guarded when the first was misdiagnosed. It is still
   * right: a click on browser furniture is not a click on the page.
   */
  it("an outside pointerdown only counts while the page itself is focused", () => {
    const pointer = handler("const onPointer = (event: PointerEvent)");
    assert.ok(pointer.includes("document.hasFocus()"), "the outside-click handler no longer checks the page is focused");
    const guard = pointer.indexOf("document.hasFocus()");
    const close = pointer.indexOf("setOpen(false)");
    assert.ok(guard >= 0 && close >= 0 && guard < close, "the guard runs after the close, so it guards nothing");
  });

  it("escape and a click outside still close it", () => {
    assert.ok(source.includes('event.key === "Escape"'), "Escape no longer closes the menu");
    assert.ok(source.includes("rootRef.current.contains(target)"), "a click outside no longer closes the menu");
  });
});
