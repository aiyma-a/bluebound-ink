// Bluebound Ink: design helpers for review pages.
// Adds "More #genre books" at the end, read from books.html.

(function () {
    const cover = document.querySelector('.review-cover');
    if (!cover) return;

    // ---------- More like this ----------
    const tags = Array.from(document.querySelectorAll('.review-tags .genre-tag'))
        .map(tag => tag.textContent.replace('#', ''));
    if (!tags.length) return;

    // Use the most specific tag ("fantasy" is too broad when there is another one)
    const genre = tags.find(tag => tag !== 'fantasy') || tags[0];
    const thisPage = window.location.pathname.split('/').pop();

    fetch('/books.html')
        .then(response => response.text())
        .then(html => {
            const page = new DOMParser().parseFromString(html, 'text/html');
            const matches = Array.from(page.querySelectorAll('.book-item[data-genres]'))
                .filter(book => book.dataset.genres.split(' ').includes(genre))
                .filter(book => !book.querySelector('a').getAttribute('href').endsWith(thisPage))
                .slice(0, 4);
            if (!matches.length) return;

            const section = document.createElement('section');
            section.className = 'more-like-this';
            section.innerHTML = `<h3>More #${genre} books</h3><div class="book-list"></div>`;
            const list = section.querySelector('.book-list');

            matches.forEach(book => {
                const item = document.importNode(book, true);
                // Links in books.html start from the site root
                item.querySelectorAll('a').forEach(a => a.setAttribute('href', '/' + a.getAttribute('href')));
                item.querySelectorAll('img').forEach(img => img.setAttribute('src', '/' + img.getAttribute('src')));
                list.appendChild(item);
            });

            const main = document.querySelector('main');
            main.insertBefore(section, main.querySelector('.back-link'));
        })
        .catch(() => {});
})();
