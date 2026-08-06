export function createWriteQueue() {
  let queue = Promise.resolve();

  return function enqueue(task) {
    const next = queue.then(task, task);
    queue = next.catch(() => {});
    return next;
  };
}
