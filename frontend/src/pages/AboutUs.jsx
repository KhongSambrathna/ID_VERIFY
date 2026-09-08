import TrustedBy from "../components/TrustedBy";

export default function AboutUs() {
  return (
    <>
      <section className="hero about-hero">
        <div className="container">
          <h1>Built for grassroots football, not just the big leagues.</h1>
          <p>
            Countryside Football ID Verify exists so every team — from a
            village club to a district league — can keep an honest, checkable
            record of who's actually on the roster: real names, real ages,
            real photos, confirmed in seconds by anyone with a phone.
          </p>
        </div>
      </section>

      <section className="features">
        <div className="container">
          <h2>Why this exists</h2>
          <p className="about-lead">
            Grassroots tournaments run on trust — but rosters get copied by
            hand, birth dates get fudged, and it's hard for an organizer on
            match day to know if the player walking onto the pitch is really
            who the team sheet says they are. We built a simple system to fix
            that: register a player once with a photo and supporting
            documents, and from then on their identity is one scan or one
            search away from being confirmed.
          </p>
        </div>
      </section>

      <section className="features" id="about-how">
        <div className="container">
          <h2>What the platform does</h2>
          <div className="grid">
            <div className="feature-card">
              <div className="num">01</div>
              <h3>One record per player</h3>
              <p>
                Name (Khmer and English), date of birth, gender, team, role,
                and a photo — entered once by an admin and kept up to date.
              </p>
            </div>
            <div className="feature-card">
              <div className="num">02</div>
              <h3>A card that proves it</h3>
              <p>
                Every player gets a printable bilingual ID card with a unique
                ID number and a QR code tied directly to their record.
              </p>
            </div>
            <div className="feature-card">
              <div className="num">03</div>
              <h3>Verify without a login</h3>
              <p>
                Anyone — a referee, an opposing coach, a tournament official —
                can scan the QR code or search a name/ID to see the player's
                photo and current status. No account required.
              </p>
            </div>
            <div className="feature-card">
              <div className="num">04</div>
              <h3>Head coaches build their own lineups</h3>
              <p>
                Coaches sign in to pull players already registered on their
                team into a named match-day list — never to add players that
                haven't been verified by an admin first.
              </p>
            </div>
          </div>
        </div>
      </section>

      <TrustedBy />

      <section className="features about-cta">
        <div className="container" style={{ textAlign: "center" }}>
          <h2>Want to check a player right now?</h2>
          <div className="cta-row" style={{ justifyContent: "center" }}>
            <a href="/search" className="btn btn-primary">
              Find a player
            </a>
            <a
              href="/login"
              className="btn btn-outline"
              style={{ color: "var(--navy)", borderColor: "var(--navy)" }}
            >
              Admin sign in
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
