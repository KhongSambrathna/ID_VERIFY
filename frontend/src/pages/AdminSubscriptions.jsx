import { Fragment, useEffect, useState } from "react";
import api from "../api/axios";
import { resolveFileUrl } from "../utils/fileUrl";
import { useLanguage } from "../i18n/LanguageContext";

const PLAN_ORDER = ["BASIC", "PRO", "PRO_MAX", "UNLIMITED"];
const CYCLE_ORDER = ["MONTHLY", "HALF_YEAR", "YEARLY"];

function formatDate(d) {
  const date = new Date(d);
  if (isNaN(date)) return "";
  return date.toISOString().slice(0, 10);
}

// Admin-only — every team's plan subscription (Basic / Pro / Pro Max /
// Unlimited, each billable Monthly / every 6 months / Yearly) is recorded
// here by hand (bank transfer, Wing/ABA, Telegram, cash, ...); there is no
// in-app payment gateway. Recording a payment here is what unlocks that
// team's Head Coach management tools again, and sets the player cap the
// backend enforces on that team's roster — see RequireActiveSubscription.jsx
// and backend/utils/subscriptionPlans.js (the single source of truth this
// page's pricing table is read from, not hard-coded here).
export default function AdminSubscriptions() {
  const { t } = useLanguage();
  const [teams, setTeams] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [openHistoryId, setOpenHistoryId] = useState(null);

  // Each team's crest/logo (shown next to the QR code on that team's ID
  // cards — see IDCard.jsx) can be uploaded/replaced/removed right here by
  // an Admin, for any team, without needing that team's own Head Coach to
  // do it (they can also self-manage it from their own dashboard).
  const [logoFiles, setLogoFiles] = useState({});
  const [logoBusyId, setLogoBusyId] = useState(null);
  const [logoErrors, setLogoErrors] = useState({});

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: teamData }, { data: planData }] = await Promise.all([
        api.get("/teams"),
        api.get("/teams/plans"),
      ]);
      setTeams(teamData);
      setPlans(planData);
    } catch (err) {
      setError(err.response?.data?.message || t("common.failedToLoad"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const planByKey = (key) => plans.find((p) => p.key === key);
  const priceOf = (planKey, cycle) => planByKey(planKey)?.pricing.find((p) => p.billingCycle === cycle);

  // A history entry recorded before the tiered-plan system existed (the
  // original flat $15/year batch) has no plan/billingCycle at all — fall
  // back to an em dash instead of rendering a blank gap next to it.
  const planLabel = (key) =>
    key
      ? {
          BASIC: t("adminSubscriptions.planBasic"),
          PRO: t("adminSubscriptions.planPro"),
          PRO_MAX: t("adminSubscriptions.planProMax"),
          UNLIMITED: t("adminSubscriptions.planUnlimited"),
        }[key] || key
      : "—";

  const cycleLabel = (key) =>
    key
      ? {
          MONTHLY: t("adminSubscriptions.cycleMonthly"),
          HALF_YEAR: t("adminSubscriptions.cycleHalfYear"),
          YEARLY: t("adminSubscriptions.cycleYearly"),
        }[key] || key
      : "—";

  const draftFor = (team) =>
    drafts[team._id] || { plan: team.subscriptionPlan || "PRO", billingCycle: "YEARLY", amount: "", note: "" };

  const updateDraft = (team, key, value) =>
    setDrafts({ ...drafts, [team._id]: { ...draftFor(team), [key]: value } });

  const recordPayment = async (team) => {
    const draft = draftFor(team);
    setSavingId(team._id);
    try {
      await api.post(`/teams/${team._id}/subscription`, {
        plan: draft.plan,
        billingCycle: draft.billingCycle,
        amount: draft.amount === "" ? undefined : draft.amount,
        note: draft.note,
      });
      setDrafts({ ...drafts, [team._id]: { plan: draft.plan, billingCycle: draft.billingCycle, amount: "", note: "" } });
      load();
    } catch (err) {
      alert(err.response?.data?.message || t("common.failedToSave"));
    } finally {
      setSavingId(null);
    }
  };

  // Immediately cuts off an active subscription instead of waiting for its
  // natural expiry — for testing the paywall lock, or for a customer
  // refund. Asks for confirmation and an optional reason, which is stored
  // in that team's payment history (see teamController.revokeSubscription).
  const revokeSubscription = async (team) => {
    if (!window.confirm(t("adminSubscriptions.revokeConfirm").replace("{team}", team.name))) return;
    const note = window.prompt(t("adminSubscriptions.revokeNotePrompt"), "") || "";
    setSavingId(team._id);
    try {
      await api.post(`/teams/${team._id}/subscription/revoke`, { note });
      load();
    } catch (err) {
      alert(err.response?.data?.message || t("common.failedToSave"));
    } finally {
      setSavingId(null);
    }
  };

  const uploadLogo = async (team) => {
    const file = logoFiles[team._id];
    if (!file) return;
    setLogoBusyId(team._id);
    setLogoErrors({ ...logoErrors, [team._id]: "" });
    try {
      const formData = new FormData();
      formData.append("logo", file);
      await api.put(`/teams/${team._id}/logo`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setLogoFiles({ ...logoFiles, [team._id]: null });
      load();
    } catch (err) {
      setLogoErrors({ ...logoErrors, [team._id]: err.response?.data?.message || t("common.failedToSave") });
    } finally {
      setLogoBusyId(null);
    }
  };

  const removeLogo = async (team) => {
    if (!window.confirm(t("adminSubscriptions.confirmRemoveLogo").replace("{team}", team.name))) return;
    setLogoBusyId(team._id);
    setLogoErrors({ ...logoErrors, [team._id]: "" });
    try {
      await api.delete(`/teams/${team._id}/logo`);
      load();
    } catch (err) {
      setLogoErrors({ ...logoErrors, [team._id]: err.response?.data?.message || t("common.failedToSave") });
    } finally {
      setLogoBusyId(null);
    }
  };

  const statusOf = (team) => {
    const expiresAt = team.subscriptionExpiresAt;
    if (!expiresAt) return "never";
    return new Date(expiresAt).getTime() > Date.now() ? "active" : "expired";
  };

  return (
    <div className="container dash-body">
      <div className="dash-header">
        <h2>{t("adminSubscriptions.title")}</h2>
        <p>{t("adminSubscriptions.intro")}</p>
      </div>

      {loading && <p>{t("common.loading")}</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && (
        <>
          {/* Pricing reference — read from the backend's plan table, so it can
              never drift out of sync with what recording a payment actually
              charges/caps below. */}
          <div className="table-scroll" style={{ marginBottom: 28 }}>
            <table className="athletes">
              <thead>
                <tr>
                  <th>{t("adminSubscriptions.planHeader")}</th>
                  <th>{t("adminSubscriptions.maxPlayersHeader")}</th>
                  {CYCLE_ORDER.map((cycle) => (
                    <th key={cycle}>{cycleLabel(cycle)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PLAN_ORDER.map((key) => {
                  const plan = planByKey(key);
                  if (!plan) return null;
                  return (
                    <tr key={key}>
                      <td data-label={t("adminSubscriptions.planHeader")}>{planLabel(key)}</td>
                      <td data-label={t("adminSubscriptions.maxPlayersHeader")}>
                        {plan.maxPlayers == null ? t("adminSubscriptions.unlimitedPlayers") : plan.maxPlayers}
                      </td>
                      {CYCLE_ORDER.map((cycle) => {
                        const price = plan.pricing.find((p) => p.billingCycle === cycle);
                        return (
                          <td key={cycle} data-label={cycleLabel(cycle)}>
                            {price ? `$${price.pricePerMonth}/${t("adminSubscriptions.perMonthShort")} ($${price.total})` : "—"}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="table-scroll">
            <table className="athletes">
              <thead>
                <tr>
                  <th>{t("common.team")}</th>
                  <th>{t("adminSubscriptions.logoHeader")}</th>
                  <th>{t("common.status")}</th>
                  <th>{t("adminSubscriptions.planHeader")}</th>
                  <th>{t("adminSubscriptions.expiresHeader")}</th>
                  <th>{t("adminSubscriptions.recordPaymentHeader")}</th>
                </tr>
              </thead>
              <tbody>
                {teams.map((team) => {
                  const status = statusOf(team);
                  const draft = draftFor(team);
                  const history = team.subscriptionHistory || [];
                  const currentPlan = planByKey(team.subscriptionPlan);
                  const priceNow = priceOf(draft.plan, draft.billingCycle);
                  return (
                    <Fragment key={team._id}>
                      <tr>
                        <td data-label={t("common.team")} className="caps-display">{team.name}</td>
                        <td data-label={t("adminSubscriptions.logoHeader")}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                            {team.logoUrl && (
                              <img
                                src={resolveFileUrl(team.logoUrl)}
                                alt={`${team.name} logo`}
                                style={{ width: 36, height: 36, objectFit: "contain", borderRadius: "50%", border: "1px solid var(--line)" }}
                              />
                            )}
                            <input
                              type="file"
                              accept="image/*"
                              style={{ width: 130, fontSize: 11 }}
                              disabled={logoBusyId === team._id}
                              onChange={(e) => setLogoFiles({ ...logoFiles, [team._id]: e.target.files[0] })}
                            />
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              <button
                                type="button"
                                className="link-btn"
                                disabled={!logoFiles[team._id] || logoBusyId === team._id}
                                onClick={() => uploadLogo(team)}
                              >
                                {logoBusyId === team._id ? t("adminSubscriptions.logoSaving") : t("adminSubscriptions.logoSave")}
                              </button>
                              {team.logoUrl && (
                                <button
                                  type="button"
                                  className="link-btn"
                                  disabled={logoBusyId === team._id}
                                  onClick={() => removeLogo(team)}
                                >
                                  {t("adminSubscriptions.logoRemove")}
                                </button>
                              )}
                            </div>
                            {logoErrors[team._id] && (
                              <p className="error-text" style={{ margin: 0, fontSize: 11 }}>
                                {logoErrors[team._id]}
                              </p>
                            )}
                          </div>
                        </td>
                        <td data-label={t("common.status")}>
                          {status === "active" && (
                            <span className="badge verified">{t("adminSubscriptions.statusActive")}</span>
                          )}
                          {status === "expired" && (
                            <span className="badge rejected">{t("adminSubscriptions.statusExpired")}</span>
                          )}
                          {status === "never" && (
                            <span className="badge pending">{t("adminSubscriptions.statusNever")}</span>
                          )}
                        </td>
                        <td data-label={t("adminSubscriptions.planHeader")}>
                          {team.subscriptionPlan ? (
                            <>
                              {planLabel(team.subscriptionPlan)}
                              <br />
                              <span className="help-text" style={{ margin: 0 }}>
                                {team.playerCount ?? 0}/
                                {currentPlan?.maxPlayers == null ? "∞" : currentPlan.maxPlayers}{" "}
                                {t("adminSubscriptions.playersLabel")}
                              </span>
                            </>
                          ) : (
                            <span className="help-text" style={{ margin: 0 }}>
                              {team.playerCount ?? 0} {t("adminSubscriptions.playersLabel")}
                            </span>
                          )}
                        </td>
                        <td data-label={t("adminSubscriptions.expiresHeader")}>
                          {team.subscriptionExpiresAt ? formatDate(team.subscriptionExpiresAt) : "—"}{" "}
                          {history.length > 0 && (
                            <button
                              type="button"
                              className="link-btn"
                              onClick={() => setOpenHistoryId(openHistoryId === team._id ? null : team._id)}
                            >
                              {openHistoryId === team._id
                                ? t("adminSubscriptions.hideHistory")
                                : t("adminSubscriptions.showHistory").replace("{count}", history.length)}
                            </button>
                          )}
                        </td>
                        <td data-label={t("adminSubscriptions.recordPaymentHeader")} className="actions-cell">
                          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                            <select
                              value={draft.plan}
                              onChange={(e) => updateDraft(team, "plan", e.target.value)}
                              disabled={savingId === team._id}
                            >
                              {PLAN_ORDER.map((key) => (
                                <option key={key} value={key}>
                                  {planLabel(key)}
                                </option>
                              ))}
                            </select>
                            <select
                              value={draft.billingCycle}
                              onChange={(e) => updateDraft(team, "billingCycle", e.target.value)}
                              disabled={savingId === team._id}
                            >
                              {CYCLE_ORDER.map((cycle) => (
                                <option key={cycle} value={cycle}>
                                  {cycleLabel(cycle)}
                                </option>
                              ))}
                            </select>
                            {priceNow && (
                              <span className="help-text" style={{ margin: 0 }}>
                                ${priceNow.total}
                              </span>
                            )}
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              style={{ width: 70 }}
                              placeholder={priceNow ? String(priceNow.total) : t("adminSubscriptions.amountLabel")}
                              title={t("adminSubscriptions.amountOverrideLabel")}
                              value={draft.amount}
                              onChange={(e) => updateDraft(team, "amount", e.target.value)}
                              disabled={savingId === team._id}
                            />
                            <input
                              type="text"
                              style={{ width: 130 }}
                              placeholder={t("adminSubscriptions.notePlaceholder")}
                              value={draft.note}
                              onChange={(e) => updateDraft(team, "note", e.target.value)}
                              disabled={savingId === team._id}
                            />
                            <button
                              type="button"
                              className="action-btn positive"
                              disabled={savingId === team._id}
                              onClick={() => recordPayment(team)}
                            >
                              {savingId === team._id
                                ? t("adminSubscriptions.recording")
                                : t("adminSubscriptions.recordPaymentBtn")}
                            </button>
                            {status === "active" && (
                              <button
                                type="button"
                                className="action-btn danger"
                                disabled={savingId === team._id}
                                onClick={() => revokeSubscription(team)}
                                title={t("adminSubscriptions.revokeHint")}
                              >
                                {t("adminSubscriptions.revokeBtn")}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {openHistoryId === team._id && (
                        <tr>
                          <td colSpan={6}>
                            <ul className="fee-items">
                              {[...history].reverse().map((h, i) => (
                                <li key={i}>
                                  {planLabel(h.plan)} · {cycleLabel(h.billingCycle)} · ${h.amount} ·{" "}
                                  {t("adminSubscriptions.paidOn")} {formatDate(h.paidAt)} ·{" "}
                                  {t("adminSubscriptions.expiresHeader")} {formatDate(h.expiresAt)}
                                  {h.note ? ` · ${h.note}` : ""}
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {teams.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", color: "#777" }}>
                      {t("adminSubscriptions.noTeams")}
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
