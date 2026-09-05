import { AUTO_TX_INTERVAL_MS } from './types';

/**
 * Owns the periodic tick that advances credit/deposit schedules.
 *
 * Extracted from AccountView so the view coordinates rendering only. The
 * scheduler never runs the transactions itself — it calls back into the view,
 * which keeps data ownership in one place.
 */
export class AutoTxScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly onTick: () => void;

  constructor(onTick: () => void) {
    this.onTick = onTick;
  }

  /** (Re)starts the interval. Safe to call repeatedly — never stacks timers. */
  start(): void {
    this.stop();
    this.timer = setInterval(() => { this.onTick(); }, AUTO_TX_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
