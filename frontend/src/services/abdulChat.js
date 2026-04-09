import axios from 'axios';
import { SYSTEM_PROMPT, TOOLS_SCHEMA, BMBB_API_URL } from '../utils/abdulPersona';

// Cache TTL (ms) – configurable via REACT_APP_CACHE_TTL, default 5 minutes
const CACHE_TTL = parseInt(process.env.REACT_APP_CACHE_TTL) || 300000;
// Max number of messages to keep in context (excluding system)
const MAX_HISTORY = 20;

// Cache key generator: deterministic key from endpoint and params
function makeCacheKey(endpoint, params) {
  const sorted = {};
  Object.keys(params).sort().forEach(k => {
    sorted[k] = params[k];
  });
  return `${endpoint}|${JSON.stringify(sorted)}`;
}

// Get cached data if present and not expired
function getCached(endpoint, params) {
  const key = 'abdul_cache_' + makeCacheKey(endpoint, params);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { data, timestamp } = JSON.parse(raw);
    if (Date.now() - timestamp > CACHE_TTL) {
      localStorage.removeItem(key);
      return null;
    }
    return data;
  } catch (e) {
    return null;
  }
}

// Store data in cache
function setCached(endpoint, params, data) {
  const key = 'abdul_cache_' + makeCacheKey(endpoint, params);
  try {
    const entry = { data, timestamp: Date.now() };
    localStorage.setItem(key, JSON.stringify(entry));
  } catch (e) {
    console.warn('Failed to cache data:', e);
  }
}

// Clear all cache entries
export function clearCache() {
  try {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('abdul_cache_'));
    keys.forEach(k => localStorage.removeItem(k));
  } catch (e) {
    console.warn('Failed to clear cache:', e);
  }
}

// Format messages for OpenRouter, including system prompt
function formatMessages(history, userMessage) {
  const msgs = [{ role: 'system', content: SYSTEM_PROMPT }];
  history.forEach(m => {
    if (m.role === 'user' || m.role === 'assistant') {
      msgs.push({ role: m.role, content: m.content });
    }
  });
  msgs.push({ role: 'user', content: userMessage });
  return msgs;
}

// Execute BMBB query with caching
async function executeBmbbQuery({ endpoint, params }) {
  // Try cache first
  const cached = getCached(endpoint, params);
  if (cached) {
    return cached;
  }
  try {
    const resp = await axios.get(`${BMBB_API_URL}${endpoint}`, { params });
    if (resp.headers['content-type'] && resp.headers['content-type'].includes('spreadsheet')) {
      return { error: 'Export Excel is not supported in chat; please use the Export button in Purchase Details page.' };
    }
    const result = resp.data;
    setCached(endpoint, params, result);
    return result;
  } catch (err) {
    const msg = err.response?.data?.detail || err.message;
    return { error: `BMBB Query Failed: ${msg}` };
  }
}

// BMBB schema description
async function executeBmbbSchema() {
  return {
    description: `
## BMBB API Reference

- \`GET /purchases/\` – List purchase transactions. Filters: outlet ('all','bandung','serpong'), tipe_item, year, start_date, end_date. Pagination: skip, limit.
- \`GET /purchases/distinct/tipe_items\` – Unique tipe_item values.
- \`GET /purchases/distinct/years\` – List of years.
- \`GET /purchases/aggregate/monthly\` – Monthly purchase totals by outlet. Params: outlet, year, start_date, end_date.
- \`GET /purchases/aggregate/price_by_item\` – Price per item across outlets. Params: item (partial), outlet, tipe_item, year, start_date, end_date. Returns: items with bandung, serpong prices, unit.
- \`GET /purchases/aggregate/price_comparison\` – Dual-outlet comparison (both outlets). Returns: item, unit, bandung, serpong, selisih, persen (%).
- \`GET /purchases/aggregate/summary\` – Summary: total_amount, total_qty, txn_count.
- \`GET /purchases/aggregate/top_items_by_qty\` – Top N items by qty. Params: outlet, year, limit.
- \`GET /purchases/aggregate/top_vendors\` – Top vendors by purchase amount.
- \`GET /purchases/aggregate/last_cost\` – Latest purchase price per item.
- \`GET /purchases/aggregate/price_history\` – Time series avg price for an item. Required: item. Optional: outlet, group_by ('day','month','year'), start_date, end_date. Returns: period, outlet, avg_price, txn_count, unit.
- \`GET /sales/\` – Sales transactions.
- \`GET /sales/aggregate/monthly\` – Monthly sales by outlet.
- \`GET /sales/aggregate/top_items\` – Top selling items.
- \`GET /import_export/export/excel\` – Export purchase details to Excel (binary).
`
  };
}

