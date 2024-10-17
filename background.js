const UNSPLASH_ACCESS_KEY = 'YOUR_UNSPLASH_ACCESS_KEY';

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

function updateWallpaper() {
  fetch('https://api.unsplash.com/photos/random?orientation=landscape', {
    headers: {
      'Authorization': `Client-ID ${UNSPLASH_ACCESS_KEY}`
    }
  })
    .then(response => response.json())
    .then(data => {
      chrome.storage.sync.set({ 
        wallpaper: data.urls.full,
        photographer: data.user.name,
        photoUrl: data.links.html
      });
    })
    .catch(error => {
      console.error('Error fetching wallpaper:', error);
    });
}