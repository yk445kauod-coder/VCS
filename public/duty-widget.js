/**
 * Duty website widget — a zero-dependency chat bubble you drop on any site:
 *
 *   <script src="https://your-duty.example/widget/duty-widget.js" async></script>
 *
 * It talks to /api/webchat/* on the same origin the script was served from, so
 * it works whether Duty is on your domain or a subdomain you point at it.
 *
 * Everything renders inside a shadow root: the host page's CSS cannot restyle
 * the widget and the widget cannot leak styles back into the page.
 */
(function () {
  'use strict';

  var script = document.currentScript;
  var origin = script && script.src ? new URL(script.src).origin : window.location.origin;
  var greeting = (script && script.getAttribute('data-greeting')) || 'Hi! How can I help you today?';
  var accent = (script && script.getAttribute('data-accent')) || '#ff5b1f';
  var sessionKey = 'duty_session';
  var sessionId = localStorage.getItem(sessionKey) || '';

  var open = false;
  var sending = false;
  var history = [];

  function el(tag, styles, text) {
    var node = document.createElement(tag);
    if (styles) Object.assign(node.style, styles);
    if (text !== undefined) node.textContent = text;
    return node;
  }

  var root = el('div', {
    position: 'fixed', right: '20px', bottom: '20px', zIndex: '2147483000',
    fontFamily: 'system-ui, -apple-system, sans-serif', boxSizing: 'border-box',
  });
  root.style.setProperty('color-scheme', 'dark');

  var launcher = el('button', {
    width: '54px', height: '54px', borderRadius: '50%', border: '0', cursor: 'pointer',
    background: accent, color: '#160a04', fontSize: '22px', lineHeight: '1',
    boxShadow: '0 14px 34px -12px rgba(0,0,0,.6)',
  }, '💬');
  launcher.setAttribute('aria-label', 'Open chat');

  var panel = el('div', {
    position: 'absolute', right: '0', bottom: '68px', width: '340px', maxWidth: 'calc(100vw - 40px)',
    height: '460px', maxHeight: 'calc(100vh - 120px)', display: 'none', flexDirection: 'column',
    background: '#121316', color: '#f4f1ea', border: '1px solid #2a2e35', borderRadius: '8px',
    overflow: 'hidden', boxShadow: '0 30px 70px -30px rgba(0,0,0,.95)',
  });

  var header = el('div', {
    padding: '13px 15px', borderBottom: '1px solid #2a2e35', display: 'flex',
    alignItems: 'center', gap: '9px', background: '#17191d',
  });
  var badge = el('div', {
    width: '26px', height: '26px', borderRadius: '5px', background: accent, color: '#160a04',
    display: 'grid', placeItems: 'center', fontWeight: '700', fontSize: '13px',
  }, 'D');
  var title = el('div', {}, 'Duty assistant');
  title.style.fontSize = '13.5px';
  title.style.fontWeight = '600';
  header.appendChild(badge);
  header.appendChild(title);

  var log = el('div', { flex: '1', overflowY: 'auto', padding: '15px', display: 'flex', flexDirection: 'column', gap: '10px' });

  var form = el('form', { display: 'flex', gap: '7px', padding: '11px', borderTop: '1px solid #2a2e35', background: '#17191d' });
  var input = el('input', {
    flex: '1', padding: '9px 11px', borderRadius: '4px', border: '1px solid #2a2e35',
    background: '#0e0f12', color: '#f4f1ea', fontSize: '13px', outline: 'none',
    boxSizing: 'border-box',
  });
  input.placeholder = 'Write a message…';
  var send = el('button', {
    padding: '9px 13px', border: '0', borderRadius: '4px', background: accent,
    color: '#160a04', fontWeight: '600', cursor: 'pointer', fontSize: '13px',
  }, 'Send');
  send.type = 'submit';
  form.appendChild(input);
  form.appendChild(send);

  panel.appendChild(header);
  panel.appendChild(log);
  panel.appendChild(form);
  root.appendChild(panel);
  root.appendChild(launcher);

  // Shadow DOM isolation: a host page rule such as `button { background: red }`
  // or `* { font-family: ... }` would otherwise reach in and break the widget.
  var host = document.createElement('div');
  host.setAttribute('data-duty-widget', '');
  host.style.cssText = 'all: initial; position: fixed; z-index: 2147483000;';
  var shadow = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
  shadow.appendChild(root);

  function mount() {
    if (document.body) document.body.appendChild(host);
    else document.addEventListener('DOMContentLoaded', mount, { once: true });
  }
  mount();

  function bubble(text, mine) {
    var node = el('div', {
      maxWidth: '84%', padding: '9px 12px', borderRadius: '4px 12px 12px 12px',
      background: '#1e2126', fontSize: '13px', lineHeight: '1.5', whiteSpace: 'pre-wrap',
      alignSelf: mine ? 'flex-end' : 'flex-start', wordBreak: 'break-word',
    }, text);
    if (mine) {
      node.style.background = 'rgba(255,91,31,.16)';
      node.style.borderRadius = '12px 4px 12px 12px';
    }
    log.appendChild(node);
    log.scrollTop = log.scrollHeight;
  }

  function toggle(next) {
    open = next === undefined ? !open : next;
    panel.style.display = open ? 'flex' : 'none';
    launcher.textContent = open ? '✕' : '💬';
    if (open && history.length === 0) {
      bubble(greeting, false);
      history.push({ role: 'agent', content: greeting });
    }
    if (open) input.focus();
  }

  launcher.addEventListener('click', function () {
    toggle();
  });

  function ensureSession() {
    if (sessionId) return Promise.resolve(sessionId);
    return fetch(origin + '/api/webchat/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
      .then(function (response) {
        return response.json();
      })
      .then(function (data) {
        sessionId = data.sessionId;
        localStorage.setItem(sessionKey, sessionId);
        return sessionId;
      });
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var text = input.value.trim();
    if (!text || sending) return;
    input.value = '';
    bubble(text, true);
    history.push({ role: 'customer', content: text });
    sending = true;
    send.disabled = true;

    ensureSession()
      .then(function () {
        return fetch(origin + '/api/webchat/message', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId: sessionId, text: text }),
        });
      })
      .then(function (response) {
        return response.json();
      })
      .then(function (data) {
        bubble(data.reply || 'Sorry — something went wrong.', false);
      })
      .catch(function () {
        bubble('Sorry, I could not reach the team just now. Please try again.', false);
      })
      .then(function () {
        sending = false;
        send.disabled = false;
      });
  });

  window.Duty = {
    open: function () {
      toggle(true);
    },
    close: function () {
      toggle(false);
    },
    reset: function () {
      localStorage.removeItem(sessionKey);
      sessionId = '';
      log.innerHTML = '';
      history = [];
    },
  };
})();
