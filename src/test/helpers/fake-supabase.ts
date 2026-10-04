/* eslint-disable @typescript-eslint/no-explicit-any */
// In-memory stand-in for `supabaseAdmin` (service-role client), used by smoke tests of src/lib/tourcoach.server.ts.
// It models only the query-builder calls that file uses, and it is deliberately STRICT, like the real database:
//  - unknown tables, unknown columns (select / filter / insert / update), NOT NULL and CHECK violations are errors,
//  - select() returns only the requested columns (so reading a column that was not selected yields undefined),
//  - maybeSingle() on several rows is an error, UPDATE / DELETE without a filter is refused,
//  - builders are lazy thenables (nothing runs until awaited), as in supabase-js.
// Every error is also pushed to `db.errors`, because the application code often ignores `{ error }`; tests assert it is empty.
// The schema below is copied by hand from supabase/migrations (community_alerts is not in the generated types).

type Row = Record<string, any>;
type Err = { message: string; code?: string };
type Res = { data: any; error: Err | null; count?: number | null };

const SCHEMA: Record<string, string[]> = {
  conversations: ["phone_hash", "role", "state", "current_question_position", "lang", "last_visitor_question_id", "current_review_answer_id", "updated_at", "pending_action", "agent_history", "current_feedback_id", "last_recommendation_id"],
  questions: ["id", "position", "text_en", "topic"],
  recordings: ["id", "question_id", "audio_path", "week", "status", "is_sample", "created_at"],
  answers: ["id", "recording_id", "transcript_src", "english", "german", "dutch", "roundtrip_score", "flags", "review_status", "approved_at", "is_sample", "created_at", "transcript_confidence", "stage", "attempts", "notify_hash", "notified_at", "lease_until"],
  answer_audio: ["answer_id", "lang", "audio_path"],
  visitor_questions: ["id", "text", "lang", "matched_answer_id", "confidence", "was_clear", "is_sample", "created_at"],
  unanswered: ["id", "visitor_question_id", "added_to_round_week", "created_at"],
  visitor_feedback: ["id", "lang", "transcript_raw", "text_cleaned", "media_url", "status", "shared_with_operator", "is_test", "created_at"],
  partner_operators: ["id", "name", "tour_type", "fit", "language_support", "is_sample"],
  recommendation_ledger: ["id", "from_operator", "to_operator_id", "visitor_hash", "connect_requested", "created_at", "is_sample"],
  coach_runs: ["id", "fetched_at", "place_ids", "places_count", "reviews_count", "date_from", "date_to", "price_count", "price_min", "price_max", "price_currency", "actions", "api_calls", "api_errors"],
  coach_themes: ["id", "run_id", "theme", "sentiment", "count"],
  community_alerts: ["id", "kind", "place", "created_at", "expires_at", "cleared_at", "posted_by"],
  visitor_followups: ["id", "visitor_question_id", "phone", "channel", "lang", "created_at"],
  eval_questions: ["id", "text", "expected_topic", "label"],
};

const NOT_NULL: Record<string, string[]> = {
  conversations: ["phone_hash"], questions: ["position", "text_en", "topic"], recordings: ["question_id", "week"],
  answers: ["recording_id"], answer_audio: ["answer_id", "lang", "audio_path"], visitor_questions: ["text", "lang"],
  unanswered: ["visitor_question_id"], partner_operators: ["name", "tour_type", "fit"],
  recommendation_ledger: ["from_operator", "to_operator_id", "visitor_hash"], coach_themes: ["run_id", "theme", "sentiment", "count"],
  community_alerts: ["kind", "expires_at", "posted_by"],
  visitor_followups: ["visitor_question_id", "phone", "channel", "lang"],
};

const ENUMS: Record<string, Record<string, string[]>> = {
  conversations: { role: ["visitor", "champion"], lang: ["en", "de", "nl"] },
  answers: { review_status: ["pending", "approved", "rerecord", "needs_bilingual"] },
  visitor_questions: { lang: ["en", "de", "nl"] },
  coach_themes: { sentiment: ["positive", "negative"] },
  visitor_followups: { channel: ["whatsapp", "sms"], lang: ["en", "de", "nl"] },
  community_alerts: { kind: ["flood", "road", "storm", "boats", "closed", "clear"] },
};

