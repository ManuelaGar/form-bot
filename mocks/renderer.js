/* Renders a fake Microsoft Form. Mirrors the parts of the real DOM the bot
   depends on: questionItem wrappers, ordinal-prefixed headings, aria-labelled
   scale options, label-wrapped choice options, portaled dropdown options, the
   1px native radios of the NPS, and the next/back/submit automation ids. */

let FORM = null;
let pageIndex = 0;
let ordinal = 0;
const answers = {};

const el = (tag, props = {}, children = []) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  children.forEach(c => node.appendChild(c));
  return node;
};

function heading(title, typeLabel) {
  return el('span', { 'data-automation-id': 'questionTitle' }, [
    el('span', { role: 'heading', 'aria-level': '2' }, [
      el('span', { 'data-automation-id': 'questionOrdinal', text: `${ordinal}.` }),
      el('span', { class: 'text-format-content', text: title })
    ]),
    el('span', { class: 'type-hint', text: typeLabel })
  ]);
}

function textQuestion(q) {
  const input = q.multiline
    ? el('textarea', { 'data-automation-id': 'textInput', placeholder: 'Escriba su respuesta' })
    : el('input', { 'data-automation-id': 'textInput', placeholder: q.placeholder ?? 'Escriba su respuesta' });
  input.value = answers[q.title] ?? '';
  input.addEventListener('input', () => { answers[q.title] = input.value; refreshFooter(); });
  return [heading(q.title, q.multiline ? 'Texto de varias líneas.' : 'Texto de una sola línea.'), input];
}

// Likert options are divs carrying the whole label in aria-label.
function likertQuestion(q) {
  const row = el('div', { class: 'row' });
  for (let n = q.min; n <= q.max; n++) {
    const suffix = q.stars ? ' CheckMark' : n === q.min ? ` ${q.low}` : n === q.max ? ` ${q.high}` : '';
    const checked = answers[q.title] === String(n);
    const option = el('div', { role: 'radio', 'aria-checked': String(checked), 'aria-label': `${n}${suffix}`, class: 'chip', text: String(n) });
    option.addEventListener('click', () => {
      row.querySelectorAll('[role="radio"]').forEach(o => o.setAttribute('aria-checked', 'false'));
      option.setAttribute('aria-checked', 'true');
      answers[q.title] = String(n);
      refreshFooter();
    });
    row.appendChild(option);
  }
  return [heading(q.title, 'Calificación.'), row];
}

// The NPS is the odd one out: native radios 1px wide, hidden under their label.
function npsQuestion(q) {
  const row = el('div', { class: 'row' });
  const name = `nps-${ordinal}`;
  for (let n = 0; n <= 10; n++) {
    const id = `${name}-${n}`;
    const input = el('input', { type: 'radio', role: 'radio', 'aria-label': String(n), id, name, value: String(n), class: 'nps-input' });
    if (answers[q.title] === String(n)) input.checked = true;
    const label = el('label', { for: id, class: 'nps-label', text: String(n) });
    input.addEventListener('change', () => { answers[q.title] = String(n); refreshFooter(); });
    row.appendChild(el('div', { 'data-automation-id': 'npsCell', role: 'presentation' }, [input, label]));
  }
  return [heading(q.title, 'Net Promoter Score.'), row];
}

// Some choice questions are native radios carrying the option text in
// aria-label, hidden under their own label — same shape as the NPS.
function nativeChoiceQuestion(q) {
  const box = el('div', { class: 'col' });
  const name = `choice-${ordinal}`;
  q.options.forEach((text, i) => {
    const id = `${name}-${i}`;
    const input = el('input', { type: 'radio', role: 'radio', 'aria-label': text, id, name, value: text, class: 'nps-input' });
    if (answers[q.title] === text) input.checked = true;
    input.addEventListener('change', () => { answers[q.title] = text; refreshFooter(); });
    box.appendChild(el('div', { class: 'native-choice' }, [input, el('label', { for: id, text })]));
  });
  return [heading(q.title, 'Opción única.'), box];
}

// Choice options carry no aria-label: the text lives in the wrapping label.
function choiceQuestion(q, role) {
  const box = el('div', { class: 'col' });
  const selected = new Set(answers[q.title] ?? []);
  q.options.forEach(text => {
    const option = el('div', { role, 'aria-checked': String(selected.has(text)) });
    const label = el('label', { class: 'choice' }, [option, el('span', { text })]);
    label.addEventListener('click', () => {
      if (role === 'radio') {
        box.querySelectorAll('[role="radio"]').forEach(o => o.setAttribute('aria-checked', 'false'));
        selected.clear();
      }
      const on = option.getAttribute('aria-checked') === 'true';
      option.setAttribute('aria-checked', String(!on));
      if (on) selected.delete(text); else selected.add(text);
      answers[q.title] = [...selected];
      render();
    });
    box.appendChild(label);
  });
  return [heading(q.title, role === 'radio' ? 'Opción única.' : 'Elección múltiple.'), box];
}

