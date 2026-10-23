(() => {
  const dialog = document.querySelector('#brand-film-dialog');
  const video = document.querySelector('#brand-film-video');
  const status = document.querySelector('#brand-film-status');
  if (!dialog || !video || !status || typeof dialog.showModal !== 'function') return;

  const showLoading = () => {
    if (video.error) return;
    status.textContent = 'Loading the film…';
    status.hidden = false;
  };
  const showFailure = () => {
    status.textContent = 'The film couldn’t load here. You can open the video directly below.';
    status.hidden = false;
  };
  const clearLoading = () => { if (!video.error) status.hidden = true; };

  document.querySelectorAll('[data-brand-film]').forEach(link => {
    link.addEventListener('click', event => {
      event.preventDefault();
      if (!dialog.open) dialog.showModal();
      if (video.error) {
        showFailure();
        return;
      }
      if (!video.getAttribute('src')) {
        video.setAttribute('src', video.dataset.src);
        video.load();
      }
      if (video.readyState < 3) showLoading();
      const playback = video.play();
      playback?.then(() => {
        if (!dialog.open || document.hidden) video.pause();
      }).catch(() => {
        // Browsers may require their native Play control. Keep it available.
        if (video.error) showFailure();
        else clearLoading();
      });
    });
  });

  video.addEventListener('canplay', clearLoading);
  video.addEventListener('playing', () => {
    if (!dialog.open || document.hidden) video.pause();
    else clearLoading();
  });
  video.addEventListener('waiting', () => { if (dialog.open) showLoading(); });
  video.addEventListener('error', showFailure);
  dialog.addEventListener('close', () => video.pause());
  document.addEventListener('visibilitychange', () => { if (document.hidden) video.pause(); });
})();
