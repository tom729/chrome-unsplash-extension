// background.ts
import type { DownloadItem } from 'chrome-types';

const UNSPLASH_ACCESS_KEY = import.meta.env.VITE_UNSPLASH_ACCESS_KEY;

// 检查Chrome存储配额使用情况
function checkStorageQuota() {
  chrome.storage.sync.getBytesInUse((bytesInUse) => {
    console.log(`Chrome存储使用: ${bytesInUse} bytes / 102400 bytes (${(bytesInUse/102400*100).toFixed(1)}%)`);
  });
}

// 迁移历史记录从 sync storage 到 local storage
// 使用标志位确保只迁移一次
let isMigrating = false;
function migrateWallpaperHistory() {
  // 防止重复迁移
  if (isMigrating) {
    console.log('迁移正在进行中，跳过');
    return;
  }
  
  chrome.storage.local.get(['_migration_completed'], (migrationFlag) => {
    // 如果已经迁移过，直接返回
    if (migrationFlag._migration_completed) {
      console.log('历史记录已迁移过，跳过');
      return;
    }
    
    chrome.storage.sync.get(['wallpaperHistory'], (syncResult) => {
      // 检查 sync storage 中是否有历史记录
      if (syncResult.wallpaperHistory && Array.isArray(syncResult.wallpaperHistory) && syncResult.wallpaperHistory.length > 0) {
        isMigrating = true;
        console.log(`发现旧数据，开始迁移 ${syncResult.wallpaperHistory.length} 条历史记录到 local storage`);
        
        // 检查 local storage 中是否已有数据
        chrome.storage.local.get(['wallpaperHistory'], (localResult) => {
          const existingHistory = localResult.wallpaperHistory || [];
          
          // 合并数据：将 sync 中的历史记录添加到 local 中（避免重复）
          const syncHistory = syncResult.wallpaperHistory;
          const mergedHistory = [...existingHistory];
          
          syncHistory.forEach((item: any) => {
            if (!mergedHistory.find((h: any) => h.id === item.id)) {
              mergedHistory.push(item);
            }
          });
          
          // 按时间戳排序，最新的在前面
          mergedHistory.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));
          
          // 限制数量为20条
          if (mergedHistory.length > 20) {
            mergedHistory.splice(20);
          }
          
          // 保存到 local storage，并设置迁移标志
          chrome.storage.local.set({ 
            wallpaperHistory: mergedHistory,
            _migration_completed: true 
          }, () => {
            if (chrome.runtime.lastError) {
              console.error('迁移历史记录失败:', chrome.runtime.lastError);
              isMigrating = false;
            } else {
              console.log(`历史记录迁移成功，共 ${mergedHistory.length} 条`);
              
              // 从 sync storage 中删除 wallpaperHistory
              chrome.storage.sync.remove('wallpaperHistory', () => {
                if (chrome.runtime.lastError) {
                  console.error('删除 sync storage 中的历史记录失败:', chrome.runtime.lastError);
                } else {
                  console.log('已从 sync storage 中删除历史记录');
                }
                isMigrating = false;
              });
            }
          });
        });
      } else {
        // 即使没有数据需要迁移，也设置标志，避免重复检查
        chrome.storage.local.set({ _migration_completed: true }, () => {});
      }
    });
  });
}

const isExtension =
  typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;

