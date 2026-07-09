# task-concurrency

A TypeScript library for managing asynchronous task concurrency, inspired by [Ember Concurrency](https://ember-concurrency.com/).

## Install

```sh
bun add task-concurrency
```

## Quick Start

```ts
import { task } from "task-concurrency";

const fetchUser = task(async (id: number) => {
  const res = await fetch(`/users/${id}`);
  return res.json();
});

const instance = fetchUser.perform(1);
const user = await instance;
```

## Two Interfaces

### Chaining methods

```ts
const t = task(async (id: number) => {
  const res = await fetch(`/users/${id}`);
  return res.json();
}).restartable().maxConcurrency(3);
```

Calling a policy method a second time is a no-op. Replacing a policy mid-flight (e.g. `.drop()` after `.restartable()`) rebuilds the scheduler; any in-flight instances are orphaned.

### Helper functions

`timeout`, `all`, and `race` are standalone functions that auto-detect the enclosing task via the context stack. They auto-cancel when the task is canceled, unlike `Promise.all` / `Promise.race`:

```ts
const t = task(async () => {
  const [a, b] = await all([fetchA(), fetchB()]);
  return a + b;
});
```

If this task is canceled mid-flight, `all` rejects immediately and `fetchB` is never awaited — no I/O leak.

Outside a task context, `all` and `race` behave identically to `Promise.all` / `Promise.race`. `timeout` resolves after the given delay.

## Concurrency Modifiers

### `restartable`

Cancels the previous invocation when a new one starts — only the latest execution matters.

```ts
const search = task(async (query: string) => {
  const results = await searchAPI(query);
  return results;
}).restartable();

search.perform("a");  // canceled
search.perform("ab"); // canceled
search.perform("abc"); // completes
```

### `drop`

Drops a new invocation if one is already running.

```ts
const save = task(async () => {
  await saveToDB();
}).drop();

save.perform();  // runs
save.perform();  // dropped — already running
```

### `enqueue`

Queues invocations to run one at a time, in order.

```ts
const sync = task(async (file: string) => {
  await upload(file);
}).enqueue();

sync.perform("a"); // runs immediately
sync.perform("b"); // waits for "a"
sync.perform("c"); // waits for "b"
```

### `keepLatest`

Like `enqueue`, but if multiple are queued, only the most recent one runs.

```ts
const log = task(async (msg: string) => {
  await send(msg);
}).keepLatest();

log.perform("a"); // runs
log.perform("b"); // queued
log.perform("c"); // replaces "b"
// only "a" and "c" run
```

### `maxConcurrency`

Limits how many invocations run in parallel (default: unlimited).

```ts
const process = task(async (item: number) => {
  await work(item);
}).maxConcurrency(3);
```

## Concurrency Helpers

### `timeout`

```ts
const t = task(async () => {
  await timeout(1000);
  return "done";
});
```

### `all`

```ts
const t = task(async () => {
  const [a, b] = await all([fetchA(), fetchB()]);
  return a + b;
});
```

### `race`

```ts
const t = task(async () => {
  const result = await race([
    timeout(5000).then(() => "slow"),
    fastCache(),
  ]);
  return result;
});
```

## Cancellation

```ts
const instance = t.perform();
instance.cancel();

// Cancel all running/queued instances
t.cancelAll();
```

## State

Task instances expose their lifecycle state:

```ts
const instance = t.perform();
instance.hasStarted // true
instance.isRunning  // true
await instance;
instance.isSuccessful // true
instance.isFinished   // true
instance.isCanceled   // false
instance.value        // return value
```

Track task-level state:

```ts
t.isRunning  // task is busy
t.isIdle     // task is idle
t.isQueued   // instances are waiting
t.performCount // total invocations
t.last        // most recent instance
t.lastSuccessful
t.lastErrored
t.lastCanceled
```

## onState Callback

```ts
task(async () => { ... }).onState((state) => {
  console.log(state.isRunning, state.isIdle);
});
```


