import { DropSchedulerPolicy } from "@/scheduler/drop-policy";
import { EnqueueSchedulerPolicy } from "@/scheduler/enqueue-policy";
import { KeepLatestSchedulerPolicy } from "@/scheduler/keep-latest-policy";
import { RestartableSchedulerPolicy } from "@/scheduler/restartable-policy";
import { Scheduler, type SchedulerDelegate } from "@/scheduler/scheduler";
import type { SchedulerPolicy } from "@/scheduler/types";
import { UnboundedSchedulerPolicy } from "@/scheduler/unbounded-policy";
import { TaskInstance, type TaskInstanceState } from "@/task-instance";

export type OnStateCallback<T = unknown> = (state: TaskDerivedState<T>) => void;

export interface TaskDerivedState<T = unknown> {
	isRunning: boolean;
	isIdle: boolean;
	isQueued: boolean;
	state: "idle" | "running" | "queued";
	performCount: number;
	last: TaskInstance<T> | null;
	lastSuccessful: TaskInstance<T> | null;
	lastErrored: TaskInstance<T> | null;
	lastCanceled: TaskInstance<T> | null;
	lastPerformed: TaskInstance<T> | null;
	lastRunning: TaskInstance<T> | null;
	lastComplete: TaskInstance<T> | null;
	lastIncomplete: TaskInstance<T> | null;
}

type PolicyConstructor = new (
	maxConcurrency?: number | null,
) => SchedulerPolicy;

const DEFAULT_POLICY: PolicyConstructor = UnboundedSchedulerPolicy;

