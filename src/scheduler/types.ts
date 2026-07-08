import type { TaskInstance } from "@/task-instance";

export type Action =
	| { type: "run" }
	| { type: "queue" }
	| { type: "drop" }
	| { type: "cancelAndRun"; instance: TaskInstance<unknown> };

export interface SchedulerPolicy {
	readonly maxConcurrency: number;

	actionFor(
		newInstance: TaskInstance<unknown>,
		running: TaskInstance<unknown>[],
		queued: TaskInstance<unknown>[],
	): Action;
}
