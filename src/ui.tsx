import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ClassItem, Term, feeFor, feeStatus } from './logic';
import { PiUser, authenticateWithPi } from './pi';
import Finance from './screens/Finance';
import Grades, { ResultRow } from './screens/Grades';
import Students, { StudentRow } from './screens/Students';
import { supabase } from './supabase';
import { color, money, radius, space, type } from './theme';
import { Badge, Button, Card, Chip, EmptyState, Field, Sheet, ToastProvider, useToast } from './ui';
import { useTable } from './useTable';

type Id = string | number;
type Row = Record<string, any>;
type Vehicle = { vehicleid: number; registrationno: string; drivername: string; driverphone: string; routename: string; capacity: number; termfee: number };

const NAMES = [
  'Playgroup', 'PP1', 'PP2',
  'Grade 1-A', 'Grade 1-B',
  'Grade 2-A', 'Grade 2-B',
  'Grade 3-A', 'Grade 3-B',
  'Grade 4-A', 'Grade 4-B',
  'Grade 5-A', 'Grade 5-B',
  'Grade 6-A', 'Grade 6-B',
  'Grade 7-A', 'Grade 7-B',
  'Grade 8-A', 'Grade 8-B',
  'Grade 9-A', 'Grade 9-B',
  'Grade 10-A', 'Grade 10-B',
  'Grade 11-A', 'Grade 11-B',
  'Grade 12-A', 'Grade 12-B',
];

const DEFAULT_CLASSES: ClassItem[] = NAMES.map((n, i) => ({
  ClassID: i + 1,
  ClassName: n,
  TermFee: 0,
  Term1Fee: 0,
  Term2Fee: 0,
  Term3Fee: 0,
}));

const ALL_TABS = ['Overview', 'Students', 'Attendance', 'Finance', 'Grades', 'Guardians', 'Teachers', 'Non-Teaching Staff', 'Exam Timetable', 'Notifications', 'Transport'];
const HIDDEN: Record<string, string[]> = {
  'Class Teacher': ['Finance', 'Teachers', 'Non-Teaching Staff', 'Notifications', 'Transport'],
  Bursar: ['Attendance', 'Grades', 'Teachers', 'Exam Timetable'],
};
const SUBJECTS = ['Mathematics', 'English', 'Kiswahili', 'Science', 'Social Studies', 'CBC Agriculture'];
const DEPARTMENTS = ['Administration', 'Finance & Accounts', 'Operations & Security', 'ICT & Tech Support', 'Transport & Facilities'];
const JOB_TITLES = ['Administrative Assistant', 'Head Teacher', 'Bursar / Accountant', 'Chief Security Officer', 'Librarian', 'Transport Coordinator'];
const SPECS = ['Mathematics & Science', 'Languages (English & Kiswahili)', 'Humanities & Social Studies', 'Creative Arts & Sports', 'CBC Agriculture & Tech'];
const RELATIONSHIPS = ['Parent', 'Mother', 'Father', 'Guardian', 'Sponsor'];

const TOP_INSET = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 28) + 8 : Platform.OS === 'ios' ? 48 : space.md;

let cachedTenantFields: Record<string, any> | null = null;
const droppedTableCols: Record<string, Set<string>> = {};

const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const toDbId = (id: Id): number | string => (/^\d+$/.test(String(id)) ? Number(id) : String(id));

