import type { Action, SchedulerPolicy } from "@/scheduler/types";
import type { TaskInstance } from "@/task-instance";

export class DropSchedulerPolicy implements SchedulerPolicy {
	readonly maxConcurrency: number;

	constructor(maxConcurrency: number | null = null) {
		this.maxConcurrency = maxConcurrency ?? 1;
	}

	actionFor(
		_newInstance: TaskInstance<unknown>,
		running: TaskInstance<unknown>[],
		_queued: TaskInstance<unknown>[],
	): Action {
		if (running.length < this.maxConcurrency) {
			return { type: "run" };
		}
		return { type: "drop" };
	}
}
