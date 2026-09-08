export default function Landing() {
  return (
    <>
      <section className="hero">
        <div className="container">
          <h1>Verified footballer identity, backed by a scan.</h1>
          <p>
            Countryside Football ID Verify records, verifies, and cards every
            player and staff member in your program — each ID carries a QR code
            that opens straight to a live verification record, so officials and
            organizers can confirm identity in seconds.
          </p>
          <div className="cta-row">
            <a href="/login" className="btn btn-primary">
              Admin sign in
            </a>
            <a href="#how" className="btn btn-outline">
              How it works
            </a>
          </div>
        </div>
      </section>

      <section className="features" id="how">
        <div className="container">
          <h2>How verification works</h2>
          <div className="grid">
            <div className="feature-card">
              <div className="num">01</div>
              <h3>Register the athlete</h3>
              <p>
                An admin enters personal details, uploads a photo, and attaches
                supporting documents used to confirm identity.
              </p>
            </div>
            <div className="feature-card">
              <div className="num">02</div>
              <h3>Card and QR are generated</h3>
              <p>
                The system creates an ID card and a unique QR code tied to that
                athlete's verification record.
              </p>
            </div>
            <div className="feature-card">
              <div className="num">03</div>
              <h3>Scan to verify</h3>
              <p>
                Scanning the QR code opens a public page showing the athlete's
                name, photo, and current verification status.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
