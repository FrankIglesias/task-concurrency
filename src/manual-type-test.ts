// Manual type test — open this file in your IDE and check that:
// 1. `t` is inferred as `Task<number, [x: number]>`  (not `any`)
// 2. `perform` accepts `(x: number)`
// 3. `value`, `last`, `lastSuccessful` etc. are properly typed

import { task, TaskInstance } from "./index";

// --- Basic inference ---
const t = task(async (x: number) => x * 2);
const instance = t.perform(5);
const result: number = await instance;

// --- performCount ---
const count: number = t.performCount;

// --- last* refs ---
const lastVal: number | undefined = t.last?.value;
const successVal: number | undefined = t.lastSuccessful?.value;
const errorVal: unknown = t.lastErrored?.error;

// --- onState with inferred types ---
t.onState((s) => {
	const val: number | undefined = s.last?.value;
	const count2: number = s.performCount;
});

// --- Multiple args ---
const t2 = task(async (a: string, b: number) => ({ a, b }));
const i2 = t2.perform("hello", 42);
const v2: { a: string; b: number } = await i2;

// --- No args ---
const t3 = task(async () => 42);
const i3 = t3.perform();
const v3: number = await i3;

// --- Chaining ---
const t4 = task(async (n: number) => n).restartable().maxConcurrency(3);
t4.perform(5);

// --- TaskInstance type ---
const ti: TaskInstance<number> = instance;
const val: number | undefined = ti.value;
const err: unknown = ti.error;
