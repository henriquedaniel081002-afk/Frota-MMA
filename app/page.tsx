"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
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
  date: string;
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

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function formatLiters(value: number | null) {
  if (value === null || value === undefined) return "-";
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  return num.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function monthFromDate(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

type TabKey = "dashboard" | "lancamentos";
type MonthFilterMode = "ALL" | "MONTH";

function formatMonthLabel(yyyyMm: string) {
  // YYYY-MM -> MM/YY
  const yy = yyyyMm.slice(2, 4);
  const mm = yyyyMm.slice(5, 7);
  return `${mm}/${yy}`;
}

// Tooltip custom para o PieChart (Por tipo)
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
  const entry = payload[0];
  const name = entry?.name ?? entry?.payload?.name ?? "Detalhe";
  const value = entry?.value ?? entry?.payload?.value ?? 0;

  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "10px 12px",
        boxShadow: "var(--shadow)",
        minWidth: 180,
      }}
    >
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>
        {label ? String(label) : "Detalhe"}
      </div>
      <div style={{ fontWeight: 800, marginBottom: 2 }}>{name}</div>
      <div style={{ color: "var(--primary)" }}>{currency.format(Number(value))}</div>
    </div>
  );
}

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
    loadMonthlySeries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fleetCode, monthMode, selectedMonth]);

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
        return;
      }

      setExpenses(result.data || []);
      setAvailableMonths(result.months || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
      setExpenses([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadMonthlySeries() {
    if (!fleetCode) return;
    setMonthlyLoading(true);

    try {
      const response = await fetch(`/api/expenses?fleetCode=${encodeURIComponent(fleetCode)}`);
      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "Erro ao carregar série mensal");
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
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

    const payload = {
      id: formState.id,
      fleetCode,
      date: formState.date,
      truckPlate: formState.truckPlate.trim(),
      km: kmValue,
      category: formState.category,
      amount: Number(formState.amount.replace(",", ".")),
      liters: formState.liters ? Number(formState.liters.replace(",", ".")) : null,
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
    await loadExpenses();
    await loadMonthlySeries();
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

    await loadExpenses();
    await loadMonthlySeries();
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

  const truckTotals = useMemo(() => {
    return expenses.reduce<Record<string, number>>((acc, item) => {
      acc[item.truck_plate] = (acc[item.truck_plate] || 0) + Number(item.amount);
      return acc;
    }, {});
  }, [expenses]);

  const byTruckData = useMemo(() => {
    return Object.entries(truckTotals)
      .map(([truck, total]) => ({ truck, total }))
      .sort((a, b) => b.total - a.total);
  }, [truckTotals]);

  const byTypeData = useMemo(() => {
    const totalFuel = totals.fuel;
    const totalMaint = totals.maintenance;
    const rows = [
      { name: "Combustível", value: totalFuel },
      { name: "Manutenção", value: totalMaint },
    ];
    return rows.filter((r) => r.value > 0);
  }, [totals]);

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
              <button className={tab === "dashboard" ? "tab active" : "tab"} onClick={() => setTab("dashboard")}>
                Dashboard
              </button>
              <button className={tab === "lancamentos" ? "tab active" : "tab"} onClick={() => setTab("lancamentos")}>
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
            <select value={monthMode} onChange={(e) => setMonthMode(e.target.value as MonthFilterMode)}>
              <option value="ALL">Todos</option>
              <option value="MONTH">Mês</option>
            </select>
          </div>

          {monthMode === "MONTH" && (
            <div className="field">
              <label>Mês</label>
              <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
                {availableMonths.length === 0 ? (
                  <option value={selectedMonth}>{formatMonthLabel(selectedMonth)}</option>
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
            <select value={truckFilter} onChange={(e) => setTruckFilter(e.target.value)}>
              <option value="Todos">Todos</option>
              {plates.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
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
              {truckFilter !== "Todos" && (
                <div className="card">
                  <span>Total do caminhão</span>
                  <strong>{currency.format(truckTotals[truckFilter] || 0)}</strong>
                </div>
              )}
            </section>

            <section className="content-grid">
              <div className="chart-card">
                <h3>Por caminhão</h3>
                {byTruckData.length === 0 ? (
                  <div className="empty-state">Sem dados no período.</div>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={byTruckData}>
                      <XAxis dataKey="truck" />
                      <YAxis />
                      <Tooltip content={<DarkTooltip />} />
                      <Bar dataKey="total">
                        {byTruckData.map((_, idx) => (
                          <Cell key={idx} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="chart-card">
                <h3>Por tipo</h3>
                {byTypeData.length === 0 ? (
                  <div className="empty-state">Sem dados no período.</div>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Tooltip content={<DarkTooltip />} />
                      <Pie data={byTypeData} dataKey="value" nameKey="name" outerRadius={90}>
                        {byTypeData.map((_, idx) => (
                          <Cell key={idx} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="chart-card full">
                <h3>Série mensal</h3>
                {monthlyLoading ? (
                  <div className="empty-state">Carregando...</div>
                ) : (
                  <div className="empty-state">Use os lançamentos para gerar série mensal.</div>
                )}
              </div>
            </section>
          </>
        ) : (
          <section className="table-card">
            <div className="table-header">
              <h3>Lançamentos</h3>
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
                          ? Number(expense.km).toLocaleString("pt-BR", { maximumFractionDigits: 0 })
                          : "-"}
                      </td>
                      <td>{expense.category === "fuel" ? "Combustível" : "Manutenção"}</td>
                      <td>{currency.format(Number(expense.amount))}</td>
                      <td>{expense.liters !== null && expense.liters !== undefined ? formatLiters(expense.liters) : "-"}</td>
                      <td>{expense.invoice_number || "-"}</td>
                      <td>{expense.note || "-"}</td>
                      <td>
                        <div className="table-actions">
                          <button className="ghost" onClick={() => openEditForm(expense)}>
                            Editar
                          </button>
                          <button className="danger" onClick={() => handleDelete(expense.id)}>
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
          <div className="modal-backdrop">
            <div className="modal">
              <h2>Código da Frota</h2>
              <p>Informe o código para compartilhar os dados entre usuários.</p>
              <div className="field">
                <label>Código</label>
                <input
                  value={fleetCodeInput}
                  onChange={(event) => setFleetCodeInput(event.target.value)}
                  placeholder="Ex: FROTA-001"
                />
              </div>
              <div className="modal-actions">
                <button className="primary" onClick={handleFleetSubmit}>
                  Entrar
                </button>
              </div>
            </div>
          </div>
        )}

        {isFormOpen && (
          <div className="modal-backdrop">
            <div className="modal">
              <h2>{formState.id ? "Editar lançamento" : "Novo lançamento"}</h2>

              <div className="field">
                <label>Data</label>
                <input
                  type="date"
                  value={formState.date}
                  onChange={(event) => setFormState((prev) => ({ ...prev, date: event.target.value }))}
                />
              </div>

              <div className="field">
                <label>Placa</label>
                <input
                  list="plates"
                  value={formState.truckPlate}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, truckPlate: event.target.value.toUpperCase() }))
                  }
                  placeholder="ABC-1234"
                />
                <datalist id="plates">
                  {plates.map((plate) => (
                    <option key={plate} value={plate} />
                  ))}
                </datalist>
              </div>

              <div className="field">
                <label>KM</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="1"
                  value={formState.km}
                  onChange={(event) => setFormState((prev) => ({ ...prev, km: event.target.value }))}
                  placeholder="Ex: 123456"
                />
              </div>

              <div className="field">
                <label>Tipo</label>
                <select
                  value={formState.category}
                  onChange={(event) => setFormState((prev) => ({ ...prev, category: event.target.value as any }))}
                >
                  <option value="fuel">Combustível</option>
                  <option value="maintenance">Manutenção</option>
                </select>
              </div>

              <div className="field">
                <label>Valor</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={formState.amount}
                  onChange={(event) => setFormState((prev) => ({ ...prev, amount: event.target.value }))}
                  placeholder="0,00"
                />
              </div>

              <div className="field">
                <label>Litros</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={formState.liters}
                  onChange={(event) => setFormState((prev) => ({ ...prev, liters: event.target.value }))}
                  placeholder="0,00"
                  disabled={formState.category !== "fuel"}
                />
              </div>

              <div className="field">
                <label>Nota fiscal</label>
                <input
                  value={formState.invoiceNumber}
                  onChange={(event) => setFormState((prev) => ({ ...prev, invoiceNumber: event.target.value }))}
                  placeholder="Ex: 12345"
                />
              </div>

              <div className="field">
                <label>Observação</label>
                <textarea
                  rows={3}
                  value={formState.note}
                  onChange={(event) => setFormState((prev) => ({ ...prev, note: event.target.value }))}
                />
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
