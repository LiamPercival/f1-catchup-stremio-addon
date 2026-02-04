# F1 Catchup - Stremio Addon

Formula 1 addon for Stremio with Torbox integration. Hosted for free on Cloudflare Pages.

**Features:**
- 🏎️ All F1 seasons (2000 onwards)
- 🏁 Every session: FP1, FP2, FP3, Qualifying, Grand Prix
- 🚩 Country flags as thumbnails (spoiler-free!)
- 📅 Auto-updating calendar
- ☁️ Torbox integration for streams

---

## 🚀 Setup Guide (Step by Step)

### Step 1: Create a GitHub Repository

1. Go to [github.com](https://github.com) and log in
2. Click the **+** in the top right → **New repository**
3. Name it `f1-catchup-addon`
4. Keep it **Public** (required for free Cloudflare Pages)
5. Click **Create repository**

---

### Step 2: Upload the Files

**Option A: Using GitHub Web Interface (Easiest)**

1. On your new repo page, click **"uploading an existing file"**
2. Drag and drop ALL files from this folder:
   - `public/` folder (with index.html inside)
   - `functions/` folder (with [[path]].js inside)
   - `package.json`
3. Click **Commit changes**

**Option B: Using Git Command Line**

```bash
git clone https://github.com/YOUR_USERNAME/f1-catchup-addon.git
cd f1-catchup-addon
# Copy all the files into this folder
git add .
git commit -m "Initial commit"
git push
```

---

### Step 3: Connect to Cloudflare Pages

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com)
2. Log in (or create a free account)
3. In the left sidebar, click **Workers & Pages**
4. Click **Create application**
5. Click **Pages** tab
6. Click **Connect to Git**

---

### Step 4: Select Your Repository

1. Click **Connect GitHub**
2. Authorize Cloudflare to access your GitHub
3. Select the `f1-catchup-addon` repository
4. Click **Begin setup**

---

### Step 5: Configure Build Settings

Fill in these settings:

| Setting | Value |
|---------|-------|
| Project name | `f1-catchup` (or whatever you want) |
| Production branch | `main` |
| Build command | *(leave empty)* |
| Build output directory | `public` |

Click **Save and Deploy**

---

### Step 6: Wait for Deployment

- Cloudflare will build and deploy your addon
- This takes about 1-2 minutes
- Once done, you'll see a URL like: `f1-catchup.pages.dev`

---

### Step 7: (Optional) Add Custom Domain

If you want to use your own domain (e.g., `f1.yourdomain.com`):

1. In your Pages project, click **Custom domains**
2. Click **Set up a custom domain**
3. Enter your subdomain: `f1.yourdomain.com`
4. Click **Continue**
5. Cloudflare will automatically configure DNS (since your domain is already on Cloudflare)

---

### Step 8: Get Your Torbox API Key

1. Go to [torbox.app](https://torbox.app)
2. Sign up or log in
3. Click your profile → **Settings**
4. Click **API** in the sidebar
5. Copy your API key

---

### Step 9: Install the Addon

1. Open your addon URL in a browser:
   - `https://f1-catchup.pages.dev` (default)
   - or `https://f1.yourdomain.com` (if you set up custom domain)

2. Paste your Torbox API key in the input box

3. Click **"Install to Stremio"**

4. Stremio opens → Click **Install**

**Done! 🎉**

---

## 📺 Using the Addon

1. Open Stremio
2. Your F1 Catchup addon is now installed
3. Go to **Discover** or search for "F1"
4. Browse seasons → Select episode → Stream plays!

---

## 🔄 Updating the Addon

Whenever you push changes to GitHub, Cloudflare automatically redeploys:

```bash
git add .
git commit -m "Update"
git push
```

That's it - no manual deployment needed!

---

## 🔧 Troubleshooting

### "Page not loading"
- Check your Cloudflare Pages deployment status
- Make sure the build output directory is set to `public`

### "Stremio doesn't open when clicking Install"
1. Open Stremio manually
2. Go to Addons (puzzle icon)
3. Click the search bar at the top
4. Paste: `https://YOUR-DOMAIN/YOUR_API_KEY/manifest.json`
5. Press Enter → Install

### "No streams found"
- Verify your Torbox API key is correct
- Some older sessions may not have torrents available
- Try a recent popular race first

### "Calendar not updating"
- Cloudflare caches responses for 24 hours
- New races appear within a day of being announced

---

## 📁 File Structure

```
f1-catchup-addon/
├── public/
│   └── index.html       # Config page
├── functions/
│   └── [[path]].js      # Addon API (Cloudflare Function)
├── package.json
└── README.md
```

---

## 🆓 Costs

**Completely free!**
- GitHub: Free for public repos
- Cloudflare Pages: Free tier includes 500 builds/month and unlimited requests

---

## ✨ How It Works

1. You visit the config page and enter your Torbox API key
2. The key becomes part of the manifest URL (stored in Stremio, not on server)
3. When you browse F1 content, the addon fetches race data from the F1 API
4. When you play a video, it searches Torbox for available streams
5. Everything runs serverless on Cloudflare's edge network