export class Task<T = unknown, Args extends unknown[] = unknown[]>
	implements SchedulerDelegate, PromiseLike<TaskInstance<T>>
{
	private _policyCtor: PolicyConstructor = DEFAULT_POLICY;
	private _maxConcurrency: number | null = null;
	private _scheduler: Scheduler | null = null;

	private _performCount = 0;
	private _last: TaskInstance<T> | null = null;
	private _lastPerformed: TaskInstance<T> | null = null;
	private _lastRunning: TaskInstance<T> | null = null;
	private _lastComplete: TaskInstance<T> | null = null;
	private _lastSuccessful: TaskInstance<T> | null = null;
	private _lastErrored: TaskInstance<T> | null = null;
	private _lastCanceled: TaskInstance<T> | null = null;
	private _lastIncomplete: TaskInstance<T> | null = null;

	private _onStateCallback: OnStateCallback<T> | null = null;

	constructor(private _fn: (...args: Args) => Promise<T>) {}

	private _rebuildScheduler(): void {
		const policy = new this._policyCtor(this._maxConcurrency);
		this._scheduler = new Scheduler(policy);
		this._scheduler.delegate = this;
	}

	private _ensureScheduler(): Scheduler {
		if (!this._scheduler) {
			this._rebuildScheduler();
		}
		return this._scheduler as Scheduler;
	}

	get isRunning(): boolean {
		return this._scheduler?.hasRunning ?? false;
	}

	get isQueued(): boolean {
		return this._scheduler?.hasQueued ?? false;
	}

	get isIdle(): boolean {
		return !this.isRunning && !this.isQueued;
	}

	get state(): "idle" | "running" | "queued" {
		if (this.isRunning) return "running";
		if (this.isQueued) return "queued";
		return "idle";
	}

	get performCount(): number {
		return this._performCount;
	}

	get last(): TaskInstance<T> | null {
		return this._last;
	}

	get lastPerformed(): TaskInstance<T> | null {
		return this._lastPerformed;
	}

	get lastRunning(): TaskInstance<T> | null {
		return this._lastRunning;
	}

	get lastComplete(): TaskInstance<T> | null {
		return this._lastComplete;
	}

	get lastSuccessful(): TaskInstance<T> | null {
		return this._lastSuccessful;
	}

	get lastErrored(): TaskInstance<T> | null {
		return this._lastErrored;
	}

	get lastCanceled(): TaskInstance<T> | null {
		return this._lastCanceled;
	}

	get lastIncomplete(): TaskInstance<T> | null {
		return this._lastIncomplete;
	}

	perform(...args: Args): TaskInstance<T> {
		this._ensureScheduler();

		const instance = new TaskInstance<T>(
			this._fn as (...args: unknown[]) => Promise<T>,
			args as unknown[],
		);

		this._performCount++;
		this._last = instance;
		this._lastPerformed = instance;

		instance.onStateChange = (state) => {
			this._onInstanceStateChanged(instance, state);
		};

		this._scheduler?.submit(instance as unknown as TaskInstance<unknown>);

		return instance;
	}

	cancelAll(): void {
		this._ensureScheduler();
		this._scheduler?.cancelAll();
	}

	private _onInstanceStateChanged(
		instance: TaskInstance<T>,
		state: TaskInstanceState,
	): void {
		if (state === "running") {
			this._lastRunning = instance;
		} else if (state === "completed") {
			this._lastComplete = instance;
			this._lastSuccessful = instance;
		} else if (state === "errored") {
			this._lastComplete = instance;
			this._lastErrored = instance;
		} else if (state === "canceled") {
			this._lastCanceled = instance;
		}

		if (!instance.isFinished) {
			this._lastIncomplete = instance;
		}
	}

	restartable(): this {
		if (this._policyCtor !== RestartableSchedulerPolicy) {
			this._policyCtor = RestartableSchedulerPolicy;
			this._rebuildScheduler();
		}
		return this;
	}

	enqueue(): this {
		if (this._policyCtor !== EnqueueSchedulerPolicy) {
			this._policyCtor = EnqueueSchedulerPolicy;
			this._rebuildScheduler();
		}
		return this;
	}

	drop(): this {
		if (this._policyCtor !== DropSchedulerPolicy) {
			this._policyCtor = DropSchedulerPolicy;
			this._rebuildScheduler();
		}
		return this;
	}

	keepLatest(): this {
		if (this._policyCtor !== KeepLatestSchedulerPolicy) {
			this._policyCtor = KeepLatestSchedulerPolicy;
			this._rebuildScheduler();
		}
		return this;
	}

	maxConcurrency(n: number): this {
		this._maxConcurrency = n;
		if (this._scheduler) {
			this._rebuildScheduler();
		}
		return this;
	}

	onState(callback: OnStateCallback<T> | null): this {
		this._onStateCallback = callback;
		if (callback) {
			callback(this._collectState());
		}
		return this;
	}

	onStateChanged(): void {
		if (this._onStateCallback) {
			this._onStateCallback(this._collectState());
		}
	}

	private _collectState(): TaskDerivedState<T> {
		return {
			isRunning: this.isRunning,
			isIdle: this.isIdle,
			isQueued: this.isQueued,
			state: this.state,
			performCount: this._performCount,
			last: this._last,
			lastSuccessful: this._lastSuccessful,
			lastErrored: this._lastErrored,
			lastCanceled: this._lastCanceled,
			lastPerformed: this._lastPerformed,
			lastRunning: this._lastRunning,
			lastComplete: this._lastComplete,
			lastIncomplete: this._lastIncomplete,
		};
	}

	// biome-ignore lint/suspicious/noThenProperty: intentional for PromiseLike
	then<TResult1 = TaskInstance<T>, TResult2 = never>(
		onfulfilled?:
			| ((value: TaskInstance<T>) => TResult1 | PromiseLike<TResult1>)
			| null,
		onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
	): Promise<TResult1 | TResult2> {
		const last = this._last;
		if (last) {
			return last.then(onfulfilled as never, onrejected);
		}
		return Promise.reject(new Error("Task has never been performed")).then(
			onfulfilled as never,
			onrejected,
		);
	}

	catch<TResult = never>(
		onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
	): Promise<TaskInstance<T> | TResult> {
		return this.then(null, onrejected);
	}

	finally(onfinally?: (() => void) | null): Promise<TaskInstance<T>> {
		return this.then().finally(onfinally);
	}
}

export function task<T, Args extends unknown[]>(
	fn: (...args: Args) => Promise<T>,
): Task<T, Args> {
	return new Task<T, Args>(fn);
}
