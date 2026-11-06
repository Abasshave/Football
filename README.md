# Phoenix Football Scores

A clean, free football live scores website inspired by the **Football section** in Phoenix Browser.

### Features
- Today's matches + live scores
- Filter by major competitions
- League standings (Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Champions League)
- Follow your favourite teams (saved in your browser)
- Fully responsive (works great on mobile)
- Dark modern UI

---

## 1. Get a Free API Key (required)

The free tier of API-Football is very limited.  
This project uses the much better free option: **football-data.org**

1. Go to → [https://www.football-data.org/client/register](https://www.football-data.org/client/register)
2. Register (takes 30 seconds)
3. Copy your free API token

You get:
- Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Champions League + more
- 10 requests per minute (enough for personal use)

---

## 2. How to run locally

Just open `index.html` in your browser  
**or** use any static server:

```bash
# If you have Python
python -m http.server 3000

# or with Node
npx serve
```

Then open http://localhost:3000

Paste your API key when the banner appears.

---

## 3. Deploy to GitHub + Vercel (recommended – free)

### Option A – Vercel (easiest)

1. Create a new repository on GitHub and upload all files in this folder
2. Go to [vercel.com](https://vercel.com) → New Project → Import your GitHub repo
3. Click Deploy (no build settings needed – it's static)
4. Done! Your site will be live in ~30 seconds

### Option B – GitHub Pages

1. Push the files to a GitHub repository
2. Go to Settings → Pages → Source: Deploy from a branch → main / root
3. Your site will be at `https://yourusername.github.io/repo-name`

---

## 4. Project structure

```
phoenix-football-scores/
├── index.html      ← Main page
├── style.css       ← Dark modern design
├── app.js          ← All logic + API calls
└── README.md       ← This file
```

No build step, no dependencies, no Node required for the final site.

---

## 5. Want better live data later?

When you outgrow the free tier you can easily switch to:

| Provider            | Free Tier              | Paid starts at | Notes                     |
|---------------------|------------------------|----------------|---------------------------|
| football-data.org   | 12 competitions        | €12/mo         | Best free option          |
| API-Football        | 100 req/day            | $19/mo         | Very wide coverage        |
| Sportmonks          | 2 leagues              | €29/mo         | Excellent quality         |
| GOAL API / others   | Varies                 | ~$19           | Good alternatives         |

Just change the `API_BASE` and headers in `app.js`.

---

## License

Free to use and modify for personal or commercial projects.