// Process tool calls: execute BMBB query or return schema
async function processToolCalls(toolCalls, messages) {
  const newMessages = [...messages];
  for (const toolCall of toolCalls) {
    const { name, arguments: args } = toolCall.function;
    let result;
    if (name === 'bmbb_query') {
      result = await executeBmbbQuery(JSON.parse(args));
    } else if (name === 'bmbb_schema') {
      result = await executeBmbbSchema();
    } else {
      result = { error: `Unknown tool: ${name}` };
    }
    newMessages.push({
      role: 'tool',
      content: JSON.stringify(result),
      tool_call_id: toolCall.id
    });
  }
  return newMessages;
}

// Convert message to API format, preserving tool_call_id and tool_calls
function toAPIMessage(msg) {
  const { role, content, tool_call_id, tool_calls } = msg;
  const m = { role, content };
  if (tool_call_id) m.tool_call_id = tool_call_id;
  if (tool_calls) m.tool_calls = tool_calls;
  return m;
}

// Main chat – with conversation loop, tool use, and context trimming
export async function sendMessage(history, userMessage) {
  const trimmedHistory = history.slice(-MAX_HISTORY);
  const messages = formatMessages(trimmedHistory, userMessage);
  const apiKey = process.env.REACT_APP_OPENROUTER_API_KEY;
  if (!apiKey) {
    return "⚠️ OpenRouter API key belum diset. Tambah REACT_APP_OPENROUTER_API_KEY di .env frontend, ya!";
  }
  const model = process.env.REACT_APP_OPENROUTER_MODEL || 'arcee-ai/trinity-large-preview:free';

  let round = 0;
  let finalResponse = '';
  while (round < 5) {
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
        'X-Title': 'BMBB Monitor AI Assistant'
      },
      body: JSON.stringify({
        model,
        messages: messages.map(toAPIMessage),
        tools: TOOLS_SCHEMA,
        tool_choice: 'auto'
      })
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`OpenRouter error: ${resp.status} – ${err}`);
    }

    const data = await resp.json();
    const choice = data.choices[0];
    const msg = choice.message;

    messages.push(msg);

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      const updatedMessages = await processToolCalls(msg.tool_calls, messages);
      messages.length = 0;
      updatedMessages.forEach(m => messages.push(m));
      round++;
      continue;
    } else {
      finalResponse = msg.content || '(Tidak ada respon)';
      break;
    }
  }

  return finalResponse;
}

// Cancelable version for stop button
export function sendMessageCancelable(history, userMessage) {
  const controller = new AbortController();
  const promise = (async () => {
    const trimmedHistory = history.slice(-MAX_HISTORY);
    const messages = formatMessages(trimmedHistory, userMessage);
    const apiKey = process.env.REACT_APP_OPENROUTER_API_KEY;
    if (!apiKey) {
      return "⚠️ OpenRouter API key belum diset. Tambah REACT_APP_OPENROUTER_API_KEY di .env frontend, ya!";
    }
    const model = process.env.REACT_APP_OPENROUTER_MODEL || 'arcee-ai/trinity-large-preview:free';

    let round = 0;
    let finalResponse = '';
    while (round < 5) {
      const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': window.location.origin,
          'X-Title': 'BMBB Monitor AI Assistant'
        },
        body: JSON.stringify({
          model,
          messages: messages.map(toAPIMessage),
          tools: TOOLS_SCHEMA,
          tool_choice: 'auto'
        }),
        signal: controller.signal
      });

      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`OpenRouter error: ${resp.status} – ${err}`);
      }

      const data = await resp.json();
      const choice = data.choices[0];
      const msg = choice.message;

      messages.push(msg);

      if (msg.tool_calls && msg.tool_calls.length > 0) {
        const updatedMessages = await processToolCalls(msg.tool_calls, messages);
        messages.length = 0;
        updatedMessages.forEach(m => messages.push(m));
        round++;
        continue;
      } else {
        finalResponse = msg.content || '(Tidak ada respon)';
        break;
      }
    }

    return finalResponse;
  })();

  return { controller, promise };
}
