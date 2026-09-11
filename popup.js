document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('enableToggle');
  const statusEl = document.getElementById('status');
  const speedButtons = document.querySelectorAll('.speed-btn');
  const speedSlider = document.getElementById('speedSlider');
  const speedValue = document.getElementById('speedValue');
  const muteToggle = document.getElementById('muteToggle');

  function updateUI(enabled) {
    toggle.checked = enabled;
    statusEl.textContent = enabled ? '插件运行中' : '插件已禁用';
    statusEl.className = 'status ' + (enabled ? 'active' : 'inactive');
  }

  function updateSpeedUI(speed) {
    speedValue.textContent = speed.toFixed(1) + 'x';
    speedSlider.value = speed;
    speedButtons.forEach(btn => {
      btn.classList.toggle('active', parseFloat(btn.dataset.speed) === speed);
    });
  }

  function updateMuteUI(muted) {
    muteToggle.checked = muted;
  }

  function sendSpeedToContent(speed) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'SET_SPEED', speed }, (response) => {
          if (response?.success) {
            updateSpeedUI(response.speed);
          }
        });
      }
    });
  }

  function sendMuteToContent(muted) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'SET_MUTE', muted }, (response) => {
          if (response?.success) {
            updateMuteUI(response.muted);
          }
        });
      }
    });
  }

  function getMuteFromContent() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_MUTE' }, (response) => {
          if (response?.muted !== undefined) {
            updateMuteUI(response.muted);
          }
        });
      }
    });
  }

  chrome.storage.sync.get(['enabled'], (result) => {
    const enabled = result.enabled !== false;
    updateUI(enabled);
  });

  toggle.addEventListener('change', () => {
    const enabled = toggle.checked;
    chrome.storage.sync.set({ enabled }, () => {
      updateUI(enabled);
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, { type: 'TOGGLE_ENABLED', enabled });
        }
      });
    });
  });

  speedButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const speed = parseFloat(btn.dataset.speed);
      sendSpeedToContent(speed);
    });
  });

  speedSlider.addEventListener('input', (e) => {
    const speed = parseFloat(e.target.value);
    speedValue.textContent = speed.toFixed(1) + 'x';
  });

  speedSlider.addEventListener('change', (e) => {
    const speed = parseFloat(e.target.value);
    sendSpeedToContent(speed);
  });

  muteToggle.addEventListener('change', () => {
    const muted = muteToggle.checked;
    sendMuteToContent(muted);
  });

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_SPEED' }, (response) => {
        if (response?.speed) {
          updateSpeedUI(response.speed);
        }
      });
      chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_MUTE' }, (response) => {
        if (response?.muted !== undefined) {
          updateMuteUI(response.muted);
        }
      });
    }
  });
});