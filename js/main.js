(function () {
  'use strict';

  document.documentElement.classList.add('js');

  var MOBILE_QUERY = '(max-width: 860px)';

  var header = document.getElementById('site-header');
  var toggle = document.getElementById('nav-toggle');
  var nav = document.getElementById('site-nav');

  /* ---------- Мобильная навигация ---------- */
  function isOpen() {
    return toggle.getAttribute('aria-expanded') === 'true';
  }

  function setNav(open, options) {
    var returnFocus = options && options.returnFocus;

    nav.classList.toggle('is-open', open);
    document.body.classList.toggle('nav-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Закрыть меню навигации' : 'Открыть меню навигации');

    if (open) {
      var firstLink = nav.querySelector('a[href]');
      if (firstLink) window.requestAnimationFrame(function () { firstLink.focus(); });
    } else if (returnFocus) {
      toggle.focus();
    }
  }

  function getFocusable() {
    return [toggle].concat(Array.prototype.slice.call(nav.querySelectorAll('a[href]')));
  }

  if (toggle && nav) {
    var mobile = window.matchMedia(MOBILE_QUERY);

    toggle.addEventListener('click', function () {
      setNav(!isOpen(), { returnFocus: true });
    });

    /* Закрытие при переходе по ссылке */
    nav.addEventListener('click', function (event) {
      if (event.target.closest('a')) setNav(false);
    });

    document.addEventListener('keydown', function (event) {
      if (!isOpen()) return;

      /* Закрытие по Escape с возвратом фокуса на кнопку */
      if (event.key === 'Escape') {
        setNav(false, { returnFocus: true });
        return;
      }

      /* Фокус не уходит за пределы открытого меню */
      if (event.key === 'Tab') {
        var items = getFocusable();
        var first = items[0];
        var last = items[items.length - 1];

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    });

    /* Закрытие при изменении размера окна (переход на десктопную ширину) */
    function onBreakpointChange(event) {
      if (!event.matches && isOpen()) setNav(false);
    }
    if (mobile.addEventListener) {
      mobile.addEventListener('change', onBreakpointChange);
    } else {
      mobile.addListener(onBreakpointChange);
    }

    /* Возврат по кнопке «Назад» не должен оставлять меню открытым */
    window.addEventListener('pageshow', function () {
      if (isOpen()) setNav(false);
    });
  }

  /* ---------- Состояние шапки при прокрутке ---------- */
  function updateHeader() {
    if (header) header.classList.toggle('is-scrolled', window.scrollY > 8);
  }
  updateHeader();
  window.addEventListener('scroll', updateHeader, { passive: true });

  /* ---------- Плавное появление элементов ---------- */
  var items = document.querySelectorAll('[data-reveal]');
  if (!items.length) return;

  if (!('IntersectionObserver' in window)) {
    items.forEach(function (el) { el.classList.add('is-visible'); });
    return;
  }

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

  items.forEach(function (el) { observer.observe(el); });
})();
