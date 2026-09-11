chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({ enabled: true });
  console.log('Course Playback Helper installed');
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TOGGLE_ENABLED') {
    chrome.storage.sync.set({ enabled: message.enabled });
    sendResponse({ success: true });
  }
  return true;
});