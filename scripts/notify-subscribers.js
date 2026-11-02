// Email confirmed subscribers about a new book review.
//
// Run it on your own computer (it needs .env and serviceAccountKey.json, which are not in git).
//
//   node scripts/notify-subscribers.js alchemised                 preview only: nothing is sent
//   node scripts/notify-subscribers.js alchemised --to you@x.com  send ONE test email to that address
//   node scripts/notify-subscribers.js alchemised --send          send to all confirmed subscribers
//
// "alchemised" is the file name in book-reviews/ without ".html".
// A review is sent to everyone only once. Add --force to send it again.

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const SITE_URL = process.env.SITE_URL || 'https://bluebound-ink.com';
const API_URL = process.env.API_URL || 'https://bluebound-api-311249662921.europe-west3.run.app';
const PAUSE_MS = 1500; // wait between emails so Gmail does not block us

const args = process.argv.slice(2);
const slug = args.find(a => !a.startsWith('--'));
const flag = name => args.includes(`--${name}`);
const toIndex = args.indexOf('--to');
const testAddress = toIndex >= 0 ? args[toIndex + 1] : null;

function fail(message) {
    console.error(`Error: ${message}`);
    process.exit(1);
}

const escapeHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const decodeHtml = s => String(s).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

// Read title, description and cover from the review page's link-preview tags
function readReview(slug) {
    if (!/^[a-z0-9-]+$/.test(slug || '')) fail('Give the review name, for example: alchemised');
    const file = path.join(__dirname, '..', 'book-reviews', `${slug}.html`);
    if (!fs.existsSync(file)) fail(`book-reviews/${slug}.html does not exist.`);
    const html = fs.readFileSync(file, 'utf8');
    const meta = property => {
        const match = html.match(new RegExp(`<meta property="${property}" content="([^"]*)"`));
        return match ? decodeHtml(match[1]) : '';
    };
    const title = meta('og:title').replace(/\s*\|\s*Bluebound Ink$/, '').replace(/\s+[—-]\s+a review$/, '');
    if (!title) fail('That review page has no og:title tag.');
    return { title, description: meta('og:description'), image: meta('og:image'), url: `${SITE_URL}/book-reviews/${slug}.html` };
}

function buildEmail(review, unsubscribeLink) {
    const text = `${review.title}\n\n${review.description}\n\nRead the review: ${review.url}\n\nUnsubscribe: ${unsubscribeLink}`;
    const html = `
        <div style="font-family: Georgia, serif; color: #2c2925; padding: 20px; max-width: 520px;">
            <p style="color: #888; font-size: 0.85rem; letter-spacing: 0.08em; text-transform: uppercase;">New on Bluebound Ink</p>
            <h2 style="font-style: italic; font-weight: 500;">${escapeHtml(review.title)}</h2>
            ${review.image ? `<p><img src="${escapeHtml(review.image)}" alt="" width="160" style="border-radius: 4px;"></p>` : ''}
            <p>${escapeHtml(review.description)}</p>
            <p><a href="${escapeHtml(review.url)}" style="display: inline-block; background: #d4af37; color: #0f172a; padding: 10px 20px; border-radius: 4px; text-decoration: none; font-family: sans-serif; font-size: 0.9rem; letter-spacing: 0.05em;">Read the review</a></p>
            <p style="color: #888; font-size: 0.8rem; margin-top: 30px;">Don't want these emails? <a href="${escapeHtml(unsubscribeLink)}" style="color: #888;">Unsubscribe</a></p>
        </div>`;
    return { text, html };
}

async function main() {
    const review = readReview(slug);
    const keyFile = path.join(__dirname, '..', 'serviceAccountKey.json');
    if (!fs.existsSync(keyFile)) fail('serviceAccountKey.json is missing. Run this on your own computer.');
    const willSend = Boolean(testAddress) || flag('send');
    if (willSend && (!process.env.EMAIL_USER || !process.env.EMAIL_PASS)) fail('EMAIL_USER and EMAIL_PASS must be set in .env to send email.');

    initializeApp({ credential: cert(require(keyFile)) });
    const db = getFirestore();
    const sentMarker = db.collection('notifications').doc(slug);

    const snapshot = await db.collection('subscribers').get();
    // Old subscribers have no status and count as confirmed (same rule as server.js)
    const recipients = snapshot.docs.map(d => d.data()).filter(s => !s.status || s.status === 'confirmed');

    console.log(`Review:     ${review.title}`);
    console.log(`Link:       ${review.url}`);
    console.log(`Recipients: ${recipients.length} confirmed subscriber(s)\n`);

    const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS } });
    const sendTo = async (address, token) => {
        const unsubscribeLink = `${API_URL}/api/unsubscribe?token=${token}`;
        const { text, html } = buildEmail(review, unsubscribeLink);
        await transporter.sendMail({
            from: { name: 'Bluebound Ink', address: process.env.EMAIL_USER },
            to: address,
            subject: `New review: ${review.title}`,
            headers: { 'List-Unsubscribe': `<${unsubscribeLink}>` },
            text,
            html
        });
    };

    if (testAddress) {
        await sendTo(testAddress, '0'.repeat(48)); // test link does not unsubscribe anyone
        console.log(`Test email sent to ${testAddress}. Nothing was sent to subscribers.`);
        return;
    }

    if (!flag('send')) {
        console.log('Preview only. Nothing was sent. Add --to your@email to send yourself a test, or --send to email everyone.');
        return;
    }

    const already = await sentMarker.get();
    if (already.exists && !flag('force')) {
        fail(`This review was already sent on ${already.data().sentAt}. Add --force to send it again.`);
    }

    let sent = 0;
    const failed = [];
    for (const subscriber of recipients) {
        try {
            await sendTo(subscriber.email, subscriber.token);
            sent++;
            console.log(`Sent: ${subscriber.email}`);
        } catch (error) {
            failed.push(subscriber.email);
            console.error(`Failed: ${subscriber.email} (${error.message})`);
        }
        await new Promise(resolve => setTimeout(resolve, PAUSE_MS));
    }

    await sentMarker.set({ slug, sentAt: new Date().toISOString(), sent, failed });
    console.log(`\nDone. Sent ${sent}, failed ${failed.length}.`);
}

main().catch(error => fail(error.message));
