import { runSchedulerTick } from './gameService.js';

let schedulerHandle: NodeJS.Timeout | null = null;
let tickInFlight = false;

export function startGameScheduler(intervalMs = 1000): void {
  if (schedulerHandle) {
    return;
  }

  const runTick = async () => {
    if (tickInFlight) {
      return;
    }

    tickInFlight = true;

    try {
      await runSchedulerTick();
    } catch (error) {
      console.error('Game scheduler tick failed.', error);
    } finally {
      tickInFlight = false;
    }
  };

  void runTick();
  schedulerHandle = setInterval(() => {
    void runTick();
  }, intervalMs);
}

export function stopGameScheduler(): void {
  if (!schedulerHandle) {
    return;
  }

  clearInterval(schedulerHandle);
  schedulerHandle = null;
}