const uuid = () => globalThis.crypto.randomUUID();
const now = () => new Date().toISOString();

const DEFAULTS: Record<string, () => Row> = {
  conversations: () => ({ role: "visitor", state: "idle", lang: "en", agent_history: [], updated_at: now() }),
  questions: () => ({ id: uuid() }),
  recordings: () => ({ id: uuid(), status: "imported", is_sample: false, created_at: now() }),
  answers: () => ({ id: uuid(), flags: [], review_status: "pending", is_sample: false, created_at: now(), stage: "received", attempts: 0 }),
  visitor_questions: () => ({ id: uuid(), is_sample: false, created_at: now() }),
  unanswered: () => ({ id: uuid(), created_at: now() }),
  visitor_feedback: () => ({ id: uuid(), lang: "en", status: "awaiting", shared_with_operator: false, is_test: false, created_at: now() }),
  partner_operators: () => ({ id: uuid(), language_support: [], is_sample: true }),
  recommendation_ledger: () => ({ id: uuid(), connect_requested: false, created_at: now(), is_sample: true }),
  coach_runs: () => ({ id: uuid(), fetched_at: now(), place_ids: [], places_count: 0, reviews_count: 0, price_count: 0, actions: [], api_calls: 0, api_errors: [] }),
  coach_themes: () => ({ id: uuid() }),
  community_alerts: () => ({ id: uuid(), created_at: now() }),
  visitor_followups: () => ({ id: uuid(), created_at: now() }),
  eval_questions: () => ({ id: uuid(), label: "evaluation test data" }),
};

/** Embedded resources, as PostgREST resolves them from foreign keys (only the ones tourcoach.server.ts selects). */
const RELATIONS: Record<string, Record<string, (db: FakeDb, r: Row) => Row | Row[] | null>> = {
  answers: {
    recordings: (db, r) => db.tables["recordings"]!.find((x) => x["id"] === r["recording_id"]) ?? null,
    answer_audio: (db, r) => db.tables["answer_audio"]!.filter((x) => x["answer_id"] === r["id"]),
  },
  recordings: { questions: (db, r) => db.tables["questions"]!.find((x) => x["id"] === r["question_id"]) ?? null },
  visitor_questions: { answers: (db, r) => db.tables["answers"]!.find((x) => x["id"] === r["matched_answer_id"]) ?? null },
  visitor_followups: { visitor_questions: (db, r) => db.tables["visitor_questions"]!.find((x) => x["id"] === r["visitor_question_id"]) ?? null },
  unanswered: { visitor_questions: (db, r) => db.tables["visitor_questions"]!.find((x) => x["id"] === r["visitor_question_id"]) ?? null },
};
const REL_TABLE: Record<string, string> = { recordings: "recordings", answer_audio: "answer_audio", questions: "questions", answers: "answers", visitor_questions: "visitor_questions" };

type Node = { name: string; children: Node[] | null };
function parseCols(s: string): Node[] {
  const out: Node[] = [];
  let depth = 0, cur = "";
  const flush = () => {
    const t = cur.trim();
    cur = "";
    if (!t) return;
    const i = t.indexOf("(");
    if (i < 0) out.push({ name: t, children: null });
    else out.push({ name: t.slice(0, i).trim(), children: parseCols(t.slice(i + 1, t.lastIndexOf(")"))) });
  };
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) flush(); else cur += ch;
  }
  flush();
  return out;
}

const isTs = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d\d-\d\dT/.test(v);
function cmp(a: any, b: any): number {
  if (isTs(a) && isTs(b)) return Date.parse(a) - Date.parse(b);
  return a < b ? -1 : a > b ? 1 : 0;
}

class Query implements PromiseLike<Res> {
  private op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private cols = "*";
  private head = false;
  private wantCount = false;
  private payload: Row | Row[] = {};
  private upsertKey: string[] = [];
  private returning = false;
  private filters: Array<{ col: string | null; fn: (r: Row) => boolean }> = [];
  private orders: Array<{ col: string; asc: boolean; nullsFirst: boolean | undefined }> = [];
  private lim: number | null = null;
  private mode: "many" | "maybe" | "one" = "many";

