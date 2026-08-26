export type FocusModeShortcutAction = "enter" | "exit";

type FocusModeShortcutInput = {
	key: string;
	altKey: boolean;
	ctrlKey: boolean;
	metaKey: boolean;
	shiftKey: boolean;
	repeat: boolean;
	targetIsEditable: boolean;
	focusMode: boolean;
	canEnter: boolean;
};

export function getFocusModeShortcutAction({
	key,
	altKey,
	ctrlKey,
	metaKey,
	shiftKey,
	repeat,
	targetIsEditable,
	focusMode,
	canEnter,
}: FocusModeShortcutInput): FocusModeShortcutAction | null {
	if (key === "Escape" && focusMode) return "exit";
	if (
		key !== "f" ||
		altKey ||
		ctrlKey ||
		metaKey ||
		shiftKey ||
		repeat ||
		targetIsEditable
	) {
		return null;
	}
	if (focusMode) return "exit";
	return canEnter ? "enter" : null;
}
