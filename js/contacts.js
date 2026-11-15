(function () {
  'use strict';

  /* ==========================================================
     Часы работы: выделяем сегодняшний день
     ========================================================== */
  var today = String(new Date().getDay());
  Array.prototype.forEach.call(document.querySelectorAll('.hours__row[data-days]'), function (row) {
    if (row.dataset.days.split(',').indexOf(today) !== -1) row.classList.add('is-today');
  });

  /* ==========================================================
     Форма обратной связи (демонстрация, без отправки на сервер)
     ========================================================== */
  var form = document.getElementById('contact-form');
  var summary = document.getElementById('form-summary');
  var success = document.getElementById('form-success');
  var successTitle = document.getElementById('form-success-title');
  var successText = document.getElementById('form-success-text');
  var againButton = document.getElementById('form-again');

  if (!form || !summary || !success || !successTitle || !successText || !againButton) return;

  var EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var MESSAGE_MIN = 10;
  var MESSAGE_MAX = 1000;

  var validators = {
    name: function (value) {
      if (!value) return 'Введите ваше имя.';
      if (value.length < 2) return 'Имя должно содержать не менее 2 символов.';
      return '';
    },
    email: function (value) {
      if (!value) return 'Введите адрес электронной почты.';
      if (!EMAIL_PATTERN.test(value)) return 'Проверьте адрес: он должен выглядеть как name@example.com.';
      return '';
    },
    topic: function (value) {
      return value ? '' : 'Выберите тему сообщения.';
    },
    message: function (value) {
      if (!value) return 'Напишите сообщение.';
      if (value.length < MESSAGE_MIN) {
        return 'Сообщение слишком короткое: нужно не менее ' + MESSAGE_MIN + ' символов (сейчас ' + value.length + ').';
      }
      if (value.length > MESSAGE_MAX) return 'Сообщение не должно превышать ' + MESSAGE_MAX + ' символов.';
      return '';
    },
    consent: function (checked) {
      return checked ? '' : 'Подтвердите согласие, чтобы отправить форму.';
    }
  };

  var controls = Array.prototype.slice.call(form.querySelectorAll('[name]')).filter(function (control) {
    return Object.prototype.hasOwnProperty.call(validators, control.name);
  });

  function getValue(control) {
    return control.type === 'checkbox' ? control.checked : control.value.trim();
  }

  function setError(control, message) {
    var errorEl = document.getElementById(control.id + '-error');
    if (errorEl) errorEl.textContent = message;
    if (message) {
      control.setAttribute('aria-invalid', 'true');
    } else {
      control.removeAttribute('aria-invalid');
    }
  }

  function validateControl(control) {
    var message = validators[control.name](getValue(control));
    setError(control, message);
    return message === '';
  }

  /* Проверка при уходе с поля; исправление ошибки убирает её сразу */
  form.addEventListener('focusout', function (event) {
    if (controls.indexOf(event.target) !== -1) validateControl(event.target);
  });

  function onChange(event) {
    var control = event.target;
    if (controls.indexOf(control) !== -1 && control.getAttribute('aria-invalid') === 'true') {
      validateControl(control);
    }
  }
  form.addEventListener('input', onChange);
  form.addEventListener('change', onChange);

  form.addEventListener('submit', function (event) {
    event.preventDefault();

    var invalid = controls.filter(function (control) { return !validateControl(control); });

    if (invalid.length) {
      summary.textContent = 'Исправьте поля с ошибками (' + invalid.length + ') и отправьте форму ещё раз.';
      invalid[0].focus();
      return;
    }

    summary.textContent = '';

    /* Данные никуда не отправляются: только подтверждение на странице */
    var name = form.elements.name.value.trim();
    successText.textContent = 'Спасибо, ' + name + '! Мы получили ваше сообщение (демонстрационно).';

    form.reset();
    form.hidden = true;
    success.hidden = false;
    successTitle.focus();
  });

  againButton.addEventListener('click', function () {
    success.hidden = true;
    form.hidden = false;
    form.elements.name.focus();
  });
})();
