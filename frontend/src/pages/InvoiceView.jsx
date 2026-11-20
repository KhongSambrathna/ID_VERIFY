import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../api/axios";
import { useLanguage } from "../i18n/LanguageContext";
import { formatUSD, approxKHR } from "../utils/currency";
import { SHOP_INFO, INVOICE_TEXT } from "../utils/shopInfo";

function fmtDate(d) {
  return new Date(d).toLocaleDateString("en-GB", { timeZone: "Asia/Phnom_Penh" });
}
const fmtQty = (n) => (Number.isInteger(n) ? n : Number(n).toFixed(2));

// One invoice, laid out for printing (A5/A4). The ខ្មែរ / English switch
// changes only the invoice's own wording — not the rest of the site.
// Admin can also record a payment, cancel (void → stock returns) or delete.
export default function InvoiceView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [inv, setInv] = useState(null);
  const [error, setError] = useState("");
  const [lang, setLang] = useState("km");
  const [payInput, setPayInput] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get(`/invoices/${id}`);
      setInv(data);
      setLang(data.language || "km");
      setPayInput(String(data.paidAmount ?? 0));
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || t("invoices.failedToLoad"));
    }
  };
  useEffect(() => {
    load();
  }, [id]);

  if (error) return <div className="container dash-body"><p className="error-text">{error}</p></div>;
  if (!inv) return <div className="container dash-body"><p>{t("common.loading")}</p></div>;

  const L = INVOICE_TEXT[lang];
  const balance = Math.max(inv.total - inv.paidAmount, 0);

  const savePayment = async () => {
    setBusy(true);
    try {
      const { data } = await api.patch(`/invoices/${id}`, { paidAmount: Number(payInput) || 0 });
      setInv(data);
    } catch (err) {
      alert(err.response?.data?.message || t("invoices.failedToSave"));
    } finally {
      setBusy(false);
    }
  };
  const doVoid = async () => {
    if (!confirm(t("invoices.confirmVoid").replace("{no}", inv.invoiceNo))) return;
    setBusy(true);
    try {
      const { data } = await api.patch(`/invoices/${id}/void`);
      setInv(data);
    } catch (err) {
      alert(err.response?.data?.message || t("invoices.failedToSave"));
    } finally {
      setBusy(false);
    }
  };
  const doDelete = async () => {
    if (!confirm(t("invoices.confirmDelete").replace("{no}", inv.invoiceNo))) return;
    setBusy(true);
    try {
      await api.delete(`/invoices/${id}`);
      navigate("/admin/invoices");
    } catch (err) {
      alert(err.response?.data?.message || t("invoices.failedToSave"));
      setBusy(false);
    }
  };

  return (
    <div className="container dash-body">
      {/* Toolbar — not printed */}
      <div className="invoice-toolbar no-print">
        <Link to="/admin/invoices" className="link-btn">← {t("invoices.backToList")}</Link>
        <div className="seg-toggle">
          <button type="button" className={lang === "km" ? "active" : ""} onClick={() => setLang("km")}>ខ្មែរ</button>
          <button type="button" className={lang === "en" ? "active" : ""} onClick={() => setLang("en")}>English</button>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>🖨️ {t("invoices.print")}</button>
      </div>

      {/* The invoice itself */}
      <div className={`invoice-paper ${inv.voided ? "is-void" : ""}`} lang={lang}>
        {inv.voided && <div className="invoice-void-stamp">{L.status.VOID}</div>}
        <header className="invoice-head">
          <div className="invoice-shop">
            <img src={SHOP_INFO.logo} alt="" />
            <div>
              <div className="invoice-shop-name">{SHOP_INFO.name}</div>
              <div>{SHOP_INFO.address[lang]}</div>
              <div>{L.phone}: {SHOP_INFO.phone}</div>
            </div>
          </div>
          <div className="invoice-title-box">
            <div className="invoice-title">{L.title}</div>
            <table>
              <tbody>
                <tr><td>{L.invoiceNo}</td><td><b>{inv.invoiceNo}</b></td></tr>
                <tr><td>{L.date}</td><td>{fmtDate(inv.date)}</td></tr>
              </tbody>
            </table>
          </div>
        </header>

        <section className="invoice-customer">
          <div className="invoice-section-label">{L.billTo}</div>
          <div><span>{L.customerName}:</span> {inv.customer?.name || "………………………………"}</div>
          <div><span>{L.customerPhone}:</span> {inv.customer?.phone || "………………………"}</div>
          <div><span>{L.customerAddress}:</span> {inv.customer?.address || "………………………………………………"}</div>
        </section>

        <table className="invoice-items">
          <thead>
            <tr>
              <th style={{ width: 40 }}>{L.no}</th>
              <th>{L.description}</th>
              <th style={{ width: 70 }}>{L.qty}</th>
              <th style={{ width: 100 }}>{L.unitPrice}</th>
              <th style={{ width: 110 }}>{L.amount}</th>
            </tr>
          </thead>
          <tbody>
            {inv.items.map((it, i) => (
              <tr key={it._id || i}>
                <td className="c">{i + 1}</td>
                <td>{it.name}</td>
                <td className="c">{fmtQty(it.quantity)}{it.unit ? ` ${it.unit}` : ""}</td>
                <td className="r">{formatUSD(it.unitPrice)}</td>
                <td className="r">{formatUSD(it.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="invoice-bottom">
          <div className="invoice-note">
            {inv.note && (
              <>
                <div className="invoice-section-label">{L.note}</div>
                <div style={{ whiteSpace: "pre-wrap" }}>{inv.note}</div>
              </>
            )}
          </div>
          <table className="invoice-sum">
            <tbody>
              <tr><td>{L.subtotal}</td><td className="r">{formatUSD(inv.subtotal)}</td></tr>
              {inv.discount > 0 && <tr><td>{L.discount}</td><td className="r">−{formatUSD(inv.discount)}</td></tr>}
              <tr className="grand">
                <td>{L.total}</td>
                <td className="r">
                  {formatUSD(inv.total)}
                  <div className="invoice-khr">{approxKHR(inv.total)}</div>
                </td>
              </tr>
              <tr><td>{L.paid}</td><td className="r">{formatUSD(inv.paidAmount)}</td></tr>
              <tr className="balance">
                <td>{L.balance}</td>
                <td className="r">
                  {formatUSD(balance)}
                  {balance > 0 && <div className="invoice-khr">{approxKHR(balance)}</div>}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="invoice-signs">
          <div><div className="line" />{L.customerSign}</div>
          <div><div className="line" />{L.sellerSign}</div>
        </div>
        <div className="invoice-thanks">{L.thanks}</div>
      </div>

      {/* Admin actions — not printed */}
      <div className="card no-print invoice-actions">
        <div>
          <b>{t("common.status")}:</b> {L.status[inv.status]}
        </div>
        {!inv.voided && (
          <div className="invoice-pay">
            <label>{t("invoices.paid")} ($)</label>
            <input type="number" min="0" step="0.01" value={payInput} onChange={(e) => setPayInput(e.target.value)} />
            <button type="button" className="link-btn" onClick={() => setPayInput(String(inv.total))}>{t("invoices.paidInFull")}</button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={savePayment}>{t("common.save")}</button>
          </div>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {!inv.voided && (
            <button type="button" className="btn btn-outline" disabled={busy} onClick={doVoid}>⊘ {t("invoices.void")}</button>
          )}
          <button type="button" className="btn btn-danger" disabled={busy} onClick={doDelete}>🗑 {t("common.delete")}</button>
        </div>
        <p className="mini-empty" style={{ flexBasis: "100%", margin: 0 }}>{t("invoices.voidHelp")}</p>
      </div>
    </div>
  );
}
