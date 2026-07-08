import type { Action, SchedulerPolicy } from "@/scheduler/types";
import type { TaskInstance } from "@/task-instance";

export class KeepLatestSchedulerPolicy implements SchedulerPolicy {
	readonly maxConcurrency: number;

	constructor(maxConcurrency: number | null = null) {
		this.maxConcurrency = maxConcurrency ?? 1;
	}

	actionFor(
		_newInstance: TaskInstance<unknown>,
		running: TaskInstance<unknown>[],
		queued: TaskInstance<unknown>[],
	): Action {
		if (running.length < this.maxConcurrency) {
			return { type: "run" };
		}
		if (queued.length > 0) {
			return { type: "cancelAndRun", instance: queued[0] };
		}
		return { type: "queue" };
	}
}
