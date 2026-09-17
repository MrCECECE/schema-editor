const Hotkeys = {
  bind(map, opts = {}) {
    const ignoreInInput = opts.ignoreInInput !== false;

    document.addEventListener('keydown', (e) => {
      if (ignoreInInput) {
        const t = e.target;
        if (t && (
            t.tagName === 'INPUT' ||
            t.tagName === 'TEXTAREA' ||
            t.tagName === 'SELECT' ||
            t.isContentEditable
        )) return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const key = e.key.toLowerCase();
      const handler = map[key];
      if (handler) {
        e.preventDefault();
        handler(e);
      }
    });
  }
};