// Dropdown options are portaled to <body>, not nested in the question.
function dropdownQuestion(q) {
  const trigger = el('div', { role: 'combobox', 'aria-haspopup': 'listbox', class: 'combo', text: answers[q.title] ?? 'Selecciona la respuesta' });
  trigger.addEventListener('click', () => {
    document.querySelectorAll('.listbox').forEach(n => n.remove());
    const list = el('div', { role: 'listbox', class: 'listbox' });
    q.options.forEach(text => {
      const option = el('div', { role: 'option', class: 'option', text });
      option.addEventListener('click', () => {
        answers[q.title] = text;
        trigger.textContent = text;
        list.remove();
        refreshFooter();
      });
      list.appendChild(option);
    });
    document.body.appendChild(list);
  });
  return [heading(q.title, 'Opción única.'), trigger];
}

const isAnswered = q => {
  const value = answers[q.title];
  return Array.isArray(value) ? value.length > 0 : value !== undefined && value !== '';
};

function visibleQuestions(page) {
  const out = [];
  for (const q of page.questions) {
    out.push(q);
    // A gating question hides everything after it until it is answered.
    if (q.gate && !isAnswered(q)) return out;
    if (q.gate && q.gateStops && answers[q.title]?.includes?.(q.gateStops)) return out;
  }
  return out;
}

function activePages() {
  return FORM.pages.filter(p => p.when === undefined || p.when(answers));
}

function render() {
  const root = document.getElementById('root');
  root.innerHTML = '';
  document.querySelectorAll('.listbox').forEach(n => n.remove());

  if (pageIndex === -1) {
    root.appendChild(el('div', { 'data-automation-id': 'thankYouMessage' }, [
      el('h2', { text: '¡Gracias!' }),
      el('p', { text: 'La respuesta se ha enviado correctamente.' })
    ]));
    return;
  }

  const pages = activePages();
  const page = pages[pageIndex];
  root.appendChild(el('h1', { text: FORM.title }));

  if (page.landing) {
    root.appendChild(el('p', { text: page.landing }));
    const start = el('button', { type: 'button', text: 'Comenzar' });
    start.addEventListener('click', () => { pageIndex++; render(); });
    root.appendChild(start);
    return;
  }

  ordinal = pages.slice(0, pageIndex).filter(p => !p.landing).reduce((n, p) => n + p.questions.length, 0);

  for (const q of visibleQuestions(page)) {
    ordinal++;
    const item = el('div', { 'data-automation-id': 'questionItem', class: 'question' });
    const build = { text: textQuestion, likert: likertQuestion, nps: npsQuestion, dropdown: dropdownQuestion };
    const parts = q.type === 'nativeChoice'
      ? nativeChoiceQuestion(q)
      : q.type === 'choice'
        ? choiceQuestion(q, 'radio')
        : q.type === 'multi'
          ? choiceQuestion(q, 'checkbox')
          : build[q.type](q);
    parts.forEach(p => item.appendChild(p));
    if (q.required) item.appendChild(el('span', { class: 'req', text: '*' }));
    root.appendChild(item);
  }

  root.appendChild(el('div', { id: 'alert' }));
  root.appendChild(footer(pages));
}

function footer(pages) {
  const bar = el('div', { class: 'footer' });
  if (pageIndex > 0) {
    const back = el('button', { type: 'button', 'data-automation-id': 'backButton', text: 'Atrás' });
    back.addEventListener('click', () => { pageIndex--; render(); });
    bar.appendChild(back);
  }

  const isLast = pageIndex === pages.length - 1;
  const button = isLast
    ? el('button', { type: 'button', 'data-automation-id': 'submitButton', text: 'Enviar' })
    : el('button', { type: 'button', 'data-automation-id': 'nextButton', text: 'Siguiente' });

  button.addEventListener('click', () => {
    const pending = [];
    visibleQuestions(pages[pageIndex]).forEach((q, i) => {
      if (q.required && !isAnswered(q)) pending.push(i + 1);
    });
    if (pending.length > 0) {
      const alert = document.getElementById('alert');
      alert.innerHTML = '';
      alert.appendChild(el('div', {
        role: 'alert',
        text: `Es necesario completar ${pending.length} preguntas para poder ir a la siguiente página: ${pending.map(n => `Pregunta ${n}`).join(', ')}.`
      }));
      return;
    }
    window.__submitted = isLast ? JSON.parse(JSON.stringify(answers)) : window.__submitted;
    pageIndex = isLast ? -1 : pageIndex + 1;
    render();
  });

  bar.appendChild(button);
  return bar;
}

// The last button flips between Siguiente and Enviar as branching answers change.
function refreshFooter() {
  const pages = activePages();
  const bar = document.querySelector('.footer');
  if (!bar) return;
  const isLast = pageIndex === pages.length - 1;
  const current = bar.querySelector('[data-automation-id="nextButton"], [data-automation-id="submitButton"]');
  const expected = isLast ? 'submitButton' : 'nextButton';
  if (current?.getAttribute('data-automation-id') !== expected) render();
}

window.mountForm = (definition) => {
  FORM = definition;
  document.title = definition.title;
  render();
};
