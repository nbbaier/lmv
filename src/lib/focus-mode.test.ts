import { describe, expect, test } from "bun:test";
import { getFocusModeShortcutAction } from "./focus-mode";

const baseShortcut = {
	key: "f",
	altKey: false,
	ctrlKey: false,
	metaKey: false,
	shiftKey: false,
	repeat: false,
	targetIsEditable: false,
	focusMode: false,
	canEnter: true,
};

describe("focus mode keyboard shortcuts", () => {
	test("enters with an unmodified f while reading a document", () => {
		expect(getFocusModeShortcutAction(baseShortcut)).toBe("enter");
	});

	test("exits with f or Escape", () => {
		expect(
			getFocusModeShortcutAction({ ...baseShortcut, focusMode: true }),
		).toBe("exit");
		expect(
			getFocusModeShortcutAction({
				...baseShortcut,
				key: "Escape",
				focusMode: true,
			}),
		).toBe("exit");
	});

	test("does not enter from an editable control or without a selected document", () => {
		expect(
			getFocusModeShortcutAction({
				...baseShortcut,
				targetIsEditable: true,
			}),
		).toBeNull();
		expect(
			getFocusModeShortcutAction({ ...baseShortcut, canEnter: false }),
		).toBeNull();
	});

	test("ignores modified and repeated key presses", () => {
		for (const blocked of [
			{ altKey: true },
			{ ctrlKey: true },
			{ metaKey: true },
			{ shiftKey: true },
			{ repeat: true },
		]) {
			expect(
				getFocusModeShortcutAction({ ...baseShortcut, ...blocked }),
			).toBeNull();
		}
	});
});
