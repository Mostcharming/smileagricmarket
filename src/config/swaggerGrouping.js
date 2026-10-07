'use strict';

// Swagger UI renders tags as a flat list; add audience headings above the
// ordered topic sections. Observe rerenders so filtering keeps headings correct.
const swaggerGroupingScript = `
(() => {
    const groups = ['Web Admin', 'Web Marketing', 'Mobile', 'Beta', 'Web'];
    function renderGroups() {
        const seen = new Set();
        document.querySelectorAll('.swagger-ui .opblock-tag-section').forEach(section => {
            const tag = section.querySelector('.opblock-tag');
            if (!tag) return;
            const name = tag.getAttribute('data-tag') || tag.textContent.trim();
            const group = groups.find(value => name.startsWith(value + ' '));
            const existing = section.querySelector('.swagger-audience-heading');
            if (!group || seen.has(group)) {
                if (existing) existing.remove();
                return;
            }
            seen.add(group);
            if (existing && existing.textContent === group) return;
            if (existing) existing.remove();
            const heading = document.createElement('h2');
            heading.className = 'swagger-audience-heading';
            heading.textContent = group;
            section.insertBefore(heading, section.firstChild);
        });
    }
    function start() {
        const root = document.getElementById('swagger-ui');
        if (!root) return;
        new MutationObserver(renderGroups).observe(root, { childList: true, subtree: true });
        renderGroups();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();`;

module.exports = { swaggerGroupingScript };
