import { getCurrentTaskInstance } from "@/context";
import { TaskCancelation } from "@/task-cancelation";

export function race<T>(values: Array<T | PromiseLike<T>>): Promise<T> {
	const instance = getCurrentTaskInstance();

	if (instance?.signal.aborted) {
		const rejected = Promise.reject<T>(
			new TaskCancelation("Operation canceled during race()"),
		);
		rejected.catch(() => {});
		return rejected;
	}

	const promise = Promise.race(values);

	if (!instance) {
		return promise;
	}

	const result = new Promise<T>((resolve, reject) => {
		promise.then(resolve, reject);

		instance.onCancel(() => {
			reject(new TaskCancelation("Operation canceled during race()"));
		});
	});

	result.catch(() => {});
	return result;
}
