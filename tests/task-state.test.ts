import { describe, test, expect } from "bun:test";

import { task, timeout } from "../src/index.ts";

async function expectRejects(promise: PromiseLike<unknown>): Promise<void> {
	let caught = false;
	try {
		await promise;
	} catch {
		caught = true;
	}
	if (!caught) {
		throw new Error("Expected promise to reject but it resolved");
	}
}

describe("Task state properties", () => {
	test("isIdle when no task is running", () => {
		const t = task(async () => 1);
		expect(t.isIdle).toBe(true);
		expect(t.state).toBe("idle");
	});

	test("isRunning while task executes", async () => {
		const t = task(async () => {
			await timeout(50);
			return "ok";
		});

		const p = t.perform();
		expect(t.isRunning).toBe(true);
		expect(t.state).toBe("running");
		expect(t.isIdle).toBe(false);

		await p;
		expect(t.isRunning).toBe(false);
		expect(t.isIdle).toBe(true);
	});

	test("performCount increments", async () => {
		const t = task(async (n: number) => n + 1);
		expect(t.performCount).toBe(0);

		await t.perform(1);
		expect(t.performCount).toBe(1);

		await t.perform(2);
		expect(t.performCount).toBe(2);
	});

	test("last* references track instances", async () => {
		const t = task(async (n: number) => {
			await timeout(10);
			return n * 2;
		});

		const inst1 = t.perform(5);
		await inst1;
		expect(t.last).toBe(inst1);
		expect(t.lastSuccessful).toBe(inst1);
		expect(t.lastPerformed).toBe(inst1);
		expect(t.last?.value).toBe(10);

		const inst2 = t.perform(10);
		await inst2;
		expect(t.last).toBe(inst2);
		expect(t.lastSuccessful).toBe(inst2);
		expect(t.lastPerformed).toBe(inst2);
		expect(t.last?.value).toBe(20);
	});

	test("lastErrored set on error", async () => {
		const t = task(async () => {
			throw new Error("fail");
		});

		const instance = t.perform();
		await expectRejects(instance);
		expect(t.lastErrored).toBe(instance);
	});

	test("lastCanceled set on cancel", async () => {
		const t = task(async () => {
			await timeout(200);
			return "x";
		});

		const instance = t.perform();
		instance.cancel();
		await expectRejects(instance);
		expect(t.lastCanceled).toBe(instance);
	});

	test("lastRunning tracks the running instance", async () => {
		const t = task(async () => {
			await timeout(50);
			return "ok";
		});

		expect(t.lastRunning).toBeNull();
		const instance = t.perform();
		expect(t.lastRunning).toBe(instance);
		await instance;
		expect(t.lastRunning).toBe(instance);
	});

	test("lastComplete tracks completed and errored instances", async () => {
		const t = task(async (n: number) => {
			await timeout(10);
			if (n === 0) throw new Error("fail");
			return n;
		});

		expect(t.lastComplete).toBeNull();

		const errInstance = t.perform(0);
		await expectRejects(errInstance);
		expect(t.lastComplete).toBe(errInstance);

		const okInstance = t.perform(1);
		await okInstance;
		expect(t.lastComplete).toBe(okInstance);
	});

	test("lastIncomplete tracks the running instance", async () => {
		const t = task(async () => {
			await timeout(50);
			return "ok";
		});

		expect(t.lastIncomplete).toBeNull();
		const instance = t.perform();
		expect(t.lastIncomplete).toBe(instance);
		await instance;
		expect(t.lastIncomplete).toBe(instance);
	});

	test("isQueued and queued state", async () => {
		const t = task(async () => {
			await timeout(50);
		}).enqueue();

		expect(t.isQueued).toBe(false);
		expect(t.state).toBe("idle");

		const a = t.perform();
		expect(t.isQueued).toBe(false);
		expect(t.state).toBe("running");

		const b = t.perform();
		expect(t.isQueued).toBe(true);
		expect(t.state).toBe("running");

		await a;
		await b;
		expect(t.isQueued).toBe(false);
		expect(t.state).toBe("idle");
	});
});
