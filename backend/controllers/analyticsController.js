const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const PageView = require("../models/PageView");
const Admin = require("../models/Admin");
const { parseUserAgent, isBot, clientIp, lookupGeo } = require("../utils/visitorInfo");

const TZ = "Asia/Phnom_Penh";

// username/role lookups for signed-in visitors, cached so a busy page
// doesn't hit the Admin collection on every single view.
const userCache = new Map();
async function userInfo(id) {
  if (!mongoose.isValidObjectId(id)) return null;
  const hit = userCache.get(String(id));
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.data;
  const a = await Admin.findById(id).select("username role").lean();
  const data = a ? { id: a._id, username: a.username, role: a.role } : null;
  if (userCache.size > 2000) userCache.clear();
  userCache.set(String(id), { at: Date.now(), data });
  return data;
}

// The tracking endpoint is public (anonymous visitors count too), so the
// token is optional — when a valid one is sent, the view is linked to that
// account; an expired/invalid token is simply treated as anonymous.
function optionalUserId(req) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith("Bearer ")) return null;
  try {
    return jwt.verify(h.split(" ")[1], process.env.JWT_SECRET).id || null;
  } catch {
    return null;
  }
}

// POST /api/analytics/track (PUBLIC) { path, visitorId, referrer?, screen?, language? }
// Answers straight away (204) and saves in the background, so tracking
// never slows the visitor's page down.
exports.track = async (req, res) => {
  res.status(204).end();
  try {
    const ua = req.headers["user-agent"] || "";
    if (isBot(ua)) return;
    const path = String(req.body?.path || "").slice(0, 300);
    const visitorId = String(req.body?.visitorId || "").slice(0, 64);
    if (!path || !visitorId) return;

    const ip = clientIp(req);
    const [geo, user] = await Promise.all([lookupGeo(ip), userInfo(optionalUserId(req))]);
    const { device, os, browser } = parseUserAgent(ua);

    await PageView.create({
      path,
      visitorId,
      referrer: String(req.body?.referrer || "").slice(0, 300),
      screen: String(req.body?.screen || "").slice(0, 20),
      language: String(req.body?.language || "").slice(0, 20),
      user: user?.id || null,
      username: user?.username || null,
      role: user?.role || null,
      ip,
      ...geo,
      device,
      os,
      browser,
    });
  } catch (err) {
    console.warn("Page-view tracking failed:", err.message);
  }
};

function rangeFromQuery(q) {
  const days = Math.min(Math.max(parseInt(q.days, 10) || 30, 1), 365);
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 3600 * 1000);
  return { from, to, days };
}

// Group views by one field → [{ key, views, visitors }] sorted by visitors.
function breakdown(match, field, limit = 10) {
  return PageView.aggregate([
    { $match: match },
    { $group: { _id: `$${field}`, views: { $sum: 1 }, v: { $addToSet: "$visitorId" } } },
    { $project: { _id: 0, key: { $ifNull: ["$_id", "Unknown"] }, views: 1, visitors: { $size: "$v" } } },
    { $sort: { visitors: -1, views: -1 } },
    { $limit: limit },
  ]);
}

// GET /api/analytics/summary?days=30 (admin)
exports.summary = async (req, res) => {
  try {
    const { from, to, days } = rangeFromQuery(req.query);
    const match = { createdAt: { $gte: from, $lte: to } };
    // Admin pages are excluded from "pages" so the list shows what the
    // public actually looks at, not the admin's own clicking around.
    const publicMatch = { ...match, path: { $not: /^\/admin/ } };

    const [
      totalViews,
      visitorIds,
      onlineIds,
      daily,
      pages,
      countries,
      cities,
      devices,
      os,
      browsers,
      referrers,
      users,
      recent,
      hours,
    ] = await Promise.all([
      PageView.countDocuments(match),
      PageView.distinct("visitorId", match),
      PageView.distinct("visitorId", { createdAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) } }),
      PageView.aggregate([
        { $match: match },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: TZ } },
            views: { $sum: 1 },
            v: { $addToSet: "$visitorId" },
          },
        },
        { $project: { _id: 0, day: "$_id", views: 1, visitors: { $size: "$v" } } },
        { $sort: { day: 1 } },
      ]),
      breakdown(publicMatch, "path", 15),
      breakdown(match, "country", 15),
      PageView.aggregate([
        { $match: match },
        {
          $group: {
            _id: { city: "$city", region: "$region", country: "$country" },
            views: { $sum: 1 },
            v: { $addToSet: "$visitorId" },
          },
        },
        {
          $project: {
            _id: 0,
            key: "$_id.city",
            region: "$_id.region",
            country: "$_id.country",
            views: 1,
            visitors: { $size: "$v" },
          },
        },
        { $sort: { visitors: -1, views: -1 } },
        { $limit: 15 },
      ]),
      breakdown(match, "device"),
      breakdown(match, "os"),
      breakdown(match, "browser"),
      breakdown({ ...match, referrer: { $nin: ["", null] } }, "referrer", 10),
      PageView.aggregate([
        { $match: { ...match, user: { $ne: null } } },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: "$user",
            username: { $first: "$username" },
            role: { $first: "$role" },
            views: { $sum: 1 },
            lastSeen: { $first: "$createdAt" },
            firstSeen: { $last: "$createdAt" },
            lastPath: { $first: "$path" },
            device: { $first: "$device" },
            os: { $first: "$os" },
            browser: { $first: "$browser" },
            city: { $first: "$city" },
            country: { $first: "$country" },
            devices: { $addToSet: "$device" },
          },
        },
        { $sort: { lastSeen: -1 } },
        { $limit: 200 },
      ]),
      PageView.find(match)
        .sort({ createdAt: -1 })
        .limit(50)
        .select("path username role city region country device os browser createdAt visitorId")
        .lean(),
      PageView.aggregate([
        { $match: match },
        { $group: { _id: { $hour: { date: "$createdAt", timezone: TZ } }, views: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
    ]);

    // Fill missing days with zeros so the chart is continuous.
    const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
    const byDay = Object.fromEntries(daily.map((d) => [d.day, d]));
    const series = [];
    for (let i = days - 1; i >= 0; i--) {
      const key = fmt.format(new Date(to.getTime() - i * 24 * 3600 * 1000));
      if (series.length && series[series.length - 1].day === key) continue;
      series.push(byDay[key] || { day: key, views: 0, visitors: 0 });
    }
    const hourly = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      views: hours.find((x) => x._id === h)?.views || 0,
    }));

    const loggedInVisitors = users.length;
    res.json({
      range: { from, to, days },
      totals: {
        views: totalViews,
        visitors: visitorIds.length,
        onlineNow: onlineIds.length,
        loggedInUsers: loggedInVisitors,
        viewsPerVisitor: visitorIds.length ? Math.round((totalViews / visitorIds.length) * 10) / 10 : 0,
      },
      series,
      hourly,
      pages,
      countries,
      cities,
      devices,
      os,
      browsers,
      referrers,
      users,
      recent,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
