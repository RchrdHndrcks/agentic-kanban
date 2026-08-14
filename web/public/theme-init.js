(() => {
  try {
    const stored = localStorage.getItem('kanban.theme');
    const theme = stored === 'light' || stored === 'dark'
      ? stored
      : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch {
    // Theme selection is an enhancement; the stylesheet defaults to light.
  }
})();
