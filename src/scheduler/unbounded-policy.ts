import type { Action, SchedulerPolicy } from "@/scheduler/types";
import type { TaskInstance } from "@/task-instance";

export class UnboundedSchedulerPolicy implements SchedulerPolicy {
	readonly maxConcurrency: number;

	constructor(maxConcurrency: number | null = null) {
		this.maxConcurrency = maxConcurrency ?? Infinity;
	}

	actionFor(
		_newInstance: TaskInstance<unknown>,
		running: TaskInstance<unknown>[],
		_queued: TaskInstance<unknown>[],
	): Action {
		if (running.length < this.maxConcurrency) {
			return { type: "run" };
		}
		return { type: "queue" };
	}
}
