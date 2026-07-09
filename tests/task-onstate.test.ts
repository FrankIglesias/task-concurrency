import { describe, test, expect } from "bun:test";

import { task, timeout } from "../src/index.ts";

describe("onState callback", () => {
	test("receives state updates", async () => {
		const states: Array<{ isRunning: boolean; isIdle: boolean }> = [];
		const t = task(async () => {
			await timeout(10);
			return 1;
		}).onState((s) => {
			states.push({ isRunning: s.isRunning, isIdle: s.isIdle });
		});

		await t.perform();
		expect(states.length).toBeGreaterThanOrEqual(2);
		expect(states.some((s) => s.isRunning)).toBe(true);
		expect(states.some((s) => s.isIdle)).toBe(true);
	});

	test("immediately fires with current state on registration", async () => {
		let state: any = null;
		const t = task(async () => 1).onState((s) => {
			state = s;
		});

		expect(state).not.toBe(null);
		expect(state.isIdle).toBe(true);
	});

	test("can be disabled by passing null", async () => {
		let callCount = 0;
		const t = task(async () => 1).onState(() => {
			callCount++;
		});
		t.onState(null);

		await t.perform();
		expect(callCount).toBe(1);
	});
});
