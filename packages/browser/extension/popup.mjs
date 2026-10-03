const form = document.querySelector('#pair-form');
const consent = document.querySelector('#consent');
const error = document.querySelector('#error');
const share = document.querySelector('#share');
const returned = document.querySelector('#return');

async function invoke(message) {
  error.textContent = '';
  for (const button of document.querySelectorAll('button')) button.disabled = true;
  try {
    const result = await chrome.runtime.sendMessage(message);
    if (result?.ok !== true) throw new Error(result?.error ?? 'Connection unavailable');
    return result.value;
  } finally {
    for (const button of document.querySelectorAll('button')) button.disabled = false;
  }
}

async function render() {
  const status = await invoke({ action: 'status' });
  form.hidden = status !== null;
  consent.hidden = status === null;
  if (status === null) return;
  document.querySelector('#recipient').textContent = `PersonaBot: ${status.displayName}`;
  document.querySelector('#page').textContent = status.shared
    ? `Read-only sharing: ${status.url}`
    : `Current page: ${status.title}\n${status.url}`;
  share.hidden = status.shared;
  returned.textContent = status.shared ? 'Return tab' : 'Cancel pairing';
}

const fail = (cause) => {
  error.textContent = cause.message ?? 'Browser connection failed';
};
form.addEventListener('submit', (event) => {
  event.preventDefault();
  void invoke({
    action: 'pair',
    host: document.querySelector('#host').value.trim(),
    code: document.querySelector('#code').value.trim(),
  })
    .then(async () => {
      document.querySelector('#code').value = '';
      await render();
    })
    .catch(fail);
});
share.addEventListener('click', () => {
  void invoke({ action: 'share' }).then(render).catch(fail);
});
returned.addEventListener('click', () => {
  void invoke({ action: 'return' }).then(render).catch(fail);
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && changes.borrowedTab) void render().catch(fail);
});
void render().catch(fail);
