import { useEffect, useState } from "react";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { resolveFileUrl } from "../utils/fileUrl";
import { useLanguage } from "../i18n/LanguageContext";

function money(n) {
  const num = Number(n);
  return Number.isFinite(num) ? `$${num.toFixed(2)}` : "$0.00";
}

// Shared by three places: the Head Coach's own-team tab (CoachDashboard,
// basePath "/teams/mine/jersey-orders"), an individual Player's own page
// (PlayerJerseyOrderPage, same "mine" basePath), and the Admin's per-team
// page (AdminJerseyOrders, basePath "/teams/:id/jersey-orders"). Whichever
// basePath is passed, the shape of every sub-route under it is identical
// (see backend/controllers/jerseyOrderController.js) — this component
// never needs to know which flavor it's talking to.
//
// `athletes` is this team's roster (already scoped to this one team by the
// caller), used only for the staff "register on behalf" picker — a Player
// registering themselves never needs it.
export default function JerseyOrderManager({ team, basePath, athletes = [] }) {
  const { t } = useLanguage();
  const { isPlayer, isHeadCoach, isAdmin, athleteId } = useAuth();
  const isStaff = isHeadCoach || isAdmin;

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actingId, setActingId] = useState(null);

  // Self-service register form (individual Player login only).
  const [selfName, setSelfName] = useState("");
  const [selfNumber, setSelfNumber] = useState("");
  const [selfSaving, setSelfSaving] = useState(false);
  const [selfError, setSelfError] = useState("");

  // Staff "register on behalf" form.
  const [pickAthleteId, setPickAthleteId] = useState("");
  const [pickName, setPickName] = useState("");
  const [pickNumber, setPickNumber] = useState("");
  const [pickSaving, setPickSaving] = useState(false);
  const [pickError, setPickError] = useState("");

  // Inline edit (jersey name/number) — self's own row or any row for staff.
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editNumber, setEditNumber] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Staff-only payment editor.
  const [payEditingId, setPayEditingId] = useState(null);
  const [payAmount, setPayAmount] = useState("");
  const [payPaid, setPayPaid] = useState(false);
  const [savingPay, setSavingPay] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(basePath);
      setOrders(data.orders || []);
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || t("jerseyOrderManager.failedToLoad"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basePath]);

  const myOrder = athleteId ? orders.find((o) => String(o.athlete) === String(athleteId)) : null;
  const registeredAthleteIds = new Set(orders.map((o) => String(o.athlete)));
  const pickableAthletes = athletes.filter((a) => !registeredAthleteIds.has(String(a._id)));

  const submitSelf = async (e) => {
    e.preventDefault();
    setSelfError("");
    const number = Number(selfNumber);
    if (!selfName.trim()) {
      setSelfError(t("jerseyOrderManager.jerseyNameRequired"));
      return;
    }
    if (!Number.isFinite(number) || number < 0 || number > 99) {
      setSelfError(t("jerseyOrderManager.jerseyNumberInvalid"));
      return;
    }
    setSelfSaving(true);
    try {
      await api.post(basePath, { jerseyName: selfName.trim(), jerseyNumber: number });
      setSelfName("");
      setSelfNumber("");
      load();
    } catch (err) {
      setSelfError(err.response?.data?.message || t("jerseyOrderManager.failedToRegister"));
    } finally {
      setSelfSaving(false);
    }
  };

  const submitOnBehalf = async (e) => {
    e.preventDefault();
    setPickError("");
    const number = Number(pickNumber);
    if (!pickAthleteId) {
      setPickError(t("jerseyOrderManager.chooseAthlete"));
      return;
    }
    if (!pickName.trim()) {
      setPickError(t("jerseyOrderManager.jerseyNameRequired"));
      return;
    }
    if (!Number.isFinite(number) || number < 0 || number > 99) {
      setPickError(t("jerseyOrderManager.jerseyNumberInvalid"));
      return;
    }
    setPickSaving(true);
    try {
      await api.post(`${basePath}/register-admin`, {
        athleteId: pickAthleteId,
        jerseyName: pickName.trim(),
        jerseyNumber: number,
      });
      setPickAthleteId("");
      setPickName("");
      setPickNumber("");
      load();
    } catch (err) {
      setPickError(err.response?.data?.message || t("jerseyOrderManager.failedToRegister"));
    } finally {
      setPickSaving(false);
    }
  };

  const startEdit = (order) => {
    setEditingId(order._id);
    setEditName(order.jerseyName);
    setEditNumber(String(order.jerseyNumber));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditNumber("");
  };

  const saveEdit = async (order) => {
    const number = Number(editNumber);
    if (!editName.trim()) {
      alert(t("jerseyOrderManager.jerseyNameRequired"));
      return;
    }
    if (!Number.isFinite(number) || number < 0 || number > 99) {
      alert(t("jerseyOrderManager.jerseyNumberInvalid"));
      return;
    }
    setSavingEdit(true);
    try {
      await api.patch(`${basePath}/${order._id}`, { jerseyName: editName.trim(), jerseyNumber: number });
      cancelEdit();
      load();
    } catch (err) {
      alert(err.response?.data?.message || t("common.failedToSave"));
    } finally {
      setSavingEdit(false);
    }
  };

  const startPay = (order) => {
    setPayEditingId(order._id);
    setPayAmount(String(order.feePaidAmount || 0));
    setPayPaid(!!order.feePaid);
  };

  const cancelPay = () => {
    setPayEditingId(null);
    setPayAmount("");
    setPayPaid(false);
  };

  const savePay = async (order) => {
    const amount = Number(payAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      alert(t("jerseyOrderManager.amountInvalid"));
      return;
    }
    setSavingPay(true);
    try {
      await api.patch(`${basePath}/${order._id}/paid`, { amount, paid: payPaid });
      cancelPay();
      load();
    } catch (err) {
      alert(err.response?.data?.message || t("common.failedToSave"));
    } finally {
      setSavingPay(false);
    }
  };

  // Same DELETE endpoint for three different situations, so the confirm
  // wording has to match which one this actually is: a Player requesting
  // their OWN cancellation (needs Admin/Head Coach approval — doesn't
  // remove it yet), staff confirming a request that's already pending, or
  // staff removing an order outright (immediate, as always).
  const removeOrder = async (order) => {
    const isMine = isPlayer && athleteId && String(order.athlete) === String(athleteId);
    const confirmMsg = isMine
      ? t("jerseyOrderManager.confirmCancelRequest")
      : order.pendingRemoval
      ? t("jerseyOrderManager.confirmConfirmCancel").replace("{name}", order.fullName)
      : t("jerseyOrderManager.confirmRemove").replace("{name}", order.fullName);
    if (!confirm(confirmMsg)) return;
    setActingId(order._id);
    try {
      await api.delete(`${basePath}/${order._id}`);
      load();
    } catch (err) {
      alert(err.response?.data?.message || t("jerseyOrderManager.failedToRemove"));
    } finally {
      setActingId(null);
    }
  };

  // Declines a player's own pending cancellation request — the order stays
  // as-is, same "keep" idea as the athlete-assignment/tournament flows.
  const keepOrder = async (order) => {
    setActingId(order._id);
    try {
      await api.patch(`${basePath}/${order._id}/keep`);
      load();
    } catch (err) {
      alert(err.response?.data?.message || t("jerseyOrderManager.failedToKeep"));
    } finally {
      setActingId(null);
    }
  };

  if (!team) return <p className="help-text">{t("jerseyOrderManager.chooseTeamFirst")}</p>;
  if (loading) return <p>{t("common.loading")}</p>;
  if (error) return <p className="error-text">{error}</p>;

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>
        {t("jerseyOrderManager.title")} — {team}
      </h3>
      <p className="help-text" style={{ marginTop: -6 }}>
        {t("jerseyOrderManager.intro")}
      </p>

      {/* Self-service register form — individual Player login, no order yet */}
      {isPlayer && athleteId && !myOrder && (
        <form className="card" style={{ maxWidth: 420, marginBottom: 24 }} onSubmit={submitSelf}>
          <h4 style={{ marginTop: 0 }}>{t("jerseyOrderManager.registerMine")}</h4>
          <div className="field">
            <label>{t("jerseyOrderManager.jerseyNameLabel")}</label>
            <input value={selfName} onChange={(e) => setSelfName(e.target.value)} required />
          </div>
          <div className="field">
            <label>{t("jerseyOrderManager.jerseyNumberLabel")}</label>
            <input type="number" min="0" max="99" value={selfNumber} onChange={(e) => setSelfNumber(e.target.value)} required />
          </div>
          {selfError && <div className="error-text">{selfError}</div>}
          <button className="btn btn-primary" disabled={selfSaving}>
            {selfSaving ? t("jerseyOrderManager.registering") : t("jerseyOrderManager.registerButton")}
          </button>
        </form>
      )}

      {/* Staff "register on behalf" form */}
      {isStaff && (
        <form className="card" style={{ maxWidth: 480, marginBottom: 24 }} onSubmit={submitOnBehalf}>
          <h4 style={{ marginTop: 0 }}>{t("jerseyOrderManager.registerOnBehalf")}</h4>
          <div className="field">
            <label>{t("common.name")}</label>
            <select value={pickAthleteId} onChange={(e) => setPickAthleteId(e.target.value)} required>
              <option value="">{t("jerseyOrderManager.choosePlaceholder")}</option>
              {pickableAthletes.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.fullName}
                  {a.khmerName ? ` (${a.khmerName})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-row" style={{ marginBottom: 0 }}>
            <div className="field" style={{ flex: 1, minWidth: 140 }}>
              <label>{t("jerseyOrderManager.jerseyNameLabel")}</label>
              <input value={pickName} onChange={(e) => setPickName(e.target.value)} required />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 100 }}>
              <label>{t("jerseyOrderManager.jerseyNumberLabel")}</label>
              <input type="number" min="0" max="99" value={pickNumber} onChange={(e) => setPickNumber(e.target.value)} required />
            </div>
          </div>
          {pickError && <div className="error-text">{pickError}</div>}
          <button className="btn btn-primary" disabled={pickSaving} style={{ marginTop: 8 }}>
            {pickSaving ? t("jerseyOrderManager.registering") : t("jerseyOrderManager.registerButton")}
          </button>
        </form>
      )}

      <div className="table-scroll">
        <table className="athletes">
          <thead>
            <tr>
              <th>{t("common.photo")}</th>
              <th>{t("common.name")}</th>
              <th>{t("jerseyOrderManager.colJerseyName")}</th>
              <th>{t("jerseyOrderManager.colJerseyNumber")}</th>
              <th>{t("jerseyOrderManager.colPaid")}</th>
              <th>{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => {
              const isMine = isPlayer && athleteId && String(order.athlete) === String(athleteId);
              const canEdit = isMine || isStaff;
              const isEditing = editingId === order._id;
              const isPayEditing = payEditingId === order._id;
              return (
                <tr key={order._id}>
                  <td data-label={t("common.photo")}>
                    <img
                      src={order.photoUrl ? resolveFileUrl(order.photoUrl) : "https://placehold.co/50x50?text=Photo"}
                      alt={order.fullName}
                      className="small-photo"
                    />
                  </td>
                  <td data-label={t("common.name")} className="caps-display">
                    {order.fullName}
                    {order.registeredBy && (
                      <span className="picker-meta" style={{ display: "block" }}>
                        {t("jerseyOrderManager.byStaff")}
                      </span>
                    )}
                  </td>
                  <td data-label={t("jerseyOrderManager.colJerseyName")}>
                    {isEditing ? (
                      <input value={editName} onChange={(e) => setEditName(e.target.value)} style={{ maxWidth: 140 }} />
                    ) : (
                      order.jerseyName
                    )}
                  </td>
                  <td data-label={t("jerseyOrderManager.colJerseyNumber")}>
                    {isEditing ? (
                      <input
                        type="number"
                        min="0"
                        max="99"
                        value={editNumber}
                        onChange={(e) => setEditNumber(e.target.value)}
                        style={{ maxWidth: 70 }}
                      />
                    ) : (
                      `#${order.jerseyNumber}`
                    )}
                  </td>
                  <td data-label={t("jerseyOrderManager.colPaid")}>
                    {isPayEditing ? (
                      <span style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 140 }}>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={payAmount}
                          onChange={(e) => setPayAmount(e.target.value)}
                          style={{ maxWidth: 90 }}
                        />
                        <label style={{ fontWeight: "normal" }}>
                          <input type="checkbox" checked={payPaid} onChange={(e) => setPayPaid(e.target.checked)} />{" "}
                          {t("jerseyOrderManager.paidInFullCheckbox")}
                        </label>
                      </span>
                    ) : (
                      <>
                        <span className={`badge ${order.feePaid ? "verified" : order.feePaidAmount > 0 ? "pending" : "rejected"}`}>
                          {order.feePaid
                            ? t("jerseyOrderManager.paidInFull")
                            : order.feePaidAmount > 0
                            ? t("jerseyOrderManager.partialPaid").replace("{amount}", money(order.feePaidAmount))
                            : t("jerseyOrderManager.unpaid")}
                        </span>
                      </>
                    )}
                  </td>
                  <td data-label={t("common.actions")} className="actions-cell">
                    {isEditing ? (
                      <>
                        <button className="link-btn" onClick={() => saveEdit(order)} disabled={savingEdit}>
                          {savingEdit ? t("common.saving") : t("common.save")}
                        </button>
                        <button className="link-btn" onClick={cancelEdit}>
                          {t("common.cancel")}
                        </button>
                      </>
                    ) : isPayEditing ? (
                      <>
                        <button className="link-btn" onClick={() => savePay(order)} disabled={savingPay}>
                          {savingPay ? t("common.saving") : t("common.save")}
                        </button>
                        <button className="link-btn" onClick={cancelPay}>
                          {t("common.cancel")}
                        </button>
                      </>
                    ) : (
                      <>
                        {canEdit && (
                          <button className="link-btn" onClick={() => startEdit(order)}>
                            {t("common.edit")}
                          </button>
                        )}
                        {isStaff && (
                          <button className="link-btn" onClick={() => startPay(order)}>
                            {t("jerseyOrderManager.setPaid")}
                          </button>
                        )}
                        {order.pendingRemoval && (
                          <span className="badge pending" style={{ marginRight: 6 }}>
                            {t("jerseyOrderManager.cancelRequestedBadge")}
                          </span>
                        )}
                        {isStaff && order.pendingRemoval && (
                          <>
                            <button
                              className="action-btn danger"
                              disabled={actingId === order._id}
                              onClick={() => removeOrder(order)}
                            >
                              {t("jerseyOrderManager.confirmCancelButton")}
                            </button>
                            <button
                              className="action-btn positive"
                              disabled={actingId === order._id}
                              onClick={() => keepOrder(order)}
                            >
                              {t("jerseyOrderManager.keepButton")}
                            </button>
                          </>
                        )}
                        {isStaff && !order.pendingRemoval && (
                          <button className="link-btn" disabled={actingId === order._id} onClick={() => removeOrder(order)}>
                            {t("common.remove")}
                          </button>
                        )}
                        {isMine && !isStaff && !order.pendingRemoval && (
                          <button className="link-btn" disabled={actingId === order._id} onClick={() => removeOrder(order)}>
                            {t("common.cancel")}
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            {orders.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", color: "#777" }}>
                  {t("jerseyOrderManager.noneYet")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
