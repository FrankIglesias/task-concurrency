import { popCurrentTaskInstance, setCurrentTaskInstance } from "@/context";
import { isTaskCancelation, TaskCancelation } from "@/task-cancelation";

export const TaskInstanceStateValues = {
	Waiting: "waiting",
	Running: "running",
	Completed: "completed",
	Errored: "errored",
	Canceled: "canceled",
} as const;

export type TaskInstanceState =
	| "waiting"
	| "running"
	| "completed"
	| "errored"
	| "canceled";

type WrapResult<T> =
	| { status: "ok"; value: T }
	| { status: "error"; error: unknown }
	| { status: "canceled" };

export interface TaskInstanceLike {
	readonly signal: AbortSignal;
	readonly hasStarted: boolean;
	readonly isCanceled: boolean;
	readonly isFinished: boolean;
	onCancel(cb: () => void): void;
}

type OnStateChangeFn = (state: TaskInstanceState) => void;

export class TaskInstance<T = unknown>
	implements TaskInstanceLike, PromiseLike<T>
{
	private _abortController = new AbortController();
	private _state: TaskInstanceState = "waiting";
	private _value: T | undefined;
	private _error: unknown = undefined;
	private _cancelCallbacks: Array<() => void> = [];
	private _onStateChange: OnStateChangeFn | null = null;
	private _promise: Promise<T>;
	private _resolve: ((value: T) => void) | null = null;
	private _reject: ((reason: unknown) => void) | null = null;

	get signal(): AbortSignal {
		return this._abortController.signal;
	}

	get state(): TaskInstanceState {
		return this._state;
	}

	get value(): T | undefined {
		return this._value;
	}

	get error(): unknown {
		return this._error;
	}

	get hasStarted(): boolean {
		return this._state !== "waiting";
	}

	get isRunning(): boolean {
		return this._state === "running";
	}

	get isCanceled(): boolean {
		return this._state === "canceled";
	}

	get isSuccessful(): boolean {
		return this._state === "completed";
	}

	get isError(): boolean {
		return this._state === "errored";
	}

	get isFinished(): boolean {
		return (
			this._state === "completed" ||
			this._state === "errored" ||
			this._state === "canceled"
		);
	}

	set onStateChange(fn: OnStateChangeFn | null) {
		this._onStateChange = fn;
	}

	constructor(
		private _fn: (...args: unknown[]) => Promise<T>,
		private _args: unknown[],
	) {
		this._promise = new Promise<T>((resolve, reject) => {
			this._resolve = resolve;
			this._reject = reject;
		});
		this._promise.catch(() => {});
	}

	start(): void {
		if (this._state !== "waiting") return;
		this._execute();
	}

	private _setState(state: TaskInstanceState): void {
		this._state = state;
		this._onStateChange?.(state);
	}

	private _settle(value: T): void {
		this._value = value;
		this._setState("completed");
		this._resolve?.(value);
	}

	private _fail(error: unknown): void {
		this._error = error;
		if (isTaskCancelation(error) || this._abortController.signal.aborted) {
			this._setState("canceled");
		} else {
			this._setState("errored");
		}
		this._reject?.(error);
	}

	private async _execute(): Promise<void> {
		setCurrentTaskInstance(this);

		try {
			this._setState("running");

			const wrapResult = await this._wrapPromise(this._fn(...this._args));

			if (wrapResult.status === "canceled") {
				this._fail(new TaskCancelation());
			} else if (wrapResult.status === "error") {
				this._fail(wrapResult.error);
			} else {
				this._settle(wrapResult.value);
			}
		} finally {
			popCurrentTaskInstance(this);
		}
	}

	private _wrapPromise<T>(
		promise: Promise<T>,
	): Promise<WrapResult<T>> {
		if (this._abortController.signal.aborted) {
			return Promise.resolve({ status: "canceled" });
		}

		return new Promise<WrapResult<T>>((resolve) => {
			const onAbort = () => resolve({ status: "canceled" });

			this._abortController.signal.addEventListener("abort", onAbort, {
				once: true,
			});

			promise.then(
				(val) => {
					this._abortController.signal.removeEventListener("abort", onAbort);
					resolve({ status: "ok", value: val });
				},
				(err) => {
					this._abortController.signal.removeEventListener("abort", onAbort);
					resolve({ status: "error", error: err });
				},
			);
		});
	}

	cancel(): void {
		if (this.isFinished) return;
		this._abortController.abort();
		for (const cb of this._cancelCallbacks) cb();
		this._cancelCallbacks = [];
		if (this._state === "waiting") {
			this._fail(new TaskCancelation());
		}
		if (this._state === "running") {
			this._setState("canceled");
			this._error = new TaskCancelation();
		}
	}

	onCancel(cb: () => void): void {
		if (this.isFinished) return;
		if (this._abortController.signal.aborted) {
			cb();
			return;
		}
		this._cancelCallbacks.push(cb);
	}

	// biome-ignore lint/suspicious/noThenProperty: intentional for PromiseLike
	then<TResult1 = T, TResult2 = never>(
		onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
		onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
	): Promise<TResult1 | TResult2> {
		return this._promise.then(onfulfilled, onrejected);
	}

	catch<TResult = never>(
		onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
	): Promise<T | TResult> {
		return this._promise.catch(onrejected);
	}

	finally(onfinally?: (() => void) | null): Promise<T> {
		return this._promise.finally(onfinally);
	}
}
