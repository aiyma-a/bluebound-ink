require('dotenv').config();

const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Cloud Run sets K_SERVICE. There the server logs in to Firebase with its own
// Google account, so no key file is needed. On your computer it uses serviceAccountKey.json.
const isCloudRun = Boolean(process.env.K_SERVICE);
const keyFile = path.join(__dirname, 'serviceAccountKey.json');

if (!isCloudRun && fs.existsSync(keyFile)) {
    initializeApp({ credential: cert(require(keyFile)) });
} else {
    initializeApp();
}
const db = getFirestore();

// Configure Nodemailer transporter using Gmail SMTP.
// EMAIL_USER and EMAIL_PASS come from .env. Never write the password in this file.
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Only these websites may call the API from a browser.
// Set ALLOWED_ORIGIN in .env or on Cloud Run (comma-separated) to change it.
const allowedOrigins = (process.env.ALLOWED_ORIGIN || 'https://bluebound-ink.com,https://www.bluebound-ink.com')
    .split(',')
    .map(origin => origin.trim());

const app = express();

// Cloud Run sits behind a Google proxy; trust it so we see the real visitor IP and https
app.set('trust proxy', 1);
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '10kb' }));

// Speed limits, so bots cannot use the forms to send lots of email
const formLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many tries. Please wait 15 minutes.', message: 'Too many tries. Please wait 15 minutes.' }
});
const linkLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });

// On your computer the server also shows the website, so you can test everything at
// http://127.0.0.1:3000. On Cloud Run it is only the API (the website is on GitHub Pages).
if (!isCloudRun) {
    // Only public website files. Never serve serviceAccountKey.json, .env, server.js,
    // scripts/ or node_modules/. (.json files are not served at all.)
    const publicFile = /\.(html|css|js|svg|webp|jpe?g|png|gif|ico|pdf|txt)$/i;
    const privatePath = /^\/(server\.js|node_modules|scripts)(\/|$)/i;
    app.use((req, res, next) => {
        const hasExtension = /\.[a-z0-9]+$/i.test(req.path);
        if (privatePath.test(req.path) || (hasExtension && !publicFile.test(req.path))) {
            return res.status(404).send('Not found');
        }
        next();
    }, express.static(__dirname, { dotfiles: 'ignore' }));
}

app.post('/api/recommendations', formLimiter, async (req, res) => {
  const { bookInfo, comment, tag } = req.body;

  if (!bookInfo) {
    return res.status(400).json({ error: 'Title & Author are required.' });
  }

  // Only plain text is accepted (not objects or lists)
  if (typeof bookInfo !== 'string' || (comment != null && typeof comment !== 'string') || (tag != null && typeof tag !== 'string')) {
    return res.status(400).json({ error: 'Invalid input.' });
  }

  if (bookInfo.length > 200 || (comment || '').length > 2000 || (tag || '').length > 50) {
    return res.status(400).json({ error: 'Your note is too long.' });
  }

  // The tag goes into the email subject: keep it to one short line, no line breaks
  const cleanTag = (tag || 'none').replace(/[\r\n\t]+/g, ' ').trim() || 'none';

  const mailOptions = {
    from: '"Bluebound Ink Reader" <bluebound.ink@gmail.com>',
    to: 'bluebound.ink@gmail.com',
    subject: `New Book Recommendation [${cleanTag}]`,
    text: `You received a new recommendation!\n\nTag: #${cleanTag}\nBook: ${bookInfo}\nNotes: ${comment || 'N/A'}`
  };

  try {
    await transporter.sendMail(mailOptions);
    return res.status(200).json({ success: true, message: 'Recommendation sent!' });
  } catch (error) {
    console.error('Email error:', error);
    return res.status(500).json({ error: 'Failed to send email.' });
  }
});

// ---------- Subscribe (confirm by email, one subscription per email) ----------
//
// 1. POST /api/subscribe saves the email as "pending" and sends a "confirm" email.
// 2. GET /api/confirm?token=... marks it "confirmed" and sends the welcome email.
// 3. GET /api/unsubscribe?token=... removes the email from the list.
// Subscribers saved before this change have no status; they count as confirmed.

const SITE_URL = process.env.SITE_URL || 'https://bluebound-ink.com';
const RESEND_CONFIRM_AFTER_MS = 60 * 60 * 1000; // send the confirm email again only after 1 hour

const subscribers = db.collection('subscribers');

function normalizeEmail(email) {
    return String(email).trim().toLowerCase();
}

function newToken() {
    return crypto.randomBytes(24).toString('hex');
}

// Public address of this server, used in email links
function apiUrl(req) {
    return `${req.protocol}://${req.get('host')}`;
}

function isConfirmed(data) {
    return !data.status || data.status === 'confirmed';
}

async function findByToken(token) {
    if (typeof token !== 'string' || !/^[a-f0-9]{48}$/.test(token)) return null;
    const snapshot = await subscribers.where('token', '==', token).limit(1).get();
    return snapshot.empty ? null : snapshot.docs[0];
}

