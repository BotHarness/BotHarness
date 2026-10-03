const send = async (message) => {
  const reply = await chrome.runtime.sendMessage(message);
  if (!reply.ok) throw new Error(reply.error);
  return reply.value;
};
const status = document.querySelector('#status');
async function refresh() {
  const state = await send({ action: 'status' });
  document.querySelector('#pair').hidden = state.paired;
  document.querySelector('#connected').hidden = !state.paired;
}
async function invoke(message) {
  status.textContent = '';
  status.className = '';
  try {
    await send(message);
    await refresh();
    status.textContent = 'Done';
  } catch (error) {
    status.textContent = error.message;
    status.className = 'error';
  }
}
document.querySelector('#pair').addEventListener('submit', (event) => {
  event.preventDefault();
  void invoke({
    action: 'pair',
    host: document.querySelector('#host').value,
    code: document.querySelector('#code').value.trim(),
    consent: document.querySelector('#consent').checked,
  });
});
for (const action of ['reconnect', 'forget'])
  document.querySelector(`#${action}`).addEventListener('click', () => {
    void invoke({ action });
  });
void refresh();
