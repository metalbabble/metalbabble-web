// Status bar clock
function updateClock() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  document.getElementById('status-right').textContent =
    `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}  ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}
updateClock();
setInterval(updateClock, 1000);

// Accessibility: enable/disable high contrast mode
const highContrastLink = document.getElementById('toggle-high-contrast');
if (highContrastLink) {
  highContrastLink.addEventListener('click', function (event) {
    event.preventDefault();
    const body = document.body;
    const isActive = !body.classList.contains('high-contrast');
    body.classList.toggle('high-contrast', isActive);
    highContrastLink.textContent = isActive ? 'DISABLE HIGH CONTRAST' : 'ENABLE HIGH CONTRAST';
    highContrastLink.setAttribute('aria-pressed', String(isActive));
    window.dispatchEvent(new CustomEvent('highContrastMode', { detail: { enabled: isActive } }));
  });
}

// Mobile nav toggle
const nav = document.getElementById('main-nav');
const navToggle = document.getElementById('nav-toggle');
if (nav && navToggle) {
  navToggle.addEventListener('click', () => {
    const expanded = navToggle.getAttribute('aria-expanded') === 'true';
    navToggle.setAttribute('aria-expanded', String(!expanded));
    nav.classList.toggle('expanded', !expanded);
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 600) {
      nav.classList.remove('expanded');
      navToggle.setAttribute('aria-expanded', 'false');
    }
  });
}

// Highlight nav link on scroll
const sections = document.querySelectorAll('section[id]');
const navLinks = document.querySelectorAll('nav a:not(.nav-control)');
const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      navLinks.forEach(a => {
        a.style.color = a.getAttribute('href') === '#' + entry.target.id
          ? 'var(--green)'
          : 'var(--green-dim)';
      });
    }
  });
}, { threshold: 0.4 });
sections.forEach(s => observer.observe(s));
