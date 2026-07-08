import { getCurrentTaskInstance } from "@/context";
import { TaskCancelation } from "@/task-cancelation";

export function timeout(ms: number): Promise<void> {
	const instance = getCurrentTaskInstance();

	const promise = new Promise<void>((resolve, reject) => {
		if (instance?.signal.aborted) {
			reject(new TaskCancelation("Operation canceled during timeout"));
			return;
		}

		const timer = setTimeout(() => {
			if (instance?.signal.aborted) {
				reject(new TaskCancelation("Operation canceled during timeout"));
				return;
			}
			resolve();
		}, ms);

		if (instance) {
			instance.onCancel(() => {
				clearTimeout(timer);
				reject(new TaskCancelation("Operation canceled during timeout"));
			});
		}
	});

	promise.catch(() => {});
	return promise;
}
