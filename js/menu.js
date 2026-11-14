(function () {
  'use strict';

  var STORAGE_KEY = 'moka-coffee:cart:v1';
  var MAX_QTY = 99;
  var ADD_LABEL = 'В корзину';

  /* ==========================================================
     Утилиты
     ========================================================== */
  var numberFormat = null;
  try {
    numberFormat = new Intl.NumberFormat('ru-RU');
  } catch (error) {
    numberFormat = null;
  }

  function formatPrice(value) {
    return (numberFormat ? numberFormat.format(value) : String(value)) + '\u00A0₽';
  }

  function plural(n, one, few, many) {
    var mod10 = n % 10;
    var mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
    return many;
  }

  function createEl(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  /* ==========================================================
     Хранилище корзины (localStorage с защитой от ошибок)
     ========================================================== */
  var CartStorage = (function () {
    var fallback = [];
    var available = true;

    function read() {
      var raw;
      try {
        raw = window.localStorage.getItem(STORAGE_KEY);
      } catch (error) {
        available = false;
        return fallback.slice();
      }
      if (raw === null) return [];
      try {
        var data = JSON.parse(raw);
        return Array.isArray(data) ? data : [];
      } catch (error) {
        return []; /* повреждённые данные игнорируем */
      }
    }

    function write(lines) {
      fallback = lines.map(function (line) {
        return { id: line.id, qty: line.qty };
      });
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback));
        available = true;
      } catch (error) {
        available = false;
      }
    }

    return {
      read: read,
      write: write,
      isAvailable: function () { return available; }
    };
  })();

  /* ==========================================================
     Корзина: состояние и операции (без работы с DOM)
     ========================================================== */
  var Cart = (function () {
    var lines = [];
    var resolveProduct = null;
    var listeners = [];

    function normalize(raw) {
      var result = [];
      raw.forEach(function (entry) {
        if (!entry || typeof entry.id !== 'string' || !resolveProduct(entry.id)) return;
        var qty = Math.floor(Number(entry.qty));
        if (!isFinite(qty) || qty < 1) return;
        qty = Math.min(qty, MAX_QTY);
        for (var i = 0; i < result.length; i += 1) {
          if (result[i].id === entry.id) {
            result[i].qty = Math.min(result[i].qty + qty, MAX_QTY);
            return;
          }
        }
        result.push({ id: entry.id, qty: qty });
      });
      return result;
    }

    function find(id) {
      for (var i = 0; i < lines.length; i += 1) {
        if (lines[i].id === id) return lines[i];
      }
      return null;
    }

    function commit() {
      CartStorage.write(lines);
      listeners.forEach(function (listener) { listener(); });
    }

    function init(productResolver) {
      resolveProduct = productResolver;
      lines = normalize(CartStorage.read());
    }

    function reload() {
      lines = normalize(CartStorage.read());
      listeners.forEach(function (listener) { listener(); });
    }

    function add(id) {
      if (!resolveProduct(id)) return false;
      var line = find(id);
      if (line) {
        if (line.qty >= MAX_QTY) return false;
        line.qty += 1;
      } else {
        lines.push({ id: id, qty: 1 });
      }
      commit();
      return true;
    }

    /* Количество никогда не становится меньше 1: удаление — отдельная операция */
    function change(id, delta) {
      var line = find(id);
      if (!line) return false;
      var next = line.qty + delta;
      if (next < 1 || next > MAX_QTY) return false;
      line.qty = next;
      commit();
      return true;
    }

    function remove(id) {
      var before = lines.length;
      lines = lines.filter(function (line) { return line.id !== id; });
      if (lines.length === before) return false;
      commit();
      return true;
    }

    function clear() {
      if (!lines.length) return;
      lines = [];
      commit();
    }

    function getItems() {
      return lines.map(function (line) {
        var product = resolveProduct(line.id);
        return { product: product, qty: line.qty, sum: product.price * line.qty };
      });
    }

    function getCount() {
      return lines.reduce(function (total, line) { return total + line.qty; }, 0);
    }

    function getTotal() {
      return getItems().reduce(function (total, item) { return total + item.sum; }, 0);
    }

    return {
      init: init,
      reload: reload,
      add: add,
      change: change,
      remove: remove,
      clear: clear,
      getItems: getItems,
      getCount: getCount,
      getTotal: getTotal,
      subscribe: function (listener) { listeners.push(listener); }
    };
  })();

  /* ==========================================================
     Каталог: товары из разметки и фильтрация
     ========================================================== */
  var Catalog = (function () {
    var grid = null;
    var cards = [];
    var filterButtons = [];
    var statusEl = null;
    var products = {};
    var addHandler = null;
    var currentFilter = 'all';
    var timers = {};

    function init() {
      grid = document.getElementById('menu-grid');
      var filters = document.getElementById('menu-filters');
      statusEl = document.getElementById('menu-status');
      if (!grid || !filters) return false;

      cards = Array.prototype.slice.call(grid.querySelectorAll('.drink-card'));
      filterButtons = Array.prototype.slice.call(filters.querySelectorAll('[data-filter]'));

      cards.forEach(function (card) {
        var id = card.dataset.id;
        var price = Number(card.dataset.price);
        if (!id || !isFinite(price) || price < 0) return;
        var image = card.querySelector('img');
        products[id] = {
          id: id,
          name: card.dataset.name || id,
          price: price,
          category: card.dataset.category,
          image: image ? image.getAttribute('src') : ''
        };
      });

      filters.addEventListener('click', function (event) {
        var button = event.target.closest('[data-filter]');
        if (button) applyFilter(button.dataset.filter);
      });

      grid.addEventListener('click', function (event) {
        var button = event.target.closest('[data-action="add"]');
        if (!button || !addHandler) return;
        var card = button.closest('.drink-card');
        if (card) addHandler(card.dataset.id);
      });

      applyFilter('all', true);
      return true;
    }

    function applyFilter(category, silent) {
      if (!silent && category === currentFilter) return;
      currentFilter = category;

      filterButtons.forEach(function (button) {
        button.setAttribute('aria-pressed', String(button.dataset.filter === category));
      });

      var shown = 0;
      cards.forEach(function (card) {
        var match = category === 'all' || card.dataset.category === category;
        card.hidden = !match;
        if (!match) return;
        shown += 1;
        card.classList.add('is-visible');
        if (!silent) {
          card.classList.remove('is-entering');
          void card.offsetWidth; /* перезапуск анимации */
          card.classList.add('is-entering');
          card.addEventListener('animationend', function onEnd() {
            card.classList.remove('is-entering');
            card.removeEventListener('animationend', onEnd);
          });
        }
      });

      if (statusEl) {
        statusEl.textContent = 'Показано ' + shown + ' ' + plural(shown, 'напиток', 'напитка', 'напитков');
      }
    }

    function flashAdded(id) {
      var card = grid.querySelector('.drink-card[data-id="' + id + '"]');
      var button = card && card.querySelector('[data-action="add"]');
      if (!button) return;
      button.classList.add('is-added');
      button.textContent = 'Добавлено';
      clearTimeout(timers[id]);
      timers[id] = setTimeout(function () {
        button.classList.remove('is-added');
        button.textContent = ADD_LABEL;
      }, 1400);
    }

    return {
      init: init,
      getProduct: function (id) { return products[id] || null; },
      onAdd: function (handler) { addHandler = handler; },
      flashAdded: flashAdded
    };
  })();

  /* ==========================================================
     Интерфейс корзины: шапка, боковая панель, оформление
     ========================================================== */
  var CartUI = (function () {
    var IDS = {
      toggle: 'cart-toggle', badge: 'cart-count', drawer: 'cart', overlay: 'cart-overlay',
      close: 'cart-close', list: 'cart-list', empty: 'cart-empty', emptyClose: 'cart-empty-close',
      footer: 'cart-footer', total: 'cart-total', clear: 'cart-clear', checkout: 'cart-checkout',
      notice: 'cart-notice', announcer: 'cart-announcer',
      viewCart: 'cart-view-cart', viewCheckout: 'cart-view-checkout', viewSuccess: 'cart-view-success',
      form: 'checkout-form', name: 'checkout-name', nameError: 'checkout-name-error',
      checkoutCount: 'checkout-count', checkoutTotal: 'checkout-total', checkoutBack: 'checkout-back',
      successTitle: 'success-title', successText: 'success-text', successNumber: 'success-number',
      successList: 'success-list', successTotal: 'success-total', successClose: 'success-close'
    };

    var refs = {};
    var inertTargets = [];
    var lastFocus = null;
    var announceTimer = null;

    function init() {
      var complete = true;
      Object.keys(IDS).forEach(function (key) {
        refs[key] = document.getElementById(IDS[key]);
        if (!refs[key]) complete = false;
      });
      if (!complete) return false;

      inertTargets = Array.prototype.slice.call(document.querySelectorAll('.site-header, main, .site-footer'));
      bind();
      render();
      return true;
    }

    function bind() {
      refs.toggle.addEventListener('click', open);
      refs.close.addEventListener('click', close);
      refs.overlay.addEventListener('click', close);
      refs.emptyClose.addEventListener('click', close);
      refs.successClose.addEventListener('click', close);

      refs.list.addEventListener('click', onListClick);

      refs.clear.addEventListener('click', function () {
        Cart.clear();
        announce('Корзина очищена');
        refs.emptyClose.focus();
      });

      refs.checkout.addEventListener('click', startCheckout);
      refs.checkoutBack.addEventListener('click', function () { showView('cart', refs.checkout); });
      refs.form.addEventListener('submit', onSubmit);
      refs.name.addEventListener('input', clearNameError);

      document.addEventListener('keydown', onKeydown);
    }

    /* ---------- Отрисовка ---------- */
    function render() {
      var items = Cart.getItems();
      var count = Cart.getCount();
      var total = Cart.getTotal();

      refs.badge.textContent = count > 99 ? '99+' : String(count);
      refs.badge.hidden = count === 0;
      refs.toggle.setAttribute(
        'aria-label',
        count ? 'Открыть корзину, товаров: ' + count + ', на сумму ' + formatPrice(total) : 'Открыть корзину, она пуста'
      );

      refs.list.textContent = '';
      items.forEach(function (item) { refs.list.appendChild(buildItem(item)); });

      refs.list.hidden = items.length === 0;
      refs.empty.hidden = items.length > 0;
      refs.footer.hidden = items.length === 0;
      refs.total.textContent = formatPrice(total);
      refs.notice.hidden = CartStorage.isAvailable();

      /* Если корзину опустошили в другой вкладке во время оформления */
      if (!items.length && !refs.viewCheckout.hidden) showView('cart');
    }

    function buildItem(item) {
      var product = item.product;
      var li = createEl('li', 'cart-item');
      li.dataset.id = product.id;

      var img = createEl('img', 'cart-item__img');
      img.src = product.image;
      img.alt = '';
      img.width = 72;
      img.height = 72;

      var info = createEl('div', 'cart-item__info');
      info.appendChild(createEl('p', 'cart-item__name', product.name));
      info.appendChild(createEl('p', 'cart-item__price', formatPrice(product.price) + ' за шт.'));

      var controls = createEl('div', 'cart-item__controls');
      var dec = createEl('button', 'qty-btn', '−');
      dec.type = 'button';
      dec.dataset.action = 'dec';
      dec.dataset.id = product.id;
      dec.disabled = item.qty <= 1;
      dec.setAttribute('aria-label', 'Уменьшить количество: ' + product.name);

      var qty = createEl('span', 'cart-item__qty');
      qty.appendChild(createEl('span', 'visually-hidden', 'Количество: '));
      qty.appendChild(document.createTextNode(String(item.qty)));

      var inc = createEl('button', 'qty-btn', '+');
      inc.type = 'button';
      inc.dataset.action = 'inc';
      inc.dataset.id = product.id;
      inc.disabled = item.qty >= MAX_QTY;
      inc.setAttribute('aria-label', 'Увеличить количество: ' + product.name);

      controls.appendChild(dec);
      controls.appendChild(qty);
      controls.appendChild(inc);
      info.appendChild(controls);

      var side = createEl('div', 'cart-item__side');
      side.appendChild(createEl('p', 'cart-item__sum', formatPrice(item.sum)));
      var remove = createEl('button', 'cart-item__remove', 'Удалить');
      remove.type = 'button';
      remove.dataset.action = 'remove';
      remove.dataset.id = product.id;
      remove.setAttribute('aria-label', 'Удалить из корзины: ' + product.name);
      side.appendChild(remove);

      li.appendChild(img);
      li.appendChild(info);
      li.appendChild(side);
      return li;
    }

    /* ---------- Действия над позициями (делегирование) ---------- */
    function onListClick(event) {
      var button = event.target.closest('button[data-action]');
      if (!button || !refs.list.contains(button)) return;

      var id = button.dataset.id;
      var action = button.dataset.action;
      var product = Catalog.getProduct(id);

      if (action === 'inc') {
        Cart.change(id, 1);
      } else if (action === 'dec') {
        Cart.change(id, -1);
      } else if (action === 'remove') {
        Cart.remove(id);
        if (product) announce(product.name + ' удалён из корзины');
      }
      restoreFocus(action, id);
    }

    /* После перерисовки списка возвращаем фокус на соответствующую кнопку */
    function restoreFocus(action, id) {
      var target = null;
      if (action !== 'remove') {
        target = refs.list.querySelector('button[data-action="' + action + '"][data-id="' + id + '"]:not(:disabled)') ||
                 refs.list.querySelector('button[data-id="' + id + '"]:not(:disabled)');
      }
      if (!target) {
        target = refs.list.querySelector('button:not(:disabled)') || (refs.empty.hidden ? refs.close : refs.emptyClose);
      }
      target.focus();
    }

    /* ---------- Открытие и закрытие панели ---------- */
    function isOpen() {
      return document.body.classList.contains('cart-open');
    }

    function setBackgroundInert(state) {
      inertTargets.forEach(function (node) {
        if ('inert' in node) {
          node.inert = state;
        } else if (state) {
          node.setAttribute('aria-hidden', 'true');
        } else {
          node.removeAttribute('aria-hidden');
        }
      });
    }

    function open() {
      if (isOpen()) return;
      lastFocus = document.activeElement;
      showView('cart');
      document.body.classList.add('cart-open');
      refs.toggle.setAttribute('aria-expanded', 'true');
      setBackgroundInert(true);
      window.requestAnimationFrame(function () { refs.close.focus(); });
    }

    function close() {
      if (!isOpen()) return;
      document.body.classList.remove('cart-open');
      refs.toggle.setAttribute('aria-expanded', 'false');
      setBackgroundInert(false);
      var target = lastFocus && document.contains(lastFocus) ? lastFocus : refs.toggle;
      target.focus();
    }

    function getFocusable() {
      var nodes = refs.drawer.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])');
      return Array.prototype.filter.call(nodes, function (node) { return !node.closest('[hidden]'); });
    }

    function onKeydown(event) {
      if (!isOpen()) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }

      if (event.key !== 'Tab') return;

      var focusable = getFocusable();
      if (!focusable.length) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      var active = document.activeElement;

      if (!refs.drawer.contains(active)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    /* ---------- Экраны панели: корзина → оформление → подтверждение ---------- */
    function showView(name, focusTarget) {
      refs.viewCart.hidden = name !== 'cart';
      refs.viewCheckout.hidden = name !== 'checkout';
      refs.viewSuccess.hidden = name !== 'success';
      if (focusTarget) focusTarget.focus();
    }

    function startCheckout() {
      var count = Cart.getCount();
      if (!count) return;
      refs.checkoutCount.textContent = count + ' ' + plural(count, 'товар', 'товара', 'товаров');
      refs.checkoutTotal.textContent = formatPrice(Cart.getTotal());
      clearNameError();
      showView('checkout', refs.name);
    }

    function clearNameError() {
      refs.nameError.textContent = '';
      refs.name.removeAttribute('aria-invalid');
    }

    function onSubmit(event) {
      event.preventDefault();

      var name = refs.name.value.trim();
      if (!name) {
        refs.nameError.textContent = 'Введите имя, чтобы мы могли подписать заказ.';
        refs.name.setAttribute('aria-invalid', 'true');
        refs.name.focus();
        return;
      }

      var items = Cart.getItems();
      if (!items.length) {
        showView('cart', refs.close);
        return;
      }

      var total = Cart.getTotal();
      var orderNumber = 'MC-' + String(Math.floor(1000 + Math.random() * 9000));

      refs.successText.textContent = 'Спасибо, ' + name + '! Мы приняли ваш демонстрационный заказ.';
      refs.successNumber.textContent = orderNumber;
      refs.successTotal.textContent = formatPrice(total);
      refs.successList.textContent = '';
      items.forEach(function (item) {
        refs.successList.appendChild(
          createEl('li', '', item.product.name + ' × ' + item.qty + ' — ' + formatPrice(item.sum))
        );
      });

      Cart.clear();
      refs.form.reset();
      clearNameError();
      showView('success', refs.successTitle);
      announce('Заказ ' + orderNumber + ' оформлен');
    }

    /* ---------- Вспомогательное ---------- */
    function announce(message) {
      clearTimeout(announceTimer);
      refs.announcer.textContent = '';
      announceTimer = setTimeout(function () { refs.announcer.textContent = message; }, 60);
    }

    function bump() {
      refs.badge.classList.remove('is-bump');
      void refs.badge.offsetWidth;
      refs.badge.classList.add('is-bump');
      refs.badge.addEventListener('animationend', function onEnd() {
        refs.badge.classList.remove('is-bump');
        refs.badge.removeEventListener('animationend', onEnd);
      });
    }

    return { init: init, render: render, announce: announce, bump: bump };
  })();

  /* ==========================================================
     Запуск: связываем каталог, корзину и интерфейс
     ========================================================== */
  function start() {
    if (!Catalog.init()) return;

    Cart.init(Catalog.getProduct);
    if (!CartUI.init()) return;

    Cart.subscribe(CartUI.render);

    Catalog.onAdd(function (id) {
      var product = Catalog.getProduct(id);
      if (!product) return;

      if (Cart.add(id)) {
        Catalog.flashAdded(id);
        CartUI.bump();
        CartUI.announce(product.name + ' добавлен в корзину');
      } else {
        CartUI.announce('Максимальное количество для «' + product.name + '» — ' + MAX_QTY);
      }
    });

    /* Синхронизация корзины между вкладками */
    window.addEventListener('storage', function (event) {
      if (event.key === STORAGE_KEY || event.key === null) Cart.reload();
    });
  }

  start();
})();
