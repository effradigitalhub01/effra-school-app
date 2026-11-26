import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  GraduationCap,
  LogOut,
  Plus,
  School,
  ShieldCheck,
  Users,
  Wallet,
} from 'lucide-react';
import {
  DEFAULT_TERM_FEE,
  LAST_GRADE,
  type ClassItem,
  type Id,
  type Term,
} from './logic';
import * as piModule from './pi';

type Role = 'admin' | 'teacher' | 'student' | 'parent' | 'guest';

interface StudentRow {
  id: Id;
  name: string;
  grade: number;
  classId: Id;
  status: 'active' | 'graduated';
  feePaid: number;
}

interface PiAuthState {
  connected: boolean;
  username: string;
  uid: string;
  error: string | null;
}

const INITIAL_CLASSES: ClassItem[] = [
  {
    ClassID: 'cls-1',
    ClassName: 'Grade 1 Blue',
    TermFee: DEFAULT_TERM_FEE,
    Term1Fee: DEFAULT_TERM_FEE,
    Term2Fee: DEFAULT_TERM_FEE,
    Term3Fee: DEFAULT_TERM_FEE,
  },
  {
    ClassID: 'cls-2',
    ClassName: 'Grade 4 Green',
    TermFee: DEFAULT_TERM_FEE,
    Term1Fee: DEFAULT_TERM_FEE,
    Term2Fee: DEFAULT_TERM_FEE,
    Term3Fee: DEFAULT_TERM_FEE,
  },
];

const INITIAL_STUDENTS: StudentRow[] = [
  {
    id: 'stu-1',
    name: 'Amina Otieno',
    grade: 1,
    classId: 'cls-1',
    status: 'active',
    feePaid: 15000,
  },
  {
    id: 'stu-2',
    name: 'Brian Kamau',
    grade: 4,
    classId: 'cls-2',
    status: 'active',
    feePaid: DEFAULT_TERM_FEE,
  },
  {
    id: 'stu-3',
    name: 'Grace Wanjiku',
    grade: LAST_GRADE,
    classId: 'cls-2',
    status: 'graduated',
    feePaid: DEFAULT_TERM_FEE,
  },
];

async function triggerPiSignIn(): Promise<{ username: string; uid: string }> {
  const api = piModule as unknown as {
    signInWithPi?: () => Promise<{ username?: string; uid?: string }>;
    authenticatePi?: () => Promise<{ username?: string; uid?: string }>;
  };

  if (typeof api.signInWithPi === 'function') {
    const res = await api.signInWithPi();
    return {
      username: res?.username || 'PiPioneer',
      uid: res?.uid || 'pi-user',
    };
  }

  if (typeof api.authenticatePi === 'function') {
    const res = await api.authenticatePi();
    return {
      username: res?.username || 'PiPioneer',
      uid: res?.uid || 'pi-user',
    };
  }

  const piGlobal = (
    window as unknown as {
      Pi?: {
        authenticate?: (
          scopes: string[],
          onIncompletePaymentFound: (payment: unknown) => void
        ) => Promise<{ user?: { username?: string; uid?: string } }>;
      };
    }
  ).Pi;

  if (piGlobal && typeof piGlobal.authenticate === 'function') {
    const auth = await piGlobal.authenticate(['username'], () => {});
    return {
      username: auth?.user?.username || 'PiPioneer',
      uid: auth?.user?.uid || 'pi-user',
    };
  }

  return {
    username: 'PiBrowserUser',
    uid: 'local-pi-session',
  };
}

