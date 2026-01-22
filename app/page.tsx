"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Expense = {
  id: string;
  fleet_code: string;
  date: string; // YYYY-MM-DD
  truck_plate: string;
  km: number;
  category: "fuel" | "maintenance";
  amount: number;
  liters: number | null;
  invoice_number: string | null;
  note: string | null;
  created_at: string;
};

type FormState = {
  id?: string;
  date: string;
  truckPlate: string;
  km: string;
  category: "fuel" | "maintenance";
  amount: string;
  liters: string;
  invoiceNumber: string;
  note: string;
};

type TabKey = "dashboard" | "lancamentos";
type MonthFilterMode = "ALL" | "MONTH";

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function monthFromDate(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

function formatMonthLabel(yyyyMm: string) {
  const yy = yyyyMm.slice(2, 4);
  const mm = yyyyMm.slice(5, 7);
  return `${mm}/${yy}`;
}

function formatLiters(value: number | null) {
  if (value === null || value === undefined) return "-";
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  return num.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function formatCompactBRL(value: any) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  try {
    return new Intl.NumberFormat("pt-BR", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(n);
  } catch {
    return currency.format(n);
  }
}

const CHART_COLORS = [
  "#f97316",
  "#fb923c",
  "#fdba74",
  "#ea580c",
  "#c2410c",
  "#9a3412",
];

function DarkTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: any[];
  label?: any;
}) {
  if (!active || !payload || payload.length === 0) return null;

  const items = payload
    .map((p) => ({
      name: String(p?.name ?? p?.dataKey ?? "Detalhe"),
      value: Number(p?.value ?? 0),
    }))
    .filter((x) => Number.isFinite(x.value));

  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: "10px 12px",
        boxShadow: "var(--shadow)",
        minWidth: 190,
      }}
    >
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>
        {label ? String(label) : "Detalhe"}
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        {items.map((it) => (
          <div
            key={it.name}
            style={{ display: "flex", justifyContent: "space-between", gap: 12 }}
          >
            <span style={{ color: "rgba(255,255,255,0.8)", fontWeight: 700 }}>
              {it.name}
            </span>
            <span style={{ color: "var(--primary)", fontWeight: 900 }}>
              {currency.format(it.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

type MonthlyPoint = {
  month: string; // YYYY-MM
  label: string; // MM/YY
  total: number;
  fuel: number;
  maintenance: number;
};

export default function Page() {
  const [fleetCode, setFleetCode] = useState<string | null>(null);
  const [fleetCodeInput, setFleetCodeInput] = useState("");
  const [isFleetModalOpen, setIsFleetModalOpen] = useState(false);

  const [tab, setTab] = useState<TabKey>("dashboard");

  const [monthMode, setMonthMode] = useState<MonthFilterMode>("ALL");
  const [selectedMonth, setSelectedMonth] = useState<string>(monthFromDate());
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);

  const [truckFilter, setTruckFilter] = useState<string>("Todos");

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [seriesExpenses, setSeriesExpenses] = useState<Expense[]>([]);

  const [loading, setLoading] = useState(false);
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formState, setFormState] = useState<FormState>({
    date: new Date().toISOString().slice(0, 10),
    truckPlate: "",
    km: "",
    category: "fuel",
    amount: "",
    liters: "",
    invoiceNumber: "",
    note: "",
  });

  useEffect(() => {
    const stored = window.localStorage.getItem("fleetCode");
    if (stored) {
      setFleetCode(stored);
      setFleetCodeInput(stored);
    } else {
      setIsFleetModalOpen(true);
    }
  }, []);

  useEffect(() => {
    if (!fleetCode) return;
    loadExpenses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fleetCode, monthMode, selectedMonth]);

  useEffect(() => {
    if (!fleetCode) return;
    loadMonthlySeries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fleetCode]);

  async function loadExpenses() {
    if (!fleetCode) return;
    setError(null);
    setLoading(true);

    try {
      const params = new URLSearchParams({ fleetCode });
      if (monthMode === "MONTH") {
        params.set("mode", "MONTH");
        params.set("month", selectedMonth);
      }

      const response = await fetch(`/api/expenses?${params.toString()}`);
      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "Erro ao carregar lançamentos");
        setExpenses([]);
        setAvailableMonths([]);
        return;
      }

      setExpenses(result.data || []);
      setAvailableMonths(result.months || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
      setExpenses([]);
      setAvailableMonths([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadMonthlySeries() {
    if (!fleetCode) return;
    setMonthlyLoading(true);

    try {
      const response = await fetch(
        `/api/expenses?fleetCode=${encodeURIComponent(fleetCode)}`
      );
      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "Erro ao carregar série mensal");
        setSeriesExpenses([]);
        return;
      }

      setSeriesExpenses(result.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
      setSeriesExpenses([]);
    } finally {
      setMonthlyLoading(false);
    }
  }

  function handleFleetSubmit() {
    if (!fleetCodeInput.trim()) return;
    const normalized = fleetCodeInput.trim();
    window.localStorage.setItem("fleetCode", normalized);
    setFleetCode(normalized);
    setIsFleetModalOpen(false);
  }

  function openNewForm() {
    setError(null);
    setFormState({
      date: new Date().toISOString().slice(0, 10),
      truckPlate: "",
      km: "",
      category: "fuel",
      amount: "",
      liters: "",
      invoiceNumber: "",
      note: "",
    });
    setIsFormOpen(true);
  }

  function openEditForm(expense: Expense) {
    setError(null);
    setFormState({
      id: expense.id,
      date: expense.date,
      truckPlate: expense.truck_plate,
      km: (expense.km ?? 0).toString(),
      category: expense.category,
      amount: expense.amount.toString(),
      liters: expense.liters?.toString() ?? "",
      invoiceNumber: expense.invoice_number ?? "",
      note: expense.note ?? "",
    });
    setIsFormOpen(true);
  }

  async function handleSave() {
    if (!fleetCode) return;

    const kmValue = formState.km ? Number(formState.km.replace(",", ".")) : NaN;
    if (!Number.isFinite(kmValue) || kmValue < 0) {
      setError("KM deve ser um número maior ou igual a zero");
      return;
    }

    const amountValue = Number(formState.amount.replace(",", "."));
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setError("Valor deve ser maior que zero");
      return;
    }

    const litersValue = formState.liters
      ? Number(formState.liters.replace(",", "."))
      : null;

    if (formState.category === "fuel" && litersValue !== null) {
      if (!Number.isFinite(litersValue) || litersValue <= 0) {
        setError("Litros deve ser maior que zero");
        return;
      }
    }

    const payload = {
      id: formState.id,
      fleetCode,
      date: formState.date,
      truckPlate: formState.truckPlate.trim(),
      km: kmValue,
      category: formState.category,
      amount: amountValue,
      liters: formState.category === "fuel" ? litersValue : null,
      invoiceNumber: formState.invoiceNumber.trim(),
      note: formState.note.trim(),
    };

    const method = formState.id ? "PUT" : "POST";
    const response = await fetch("/api/expenses", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    if (!response.ok) {
      setError(result.error || "Erro ao salvar");
      return;
    }

    setIsFormOpen(false);
    await Promise.all([loadExpenses(), loadMonthlySeries()]);
  }

  async function handleDelete(expenseId: string) {
    if (!fleetCode) return;
    if (!window.confirm("Deseja excluir este lançamento?")) return;

    const response = await fetch("/api/expenses", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: expenseId, fleetCode }),
    });

    const result = await response.json();
    if (!response.ok) {
      setError(result.error || "Erro ao excluir");
      return;
    }

    await Promise.all([loadExpenses(), loadMonthlySeries()]);
  }

  const plates = useMemo(() => {
    const unique = new Set<string>();
    for (const item of expenses) unique.add(item.truck_plate);
    return Array.from(unique).sort();
  }, [expenses]);

  const filteredExpenses = useMemo(() => {
    if (truckFilter === "Todos") return expenses;
    return expenses.filter((e) => e.truck_plate === truckFilter);
  }, [expenses, truckFilter]);

  const totals = useMemo(() => {
    const base = { fuel: 0, maintenance: 0 };
    for (const e of filteredExpenses) {
      if (e.category === "fuel") base.fuel += Number(e.amount);
      else base.maintenance += Number(e.amount);
    }
    return base;
  }, [filteredExpenses]);

  const byTruckData = useMemo(() => {
    const map: Record<string, number> = {};
    const source = truckFilter === "Todos" ? expenses : filteredExpenses;
    for (const item of source) {
      map[item.truck_plate] = (map[item.truck_plate] || 0) + Number(item.amount);
    }
    return Object.entries(map)
      .map(([truck, total]) => ({ truck, total }))
      .sort((a, b) => b.total - a.total);
  }, [expenses, filteredExpenses, truckFilter]);

  const byTypeData = useMemo(() => {
    const rows = [
      { name: "Combustível", value: totals.fuel },
      { name: "Manutenção", value: totals.maintenance },
    ];
    return rows.filter((r) => r.value > 0);
  }, [totals]);

  const monthlySeries = useMemo<MonthlyPoint[]>(() => {
    const src =
      truckFilter === "Todos"
        ? seriesExpenses
        : seriesExpenses.filter((e) => e.truck_plate === truckFilter);

    const acc: Record<string, MonthlyPoint> = {};
    for (const e of src) {
      const key = String(e.date).slice(0, 7);
      if (!acc[key]) {
        acc[key] = {
          month: key,
          label: formatMonthLabel(key),
          total: 0,
          fuel: 0,
          maintenance: 0,
        };
      }
      const amount = Number(e.amount);
      acc[key].total += amount;
      if (e.category === "fuel") acc[key].fuel += amount;
      else acc[key].maintenance += amount;
    }

    return Object.values(acc).sort((a, b) => a.month.localeCompare(b.month));
  }, [seriesExpenses, truckFilter]);

  const selectedTruckTotal = useMemo(() => {
    if (truckFilter === "Todos") return 0;
    let sum = 0;
    for (const e of filteredExpenses) sum += Number(e.amount);
    return sum;
  }, [filteredExpenses, truckFilter]);

  return (
    <main>
      <div className="container">
        <header className="header">
          <div>
            <h1>Frota - Despesas</h1>
            <p className="subtitle">Controle de combustível e manutenção</p>
          </div>

          <div className="header-actions">
            <div className="tabs">
              <button
                className={tab === "dashboard" ? "tab active" : "tab"}
                onClick={() => setTab("dashboard")}
              >
                Dashboard
              </button>
              <button
                className={tab === "lancamentos" ? "tab active" : "tab"}
                onClick={() => setTab("lancamentos")}
              >
                Lançamentos
              </button>
            </div>

            <button className="primary" onClick={openNewForm}>
              Novo lançamento
            </button>
          </div>
        </header>

        <section className="filters">
          <div className="field">
            <label>Filtro por mês</label>
            <select
              value={monthMode}
              onChange={(e) => setMonthMode(e.target.value as MonthFilterMode)}
            >
              <option value="ALL">Todos</option>
              <option value="MONTH">Mês</option>
            </select>
          </div>

          {monthMode === "MONTH" && (
            <div className="field">
              <label>Mês</label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
              >
                {availableMonths.length === 0 ? (
                  <option value={selectedMonth}>
                    {formatMonthLabel(selectedMonth)}
                  </option>
                ) : (
                  availableMonths.map((m) => (
                    <option key={m} value={m}>
                      {formatMonthLabel(m)}
                    </option>
                  ))
                )}
              </select>
            </div>
          )}

          <div className="field">
            <label>Caminhão</label>
            <select
              value={truckFilter}
              onChange={(e) => setTruckFilter(e.target.value)}
            >
              <option value="Todos">Todos</option>
              {plates.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div className="filters-meta">
            {monthMode === "MONTH" ? (
              <span className="pill">Período: {formatMonthLabel(selectedMonth)}</span>
            ) : (
              <span className="pill">Período: todos</span>
            )}
            {truckFilter === "Todos" ? (
              <span className="pill">Caminhão: todos</span>
            ) : (
              <span className="pill">Caminhão: {truckFilter}</span>
            )}
          </div>
        </section>

        {error && <div className="alert">{error}</div>}

        {tab === "dashboard" ? (
          <>
            <section className="cards">
              <div className="card">
                <span>Total Combustível</span>
                <strong>{currency.format(totals.fuel)}</strong>
              </div>

              <div className="card">
                <span>Total Manutenção</span>
                <strong>{currency.format(totals.maintenance)}</strong>
              </div>

              <div className="card">
                <span>Total Geral</span>
                <strong>{currency.format(totals.fuel + totals.maintenance)}</strong>
              </div>

              {truckFilter !== "Todos" && (
                <div className="card">
                  <span>Total do caminhão</span>
                  <strong>{currency.format(selectedTruckTotal)}</strong>
                </div>
              )}
            </section>

            <section className="content-grid">
              <div className="chart-card">
                <div className="chart-head">
                  <h3>Despesas por caminhão</h3>
                  <span className="chart-sub">Soma do valor no período</span>
                </div>

                {byTruckData.length === 0 ? (
                  <div className="empty-state">Sem dados no período.</div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart
                      data={byTruckData}
                      margin={{ top: 8, right: 12, bottom: 8, left: 6 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                      <XAxis dataKey="truck" tickMargin={8} interval={0} />
                      <YAxis tickFormatter={formatCompactBRL} width={70} />
                      <Tooltip content={<DarkTooltip />} />
                      <Bar dataKey="total" name="Total" radius={[10, 10, 6, 6]}>
                        {byTruckData.map((_, idx) => (
                          <Cell
                            key={idx}
                            fill={CHART_COLORS[idx % CHART_COLORS.length]}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="chart-card">
                <div className="chart-head">
                  <h3>Despesas por tipo</h3>
                  <span className="chart-sub">Combustível x Manutenção</span>
                </div>

                {byTypeData.length === 0 ? (
                  <div className="empty-state">Sem dados no período.</div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Tooltip content={<DarkTooltip />} />
                      <Legend verticalAlign="bottom" height={24} />
                      <Pie
                        data={byTypeData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={55}
                        outerRadius={90}
                        paddingAngle={4}
                      >
                        {byTypeData.map((_, idx) => (
                          <Cell
                            key={idx}
                            fill={CHART_COLORS[idx % CHART_COLORS.length]}
                          />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="chart-card full">
                <div className="chart-head">
                  <h3>Evolução mensal</h3>
                  <span className="chart-sub">
                    Soma por mês (total / combustível / manutenção)
                  </span>
                </div>

                {monthlyLoading ? (
                  <div className="empty-state">Carregando...</div>
                ) : monthlySeries.length === 0 ? (
                  <div className="empty-state">
                    Sem dados suficientes para montar a série mensal.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={290}>
                    <LineChart
                      data={monthlySeries}
                      margin={{ top: 8, right: 16, bottom: 8, left: 6 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                      <XAxis dataKey="label" tickMargin={8} />
                      <YAxis tickFormatter={formatCompactBRL} width={70} />
                      <Tooltip content={<DarkTooltip />} />
                      <Legend verticalAlign="bottom" height={26} />

                      <Line
                        type="monotone"
                        dataKey="total"
                        name="Total"
                        stroke={CHART_COLORS[0]}
                        strokeWidth={2.5}
                        dot={false}
                        activeDot={{ r: 5 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="fuel"
                        name="Combustível"
                        stroke={CHART_COLORS[1]}
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="maintenance"
                        name="Manutenção"
                        stroke={CHART_COLORS[4]}
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>
          </>
        ) : (
          <section className="table-card">
            <div className="table-header">
              <h3>Lançamentos</h3>
              <span className="muted">
                {loading
                  ? "Carregando..."
                  : `${expenses.length} registro${expenses.length === 1 ? "" : "s"}`}
              </span>
            </div>

            {loading ? (
              <div className="empty-state">Carregando...</div>
            ) : expenses.length === 0 ? (
              <div className="empty-state">Nenhum lançamento encontrado.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Placa</th>
                    <th>KM</th>
                    <th>Tipo</th>
                    <th>Valor</th>
                    <th>Litros</th>
                    <th>Nota fiscal</th>
                    <th>Observação</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((expense) => (
                    <tr key={expense.id}>
                      <td>{expense.date}</td>
                      <td>{expense.truck_plate}</td>
                      <td>
                        {Number.isFinite(Number(expense.km))
                          ? Number(expense.km).toLocaleString("pt-BR", {
                              maximumFractionDigits: 0,
                            })
                          : "-"}
                      </td>
                      <td>
                        {expense.category === "fuel"
                          ? "Combustível"
                          : "Manutenção"}
                      </td>
                      <td>{currency.format(Number(expense.amount))}</td>
                      <td>
                        {expense.liters !== null && expense.liters !== undefined
                          ? formatLiters(expense.liters)
                          : "-"}
                      </td>
                      <td>{expense.invoice_number || "-"}</td>
                      <td className="truncate">{expense.note || "-"}</td>
                      <td>
                        <div className="table-actions">
                          <button
                            className="ghost"
                            onClick={() => openEditForm(expense)}
                          >
                            Editar
                          </button>
                          <button
                            className="danger"
                            onClick={() => handleDelete(expense.id)}
                          >
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}

        {isFleetModalOpen && (
          <div className="modal-overlay">
            <div className="modal">
              <h2>Código da frota</h2>
              <p className="muted">
                Informe o mesmo código usado nos lançamentos (fleet_code).
              </p>

              <div className="toolbar">
                <div className="field" style={{ flex: 1, minWidth: 240 }}>
                  <label>Fleet code</label>
                  <input
                    value={fleetCodeInput}
                    onChange={(e) => setFleetCodeInput(e.target.value)}
                    placeholder="Ex: MMA"
                  />
                </div>
                <button className="primary" onClick={handleFleetSubmit}>
                  Entrar
                </button>
              </div>
            </div>
          </div>
        )}

        {isFormOpen && (
          <div className="modal-overlay">
            <div className="modal">
              <h2>{formState.id ? "Editar lançamento" : "Novo lançamento"}</h2>

              <div className="form-grid">
                <div className="field">
                  <label>Data</label>
                  <input
                    type="date"
                    value={formState.date}
                    onChange={(e) =>
                      setFormState((s) => ({ ...s, date: e.target.value }))
                    }
                  />
                </div>

                <div className="field">
                  <label>Placa</label>
                  <input
                    value={formState.truckPlate}
                    onChange={(e) =>
                      setFormState((s) => ({
                        ...s,
                        truckPlate: e.target.value,
                      }))
                    }
                    placeholder="Ex: ABC1D23"
                  />
                </div>

                <div className="field">
                  <label>KM</label>
                  <input
                    value={formState.km}
                    onChange={(e) =>
                      setFormState((s) => ({ ...s, km: e.target.value }))
                    }
                    placeholder="Ex: 120000"
                  />
                </div>

                <div className="field">
                  <label>Tipo</label>
                  <select
                    value={formState.category}
                    onChange={(e) =>
                      setFormState((s) => ({
                        ...s,
                        category: e.target.value as any,
                      }))
                    }
                  >
                    <option value="fuel">Combustível</option>
                    <option value="maintenance">Manutenção</option>
                  </select>
                </div>

                <div className="field">
                  <label>Valor</label>
                  <input
                    value={formState.amount}
                    onChange={(e) =>
                      setFormState((s) => ({ ...s, amount: e.target.value }))
                    }
                    placeholder="Ex: 350,50"
                  />
                </div>

                <div className="field">
                  <label>Litros</label>
                  <input
                    value={formState.liters}
                    onChange={(e) =>
                      setFormState((s) => ({ ...s, liters: e.target.value }))
                    }
                    placeholder={
                      formState.category === "fuel"
                        ? "Ex: 120"
                        : "(apenas combustível)"
                    }
                    disabled={formState.category !== "fuel"}
                  />
                </div>

                <div className="field">
                  <label>Nota fiscal</label>
                  <input
                    value={formState.invoiceNumber}
                    onChange={(e) =>
                      setFormState((s) => ({
                        ...s,
                        invoiceNumber: e.target.value,
                      }))
                    }
                    placeholder="Opcional"
                  />
                </div>

                <div className="field" style={{ gridColumn: "1 / -1" }}>
                  <label>Observação</label>
                  <textarea
                    rows={3}
                    value={formState.note}
                    onChange={(e) =>
                      setFormState((s) => ({ ...s, note: e.target.value }))
                    }
                    placeholder="Opcional"
                  />
                </div>
              </div>

              <div className="modal-actions">
                <button className="ghost" onClick={() => setIsFormOpen(false)}>
                  Cancelar
                </button>
                <button className="primary" onClick={handleSave}>
                  Salvar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
