import { describe, test, expect } from 'bun:test';

import { getCurrentTaskInstance } from '../src/context.ts';
import {
  task,
  timeout,
  all,
  race,
  TaskCancelation,
  isTaskCancelation,
} from '../src/index.ts';

async function expectRejects(promise: PromiseLike<unknown>, pattern?: string | RegExp | Function): Promise<void> {
  let caught = false;
  try {
    await promise;
  } catch (e) {
    caught = true;
    if (pattern instanceof Function) {
      expect(e).toBeInstanceOf(pattern);
    } else if (typeof pattern === 'string') {
      expect((e as Error).message).toBe(pattern);
    } else if (pattern instanceof RegExp) {
      expect((e as Error).message).toMatch(pattern);
    }
  }
  if (!caught) {
    throw new Error('Expected promise to reject but it resolved');
  }
}

describe('TaskInstance', () => {
  test('performs basic task and returns value', async () => {
    const t = task(async (x: number) => {
      await timeout(10);
      return x * 2;
    });

    const instance = t.perform(5);
    const result = await instance;
    expect(result).toBe(10);
  });

  test('is thenable via await', async () => {
    const t = task(async () => 42);
    const result = await t.perform();
    expect(result).toBe(42);
  });

  test('handles errors gracefully', async () => {
    const t = task(async () => {
      throw new Error('boom');
    });

    const instance = t.perform();
    await expectRejects(instance, 'boom');
    expect(instance.isError).toBe(true);
    expect(instance.error).toBeDefined();
    expect((instance.error as Error).message).toBe('boom');
  });

  test('tracks state transitions: waiting -> running -> completed', async () => {
    const t = task(async () => {
      await timeout(10);
      return 'ok';
    });

    const instance = t.perform();
    expect(instance.hasStarted).toBe(true);
    expect(instance.isRunning).toBe(true);

    await instance;
    expect(instance.isSuccessful).toBe(true);
    expect(instance.isFinished).toBe(true);
    expect(instance.isCanceled).toBe(false);
  });

  test('state is canceled when canceled', async () => {
    const t = task(async () => {
      await timeout(200);
      return 'no';
    });

    const instance = t.perform();
    instance.cancel();
    expect(instance.isCanceled).toBe(true);
    expect(instance.isFinished).toBe(true);
    await expectRejects(instance, TaskCancelation);
  });

  test('isTaskCancelation identifies cancellation errors', async () => {
    const t = task(async () => {
      await timeout(200);
      return 'no';
    });

    const instance = t.perform();
    instance.cancel();
    try {
      await instance;
    } catch (e) {
      expect(isTaskCancelation(e)).toBe(true);
    }
  });

  test('multiple performance creates separate instances', async () => {
    const t = task(async (n: number) => {
      await timeout(10);
      return n;
    });

    const [a, b] = await Promise.all([t.perform(1), t.perform(2)]);
    expect(a).toBe(1);
    expect(b).toBe(2);
  });

  test('state getter returns correct state', async () => {
    const t = task(async () => {
      await timeout(10);
      return 'ok';
    });

    const instance = t.perform();
    expect(instance.state).toBe('running');
    await instance;
    expect(instance.state).toBe('completed');
  });

  test('signal is an AbortSignal', async () => {
    const t = task(async () => 42);
    const instance = t.perform();
    expect(instance.signal).toBeInstanceOf(AbortSignal);
    expect(instance.signal.aborted).toBe(false);
    instance.cancel();
    expect(instance.signal.aborted).toBe(true);
  });

  test('value is set on completion', async () => {
    const t = task(async (x: number) => {
      await timeout(10);
      return x * 2;
    });
    const instance = t.perform(5);
    expect(instance.value).toBeUndefined();
    await instance;
    expect(instance.value).toBe(10);
  });

  test('catch() catches rejection', async () => {
    const t = task(async () => {
      throw new Error('instance-error');
    });
    const instance = t.perform();
    let caught: unknown = undefined;
    await instance.catch((e) => { caught = e; });
    expect((caught as Error).message).toBe('instance-error');
  });
});

