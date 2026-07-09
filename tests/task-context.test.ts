import { describe, test, expect } from "bun:test";

import { getCurrentTaskInstance } from "../src/context.ts";
import { task, timeout } from "../src/index.ts";

describe("AsyncLocalStorage context isolation", () => {
	test("concurrent instances have their own context", async () => {
		const t = task(async (id: number) => {
			const self = getCurrentTaskInstance();
			await timeout(20);
			const selfAgain = getCurrentTaskInstance();
			expect(selfAgain).toBe(self);
			return { id, instance: self };
		}).maxConcurrency(3);

		const [a, b, c] = await Promise.all([t.perform(1), t.perform(2), t.perform(3)]);

		expect(a.instance).not.toBe(b.instance);
		expect(a.instance).not.toBe(c.instance);
		expect(b.instance).not.toBe(c.instance);
	});
});
