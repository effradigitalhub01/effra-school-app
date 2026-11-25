// Pure business rules: no React, no Supabase. Easy to unit test.
/** Row ids can be numbers (serial) or strings (uuid); the logic only ever compares them. */
export type Id = string | number;

export type ClassItem = {
  ClassID: Id;
  ClassName: string;
  TermFee?: number;
  Term1Fee?: number;
  Term2Fee?: number;
  Term3Fee?: number;
};
export type Term = 1 | 2 | 3;

export const DEFAULT_TERM_FEE = 25000;
export const LAST_GRADE = 12; // make this a per-school setting if a school ends at Grade 6 or 9

export function calculateGrade(score: number) {
  if (!Number.isFinite(score)) return { grade: '-', remark: 'Ungraded' };
  const s = Math.max(0, Math.min(100, score));
  if (s >= 80) return { grade: 'A', remark: 'Exceeding Expectations (EE)' };
  if (s >= 65) return { grade: 'B', remark: 'Meeting Expectations (ME)' };
  if (s >= 50) return { grade: 'C', remark: 'Approaching Expectations (AE)' };
  if (s >= 40) return { grade: 'D', remark: 'Below Expectations (BE)' };
  return { grade: 'E', remark: 'Below Expectations (BE)' };
}

/** Fee for a class in a term: Term{n}Fee, then TermFee, then the school default. */
export function feeFor(cls: ClassItem | undefined, term: Term): number {
  if (!cls) return DEFAULT_TERM_FEE;
  const perTerm = ({ 1: cls.Term1Fee, 2: cls.Term2Fee, 3: cls.Term3Fee } as const)[term];
  return perTerm ?? cls.TermFee ?? DEFAULT_TERM_FEE;
}

/**
 * IMPORTANT: paidThisTerm must be payments for the CURRENT term only.
 * carriedForward is a signed snapshot saved at promotion time (positive = arrears, negative = credit).
 * Passing lifetime payments here would double-count earlier terms.
 */
export function feeStatus(paidThisTerm: number, termFee = DEFAULT_TERM_FEE, carriedForward = 0) {
  const totalBilled = termFee + carriedForward;
  const net = totalBilled - paidThisTerm;
  if (net < 0) return { kind: 'credit' as const, amount: -net, totalBilled };
  if (net === 0) return { kind: 'cleared' as const, amount: 0, totalBilled };
  return { kind: 'owing' as const, amount: net, totalBilled };
}

const PRE_PRIMARY = ['playgroup', 'pp1', 'pp2'];

/** Returns the next ClassID, 'GRADUATE' after the last grade, or null if it cannot be resolved. */
export function nextClass(current: ClassItem, all: ClassItem[]): Id | 'GRADUATE' | null {
  const byName = (n: string) => all.find(c => c.ClassName.trim().toLowerCase() === n.toLowerCase())?.ClassID ?? null;
  const name = current.ClassName.trim().toLowerCase();

  const i = PRE_PRIMARY.indexOf(name);
  if (i >= 0) return i < PRE_PRIMARY.length - 1 ? byName(PRE_PRIMARY[i + 1]) : byName('Grade 1-A');

  const m = name.match(/^grade\s+(\d+)(?:-([a-z]))?$/);
  if (!m) return null;

  const next = Number(m[1]) + 1;
  if (next > LAST_GRADE) return 'GRADUATE';

  const sameStream = byName(`Grade ${next}-${(m[2] ?? 'a').toUpperCase()}`);
  if (sameStream !== null) return sameStream;
  // Stream missing at the next level: fall back to the first stream there, and let the preview show it.
  const level = new RegExp(`^grade\\s+${next}(?:-[a-z])?$`, 'i');
  return all.find(c => level.test(c.ClassName.trim()))?.ClassID ?? null;
}

/** True when the student's stream letter (A, B...) changes or is lost in the move. */
export function streamFellBack(cur: ClassItem, targetId: Id, all: ClassItem[]) {
  const t = all.find(c => c.ClassID === targetId);
  const a = cur.ClassName.trim().toLowerCase().match(/-([a-z])$/);
  const b = t?.ClassName.trim().toLowerCase().match(/-([a-z])$/);
  return !!a && (!b || a[1] !== b[1]);
}

type StudentIn = {
  StudentID: Id; ClassID: Id | null; FirstName: string; LastName: string;
  paidThisTerm?: number; carriedForward?: number; isGraduated?: boolean;
};

/**
 * Preview of a batch promotion.
 *  moves:        target ClassID (or 'GRADUATE') -> student IDs, so the DB needs one update per target.
 *  carryForward: StudentID -> signed balance to store on the student (positive arrears, negative credit).
 *  unresolved:   students we could not place; show these before the admin confirms.
 *  streamChanged: students whose stream letter changes (e.g. 1-B into 2-A); show these too.
 * Callers must save carryForward AND reset the term's payment window in the same transaction.
 */
export function previewPromotion(
  students: StudentIn[],
  classes: ClassItem[],
  currentTerm: Term,
  currentYear: number,
  nextTerm: Term,
  nextYear: number
) {
  const classById = new Map(classes.map(c => [String(c.ClassID), c]));
  const moves = new Map<Id | 'GRADUATE', Id[]>();
  const carryForward: Record<string, number> = {};
  const unresolved: StudentIn[] = [];
  const streamChanged: { student: StudentIn; from: string; to: string }[] = [];

  for (const s of students) {
    if (s.isGraduated || s.ClassID === null) continue;
    const cur = classById.get(String(s.ClassID));
    if (!cur) {
      unresolved.push(s);
      continue;
    }

    const termFee = feeFor(cur, currentTerm);
    const paid = s.paidThisTerm ?? 0;
    const cf = s.carriedForward ?? 0;
    const status = feeStatus(paid, termFee, cf);
    const nextCarry =
      status.kind === 'owing' ? status.amount : status.kind === 'credit' ? -status.amount : 0;
    carryForward[String(s.StudentID)] = nextCarry;

    const target = nextClass(cur, classes);
    if (target === null) {
      unresolved.push(s);
      continue;
    }

    const bucket = moves.get(target) ?? [];
    bucket.push(s.StudentID);
    moves.set(target, bucket);

    if (target !== 'GRADUATE' && streamFellBack(cur, target, classes)) {
      const destName = classById.get(String(target))?.ClassName ?? String(target);
      streamChanged.push({ student: s, from: cur.ClassName, to: destName });
    }
  }

  return {
    currentTerm,
    currentYear,
    nextTerm,
    nextYear,
    moves,
    carryForward,
    unresolved,
    streamChanged,
  };
}