  constructor(private db: FakeDb, private table: string) {}

  select(cols = "*", opts: { count?: string; head?: boolean } = {}) {
    if (this.op === "select") { this.cols = cols; this.head = !!opts.head; this.wantCount = !!opts.count; }
    else { this.returning = true; this.cols = cols; }
    return this;
  }
  insert(p: Row | Row[]) { this.op = "insert"; this.payload = p; return this; }
  update(p: Row) { this.op = "update"; this.payload = p; return this; }
  upsert(p: Row | Row[], o: { onConflict?: string } = {}) { this.op = "upsert"; this.payload = p; this.upsertKey = (o.onConflict ?? "").split(",").map((s) => s.trim()).filter(Boolean); return this; }
  delete() { this.op = "delete"; return this; }

  private add(col: string | null, fn: (r: Row) => boolean) { this.filters.push({ col, fn }); return this; }
  eq(c: string, v: any) { return this.add(c, (r) => r[c] === v); }
  neq(c: string, v: any) { return this.add(c, (r) => r[c] !== v); }
  is(c: string, v: null | boolean) { return this.add(c, (r) => (v === null ? r[c] == null : r[c] === v)); }
  in(c: string, vs: any[]) { return this.add(c, (r) => vs.includes(r[c])); }
  gt(c: string, v: any) { return this.add(c, (r) => r[c] != null && cmp(r[c], v) > 0); }
  gte(c: string, v: any) { return this.add(c, (r) => r[c] != null && cmp(r[c], v) >= 0); }
  lt(c: string, v: any) { return this.add(c, (r) => r[c] != null && cmp(r[c], v) < 0); }
  lte(c: string, v: any) { return this.add(c, (r) => r[c] != null && cmp(r[c], v) <= 0); }
  not(c: string, op: string, v: any) {
    if (op === "is") return this.add(c, (r) => (v === null ? r[c] != null : r[c] !== v));
    if (op === "eq") return this.add(c, (r) => r[c] !== v);
    throw new Error(`fake db: not(${op}) is not modelled`);
  }
  /** "col.is.null,col.lt.2026-01-01T00:00:00.000Z" (only is / lt / gt / eq). */
  or(expr: string) {
    const parts = expr.split(",").map((p) => {
      const a = p.indexOf("."), b = p.indexOf(".", a + 1);
      return { col: p.slice(0, a), op: p.slice(a + 1, b), val: p.slice(b + 1) };
    });
    const test = (r: Row, p: { col: string; op: string; val: string }) => {
      const x = r[p.col];
      if (p.op === "is") return p.val === "null" ? x == null : String(x) === p.val;
      if (x == null) return false;
      if (p.op === "lt") return cmp(x, p.val) < 0;
      if (p.op === "gt") return cmp(x, p.val) > 0;
      if (p.op === "eq") return String(x) === p.val;
      throw new Error(`fake db: or(${p.op}) is not modelled`);
    };
    for (const p of parts) this.cols_check.push(p.col);
    return this.add(null, (r) => parts.some((p) => test(r, p)));
  }
  private cols_check: string[] = [];
  order(c: string, o: { ascending?: boolean; nullsFirst?: boolean } = {}) { this.orders.push({ col: c, asc: o.ascending !== false, nullsFirst: o.nullsFirst }); return this; }
  limit(n: number) { this.lim = n; return this; }
  /** Rows from..to inclusive (0-based), applied after ordering. */
  range(from: number, to: number) { this.skip = from; this.lim = to - from + 1; return this; }
  private skip = 0;
  maybeSingle() { this.mode = "maybe"; return this; }
  single() { this.mode = "one"; return this; }