describe('Task state properties', () => {
  test('isIdle when no task is running', () => {
    const t = task(async () => 1);
    expect(t.isIdle).toBe(true);
    expect(t.state).toBe('idle');
  });

  test('isRunning while task executes', async () => {
    const t = task(async () => {
      await timeout(50);
      return 'ok';
    });

    const p = t.perform();
    expect(t.isRunning).toBe(true);
    expect(t.state).toBe('running');
    expect(t.isIdle).toBe(false);

    await p;
    expect(t.isRunning).toBe(false);
    expect(t.isIdle).toBe(true);
  });

  test('performCount increments', async () => {
    const t = task(async (n: number) => n + 1);
    expect(t.performCount).toBe(0);

    await t.perform(1);
    expect(t.performCount).toBe(1);

    await t.perform(2);
    expect(t.performCount).toBe(2);
  });

  test('last* references track instances', async () => {
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

  test('lastErrored set on error', async () => {
    const t = task(async () => {
      throw new Error('fail');
    });

    const instance = t.perform();
    await expectRejects(instance);
    expect(t.lastErrored).toBe(instance);
  });

  test('lastCanceled set on cancel', async () => {
    const t = task(async () => {
      await timeout(200);
      return 'x';
    });

    const instance = t.perform();
    instance.cancel();
    await expectRejects(instance);
    expect(t.lastCanceled).toBe(instance);
  });

  test('lastRunning tracks the running instance', async () => {
    const t = task(async () => {
      await timeout(50);
      return 'ok';
    });

    expect(t.lastRunning).toBeNull();
    const instance = t.perform();
    expect(t.lastRunning).toBe(instance);
    await instance;
    expect(t.lastRunning).toBe(instance);
  });

  test('lastComplete tracks completed and errored instances', async () => {
    const t = task(async (n: number) => {
      await timeout(10);
      if (n === 0) throw new Error('fail');
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

  test('lastIncomplete tracks the running instance', async () => {
    const t = task(async () => {
      await timeout(50);
      return 'ok';
    });

    expect(t.lastIncomplete).toBeNull();
    const instance = t.perform();
    expect(t.lastIncomplete).toBe(instance);
    await instance;
    expect(t.lastIncomplete).toBe(instance);
  });

  test('isQueued and queued state', async () => {
    const t = task(async () => {
      await timeout(50);
    }).enqueue();

    expect(t.isQueued).toBe(false);
    expect(t.state).toBe('idle');

    const a = t.perform();
    expect(t.isQueued).toBe(false);
    expect(t.state).toBe('running');

    const b = t.perform();
    expect(t.isQueued).toBe(true);
    expect(t.state).toBe('running');

    await a;
    await b;
    expect(t.isQueued).toBe(false);
    expect(t.state).toBe('idle');
  });
});

describe('restartable modifier', () => {
  test('cancels previous task when new one starts', async () => {
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

  test('only one task runs at a time', async () => {
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

describe('drop modifier', () => {
  test('drops new perform while task is running', async () => {
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

  test('allows new perform after completion', async () => {
    let count = 0;
    const t = task(async () => {
      count++;
    }).drop();

    await t.perform();
    await t.perform();
    expect(count).toBe(2);
  });
});

describe('enqueue modifier', () => {
  test('runs tasks sequentially, one at a time', async () => {
    const order: string[] = [];
    const t = task(async (id: string) => {
      order.push(`start-${id}`);
      await timeout(30);
      order.push(`end-${id}`);
      return id;
    }).enqueue();

    await Promise.all([t.perform('a'), t.perform('b'), t.perform('c')]);
    expect(order).toEqual(['start-a', 'end-a', 'start-b', 'end-b', 'start-c', 'end-c']);
  });

  test('preserves return order', async () => {
    const t = task(async (x: number) => {
      await timeout(30);
      return x;
    }).enqueue();

    const results = await Promise.all([t.perform(1), t.perform(2)]);
    expect(results).toEqual([1, 2]);
  });
});

describe('keepLatest modifier', () => {
  test('drops all but the most recent queued perform', async () => {
    let count = 0;
    const t = task(async (v: string) => {
      count++;
      await timeout(50);
      return v;
    }).keepLatest();

    const a = t.perform('a');
    await timeout(5);
    const b = t.perform('b');
    await timeout(5);
    const c = t.perform('c');
    await timeout(200);

    expect(a.isSuccessful || a.isCanceled).toBe(true);
    expect(b.isCanceled).toBe(true);
    expect(c.isSuccessful).toBe(true);
  });
});

describe('cancelAll', () => {
  test('cancels all running instances', async () => {
    const t = task(async () => {
      await timeout(200);
      return 'x';
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

  test('cancels all running and queued instances', async () => {
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

  test('perform after cancelAll starts fresh', async () => {
    const t = task(async () => {
      return 'ok';
    });

    t.perform();
    t.cancelAll();
    await new Promise((r) => setTimeout(r, 0));
    const instance = t.perform();
    const result = await instance;
    expect(result).toBe('ok');
  });
});

describe('Task PromiseLike', () => {
  test('then() resolves with last performed value', async () => {
    const t = task(async () => 42);
    t.perform();
    const result = await t;
    expect(result).toBe(42);
  });

  test('then() rejects when task was never performed', async () => {
    const t = task(async () => 42);
    await expectRejects(t.then(), 'Task has never been performed');
  });

  test('catch() works on Task', async () => {
    let err: unknown = undefined;
    const t = task(async () => {
      throw new Error('task-error');
    });
    t.perform();
    await t.catch((e) => { err = e; });
    expect((err as Error).message).toBe('task-error');
  });
});

describe('onState callback', () => {
  test('receives state updates', async () => {
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

  test('immediately fires with current state on registration', async () => {
    let state: any = null;
    const t = task(async () => 1).onState((s) => {
      state = s;
    });

    expect(state).not.toBe(null);
    expect(state.isIdle).toBe(true);
  });

  test('can be disabled by passing null', async () => {
    let callCount = 0;
    const t = task(async () => 1).onState(() => {
      callCount++;
    });
    t.onState(null);

    await t.perform();
    expect(callCount).toBe(1);
  });
});

describe('Task with options', () => {
  test('accepts options in constructor', async () => {
    const t = task(async () => {
      await timeout(50);
      return 1;
    }).restartable();
    expect(t.isIdle).toBe(true);

    const first = t.perform();
    await timeout(10);
    const second = t.perform();
    expect(first.isCanceled).toBe(true);
    expect(second.isRunning).toBe(true);
  });
});

describe('timeout helper', () => {
  test('resolves after specified time', async () => {
    const start = Date.now();
    await timeout(30);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(20);
  });

  test('gets canceled when task is canceled', async () => {
    const t = task(async () => {
      await timeout(200);
      return 'late';
    });

    const instance = t.perform();
    t.cancelAll();
    await expectRejects(instance, TaskCancelation);
  });

  test('rejects immediately when signal is already aborted', async () => {
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

describe('all helper', () => {
  test('resolves with all values', async () => {
    const t = task(async () => {
      const [a, b, c] = await all([Promise.resolve(1), Promise.resolve(2), Promise.resolve(3)]);
      return a + b + c;
    });

    const result = await t.perform();
    expect(result).toBe(6);
  });

  test('rejects when any promise rejects', async () => {
    const t = task(async () => {
      await all([Promise.resolve(1), Promise.reject(new Error('nope')), Promise.resolve(3)]);
      return 'ok';
    });

    await expectRejects(t.perform(), 'nope');
  });

  test('rejects immediately when signal is already aborted', async () => {
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

  test('works outside a task context', async () => {
    const result = await all([Promise.resolve(1), Promise.resolve(2)]);
    expect(result).toEqual([1, 2]);
  });
});

describe('race helper', () => {
  test('resolves with first settled value', async () => {
    const t = task(async () => {
      const result = await race([
        timeout(50).then(() => 'slow'),
        Promise.resolve('fast'),
      ]);
      return result;
    });

    const result = await t.perform();
    expect(result).toBe('fast');
  });

  test('rejects when the first settled promise rejects', async () => {
    const t = task(async () => {
      await race([
        Promise.reject(new Error('first-reject')),
        timeout(50).then(() => 'slow'),
      ]);
    });

    await expectRejects(t.perform(), 'first-reject');
  });

  test('rejects immediately when signal is already aborted', async () => {
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

  test('works outside a task context', async () => {
    const result = await race([Promise.resolve(1), Promise.resolve(2)]);
    expect(result).toBe(1);
  });
});

describe('maxConcurrency', () => {
  test('limits concurrent executions', async () => {
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

describe('Chaining modifier methods', () => {
  test('maxConcurrency(3) works via chaining', async () => {
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
