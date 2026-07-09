import { describe, test, expect } from "bun:test";

import { getCurrentTaskInstance } from "../src/context.ts";
import { task, timeout, all, race, TaskCancelation } from "../src/index.ts";

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

describe("timeout helper", () => {
	test("resolves after specified time", async () => {
		const start = Date.now();
		await timeout(30);
		const elapsed = Date.now() - start;
		expect(elapsed).toBeGreaterThanOrEqual(20);
	});

	test("gets canceled when task is canceled", async () => {
		const t = task(async () => {
			await timeout(200);
			return "late";
		});

		const instance = t.perform();
		t.cancelAll();
		await expectRejects(instance, TaskCancelation);
	});

	test("rejects immediately when signal is already aborted", async () => {
		const t = task(async () => {
			const self = getCurrentTaskInstance();
			self.cancel();
			try {
				await timeout(10);
			} catch {
				// expected — signal already aborted
			}
		});
		const instance = t.perform();
		await expectRejects(instance, TaskCancelation);
		expect(instance.isCanceled).toBe(true);
	});
});

describe("all helper", () => {
	test("resolves with all values", async () => {
		const t = task(async () => {
			const [a, b, c] = await all([Promise.resolve(1), Promise.resolve(2), Promise.resolve(3)]);
			return a + b + c;
		});

		const result = await t.perform();
		expect(result).toBe(6);
	});

	test("rejects when any promise rejects", async () => {
		const t = task(async () => {
			await all([Promise.resolve(1), Promise.reject(new Error("nope")), Promise.resolve(3)]);
			return "ok";
		});

		await expectRejects(t.perform(), "nope");
	});

	test("rejects immediately when signal is already aborted", async () => {
		const t = task(async () => {
			const self = getCurrentTaskInstance();
			self.cancel();
			try {
				await all([Promise.resolve(1)]);
			} catch {
				// expected — signal already aborted
			}
		});
		const instance = t.perform();
		await expectRejects(instance, TaskCancelation);
	});

	test("works outside a task context", async () => {
		const result = await all([Promise.resolve(1), Promise.resolve(2)]);
		expect(result).toEqual([1, 2]);
	});

	test("cancel during all() rejects with TaskCancelation", async () => {
		const t = task(async () => {
			await all([new Promise(() => {})]);
		});

		const instance = t.perform();
		await timeout(10);
		instance.cancel();
		await expectRejects(instance, TaskCancelation);
	});
});

describe("race helper", () => {
	test("resolves with first settled value", async () => {
		const t = task(async () => {
			const result = await race([
				timeout(50).then(() => "slow"),
				Promise.resolve("fast"),
			]);
			return result;
		});

		const result = await t.perform();
		expect(result).toBe("fast");
	});

	test("rejects when the first settled promise rejects", async () => {
		const t = task(async () => {
			await race([
				Promise.reject(new Error("first-reject")),
				timeout(50).then(() => "slow"),
			]);
		});

		await expectRejects(t.perform(), "first-reject");
	});

	test("rejects immediately when signal is already aborted", async () => {
		const t = task(async () => {
			const self = getCurrentTaskInstance();
			self.cancel();
			try {
				await race([Promise.resolve(1)]);
			} catch {
				// expected — signal already aborted
			}
		});
		const instance = t.perform();
		await expectRejects(instance, TaskCancelation);
	});

	test("works outside a task context", async () => {
		const result = await race([Promise.resolve(1), Promise.resolve(2)]);
		expect(result).toBe(1);
	});

	test("cancel during race() rejects with TaskCancelation", async () => {
		const t = task(async () => {
			await race([new Promise(() => {}), new Promise(() => {})]);
		});

		const instance = t.perform();
		await timeout(10);
		instance.cancel();
		await expectRejects(instance, TaskCancelation);
	});
});