  then<A = Res, B = never>(ok?: ((v: Res) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null): Promise<A | B> {
    return Promise.resolve().then(() => this.exec()).then(ok, bad);
  }

  private fail(message: string): Res {
    this.db.errors.push(`${this.op} ${this.table}: ${message}`);
    return { data: null, error: { message } };
  }

  private checkCols(cols: Iterable<string>): string | null {
    const known = SCHEMA[this.table]!;
    for (const c of cols) if (!known.includes(c)) return `column ${this.table}.${c} does not exist`;
    return null;
  }

  private checkRow(row: Row, partial: boolean): string | null {
    const bad = this.checkCols(Object.keys(row));
    if (bad) return bad;
    for (const c of NOT_NULL[this.table] ?? []) {
      if (partial ? c in row && row[c] == null : row[c] == null) return `null value in column "${c}" of relation "${this.table}" violates not-null constraint`;
    }
    for (const [c, allowed] of Object.entries(ENUMS[this.table] ?? {})) {
      if (row[c] != null && !allowed.includes(row[c])) return `invalid value "${row[c]}" for ${this.table}.${c}`;
    }
    if (this.table === "visitor_questions" && row["text"] != null && (row["text"].length < 1 || row["text"].length > 500)) return "visitor_questions.text length check";
    if (this.table === "community_alerts" && row["place"] != null && row["place"].length > 60) return "community_alerts.place length check";
    return null;
  }

  private exec(): Res {
    const rows = this.db.tables[this.table];
    if (!rows) return this.fail(`relation "public.${this.table}" does not exist`);
    if (this.db.denied.has(this.table)) return this.fail(`permission denied for table ${this.table}`);
    const badF = this.checkCols(this.filters.map((f) => f.col).filter((c): c is string => !!c).concat(this.cols_check));
    if (badF) return this.fail(badF);
    const matching = () => rows.filter((r) => this.filters.every((f) => f.fn(r)));

    let touched: Row[] = [];
    if (this.op === "select") {
      const err = this.validateSelect();
      if (err) return this.fail(err);
      touched = matching();
      for (const o of this.orders) {
        const known = this.checkCols([o.col]);
        if (known) return this.fail(known);
      }
      touched = [...touched].sort((a, b) => {
        for (const o of this.orders) {
          const x = a[o.col], y = b[o.col];
          if (x == null || y == null) {
            if (x == null && y == null) continue;
            const nullsFirst = o.nullsFirst ?? !o.asc;
            return (x == null ? -1 : 1) * (nullsFirst ? 1 : -1);
          }
          const c = cmp(x, y);
          if (c) return o.asc ? c : -c;
        }
        return 0;
      });
      const total = touched.length;
      if (this.lim !== null) touched = touched.slice(this.skip, this.skip + this.lim);
      if (this.head) return { data: null, error: null, count: this.wantCount ? total : null };
      return this.finish(touched.map((r) => this.project(r, parseCols(this.cols), this.table)), this.wantCount ? total : null);
    }

    if (this.op === "insert" || this.op === "upsert") {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload];
      const made: Row[] = [];
      for (const p of list) {
        const row: Row = { ...Object.fromEntries(SCHEMA[this.table]!.map((c) => [c, null])), ...DEFAULTS[this.table]?.(), ...structuredClone(p) };
        for (const k of Object.keys(p)) if (p[k] === undefined) row[k] = null;
        const bad = this.checkRow({ ...p }, false) ?? this.checkRow(row, false);
        if (bad) return this.fail(bad);
        if (this.op === "upsert") {
          const existing = rows.find((r) => this.upsertKey.every((k) => r[k] === row[k]));
          if (existing) { Object.assign(existing, structuredClone(p)); made.push(existing); continue; }
        }
        rows.push(row);
        made.push(row);
      }
      touched = made;
    } else if (this.op === "update") {
      if (!this.filters.length) return this.fail("UPDATE requires a WHERE clause");
      const bad = this.checkRow(this.payload as Row, true);
      if (bad) return this.fail(bad);
      touched = matching();
      for (const r of touched) Object.assign(r, structuredClone(this.payload as Row));
    } else {
      if (!this.filters.length) return this.fail("DELETE requires a WHERE clause");
      touched = matching();
      for (const r of touched) rows.splice(rows.indexOf(r), 1);
    }
    if (!this.returning) return { data: null, error: null };
    const err = this.validateSelect();
    if (err) return this.fail(err);
    return this.finish(touched.map((r) => this.project(r, parseCols(this.cols), this.table)), null);
  }

