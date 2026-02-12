import { env } from './env.js';

export type OAIMsg = { role: 'system' | 'user' | 'assistant'; content: string };

export type OpenAIJsonReply = {
  reply: string;
  kind?: 'answer' | 'wizard' | 'plan';
  action_plan?: {
    title: string;
    steps: { title: string; details?: string }[];
  };
  tasks?: {
    title: string;
    description?: string | null;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    due_at?: string | null; // ISO
    subtasks?: { title: string }[];
  }[];
  kpis?: {
    name: string;
    unit?: string | null;
    target_value?: number | null;
  }[];
  follow_up_questions?: string[];
};

function stripCodeFences(s: string) {
  const t = s.trim();
  if (t.startsWith('```')) {
    return t.replace(/^```[a-zA-Z]*\n?/, '').replace(/```\s*$/, '').trim();
  }
  return t;
}

export async function callOpenAIJson(messages: OAIMsg[]): Promise<OpenAIJsonReply> {
  if (!env.OPENAI_API_KEY) {
    return {
      reply:
        'ИИ не настроен (нет OPENAI_API_KEY). Добавь ключ в apps/api/.env, и я смогу строить планы, KPI и задачи прямо в фокусе.',
      kind: 'answer'
    };
  }

  const model = env.OPENAI_MODEL || 'gpt-4o-mini';

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      messages,
      // Force JSON output.
      response_format: { type: 'json_object' }
    })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenAI error: ${res.status} ${text}`);
  }

  const data: any = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI: empty response');

  const raw = stripCodeFences(String(content));
  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.reply) {
      return { reply: String(raw).slice(0, 4000), kind: 'answer' };
    }
    return parsed;
  } catch {
    return { reply: String(raw).slice(0, 4000), kind: 'answer' };
  }
}
