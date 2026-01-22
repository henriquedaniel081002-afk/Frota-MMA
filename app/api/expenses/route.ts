import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { Database } from "@/lib/database.types";

const SQL_SETUP = `
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  fleet_code text not null,
  date date not null,
  truck_plate text not null,
  km numeric not null default 0 check (km >= 0),
  category text not null check (category in ('fuel', 'maintenance')),
  amount numeric not null check (amount > 0),
  liters numeric,
  invoice_number text,
  note text,
  created_at timestamptz not null default now()
);

alter table if exists expenses add column if not exists liters numeric;
alter table if exists expenses add column if not exists invoice_number text;

alter table if exists expenses add column if not exists km numeric;
alter table if exists expenses alter column km set default 0;
update expenses set km = 0 where km is null;
alter table if exists expenses alter column km set not null;

create index if not exists expenses_fleet_code_idx on expenses (fleet_code);
create index if not exists expenses_fleet_code_date_idx on expenses (fleet_code, date);
create index if not exists expenses_fleet_code_truck_idx on expenses (fleet_code, truck_plate);

alter table if exists expenses enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'expenses' and policyname = 'select (authenticated)'
  ) then
    create policy "select (authenticated)" on expenses
      for select
      to authenticated
      using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'expenses' and policyname = 'insert (authenticated)'
  ) then
    create policy "insert (authenticated)" on expenses
      for insert
      to authenticated
      with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'expenses' and policyname = 'update (authenticated)'
  ) then
    create policy "update (authenticated)" on expenses
      for update
      to authenticated
      using (true)
      with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'expenses' and policyname = 'delete (authenticated)'
  ) then
    create policy "delete (authenticated)" on expenses
      for delete
      to authenticated
      using (true);
  end if;
end $$;
`;

const CATEGORY_VALUES = new Set(["fuel", "maintenance"]);

type ExpenseInsert = Database["public"]["Tables"]["expenses"]["Insert"];
type ExpenseUpdate = Database["public"]["Tables"]["expenses"]["Update"];
type MinMaxRow = Pick<Database["public"]["Tables"]["expenses"]["Row"], "date">;

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message, sqlSetup: SQL_SETUP }, { status });
}

