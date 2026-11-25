import type { DebtMovement, DebtRecord, FinanceRecord } from '../types';
import { DebtDirection, DebtMovementType, RecordType } from '../constants';
import {
  calcAutoRepaymentInterest,
  calculateDebtPrincipalAmount,
  getDebtMovementInterest,
  sortDebtMovementsChronologically,
} from './debtCalculations';
import { buildDebtInterestNote } from './linkedRecords';
import { round2 } from './money';

export interface DebtRecordLabels {
  debtDefaultCat: string;
  debtRepayNote: string;
  debtInterestNote: string;
  debtInterestCategory: string;
}

export interface ReconcileDebtOptions {
  /** Keep legacy positive interestAmount values as manual overrides during migration. */
  preservePositiveInterest?: boolean;
}

export interface ReconcileDebtDeps {
  newId: () => string;
  now?: number;
}

export interface ReconcileSingleDebtResult {
  debt: DebtRecord;
  records: FinanceRecord[];
  debtChanged: boolean;
  recordsChanged: boolean;
}

export interface ReconcileAllDebtsResult {
  debts: DebtRecord[];
  records: FinanceRecord[];
  changed: { debts: boolean; records: boolean };
}

function stripInterestSuffix(note: string, suffix: string): string {
  const trimmed = note.trim();
  const marker = ` — ${suffix.trim()}`;
  if (suffix.trim() && trimmed.endsWith(marker)) {
    return trimmed.slice(0, trimmed.length - marker.length).trim();
  }
  return trimmed;
}

function matchesTargetRecords(
  matched: FinanceRecord[],
  expectedType: RecordType,
  movementDate: string,
  principalPart: number,
  interestPart: number,
  principalMovementId?: string,
  interestMovementId?: string
): boolean {
  const needsPrincipal = principalPart > 0;
  const needsInterest = interestPart > 0;

  if (needsPrincipal && needsInterest) {
    if (matched.length !== 2) return false;
    const hasPrincipal = matched.some(r =>
      r.isInternal === true &&
      r.type === expectedType &&
      r.amount === principalPart &&
      r.date === movementDate &&
      (principalMovementId === undefined || r.linkedMovementId === principalMovementId)
    );
    const hasInterest = matched.some(r =>
      r.isInternal === false &&
      r.type === expectedType &&
      r.amount === interestPart &&
      r.date === movementDate &&
      (interestMovementId === undefined || r.linkedMovementId === interestMovementId)
    );
    return hasPrincipal && hasInterest;
  }

  if (needsPrincipal) {
    return (
      matched.length === 1 &&
      matched[0]!.isInternal === true &&
      matched[0]!.type === expectedType &&
      matched[0]!.amount === principalPart &&
      matched[0]!.date === movementDate &&
      (principalMovementId === undefined || matched[0]!.linkedMovementId === principalMovementId)
    );
  }

  if (needsInterest) {
    return (
      matched.length === 1 &&
      matched[0]!.isInternal === false &&
      matched[0]!.type === expectedType &&
      matched[0]!.amount === interestPart &&
      matched[0]!.date === movementDate &&
      (interestMovementId === undefined || matched[0]!.linkedMovementId === interestMovementId)
    );
  }

  return matched.length === 0;
}

