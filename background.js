const UNSPLASH_ACCESS_KEY = import.meta.env.VITE_UNSPLASH_ACCESS_KEY;

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
  } else if (request.action === 'downloadWallpaper' && request.url) {
    // First, fetch the download location to get the actual image URL
    fetch(request.url, {
      headers: {
        'Authorization': `Client-ID ${UNSPLASH_ACCESS_KEY}`
      }
    })
    .then(response => response.json())
    .then(data => {
      // Now, use the chrome.downloads API with the actual image URL
      chrome.downloads.download({
        url: data.url, // The actual URL is in the 'url' property of the response
        filename: request.filename
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          console.error('Download failed:', chrome.runtime.lastError.message);
        }
      });
    })
    .catch(error => console.error('Error getting download link:', error));

    return true; // Indicates that the response is sent asynchronously
  }
});

function updateWallpaper() {
  fetch('https://api.unsplash.com/photos/random?orientation=landscape', {
    headers: {
      'Authorization': `Client-ID ${UNSPLASH_ACCESS_KEY}`
    }
  })
    .then(response => {
      if (!response.ok) {
        return response.json().then(err => {
            // Unsplash API returns errors in an `errors` array
            const errorMessage = err.errors ? err.errors.join(', ') : 'Unknown API error';
            throw new Error(errorMessage);
        });
      }
      return response.json();
    })
    .then(data => {
      chrome.storage.sync.set({
        wallpaper: data.urls.full,
        photographer: data.user.name,
        photoUrl: data.links.html.replace('https://unsplash.com', 'https://www.unsplash.com'),
        downloadUrl: data.links.download_location,
        error: null // Clear previous errors on success
      });
    })
    .catch(error => {
      console.error('Error fetching wallpaper:', error.message);
      chrome.storage.sync.set({ error: `Failed to fetch wallpaper: ${error.message}` });
    });
}