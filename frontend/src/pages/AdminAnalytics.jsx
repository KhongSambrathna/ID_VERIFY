import { useEffect, useMemo, useState } from "react";
import api from "../api/axios";
import Avatar from "../components/Avatar";
import { useLanguage } from "../i18n/LanguageContext";
import { BarChart, HBarList, StatTile } from "../components/MiniCharts";

function timeAgo(d, t) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return t("adminAnalytics.justNow");
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} ${t("adminAnalytics.minAgo")}`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ${t("adminAnalytics.hourAgo")}`;
  return new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const DEVICE_ICON = { mobile: "📱", tablet: "📲", desktop: "💻" };

// Admin-only website analytics: how many people visited, from where, on
// which devices, which pages they opened, and — for signed-in visitors —
// which user accounts were active. Data comes from the page-view tracker
// (hooks/usePageTracking.js) via GET /api/analytics/summary.
export default function AdminAnalytics() {
  const { t } = useLanguage();
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [userSearch, setUserSearch] = useState("");

  const load = () => {
    setLoading(true);
    api
      .get(`/analytics/summary?days=${days}`)
      .then(({ data }) => {
        setData(data);
        setError("");
      })
      .catch((err) => setError(err.response?.data?.message || t("adminAnalytics.failedToLoad")))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [days]);

  const deviceName = (k) => t(`adminAnalytics.device_${k}`, k);
  const roleName = (r) => t(`adminAnalytics.role_${r}`, r);

  const chartData = useMemo(
    () =>
      (data?.series || []).map((d) => ({
        label: d.day.slice(5).split("-").reverse().join("/"),
        values: [d.visitors, d.views],
      })),
    [data]
  );
  const hourData = useMemo(
    () => (data?.hourly || []).map((h) => ({ label: `${h.hour}h`, values: [h.views] })),
    [data]
  );

  const q = userSearch.trim().toLowerCase();
  const users = (data?.users || []).filter(
    (u) => !q || [u.username, u.name, u.khmerName, u.team].some((x) => (x || "").toLowerCase().includes(q))
  );

  return (
    <div className="container dash-body">
      <div className="dash-header">
        <h2>{t("adminAnalytics.title")}</h2>
        <p>{t("adminAnalytics.intro")}</p>
      </div>

      <div className="filter-row" style={{ alignItems: "center" }}>
        <div className="seg-toggle">
          {[1, 7, 30, 90, 365].map((d) => (
            <button type="button" key={d} className={days === d ? "active" : ""} onClick={() => setDays(d)}>
              {d === 1 ? t("adminAnalytics.today24h") : `${d} ${t("adminAnalytics.days")}`}
            </button>
          ))}
        </div>
        <button type="button" className="link-btn" onClick={load}>
          ↻ {t("adminAnalytics.refresh")}
        </button>
      </div>

      {loading && !data && <p>{t("common.loading")}</p>}
      {error && <p className="error-text">{error}</p>}

      {data && (
        <>
          <div className="stat-grid">
            <StatTile label={t("adminAnalytics.visitors")} value={data.totals.visitors.toLocaleString()} sub={t("adminAnalytics.visitorsSub")} />
            <StatTile label={t("adminAnalytics.pageViews")} value={data.totals.views.toLocaleString()} sub={`${data.totals.viewsPerVisitor} ${t("adminAnalytics.perVisitor")}`} />
            <StatTile label={t("adminAnalytics.onlineNow")} value={data.totals.onlineNow} sub={t("adminAnalytics.onlineSub")} tone="ok" />
            <StatTile label={t("adminAnalytics.loggedInUsers")} value={data.totals.loggedInUsers} sub={t("adminAnalytics.loggedInSub")} />
          </div>

          <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <h3 style={{ marginTop: 0 }}>{t("adminAnalytics.dailyChart")}</h3>
            <BarChart
              data={chartData}
              keys={[
                { name: t("adminAnalytics.visitors"), color: "var(--navy)" },
                { name: t("adminAnalytics.pageViews"), color: "var(--gold)" },
              ]}
            />
          </div>

          <div className="report-two-col">
            <div className="card" style={{ padding: 16 }}>
              <h3 style={{ marginTop: 0 }}>🌏 {t("adminAnalytics.byCountry")}</h3>
              <HBarList rows={data.countries.map((r) => ({ key: r.key, value: r.visitors }))} empty={t("adminAnalytics.noData")} />
            </div>
            <div className="card" style={{ padding: 16 }}>
              <h3 style={{ marginTop: 0 }}>📍 {t("adminAnalytics.byCity")}</h3>
              <HBarList
                rows={data.cities.map((r) => ({ key: r.key || "Unknown", value: r.visitors, sub: r.region || r.country }))}
                color="var(--gold)"
                empty={t("adminAnalytics.noData")}
              />
            </div>
            <div className="card" style={{ padding: 16 }}>
              <h3 style={{ marginTop: 0 }}>📱 {t("adminAnalytics.byDevice")}</h3>
              <HBarList
                rows={data.devices.map((r) => ({ key: `${DEVICE_ICON[r.key] || ""} ${deviceName(r.key)}`, value: r.visitors }))}
                empty={t("adminAnalytics.noData")}
              />
              <h4 style={{ marginBottom: 6 }}>{t("adminAnalytics.byOs")}</h4>
              <HBarList rows={data.os.map((r) => ({ key: r.key, value: r.visitors }))} color="var(--ok)" empty={t("adminAnalytics.noData")} />
            </div>
            <div className="card" style={{ padding: 16 }}>
              <h3 style={{ marginTop: 0 }}>🌐 {t("adminAnalytics.byBrowser")}</h3>
              <HBarList rows={data.browsers.map((r) => ({ key: r.key, value: r.visitors }))} empty={t("adminAnalytics.noData")} />
              <h4 style={{ marginBottom: 6 }}>{t("adminAnalytics.referrers")}</h4>
              <HBarList
                rows={data.referrers.map((r) => {
                  let host = r.key;
                  try {
                    host = new URL(r.key).hostname.replace(/^www\./, "");
                  } catch {
                    /* keep raw */
                  }
                  return { key: host, value: r.visitors };
                })}
                color="var(--gold)"
                empty={t("adminAnalytics.noReferrers")}
              />
            </div>
          </div>

          <div className="report-two-col">
            <div className="card" style={{ padding: 16 }}>
              <h3 style={{ marginTop: 0 }}>📄 {t("adminAnalytics.topPages")}</h3>
              <HBarList rows={data.pages.map((r) => ({ key: r.key, value: r.views }))} empty={t("adminAnalytics.noData")} />
            </div>
            <div className="card" style={{ padding: 16 }}>
              <h3 style={{ marginTop: 0 }}>🕒 {t("adminAnalytics.byHour")}</h3>
              <BarChart data={hourData} height={140} keys={[{ name: t("adminAnalytics.pageViews"), color: "var(--navy)" }]} />
            </div>
          </div>

          <h3>👤 {t("adminAnalytics.usersTitle")}</h3>
          <div className="filter-row">
            <input placeholder={t("adminAnalytics.searchUser")} value={userSearch} onChange={(e) => setUserSearch(e.target.value)} />
          </div>
          <div className="table-scroll">
            <table className="athletes">
              <thead>
                <tr>
                  <th>{t("adminAnalytics.user")}</th>
                  <th>{t("adminAnalytics.role")}</th>
                  <th>{t("adminAnalytics.pageViews")}</th>
                  <th>{t("adminAnalytics.lastSeen")}</th>
                  <th>{t("adminAnalytics.lastPage")}</th>
                  <th>{t("adminAnalytics.device")}</th>
                  <th>{t("adminAnalytics.location")}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u._id}>
                    <td data-label={t("adminAnalytics.user")}>
                      <span className="who-cell">
                        <Avatar name={u.name || u.username} photoUrl={u.photoUrl} size={32} />
                        <span>
                          <b>{u.name || u.username}</b>
                          {u.khmerName && <small> · {u.khmerName}</small>}
                          <small className="who-sub">
                            @{u.username}
                            {u.team ? ` · ${u.team}` : ""}
                          </small>
                        </span>
                      </span>
                    </td>
                    <td data-label={t("adminAnalytics.role")}>{roleName(u.role)}</td>
                    <td data-label={t("adminAnalytics.pageViews")}>{u.views}</td>
                    <td data-label={t("adminAnalytics.lastSeen")}>{timeAgo(u.lastSeen, t)}</td>
                    <td data-label={t("adminAnalytics.lastPage")} style={{ fontSize: 13 }}>{u.lastPath}</td>
                    <td data-label={t("adminAnalytics.device")}>
                      {DEVICE_ICON[u.device]} {u.os} · {u.browser}
                      {u.devices?.length > 1 && <div style={{ fontSize: 11, color: "#888" }}>{u.devices.map(deviceName).join(", ")}</div>}
                    </td>
                    <td data-label={t("adminAnalytics.location")}>{[u.city, u.country].filter((x) => x && x !== "Unknown").join(", ") || "—"}</td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", color: "#777" }}>{t("adminAnalytics.noUsers")}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <h3>🔴 {t("adminAnalytics.recentVisits")}</h3>
          <div className="table-scroll">
            <table className="athletes">
              <thead>
                <tr>
                  <th>{t("adminAnalytics.time")}</th>
                  <th>{t("adminAnalytics.page")}</th>
                  <th>{t("adminAnalytics.who")}</th>
                  <th>{t("adminAnalytics.device")}</th>
                  <th>{t("adminAnalytics.location")}</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map((v) => (
                  <tr key={v._id}>
                    <td data-label={t("adminAnalytics.time")}>{timeAgo(v.createdAt, t)}</td>
                    <td data-label={t("adminAnalytics.page")} style={{ fontSize: 13 }}>{v.path}</td>
                    <td data-label={t("adminAnalytics.who")}>
                      {v.username ? (
                        <span>
                          <b>{v.name || v.username}</b>
                          {v.name && <small className="who-sub">@{v.username}</small>}
                        </span>
                      ) : (
                        <span style={{ color: "#888" }}>{t("adminAnalytics.guest")} #{String(v.visitorId).slice(0, 4)}</span>
                      )}
                    </td>
                    <td data-label={t("adminAnalytics.device")}>
                      {DEVICE_ICON[v.device]} {v.os} · {v.browser}
                    </td>
                    <td data-label={t("adminAnalytics.location")}>
                      {[v.city, v.region, v.country].filter((x) => x && x !== "Unknown").join(", ") || "—"}
                    </td>
                  </tr>
                ))}
                {data.recent.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", color: "#777" }}>{t("adminAnalytics.noData")}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mini-empty" style={{ marginTop: 12 }}>{t("adminAnalytics.locationNote")}</p>
        </>
      )}
    </div>
  );
}