export default function App() {
  const [piAuth, setPiAuth] = useState<PiAuthState>({
    connected: false,
    username: '',
    uid: '',
    error: null,
  });
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [role, setRole] = useState<Role>('admin');
  const [term, setTerm] = useState<Term>(1);
  const [classes, setClasses] = useState<ClassItem[]>(INITIAL_CLASSES);
  const [studentRows, setStudentRows] = useState<StudentRow[]>(INITIAL_STUDENTS);
  const [newStudentName, setNewStudentName] = useState('');
  const [selectedClassId, setSelectedClassId] = useState<Id>('cls-1');

  useEffect(() => {
    const piGlobal = (
      window as unknown as {
        Pi?: { init?: (cfg: { version: string; sandbox?: boolean }) => void };
      }
    ).Pi;
    if (piGlobal && typeof piGlobal.init === 'function') {
      piGlobal.init({ version: '2.0' });
    }
  }, []);

  const alumniCount = useMemo(
    () => studentRows.filter((s) => s.status === 'graduated').length,
    [studentRows]
  );

  const isTeacher = role === 'teacher';
  const isAdmin = role === 'admin';
  const canManageRecords = isAdmin || isTeacher;

  const totalFeesCollected = useMemo(
    () => studentRows.reduce((sum, s) => sum + s.feePaid, 0),
    [studentRows]
  );

  const handlePiLogin = async () => {
    setIsSigningIn(true);
    setPiAuth((prev) => ({ ...prev, error: null }));
    try {
      const user = await triggerPiSignIn();
      setPiAuth({
        connected: true,
        username: user.username,
        uid: user.uid,
        error: null,
      });
    } catch (err) {
      setPiAuth({
        connected: false,
        username: '',
        uid: '',
        error: err instanceof Error ? err.message : 'Pi sign-in failed',
      });
    } finally {
      setIsSigningIn(false);
    }
  };

  const handlePiLogout = () => {
    setPiAuth({
      connected: false,
      username: '',
      uid: '',
      error: null,
    });
  };

  const handleAddStudent = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newStudentName.trim();
    if (!trimmed || !canManageRecords) return;

    const targetClass = classes.find((c) => c.ClassID === selectedClassId) ?? classes[0];
    const nextRow: StudentRow = {
      id: `stu-${Date.now()}`,
      name: trimmed,
      grade: 1,
      classId: targetClass?.ClassID ?? 'cls-1',
      status: 'active',
      feePaid: 0,
    };

    setStudentRows((prev) => [nextRow, ...prev]);
    setNewStudentName('');
  };

  const handleAddClass = () => {
    if (!isAdmin) return;
    const nextNum = classes.length + 1;
    const newClass: ClassItem = {
      ClassID: `cls-${Date.now()}`,
      ClassName: `Class ${nextNum}`,
      TermFee: DEFAULT_TERM_FEE,
      Term1Fee: DEFAULT_TERM_FEE,
      Term2Fee: DEFAULT_TERM_FEE,
      Term3Fee: DEFAULT_TERM_FEE,
    };
    setClasses((prev) => [...prev, newClass]);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500 text-white">
              <School className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">
                Effra School System (Effra Academy)
              </h1>
              <p className="text-xs text-slate-500">
                Pi Network &amp; Pi Browser Exclusive Access
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs font-medium text-slate-600">
              Term:
              <select
                value={term}
                onChange={(e) => setTerm(Number(e.target.value) as Term)}
                className="ml-2 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800"
              >
                <option value={1}>Term 1</option>
                <option value={2}>Term 2</option>
                <option value={3}>Term 3</option>
              </select>
            </label>

            <label className="text-xs font-medium text-slate-600">
              Role:
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="ml-2 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800"
              >
                <option value="admin">Admin</option>
                <option value="teacher">Teacher</option>
                <option value="student">Student</option>
                <option value="parent">Parent</option>
                <option value="guest">Guest</option>
              </select>
            </label>

            {piAuth.connected ? (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  @{piAuth.username}
                </span>
                <button
                  type="button"
                  onClick={handlePiLogout}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign Out
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handlePiLogin}
                disabled={isSigningIn}
                className="inline-flex items-center gap-2 rounded-md bg-amber-500 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-amber-600 disabled:opacity-60"
              >
                <ShieldCheck className="h-4 w-4" />
                {isSigningIn ? 'Connecting Pi...' : 'Continue with Pi'}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        {piAuth.error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {piAuth.error}
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Enrolled Students</span>
              <Users className="h-4 w-4 text-amber-500" />
            </div>
            <p className="mt-2 text-2xl font-bold">{studentRows.length}</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Alumni (Graduated)</span>
              <GraduationCap className="h-4 w-4 text-amber-500" />
            </div>
            <p className="mt-2 text-2xl font-bold">{alumniCount}</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Active Classes</span>
              <BookOpen className="h-4 w-4 text-amber-500" />
            </div>
            <p className="mt-2 text-2xl font-bold">{classes.length}</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Fees Recorded (Term {term})</span>
              <Wallet className="h-4 w-4 text-amber-500" />
            </div>
            <p className="mt-2 text-2xl font-bold">
              {totalFeesCollected.toLocaleString()}
            </p>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Student Directory</h2>
              <span className="text-xs text-slate-500">
                Active Role: <strong className="capitalize">{role}</strong>
              </span>
            </div>

            {canManageRecords && (
              <form
                onSubmit={handleAddStudent}
                className="flex flex-wrap gap-2 rounded-lg bg-slate-50 p-3"
              >
                <input
                  type="text"
                  value={newStudentName}
                  onChange={(e) => setNewStudentName(e.target.value)}
                  placeholder="Student full name"
                  className="min-w-[180px] flex-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
                />
                <select
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
                >
                  {classes.map((c) => (
                    <option key={String(c.ClassID)} value={String(c.ClassID)}>
                      {c.ClassName}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
                >
                  <Plus className="h-4 w-4" />
                  Add Student
                </button>
              </form>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-2.5 pr-4">Name</th>
                    <th className="py-2.5 pr-4">Grade</th>
                    <th className="py-2.5 pr-4">Status</th>
                    <th className="py-2.5 text-right">Fee Paid</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {studentRows.map((row) => (
                    <tr key={String(row.id)}>
                      <td className="py-2.5 pr-4 font-medium">{row.name}</td>
                      <td className="py-2.5 pr-4">Grade {row.grade}</td>
                      <td className="py-2.5 pr-4 capitalize">{row.status}</td>
                      <td className="py-2.5 text-right">
                        {row.feePaid.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Classes &amp; Term Fees</h2>
              {isAdmin && (
                <button
                  type="button"
                  onClick={handleAddClass}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium hover:bg-slate-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Class
                </button>
              )}
            </div>

            <ul className="space-y-2.5">
              {classes.map((cls) => (
                <li
                  key={String(cls.ClassID)}
                  className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 text-sm"
                >
                  <span className="font-medium">{cls.ClassName}</span>
                  <span className="text-xs font-semibold text-slate-600">
                    {(cls.TermFee ?? DEFAULT_TERM_FEE).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>
    </div>
  );
}
