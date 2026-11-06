import { useEffect, useMemo, useState } from "react";
import api from "../api/axios";
import { useLanguage } from "../i18n/LanguageContext";

function money(n) {
  const num = Number(n);
  return Number.isFinite(num) ? `$${num.toFixed(2)}` : "$0.00";
}

const SIZE_ORDER = ["20", "22", "24", "26", "28", "S", "M", "L", "XL", "XXL", "3XL"];

function payState(o) {
  if (o.feePaid) return "paid";
  if (o.feePaidAmount > 0) return "partial";
  return "unpaid";
}

// Admin-only: jersey orders from SEVERAL teams in one list, so one combined
// list can go to the printer. Shirts are sent in rounds ("print batches" —
// usually paid players first, the rest later), and each order remembers
// which batch it went out in, so nothing is printed twice or forgotten.
export default function CombinedJerseyOrders({ teams }) {
  const { t } = useLanguage();
  const c = (k) => t(`combinedJerseyOrders.${k}`);

  const [teamIds, setTeamIds] = useState([]);
  const [orders, setOrders] = useState([]);
  const [nextBatch, setNextBatch] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [payFilter, setPayFilter] = useState("all"); // all | paid | partial | unpaid | notPaid
  const [printFilter, setPrintFilter] = useState("notSent"); // all | notSent | sent | changed | batch:N
  const [typeFilter, setTypeFilter] = useState("all"); // all | player | fan

  const [selected, setSelected] = useState(() => new Set());
  const [batchInput, setBatchInput] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (teamIds.length === 0) {
      setOrders([]);
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.get("/teams/jersey-orders/combined", {
        params: { teams: teamIds.join(",") },
      });
      setOrders(data.orders || []);
      setNextBatch(data.nextBatch || 1);
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || c("failedToLoad"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSelected(new Set());
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamIds.join(",")]);

  const toggleTeam = (id) =>
    setTeamIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const allTeamsOn = teams.length > 0 && teamIds.length === teams.length;

  const batches = useMemo(
    () => [...new Set(orders.map((o) => o.printBatch).filter(Boolean))].sort((a, b) => a - b),
    [orders]
  );

  const visible = useMemo(() => {
    return orders
      .filter((o) => {
        const p = payState(o);
        if (payFilter === "notPaid" && p === "paid") return false;
        if (payFilter !== "all" && payFilter !== "notPaid" && p !== payFilter) return false;
        if (typeFilter === "player" && o.isFan) return false;
        if (typeFilter === "fan" && !o.isFan) return false;
        if (printFilter === "notSent" && o.printBatch) return false;
        if (printFilter === "sent" && !o.printBatch) return false;
        if (printFilter === "changed" && !o.changedAfterPrint) return false;
        if (printFilter.startsWith("batch:") && o.printBatch !== Number(printFilter.slice(6))) return false;
        return true;
      })
      .sort(
        (a, b) =>
          a.teamName.localeCompare(b.teamName) ||
          Number(a.isFan) - Number(b.isFan) ||
          a.jerseyNumber - b.jerseyNumber
      );
  }, [orders, payFilter, printFilter, typeFilter]);

  const key = (o) => `${o.teamId}:${o._id}`;
  const visibleSelected = visible.filter((o) => selected.has(key(o)));
  const allVisibleSelected = visible.length > 0 && visibleSelected.length === visible.length;

  const toggleRow = (o) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key(o)) ? next.delete(key(o)) : next.add(key(o));
      return next;
    });
  const toggleAllVisible = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visible.forEach((o) => next.delete(key(o)));
      else visible.forEach((o) => next.add(key(o)));
      return next;
    });

  // Size totals for whatever is currently visible — what the printer
  // actually needs to know to prepare blank shirts.
  const sizeTotals = useMemo(() => {
    const m = {};
    visible.forEach((o) => (m[o.jerseySize] = (m[o.jerseySize] || 0) + 1));
    return SIZE_ORDER.filter((s) => m[s]).map((s) => `${s}: ${m[s]}`);
  }, [visible]);

  const items = () => visibleSelected.map((o) => ({ teamId: o.teamId, orderId: o._id }));

  const markPrinted = async () => {
    if (visibleSelected.length === 0) return alert(c("selectFirst"));
    const batch = batchInput.trim() ? Number(batchInput) : nextBatch;
    if (!Number.isInteger(batch) || batch < 1) return alert(c("batchInvalid"));
    const already = visibleSelected.filter((o) => o.printBatch).length;
    let msg = c("confirmMark").replace("{count}", visibleSelected.length).replace("{batch}", batch);
    if (already) msg += "\n" + c("confirmMarkAlready").replace("{count}", already);
    if (!confirm(msg)) return;
    setBusy(true);
    try {
      await api.patch("/teams/jersey-orders/mark-printed", { items: items(), batch });
      setSelected(new Set());
      setBatchInput("");
      await load();
    } catch (err) {
      alert(err.response?.data?.message || t("common.failedToSave"));
    } finally {
      setBusy(false);
    }
  };

  const unmarkPrinted = async () => {
    if (visibleSelected.length === 0) return alert(c("selectFirst"));
    if (!confirm(c("confirmUnmark").replace("{count}", visibleSelected.length))) return;
    setBusy(true);
    try {
      await api.patch("/teams/jersey-orders/unmark-printed", { items: items() });
      setSelected(new Set());
      await load();
    } catch (err) {
      alert(err.response?.data?.message || t("common.failedToSave"));
    } finally {
      setBusy(false);
    }
  };

  const selectedTeamNames = teams.filter((tm) => teamIds.includes(tm._id)).map((tm) => tm.name);
  const printLabel =
    printFilter === "notSent"
      ? c("printNotSent")
      : printFilter === "sent"
      ? c("printSent")
      : printFilter === "changed"
      ? c("printChanged")
      : printFilter.startsWith("batch:")
      ? c("batchLabel").replace("{n}", printFilter.slice(6))
      : c("all");

  return (
    <div>
      {/* Team picker — several at once */}
      <div className="card no-print" style={{ marginBottom: 16 }}>
        <h4 style={{ marginTop: 0 }}>{c("chooseTeams")}</h4>
        <label style={{ fontWeight: 600, display: "block", marginBottom: 6 }}>
          <input
            type="checkbox"
            checked={allTeamsOn}
            onChange={() => setTeamIds(allTeamsOn ? [] : teams.map((tm) => tm._id))}
          />{" "}
          {c("allTeams")}
        </label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px" }}>
          {teams.map((tm) => (
            <label key={tm._id} style={{ fontWeight: "normal" }}>
              <input type="checkbox" checked={teamIds.includes(tm._id)} onChange={() => toggleTeam(tm._id)} />{" "}
              {tm.name}
            </label>
          ))}
        </div>
      </div>

      {teamIds.length === 0 ? (
        <p className="help-text">{c("chooseTeamsHelp")}</p>
      ) : loading ? (
        <p>{t("common.loading")}</p>
      ) : error ? (
        <p className="error-text">{error}</p>
      ) : (
        <>
          {/* Filters */}
          <div className="filter-row no-print">
            <div className="field">
              <label>{c("filterPay")}</label>
              <select value={payFilter} onChange={(e) => setPayFilter(e.target.value)}>
                <option value="all">{c("all")}</option>
                <option value="paid">{t("jerseyOrderManager.paidInFull")}</option>
                <option value="partial">{c("partial")}</option>
                <option value="unpaid">{t("jerseyOrderManager.unpaid")}</option>
                <option value="notPaid">{c("notPaidFull")}</option>
              </select>
            </div>
            <div className="field">
              <label>{c("filterPrint")}</label>
              <select value={printFilter} onChange={(e) => setPrintFilter(e.target.value)}>
                <option value="all">{c("all")}</option>
                <option value="notSent">{c("printNotSent")}</option>
                <option value="sent">{c("printSent")}</option>
                <option value="changed">{c("printChanged")}</option>
                {batches.map((b) => (
                  <option key={b} value={`batch:${b}`}>
                    {c("batchLabel").replace("{n}", b)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>{t("jerseyOrderManager.colType")}</label>
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                <option value="all">{c("all")}</option>
                <option value="player">{t("jerseyOrderManager.typePlayer")}</option>
                <option value="fan">{t("jerseyOrderManager.typeFan")}</option>
              </select>
            </div>
          </div>

          {/* Actions */}
          <div className="card no-print" style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end", marginBottom: 12 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>{c("batchNumber")}</label>
              <input
                type="number"
                min="1"
                value={batchInput}
                placeholder={String(nextBatch)}
                onChange={(e) => setBatchInput(e.target.value)}
                style={{ maxWidth: 90 }}
              />
            </div>
            <button className="btn btn-primary" disabled={busy} onClick={markPrinted}>
              {c("markButton").replace("{count}", visibleSelected.length)}
            </button>
            <button className="btn btn-outline" disabled={busy} onClick={unmarkPrinted}>
              {c("unmarkButton")}
            </button>
            <button className="btn btn-outline" onClick={() => window.print()}>
              {t("debtReport.printButton")}
            </button>
            <p className="help-text" style={{ margin: 0, flexBasis: "100%" }}>
              {c("workflowHint")}
            </p>
          </div>

          {/* Printed-page header */}
          <div className="print-only" style={{ marginBottom: 12 }}>
            <h2 style={{ margin: 0 }}>{c("printTitle")}</h2>
            <p style={{ margin: "4px 0" }}>
              {selectedTeamNames.join(", ")} · {printLabel} · {new Date().toLocaleDateString()}
            </p>
          </div>

          <p className="help-text" style={{ fontWeight: 600 }}>
            {c("countLine").replace("{count}", visible.length)}
            {sizeTotals.length > 0 && ` — ${sizeTotals.join(" · ")}`}
          </p>

          <div className="table-scroll">
            <table className="athletes">
              <thead>
                <tr>
                  <th className="no-print">
                    <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} />
                  </th>
                  <th>#</th>
                  <th>{t("common.team")}</th>
                  <th>{t("common.name")}</th>
                  <th>{t("jerseyOrderManager.colJerseyName")}</th>
                  <th>{t("jerseyOrderManager.colJerseyNumber")}</th>
                  <th>{t("jerseyOrderManager.colSize")}</th>
                  <th>{t("jerseyOrderManager.colType")}</th>
                  <th>{t("jerseyOrderManager.colNote")}</th>
                  <th>{t("jerseyOrderManager.colPaid")}</th>
                  <th>{c("colPrint")}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((o, i) => {
                  const p = payState(o);
                  return (
                    <tr key={key(o)}>
                      <td className="no-print">
                        <input type="checkbox" checked={selected.has(key(o))} onChange={() => toggleRow(o)} />
                      </td>
                      <td>{i + 1}</td>
                      <td data-label={t("common.team")}>{o.teamName}</td>
                      <td data-label={t("common.name")} className="caps-display">{o.fullName}</td>
                      <td data-label={t("jerseyOrderManager.colJerseyName")}>{o.jerseyName}</td>
                      <td data-label={t("jerseyOrderManager.colJerseyNumber")}>#{o.jerseyNumber}</td>
                      <td data-label={t("jerseyOrderManager.colSize")}>{o.jerseySize}</td>
                      <td data-label={t("jerseyOrderManager.colType")}>
                        {o.isFan ? t("jerseyOrderManager.typeFan") : t("jerseyOrderManager.typePlayer")}
                      </td>
                      <td data-label={t("jerseyOrderManager.colNote")}>{o.note || "—"}</td>
                      <td data-label={t("jerseyOrderManager.colPaid")}>
                        <span className={`badge ${p === "paid" ? "verified" : p === "partial" ? "pending" : "rejected"}`}>
                          {p === "paid"
                            ? t("jerseyOrderManager.paidInFull")
                            : p === "partial"
                            ? t("jerseyOrderManager.partialPaid").replace("{amount}", money(o.feePaidAmount))
                            : t("jerseyOrderManager.unpaid")}
                        </span>
                      </td>
                      <td data-label={c("colPrint")}>
                        {o.printBatch ? (
                          <>
                            <span className="badge verified">{c("batchLabel").replace("{n}", o.printBatch)}</span>
                            {o.sentToPrintAt && (
                              <span className="picker-meta" style={{ display: "block" }}>
                                {new Date(o.sentToPrintAt).toLocaleDateString()}
                              </span>
                            )}
                            {o.changedAfterPrint && (
                              <span className="badge rejected" style={{ display: "inline-block", marginTop: 4 }}>
                                {c("printChanged")}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="badge pending">{c("printNotSent")}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={11} style={{ textAlign: "center", color: "#777" }}>
                      {c("noneMatch")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