function emailLayout(title, bodyHtml) {
    return `
        <div style="font-family: Georgia, serif; color: #2c2925; padding: 20px; max-width: 520px;">
            <h2 style="font-style: italic; font-weight: 500;">${title}</h2>
            ${bodyHtml}
            <p style="color: #888; font-size: 0.9rem; margin-top: 30px;">Bluebound Ink</p>
        </div>`;
}

app.post('/api/subscribe', formLimiter, async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ success: false, message: "Email is required." });
        }

        // Simple check so the server does not send mail to nonsense addresses
        if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            return res.status(400).json({ success: false, message: "Please enter a valid email address." });
        }

        const cleanEmail = normalizeEmail(email);
        const subscriberRef = subscribers.doc(cleanEmail);
        const existing = await subscriberRef.get();

        if (existing.exists) {
            const data = existing.data();

            if (isConfirmed(data)) {
                return res.status(200).json({ success: true, message: "You're already subscribed. Thank you!" });
            }

            const lastSent = Date.parse(data.confirmSentAt || 0);
            if (Date.now() - lastSent < RESEND_CONFIRM_AFTER_MS) {
                return res.status(200).json({
                    success: true,
                    message: "We already sent you a confirmation email. Please check your inbox (and spam folder)."
                });
            }
        }

        const token = existing.exists && existing.data().token ? existing.data().token : newToken();
        const now = new Date().toISOString();

        await subscriberRef.set({
            email: cleanEmail,
            status: 'pending',
            token: token,
            subscribedAt: existing.exists ? existing.data().subscribedAt || now : now,
            confirmSentAt: now
        });

        const confirmLink = `${apiUrl(req)}/api/confirm?token=${token}`;

        await transporter.sendMail({
            from: { name: 'Bluebound Ink', address: process.env.EMAIL_USER },
            to: cleanEmail,
            subject: 'Please confirm your subscription to Bluebound Ink',
            text: `Please confirm your subscription to Bluebound Ink:\n\n${confirmLink}\n\nIf you did not subscribe, ignore this email. You will not hear from us again.`,
            html: emailLayout('One more step', `
                <p>Please confirm that you want occasional notes from Bluebound Ink.</p>
                <p><a href="${confirmLink}" style="display: inline-block; background: #d4af37; color: #0f172a; padding: 10px 20px; border-radius: 4px; text-decoration: none; font-family: sans-serif; font-size: 0.9rem; letter-spacing: 0.05em;">Confirm subscription</a></p>
                <p style="color: #666; font-size: 0.9rem;">If you did not subscribe, ignore this email. You will not hear from us again.</p>
            `)
        });
        console.log(`Confirmation email sent: ${cleanEmail}`);

        return res.status(200).json({
            success: true,
            message: "Almost done! Check your inbox and click the link to confirm."
        });

    } catch (error) {
        console.error("Subscription or Email Error:", error);
        res.status(500).json({ success: false, message: "Something went wrong. Please try again later." });
    }
});

app.get('/api/confirm', linkLimiter, async (req, res) => {
    try {
        const doc = await findByToken(req.query.token);
        if (!doc) {
            return res.redirect(`${SITE_URL}/subscribe/confirmed.html?status=invalid`);
        }

        const data = doc.data();
        if (data.status === 'pending') {
            await doc.ref.update({ status: 'confirmed', confirmedAt: new Date().toISOString() });

            const unsubscribeLink = `${apiUrl(req)}/api/unsubscribe?token=${data.token}`;
            await transporter.sendMail({
                from: { name: 'Bluebound Ink', address: process.env.EMAIL_USER },
                to: data.email,
                subject: 'Welcome to Bluebound Ink',
                headers: { 'List-Unsubscribe': `<${unsubscribeLink}>` },
                text: `Thank you for subscribing to Bluebound Ink.\n\nTo unsubscribe: ${unsubscribeLink}`,
                html: emailLayout('Welcome to Bluebound Ink', `
                    <p>Thank you for subscribing. You are now on the list to receive occasional notes.</p>
                    <p style="color: #888; font-size: 0.8rem; margin-top: 30px;">Don't want these emails? <a href="${unsubscribeLink}" style="color: #888;">Unsubscribe</a></p>
                `)
            });
            console.log(`Subscriber confirmed: ${data.email}`);
        }

        return res.redirect(`${SITE_URL}/subscribe/confirmed.html`);
    } catch (error) {
        console.error("Confirm Error:", error);
        return res.redirect(`${SITE_URL}/subscribe/confirmed.html?status=error`);
    }
});

app.get('/api/unsubscribe', linkLimiter, async (req, res) => {
    try {
        const doc = await findByToken(req.query.token);
        if (doc) {
            await doc.ref.delete();
            console.log(`Subscriber removed: ${doc.data().email}`);
        }
        return res.redirect(`${SITE_URL}/subscribe/unsubscribed.html`);
    } catch (error) {
        console.error("Unsubscribe Error:", error);
        return res.redirect(`${SITE_URL}/subscribe/unsubscribed.html?status=error`);
    }
});

const PORT = process.env.PORT || 3000;
// On your computer listen only on this machine, not on the whole network
app.listen(PORT, isCloudRun ? undefined : '127.0.0.1', () => {
    console.log(`Server running on http://127.0.0.1:${PORT}`);
});