function isValidDate(dateString: any) {
  if (typeof dateString !== "string") return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(dateString);
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
  const d = new Date(date.getTime());
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

export async function GET(request: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  const url = new URL(request.url);

  const fleetCode = url.searchParams.get("fleetCode");
  if (!fleetCode) return errorResponse("fleetCode é obrigatório");

  const month = url.searchParams.get("month");
  const mode = url.searchParams.get("mode") || "ALL";

  const monthRange = month ? normalizeMonthRange(month) : null;

  const baseQuery = supabaseAdmin
    .from("expenses")
    .select("*")
    .eq("fleet_code", fleetCode);

  const minQBase = supabaseAdmin.from("expenses").select("date").eq("fleet_code", fleetCode).order("date", { ascending: true }).limit(1);
  const maxQBase = supabaseAdmin.from("expenses").select("date").eq("fleet_code", fleetCode).order("date", { ascending: false }).limit(1);

  if (mode === "MONTH" && monthRange) {
    baseQuery.gte("date", monthRange.start).lt("date", monthRange.end);
    minQBase.gte("date", monthRange.start).lt("date", monthRange.end);
    maxQBase.gte("date", monthRange.start).lt("date", monthRange.end);
  }

  const expensesQ = baseQuery.order("date", { ascending: false }).order("created_at", { ascending: false });
  const minQ = minQBase.returns<MinMaxRow[]>();
  const maxQ = maxQBase.returns<MinMaxRow[]>();

  const [expensesRes, minRes, maxRes] = await Promise.all([expensesQ, minQ, maxQ]);

  if (expensesRes.error) return errorResponse(expensesRes.error.message, 500);
  if (minRes.error) return errorResponse(minRes.error.message, 500);
  if (maxRes.error) return errorResponse(maxRes.error.message, 500);

  const minDate = minRes.data?.[0]?.date;
  const maxDate = maxRes.data?.[0]?.date;

  if (!minDate || !maxDate) {
    return NextResponse.json({ data: [], sqlSetup: SQL_SETUP });
  }

  const startMonth = monthKey(minDate);
  const endMonth = monthKey(maxDate);

  const months: string[] = [];
  let cur = toMonthStartUtc(startMonth);
  const end = toMonthStartUtc(endMonth);

  while (cur.getTime() <= end.getTime()) {
    months.push(monthStrFromDateUtc(cur));
    cur = addMonthsUtc(cur, 1);
  }

  return NextResponse.json({ data: expensesRes.data || [], months, sqlSetup: SQL_SETUP });
}

export async function POST(request: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();

  const body = await request.json();
  const { fleetCode, date, truckPlate, km, category, amount, liters, invoiceNumber, note } = body ?? {};

  if (!fleetCode) return errorResponse("fleetCode é obrigatório");
  if (!isValidDate(date)) return errorResponse("date inválida");
  if (!truckPlate) return errorResponse("truck_plate é obrigatório");

  const kmValue = km === undefined || km === null || km === "" ? null : Number(String(km).replace(",", "."));
  if (kmValue === null || !Number.isFinite(kmValue) || kmValue < 0) {
    return errorResponse("km deve ser um número maior ou igual a zero");
  }

  if (!CATEGORY_VALUES.has(category)) return errorResponse("category inválida");
  if (Number(amount) <= 0) return errorResponse("amount deve ser maior que zero");

  const litersValue =
    liters === undefined || liters === null || liters === "" ? null : Number(String(liters).replace(",", "."));

  if (litersValue !== null && (!Number.isFinite(litersValue) || litersValue <= 0)) {
    return errorResponse("liters deve ser maior que zero");
  }

  const invoiceNumberValue = invoiceNumber ? String(invoiceNumber).trim() : null;

  const insertPayload: ExpenseInsert = {
    fleet_code: fleetCode,
    date,
    truck_plate: truckPlate,
    km: kmValue,
    category,
    amount,
    liters: category === "fuel" ? litersValue : null,
    invoice_number: invoiceNumberValue,
    note: note || null,
  };

  const { data, error } = await supabaseAdmin
    .from("expenses")
    .insert(insertPayload)
    .select("*")
    .single();

  if (error) return errorResponse(error.message, 500);

  return NextResponse.json({ data, sqlSetup: SQL_SETUP }, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();

  const body = await request.json();
  const { id, fleetCode, date, truckPlate, km, category, amount, liters, invoiceNumber, note } = body ?? {};

  if (!id) return errorResponse("id é obrigatório");
  if (!fleetCode) return errorResponse("fleetCode é obrigatório");
  if (!isValidDate(date)) return errorResponse("date inválida");
  if (!truckPlate) return errorResponse("truck_plate é obrigatório");

  const kmValue = km === undefined || km === null || km === "" ? null : Number(String(km).replace(",", "."));
  if (kmValue === null || !Number.isFinite(kmValue) || kmValue < 0) {
    return errorResponse("km deve ser um número maior ou igual a zero");
  }

  if (!CATEGORY_VALUES.has(category)) return errorResponse("category inválida");
  if (Number(amount) <= 0) return errorResponse("amount deve ser maior que zero");

  const litersValue =
    liters === undefined || liters === null || liters === "" ? null : Number(String(liters).replace(",", "."));

  if (litersValue !== null && (!Number.isFinite(litersValue) || litersValue <= 0)) {
    return errorResponse("liters deve ser maior que zero");
  }

  const invoiceNumberValue = invoiceNumber ? String(invoiceNumber).trim() : null;

  const updatePayload: ExpenseUpdate = {
    date,
    truck_plate: truckPlate,
    km: kmValue,
    category,
    amount,
    liters: category === "fuel" ? litersValue : null,
    invoice_number: invoiceNumberValue,
    note: note || null,
  };

  const { data, error } = await supabaseAdmin
    .from("expenses")
    .update(updatePayload)
    .eq("id", id)
    .eq("fleet_code", fleetCode)
    .select("*")
    .single();

  if (error) return errorResponse(error.message, 500);

  return NextResponse.json({ data, sqlSetup: SQL_SETUP });
}

export async function DELETE(request: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();

  const body = await request.json();
  const { id, fleetCode } = body ?? {};

  if (!id) return errorResponse("id é obrigatório");
  if (!fleetCode) return errorResponse("fleetCode é obrigatório");

  const { error } = await supabaseAdmin.from("expenses").delete().eq("id", id).eq("fleet_code", fleetCode);

  if (error) return errorResponse(error.message, 500);

  return NextResponse.json({ ok: true, sqlSetup: SQL_SETUP });
}
