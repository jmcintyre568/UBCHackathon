const toast = document.getElementById('toast');
let toastTimer;
function notify(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

const modal = document.getElementById('projectModal');
const generateButton = document.getElementById('generateScope');
let scopeGenerated = false;
function openModal() {
  scopeGenerated = false;
  document.getElementById('projectDescription').value = '';
  document.getElementById('generatedScope').classList.add('hidden');
  generateButton.innerHTML = 'Generate milestones <span>→</span>';
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.getElementById('projectDescription').focus();
}
function closeModal() {
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}
document.getElementById('newProject').addEventListener('click', openModal);
document.querySelector('.close-modal').addEventListener('click', closeModal);
modal.addEventListener('click', event => { if (event.target === modal) closeModal(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeModal(); });

generateButton.addEventListener('click', () => {
  if (scopeGenerated) {
    closeModal();
    notify('Project draft saved in this demo. Connect Phantom and deploy the escrow program to fund it.');
    return;
  }
  const description = document.getElementById('projectDescription').value.trim();
  if (description.length < 15) {
    notify('Add a little more detail so we can shape useful milestones.');
    document.getElementById('projectDescription').focus();
    return;
  }
  const scope = document.getElementById('generatedScope');
  scope.innerHTML = `<h4>Suggested milestones <span class="verified-inline">· review before funding</span></h4>
    <div class="milestone"><span>01 &nbsp; Agree on scope and first concept</span><small>30% · due in 3 days</small></div>
    <div class="milestone"><span>02 &nbsp; Deliver the main work</span><small>40% · due in 1 week</small></div>
    <div class="milestone"><span>03 &nbsp; Revisions and final handoff</span><small>30% · due in 2 weeks</small></div>
    <p>Demo suggestion based on your brief. AI parsing and contract creation will connect here.</p>`;
  scope.classList.remove('hidden');
  scopeGenerated = true;
  generateButton.innerHTML = 'Continue to contract <span>→</span>';
});

document.querySelectorAll('[data-contract]').forEach(button => button.addEventListener('click', () => {
  const project = button.dataset.contract === 'brand' ? 'Brand identity refresh' : 'Landing page development';
  notify(`${project}: contract details will open here.`);
}));
const walletButton = document.getElementById('connectWallet');
const walletLabel = document.getElementById('walletLabel');
let connectedWallet = null;
function shortAddress(address) { return `${address.slice(0, 4)}…${address.slice(-4)}`; }
walletButton.addEventListener('click', async () => {
  const provider = window.solana;
  if (!provider?.isPhantom) {
    notify('Install Phantom to connect a Solana wallet.');
    window.open('https://phantom.app/download', '_blank', 'noopener,noreferrer');
    return;
  }
  if (connectedWallet) {
    try { await provider.disconnect(); } catch { /* the wallet may already be disconnected */ }
    connectedWallet = null;
    walletLabel.textContent = 'Connect Phantom';
    walletButton.classList.remove('connected');
    walletButton.querySelector('.connect-arrow').textContent = '↗';
    notify('Wallet disconnected.');
    return;
  }
  try {
    const response = await provider.connect();
    connectedWallet = response.publicKey.toString();
    walletLabel.textContent = shortAddress(connectedWallet);
    walletButton.classList.add('connected');
    walletButton.querySelector('.connect-arrow').textContent = '×';
    notify(`Connected ${shortAddress(connectedWallet)}. Switch Phantom to Devnet before transactions.`);
  } catch (error) {
    if (error?.code !== 4001) notify('Could not connect to Phantom. Try again.');
  }
});
window.addEventListener('load', () => {
  if (window.solana?.isPhantom && window.solana.isConnected && window.solana.publicKey) {
    connectedWallet = window.solana.publicKey.toString();
    walletLabel.textContent = shortAddress(connectedWallet);
    walletButton.classList.add('connected');
    walletButton.querySelector('.connect-arrow').textContent = '×';
  }
});
window.addEventListener('DOMContentLoaded', () => {
  if (window.solana?.on) {
    window.solana.on('accountChanged', publicKey => {
      connectedWallet = publicKey?.toString() ?? null;
      walletLabel.textContent = connectedWallet ? shortAddress(connectedWallet) : 'Connect Phantom';
      walletButton.classList.toggle('connected', Boolean(connectedWallet));
      walletButton.querySelector('.connect-arrow').textContent = connectedWallet ? '×' : '↗';
    });
    window.solana.on('disconnect', () => {
      connectedWallet = null;
      walletLabel.textContent = 'Connect Phantom';
      walletButton.classList.remove('connected');
      walletButton.querySelector('.connect-arrow').textContent = '↗';
    });
  }
});
document.getElementById('shareProfile').addEventListener('click', () => notify('Verified profile link copied (demo).'));
document.getElementById('viewCredentials').addEventListener('click', () => notify('Your 8 demo credentials are ready to connect.'));
document.querySelectorAll('.arrow-button').forEach(button => button.addEventListener('click', () => notify('Project details will open here.')));
