import { ViewContext } from '../context';
import { Translations } from '../i18n';

/**
 * Base class for analytics views (Records, Credits, Deposits).
 * Provides common patterns: context access, formatting helpers, empty container setup.
 */
export abstract class BaseAnalyticsView {
  protected el: HTMLElement;
  protected ctx: ViewContext;
  protected tr: Translations;
  protected isMobile: boolean;
  protected locale: string;

  constructor(el: HTMLElement, ctx: ViewContext) {
    this.el = el;
    this.ctx = ctx;
    this.tr = ctx.tr;
    this.isMobile = ctx.isMobile;
    this.locale = ctx.locale;
  }

  /**
   * Shorthand for ctx.fmt() - formats amount with currency.
   */
  protected fmt(n: number): string {
    return this.ctx.fmt(n);
  }

  /**
   * Access to view state (for date filters, groupBy, etc.)
   */
  protected get state() {
    return this.ctx.state;
  }

  /**
   * Main render method - must be implemented by subclasses.
   */
  abstract render(): void;

  /**
   * Sets up the analytics container with standard class.
   */
  protected setupContainer(): void {
    this.el.empty();
    this.el.addClass('finance-analytics');
  }
}
