const UNSPLASH_ACCESS_KEY = 'YOUR_UNSPLASH_ACCESS_KEY';

// Check if we're in a Chrome extension environment
const isExtension = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;

if (isExtension) {
  chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.create('changeWallpaper', { periodInMinutes: 30 });
    updateWallpaper();
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'changeWallpaper') {
      updateWallpaper();
    }
  });

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'updateWallpaper') {
      updateWallpaper();
    } else if (request.action === 'pauseAlarm') {
      chrome.alarms.clear('changeWallpaper');
    } else if (request.action === 'resumeAlarm') {
      chrome.alarms.create('changeWallpaper', { periodInMinutes: 30 });
      updateWallpaper();
    }
  });
}

function updateWallpaper() {
  fetch('https://api.unsplash.com/photos/random?orientation=landscape', {
    headers: {
      'Authorization': `Client-ID ${UNSPLASH_ACCESS_KEY}`
    }
  })
    .then(response => response.json())
    .then(data => {
      const wallpaperData = { 
        wallpaper: data.urls.full,
        photographer: data.user.name,
        photoUrl: data.links.html
      };

      if (isExtension) {
        chrome.storage.sync.set(wallpaperData);
      } else {
        // For development environment, use localStorage
        Object.entries(wallpaperData).forEach(([key, value]) => {
          localStorage.setItem(key, JSON.stringify(value));
        });
        // Simulate message passing
        window.postMessage({ type: 'WALLPAPER_UPDATED', data: wallpaperData }, '*');
      }
    })
    .catch(error => {
      console.error('Error fetching wallpaper:', error);
    });
}

// For development environment, update wallpaper periodically
if (!isExtension) {
  updateWallpaper();
  setInterval(updateWallpaper, 30 * 60 * 1000); // 30 minutes
}

export {};