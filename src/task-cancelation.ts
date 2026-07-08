export class TaskCancelation extends Error {
	constructor(reason?: string) {
		super(reason ?? "TaskCancelation");
		this.name = "TaskCancelation";
	}
}

export function isTaskCancelation(error: unknown): error is TaskCancelation {
	return error instanceof TaskCancelation;
}