function buildReplacementRecords(
  debt: DebtRecord,
  movement: DebtMovement,
  matched: FinanceRecord[],
  principalPart: number,
  interestPart: number,
  principalMovementId: string | undefined,
  interestMovementId: string | undefined,
  labels: DebtRecordLabels,
  deps: ReconcileDebtDeps
): FinanceRecord[] {
  const expectedType = debt.direction === DebtDirection.LENT ? RecordType.INCOME : RecordType.EXPENSE;
  const existingPrincipal = matched.find(r => r.isInternal);
  const existingInterest = matched.find(r => !r.isInternal && r.id !== existingPrincipal?.id)
    ?? matched.find(r => !r.isInternal);
  const template = existingPrincipal ?? matched[0]!;
  const defaultRepayNote = !debt.person.trim() || labels.debtRepayNote.includes(debt.person.trim())
    ? labels.debtRepayNote
    : `${labels.debtRepayNote}: ${debt.person}`;

  const templateNote = template.isInternal
    ? template.note
    : stripInterestSuffix(template.note, labels.debtInterestNote);
  const principalNote = template.isInternal
    ? templateNote
    : (templateNote ? templateNote : defaultRepayNote);

  const hasDedicatedInterestNote = Boolean(
    existingInterest?.category === labels.debtInterestCategory &&
    existingInterest.note.trim()
  );
  const interestNote = hasDedicatedInterestNote
    ? existingInterest!.note
    : buildDebtInterestNote(principalNote, defaultRepayNote, labels.debtInterestNote);

  const time = movement.time ? movement.time : template.time;
  const payer = debt.person ? debt.person : template.payer;
  const result: FinanceRecord[] = [];

  if (principalPart > 0 && principalMovementId) {
    const principalCategory = template.isInternal && template.category
      ? template.category
      : labels.debtDefaultCat;
    result.push({
      id: existingPrincipal?.id ?? template.id,
      createdAt: template.createdAt,
      date: movement.date,
      time,
      type: expectedType,
      amount: principalPart,
      category: principalCategory,
      tag: template.tag,
      payer,
      note: principalNote,
      attachmentPath: template.attachmentPath,
      isInternal: true,
      linkedId: debt.id,
      linkedMovementId: principalMovementId,
    });
  }

  if (interestPart > 0 && interestMovementId) {
    const principalId = result[0]?.id;
    const canReuseInterestId = existingInterest && existingInterest.id !== principalId;
    const interestId = canReuseInterestId
      ? existingInterest.id
      : (principalPart === 0 ? template.id : deps.newId());
    const interestCategory = existingInterest?.category === labels.debtInterestCategory
      ? existingInterest.category
      : labels.debtInterestCategory;

    result.push({
      id: interestId,
      createdAt: existingInterest?.createdAt ?? template.createdAt ?? deps.now ?? Date.now(),
      date: movement.date,
      time,
      type: expectedType,
      amount: interestPart,
      category: interestCategory,
      tag: principalPart === 0 ? template.tag : '',
      payer,
      note: interestNote,
      attachmentPath: principalPart === 0 ? template.attachmentPath : '',
      isInternal: false,
      linkedId: debt.id,
      linkedMovementId: interestMovementId,
    });
  }

  return result;
}

function replaceMatchedRecords(
  records: FinanceRecord[],
  matchedIds: Set<string>,
  replacements: FinanceRecord[]
): FinanceRecord[] {
  const firstIndex = records.findIndex(r => matchedIds.has(r.id));
  const out: FinanceRecord[] = [];
  let inserted = false;

  for (let i = 0; i < records.length; i++) {
    const rec = records[i]!;
    if (!matchedIds.has(rec.id)) {
      out.push(rec);
      continue;
    }
    if (!inserted && i === firstIndex) {
      out.push(...replacements);
      inserted = true;
    }
  }

  return out;
}

/**
 * Reconciles a single debt's repayments (principal-first split), debt.amount, and
 * existing linked FinanceRecords without inventing records for movements whose
 * mirror was manually deleted.
 */
