import { describe, test, expect } from "bun:test";

import { task, timeout } from "../src/index.ts";

describe("restartable modifier", () => {
	test("cancels previous task when new one starts", async () => {
		let count = 0;
		const t = task(async () => {
			count++;
			await timeout(100);
			return count;
		}).restartable();

		const first = t.perform();
		await timeout(10);
		const second = t.perform();
		await timeout(200);

		expect(first.isCanceled).toBe(true);
		expect(second.isSuccessful).toBe(true);
		expect(count).toBe(2);
	});

	test("only one task runs at a time", async () => {
		const t = task(async () => {
			await timeout(50);
		}).restartable();

		const a = t.perform();
		await timeout(10);
		const b = t.perform();
		await timeout(100);

		expect(a.isCanceled).toBe(true);
		expect(b.isSuccessful).toBe(true);
	});
});

describe("drop modifier", () => {
	test("drops new perform while task is running", async () => {
		let count = 0;
		const t = task(async () => {
			count++;
			await timeout(80);
		}).drop();

		const first = t.perform();
		const second = t.perform();
		await timeout(200);

		expect(count).toBe(1);
		expect(first.isSuccessful).toBe(true);
		expect(second.isCanceled).toBe(true);
	});

	test("allows new perform after completion", async () => {
		let count = 0;
		const t = task(async () => {
			count++;
		}).drop();

		await t.perform();
		await t.perform();
		expect(count).toBe(2);
	});
});

describe("enqueue modifier", () => {
	test("runs tasks sequentially, one at a time", async () => {
		const order: string[] = [];
		const t = task(async (id: string) => {
			order.push(`start-${id}`);
			await timeout(30);
			order.push(`end-${id}`);
			return id;
		}).enqueue();

		await Promise.all([t.perform("a"), t.perform("b"), t.perform("c")]);
		expect(order).toEqual(["start-a", "end-a", "start-b", "end-b", "start-c", "end-c"]);
	});

	test("preserves return order", async () => {
		const t = task(async (x: number) => {
			await timeout(30);
			return x;
		}).enqueue();

		const results = await Promise.all([t.perform(1), t.perform(2)]);
		expect(results).toEqual([1, 2]);
	});
});

describe("keepLatest modifier", () => {
	test("drops all but the most recent queued perform", async () => {
		let count = 0;
		const t = task(async (v: string) => {
			count++;
			await timeout(50);
			return v;
		}).keepLatest();

		const a = t.perform("a");
		await timeout(5);
		const b = t.perform("b");
		await timeout(5);
		const c = t.perform("c");
		await timeout(200);

		expect(a.isSuccessful || a.isCanceled).toBe(true);
		expect(b.isCanceled).toBe(true);
		expect(c.isSuccessful).toBe(true);
	});
});
