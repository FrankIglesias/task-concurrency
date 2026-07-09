import { describe, test, expect } from "bun:test";

import { task } from "../src/index.ts";

async function expectRejects(promise: PromiseLike<unknown>, pattern?: string | RegExp): Promise<void> {
	let caught = false;
	try {
		await promise;
	} catch (e) {
		caught = true;
		if (typeof pattern === "string") {
			expect((e as Error).message).toBe(pattern);
		} else if (pattern instanceof RegExp) {
			expect((e as Error).message).toMatch(pattern);
		}
	}
	if (!caught) {
		throw new Error("Expected promise to reject but it resolved");
	}
}

describe("Task PromiseLike", () => {
	test("then() resolves with last performed value", async () => {
		const t = task(async () => 42);
		t.perform();
		const result = await t;
		expect(result).toBe(42);
	});

	test("then() rejects when task was never performed", async () => {
		const t = task(async () => 42);
		await expectRejects(t.then(), "Task has never been performed");
	});

	test("catch() works on Task", async () => {
		let err: unknown = undefined;
		const t = task(async () => {
			throw new Error("task-error");
		});
		t.perform();
		await t.catch((e) => {
			err = e;
		});
		expect((err as Error).message).toBe("task-error");
	});

	test("finally() runs on Task", async () => {
		let called = false;
		const t = task(async () => 42);
		t.perform();
		await t.finally(() => {
			called = true;
		});
		expect(called).toBe(true);
	});
});
