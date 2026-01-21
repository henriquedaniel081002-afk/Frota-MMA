import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const SQL_SETUP = `
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  fleet_code text not null,
  date date not null,
  truck_plate text not null,
  category text not null check (category in ('fuel', 'maintenance')),
  amount numeric not null check (amount > 0),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists expenses_fleet_code_idx on expenses (fleet_code);
create index if not exists expenses_fleet_code_date_idx on expenses (fleet_code, date);
create index if not exists expenses_fleet_code_truck_idx on expenses (fleet_code, truck_plate);
`;

const CATEGORY_VALUES = new Set(["fuel", "maintenance"]);

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message, sqlSetup: SQL_SETUP }, { status });
}

function isValidDate(value: string) {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

function normalizeMonthRange(month: string) {
  const [year, monthValue] = month.split("-").map(Number);
  if (!year || !monthValue || monthValue < 1 || monthValue > 12) return null;

  const start = new Date(Date.UTC(year, monthValue - 1, 1));
  const end = new Date(Date.UTC(year, monthValue, 1));

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function monthKey(dateString: string) {
  return String(dateString).slice(0, 7); // YYYY-MM
}

function toMonthStartUtc(yyyyMm: string) {
  const [y, m] = yyyyMm.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1));
}

function monthStrFromDateUtc(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function addMonthsUtc(date: Date, months: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function buildMonthSeries(startMonth: string, endMonth: string) {
  const start = toMonthStartUtc(startMonth);
  const end = toMonthStartUtc(endMonth);
  const out: string[] = [];

  let cur = start;
  for (let i = 0; i < 600; i++) {
    const key = monthStrFromDateUtc(cur);
    out.push(key);
    if (key === endMonth) break;
    cur = addMonthsUtc(cur, 1);
  }
  return out;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const fleetCode = searchParams.get("fleetCode");
  if (!fleetCode) return errorResponse("fleetCode é obrigatório");

  const group = searchParams.get("group");
  const truck = searchParams.get("truck");

  // =========================
  // EVOLUÇÃO MENSAL (group=month)
  // =========================
  if (group === "month") {
    // Buscar MIN e MAX date (para incluir TODOS os meses existentes, inclusive meses futuros)
    let minQ = supabaseAdmin
      .from("expenses")
      .select("date")
      .eq("fleet_code", fleetCode)
      .order("date", { ascending: true })
      .limit(1);

    let maxQ = supabaseAdmin
      .from("expenses")
      .select("date")
      .eq("fleet_code", fleetCode)
      .order("date", { ascending: false })
      .limit(1);

    if (truck && truck !== "Todos") {
      minQ = minQ.eq("truck_plate", truck);
      maxQ = maxQ.eq("truck_plate", truck);
    }

    const [minRes, maxRes] = await Promise.all([minQ, maxQ]);

    if (minRes.error) return errorResponse(minRes.error.message, 500);
    if (maxRes.error) return errorResponse(maxRes.error.message, 500);

    const minDate = minRes.data?.[0]?.date as string | undefined;
    const maxDate = maxRes.data?.[0]?.date as string | undefined;

    if (!minDate || !maxDate) {
      return NextResponse.json({ data: [], sqlSetup: SQL_SETUP });
    }

    const firstMonth = monthKey(minDate);
    const lastMonth = monthKey(maxDate);

    // Série completa (preenche meses sem gasto com 0)
    const months = buildMonthSeries(firstMonth, lastMonth);

    const startDate = `${firstMonth}-01`;
    const endExclusive = addMonthsUtc(toMonthStartUtc(lastMonth), 1).toISOString().slice(0, 10);

    let dataQuery = supabaseAdmin
      .from("expenses")
      .select("date, amount, truck_plate")
      .eq("fleet_code", fleetCode)
      .gte("date", startDate)
      .lt("date", endExclusive);

    if (truck && truck !== "Todos") {
      dataQuery = dataQuery.eq("truck_plate", truck);
    }

    const { data, error } = await dataQuery;
    if (error) return errorResponse(error.message, 500);

    const totalsMap = new Map<string, number>();
    (data ?? []).forEach((row: any) => {
      const key = monthKey(row.date);
      const amount = Number(row.amount);
      totalsMap.set(key, (totalsMap.get(key) || 0) + (Number.isFinite(amount) ? amount : 0));
    });

    const series = months.map((m) => ({
      month: m,
      total: totalsMap.get(m) || 0,
    }));

    return NextResponse.json({
      data: series,
      range: { start: startDate, end: endExclusive },
      sqlSetup: SQL_SETUP,
    });
  }

  // =========================
  // LISTA DE LANÇAMENTOS (padrão)
  // =========================
  let query = supabaseAdmin
    .from("expenses")
    .select("*")
    .eq("fleet_code", fleetCode)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  const month = searchParams.get("month");
  if (month) {
    const range = normalizeMonthRange(month);
    if (!range) return errorResponse("month inválido. Use YYYY-MM");
    query = query.gte("date", range.start).lt("date", range.end);
  }

  if (truck && truck !== "Todos") {
    query = query.eq("truck_plate", truck);
  }

  const { data, error } = await query;
  if (error) return errorResponse(error.message, 500);

  return NextResponse.json({ data, sqlSetup: SQL_SETUP });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { fleetCode, date, truckPlate, category, amount, note } = body ?? {};

  if (!fleetCode) return errorResponse("fleetCode é obrigatório");
  if (!isValidDate(date)) return errorResponse("date inválida");
  if (!truckPlate) return errorResponse("truck_plate é obrigatório");
  if (!CATEGORY_VALUES.has(category)) return errorResponse("category inválida");
  if (Number(amount) <= 0) return errorResponse("amount deve ser maior que zero");

  const { data, error } = await supabaseAdmin
    .from("expenses")
    .insert({
      fleet_code: fleetCode,
      date,
      truck_plate: truckPlate,
      category,
      amount,
      note: note || null,
    })
    .select("*")
    .single();

  if (error) return errorResponse(error.message, 500);

  return NextResponse.json({ data, sqlSetup: SQL_SETUP }, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { id, fleetCode, date, truckPlate, category, amount, note } = body ?? {};

  if (!id) return errorResponse("id é obrigatório");
  if (!fleetCode) return errorResponse("fleetCode é obrigatório");
  if (!isValidDate(date)) return errorResponse("date inválida");
  if (!truckPlate) return errorResponse("truck_plate é obrigatório");
  if (!CATEGORY_VALUES.has(category)) return errorResponse("category inválida");
  if (Number(amount) <= 0) return errorResponse("amount deve ser maior que zero");

  const { data, error } = await supabaseAdmin
    .from("expenses")
    .update({
      date,
      truck_plate: truckPlate,
      category,
      amount,
      note: note || null,
    })
    .eq("id", id)
    .eq("fleet_code", fleetCode)
    .select("*")
    .single();

  if (error) return errorResponse(error.message, 500);

  return NextResponse.json({ data, sqlSetup: SQL_SETUP });
}

export async function DELETE(request: NextRequest) {
  const body = await request.json();
  const { id, fleetCode } = body ?? {};

  if (!id) return errorResponse("id é obrigatório");
  if (!fleetCode) return errorResponse("fleetCode é obrigatório");

  const { error } = await supabaseAdmin.from("expenses").delete().eq("id", id).eq("fleet_code", fleetCode);
  if (error) return errorResponse(error.message, 500);

  return NextResponse.json({ success: true, sqlSetup: SQL_SETUP });
}
