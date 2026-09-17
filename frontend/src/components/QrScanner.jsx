import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext";

export default function QrScanner() {
  const { t } = useLanguage();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [scannedId, setScannedId] = useState(null);
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!scanning) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })
      .then((stream) => {
        video.srcObject = stream;
        startScanning();
      })
      .catch((err) => {
        setError(t("qrScanner.cameraError").replace("{message}", err.message));
      });

    const startScanning = () => {
      const ctx = canvas.getContext("2d");

      const scan = () => {
        if (!scanning) return;

        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0);

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);

          if (code) {
            // Extract verify ID from QR code data (URL format)
            // Expected format: http://localhost:5173/verify/XXX or https://domain/verify/XXX
            const url = code.data;
            const match = url.match(/\/verify\/(.+)$/);

            if (match) {
              const verifyId = match[1];
              setScannedId(verifyId);
              setScanning(false);

              // Navigate to verify page
              setTimeout(() => {
                navigate(`/verify/${verifyId}`);
              }, 500);
              return;
            }
          }
        }

        requestAnimationFrame(scan);
      };

      scan();
    };

    return () => {
      if (video.srcObject) {
        video.srcObject.getTracks().forEach((track) => track.stop());
      }
    };
  }, [scanning, navigate]);

  const handleReset = () => {
    setScannedId(null);
    setError("");
    setScanning(true);
  };

  return (
    <div className="qr-scanner-container">
      <div className="qr-scanner">
        <h2>{t("qrScanner.title")}</h2>

        {error && (
          <div className="error-box">
            <p className="error-text">{error}</p>
            <button className="btn btn-primary" onClick={handleReset}>
              {t("qrScanner.tryAgain")}
            </button>
          </div>
        )}

        {!error && (
          <div className="scanner-wrap">
            <video
              ref={videoRef}
              className="scanner-video"
              style={{
                width: "100%",
                maxWidth: "500px",
                borderRadius: "8px",
                aspectRatio: "16/9",
                objectFit: "cover",
              }}
            />
            <canvas ref={canvasRef} style={{ display: "none" }} />

            <p className="scanner-hint">{t("qrScanner.hint")}</p>

            {scannedId && (
              <div className="success-box">
                <p>{t("qrScanner.scanned").replace("{id}", scannedId)}</p>
                <p>{t("qrScanner.redirecting")}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}