export function reconcileSingleDebt(
  debt: DebtRecord,
  records: FinanceRecord[],
  labels: DebtRecordLabels,
  deps: ReconcileDebtDeps,
  opts: ReconcileDebtOptions = {}
): ReconcileSingleDebtResult {
  if (debt.movements.length === 0) {
    return { debt, records, debtChanged: false, recordsChanged: false };
  }

  const ordered = sortDebtMovementsChronologically(debt.movements);
  const hasBorrow = ordered.some(m => m.type === DebtMovementType.BORROW);
  let remainingPrincipal = hasBorrow ? 0 : Math.max(0, round2(debt.originalAmount));

  const claimedRecordIds = new Set<string>();
  for (const r of records) {
    if (r.linkedId === debt.id && r.linkedMovementId) {
      claimedRecordIds.add(r.id);
    }
  }

  const expectedRepayType = debt.direction === DebtDirection.LENT ? RecordType.INCOME : RecordType.EXPENSE;
  const replacementMovementsById = new Map<string, DebtMovement[]>();
  let nextRecords = records;
  let debtChanged = false;
  let recordsChanged = false;

  const findMatchedForMovement = (mov: DebtMovement): FinanceRecord[] => {
    const direct = nextRecords.filter(
      r => r.linkedId === debt.id && r.linkedMovementId === mov.id
    );
    if (direct.length > 0) return direct;
    const legacy = nextRecords.find(r =>
      r.linkedId === debt.id &&
      !r.linkedMovementId &&
      !claimedRecordIds.has(r.id) &&
      r.type === expectedRepayType &&
      r.date === mov.date &&
      r.amount === mov.amount
    );
    if (legacy) {
      claimedRecordIds.add(legacy.id);
      return [legacy];
    }
    return [];
  };

  for (const movement of ordered) {
    if (movement.type === DebtMovementType.BORROW) {
      remainingPrincipal = round2(remainingPrincipal + Math.max(0, movement.amount));
      replacementMovementsById.set(movement.id, [movement]);
      continue;
    }

    if (movement.type === DebtMovementType.INTEREST) {
      const interestPart = round2(Math.max(0, movement.amount));
      let cleanMovement = movement;
      if (movement.interestAmount !== undefined || movement.manualInterest !== undefined) {
        cleanMovement = {
          id: movement.id,
          type: DebtMovementType.INTEREST,
          amount: interestPart,
          date: movement.date,
          time: movement.time,
          createdAt: movement.createdAt,
          note: movement.note,
        };
        debtChanged = true;
      }
      replacementMovementsById.set(movement.id, [cleanMovement]);

      const matched = findMatchedForMovement(movement);
      if (
        matched.length > 0 &&
        !matchesTargetRecords(matched, expectedRepayType, movement.date, 0, interestPart, undefined, movement.id)
      ) {
        const replacements = buildReplacementRecords(
          debt,
          cleanMovement,
          matched,
          0,
          interestPart,
          undefined,
          movement.id,
          labels,
          deps
        );
        nextRecords = replaceMatchedRecords(nextRecords, new Set(matched.map(r => r.id)), replacements);
        recordsChanged = true;
      }
      continue;
    }

    const autoInterest = calcAutoRepaymentInterest(movement.amount, remainingPrincipal);
    const currentInterest = getDebtMovementInterest(movement);
    let targetInterest: number;
    let preserveManual = false;

    if (movement.manualInterest === true) {
      targetInterest = currentInterest;
      preserveManual = true;
    } else if (opts.preservePositiveInterest && currentInterest > 0 && currentInterest !== autoInterest) {
      targetInterest = currentInterest;
      preserveManual = true;
    } else {
      targetInterest = autoInterest;
    }

    const roundedAmount = round2(Math.max(0, movement.amount));
    const principalPart = round2(Math.max(0, roundedAmount - targetInterest));
    remainingPrincipal = Math.max(0, round2(remainingPrincipal - principalPart));

    let principalMovId: string | undefined;
    let interestMovId: string | undefined;
    let primaryMovement = movement;

    if (targetInterest > 0 && principalPart > 0) {
      const principalMov: DebtMovement = {
        id: movement.id,
        type: DebtMovementType.REPAY,
        amount: principalPart,
        date: movement.date,
        time: movement.time,
        createdAt: movement.createdAt,
        note: movement.note,
      };
      const interestMov: DebtMovement = {
        id: deps.newId(),
        type: DebtMovementType.INTEREST,
        amount: targetInterest,
        date: movement.date,
        time: movement.time,
        createdAt: movement.createdAt + 1,
        note: movement.note,
      };
      principalMovId = principalMov.id;
      interestMovId = interestMov.id;
      primaryMovement = principalMov;
      replacementMovementsById.set(movement.id, [principalMov, interestMov]);
      debtChanged = true;
    } else if (targetInterest > 0) {
      const convertedInterest: DebtMovement = {
        id: movement.id,
        type: DebtMovementType.INTEREST,
        amount: targetInterest,
        date: movement.date,
        time: movement.time,
        createdAt: movement.createdAt,
        note: movement.note,
      };
      interestMovId = convertedInterest.id;
      primaryMovement = convertedInterest;
      replacementMovementsById.set(movement.id, [convertedInterest]);
      debtChanged = true;
    } else {
      const keepManual = preserveManual && autoInterest > 0;
      const hasStaleInterestField = movement.interestAmount !== undefined;
      const manualChanged = keepManual !== Boolean(movement.manualInterest);
      if (hasStaleInterestField || manualChanged) {
        primaryMovement = {
          id: movement.id,
          type: DebtMovementType.REPAY,
          amount: movement.amount,
          date: movement.date,
          time: movement.time,
          createdAt: movement.createdAt,
          note: movement.note,
          ...(keepManual ? { manualInterest: true } : {}),
        };
        debtChanged = true;
      }
      principalMovId = primaryMovement.id;
      replacementMovementsById.set(movement.id, [primaryMovement]);
    }

    const matched = findMatchedForMovement(movement);
    if (
      matched.length > 0 &&
      !matchesTargetRecords(
        matched,
        expectedRepayType,
        movement.date,
        principalPart,
        targetInterest,
        principalMovId,
        interestMovId
      )
    ) {
      const replacements = buildReplacementRecords(
        debt,
        primaryMovement,
        matched,
        principalPart,
        targetInterest,
        principalMovId,
        interestMovId,
        labels,
        deps
      );
      nextRecords = replaceMatchedRecords(nextRecords, new Set(matched.map(r => r.id)), replacements);
      recordsChanged = true;
    }
  }

  const nextMovements = debt.movements.flatMap(m => replacementMovementsById.get(m.id) ?? [m]);
  const draftDebt: DebtRecord = debtChanged ? { ...debt, movements: nextMovements } : debt;
  const nextAmount = calculateDebtPrincipalAmount(draftDebt);

  if (nextAmount !== debt.amount) {
    debtChanged = true;
  }

  const finalDebt: DebtRecord = debtChanged
    ? { ...draftDebt, amount: nextAmount }
    : debt;

  return {
    debt: finalDebt,
    records: nextRecords,
    debtChanged,
    recordsChanged,
  };
}

/**
 * Reconciles all debts and linked records in an account (used for startup migration
 * and post-load consistency). Idempotent across repeated calls.
 */
export function reconcileAllDebts(
  debts: DebtRecord[],
  records: FinanceRecord[],
  labels: DebtRecordLabels,
  deps: ReconcileDebtDeps
): ReconcileAllDebtsResult {
  let nextRecords = records;
  let debtsChanged = false;
  let recordsChanged = false;

  const nextDebts = debts.map(debt => {
    const res = reconcileSingleDebt(debt, nextRecords, labels, deps, {
      preservePositiveInterest: true,
    });
    if (res.debtChanged) debtsChanged = true;
    if (res.recordsChanged) {
      recordsChanged = true;
      nextRecords = res.records;
    }
    return res.debt;
  });

  return {
    debts: debtsChanged ? nextDebts : debts,
    records: recordsChanged ? nextRecords : records,
    changed: { debts: debtsChanged, records: recordsChanged },
  };
}
