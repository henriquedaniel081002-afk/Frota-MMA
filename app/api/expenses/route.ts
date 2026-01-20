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

function isValidDate(value: string) {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message, sqlSetup: SQL_SETUP }, { status });
}

function normalizeMonthRange(month: string) {
  const [year, monthValue] = month.split("-").map(Number);
  if (!year || !monthValue || monthValue < 1 || monthValue > 12) {
    return null;
  }
  const start = new Date(Date.UTC(year, monthValue - 1, 1));
  const end = new Date(Date.UTC(year, monthValue, 1));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const fleetCode = searchParams.get("fleetCode");
  if (!fleetCode) {
    return errorResponse("fleetCode é obrigatório");
  }

  let query = supabaseAdmin
    .from("expenses")
    .select("*")
    .eq("fleet_code", fleetCode)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  const month = searchParams.get("month");
  if (month) {
    const range = normalizeMonthRange(month);
    if (!range) {
      return errorResponse("month inválido. Use YYYY-MM");
    }
    query = query.gte("date", range.start).lt("date", range.end);
  }

  const truck = searchParams.get("truck");
  if (truck && truck !== "Todos") {
    query = query.eq("truck_plate", truck);
  }

  const { data, error } = await query;
  if (error) {
    return errorResponse(error.message, 500);
  }

  return NextResponse.json({ data, sqlSetup: SQL_SETUP });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { fleetCode, date, truckPlate, category, amount, note } = body ?? {};

  if (!fleetCode) {
    return errorResponse("fleetCode é obrigatório");
  }
  if (!isValidDate(date)) {
    return errorResponse("date inválida");
  }
  if (!truckPlate) {
    return errorResponse("truck_plate é obrigatório");
  }
  if (!CATEGORY_VALUES.has(category)) {
    return errorResponse("category inválida");
  }
  if (Number(amount) <= 0) {
    return errorResponse("amount deve ser maior que zero");
  }

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

  if (error) {
    return errorResponse(error.message, 500);
  }

  return NextResponse.json({ data, sqlSetup: SQL_SETUP }, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { id, fleetCode, date, truckPlate, category, amount, note } = body ?? {};

  if (!id) {
    return errorResponse("id é obrigatório");
  }
  if (!fleetCode) {
    return errorResponse("fleetCode é obrigatório");
  }
  if (!isValidDate(date)) {
    return errorResponse("date inválida");
  }
  if (!truckPlate) {
    return errorResponse("truck_plate é obrigatório");
  }
  if (!CATEGORY_VALUES.has(category)) {
    return errorResponse("category inválida");
  }
  if (Number(amount) <= 0) {
    return errorResponse("amount deve ser maior que zero");
  }

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

  if (error) {
    return errorResponse(error.message, 500);
  }

  return NextResponse.json({ data, sqlSetup: SQL_SETUP });
}

export async function DELETE(request: NextRequest) {
  const body = await request.json();
  const { id, fleetCode } = body ?? {};

  if (!id) {
    return errorResponse("id é obrigatório");
  }
  if (!fleetCode) {
    return errorResponse("fleetCode é obrigatório");
  }

  const { error } = await supabaseAdmin
    .from("expenses")
    .delete()
    .eq("id", id)
    .eq("fleet_code", fleetCode);

  if (error) {
    return errorResponse(error.message, 500);
  }

  return NextResponse.json({ success: true, sqlSetup: SQL_SETUP });
}
