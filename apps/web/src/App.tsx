import React, { useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { getTelegramWebApp } from './telegram';

type Focus = any;
type Task = any;

export default function App() {
  const tg = useMemo(() => getTelegramWebApp(), []);
  const [me, setMe] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [focuses, setFocuses] = useState<Focus[]>([]);
  const [selectedFocusId, setSelectedFocusId] = useState<string | null>(null);
  const [selectedFocus, setSelectedFocus] = useState<any>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskTitle, setTaskTitle] = useState('');
  const [newFocusTitle, setNewFocusTitle] = useState('');
  const [assistantInput, setAssistantInput] = useState('');
  const [messages, setMessages] = useState<any[]>([]);

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

  useEffect(() => {
    if (!selectedFocusId) return;
    (async () => {
      try {
        const f = await api.getFocus(selectedFocusId);
        setSelectedFocus(f);
        const t = await api.listTasks(selectedFocusId, f.role === 'owner' ? 'all' : 'me');
        setTasks(t.tasks);
        const th = await api.getThread(selectedFocusId);
        setMessages(th.messages ?? []);
      } catch (e: any) {
        setError(e.message);
      }
    })();
  }, [selectedFocusId]);

  async function refreshFocuses() {
    const f = await api.listFocuses();
    setFocuses(f.focuses);
  }

  async function createFocus() {
    if (!newFocusTitle.trim()) return;
    try {
      await api.createFocus({ title: newFocusTitle.trim() });
      setNewFocusTitle('');
      await refreshFocuses();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function createTask() {
    if (!selectedFocusId || !taskTitle.trim()) return;
    try {
      await api.createTask(selectedFocusId, { title: taskTitle.trim() });
      setTaskTitle('');
      const t = await api.listTasks(selectedFocusId, selectedFocus?.role === 'owner' ? 'all' : 'me');
      setTasks(t.tasks);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function toggleDone(task: any) {
    try {
      const next = task.status === 'done' ? 'todo' : 'done';
      await api.patchTask(task.id, { status: next });
      const t = await api.listTasks(task.focus_id, selectedFocus?.role === 'owner' ? 'all' : 'me');
      setTasks(t.tasks);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function sendAssistant() {
    if (!selectedFocusId || !assistantInput.trim()) return;
    try {
      const content = assistantInput.trim();
      setAssistantInput('');
      await api.sendMessage(selectedFocusId, content);
      const th = await api.getThread(selectedFocusId);
      setMessages(th.messages ?? []);
    } catch (e: any) {
      setError(e.message);
    }
  }

  if (error) {
    return (
      <div style={styles.container}>
        <h2 style={{ margin: 0 }}>Business Assistant</h2>
        <p style={{ opacity: 0.8 }}>Ошибка: {error}</p>
        <p style={{ opacity: 0.8 }}>
          Если ты не в Telegram, укажи <code>VITE_DEV_TG_ID</code> в <code>apps/web/.env</code>.
        </p>
      </div>
    );
  }

  if (!me) return <div style={styles.container}>Loading...</div>;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <div style={{ fontWeight: 700 }}>Фокусы</div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>@{me.username ?? 'user'} </div>
        </div>
        {selectedFocusId && (
          <button style={styles.btn} onClick={() => setSelectedFocusId(null)}>
            ← назад
          </button>
        )}
      </div>

      {!selectedFocusId ? (
        <>
          <div style={styles.card}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Создать фокус</div>
            <div style={styles.row}>
              <input
                style={styles.input}
                placeholder="Например: Запуск кофейни"
                value={newFocusTitle}
                onChange={(e) => setNewFocusTitle(e.target.value)}
              />
              <button style={styles.btnPrimary} onClick={createFocus}>
                Создать
              </button>
            </div>
          </div>

          <div style={styles.list}>
            {focuses.map((f) => (
              <button key={f.id} style={styles.listItem} onClick={() => setSelectedFocusId(f.id)}>
                <div style={{ fontWeight: 600 }}>{f.title}</div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>{f.status} • роль: {f.role}</div>
              </button>
            ))}
            {!focuses.length && <div style={{ opacity: 0.7 }}>Пока нет фокусов. Создай первый.</div>}
          </div>
        </>
      ) : (
        <>
          <div style={styles.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 700 }}>{selectedFocus?.focus?.title ?? ''}</div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>роль: {selectedFocus?.role}</div>
              </div>
            </div>
          </div>

          <div style={styles.card}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Задачи</div>
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
            <div style={{ marginTop: 8 }}>
              {tasks.map((t) => (
                <div key={t.id} style={styles.taskRow}>
                  <button style={styles.checkbox} onClick={() => toggleDone(t)}>
                    {t.status === 'done' ? '✅' : '⬜'}
                  </button>
                  <div style={{ flex: 1 }}>
                    <div style={{ textDecoration: t.status === 'done' ? 'line-through' : 'none' }}>{t.title}</div>
                    <div style={{ fontSize: 12, opacity: 0.65 }}>{t.status} • {t.priority}</div>
                  </div>
                </div>
              ))}
              {!tasks.length && <div style={{ opacity: 0.7 }}>Пока задач нет.</div>}
            </div>
          </div>

          <div style={styles.card}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Ассистент</div>
            <div style={styles.chat}>
              {messages.map((m) => (
                <div key={m.id} style={{ ...styles.chatMsg, alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{ fontSize: 12, opacity: 0.65 }}>{m.role}</div>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
                </div>
              ))}
              {!messages.length && <div style={{ opacity: 0.7 }}>Напиши ассистенту, что хочешь сделать или какая проблема.</div>}
            </div>

            <div style={styles.row}>
              <input
                style={styles.input}
                placeholder="Например: упали продажи, что делать?"
                value={assistantInput}
                onChange={(e) => setAssistantInput(e.target.value)}
              />
              <button style={styles.btnPrimary} onClick={sendAssistant}>
                →
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
    padding: 16,
    maxWidth: 760,
    margin: '0 auto'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  card: {
    border: '1px solid rgba(0,0,0,0.08)',
    borderRadius: 14,
    padding: 12,
    boxShadow: '0 6px 20px rgba(0,0,0,0.05)',
    marginBottom: 12
  },
  row: {
    display: 'flex',
    gap: 8
  },
  input: {
    flex: 1,
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid rgba(0,0,0,0.12)'
  },
  btn: {
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid rgba(0,0,0,0.12)',
    background: 'white'
  },
  btnPrimary: {
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid rgba(0,0,0,0.12)',
    background: 'black',
    color: 'white'
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8
  },
  listItem: {
    textAlign: 'left',
    border: '1px solid rgba(0,0,0,0.08)',
    borderRadius: 14,
    padding: 12,
    background: 'white'
  },
  taskRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid rgba(0,0,0,0.06)'
  },
  checkbox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    border: '1px solid rgba(0,0,0,0.12)',
    background: 'white'
  },
  chat: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    maxHeight: 240,
    overflow: 'auto',
    padding: 8,
    border: '1px solid rgba(0,0,0,0.06)',
    borderRadius: 12,
    marginBottom: 8
  },
  chatMsg: {
    maxWidth: '85%',
    border: '1px solid rgba(0,0,0,0.08)',
    borderRadius: 12,
    padding: 10,
    background: 'white'
  }
};
