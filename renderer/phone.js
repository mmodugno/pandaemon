// Adaptador para ver el panda en el celular. Reemplaza el puente de Electron
// (preload.js) por pedidos al servidor local de Pandaemon, así panda.js funciona igual.
(() => {
  const STORE = 'pandaemon.view';
  const params = new URLSearchParams(location.search);
  let key = params.get('k') || '';
  try {
    if (key) localStorage.setItem(STORE, key);
    else key = localStorage.getItem(STORE) || '';
  } catch (e) { /* sin almacenamiento: vale solo para esta visita */ }
  // La clave no queda a la vista en la barra de direcciones
  if (params.has('k')) history.replaceState(null, '', location.pathname);

  document.documentElement.classList.add('phone');

  const status = document.createElement('div');
  status.id = 'phoneStatus';
  status.setAttribute('role', 'status');
  document.body.appendChild(status);
  const setOffline = (text) => {
    document.body.classList.toggle('offline', !!text);
    status.textContent = text || '';
  };

  // Pantalla siempre encendida (funciona porque la página se abre desde localhost)
  const keepAwake = () => {
    if (navigator.wakeLock && document.visibilityState === 'visible') navigator.wakeLock.request('screen').catch(() => {});
  };
  keepAwake();
  // Si salís de la app, se suelta la conexión y el panda vuelve a la computadora
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      keepAwake();
      if (!source && listeners.length) connect();
    } else if (source) {
      source.close();
      source = null;
    }
  });
  // Pantalla completa con el primer toque (el navegador no deja hacerlo antes)
  document.addEventListener('pointerdown', () => {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }, { once: true });

  const listeners = [];
  let source = null;

  function connect() {
    if (!key) {
      setOffline('Sin clave: abrí el panda desde el menú de Pandaemon en la computadora');
      return;
    }
    source = new EventSource(`stream?k=${encodeURIComponent(key)}`);
    source.onopen = () => setOffline('');
    source.onmessage = (e) => {
      let data;
      try { data = JSON.parse(e.data); } catch (err) { return; }
      if (data.reaction === 'ask' && navigator.vibrate) navigator.vibrate([120, 80, 120]);
      for (const cb of listeners) cb(data);
    };
    source.onerror = () => {
      setOffline('Sin conexión con la computadora…');
      // Si el servidor rechazó la conexión, EventSource no reintenta solo
      if (source && source.readyState === EventSource.CLOSED) {
        source = null;
        setTimeout(() => { if (!source && document.visibilityState === 'visible') connect(); }, 5000);
      }
    };
  }

  const post = (body) => fetch('focus', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Panda-View': key },
    body: JSON.stringify(body),
  }).catch(() => {});

  const noop = () => {};

  window.panda = {
    alwaysOpen: true, // la lista de sesiones queda siempre a la vista
    getState: () => fetch('state', { headers: { 'X-Panda-View': key } })
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({})),
    onState: (cb) => {
      listeners.push(cb);
      if (!source) connect();
    },
    focusSession: (id) => post({ id }),
    focusTeam: (team) => post({ team }),
    // En el celular no hay ventana que mover ni menú de la bandeja
    onCursor: noop, contextMenu: noop, resize: noop,
    dragStart: noop, dragMove: noop, dragEnd: noop,
    ignoreTeam: noop, ignoreSession: noop,
  };
})();
