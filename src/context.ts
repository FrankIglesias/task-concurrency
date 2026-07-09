import { AsyncLocalStorage } from "node:async_hooks";
import type { TaskInstanceLike } from "@/task-instance";

const taskStorage = new AsyncLocalStorage<TaskInstanceLike | null>();

export function getCurrentTaskInstance(): TaskInstanceLike | null {
	return taskStorage.getStore() ?? null;
}

export function runAsTaskInstance<T>(
	instance: TaskInstanceLike | null,
	fn: () => T,
): T {
	return taskStorage.run(instance, fn);
}
