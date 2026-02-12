import React, { useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { getTelegramWebApp } from './telegram';

type Focus = any;
type Task = any;
type KPI = any;

type TabKey = 'tasks' | 'assistant' | 'kpis';

function fmtDate(d?: string | null) {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleString(undefined, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function App() {
  const tg = useMemo(() => getTelegramWebApp(), []);
  const [me, setMe] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [focuses, setFocuses] = useState<Focus[]>([]);
  const [selectedFocusId, setSelectedFocusId] = useState<string | null>(null);
  const [selectedFocus, setSelectedFocus] = useState<any>(null);
  const [tab, setTab] = useState<TabKey>('tasks');

  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskTitle, setTaskTitle] = useState('');

  const [kpis, setKpis] = useState<KPI[]>([]);
  const [kpiName, setKpiName] = useState('');
  const [kpiTarget, setKpiTarget] = useState('');

  const [assistantInput, setAssistantInput] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
  const [aiBusy, setAiBusy] = useState(false);

  useEffect(() => {
    tg?.ready?.();
    tg?.expand?.();
    (async () => {
      try {
        const m = await api.me();
        setMe(m.user);
        const f = await api.listFocuses();
        setFocuses(f.focuses);
      } catch (e: any) {
        setError(e.message);
      }
    })();
  }, []);

  async function refreshFocuses() {
    const f = await api.listFocuses();
    setFocuses(f.focuses);
  }

  async function refreshTasks(focusId: string) {
    const assigned = selectedFocus?.role === 'owner' ? 'all' : 'me';
    const t = await api.listTasks(focusId, assigned);
    setTasks(t.tasks);
  }

  async function refreshKpis(focusId: string) {
    const r = await api.listKpis(focusId);
    setKpis(r.kpis);
  }

  async function refreshThread(focusId: string) {
    const th = await api.getThread(focusId);
    setMessages(th.messages ?? []);
  }

  useEffect(() => {
    if (!selectedFocusId) return;
    (async () => {
      try {
        const f = await api.getFocus(selectedFocusId);
        setSelectedFocus(f);
        setTab('tasks');
        await refreshTasks(selectedFocusId);
        await refreshKpis(selectedFocusId);
        await refreshThread(selectedFocusId);
      } catch (e: any) {
        setError(e.message);
      }
    })();
  }, [selectedFocusId]);

  async function createFocus(title: string) {
    if (!title.trim()) return;
    await api.createFocus({ title: title.trim() });
    await refreshFocuses();
  }

  async function createTask() {
    if (!selectedFocusId || !taskTitle.trim()) return;
    await api.createTask(selectedFocusId, { title: taskTitle.trim() });
    setTaskTitle('');
    await refreshTasks(selectedFocusId);
  }

  async function toggleDone(task: any) {
    const next = task.status === 'done' ? 'todo' : 'done';
    await api.patchTask(task.id, { status: next });
    await refreshTasks(task.focus_id);
  }

  async function createKpi() {
    if (!selectedFocusId) return;
    if (!kpiName.trim()) return;
    const target = kpiTarget.trim() ? Number(kpiTarget.trim()) : null;
    await api.createKpi(selectedFocusId, { name: kpiName.trim(), target_value: Number.isFinite(target as any) ? target : null });
    setKpiName('');
    setKpiTarget('');
    await refreshKpis(selectedFocusId);
  }

  async function updateKpi(kpi: any, patch: any) {
    await api.patchKpi(kpi.id, patch);
    if (selectedFocusId) await refreshKpis(selectedFocusId);
  }

  async function sendAssistant() {
    if (!selectedFocusId || !assistantInput.trim()) return;
    const content = assistantInput.trim();
    setAssistantInput('');
    setAiBusy(true);
    try {
      await api.sendMessage(selectedFocusId, content);
      await refreshThread(selectedFocusId);
    } finally {
      setAiBusy(false);
    }
  }

  async function applyAiArtifacts(msg: any) {
    if (!selectedFocusId) return;
    const tasks = msg?.meta?.tasks;
    const kpis = msg?.meta?.kpis;

    if (Array.isArray(tasks) && tasks.length) {
      await api.planToTasks(selectedFocusId, tasks);
      await refreshTasks(selectedFocusId);
    }

    if (Array.isArray(kpis) && kpis.length) {
      for (const k of kpis) {
        await api.createKpi(selectedFocusId, {
          name: k.name,
          unit: k.unit ?? null,
          target_value: k.target_value ?? null
        });
      }
      await refreshKpis(selectedFocusId);
    }
  }

  if (error) {
    return (
      <div style={styles.page}>
        <div style={styles.topbar}>
          <div style={styles.brand}>Business Assistant</div>
        </div>
        <div style={styles.card}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Ошибка</div>
          <div style={{ opacity: 0.85 }}>{error}</div>
          <div style={{ marginTop: 10, opacity: 0.75, fontSize: 13 }}>
            Если ты не в Telegram, укажи <code>VITE_DEV_TG_ID</code> в <code>apps/web/.env</code>.
          </div>
        </div>
      </div>
    );
  }

  if (!me) return <div style={styles.page}>Loading...</div>;

  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <div>
          <div style={styles.brand}>Business Assistant</div>
          <div style={styles.subtle}>@{me.username ?? 'user'}</div>
        </div>
        {selectedFocusId && (
          <button style={styles.btnGhost} onClick={() => setSelectedFocusId(null)}>
            ← Фокусы
          </button>
        )}
      </div>

      {!selectedFocusId ? (
        <FocusList focuses={focuses} onSelect={setSelectedFocusId} onCreate={createFocus} />
      ) : (
        <div>
          <div style={styles.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 18 }}>{selectedFocus?.focus?.title ?? ''}</div>
                <div style={styles.subtle}>роль: {selectedFocus?.role}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Pill active={tab === 'tasks'} onClick={() => setTab('tasks')} label="Задачи" />
                <Pill active={tab === 'assistant'} onClick={() => setTab('assistant')} label="Ассистент" />
                <Pill active={tab === 'kpis'} onClick={() => setTab('kpis')} label="KPI" />
              </div>
            </div>
          </div>

          {tab === 'tasks' && (
            <div style={styles.card}>
              <div style={styles.sectionTitle}>Задачи</div>
              {selectedFocus?.role === 'owner' && (
                <div style={styles.row}>
                  <input
                    style={styles.input}
                    placeholder="Новая задача"
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                  />
                  <button style={styles.btnPrimary} onClick={createTask}>
                    +
                  </button>
                </div>
              )}

              <div style={{ marginTop: 10 }}>
                {tasks.map((t) => (
                  <div key={t.id} style={styles.taskRow}>
                    <button style={styles.checkbox} onClick={() => toggleDone(t)}>
                      {t.status === 'done' ? '✅' : '⬜'}
                    </button>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, textDecoration: t.status === 'done' ? 'line-through' : 'none' }}>
                        {t.title}
                      </div>
                      <div style={styles.metaLine}>
                        {t.status} • {t.priority}
                        {t.due_at ? ` • ${fmtDate(t.due_at)}` : ''}
                      </div>
                    </div>
                  </div>
                ))}
                {!tasks.length && <div style={styles.empty}>Пока задач нет.</div>}
              </div>
            </div>
          )}

          {tab === 'assistant' && (
            <div style={styles.card}>
              <div style={styles.sectionTitle}>Ассистент</div>
              <div style={styles.chat}>
                {messages.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      ...styles.chatMsg,
                      alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                      borderColor: m.role === 'user' ? 'rgba(0,0,0,0.16)' : 'rgba(0,0,0,0.08)'
                    }}
                  >
                    <div style={styles.metaLine}>{m.role}</div>
                    <div style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{m.content}</div>
                    {m.role === 'assistant' && (Array.isArray(m?.meta?.tasks) || Array.isArray(m?.meta?.kpis)) && (
                      <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {Array.isArray(m?.meta?.tasks) && m.meta.tasks.length > 0 && (
                          <button style={styles.btn} onClick={() => applyAiArtifacts(m)}>
                            Создать задачи ({m.meta.tasks.length})
                          </button>
                        )}
                        {Array.isArray(m?.meta?.kpis) && m.meta.kpis.length > 0 && (
                          <button style={styles.btn} onClick={() => applyAiArtifacts(m)}>
                            Создать KPI ({m.meta.kpis.length})
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {!messages.length && <div style={styles.empty}>Напиши: что хочешь сделать или какая проблема в бизнесе.</div>}
              </div>

              <div style={styles.row}>
                <input
                  style={styles.input}
                  placeholder="Например: упали продажи, что делать?"
                  value={assistantInput}
                  onChange={(e) => setAssistantInput(e.target.value)}
                />
                <button style={styles.btnPrimary} disabled={aiBusy} onClick={sendAssistant}>
                  {aiBusy ? '…' : '→'}
                </button>
              </div>
              <div style={{ marginTop: 8, opacity: 0.7, fontSize: 12 }}>
                Подсказка: попроси «сделай action plan на неделю и KPI», затем нажми «Создать задачи/KPI».
              </div>
            </div>
          )}

          {tab === 'kpis' && (
            <div style={styles.card}>
              <div style={styles.sectionTitle}>KPI</div>
              {selectedFocus?.role === 'owner' && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <input
                    style={styles.input}
                    placeholder="Например: Выручка, Лиды"
                    value={kpiName}
                    onChange={(e) => setKpiName(e.target.value)}
                  />
                  <input
                    style={{ ...styles.input, maxWidth: 120 }}
                    placeholder="Target"
                    value={kpiTarget}
                    onChange={(e) => setKpiTarget(e.target.value)}
                  />
                  <button style={styles.btnPrimary} onClick={createKpi}>
                    +
                  </button>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {kpis.map((k) => (
                  <div key={k.id} style={styles.kpiRow}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700 }}>{k.name}</div>
                      <div style={styles.metaLine}>
                        target: {k.target_value ?? '—'} • current: {k.current_value ?? '—'}
                      </div>
                    </div>
                    {selectedFocus?.role === 'owner' && (
                      <button
                        style={styles.btn}
                        onClick={() => {
                          const v = prompt('Новое значение current_value', String(k.current_value ?? ''));
                          if (v == null) return;
                          const n = Number(v);
                          if (!Number.isFinite(n)) return;
                          updateKpi(k, { current_value: n });
                        }}
                      >
                        Update
                      </button>
                    )}
                  </div>
                ))}
                {!kpis.length && <div style={styles.empty}>Пока KPI нет. Добавь вручную или попроси ассистента.</div>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FocusList(props: {
  focuses: Focus[];
  onSelect: (id: string) => void;
  onCreate: (title: string) => Promise<void>;
}) {
  const [newFocusTitle, setNewFocusTitle] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <>
      <div style={styles.card}>
        <div style={styles.sectionTitle}>Фокусы</div>
        <div style={styles.row}>
          <input
            style={styles.input}
            placeholder="Например: Запуск кофейни"
            value={newFocusTitle}
            onChange={(e) => setNewFocusTitle(e.target.value)}
          />
          <button
            style={styles.btnPrimary}
            disabled={busy}
            onClick={async () => {
              if (!newFocusTitle.trim()) return;
              setBusy(true);
              try {
                await props.onCreate(newFocusTitle.trim());
                setNewFocusTitle('');
              } finally {
                setBusy(false);
              }
            }}
          >
            Создать
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {props.focuses.map((f) => (
          <button key={f.id} style={styles.listItem} onClick={() => props.onSelect(f.id)}>
            <div style={{ fontWeight: 800 }}>{f.title}</div>
            <div style={styles.metaLine}>{f.status} • роль: {f.role}</div>
          </button>
        ))}
        {!props.focuses.length && <div style={styles.empty}>Пока нет фокусов. Создай первый.</div>}
      </div>
    </>
  );
}

function Pill(props: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={props.onClick}
      style={{
        ...styles.pill,
        background: props.active ? 'rgba(0,0,0,0.92)' : 'rgba(0,0,0,0.04)',
        color: props.active ? 'white' : 'rgba(0,0,0,0.8)'
      }}
    >
      {props.label}
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
    padding: 16,
    maxWidth: 820,
    margin: '0 auto'
  },
  topbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12
  },
  brand: { fontWeight: 900, fontSize: 18 },
  subtle: { fontSize: 12, opacity: 0.7 },
  sectionTitle: { fontWeight: 800, marginBottom: 10 },
  card: {
    border: '1px solid rgba(0,0,0,0.08)',
    borderRadius: 16,
    padding: 14,
    boxShadow: '0 10px 28px rgba(0,0,0,0.05)',
    marginBottom: 12,
    background: 'white'
  },
  row: { display: 'flex', gap: 8 },
  input: {
    flex: 1,
    padding: '10px 12px',
    borderRadius: 12,
    border: '1px solid rgba(0,0,0,0.12)',
    outline: 'none'
  },
  btnPrimary: {
    padding: '10px 12px',
    borderRadius: 12,
    border: '1px solid rgba(0,0,0,0.12)',
    background: 'rgba(0,0,0,0.92)',
    color: 'white',
    fontWeight: 800
  },
  btn: {
    padding: '10px 12px',
    borderRadius: 12,
    border: '1px solid rgba(0,0,0,0.12)',
    background: 'white',
    fontWeight: 700
  },
  btnGhost: {
    padding: '10px 12px',
    borderRadius: 12,
    border: '1px solid rgba(0,0,0,0.10)',
    background: 'rgba(0,0,0,0.02)',
    fontWeight: 800
  },
  listItem: {
    textAlign: 'left',
    border: '1px solid rgba(0,0,0,0.08)',
    borderRadius: 16,
    padding: 14,
    background: 'white'
  },
  pill: {
    padding: '8px 10px',
    borderRadius: 999,
    border: '1px solid rgba(0,0,0,0.08)',
    fontWeight: 800,
    fontSize: 12
  },
  metaLine: { fontSize: 12, opacity: 0.7, marginTop: 2 },
  empty: { opacity: 0.7, padding: 6 },
  taskRow: {
    display: 'flex',
    gap: 10,
    alignItems: 'center',
    padding: '10px 0',
    borderBottom: '1px solid rgba(0,0,0,0.06)'
  },
  checkbox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    border: '1px solid rgba(0,0,0,0.12)',
    background: 'white'
  },
  chat: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    maxHeight: 320,
    overflow: 'auto',
    padding: 10,
    border: '1px solid rgba(0,0,0,0.06)',
    borderRadius: 14,
    marginBottom: 10,
    background: 'rgba(0,0,0,0.02)'
  },
  chatMsg: {
    maxWidth: '88%',
    border: '1px solid rgba(0,0,0,0.08)',
    borderRadius: 14,
    padding: 12,
    background: 'white'
  },
  kpiRow: {
    display: 'flex',
    gap: 10,
    alignItems: 'center',
    padding: 12,
    border: '1px solid rgba(0,0,0,0.08)',
    borderRadius: 16,
    background: 'white'
  }
};