if (isExtension) {
  // 扩展启动时执行数据迁移
  migrateWallpaperHistory();
  
  chrome.runtime.onInstalled.addListener(() => {
    // 安装或更新时也执行迁移
    migrateWallpaperHistory();
    chrome.alarms.create('changeWallpaper', { periodInMinutes: 30 });
    chrome.storage.sync.get(['wallpaperTopic'], (result) => {
      console.log('扩展安装/更新，topicId:', result.wallpaperTopic);
      updateWallpaper(result.wallpaperTopic);
    });
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'changeWallpaper') {
      chrome.storage.sync.get(['wallpaperTopic'], (result) => {
        console.log('定时器触发更新壁纸，topicId:', result.wallpaperTopic);
        updateWallpaper(result.wallpaperTopic);
      });
    }
  });

  chrome.runtime.onMessage.addListener(
    (request, sender, sendResponse) => {
      if (request.action === 'updateWallpaper') {
        console.log('收到更新壁纸请求，topicId:', request.topicId, '类型:', typeof request.topicId);
        updateWallpaper(request.topicId);
      } else if (request.action === 'pauseAlarm') {
        chrome.alarms.clear('changeWallpaper');
      } else if (request.action === 'resumeAlarm') {
        chrome.alarms.create('changeWallpaper', { periodInMinutes: 30 });
        chrome.storage.sync.get(['wallpaperTopic'], (result) => {
          updateWallpaper(result.wallpaperTopic);
        });
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

function updateWallpaper(topicId?: string) {
  // 构建 API URL
  // Unsplash API 的 /photos/random 端点支持 query 参数来搜索特定主题
  // 这比使用 /search/photos 更简单直接
  let apiUrl: string;
  
  // 确保 topicId 是字符串类型，并去除空白
  const safeTopicId = typeof topicId === 'string' ? topicId.trim() : '';
  
  if (safeTopicId && safeTopicId !== 'all') {
    // 将 topicId 转换为查询关键词（将连字符替换为空格）
    const query = safeTopicId.replace(/-/g, ' ');
    apiUrl = `https://api.unsplash.com/photos/random?query=${encodeURIComponent(query)}&orientation=landscape`;
    console.log('请求壁纸（分类）:', safeTopicId, '查询关键词:', query, 'API URL:', apiUrl);
  } else {
    // 使用随机图片接口（不指定分类）
    apiUrl = 'https://api.unsplash.com/photos/random?orientation=landscape';
    console.log('请求壁纸（全部）:', 'API URL:', apiUrl);
  }
  
  fetch(apiUrl, {
    headers: {
      Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}`,
    },
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then((data) => {
      console.log('API 响应数据:', data);
      // /photos/random 端点直接返回单个图片对象，无需处理搜索结果
      const photoData = data;
      
      // 验证API响应数据结构
      if (!photoData || !photoData.urls || !photoData.user || !photoData.links) {
        console.error('无效的图片数据结构:', photoData);
        throw new Error('Invalid API response structure');
      }
      
      console.log('成功获取壁纸，摄影师:', photoData.user.name, '主题:', topicId);
      const wallpaperData = {
        wallpaper: photoData.urls.full, // 图片直链
        wallpaperThumb: photoData.urls.thumb, // 缩略图
        photographer: photoData.user.name,
        photoUrl: photoData.links.html.replace(
          'https://unsplash.com',
          'https://www.unsplash.com'
        ),
        downloadUrl: photoData.links.download_location, // 仅统计用
      };

      // 保存壁纸历史记录（优化数据结构以减少存储空间）
      const historyItem = {
        id: photoData.id,
        timestamp: Date.now(),
        photographer: photoData.user.name,
        photoUrl: photoData.links.html.replace(
          'https://unsplash.com',
          'https://www.unsplash.com'
        ),
        downloadLocation: photoData.links.download_location,
        // 保存完整URL用于下载，但限制历史记录数量
        wallpaper: photoData.urls.full,
        thumbnail: photoData.urls.thumb,
      };

      if (isExtension) {
        // 分别存储当前壁纸数据和历史记录，避免超过单个存储项的限制
        // 历史记录使用 chrome.storage.local（配额更大，不需要同步）
        chrome.storage.local.get(['wallpaperHistory'], (result) => {
          const history = result.wallpaperHistory || [];
          
          // 避免重复添加相同的壁纸
          if (!history.find((item: any) => item.id === historyItem.id)) {
            history.unshift(historyItem); // 最新的在前面
            
            // 限制历史记录数量为20张（减少存储空间使用）
            if (history.length > 20) {
              history.splice(20);
            }
          }
          
          // 调试：检查存储使用情况
          const historyJson = JSON.stringify(history);
          const historySize = new Blob([historyJson]).size;
          console.log(`历史记录数量: ${history.length}, 数据大小: ${historySize} bytes`);
          
          // 先保存历史记录到 local storage
          chrome.storage.local.set({ wallpaperHistory: history }, () => {
            if (chrome.runtime.lastError) {
              console.error('保存历史记录失败:', chrome.runtime.lastError);
            } else {
              console.log('历史记录保存成功');
            }
            
            // 然后保存当前壁纸数据到 sync storage（需要同步）
            chrome.storage.sync.set(wallpaperData, () => {
              if (chrome.runtime.lastError) {
                console.error('保存数据失败:', chrome.runtime.lastError);
                // 保存失败时也要设置错误，让前端重置加载状态
                chrome.storage.sync.set({ error: '保存数据失败: ' + chrome.runtime.lastError.message }, () => {
                  setTimeout(() => {
                    chrome.storage.sync.set({ error: '' }, () => {});
                  }, 1000);
                });
              } else {
                console.log('数据保存成功');
                // 清除可能的错误标记
                chrome.storage.sync.set({ error: '' }, () => {});
                checkStorageQuota(); // 检查存储使用情况
              }
            });
          });
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
          if (history.length > 20) {
            history.splice(20);
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
      console.error('错误详情:', {
        message: error.message,
        stack: error.stack,
        topicId: topicId
      });
      // 将错误保存到storage，让前端知道请求失败并重置加载状态
      if (isExtension) {
        chrome.storage.sync.set({ error: error.message || '获取壁纸失败' }, () => {
          if (chrome.runtime.lastError) {
            console.error('保存错误信息失败:', chrome.runtime.lastError);
          }
          // 清除错误标记，避免影响后续请求
          setTimeout(() => {
            chrome.storage.sync.set({ error: '' }, () => {});
          }, 3000); // 延长到3秒，让用户能看到错误信息
        });
      }
    });
}

// 本地开发环境自动刷新壁纸
if (!isExtension) {
  updateWallpaper();
  setInterval(updateWallpaper, 30 * 60 * 1000);
}

export {};
