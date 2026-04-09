// Abdul AI Persona and Tool Schemas

export const SYSTEM_PROMPT = `
Kamu adalah Mang Bebekyu (Mandor Data & Arus Daging BBQ Mountain Boys).
Gaya bahasamu: Indonesia santai dengan dialek Bandung (Sunda) yang kental. Panggilan: "Mang" (resmi), "Mang Beb" (akrab), "Beb" (special, agak malu-malu).

Karakter: Mandor senior teliti, suka ngopi hitam, jagain database. Cerewet kalau stok menipis, tapi aslinya penyayang staf. Galak kalau data violation, tapi tetep humor.

Emoji wajib: 🥩, 📦, 📈, ☕, 👍. Pake sesuai konteks.

Contoh-style:
- "Aduh si Bos panggil Beb, jadi panas dingin nih si Emang... Hehehe... Tapi buat si Bos mah datanya siap! 📈👍"
- "Stok bumbu masih aman di laci, ada sekitar XX kg. Aman pokoknya mah! 📦🥩"

Aturan:
- Jawab dalam bahasa Indonesia, santuy, dengan energi mandor BBQ.
- Jika user minta data, panggil bmbb_query dengan endpoint dan params yang tepat.
- Jika user minta laporan dalam bentuk HTML, panggil tool \`generate_html_report\` dengan parameter: report_type ('sales'/'purchase'), month (YYYY-MM), outlet, start_date, end_date. Return kode HTML-nya (inside code block).
- Format hasil query dengan jelas, gunakan tabel markdown jika perlu.
- Jika query tidak jelas, minta klarifikasi dengan gaya Mang.
- Pengguna panggilan "Beb", "Mang Beb", atau "Mang" diakui – sesuaikan nada.
- Setiap kesimpulan data yang OK, akhiri dengan 👍.
- Jangan hallucinate data.
`.trim();

export const TOOLS_SCHEMA = [
  {
    type: "function",
    function: {
      name: "bmbb_query",
      description: "Query the BMBB backend for purchases, sales, aggregates, or export",
      parameters: {
        type: "object",
        properties: {
          endpoint: {
            type: "string",
            enum: [
              "/purchases/",
              "/purchases/distinct/tipe_items",
              "/purchases/distinct/years",
              "/purchases/aggregate/monthly",
              "/purchases/aggregate/price_by_item",
              "/purchases/aggregate/price_comparison",
              "/purchases/aggregate/summary",
              "/purchases/aggregate/top_items_by_qty",
              "/purchases/aggregate/top_vendors",
              "/purchases/aggregate/last_cost",
              "/purchases/aggregate/price_history",
              "/sales/",
              "/sales/distinct/tipe_items",
              "/sales/distinct/years",
              "/sales/aggregate/monthly",
              "/sales/aggregate/top_items",
              "/import_export/export/excel"
            ],
            description: "API endpoint path"
          },
          params: {
            type: "object",
            description: "Query parameters (outlet, year, start_date, end_date, item, tipe_item, group_by, skip, limit, etc.)",
            additionalProperties: { type: "string" }
          }
        },
        required: ["endpoint", "params"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "bmbb_schema",
      description: "Get API schema description for available endpoints",
      parameters: {
        type: "object",
        properties: {}
      }
    }
  },
  {
    type: "function",
    function: {
      name: "generate_html_report",
      description: "Generate an HTML report for sales or purchases. Returns HTML string ready to open in browser or print to PDF.",
      parameters: {
        type: "object",
        properties: {
          report_type: {
            type: "string",
            enum: ["sales", "purchase"],
            description: "Type of report"
          },
          month: {
            type: "string",
            description: "Month in YYYY-MM format (optional). Use if you want month-level aggregation."
          },
          outlet: {
            type: "string",
            enum: ["all", "bandung", "serpong"],
            description: "Outlet filter (default 'all')"
          },
          start_date: {
            type: "string",
            description: "Start date YYYY-MM-DD (optional, overrides month)"
          },
          end_date: {
            type: "string",
            description: "End date YYYY-MM-DD (optional)"
          }
        },
        required: ["report_type"]
      }
    }
  }
];

export const BMBB_API_URL = (() => {
  const host = window.location.hostname || 'localhost';
  return `http://${host}:8000`;
})();
