# Bluebound Ink

A personal book and music blog at [bluebound-ink.com](https://bluebound-ink.com).

The site has two parts:

| Part | What it is | Where it runs |
|------|-----------|---------------|
| **Website** | Plain HTML, CSS and JavaScript files (no build step) | GitHub Pages, from the `main` branch (`CNAME` sets the domain) |
| **API** | `server.js`, a small Node.js and Express server | Google Cloud Run, service `bluebound-api` in `europe-west3` |

Subscriber emails are stored in Firestore (collection `subscribers`). Firestore rules deny all direct access, so only the API can read them.

## What is in the repo

- `index.html`, `books.html`, `music.html`, `about.html`, `post-single.html`: the main pages.
- `book-reviews/<name>.html`: one file per review.
- `images/`: covers and pictures.
- `site.js`: shared header, footer, subscribe form, and `API_BASE` (the API address).
- `style.css`: styles.
- `subscribe/`: pages shown after confirming or unsubscribing.
- `privacy/`: privacy and terms pages.
- `server.js`: the API.
- `scripts/notify-subscribers.js`: emails subscribers about a new review.
- `firestore.rules`, `firestore.indexes.json`, `firebase.json`: Firestore setup.

## The API

| Endpoint | What it does |
|----------|--------------|
| `POST /api/subscribe` | Saves an email as "pending" and sends a confirmation email |
| `GET /api/confirm?token=...` | Confirms the subscription and sends a welcome email |
| `GET /api/unsubscribe?token=...` | Removes the subscriber |
| `POST /api/recommendations` | Emails a reader's book recommendation to the blog's inbox |

Forms are limited to 5 tries per 15 minutes per visitor. Only the sites listed in `ALLOWED_ORIGIN` may call the API from a browser.

## Run it on your computer

You need Node.js 22 or newer.

```bash
npm ci
# create the .env file first (see below)
npm start
```

Open <http://127.0.0.1:3000>. Locally the server also shows the website, but only public files (pages, styles, images). It listens only on your own computer.

Create a `.env` file (it is git-ignored, never commit it):

```
EMAIL_USER=the Gmail address that sends mail
EMAIL_PASS=a Gmail app password
```

For Firestore, put a Firebase service account key in `serviceAccountKey.json` (also git-ignored). Without it the server falls back to the default Google login.

Optional settings: `ALLOWED_ORIGIN` (comma-separated websites allowed to call the API), `SITE_URL`, `PORT`.

## Deploy the API

The website deploys by itself when `main` changes. The API does not: after changing `server.js` or its dependencies, deploy it from a clean copy of `main`:

```bash
gcloud run deploy bluebound-api --source . --region europe-west3
```

On Cloud Run the server logs in to Firebase with its own Google account, so no key file is needed. `EMAIL_PASS` comes from Secret Manager. If you set `ALLOWED_ORIGIN` with commas, pass environment variables with the `^;^` delimiter (see `gcloud run deploy --help`). If you deploy with `--no-traffic`, run `gcloud run services update-traffic bluebound-api --to-latest` afterwards.

## Email subscribers about a new review

Run this on your own computer from the repo folder (it needs `.env` and `serviceAccountKey.json`):

```bash
node scripts/notify-subscribers.js alchemised                 # preview only, sends nothing
node scripts/notify-subscribers.js alchemised --to you@x.com  # one test email
node scripts/notify-subscribers.js alchemised --send          # send to all confirmed subscribers
```

`alchemised` is the file name in `book-reviews/` without `.html`. A review is sent to everyone only once; add `--force` to send it again.

## Adding a review

1. Add `book-reviews/<name>.html`, including its `og:title`, `og:description` and `og:image` tags (the email uses them).
2. Add the cover as `images/covers/<name>.webp` (or `.jpg`) at about 400 px wide.
3. List the book in `books.html`. Genres live in two places: `data-genres` on the `.book-item` in `books.html`, and the `.review-tags` links inside the review page.

## Security notes

- Never commit `.env`, `serviceAccountKey.json` or any password. They are in `.gitignore`.
- Run `npm audit --omit=dev` now and then, and redeploy the API after updating dependencies.