function resetTenantCache() {
  cachedTenantFields = null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function getUserRole(email: string) {
  const { data, error } = await supabase
    .from('userroles')
    .select('*')
    .ilike('email', email)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function extractMissingCol(message: string | undefined, table: string): string | null {
  if (!message) return null;
  const pgrst = message.match(/Could not find the '([^']+)' column/i);
  if (pgrst) return pgrst[1];
  const pg = message.match(new RegExp(`column "([^"]+)" of relation "${table}" does not exist`, 'i'));
  if (pg) return pg[1];
  return null;
}

async function getTenantFields(): Promise<Record<string, any>> {
  if (cachedTenantFields) return cachedTenantFields;
  let out: Record<string, any> = {};
  try {
    const { data: auth } = await supabase.auth.getUser();
    const email = auth?.user?.email?.toLowerCase();
    if (email) {
      const { data: roleRow } = await supabase.from('userroles').select('*').ilike('email', email).maybeSingle();
      if (roleRow?.schoolid != null) out = { schoolid: roleRow.schoolid };
      else if (roleRow?.school_id != null) out = { school_id: roleRow.school_id };
    }
  } catch {
    // Optional tenant column
  }
  if (Object.keys(out).length) cachedTenantFields = out;
  return out;
}

async function insertDbRow(table: string, basePayload: Record<string, any>): Promise<{ data: Row | null; error: string | null }> {
  const tenant = await getTenantFields();
  const candidate: Record<string, any> = { ...basePayload, ...tenant };
  const dropped = droppedTableCols[table] ?? new Set<string>();
  droppedTableCols[table] = dropped;
  for (const col of dropped) delete candidate[col];

  for (let attempt = 0; attempt < 6; attempt++) {
    const { data, error } = await supabase.from(table).insert([candidate]).select().maybeSingle();
    if (!error) {
      if (!data) return { data: null, error: `Database blocked saving to ${table} (check Supabase RLS policy).` };
      return { data, error: null };
    }
    if (error.code === '42703' || error.code === 'PGRST204') {
      const missing = extractMissingCol(error.message, table);
      if (missing && missing in candidate) {
        dropped.add(missing);
        delete candidate[missing];
        continue;
      }
    }
    return { data: null, error: error.message };
  }
  return { data: null, error: `Could not match ${table} columns.` };
}

const Pick = ({ items, value, onPick }: { items: string[]; value: string; onPick: (v: string) => void }) => (
  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md }}>
    {items.map(i => <Chip key={i} label={i} active={value === i} onPress={() => onPick(i)} />)}
  </View>
);
const Head = ({ title, note, action }: { title: string; note?: string; action?: React.ReactNode }) => (
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.md, gap: space.sm }}>
    <View style={{ flex: 1 }}><Text style={type.h2}>{title}</Text>{note ? <Text style={type.meta}>{note}</Text> : null}</View>{action}
  </View>
);
const Line = ({ children }: { children: React.ReactNode }) => (
  <Card style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>{children}</Card>
);

function execStats(i: {
  students: StudentRow[]; classes: ClassItem[]; term: Term;
  markOf: (id: Id) => string | undefined; results: ResultRow[];
}) {
  const classById = new Map<string, ClassItem>(i.classes.map(c => [String(c.ClassID), c]));
  const scopedIds = new Set(i.students.map(s => String(s.StudentID)));
  const scores = new Map<string, number[]>();
  const subjectTotals = new Map<string, { sum: number; count: number; pass: number }>();

  i.results.forEach(r => {
    const key = String(r.studentid);
    if (!scopedIds.has(key)) return;
    const sc = Number(r.score);
    const studentScores = scores.get(key);
    if (studentScores) studentScores.push(sc);
    else scores.set(key, [sc]);

    const subj = String((r as any).subjectname ?? (r as any).subject ?? 'General').trim() || 'General';
    const cur = subjectTotals.get(subj) ?? { sum: 0, count: 0, pass: 0 };
    cur.sum += sc;
    cur.count += 1;
    if (sc >= 50) cur.pass += 1;
    subjectTotals.set(subj, cur);
  });

  let present = 0, late = 0, absent = 0, billed = 0, collected = 0, outstanding = 0, credit = 0, sum = 0, marks = 0, atRisk = 0;
  const rows = i.students.map(s => {
    const mark = i.markOf(s.StudentID);
    if (mark === 'Present') present++; else if (mark === 'Late') late++; else if (mark) absent++;
    const st = feeStatus(s.paidThisTerm, feeFor(s.ClassID !== null ? classById.get(String(s.ClassID)) : undefined, i.term), s.carriedForward);
    billed += st.totalBilled; collected += s.paidThisTerm;
    if (st.kind === 'owing') outstanding += st.amount; else if (st.kind === 'credit') credit += st.amount;
    const sc = scores.get(String(s.StudentID)) ?? [];
    sc.forEach(x => { sum += x; marks++; });
    const avg = sc.length ? Math.round((sc.reduce((a, b) => a + b, 0) / sc.length) * 10) / 10 : null;
    if (avg !== null && avg < 50) atRisk++;
    return { s, mark, owing: st.kind === 'owing' ? st.amount : 0, avg, examsCount: sc.length };
  });

  const marked = present + late + absent;
  const followUp = [...rows].sort((a, b) => (Number(b.mark === 'Absent') - Number(a.mark === 'Absent')) || b.owing - a.owing);
  const subjectBreakdown = [...subjectTotals.entries()]
    .map(([subject, v]) => ({
      subject,
      mean: Math.round((v.sum / v.count) * 10) / 10,
      passRate: Math.round((v.pass / v.count) * 100),
      count: v.count,
    }))
    .sort((a, b) => b.mean - a.mean);

  const rankedStudents = rows
    .filter(r => r.avg !== null)
    .sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0));

  return {
    marked, present, late, absent,
    attendanceRate: marked ? Math.round(((present + late) / marked) * 100) : null,
    billed, collected, outstanding, credit,
    collectionRate: billed ? Math.min(100, Math.round((collected / billed) * 100)) : null,
    mean: marks ? Math.round((sum / marks) * 10) / 10 : null,
    marks,
    atRisk,
    followUp,
    subjectBreakdown,
    rankedStudents,
  };
}

