import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../api/axios";
import { resolveFileUrl } from "../utils/fileUrl";
import { useLanguage } from "../i18n/LanguageContext";

// PUBLIC self-registration page — reached from the shareable link a Head
// Coach sends (…/register/<token>). No login needed: the whole point is the
// player doesn't have an account yet. On load it validates the token, shows
// which team they're joining, and lets them fill in their OWN details (name,
// DOB, photo, ID documents…). Submitting creates a PENDING record and reveals
// their ID + default password to write down — the login itself is only created
// once an Admin approves (see backend/utils/playerAccount.js).
export default function PlayerRegister() {
  const { token } = useParams();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [linkError, setLinkError] = useState("");

  const [form, setForm] = useState({
    fullName: "",
    khmerName: "",
    dateOfBirth: "",
    gender: "male",
    address: "",
    isAvailable: "true",
  });
  const [photo, setPhoto] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Set only after a successful submit — flips the page to the "here's your
  // ID + password, write it down" success screen.
  const [result, setResult] = useState(null);

  // Duplicate-name search (English name only) — as the player types their
  // name, list anyone already in the system with the same/similar name, so
  // someone who's already on another team can join THIS team too instead of
  // creating a second profile. "dismissed" hides the list once they confirm
  // they're a brand-new person (or after they pick a match).
  const [duplicates, setDuplicates] = useState([]);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [dismissedDuplicates, setDismissedDuplicates] = useState(false);
  const [claimingId, setClaimingId] = useState(null);

  // Set when submit is blocked because the name already exists on another
  // team — the player must confirm before anything is created or claimed.
  const [duplicateConflict, setDuplicateConflict] = useState(null);
  // When true, re-submit bypasses the duplicate-in-other-team guard (player
  // confirmed they're a different person and wants to register as new).
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .get(`/registration/invites/${token}`)
      .then(({ data }) => {
        if (active) {
          setInvite(data);
          setLinkError("");
        }
      })
      .catch((err) => {
        if (active) setLinkError(err.response?.data?.message || t("playerRegister.linkInvalid"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Debounced duplicate check on the English name only — never the Khmer
  // name. Skipped while the link is still loading/invalid, and only runs
  // until the player dismisses the list (they've decided they're new).
  useEffect(() => {
    if (loading || linkError || dismissedDuplicates) return;
    const fullName = form.fullName.trim();
    if (fullName.length < 2) {
      setDuplicates([]);
      return;
    }
    setCheckingDuplicate(true);
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get(`/registration/invites/${token}/check-duplicate`, {
          params: { fullName },
        });
        setDuplicates(data.duplicates || []);
      } catch {
        // best-effort — a failed check shouldn't block registration
      } finally {
        setCheckingDuplicate(false);
      }
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.fullName, loading, linkError, dismissedDuplicates, token]);

  // "This is me — add me to {team}" — attaches a pending assignment to the
  // matched existing athlete (registering them at this team) rather than
  // making a new profile. On success the same success screen shows their
  // existing ID + default password.
  const claimExisting = async (athleteId) => {
    setError("");
    setClaimingId(athleteId);
    try {
      const { data } = await api.post(`/registration/invites/${token}/claim/${athleteId}`);
      setResult(data);
    } catch (err) {
      setError(err.response?.data?.message || t("playerRegister.claimFailed"));
    } finally {
      setClaimingId(null);
    }
  };

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submitRegistration = async () => {
    setError("");
    setSubmitting(true);
    try {
      const data = new FormData();
      Object.entries(form).forEach(([k, v]) => data.append(k, v));
      if (confirmDuplicate) data.append("confirmDuplicate", "true");
      if (photo) data.append("photo", photo);
      documents.forEach((doc) => data.append("documents", doc));

      const { data: res } = await api.post(`/registration/invites/${token}`, data, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(res);
      setDuplicateConflict(null);
      setConfirmDuplicate(false);
    } catch (err) {
      const msg = err.response?.data;
      if (msg?.code === "DUPLICATE_IN_OTHER_TEAM") {
        // Name already exists on another team — skip auto-creation and ask
        // the player to confirm (claim the existing person, or register as
        // new anyway).
        setDuplicateConflict(msg.existing || []);
        setError(msg.message || t("playerRegister.duplicateInOtherTeam"));
      } else {
        setError(msg?.message || t("playerRegister.submitFailed"));
        setDuplicateConflict(null);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    submitRegistration();
  };

  // Player confirmed they're a different person — register as new anyway.
  const registerAnyway = () => {
    setConfirmDuplicate(true);
    submitRegistration();
  };

  if (loading) {
    return (
      <div className="auth-wrap">
        <div className="card">
          <p>{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  // A dead/used/expired/invalid link — the form never renders.
  if (linkError || !invite) {
    return (
      <div className="auth-wrap">
        <div className="card">
          <h2>{t("playerRegister.title")}</h2>
          <p className="error-text">{linkError || t("playerRegister.linkInvalid")}</p>
          <Link className="link-btn" to="/">
            {t("common.back")}
          </Link>
        </div>
      </div>
    );
  }

  // Success screen — the only place a player ever sees their ID + default
  // password, so they can write them down for after approval.
  if (result) {
    return (
      <div className="auth-wrap">
        <div className="card" style={{ maxWidth: 520 }}>
          <h2>✅ {t("playerRegister.successTitle")}</h2>
          <p>{t("playerRegister.successIntro")}</p>
          <div className="credentials-box">
            <div className="credential-row">
              <span className="credential-label">{t("playerRegister.yourId")}</span>
              <strong className="credential-value">{result.verifyId}</strong>
            </div>
            <div className="credential-row">
              <span className="credential-label">{t("playerRegister.defaultPassword")}</span>
              <strong className="credential-value">{result.defaultPassword}</strong>
            </div>
          </div>
          <p className="help-text">{t("playerRegister.writeDownNote")}</p>
          <p className="help-text">{t("playerRegister.pendingNote")}</p>
          <button
            type="button"
            className="btn btn-primary"
            style={{ width: "100%" }}
            onClick={() => navigate("/login")}
          >
            {t("playerRegister.goToLogin")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-wrap">
      {duplicateConflict && duplicateConflict.length > 0 ? (
        <div className="card duplicate-card">
          <h2>⚠ {t("playerRegister.duplicateTitle")}</h2>
          <p>{t("playerRegister.duplicateIntro")}</p>
          <ul className="duplicate-list">
            {duplicateConflict.map((a) => (
              <li key={a._id}>
                {a.photoUrl && (
                  <img src={resolveFileUrl(a.photoUrl)} alt={a.fullName} className="duplicate-avatar" />
                )}
                <strong>{a.fullName}</strong>{a.khmerName ? ` (${a.khmerName})` : ""}
              </li>
            ))}
          </ul>
          <p className="help-text">{t("playerRegister.duplicateNote")}</p>
          <div className="field">
            {duplicateConflict.map((a) => (
              <button
                key={a._id}
                type="button"
                className="btn btn-primary"
                style={{ width: "100%", marginBottom: 8 }}
                disabled={claimingId === a._id}
                onClick={() => claimExisting(a._id)}
              >
                {claimingId === a._id
                  ? t("common.saving")
                  : t("playerRegister.thisIsMeAddToTeam").replace("{team}", invite.team)}
              </button>
            ))}
            <button
              type="button"
              className="btn link-btn"
              style={{ width: "100%", marginTop: 8 }}
              onClick={registerAnyway}
            >
              {t("playerRegister.registerAnyway")}
            </button>
          </div>
          <p className="help-text" style={{ marginTop: 8 }}>
            <button type="button" className="link-btn" onClick={() => setDuplicateConflict(null)}>
              {t("common.cancel")}
            </button>
          </p>
        </div>
      ) : (
        <form className="card" style={{ maxWidth: 560 }} onSubmit={handleSubmit}>
        <h2>{t("playerRegister.title")}</h2>
        <p className="help-text">
          {t("playerRegister.introTeam")} <strong>{invite.team}</strong>
        </p>

        <div className="field">
          <label>{t("addAthlete.fullName")}</label>
          <input
            value={form.fullName}
            onChange={update("fullName")}
            placeholder={t("playerRegister.fullNamePlaceholder")}
            required
          />
        </div>
        <div className="field">
          <label>{t("addAthlete.khmerName")}</label>
          <input
            value={form.khmerName}
            onChange={update("khmerName")}
            placeholder={t("playerRegister.khmerNamePlaceholder")}
          />
        </div>
        <div className="field">
          <label>{t("addAthlete.dateOfBirth")}</label>
          <input type="date" value={form.dateOfBirth} onChange={update("dateOfBirth")} />
        </div>
        <div className="field">
          <label>{t("addAthlete.gender")}</label>
          <select value={form.gender} onChange={update("gender")}>
            <option value="male">{t("addAthlete.genderMale")}</option>
            <option value="female">{t("addAthlete.genderFemale")}</option>
            <option value="other">{t("addAthlete.genderOther")}</option>
          </select>
        </div>
        <div className="field">
          <label>{t("addAthlete.address")}</label>
          <input
            value={form.address}
            onChange={update("address")}
            placeholder={t("playerRegister.addressPlaceholder")}
          />
        </div>
        <div className="field">
          <label>{t("addAthlete.photo")}</label>
          <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files[0])} />
        </div>
        <div className="field">
          <label>{t("addAthlete.supportingDocuments")}</label>
          <input
            type="file"
            multiple
            accept="image/*,application/pdf"
            onChange={(e) => setDocuments(Array.from(e.target.files))}
          />
        </div>

        {error && <div className="error-text">{error}</div>}

        <button className="btn btn-primary" style={{ width: "100%" }} disabled={submitting}>
          {submitting ? t("playerRegister.submitting") : t("playerRegister.submit")}
        </button>
        </form>
      )}
    </div>
  );
}

