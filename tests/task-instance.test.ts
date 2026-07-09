import { describe, test, expect } from "bun:test";

import { task, timeout, TaskCancelation, isTaskCancelation } from "../src/index.ts";

async function expectRejects(promise: PromiseLike<unknown>, pattern?: string | RegExp | Function): Promise<void> {
	let caught = false;
	try {
		await promise;
	} catch (e) {
		caught = true;
		if (pattern instanceof Function) {
			expect(e).toBeInstanceOf(pattern);
		} else if (typeof pattern === "string") {
			expect((e as Error).message).toBe(pattern);
		} else if (pattern instanceof RegExp) {
			expect((e as Error).message).toMatch(pattern);
		}
	}
	if (!caught) {
		throw new Error("Expected promise to reject but it resolved");
	}
}

describe("TaskInstance", () => {
	test("performs basic task and returns value", async () => {
		const t = task(async (x: number) => {
			await timeout(10);
			return x * 2;
		});

		const instance = t.perform(5);
		const result = await instance;
		expect(result).toBe(10);
	});

	test("is thenable via await", async () => {
		const t = task(async () => 42);
		const result = await t.perform();
		expect(result).toBe(42);
	});

	test("handles errors gracefully", async () => {
		const t = task(async () => {
			throw new Error("boom");
		});

		const instance = t.perform();
		await expectRejects(instance, "boom");
		expect(instance.isError).toBe(true);
		expect(instance.error).toBeDefined();
		expect((instance.error as Error).message).toBe("boom");
	});

	test("tracks state transitions: waiting -> running -> completed", async () => {
		const t = task(async () => {
			await timeout(10);
			return "ok";
		});

		const instance = t.perform();
		expect(instance.hasStarted).toBe(true);
		expect(instance.isRunning).toBe(true);

		await instance;
		expect(instance.isSuccessful).toBe(true);
		expect(instance.isFinished).toBe(true);
		expect(instance.isCanceled).toBe(false);
	});

	test("state is canceled when canceled", async () => {
		const t = task(async () => {
			await timeout(200);
			return "no";
		});

		const instance = t.perform();
		instance.cancel();
		expect(instance.isCanceled).toBe(true);
		expect(instance.isFinished).toBe(true);
		await expectRejects(instance, TaskCancelation);
	});

	test("isTaskCancelation identifies cancellation errors", async () => {
		const t = task(async () => {
			await timeout(200);
			return "no";
		});

		const instance = t.perform();
		instance.cancel();
		try {
			await instance;
		} catch (e) {
			expect(isTaskCancelation(e)).toBe(true);
		}
	});

	test("multiple performance creates separate instances", async () => {
		const t = task(async (n: number) => {
			await timeout(10);
			return n;
		});

		const [a, b] = await Promise.all([t.perform(1), t.perform(2)]);
		expect(a).toBe(1);
		expect(b).toBe(2);
	});

	test("state getter returns correct state", async () => {
		const t = task(async () => {
			await timeout(10);
			return "ok";
		});

		const instance = t.perform();
		expect(instance.state).toBe("running");
		await instance;
		expect(instance.state).toBe("completed");
	});

	test("signal is an AbortSignal", async () => {
		const t = task(async () => 42);
		const instance = t.perform();
		expect(instance.signal).toBeInstanceOf(AbortSignal);
		expect(instance.signal.aborted).toBe(false);
		instance.cancel();
		expect(instance.signal.aborted).toBe(true);
	});

	test("value is set on completion", async () => {
		const t = task(async (x: number) => {
			await timeout(10);
			return x * 2;
		});
		const instance = t.perform(5);
		expect(instance.value).toBeUndefined();
		await instance;
		expect(instance.value).toBe(10);
	});

	test("catch() catches rejection", async () => {
		const t = task(async () => {
			throw new Error("instance-error");
		});
		const instance = t.perform();
		let caught: unknown = undefined;
		await instance.catch((e) => {
			caught = e;
		});
		expect((caught as Error).message).toBe("instance-error");
	});
});
