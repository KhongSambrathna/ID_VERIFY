import { Link } from "react-router-dom";
import QrScanner from "../components/QrScanner";

export default function Landing() {
  return (
    <div className="landing">
      <div className="container">
        <div className="hero">
          <h1>Countryside Football</h1>
          <p>Athlete ID & Verification System</p>
        </div>

        <div className="landing-content">
          <div className="card scan-card">
            <h2>Scan Athlete ID</h2>
            <QrScanner />
          </div>

          <div className="card info-card">
            <h2>Or Login</h2>
            <Link to="/admin/login" className="btn btn-primary" style={{ display: "inline-block" }}>
              Admin Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
