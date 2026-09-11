import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";
import { resolveFileUrl } from "../utils/fileUrl";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setError("");
      setSearched(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get("/athletes/search", { params: { q } });
        setResults(data);
        setError("");
      } catch (err) {
        setError(err.response?.data?.message || "Search failed");
        setResults([]);
      } finally {
        setSearched(true);
        setLoading(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="verify-wrap search-page-wrap">
      <div className="card search-page-card">
        <h2 style={{ marginBottom: 4 }}>Find a player</h2>
        <p className="help-text" style={{ marginBottom: 18 }}>
          Type a player's name or ID number — no sign-in needed.
        </p>

        <div className="field" style={{ marginBottom: 4 }}>
          <input
            autoFocus
            placeholder="e.g. Sok Dara or 001-100-2991"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {loading && <p className="help-text">Searching…</p>}
        {error && <p className="error-text">{error}</p>}

        {!loading && searched && !error && results.length === 0 && (
          <p className="help-text">No matches for "{query.trim()}".</p>
        )}

        {results.length > 0 && (
          <div className="search-results">
            {results.map((a) => (
              <Link key={a._id} to={`/verify/${a.verifyId}`} className="search-result-row">
                <img
                  src={a.photoUrl ? resolveFileUrl(a.photoUrl) : "https://placehold.co/50x50?text=Photo"}
                  alt={a.fullName}
                  className="search-result-photo"
                />
                <div className="search-result-info">
                  <p className="name">
                    {a.fullName}
                    {a.khmerName ? ` · ${a.khmerName}` : ""}
                  </p>
                  <p className="meta">
                    {a.memberships?.length
                      ? a.memberships.map((m) => `${m.team} · ${m.role}`).join(", ")
                      : "—"}{" "}
                    · ID {a.verifyId}
                  </p>
                </div>
                <span className={`badge ${a.isAvailable ? "verified" : "rejected"}`}>
                  {a.isAvailable ? "Available" : "Not available"}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
