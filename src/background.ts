// background.ts
import type { DownloadItem } from 'chrome-types';

const UNSPLASH_ACCESS_KEY = import.meta.env.VITE_UNSPLASH_ACCESS_KEY;

const isExtension =
  typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;

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

  chrome.runtime.onMessage.addListener(
    (request, sender, sendResponse) => {
      if (request.action === 'updateWallpaper') {
        updateWallpaper();
      } else if (request.action === 'pauseAlarm') {
        chrome.alarms.clear('changeWallpaper');
      } else if (request.action === 'resumeAlarm') {
        chrome.alarms.create('changeWallpaper', { periodInMinutes: 30 });
        updateWallpaper();
      } else if (
        request.action === 'downloadWallpaper' &&
        request.wallpaperUrl && // 用图片直链
        request.filename
      ) {
        // 可选：先统计（向 downloadLocation 发 GET 请求，无需关注结果）
        if (request.downloadLocation) {
          fetch(request.downloadLocation, {
            headers: {
              Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}`,
            },
          }).catch(() => {});
        }
        // 直接下载直链图片
        chrome.downloads.download(
          {
            url: request.wallpaperUrl,
            filename: request.filename,
            saveAs: false,
          },
          (downloadId) => {
            if (chrome.runtime.lastError) {
              console.error(
                '下载失败:',
                chrome.runtime.lastError.message
              );
              sendResponse({
                success: false,
                error: chrome.runtime.lastError.message,
              });
            } else {
              trackDownload(downloadId, sendResponse);
            }
          }
        );
        return true; // 异步回调
      }
    }
  );
}

// 跟踪下载进度
function trackDownload(
  downloadId: number,
  sendResponse: (response?: any) => void
) {
  chrome.downloads.onChanged.addListener(function listener(delta) {
    if (
      delta.id === downloadId &&
      delta.state &&
      delta.state.current === 'complete'
    ) {
      chrome.downloads.onChanged.removeListener(listener);
      sendResponse({ success: true, downloadId });
    }
  });
}

function updateWallpaper() {
  fetch('https://api.unsplash.com/photos/random?orientation=landscape', {
    headers: {
      Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}`,
    },
  })
    .then((response) => response.json())
    .then((data) => {
      const wallpaperData = {
        wallpaper: data.urls.full, // 图片直链
        wallpaperThumb: data.urls.thumb, // 缩略图
        photographer: data.user.name,
        photoUrl: data.links.html.replace(
          'https://unsplash.com',
          'https://www.unsplash.com'
        ),
        downloadLocation: data.links.download_location, // 仅统计用
      };

      // 保存壁纸历史记录
      const historyItem = {
        id: data.id,
        timestamp: Date.now(),
        wallpaper: data.urls.full,
        wallpaperThumb: data.urls.thumb,
        photographer: data.user.name,
        photoUrl: data.links.html.replace(
          'https://unsplash.com',
          'https://www.unsplash.com'
        ),
        downloadLocation: data.links.download_location,
      };

      if (isExtension) {
        // 保存当前壁纸数据
        chrome.storage.sync.set(wallpaperData);
        
        // 保存到历史记录
        chrome.storage.sync.get(['wallpaperHistory'], (result) => {
          const history = result.wallpaperHistory || [];
          
          // 避免重复添加相同的壁纸
          if (!history.find((item: any) => item.id === historyItem.id)) {
            history.unshift(historyItem); // 最新的在前面
            
            // 限制历史记录数量为50张
            if (history.length > 50) {
              history.splice(50);
            }
            
            chrome.storage.sync.set({ wallpaperHistory: history });
          }
        });
      } else {
        // 本地开发环境
        Object.entries(wallpaperData).forEach(([key, value]) => {
          localStorage.setItem(key, JSON.stringify(value));
        });
        
        // 保存历史记录到localStorage
        const history = JSON.parse(localStorage.getItem('wallpaperHistory') || '[]');
        if (!history.find((item: any) => item.id === historyItem.id)) {
          history.unshift(historyItem);
          if (history.length > 50) {
            history.splice(50);
          }
          localStorage.setItem('wallpaperHistory', JSON.stringify(history));
        }
        
        window.postMessage(
          { type: 'WALLPAPER_UPDATED', data: wallpaperData },
          '*'
        );
      }
    })
    .catch((error) => {
      console.error('获取壁纸失败:', error);
    });
}

// 本地开发环境自动刷新壁纸
if (!isExtension) {
  updateWallpaper();
  setInterval(updateWallpaper, 30 * 60 * 1000);
}

export {};
