import { describe, test, expect } from "bun:test";

import { task, timeout } from "../src/index.ts";

describe("cancelAll", () => {
	test("cancels all running instances", async () => {
		const t = task(async () => {
			await timeout(200);
			return "x";
		});

		const a = t.perform();
		await timeout(10);
		const b = t.perform();
		t.cancelAll();
		await new Promise((r) => setTimeout(r, 50));

		expect(t.isRunning).toBe(false);
		expect(t.isIdle).toBe(true);
		expect(a.isCanceled).toBe(true);
		expect(b.isCanceled).toBe(true);
	});

	test("cancels all running and queued instances", async () => {
		const t = task(async () => {
			await timeout(50);
		}).enqueue();

		const a = t.perform();
		const b = t.perform();
		const c = t.perform();
		await new Promise((r) => setTimeout(r, 10));
		t.cancelAll();
		await new Promise((r) => setTimeout(r, 100));

		expect(a.isCanceled).toBe(true);
		expect(b.isCanceled).toBe(true);
		expect(c.isCanceled).toBe(true);
		expect(t.isIdle).toBe(true);
	});

	test("perform after cancelAll starts fresh", async () => {
		const t = task(async () => {
			return "ok";
		});

		t.perform();
		t.cancelAll();
		await new Promise((r) => setTimeout(r, 0));
		const instance = t.perform();
		const result = await instance;
		expect(result).toBe("ok");
	});
});
