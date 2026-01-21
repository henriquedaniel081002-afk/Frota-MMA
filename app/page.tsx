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
  category: "fuel" | "maintenance";
  amount: number;
  note: string | null;
  created_at: string;
};

type FormState = {
  id?: string;
  date: string;
  truckPlate: string;
  category: "fuel" | "maintenance";
  amount: string;
  note: string;
};

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

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

  const item = payload[0];
  const name = item?.name ?? item?.payload?.name ?? "";
  const value = item?.value ?? item?.payload?.value ?? 0;

  return (
    <div
      style={{
        background: "rgba(11, 13, 16, 0.95)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "10px 12px",
        color: "var(--text)",
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
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // >>>> Agora inicia mostrando TODOS os meses (sem filtro)
  const [monthFilterMode, setMonthFilterMode] = useState<MonthFilterMode>("ALL");
  const [monthFilter, setMonthFilter] = useState(monthFromDate());

  const [truckFilter, setTruckFilter] = useState("Todos");
  const [activeTab, setActiveTab] = useState<TabKey>("dashboard");

  const [monthlySeries, setMonthlySeries] = useState<Array<{ month: string; total: number }>>([]);
  const [monthlyLoading, setMonthlyLoading] = useState(false);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formState, setFormState] = useState<FormState>({
    date: new Date().toISOString().slice(0, 10),
    truckPlate: "",
    category: "fuel",
    amount: "",
    note: "",
  });

  useEffect(() => {
    const stored = window.localStorage.getItem("fleetCode");
    if (stored) {
      setFleetCode(stored);
      setFleetCodeInput(stored);
    }
  }, []);

  useEffect(() => {
    if (!fleetCode) return;
    void loadExpenses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fleetCode, monthFilterMode, monthFilter, truckFilter]);

  useEffect(() => {
    if (!fleetCode) return;
    void loadMonthlySeries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fleetCode, truckFilter]);

  async function loadExpenses() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ fleetCode });

      // aplica filtro de mês SOMENTE se o modo for MONTH
      if (monthFilterMode === "MONTH") {
        params.set("month", monthFilter);
      }

      if (truckFilter && truckFilter !== "Todos") {
        params.set("truck", truckFilter);
      }

      const response = await fetch(`/api/expenses?${params.toString()}`);
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Erro ao carregar lançamentos");
      }

      setExpenses(payload.data ?? []);
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
      const params = new URLSearchParams({
        fleetCode,
        group: "month", // agora retorna todos os meses do histórico
      });

      if (truckFilter && truckFilter !== "Todos") {
        params.set("truck", truckFilter);
      }

      const response = await fetch(`/api/expenses?${params.toString()}`);
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Erro ao carregar evolução mensal");
      }

      setMonthlySeries(payload.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
      setMonthlySeries([]);
    } finally {
      setMonthlyLoading(false);
    }
  }

  function handleFleetSubmit() {
    if (!fleetCodeInput.trim()) return;
    const normalized = fleetCodeInput.trim();
    window.localStorage.setItem("fleetCode", normalized);
    setFleetCode(normalized);
  }

  function handleSwitchFleet() {
    window.localStorage.removeItem("fleetCode");
    setFleetCode(null);
    setFleetCodeInput("");
    setExpenses([]);
    setMonthlySeries([]);
  }

  function openNewForm() {
    setFormState({
      date: new Date().toISOString().slice(0, 10),
      truckPlate: "",
      category: "fuel",
      amount: "",
      note: "",
    });
    setIsFormOpen(true);
  }

  function openEditForm(expense: Expense) {
    setFormState({
      id: expense.id,
      date: expense.date,
      truckPlate: expense.truck_plate,
      category: expense.category,
      amount: expense.amount.toString(),
      note: expense.note ?? "",
    });
    setIsFormOpen(true);
  }

  async function handleSave() {
    if (!fleetCode) return;

    const payload = {
      id: formState.id,
      fleetCode,
      date: formState.date,
      truckPlate: formState.truckPlate.trim(),
      category: formState.category,
      amount: Number(formState.amount.replace(",", ".")),
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
    expenses.forEach((expense) => unique.add(expense.truck_plate));
    return Array.from(unique).sort();
  }, [expenses]);

  const totals = useMemo(() => {
    const total = expenses.reduce((sum, item) => sum + Number(item.amount), 0);
    const fuel = expenses
      .filter((item) => item.category === "fuel")
      .reduce((sum, item) => sum + Number(item.amount), 0);
    const maintenance = expenses
      .filter((item) => item.category === "maintenance")
      .reduce((sum, item) => sum + Number(item.amount), 0);
    return { total, fuel, maintenance };
  }, [expenses]);

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

  const byTypeData = useMemo(
    () => [
      { name: "Combustível", value: totals.fuel, color: "#f97316" },
      { name: "Manutenção", value: totals.maintenance, color: "#ffffff" },
    ],
    [totals]
  );

  const monthlyChartData = useMemo(() => {
    return (monthlySeries ?? []).map((item) => ({
      month: item.month,
      total: Number(item.total),
      label: formatMonthLabel(item.month),
    }));
  }, [monthlySeries]);

  const monthLabel = useMemo(() => {
    if (monthFilterMode === "ALL") return "Todos os meses";
    return `Mês: ${monthFilter}`;
  }, [monthFilterMode, monthFilter]);

  return (
    <main>
      <div className="header">
        <h1>Controle de Frota - MMA</h1>

        <div className="tabs" role="tablist" aria-label="Navegação">
          <button
            className={`tab ${activeTab === "dashboard" ? "active" : ""}`}
            onClick={() => setActiveTab("dashboard")}
            type="button"
            role="tab"
            aria-selected={activeTab === "dashboard"}
          >
            Dashboard
          </button>
          <button
            className={`tab ${activeTab === "lancamentos" ? "active" : ""}`}
            onClick={() => setActiveTab("lancamentos")}
            type="button"
            role="tab"
            aria-selected={activeTab === "lancamentos"}
          >
            Lançamentos
          </button>
        </div>
      </div>

      <section className="toolbar">
        <div className="field" style={{ minWidth: 220 }}>
          <label>Período</label>
          <select
            value={monthFilterMode}
            onChange={(e) => setMonthFilterMode(e.target.value as MonthFilterMode)}
          >
            <option value="ALL">Todos os meses</option>
            <option value="MONTH">Filtrar por mês</option>
          </select>
        </div>

        {monthFilterMode === "MONTH" && (
          <div className="field">
            <label>Mês</label>
            <input
              type="month"
              value={monthFilter}
              onChange={(event) => setMonthFilter(event.target.value)}
            />
          </div>
        )}

        <div className="field">
          <label>Caminhão</label>
          <select value={truckFilter} onChange={(event) => setTruckFilter(event.target.value)}>
            <option>Todos</option>
            {plates.map((plate) => (
              <option key={plate} value={plate}>
                {plate}
              </option>
            ))}
          </select>
        </div>

        {activeTab === "lancamentos" && (
          <button className="primary" onClick={openNewForm}>
            Novo lançamento
          </button>
        )}

        <button className="ghost" onClick={handleSwitchFleet}>
          Trocar frota
        </button>
      </section>

      {error && <p style={{ color: "#dc2626" }}>{error}</p>}

      {activeTab === "dashboard" && (
        <>
          <section className="cards">
            <div className="card">
              <span>Total ({monthLabel})</span>
              <strong>{currency.format(totals.total)}</strong>
            </div>
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
                    <Tooltip
                      contentStyle={{
                        background: "rgba(11, 13, 16, 0.95)",
                        border: "1px solid var(--border)",
                        borderRadius: 10,
                        color: "var(--text)",
                      }}
                      itemStyle={{ color: "var(--text)" }}
                      labelStyle={{ color: "var(--muted)" }}
                      formatter={(value) => currency.format(Number(value))}
                    />
                    <Bar dataKey="total" fill="#f97316" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="chart-card">
              <h3>Por tipo</h3>
              {byTypeData.every((item) => item.value === 0) ? (
                <div className="empty-state">Sem dados no período.</div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={byTypeData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={3}
                    >
                      {byTypeData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>

                    {/* Tooltip custom: legível no tema escuro */}
                    <Tooltip content={<DarkTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="chart-card">
              <h3>Evolução mensal</h3>
              {monthlyLoading ? (
                <div className="empty-state">Carregando...</div>
              ) : monthlyChartData.length === 0 ? (
                <div className="empty-state">Sem dados.</div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={monthlyChartData}>
                    <XAxis dataKey="label" />
                    <YAxis />
                    <Tooltip
                      contentStyle={{
                        background: "rgba(11, 13, 16, 0.95)",
                        border: "1px solid var(--border)",
                        borderRadius: 10,
                        color: "var(--text)",
                      }}
                      itemStyle={{ color: "var(--text)" }}
                      labelStyle={{ color: "var(--muted)" }}
                      formatter={(value) => currency.format(Number(value))}
                      labelFormatter={(_, payload) => {
                        const item = payload?.[0]?.payload as any;
                        return item?.month ? `Mês: ${item.month}` : "";
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="total"
                      stroke="#f97316"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>
        </>
      )}

      {activeTab === "lancamentos" && (
        <section className="table-wrapper" style={{ marginTop: 20 }}>
          <h3>Lançamentos</h3>
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
                  <th>Tipo</th>
                  <th>Valor</th>
                  <th>Observação</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((expense) => (
                  <tr key={expense.id}>
                    <td>{expense.date}</td>
                    <td>{expense.truck_plate}</td>
                    <td>{expense.category === "fuel" ? "Combustível" : "Manutenção"}</td>
                    <td>{currency.format(Number(expense.amount))}</td>
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

      {fleetCode === null && (
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
            <h2>{formState.id ? "Editar" : "Novo"} lançamento</h2>

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
              <label>Categoria</label>
              <select
                value={formState.category}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, category: event.target.value as FormState["category"] }))
                }
              >
                <option value="fuel">Combustível</option>
                <option value="maintenance">Manutenção</option>
              </select>
            </div>

            <div className="field">
              <label>Valor (R$)</label>
              <input
                value={formState.amount}
                onChange={(event) => setFormState((prev) => ({ ...prev, amount: event.target.value }))}
                placeholder="0,00"
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
    </main>
  );
}
