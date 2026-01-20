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

export default function Page() {
  const [fleetCode, setFleetCode] = useState<string | null>(null);
  const [fleetCodeInput, setFleetCodeInput] = useState("");
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [monthFilter, setMonthFilter] = useState(monthFromDate());
  const [truckFilter, setTruckFilter] = useState("Todos");
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
  }, [fleetCode, monthFilter, truckFilter]);

  async function loadExpenses() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        fleetCode,
        month: monthFilter,
      });
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
    } finally {
      setLoading(false);
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

  const byTruckData = useMemo(
    () =>
      Object.entries(truckTotals).map(([truck, total]) => ({
        truck,
        total,
      })),
    [truckTotals]
  );

  const byTypeData = useMemo(
    () => [
      { name: "Combustível", value: totals.fuel, color: "#2563eb" },
      { name: "Manutenção", value: totals.maintenance, color: "#f97316" },
    ],
    [totals]
  );

  const byDayData = useMemo(() => {
    const map = new Map<string, number>();
    expenses.forEach((expense) => {
      const day = expense.date;
      map.set(day, (map.get(day) || 0) + Number(expense.amount));
    });
    return Array.from(map.entries())
      .sort((a, b) => (a[0] > b[0] ? 1 : -1))
      .map(([day, total]) => ({ day, total }));
  }, [expenses]);

  return (
    <main>
      <h1>Controle de Gastos da Frota</h1>

      <section className="toolbar">
        <div className="field">
          <label>Mês</label>
          <input
            type="month"
            value={monthFilter}
            onChange={(event) => setMonthFilter(event.target.value)}
          />
        </div>
        <div className="field">
          <label>Caminhão</label>
          <select
            value={truckFilter}
            onChange={(event) => setTruckFilter(event.target.value)}
          >
            <option>Todos</option>
            {plates.map((plate) => (
              <option key={plate} value={plate}>
                {plate}
              </option>
            ))}
          </select>
        </div>
        <button className="primary" onClick={openNewForm}>
          Novo lançamento
        </button>
        <button className="ghost" onClick={handleSwitchFleet}>
          Trocar frota
        </button>
      </section>

      {error && <p style={{ color: "#dc2626" }}>{error}</p>}

      <section className="cards">
        <div className="card">
          <span>Total do mês</span>
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
            <strong>
              {currency.format(truckTotals[truckFilter] || 0)}
            </strong>
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
                <Tooltip formatter={(value) => currency.format(Number(value))} />
                <Bar dataKey="total" fill="#2563eb" />
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
                <Tooltip formatter={(value) => currency.format(Number(value))} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="chart-card">
          <h3>Totais por dia</h3>
          {byDayData.length === 0 ? (
            <div className="empty-state">Sem dados no período.</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={byDayData}>
                <XAxis dataKey="day" />
                <YAxis />
                <Tooltip formatter={(value) => currency.format(Number(value))} />
                <Line type="monotone" dataKey="total" stroke="#22c55e" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

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
                  <td>
                    {expense.category === "fuel" ? "Combustível" : "Manutenção"}
                  </td>
                  <td>{currency.format(Number(expense.amount))}</td>
                  <td>{expense.note || "-"}</td>
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
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    date: event.target.value,
                  }))
                }
              />
            </div>
            <div className="field">
              <label>Placa</label>
              <input
                list="plates"
                value={formState.truckPlate}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    truckPlate: event.target.value.toUpperCase(),
                  }))
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
                  setFormState((prev) => ({
                    ...prev,
                    category: event.target.value as FormState["category"],
                  }))
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
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    amount: event.target.value,
                  }))
                }
                placeholder="0,00"
              />
            </div>
            <div className="field">
              <label>Observação</label>
              <textarea
                rows={3}
                value={formState.note}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    note: event.target.value,
                  }))
                }
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