const Meter = ({ value, tone, label }: { value: number; tone: string; label: string }) => (
  <View accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: Math.round(value) }}
    style={{ height: 6, backgroundColor: color.line, borderRadius: 999, overflow: 'hidden' }}>
    <View style={{ width: `${Math.max(0, Math.min(100, value))}%`, height: '100%', backgroundColor: tone }} />
  </View>
);
const tone = (pct: number | null, good: number, ok: number) => (pct === null ? color.inkMute : pct >= good ? color.ok : pct >= ok ? color.warn : color.danger);
const kicker = { fontWeight: '700' as const, textTransform: 'uppercase' as const, letterSpacing: 0.5 };

function MainApp() {
  const toast = useToast();

  const [loggedIn, setLoggedIn] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [authError, setAuthError] = useState('');
  const [piUser, setPiUser] = useState<PiUser | null>(null);
  const [piAuthLoading, setPiAuthLoading] = useState(false);

  const [role, setRole] = useState('');
  const [teacherClassId, setTeacherClassId] = useState<Id | null>(null);
  const [roleTeacherId, setRoleTeacherId] = useState<string | null>(null);
  const [teacherEmail, setTeacherEmail] = useState('');
  const [tab, setTab] = useState('Overview');
  const [classFilter, setClassFilter] = useState<string>('ALL');
  const [periodOverride, setPeriodOverride] = useState<{ term: Term; academicYear: number } | null>(null);
  const [savingPeriod, setSavingPeriod] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [perfSubject, setPerfSubject] = useState<string>('ALL');
  const [perfCohort, setPerfCohort] = useState<'all' | 'top' | 'risk'>('all');

  const { rows: schoolSettings, error: settingsError, loading: settingsLoading, reload: reloadSchoolSettings } = useTable<Row>('schoolsettings', '*');
  const { rows: rawClasses, error: classesError, loading: classesLoading, reload: reloadClasses } = useTable<Row>('classes', '*', 'classid');
  const { rows: rawStudents, error: studentsError, loading, reload: reloadStudents } = useTable<Row>('students', '*', 'studentid');
  const { rows: rawPayments, error: paymentsError, loading: paymentsLoading, reload: reloadPayments } = useTable<Row>('studentpayments', '*');
  const { rows: attendance, error: attendanceError, loading: attendanceLoading, reload: reloadAttendance } = useTable<Row>('studentattendance', '*');
  const { rows: results, error: resultsError, loading: resultsLoading, reload: reloadResults } = useTable<ResultRow>('results', '*');
  const { rows: parents, error: parentsError, loading: parentsLoading, reload: reloadParents } = useTable<Row>('parents', '*');
  const { rows: links, error: linksError, loading: linksLoading, reload: reloadLinks } = useTable<Row>('studentparents', '*');
  const { rows: teachers, error: teachersError, loading: teachersLoading, reload: reloadTeachers } = useTable<Row>('teachers', '*');
  const { rows: staff, error: staffError, loading: staffLoading, reload: reloadStaff } = useTable<Row>('staff', '*');
  const { rows: subjects, error: subjectsError, loading: subjectsLoading, reload: reloadSubjects } = useTable<Row>('subjects', '*');
  const { rows: assignments, error: assignmentsError, loading: assignmentsLoading, reload: reloadAssignments } = useTable<Row>('teachersubjectallocation', '*');
  const { rows: exams, error: examsError, loading: examsLoading, reload: reloadExams } = useTable<Row>('examtimetables', '*', 'examdate');
  const { rows: notifications, error: notificationsError, loading: notificationsLoading, reload: reloadNotifs } = useTable<Row>('notifications', '*', 'notificationid');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const dataLoading = [
    settingsLoading, classesLoading, loading, paymentsLoading, attendanceLoading, resultsLoading,
    parentsLoading, linksLoading, teachersLoading, staffLoading, subjectsLoading, assignmentsLoading, examsLoading,
    notificationsLoading,
  ].some(Boolean);
  const dataErrors = useMemo(() => [
    { table: 'School settings', error: settingsError },
    { table: 'Classes', error: classesError },
    { table: 'Students', error: studentsError },
    { table: 'Payments', error: paymentsError },
    { table: 'Attendance', error: attendanceError },
    { table: 'Grades', error: resultsError },
    { table: 'Guardians', error: parentsError },
    { table: 'Guardian links', error: linksError },
    { table: 'Teachers', error: teachersError },
    { table: 'Staff', error: staffError },
    { table: 'Subjects', error: subjectsError },
    { table: 'Teacher assignments', error: assignmentsError },
    { table: 'Exams', error: examsError },
    { table: 'Notifications', error: notificationsError },
  ].filter(item => item.error), [
    settingsError, classesError, studentsError, paymentsError, attendanceError, resultsError,
    parentsError, linksError, teachersError, staffError, subjectsError, assignmentsError, examsError,
    notificationsError,
  ]);

  const dbSetting = schoolSettings.find(r => Number(r.id) === 1) ?? schoolSettings[0];
  const term: Term =
    periodOverride?.term ??
    (dbSetting?.term === 1 || dbSetting?.term === 2 || dbSetting?.term === 3 ? (dbSetting.term as Term) : 1);
  const academicYear: number =
    periodOverride?.academicYear ??
    (Number(dbSetting?.academicyear) >= 2000 ? Number(dbSetting.academicyear) : new Date().getFullYear());

  const [sheet, setSheet] = useState<string | null>(null);
  const [f, setF] = useState<Record<string, string>>({});
  const [sheetError, setSheetError] = useState('');
  const [busy, setBusy] = useState(false);

  const [guardianQuery, setGuardianQuery] = useState('');
  const [confirmUnlinkKey, setConfirmUnlinkKey] = useState<string | null>(null);
  const [unlinkingKey, setUnlinkingKey] = useState<string | null>(null);

  const open = (name: string, init: Record<string, string> = {}) => { setF(init); setSheetError(''); setSheet(name); };
  const set = (k: string) => (v: string) => { setF(p => ({ ...p, [k]: v })); if (sheetError) setSheetError(''); };
  const F = (k: string, label: string, extra: object = {}) => <Field label={label} value={f[k] ?? ''} onChangeText={set(k)} {...extra} />;
  const need = (...ks: string[]) => {
    const ok = ks.every(k => (f[k] ?? '').trim());
    if (!ok) {
      const msg = 'Fill in all required fields';
      setSheetError(msg);
      toast(msg, 'danger');
    }
    return ok;
  };
  const close = () => { setSheet(null); setSheetError(''); };
  const foot = (onSave: () => void, label = 'Save') => (<><Button variant="quiet" label="Cancel" onPress={close} /><Button label={label} busy={busy} onPress={onSave} /></>);

  async function updateSchoolPeriod(nextTerm: Term, nextYear: number) {
    if (savingPeriod) return;
    const prevOverride = periodOverride;
    setPeriodOverride({ term: nextTerm, academicYear: nextYear });
    setSavingPeriod(true);

    const { error } = await supabase
      .from('schoolsettings')
      .upsert({ id: 1, term: nextTerm, academicyear: nextYear, updatedat: new Date().toISOString() }, { onConflict: 'id' });

    setSavingPeriod(false);
    if (error) {
      setPeriodOverride(prevOverride);
      return toast(`Could not save term setting: ${error.message}`, 'danger');
    }
    await reloadSchoolSettings();
    setPeriodOverride(null);
    toast(`Active period set to Term ${nextTerm}, ${nextYear}`);
  }

  async function submit(p: PromiseLike<{ error: any }>, ok: string, after: () => void) {
    setBusy(true); const { error } = await p; setBusy(false);
    if (error) { setSheetError(error.message); return toast(`Not saved: ${error.message}`, 'danger'); }
    toast(ok); close(); after();
  }

  const classes = useMemo<ClassItem[]>(() => {
    if (!rawClasses.length) return DEFAULT_CLASSES;
    const seen = new Map<string, ClassItem>();
    rawClasses.forEach(c => { if (!seen.has(c.classname)) seen.set(c.classname, {
      ClassID: c.classid, ClassName: c.classname, TermFee: c.termfee ?? undefined,
      Term1Fee: c.term1fee ?? undefined, Term2Fee: c.term2fee ?? undefined, Term3Fee: c.term3fee ?? undefined }); });
    return [...seen.values()];
  }, [rawClasses]);
  const classById = useMemo(() => new Map(classes.map(c => [String(c.ClassID), c])), [classes]);

  const studentRows: StudentRow[] = useMemo(() => {
    const paidThisTermMap = new Map<string, number>();
    const paidPriorTermsMap = new Map<string, number>();

    rawPayments.forEach(p => {
      if (Number(p.academicyear ?? academicYear) !== Number(academicYear)) return;
      const pTerm = Number(p.term ?? 1);
      const key = String(p.studentid);
      const amt = Number(p.amountpaid || 0);

      if (pTerm === Number(term)) {
        paidThisTermMap.set(key, (paidThisTermMap.get(key) ?? 0) + amt);
      } else if (pTerm < Number(term)) {
        paidPriorTermsMap.set(key, (paidPriorTermsMap.get(key) ?? 0) + amt);
      }
    });

    return rawStudents.map(s => {
      const rawStatus = String(s.status ?? '').trim().toLowerCase();
      const status: StudentRow['status'] =
        rawStatus === 'graduated' || rawStatus === 'withdrawn'
          ? rawStatus
          : rawStatus === 'active'
          ? 'active'
          : s.classid === null ? 'graduated' : 'active';

      const stuKey = String(s.studentid);
      const cls = s.classid !== null ? classById.get(String(s.classid)) : undefined;

      let priorTermsBilled = 0;
      if (status === 'active') {
        for (let t = 1; t < Number(term); t++) {
          priorTermsBilled += feeFor(cls, t as Term);
        }
      }

      const openingBalance = Number(s.carriedforward ?? 0);
      const priorTermsPaid = paidPriorTermsMap.get(stuKey) ?? 0;
      const effectiveCarriedForward = openingBalance + priorTermsBilled - priorTermsPaid;

      return {
        StudentID: s.studentid,
        AdmissionNumber: s.admissionnumber,
        FirstName: s.firstname,
        LastName: s.lastname,
        ClassID: s.classid,
        status,
        paidThisTerm: paidThisTermMap.get(stuKey) ?? 0,
        carriedForward: effectiveCarriedForward,
      };
    });
  }, [rawStudents, rawPayments, academicYear, term, classById]);

  const studentById = useMemo(() => new Map(studentRows.map(s => [String(s.StudentID), s])), [studentRows]);
  const activeStudents = useMemo(() => studentRows.filter(s => s.status === 'active'), [studentRows]);
  const alumniCount = useMemo(() => studentRows.filter(s => s.status === 'graduated').length, [studentRows]);

  const isTeacher = role === '
