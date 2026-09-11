const Athlete = require("../models/Athlete");
const Product = require("../models/Product");

const SITE_NAME = "Countryside Football ID Verify";
const FRONTEND_URL = (process.env.PUBLIC_BASE_URL || "https://id-verify-liart.vercel.app").replace(/\/$/, "");
const DEFAULT_IMAGE = `${FRONTEND_URL}/icon-512.png`;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Renders a tiny static page carrying Open Graph / Twitter Card meta tags,
// then sends real visitors straight on to the actual app page.
//
// Why this exists: the frontend is a client-side-routed React app, so every
// route (/, /shop, /verify/:id, ...) is served from the SAME static
// index.html with ONE fixed preview image/description. Facebook, Telegram,
// etc. build their link-preview card by fetching the URL and reading
// <meta> tags out of the raw HTML they get back — they don't run the
// page's JavaScript — so they can never see anything route-specific from
// the SPA itself. These /share/* pages are rendered here on the backend
// per request instead, with the right title/image for whatever's being
// shared, and immediately forward real people to the real page.
function renderSharePage(res, { title, description, image, redirectTo }) {
  const url = `${FRONTEND_URL}${redirectTo}`;
  res.set("Content-Type", "text/html; charset=utf-8");
  res.send(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:image" content="${escapeHtml(image)}" />
<meta property="og:url" content="${escapeHtml(url)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<meta name="twitter:image" content="${escapeHtml(image)}" />
<meta http-equiv="refresh" content="0; url=${escapeHtml(url)}" />
<script>location.replace(${JSON.stringify(url)});</script>
</head>
<body>
<p>Redirecting to <a href="${escapeHtml(url)}">${escapeHtml(url)}</a>…</p>
</body>
</html>`);
}

// GET /share/shop — previews the shop with an actual product photo (the
// most recently added item) so a shared link shows real merchandise
// instead of a generic logo.
exports.shareShop = async (req, res) => {
  try {
    const product = await Product.findOne().sort({ createdAt: -1 });
    renderSharePage(res, {
      title: `Equipment Shop — ${SITE_NAME}`,
      description: product
        ? `${product.name} — $${Number(product.price).toFixed(2)}, and more sports equipment for sale.`
        : "Browse our sports equipment shop.",
      image: product?.imageUrl || DEFAULT_IMAGE,
      redirectTo: "/shop",
    });
  } catch (err) {
    renderSharePage(res, {
      title: `Equipment Shop — ${SITE_NAME}`,
      description: "Browse our sports equipment shop.",
      image: DEFAULT_IMAGE,
      redirectTo: "/shop",
    });
  }
};

// GET /share/verify/:verifyId — previews a specific athlete's ID card with
// their own photo, for verify/QR links shared outside the app.
exports.shareVerify = async (req, res) => {
  try {
    const athlete = await Athlete.findOne({ verifyId: req.params.verifyId }).select(
      "fullName khmerName assignments photoUrl verifyId"
    );
    if (!athlete) {
      return renderSharePage(res, {
        title: SITE_NAME,
        description: "Athlete verification record not found.",
        image: DEFAULT_IMAGE,
        redirectTo: `/verify/${req.params.verifyId}`,
      });
    }
    const approved = (athlete.assignments || []).filter((a) => a.approvalStatus === "approved");
    renderSharePage(res, {
      title: `${athlete.fullName} — ${SITE_NAME}`,
      description:
        approved.map((a) => `${a.team} · ${a.role}`).join(", ") || "Athlete ID verification",
      image: athlete.photoUrl || DEFAULT_IMAGE,
      redirectTo: `/verify/${athlete.verifyId}`,
    });
  } catch (err) {
    renderSharePage(res, {
      title: SITE_NAME,
      description: "Athlete ID verification",
      image: DEFAULT_IMAGE,
      redirectTo: `/verify/${req.params.verifyId}`,
    });
  }
};

// GET /share — generic homepage preview.
exports.shareHome = async (req, res) => {
  renderSharePage(res, {
    title: SITE_NAME,
    description: "Athlete ID verification and equipment shop for Countryside Football, Siem Reap.",
    image: DEFAULT_IMAGE,
    redirectTo: "/",
  });
};
