# Countryside Football ID Verify (MERN)

A local-first MERN app for recording athlete data, generating an ID card with a
verification QR code, and letting anyone scan the code to confirm the athlete's
identity and status.

## Structure

```
athlete-verify-app/
  backend/     Express + MongoDB API, file uploads, QR generation
  frontend/    React (Vite) app: landing page, admin dashboard, public verify page
```

## 1. Prerequisites

- Node.js 18+ and npm — https://nodejs.org
- MongoDB running locally, OR a free MongoDB Atlas cluster
  - Local install: https://www.mongodb.com/docs/manual/installation/
  - Free cloud option: https://www.mongodb.com/cloud/atlas/register

## 2. Backend setup

```bash
cd backend
npm install
cp .env.example .env
```

Edit `.env`:
- `MONGO_URI` — your local or Atlas connection string
- `JWT_SECRET` — any long random string
- `PUBLIC_BASE_URL` — leave as `http://localhost:5173` for local dev
- `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` —
  sign up free at https://cloudinary.com, then copy these three values from
  your Dashboard home page. All athlete photos, supporting documents, and QR
  codes are stored on Cloudinary (not on local disk), so uploads persist even
  when your host restarts or redeploys.

Start the API:
```bash
npm run dev
```
It runs on **http://localhost:5000**.

### Create your first admin account
The register endpoint has no auth guard yet (you need it to create the first
admin). From a terminal, or a tool like Postman/Insomnia/curl:

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"choose-a-strong-password"}'
```

After you've created your admin account(s), it's a good idea to comment out or
remove the `/register` route in `backend/routes/authRoutes.js` (or add an
admin-only guard) so strangers can't create accounts on your live site later.

## 3. Frontend setup

```bash
cd frontend
npm install
npm run dev
```
It runs on **http://localhost:5173**.

## 4. Using it

1. Go to `http://localhost:5173` — this is the public landing page.
2. Click **Admin sign in** and log in with the account you created.
3. In the dashboard, click **+ Add athlete** — fill in the athlete's details,
   upload a photo, and attach supporting documents (ID copy, birth certificate,
   etc.) for identity verification.
4. Saving generates a QR code automatically. Click **View card** to see the
   printable ID card with photo + QR code.
5. Scanning that QR code (or opening its link) lands on
   `http://localhost:5173/verify/<id>` — a public page showing the athlete's
   name, photo, and current status (pending / verified / rejected).
6. Back in the dashboard, use **Verify** / **Reject** to update an athlete's
   status — the public verify page reflects it immediately.

## 5. Deploying online (with auto-deploy from GitHub)

This sets it up so every `git push` to GitHub automatically redeploys your
live site — no manual upload needed.

### 5.1 Push the code to GitHub

```bash
cd athlete-verify-app
git init
git add .
git commit -m "Initial commit"
```
Create an empty repository on GitHub (no README/license), then:
```bash
git remote add origin https://github.com/<your-username>/<your-repo>.git
git branch -M main
git push -u origin main
```

### 5.2 Deploy the backend — Render (free)

1. Go to https://render.com, sign up/sign in with GitHub.
2. **New +** → **Web Service** → pick your repo.
3. Settings:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Instance Type:** Free
4. Under **Environment**, add these variables (same as your local `.env`):
   - `MONGO_URI` — your Atlas connection string
   - `JWT_SECRET` — your secret
   - `PORT` — `5000` (Render sets `PORT` itself too, but this is harmless)
   - `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` —
     same values as your local `.env`
   - `PUBLIC_BASE_URL` — set this **after** step 5.3, once you know your
     frontend's live URL (e.g. `https://your-app.vercel.app`)
5. Click **Create Web Service**. Render will build and give you a URL like
   `https://countryside-football-api.onrender.com` — this is your backend URL.
6. In Atlas **Network Access**, make sure `0.0.0.0/0` is allowed (Render's
   servers use changing IPs), and keep using the non-SRV `mongodb://`
   connection string if SRV lookups were unreliable for you locally.

From now on, every push to `main` automatically redeploys the backend.

Photos, documents, and QR codes are stored on Cloudinary's free tier, so
they're unaffected by Render restarts/redeploys — no extra setup needed here.

### 5.3 Deploy the frontend — Vercel (free)

1. Go to https://vercel.com, sign up/sign in with GitHub.
2. **Add New** → **Project** → pick your repo.
3. Settings:
   - **Root Directory:** `frontend`
   - **Framework Preset:** Vite (auto-detected)
   - **Build Command:** `npm run build` (default)
   - **Output Directory:** `dist` (default)
4. Under **Environment Variables**, add:
   - `VITE_API_URL` = your Render backend URL from step 5.2
     (e.g. `https://countryside-football-api.onrender.com`, **no trailing slash**)
5. Click **Deploy**. Vercel gives you a URL like
   `https://your-app.vercel.app` — this is your live site.

From now on, every push to `main` automatically redeploys the frontend too.

### 5.4 Connect the two

Go back to Render → your backend service → **Environment** → set
`PUBLIC_BASE_URL` to your Vercel URL (e.g. `https://your-app.vercel.app`),
save (Render redeploys automatically). This is what makes the generated QR
codes point to your live site instead of `localhost`.

### 5.5 Recreate your admin account on the live database

If your live backend is using the same Atlas database you used locally, your
admin account already exists — just log in. If it's a fresh database, repeat
the `seedAdmin.js` step, but run it with `MONGO_URI` pointed at the same Atlas
cluster your Render backend uses (you can run the script from your own
computer — it doesn't need to run on Render).

### 5.6 Day-to-day workflow from here

```bash
# make changes locally, test with npm run dev, then:
git add .
git commit -m "describe your change"
git push
```
Render and Vercel both pick up the push automatically and redeploy within a
minute or two — no manual steps needed after this point.

## 6. Notes on free services

- **Database:** MongoDB Atlas (free 512MB cluster) — already set up
- **File storage:** Cloudinary (free tier, ~25GB storage/bandwidth) — photos,
  supporting documents, and QR codes all live here, so nothing is lost when
  your backend host restarts or redeploys
- **Hosting:** Render (backend) + Vercel (frontend), both free tiers, both
  above

## 7. What's built vs. what's next

Built: landing page, admin login (JWT), admin dashboard (search, filter,
verify/unverify, availability toggle, delete), add-athlete form with photo +
multi-document upload (stored on Cloudinary), auto-generated short ID + QR
code per athlete (also on Cloudinary), printable bilingual ID card
(5.4×8.5cm, exportable to A4 or as a JPG image), bulk export with team/role
filters, public verify page.

Worth adding next: pagination on the dashboard for large rosters, editing an
existing athlete's details, and per-admin roles if more than one person will
manage records.
