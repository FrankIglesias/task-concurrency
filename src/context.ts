import type { TaskInstanceLike } from "@/task-instance";

const contextStack: Array<TaskInstanceLike | null> = [];

export function setCurrentTaskInstance(
	instance: TaskInstanceLike | null,
): void {
	contextStack.push(instance);
}

export function getCurrentTaskInstance(): TaskInstanceLike | null {
	return contextStack.length > 0 ? contextStack[contextStack.length - 1] : null;
}

export function popCurrentTaskInstance(
	instance: TaskInstanceLike | null,
): void {
	const idx = contextStack.lastIndexOf(instance);
	if (idx !== -1) {
		contextStack.splice(idx, 1);
	}
}
