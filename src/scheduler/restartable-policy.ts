import type { Action, SchedulerPolicy } from "@/scheduler/types";
import type { TaskInstance } from "@/task-instance";

export class RestartableSchedulerPolicy implements SchedulerPolicy {
	readonly maxConcurrency: number;

	constructor(maxConcurrency: number | null = null) {
		this.maxConcurrency = maxConcurrency ?? 1;
	}

	actionFor(
		_newInstance: TaskInstance<unknown>,
		running: TaskInstance<unknown>[],
		queued: TaskInstance<unknown>[],
	): Action {
		const allRunning = [...running, ...queued];
		if (allRunning.length < this.maxConcurrency) {
			return { type: "run" };
		}
		const oldest = allRunning[0];
		return { type: "cancelAndRun", instance: oldest };
	}
}
