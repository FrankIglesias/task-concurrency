import { describe, test, expect } from "bun:test";

import { Scheduler } from "../src/scheduler/scheduler.ts";
import { UnboundedSchedulerPolicy } from "../src/scheduler/unbounded-policy.ts";
import { task, timeout } from "../src/index.ts";

describe("maxConcurrency", () => {
	test("limits concurrent executions", async () => {
		let current = 0;
		let max = 0;

		const t = task(async (id: number) => {
			current++;
			await timeout(50);
			max = Math.max(max, current);
			await timeout(50);
			current--;
			return id;
		}).maxConcurrency(2);

		const instances = await Promise.all([t.perform(1), t.perform(2), t.perform(3), t.perform(4)]);
		expect(instances).toEqual([1, 2, 3, 4]);
		expect(max).toBe(2);
	});
});

describe("Chaining modifier methods", () => {
	test("maxConcurrency(3) works via chaining", async () => {
		let current = 0;
		let max = 0;

		const t = task(async (id: number) => {
			current++;
			await timeout(30);
			max = Math.max(max, current);
			await timeout(30);
			current--;
			return id;
		}).maxConcurrency(3);

		const instances = await Promise.all([t.perform(1), t.perform(2), t.perform(3), t.perform(4)]);
		expect(instances).toEqual([1, 2, 3, 4]);
		expect(max).toBeLessThanOrEqual(3);
	});
});

describe("Scheduler internals", () => {
	test("running and queued getters", async () => {
		const scheduler = new Scheduler(new UnboundedSchedulerPolicy());
		expect(scheduler.running).toEqual([]);
		expect(scheduler.queued).toEqual([]);
	});
});
