import { useEffect, useState } from "react";
import { api } from "../api";
import { todayISODate } from "../date";
import { periodForDate } from "../../worker/payslip";

export interface ActiveCycle {
  /** The cycle a payroll screen should open on. */
  period: string;
  /** What the calendar alone would pick — where `period` lands once dues are settled. */
  calendarPeriod: string;
  /** True when `period` is an earlier cycle held open because someone is still unpaid. */
  held: boolean;
  /** How many of `total` people in the held cycle aren't marked paid yet. */
  unpaid: number;
  total: number;
}

/**
 * Which pay cycle the payroll screens should open on, resolved once on mount.
 *
 * Cycles are paid on the 11th, so the calendar rolls to the next period that
 * morning. On its own that meant the screens jumped to a fresh, zeroed cycle
 * the moment the last one came due — pay and reimbursement notes both — with
 * the cycle everyone had actually been working on left behind the month picker.
 * The server (GET /admin/payroll/active-period) now holds the roll-over back
 * while anyone in a due cycle is still unpaid; this is the client half of that.
 *
 * Deliberately a one-shot read, not a live subscription: it seeds the period
 * and then gets out of the way. Re-resolving would yank the month out from
 * under someone who had moved somewhere else on purpose — including at the
 * exact moment they mark the held cycle paid, when they are still looking at it.
 */
export function useActiveCycle(): ActiveCycle | null {
  const [active, setActive] = useState<ActiveCycle | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<ActiveCycle>("/admin/payroll/active-period", { force: true })
      .catch((): ActiveCycle => {
        // The screen still has to open on something. Falling back to the
        // calendar's own answer is the old behaviour — worse, but never blank.
        const period = periodForDate(todayISODate());
        return { period, calendarPeriod: period, held: false, unpaid: 0, total: 0 };
      })
      .then((cycle) => {
        if (!cancelled) setActive(cycle);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return active;
}
