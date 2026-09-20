(function () {
  const KEY = 'schema_editor_theme';

  function apply(theme) {
    document.documentElement.dataset.theme = theme;
    if (document.body) {
      document.body.classList.toggle('theme-dark', theme === 'dark');
      document.body.classList.toggle('theme-light', theme === 'light');
    }
  }

  function current() {
    return localStorage.getItem(KEY)
      || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }

  function toggle() {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem(KEY, next);
    apply(next);
  }

  apply(current());

  window.Theme = { toggle, current, apply };
})();