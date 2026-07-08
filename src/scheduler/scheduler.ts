import type { SchedulerPolicy } from "@/scheduler/types";
import type { TaskInstance } from "@/task-instance";

export interface SchedulerDelegate {
	onStateChanged(): void;
}

export class Scheduler {
	private _running: TaskInstance<unknown>[] = [];
	private _queue: TaskInstance<unknown>[] = [];
	private _delegate: SchedulerDelegate | null = null;

	constructor(private _policy: SchedulerPolicy) {}

	set delegate(d: SchedulerDelegate | null) {
		this._delegate = d;
	}

	get running(): ReadonlyArray<TaskInstance<unknown>> {
		return this._running;
	}

	get queued(): ReadonlyArray<TaskInstance<unknown>> {
		return this._queue;
	}

	get hasRunning(): boolean {
		return this._running.length > 0;
	}

	get hasQueued(): boolean {
		return this._queue.length > 0;
	}

	submit(instance: TaskInstance<unknown>): void {
		if (instance.isFinished) return;

		const action = this._policy.actionFor(instance, this._running, this._queue);

		switch (action.type) {
			case "run":
				this._startInstance(instance);
				break;
			case "queue":
				this._queue.push(instance);
				this._notifyDelegate();
				break;
			case "drop":
				instance.cancel();
				this._notifyDelegate();
				break;
			case "cancelAndRun": {
				action.instance.cancel();
				this._startInstance(instance);
				break;
			}
		}
	}

	cancelAll(): void {
		for (const inst of [...this._running, ...this._queue]) {
			if (!inst.isFinished) {
				inst.cancel();
			}
		}
		this._running = [];
		this._queue = [];
		this._notifyDelegate();
	}

	private _startInstance(instance: TaskInstance<unknown>): void {
		this._running.push(instance);
		instance.start();

		instance
			.finally(() => {
				this._removeFinished(instance);
				this._processQueue();
				this._notifyDelegate();
			})
			.catch(() => {});

		this._notifyDelegate();
	}

	private _removeFinished(instance: TaskInstance<unknown>): void {
		const idx = this._running.indexOf(instance);
		if (idx !== -1) {
			this._running.splice(idx, 1);
		}
	}

	private _processQueue(): void {
		while (
			this._queue.length > 0 &&
			this._running.length < this.maxConcurrency
		) {
			const next = this._queue.shift();
			if (!next || next.isCanceled) continue;
			this._startInstance(next);
		}
	}

	private get maxConcurrency(): number {
		return this._policy.maxConcurrency ?? Infinity;
	}

	private _notifyDelegate(): void {
		this._delegate?.onStateChanged();
	}
}