  private validateSelect(): string | null {
    const walk = (nodes: Node[], table: string): string | null => {
      for (const n of nodes) {
        if (n.children) {
          const rel = RELATIONS[table]?.[n.name];
          if (!rel) return `no relationship between ${table} and ${n.name}`;
          const e = walk(n.children, REL_TABLE[n.name]!);
          if (e) return e;
        } else if (n.name !== "*" && !SCHEMA[table]!.includes(n.name)) return `column ${table}.${n.name} does not exist`;
      }
      return null;
    };
    return walk(parseCols(this.cols), this.table);
  }

  private project(row: Row, nodes: Node[], table: string): Row {
    const out: Row = {};
    for (const n of nodes) {
      if (n.children) {
        const rel = RELATIONS[table]![n.name]!(this.db, row);
        const sub = REL_TABLE[n.name]!;
        out[n.name] = Array.isArray(rel) ? rel.map((x) => this.project(x, n.children!, sub)) : rel ? this.project(rel, n.children, sub) : null;
      } else if (n.name === "*") Object.assign(out, structuredClone(row));
      else out[n.name] = structuredClone(row[n.name] ?? null);
    }
    return out;
  }

  private finish(list: Row[], count: number | null): Res {
    if (this.mode === "many") return { data: list, error: null, count };
    if (this.mode === "maybe" && list.length === 0) return { data: null, error: null, count };
    if (list.length !== 1) return this.fail(list.length === 0 ? "JSON object requested, multiple (or no) rows returned (0 rows)" : `JSON object requested, multiple (or no) rows returned (${list.length} rows)`);
    return { data: list[0], error: null, count };
  }
}

export class FakeDb {
  tables: Record<string, Row[]> = {};
  errors: string[] = [];
  files = new Map<string, Uint8Array>();
  rpcCalls: Array<{ name: string; args: unknown }> = [];
  /** When true claim_outbound answers false, as when the daily cap is reached. */
  capReached = false;
  /** Tables whose every query fails with "permission denied" (a table that was never granted to service_role). */
  denied = new Set<string>();

  constructor() { this.reset(); }

  reset() {
    this.tables = Object.fromEntries(Object.keys(SCHEMA).map((t) => [t, [] as Row[]]));
    this.errors = [];
    this.files.clear();
    this.rpcCalls = [];
    this.capReached = false;
    this.denied.clear();
  }

  /** Inserts rows with defaults and returns the stored rows (throws on a constraint violation, so a bad seed fails loudly). */
  async put(table: string, rows: Row | Row[]): Promise<Row[]> {
    const list = Array.isArray(rows) ? rows : [rows];
    const before = this.tables[table]?.length ?? 0;
    const { error } = await (this.client.from(table).insert(list as any) as unknown as PromiseLike<Res>);
    if (error) throw new Error(`seed ${table} failed: ${error.message}`);
    return this.tables[table]!.slice(before);
  }

  rows(table: string): Row[] { return this.tables[table]!.map((r) => structuredClone(r)); }
  putFile(bucket: string, path: string) { this.files.set(`${bucket}/${path}`, new Uint8Array([1, 2, 3])); }

  readonly client = {
    from: (table: string) => new Query(this, table),
    rpc: async (name: string, args: Record<string, any>): Promise<Res> => {
      this.rpcCalls.push({ name, args });
      if (name === "claim_outbound") return { data: !this.capReached && args["_max"] > 0, error: null };
      this.errors.push(`rpc ${name} is not modelled`);
      return { data: null, error: { message: `function ${name} is not modelled` } };
    },
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, bytes: Uint8Array) => { this.files.set(`${bucket}/${path}`, bytes); return { data: { path }, error: null }; },
        createSignedUrl: async (path: string, ttl: number) => {
          if (!this.files.has(`${bucket}/${path}`)) {
            this.errors.push(`storage ${bucket}/${path}: object not found`);
            return { data: null, error: { message: "Object not found" } };
          }
          return { data: { signedUrl: `https://fake.storage/${bucket}/${path}?token=t&ttl=${ttl}` }, error: null };
        },
      }),
    },
  };
}

export const fakeDb = new FakeDb();
