// Shared header, footer, theme toggle and subscribe form for every page.
// Edit the header or footer here once, and every page updates.
//
// How to use on a page:
//   <header id="site-header"></header>   (anything inside stays, e.g. the music widget)
//   <footer id="site-footer" class="site-footer"></footer>
//   <script src="/site.js"></script>     (at the end of <body>)

// Where the API server (server.js) runs.
// On bluebound-ink.com it is the Cloud Run service; on your computer it is the local server.
window.API_BASE = window.location.hostname.endsWith('bluebound-ink.com')
    ? 'https://bluebound-api-311249662921.europe-west3.run.app'
    : '';

(function () {
    const NAV_LINKS = [
        { href: '/books.html', label: 'Books', section: 'books' },
        { href: '/watch.html', label: 'Watch', section: 'watch' },
        { href: '/music.html', label: 'Music', section: 'music' },
        { href: '/about.html', label: 'About', section: 'about' },
    ];

    // Which nav link is the current page? Book reviews count as "books".
    const path = window.location.pathname;
    let currentSection = '';
    if (path.startsWith('/book-reviews/') || path.endsWith('/books.html')) currentSection = 'books';
    else if (path.endsWith('/music.html')) currentSection = 'music';
    else if (path.endsWith('/watch.html')) currentSection = 'watch';
    else if (path.endsWith('/about.html')) currentSection = 'about';

    // ---------- Header ----------
    const header = document.getElementById('site-header');
    if (header) {
        const branding = `
            <div class="site-branding">
                <h1 class="site-title"><a href="/index.html">Bluebound <span class="gold-accent">Ink</span></a></h1>
            </div>`;

        const links = NAV_LINKS.map(link => {
            const current = link.section === currentSection ? ' class="active" aria-current="page"' : '';
            return `<a href="${link.href}"${current}>${link.label}</a>`;
        }).join('');

        const nav = `
            <nav aria-label="Main">
                ${links}
                <button class="theme-toggle" id="themeToggleBtn" type="button" aria-label="Switch light or dark theme">🌙</button>
            </nav>`;

        header.insertAdjacentHTML('afterbegin', branding);
        header.insertAdjacentHTML('beforeend', nav);
    }

    // ---------- Footer ----------
    const footer = document.getElementById('site-footer');
    if (footer) {
        const year = new Date().getFullYear();
        const quickLinks = [{ href: '/index.html', label: 'Home' }, ...NAV_LINKS]
            .map(link => `<li><a href="${link.href}">${link.label}</a></li>`)
            .join('');

        footer.innerHTML = `
            <div class="footer-container">
                <div class="footer-col">
                    <h3>Bluebound Ink</h3>
                    <p>A personal space for books, music, and creative explorations.</p>
                </div>
                <div class="footer-col">
                    <h4>Quick Links</h4>
                    <ul>${quickLinks}</ul>
                </div>
                <div class="footer-col">
                    <h4>Stay Updated</h4>
                    <p>Get new posts and updates sent straight to your inbox.</p>
                    <form id="subscribe-form" class="subscribe-form">
                        <input type="email" id="subscriber-email" placeholder="Your email address" aria-label="Email address" required>
                        <button type="submit">Subscribe</button>
                    </form>
                    <p id="form-message" class="form-message" role="status"></p>
                </div>
            </div>
            <div class="footer-bottom">
                <p>&copy; ${year} Bluebound Ink. All rights reserved.</p>
                <div class="footer-legal">
                    <a href="/privacy/privacy.html">Privacy Policy</a>
                    <span aria-hidden="true">|</span>
                    <a href="/privacy/terms.html">Terms of Service</a>
                </div>
            </div>`;
    }

    // ---------- Light / dark theme ----------
    const themeToggleBtn = document.getElementById('themeToggleBtn');

    function showTheme() {
        const isLight = document.body.classList.contains('light-mode');
        if (themeToggleBtn) themeToggleBtn.textContent = isLight ? '☀️' : '🌙';
    }

    if (localStorage.getItem('theme') === 'light') {
        document.body.classList.add('light-mode');
    }
    showTheme();

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            document.body.classList.toggle('light-mode');
            const isLight = document.body.classList.contains('light-mode');
            localStorage.setItem('theme', isLight ? 'light' : 'dark');
            showTheme();
        });
    }

    // ---------- Subscribe form ----------
    const subscribeForm = document.getElementById('subscribe-form');
    if (subscribeForm) {
        subscribeForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const emailInput = document.getElementById('subscriber-email');
            const messageEl = document.getElementById('form-message');

            try {
                const response = await fetch(window.API_BASE + '/api/subscribe', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: emailInput.value })
                });
                const data = await response.json();

                messageEl.textContent = data.message;
                messageEl.style.color = data.success ? 'green' : 'red';
                if (data.success) emailInput.value = '';
            } catch (error) {
                messageEl.textContent = 'Something went wrong. Please try again later.';
                messageEl.style.color = 'red';
            }
        });
    }
})();
