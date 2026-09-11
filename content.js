(() => {
  const CONFIRM_BUTTON_TEXTS = [
    '确认', '确定', '继续', '继续播放', '我知道了', '知道了', '删除', '确认删除', '确定删除'
  ];

  const NEXT_EPISODE_TEXTS = [
    '下一集', '下一节', '下一课', '下一章', '继续学习', '下一个'
  ];

  const DIALOG_SELECTORS = [
    '.el-message-box',
    '.ant-modal',
    '.layui-layer',
    '[role="dialog"]',
    '.modal',
    '.dialog',
    '.prism-player',
    '.prism-dialog',
    '.video-confirm-dialog'
  ];

  const CONFIRM_FUNCTION_NAMES = [
    'SubmitAnswers_5',
    'SubmitAnswers',
    'confirmDialog',
    'closeDialog'
  ];

  const COOLDOWN_MS = 5000;
  const VIDEO_END_THRESHOLD = 1.5;
  const PROGRESS_CHECK_INTERVAL = 3000;
  const DEFAULT_SPEED = 2.0;
  const NAVIGATION_COOLDOWN_MS = 8000;

  let enabled = true;
  let lastConfirmClick = 0;
  let lastNextClick = 0;
  let lastProgressClick = 0;
  let lastClickedCoursewareId = null;
  let observedVideos = new WeakSet();
  let observer = null;
  let confirmedDialogs = new WeakSet();
  let videoSpeed = DEFAULT_SPEED;
  let videoMuted = false;
  let pageLoadTime = Date.now();
  let locallyCompletedVideos = new Set();

  function log(...args) {
    if (enabled) {
      console.log('[CoursePlaybackHelper]', ...args);
    }
  }

  function isElementVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function getTextContent(el) {
    return (el.textContent || el.innerText || '').trim();
  }

  function matchesText(text, keywords) {
    const lower = text.toLowerCase();
    return keywords.some(k => lower.includes(k.toLowerCase()));
  }

  function clickButton(btn) {
    if (!btn || !isElementVisible(btn)) return false;
    try {
      btn.click();
      return true;
    } catch (e) {
      log('Click failed:', e);
      return false;
    }
  }

  function tryCallConfirmFunction() {
    for (const fnName of CONFIRM_FUNCTION_NAMES) {
      if (typeof window[fnName] === 'function') {
        const now = Date.now();
        if (now - lastConfirmClick < COOLDOWN_MS) {
          log('Confirm function call cooldown active');
          return false;
        }
        try {
          window[fnName]();
          lastConfirmClick = now;
          log('Called confirm function:', fnName);
          return true;
        } catch (e) {
          log('Confirm function call failed:', fnName, e);
        }
      }
    }
    return false;
  }

  function findAndClickConfirmButton(dialog) {
    if (tryCallConfirmFunction()) {
      return true;
    }

    const dialogText = getTextContent(dialog).toLowerCase();
    const isDeleteDialog = /删除|delete|移除|remove/.test(dialogText);

    const buttons = dialog.querySelectorAll('button, a, [role="button"], .btn, .prism-button');
    for (const btn of buttons) {
      const text = getTextContent(btn);
      const onclick = btn.getAttribute('onclick') || '';
      const btnTextLower = text.toLowerCase();

      // For delete dialogs, click "取消/否/不/cancel" instead of confirm
      if (isDeleteDialog) {
        if (/取消|否|不|cancel|no|关闭|close/.test(btnTextLower)) {
          const now = Date.now();
          if (now - lastConfirmClick < COOLDOWN_MS) return false;
          if (clickButton(btn)) {
            lastConfirmClick = now;
            log('Clicked cancel on delete dialog:', text);
            return true;
          }
        }
        continue; // Skip confirm buttons on delete dialogs
      }

      // Normal confirm logic
      if (matchesText(text, CONFIRM_BUTTON_TEXTS) || CONFIRM_FUNCTION_NAMES.some(fn => onclick.includes(fn))) {
        const now = Date.now();
        if (now - lastConfirmClick < COOLDOWN_MS) {
          log('Confirm click cooldown active');
          return false;
        }
        if (clickButton(btn)) {
          lastConfirmClick = now;
          log('Clicked confirm button:', text || 'onclick:' + onclick);
          return true;
        }
      }
    }
    return false;
  }

  function handleDialog(dialog) {
    if (!enabled) return;
    if (!isElementVisible(dialog)) return;
    if (confirmedDialogs.has(dialog)) return;
    if (findAndClickConfirmButton(dialog)) {
      confirmedDialogs.add(dialog);
    }
  }

  function scanDialogs() {
    if (!enabled) return;
    for (const selector of DIALOG_SELECTORS) {
      const dialogs = document.querySelectorAll(selector);
      dialogs.forEach(handleDialog);
    }
    // Fallback: scan all visible prism-button-ok / confirm buttons anywhere
    scanAllConfirmButtons();
  }

  function scanAllConfirmButtons() {
    if (!enabled) return;
    const buttons = document.querySelectorAll('.prism-button-ok, .prism-button[onclick*="confirm"], button, a, [role="button"]');
    for (const btn of buttons) {
      if (!isElementVisible(btn)) continue;
      const text = getTextContent(btn);
      const onclick = btn.getAttribute('onclick') || '';
      const textLower = text.toLowerCase();

      // Skip delete confirm buttons, prefer cancel
      if (/删除|delete|移除|remove/.test(textLower) && /确认|确定|删除|confirm|ok|yes/.test(textLower)) {
        continue;
      }

      if (matchesText(text, CONFIRM_BUTTON_TEXTS) || /confirm|ok|continue/i.test(onclick)) {
        const now = Date.now();
        if (now - lastConfirmClick < COOLDOWN_MS) return;
        if (clickButton(btn)) {
          lastConfirmClick = now;
          log('Clicked confirm button (global scan):', text || onclick);
          return;
        }
      }
    }
  }

  function findAndClickNextEpisode() {
    if (!enabled) return false;
    const now = Date.now();
    if (now - lastNextClick < COOLDOWN_MS) {
      log('Next episode click cooldown active');
      return false;
    }

    const clickables = document.querySelectorAll('button, a, [role="button"], .btn, li, .episode-item, .video-item');
    for (const el of clickables) {
      const text = getTextContent(el);
      if (matchesText(text, NEXT_EPISODE_TEXTS) && isElementVisible(el)) {
        if (clickButton(el)) {
          lastNextClick = now;
          log('Clicked next episode button:', text);
          return true;
        }
      }
    }
    return false;
  }

  function onVideoEnded(video) {
    log('Video ended, marking as locally completed');
    // Extract coursewareId from current URL
    const urlMatch = window.location.href.match(/coursewareid=(\d+)/);
    if (urlMatch) {
      const coursewareId = urlMatch[1];
      locallyCompletedVideos.add(coursewareId);
      log('Locally completed:', coursewareId);
    }
    setTimeout(() => {
      if (!findAndClickNextEpisode()) {
        log('No next episode button found or click failed');
      }
    }, 1000);
  }

  function onVideoTimeUpdate(video) {
    if (video.duration && video.currentTime >= video.duration - VIDEO_END_THRESHOLD) {
      if (!video.dataset.nearEndHandled) {
        video.dataset.nearEndHandled = 'true';
        log('Video near end, preparing for next episode...');
      }
    }
  }

  function applyVideoSpeed(video) {
    if (video.playbackRate !== videoSpeed) {
      video.playbackRate = videoSpeed;
      log('Set video speed:', videoSpeed);
    }
  }

  function applyVideoMute(video) {
    if (video.muted !== videoMuted) {
      video.muted = videoMuted;
      log('Set video muted:', videoMuted);
    }
  }

  function attachVideoListeners(video) {
    if (observedVideos.has(video)) return;
    observedVideos.add(video);

    applyVideoSpeed(video);
    applyVideoMute(video);
    video.addEventListener('ratechange', () => applyVideoSpeed(video));
    video.addEventListener('volumechange', () => applyVideoMute(video));
    video.addEventListener('ended', () => onVideoEnded(video), { once: true });
    video.addEventListener('timeupdate', () => onVideoTimeUpdate(video));
    log('Attached listeners to video');
  }

  function scanVideos() {
    if (!enabled) return;
    const videos = document.querySelectorAll('video');
    videos.forEach(attachVideoListeners);
  }

  function handleMutations(mutations) {
    if (!enabled) return;
    let hasNewNodes = false;
    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        hasNewNodes = true;
        break;
      }
    }
    if (hasNewNodes) {
      scanDialogs();
      scanVideos();
    }
  }

  function initObserver() {
    if (observer) return;
    observer = new MutationObserver(handleMutations);
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    log('MutationObserver started');
  }

  function handleSPANavigation() {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function(...args) {
      originalPushState.apply(this, args);
      setTimeout(() => { scanDialogs(); scanVideos(); }, 0);
    };

    history.replaceState = function(...args) {
      originalReplaceState.apply(this, args);
      setTimeout(() => { scanDialogs(); scanVideos(); }, 0);
    };

    window.addEventListener('popstate', () => {
      setTimeout(() => { scanDialogs(); scanVideos(); }, 0);
    });
  }

  async function loadSettings() {
    return new Promise(resolve => {
      chrome.storage.sync.get(['enabled'], result => {
        enabled = result.enabled !== false;
        resolve();
      });
    });
  }

  function setupStorageListener() {
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'sync' && changes.enabled) {
        enabled = changes.enabled.newValue;
        log('Enabled changed:', enabled);
        if (enabled) {
          scanDialogs();
          scanVideos();
        }
      }
    });
  }

  async function init() {
    await loadSettings();
    // Restore last clicked coursewareId from sessionStorage
    try {
      const stored = sessionStorage.getItem('cp_last_courseware_id');
      const storedTime = sessionStorage.getItem('cp_last_click_time');
      if (stored && storedTime && Date.now() - parseInt(storedTime) < 300000) { // 5 min expiry
        lastClickedCoursewareId = stored;
      }
      // Restore locally completed videos
      const completedStored = sessionStorage.getItem('cp_completed_videos');
      if (completedStored) {
        const arr = JSON.parse(completedStored);
        arr.forEach(id => locallyCompletedVideos.add(id));
        log('Restored locally completed videos:', Array.from(locallyCompletedVideos));
      }
    } catch (e) {}

    pageLoadTime = Date.now();
    setupStorageListener();
    initObserver();
    handleSPANavigation();
    scanDialogs();
    scanVideos();
    startPeriodicConfirmCheck();
    setupMessageListener();
    log('Course Playback Helper initialized, enabled:', enabled);
  }

  function setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'SET_SPEED') {
        videoSpeed = message.speed;
        document.querySelectorAll('video').forEach(applyVideoSpeed);
        sendResponse({ success: true, speed: videoSpeed });
      } else if (message.type === 'GET_SPEED') {
        sendResponse({ speed: videoSpeed });
      } else if (message.type === 'SET_MUTE') {
        videoMuted = message.muted;
        document.querySelectorAll('video').forEach(applyVideoMute);
        sendResponse({ success: true, muted: videoMuted });
      } else if (message.type === 'GET_MUTE') {
        sendResponse({ muted: videoMuted });
      } else if (message.type === 'TOGGLE_ENABLED') {
        enabled = message.enabled;
        sendResponse({ success: true });
      }
      return true;
    });
  }

  function startPeriodicConfirmCheck() {
    setInterval(() => {
      if (!enabled) return;
      tryCallConfirmFunction();
      scanAllConfirmButtons();
      checkProgressAndPlayNext();
    }, 2000);
  }

  function checkProgressAndPlayNext() {
    if (!enabled) return;
    const now = Date.now();

    // Navigation cooldown: don't auto-advance immediately after page load
    if (now - pageLoadTime < NAVIGATION_COOLDOWN_MS) {
      return;
    }

    if (now - lastProgressClick < COOLDOWN_MS) return;

    // Check if there's a video that's actively playing (not paused, not ended, not near end)
    const videos = document.querySelectorAll('video');
    let hasActiveVideo = false;
    let currentVideoCoursewareId = null;

    for (const video of videos) {
      if (!video.paused && !video.ended && video.currentTime > 0 && video.currentTime < video.duration - VIDEO_END_THRESHOLD) {
        hasActiveVideo = true;
        // Get current video's coursewareId from URL
        const urlMatch = window.location.href.match(/coursewareid=(\d+)/);
        if (urlMatch) currentVideoCoursewareId = urlMatch[1];
        log('Video playing, not advancing:', video.currentTime, '/', video.duration);
        break;
      }
      if (video.paused && !video.ended && video.currentTime > 0) {
        hasActiveVideo = true;
        log('Video paused, waiting for resume:', video.currentTime, '/', video.duration);
        break;
      }
    }
    if (hasActiveVideo) return;

    // Find all course items
    const items = document.querySelectorAll('li[onclick*="coursewareid"], li[onclick*="OnlineCourse"], li[id^="courseware_"]');
    if (items.length === 0) return;

    // Get current page's coursewareId
    const currentUrlMatch = window.location.href.match(/coursewareid=(\d+)/);
    const currentPageCoursewareId = currentUrlMatch ? currentUrlMatch[1] : null;

    // If current video is locally completed (ended), force advance regardless of directory percentage
    if (currentPageCoursewareId && locallyCompletedVideos.has(currentPageCoursewareId)) {
      log('Current video locally completed (ended event), forcing advance');
      // Find this item in the list and click next
      items.forEach((item, idx) => {
        const onclick = item.getAttribute('onclick') || '';
        const match = onclick.match(/coursewareid=(\d+)/);
        if (match && match[1] === currentPageCoursewareId) {
          if (idx + 1 < items.length) {
            const nextItem = items[idx + 1];
            const nextText = getTextContent(nextItem);
            const nextCls = nextItem.className || '';
            const nextOnclick = nextItem.getAttribute('onclick') || '';
            const nextCoursewareIdMatch = nextOnclick.match(/coursewareid=(\d+)/);
            const nextCoursewareId = nextCoursewareIdMatch ? nextCoursewareIdMatch[1] : null;

            const nextIsCompleted = /\[100%\]/.test(nextText) || nextCls.includes('class-green');
            if (nextIsCompleted) {
              log('Next video already completed, skipping');
              return;
            }
            if (nextCoursewareId && nextCoursewareId === lastClickedCoursewareId) {
              log('Next video already clicked, waiting for progress update');
              return;
            }
            if (nextCoursewareId && window.location.href.includes('coursewareid=' + nextCoursewareId)) {
              log('Already on next video page, not clicking again');
              return;
            }
            if (isElementVisible(nextItem)) {
              if (clickButton(nextItem)) {
                lastProgressClick = now;
                if (nextCoursewareId) {
                  lastClickedCoursewareId = nextCoursewareId;
                  try {
                    sessionStorage.setItem('cp_last_courseware_id', nextCoursewareId);
                    sessionStorage.setItem('cp_last_click_time', now.toString());
                  } catch (e) {}
                }
                log('Clicked next video (forced by local completion):', nextText);
              }
            }
          }
        }
      });
      return;
    }

    // Find the LAST completed item (highest index with 100% or class-green OR locally completed)
    let lastCompletedIndex = -1;
    items.forEach((item, idx) => {
      const text = getTextContent(item);
      const cls = item.className || '';
      const onclick = item.getAttribute('onclick') || '';
      const coursewareIdMatch = onclick.match(/coursewareid=(\d+)/);
      const coursewareId = coursewareIdMatch ? coursewareIdMatch[1] : null;

      const isDirectoryCompleted = /\[100%\]/.test(text) || cls.includes('class-green');
      const isLocallyCompleted = coursewareId && locallyCompletedVideos.has(coursewareId);

      if (isDirectoryCompleted || isLocallyCompleted) {
        lastCompletedIndex = idx;
      }
    });

    // If there's a completed item and it has a next item, advance
    if (lastCompletedIndex >= 0 && lastCompletedIndex + 1 < items.length) {
      const nextItem = items[lastCompletedIndex + 1];
      const nextText = getTextContent(nextItem);
      const nextCls = nextItem.className || '';
      const onclick = nextItem.getAttribute('onclick') || '';
      const coursewareIdMatch = onclick.match(/coursewareid=(\d+)/);
      const nextCoursewareId = coursewareIdMatch ? coursewareIdMatch[1] : null;

      const nextIsCompleted = /\[100%\]/.test(nextText) || nextCls.includes('class-green');

      // Skip if next is already completed
      if (nextIsCompleted) {
        log('Next video already completed, skipping');
        return;
      }

      // Skip if already clicked this one (persisted across reloads)
      if (nextCoursewareId && nextCoursewareId === lastClickedCoursewareId) {
        log('Next video already clicked, waiting for progress update');
        return;
      }

      // Check if current page URL matches the next video (already navigated)
      if (nextCoursewareId && window.location.href.includes('coursewareid=' + nextCoursewareId)) {
        log('Already on next video page, not clicking again');
        return;
      }

      if (isElementVisible(nextItem)) {
        if (clickButton(nextItem)) {
          lastProgressClick = now;
          if (nextCoursewareId) {
            lastClickedCoursewareId = nextCoursewareId;
            // Persist to sessionStorage
            try {
              sessionStorage.setItem('cp_last_courseware_id', nextCoursewareId);
              sessionStorage.setItem('cp_last_click_time', now.toString());
              // Clear completed for the new video, keep others
              locallyCompletedVideos.delete(nextCoursewareId);
              sessionStorage.setItem('cp_completed_videos', JSON.stringify(Array.from(locallyCompletedVideos)));
            } catch (e) {}
          }
          log('Clicked next video by progress:', nextText);
        }
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();