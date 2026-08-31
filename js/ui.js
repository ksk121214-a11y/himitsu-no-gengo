/* 画面づくりで繰り返し使う小さなヘルパー群 */
const UI = (() => {
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === false) return;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'html') node.innerHTML = value;
      else if (key.startsWith('on') && typeof value === 'function') {
        node.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (value === true) {
        node.setAttribute(key, '');
      } else {
        node.setAttribute(key, value);
      }
    });
    (Array.isArray(children) ? children : [children]).forEach(child => {
      if (child === null || child === undefined || child === false) return;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }

  const overlay = document.getElementById('modal-overlay');
  const modalContent = document.getElementById('modal-content');

  let closeTimer = null;

  function openModal(contentNode) {
    clearTimeout(closeTimer);
    modalContent.innerHTML = '';
    modalContent.appendChild(contentNode);
    overlay.hidden = false;
    requestAnimationFrame(() => overlay.classList.add('open'));
  }

  function closeModal() {
    overlay.classList.remove('open');
    closeTimer = setTimeout(() => {
      overlay.hidden = true;
      modalContent.innerHTML = '';
    }, 150);
  }

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  let toastTimer = null;
  function toast(message) {
    let node = document.getElementById('toast');
    if (!node) {
      node = el('div', { id: 'toast', class: 'toast' });
      document.body.appendChild(node);
    }
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('show'), 2000);
  }

  return { el, openModal, closeModal, toast };
})();
