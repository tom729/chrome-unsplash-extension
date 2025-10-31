import React, { useState, useEffect, useRef } from 'react';
import { Download, Search, Plus, History, X, RefreshCw } from 'lucide-react';
import ColorThief from 'colorthief';
import useI18n from './useI18n';

// Mock chrome API for development environment
const mockChrome = {
  storage: {
    sync: {
      get: (keys: string[] | string, callback: (result: any) => void) => {
        const keyList = Array.isArray(keys) ? keys : [keys];
        const result = keyList.reduce((acc, key) => {
          const value = localStorage.getItem(`sync_${key}`);
          return { ...acc, [key]: value ? JSON.parse(value) : undefined };
        }, {});
        callback(result);
      },
      set: (items: { [key: string]: any }, callback?: () => void) => {
        Object.entries(items).forEach(([key, value]) => localStorage.setItem(`sync_${key}`, JSON.stringify(value)));
        if (callback) callback();
      },
      remove: (keys: string[] | string, callback?: () => void) => {
        const keyList = Array.isArray(keys) ? keys : [keys];
        keyList.forEach(key => localStorage.removeItem(`sync_${key}`));
        if (callback) callback();
      },
    },
    local: {
      get: (keys: string[] | string, callback: (result: any) => void) => {
        const keyList = Array.isArray(keys) ? keys : [keys];
        const result = keyList.reduce((acc, key) => {
          const value = localStorage.getItem(`local_${key}`);
          return { ...acc, [key]: value ? JSON.parse(value) : undefined };
        }, {});
        callback(result);
      },
      set: (items: { [key: string]: any }, callback?: () => void) => {
        Object.entries(items).forEach(([key, value]) => localStorage.setItem(`local_${key}`, JSON.stringify(value)));
        if (callback) callback();
      },
      remove: (keys: string[] | string, callback?: () => void) => {
        const keyList = Array.isArray(keys) ? keys : [keys];
        keyList.forEach(key => localStorage.removeItem(`local_${key}`));
        if (callback) callback();
      },
    },
    onChanged: {
      addListener: (callback: (changes: any, areaName: string) => void) => {},
      removeListener: (callback: (changes: any, areaName: string) => void) => {},
    }
  },
  runtime: {
    sendMessage: (message: any) => {
      console.log('Mock sendMessage:', message);
    },
    onMessage: {
      addListener: (callback: (message: any) => void) => {
        window.addEventListener('message', (event) => {
          if (event.data && event.data.type === 'WALLPAPER_UPDATED') {
            callback(event.data.data);
          }
        });
      },
    },
  },
  search: {
    query: (queryInfo: { text: string }) => {
      console.log('Mock search.query:', queryInfo);
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(queryInfo.text)}`;
      window.open(searchUrl, '_blank');
    }
  },
  history: {
    search: (query: chrome.history.HistoryQuery, callback: (results: chrome.history.HistoryItem[]) => void) => {
      console.log('Mock history.search:', query);
      callback([]);
    }
  }
};

const chromeApi = typeof chrome !== 'undefined' && chrome.runtime.id ? chrome : mockChrome;

function getMonthCalendar(year: number, month: number) {
  // 返回一个二维数组，表示日历的每一行（周）
  const weeks: (number | null)[][] = [];
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  let current = 1 - firstDay.getDay(); // 周日为0
  for (let w = 0; w < 6; w++) {
    const week: (number | null)[] = [];
    for (let d = 0; d < 7; d++) {
      if (current < 1 || current > lastDay.getDate()) {
        week.push(null);
      } else {
        week.push(current);
      }
      current++;
    }
    weeks.push(week);
  }
  return weeks;
}

function getDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

// 获取用于favicon的主域名
function getRootDomain(domain: string) {
  const parts = domain.split('.');
  if (parts.length > 2) {
    // 处理 .co.uk, .com.cn 等情况
    if (parts.length > 2 && parts[parts.length-2].length <= 3 && parts[parts.length-1].length <= 2) {
      return parts.slice(-3).join('.');
    }
    return parts.slice(-2).join('.');
  }
  return domain;
}

// Favicon组件，优先用自定义图标，否则用Google服务
function Favicon({ domain, defaultFavicon, customFavicon }: { domain: string; defaultFavicon: string; customFavicon?: string }) {
  const src = customFavicon || `https://s2.googleusercontent.com/s2/favicons?sz=64&domain_url=${domain}`;
  return (
    <img
      src={src}
      alt={domain}
      className="w-14 h-14 rounded-xl shadow-md bg-white/40 group-hover:scale-125 group-hover:shadow-2xl transition-transform duration-200"
      style={{ objectFit: 'contain' }}
      onError={(e) => { (e.target as HTMLImageElement).src = defaultFavicon; }}
    />
  );
}

function App() {
  const t = useI18n();
  const [wallpaper, setWallpaper] = useState('');
  const [time, setTime] = useState(new Date());
  const [photographer, setPhotographer] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [error, setError] = useState('');
  const [textColor, setTextColor] = useState('white');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  // 壁纸历史记录相关状态
  const [wallpaperHistory, setWallpaperHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const historyModalRef = useRef<HTMLDivElement>(null);
  
  // 壁纸加载状态
  const [isLoadingWallpaper, setIsLoadingWallpaper] = useState(false);
  // 使用ref来跟踪请求状态，避免闭包问题
  const isRequestingUpdateRef = useRef(false);
  // 保存超时ID，用于清理
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 日历相关
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const date = today.getDate();
  const weeks = getMonthCalendar(year, month);
  const weekDays = [t('sun'), t('mon'), t('tue'), t('wed'), t('thu'), t('fri'), t('sat')];

  // 日历拖动相关
  const defaultCalendarPos = { top: 24, left: window.innerWidth - 400, right: 24 };
  const [calendarPos, setCalendarPos] = useState(() => {
    const saved = localStorage.getItem('calendarPos');
    return saved ? JSON.parse(saved) : defaultCalendarPos;
  });
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const calendarRef = useRef<HTMLDivElement>(null);

  // 拖动事件
  const onMouseDown = (e: React.MouseEvent) => {
    setDragging(true);
    const rect = calendarRef.current?.getBoundingClientRect();
    dragOffset.current = {
      x: e.clientX - (rect ? rect.left : 0),
      y: e.clientY - (rect ? rect.top : 0),
    };
    document.body.style.userSelect = 'none';
  };
  useEffect(() => {
    if (!dragging) return;
    const onMouseMove = (e: MouseEvent) => {
      const newLeft = e.clientX - dragOffset.current.x;
      const newTop = e.clientY - dragOffset.current.y;
      setCalendarPos((pos: { top: number; left: number }) => {
        const next = {
          top: Math.max(8, Math.min(newTop, window.innerHeight - 320)),
          left: Math.max(8, Math.min(newLeft, window.innerWidth - 320)),
        };
        localStorage.setItem('calendarPos', JSON.stringify(next));
        return next;
      });
    };
    const onMouseUp = () => {
      setDragging(false);
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [dragging]);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);

    const getInitialData = () => {
      // 分别从 sync 和 local storage 读取数据
      // 注意：迁移逻辑由 background script 处理，前端只负责读取
      chromeApi.storage.sync.get(['wallpaper', 'photographer', 'photoUrl', 'downloadUrl', 'error'], (syncResult) => {
        chromeApi.storage.local.get(['wallpaperHistory'], (localResult) => {
          if (syncResult.error) setError(syncResult.error);
          
          // 优先展示历史中最近的壁纸或当前壁纸
          const hasCurrentWallpaper = syncResult.wallpaper;
          const history = localResult.wallpaperHistory || [];
          const hasHistory = history.length > 0;
          
          if (hasCurrentWallpaper) {
            // 如果有当前壁纸，直接显示
            setWallpaper(syncResult.wallpaper);
            updateTextColor(syncResult.wallpaper);
          } else if (hasHistory) {
            // 如果没有当前壁纸但有历史记录，显示最近的一张
            const latestWallpaper = history[0];
            setWallpaper(latestWallpaper.wallpaper);
            setPhotographer(latestWallpaper.photographer);
            setPhotoUrl(latestWallpaper.photoUrl);
            setDownloadUrl(latestWallpaper.downloadLocation);
            updateTextColor(latestWallpaper.wallpaper);
          }
          
          // 设置其他数据
          if (syncResult.photographer) setPhotographer(syncResult.photographer);
          if (syncResult.photoUrl) setPhotoUrl(syncResult.photoUrl);
          if (syncResult.downloadUrl) setDownloadUrl(syncResult.downloadUrl);
          if (history) setWallpaperHistory(history);
          
          // 清除之前的超时（如果有）
          if (loadingTimeoutRef.current) {
            clearTimeout(loadingTimeoutRef.current);
            loadingTimeoutRef.current = null;
          }
          
          // 总是在后台加载新壁纸（除非是首次安装且没有历史记录）
          setIsLoadingWallpaper(true);
          isRequestingUpdateRef.current = true;
          chromeApi.runtime.sendMessage({ action: 'updateWallpaper' });
          
          // 添加超时保护：30秒后自动重置加载状态
          loadingTimeoutRef.current = setTimeout(() => {
            if (isRequestingUpdateRef.current) {
              console.warn('壁纸加载超时，重置加载状态');
              setIsLoadingWallpaper(false);
              isRequestingUpdateRef.current = false;
            }
            loadingTimeoutRef.current = null;
          }, 30000);
        });
      });
    };

    getInitialData();

    const storageChangeListener = (changes: { [key: string]: any }, area: string) => {
      if (area === 'sync') {
        // 只有当前标签页正在请求更新时才更新壁纸显示
        if (changes.wallpaper && isRequestingUpdateRef.current) {
          setWallpaper(changes.wallpaper.newValue);
          if (changes.wallpaper.newValue) {
            updateTextColor(changes.wallpaper.newValue);
            // 新壁纸加载完成，停止加载状态
            setIsLoadingWallpaper(false);
            isRequestingUpdateRef.current = false;
            // 清除超时
            if (loadingTimeoutRef.current) {
              clearTimeout(loadingTimeoutRef.current);
              loadingTimeoutRef.current = null;
            }
            if (refreshTimeoutRef.current) {
              clearTimeout(refreshTimeoutRef.current);
              refreshTimeoutRef.current = null;
            }
          }
        }
        
        // 摄影师、链接等信息只在当前标签页请求时更新
        if (isRequestingUpdateRef.current) {
          if (changes.photographer) setPhotographer(changes.photographer.newValue);
          if (changes.photoUrl) setPhotoUrl(changes.photoUrl.newValue);
          if (changes.downloadUrl) setDownloadUrl(changes.downloadUrl.newValue);
        }
        
        // 错误信息总是更新
        if (changes.error !== undefined) {
          const errorMsg = changes.error.newValue || '';
          setError(errorMsg);
          // 如果当前标签页正在请求更新，遇到错误时重置加载状态
          if (isRequestingUpdateRef.current) {
            setIsLoadingWallpaper(false);
            isRequestingUpdateRef.current = false;
            // 清除超时
            if (loadingTimeoutRef.current) {
              clearTimeout(loadingTimeoutRef.current);
              loadingTimeoutRef.current = null;
            }
            if (refreshTimeoutRef.current) {
              clearTimeout(refreshTimeoutRef.current);
              refreshTimeoutRef.current = null;
            }
          }
        }
      } else if (area === 'local') {
        // 历史记录存储在 local storage 中，总是更新
        if (changes.wallpaperHistory) {
          setWallpaperHistory(changes.wallpaperHistory.newValue || []);
        }
      }
    };

    chromeApi.storage.onChanged.addListener(storageChangeListener);
    
    return () => {
      clearInterval(timer);
      chromeApi.storage.onChanged.removeListener(storageChangeListener);
      // 清理超时
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
    };
  }, []);

  const updateTextColor = (imageUrl: string) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = imageUrl;
    img.onload = () => {
      const colorThief = new ColorThief();
      const color = colorThief.getColor(img);
      const brightness = (color[0] * 299 + color[1] * 587 + color[2] * 114) / 1000;
      setTextColor(brightness > 128 ? 'black' : 'white');
    };
  };

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;
    chromeApi.search.query({ text: searchTerm });
  };

  const handleDownload = () => {
    // Sanitize the photographer's name to remove characters that are invalid in filenames
    const sanitizedPhotographer = photographer.replace(/[\\/:*?"<>|]/g, '').trim();
    const filename = `unsplash-${sanitizedPhotographer.replace(/\\s+/g, '-') || 'wallpaper'}.jpg`;
    chromeApi.runtime.sendMessage({
      action: 'downloadWallpaper',
      wallpaperUrl: wallpaper, // 添加缺失的wallpaperUrl参数
      downloadLocation: downloadUrl,
      filename: filename
    });
  };

  const handleRefreshWallpaper = () => {
    // 清除之前的超时（如果有）
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = null;
    }
    
    setIsLoadingWallpaper(true);
    isRequestingUpdateRef.current = true;
    chromeApi.runtime.sendMessage({ action: 'updateWallpaper' });
    
    // 添加超时保护：30秒后自动重置加载状态
    refreshTimeoutRef.current = setTimeout(() => {
      if (isRequestingUpdateRef.current) {
        console.warn('壁纸刷新超时，重置加载状态');
        setIsLoadingWallpaper(false);
        isRequestingUpdateRef.current = false;
      }
      refreshTimeoutRef.current = null;
    }, 30000);
  };

  // 从历史记录下载壁纸
  const handleHistoryDownload = (historyItem: any) => {
    const sanitizedPhotographer = historyItem.photographer.replace(/[\\/:*?"<>|]/g, '').trim();
    const filename = `unsplash-${sanitizedPhotographer.replace(/\\s+/g, '-') || 'wallpaper'}.jpg`;
    chromeApi.runtime.sendMessage({
      action: 'downloadWallpaper',
      wallpaperUrl: historyItem.wallpaper, // 添加缺失的wallpaperUrl参数
      downloadLocation: historyItem.downloadLocation,
      filename: filename
    });
  };

  // Dock栏相关
  const [dockSites, setDockSites] = useState<{ domain: string; url: string; count: number }[]>([]);
  const [maxDockIcons] = useState(15);
  const [customSites, setCustomSites] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('customSites');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [historySiteBlacklist, setHistorySiteBlacklist] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('historySiteBlacklist');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [showAddSite, setShowAddSite] = useState(false);
  const [addSiteUrl, setAddSiteUrl] = useState('');
  const [siteToConfirmDelete, setSiteToConfirmDelete] = useState<{ domain: string, type: 'custom' | 'history' } | null>(null);

  // 统计最近一周常用网站
  useEffect(() => {
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    chromeApi.history.search({ text: '', startTime: oneWeekAgo, maxResults: 1000 }, (results) => {
      const domainMap: Record<string, { count: number; url: string; lastVisitTime: number }> = {};
      results.forEach(item => {
        if (!item.url) return;
        const domain = getDomain(item.url);
        if (!domain || domain.endsWith('google.com') || domain.endsWith('baidu.com') || domain.endsWith('bing.com')) return;
        if (!domainMap[domain]) domainMap[domain] = { count: 0, url: item.url, lastVisitTime: 0 };
        domainMap[domain].count += item.visitCount || 1;
        if ((item.lastVisitTime || 0) > (domainMap[domain].lastVisitTime || 0)) {
          domainMap[domain].url = item.url;
          domainMap[domain].lastVisitTime = item.lastVisitTime || 0;
        }
      });
      const arr = Object.entries(domainMap)
        .map(([domain, v]) => ({ domain, url: v.url, count: v.count }))
        .sort((a, b) => b.count - a.count);
      setDockSites(arr);
    });
  }, [historySiteBlacklist]); // Re-fetch if blacklist changes

  // 保存自定义网站到localStorage
  const saveCustomSites = (sites: any[]) => {
    setCustomSites(sites);
    localStorage.setItem('customSites', JSON.stringify(sites));
  };
  
  // 保存黑名单
  const saveHistorySiteBlacklist = (list: string[]) => {
    setHistorySiteBlacklist(list);
    localStorage.setItem('historySiteBlacklist', JSON.stringify(list));
  };
  
  // 添加自定义网站
  const handleAddSite = () => {
    if (!addSiteUrl.trim()) return;
    let url = addSiteUrl.trim();
    if (!/^https?:\/\//.test(url)) url = 'https://' + url;
    let domain = '';
    try { domain = new URL(url).hostname; } catch { return; }
    if (!domain) return;
    
    let sites = [...customSites];
    if (sites.length >= 5) sites = sites.slice(1); // Keep max 5 custom sites
    
    sites.push({ url, domain, addTime: Date.now() });
    saveCustomSites(sites);
    setShowAddSite(false);
    setAddSiteUrl('');
  };

  // 长按删除逻辑
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);

  const handleMouseDown = (site: any, type: 'custom' | 'history') => {
    longPressTimer.current = setTimeout(() => {
      setSiteToConfirmDelete({ domain: site.domain, type });
    }, 800);
  };

  const handleMouseUp = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }
  };

  const confirmDelete = () => {
    if (!siteToConfirmDelete) return;

    if (siteToConfirmDelete.type === 'custom') {
      const newSites = customSites.filter(s => s.domain !== siteToConfirmDelete!.domain);
      saveCustomSites(newSites);
    } else {
      const newList = Array.from(new Set([...historySiteBlacklist, siteToConfirmDelete.domain]));
      saveHistorySiteBlacklist(newList);
    }
    setSiteToConfirmDelete(null);
  };

  // 版权自动反差样式
  const copyrightBg = textColor === 'white' ? 'rgba(0,0,0,0.28)' : 'rgba(255,255,255,0.28)';
  const copyrightColor = textColor === 'white' ? 'rgba(255,255,255,0.95)' : 'rgba(0,0,0,0.95)';
  const copyrightShadow = textColor === 'white'
    ? '0 1px 4px rgba(0,0,0,0.7)'
    : '0 1px 4px rgba(255,255,255,0.7)';

  // Dock栏相关
  const defaultFavicon = 'data:image/svg+xml;utf8,<svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="24" cy="24" r="20" fill="%23E5E7EB"/><circle cx="24" cy="24" r="18" fill="%233B82F6"/><path d="M24 6a18 18 0 100 36 18 18 0 000-36zm0 2c2.5 0 4.5 6.5 4.5 14.5S26.5 37 24 37 19.5 30.5 19.5 22.5 21.5 8 24 8z" fill="%23fff"/></svg>';

  // 过滤黑名单和自定义的历史网站，最多10个
  const filteredHistorySites = dockSites
    .filter(site =>
      !customSites.some(cs => cs.domain === site.domain) &&
      !historySiteBlacklist.includes(site.domain)
    )
    .slice(0, 10);

  const mergedDockSites = [
    ...customSites,
    ...filteredHistorySites
  ].slice(0, 15);

  // Dock栏相关
  const [customFavicons, setCustomFavicons] = useState<{ [domain: string]: string }>(() => {
    try {
      const saved = localStorage.getItem('customFavicons');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const saveCustomFavicons = (favicons: { [domain: string]: string }) => {
    setCustomFavicons(favicons);
    localStorage.setItem('customFavicons', JSON.stringify(favicons));
  };

  // 更换图标弹窗相关逻辑
  const [faviconEditDomain, setFaviconEditDomain] = useState<string | null>(null);
  const [faviconInput, setFaviconInput] = useState('');
  const [faviconEditType, setFaviconEditType] = useState<'custom' | 'history' | null>(null);
  const [faviconMode, setFaviconMode] = useState<'domain' | 'upload'>('domain');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFaviconEdit = (domain: string, type: 'custom' | 'history') => {
    setFaviconEditDomain(domain);
    setFaviconEditType(type);
    setFaviconInput('');
    setFaviconMode('domain');
  };

  const handleFaviconSave = () => {
    if (!faviconEditDomain) return;
    let faviconUrl = '';
    if (faviconMode === 'domain' && faviconInput.trim()) {
      // 拼接 Google favicon API
      faviconUrl = `https://s2.googleusercontent.com/s2/favicons?sz=64&domain_url=${faviconInput.trim()}`;
    } else if (faviconMode === 'upload' && faviconInput) {
      faviconUrl = faviconInput;
    }
    if (faviconUrl) {
      saveCustomFavicons({ ...customFavicons, [faviconEditDomain]: faviconUrl });
    } else {
      const { [faviconEditDomain]: _, ...rest } = customFavicons;
      saveCustomFavicons(rest);
    }
    setFaviconEditDomain(null);
    setFaviconEditType(null);
    setFaviconInput('');
  };

  const handleFaviconFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setFaviconInput(ev.target?.result as string);
      setFaviconMode('upload');
    };
    reader.readAsDataURL(file);
  };

  const handleDeleteSite = () => {
    if (!faviconEditDomain || !faviconEditType) return;
    if (faviconEditType === 'custom') {
      const newSites = customSites.filter(s => s.domain !== faviconEditDomain);
      saveCustomSites(newSites);
    } else {
      const newList = Array.from(new Set([...historySiteBlacklist, faviconEditDomain]));
      saveHistorySiteBlacklist(newList);
    }
    setFaviconEditDomain(null);
    setFaviconEditType(null);
    setFaviconInput('');
  };

  // 日历事项相关
  const [calendarNotes, setCalendarNotes] = useState<{ [date: string]: string[] }>(() => {
    try {
      const saved = localStorage.getItem('calendarNotes');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const saveCalendarNotes = (notes: { [date: string]: string[] }) => {
    setCalendarNotes(notes);
    localStorage.setItem('calendarNotes', JSON.stringify(notes));
  };
  const [noteEditDate, setNoteEditDate] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const [noteHoverDate, setNoteHoverDate] = useState<string | null>(null);

  const handleDateDblClick = (d: number) => {
    if (!d) return;
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    setNoteEditDate(dateStr);
    setNoteInput('');
  };
  const handleNoteAdd = () => {
    if (!noteEditDate || !noteInput.trim()) return;
    const notes = calendarNotes[noteEditDate] ? [...calendarNotes[noteEditDate], noteInput.trim()] : [noteInput.trim()];
    saveCalendarNotes({ ...calendarNotes, [noteEditDate]: notes });
    setNoteInput('');
  };
  const handleNoteDelete = (idx: number) => {
    if (!noteEditDate) return;
    const notes = [...(calendarNotes[noteEditDate] || [])];
    notes.splice(idx, 1);
    const newNotes = { ...calendarNotes };
    if (notes.length) {
      newNotes[noteEditDate] = notes;
    } else {
      delete newNotes[noteEditDate];
    }
    saveCalendarNotes(newNotes);
  };

  return (
    <div className="relative min-h-screen bg-cover bg-center" style={{ backgroundImage: `url(${wallpaper})` }}>
      {error && (
        <div className="absolute top-0 left-0 right-0 bg-red-500 text-white p-2 text-center z-50">
          {error}
        </div>
      )}

      {/* 顶部极简时间条 */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20">
        <div className="px-6 h-12 flex items-center rounded-full shadow-sm bg-black/20 backdrop-blur-sm">
          <span className="text-4xl font-light tracking-widest text-white drop-shadow-sm select-none" style={{ letterSpacing: 2 }}>{time.toLocaleTimeString()}</span>
        </div>
      </div>

      {/* 左上角极简弹性搜索框 */}
      <div className="absolute top-6 left-6 z-30">
        <form onSubmit={handleSearch} className="relative flex items-center">
          <Search className="absolute left-4 w-5 h-5 text-white/60 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder={t('search_placeholder')}
            className={`pl-10 pr-4 h-12 rounded-full focus:outline-none text-sm transition-all duration-300 bg-white/30 backdrop-blur-md placeholder:text-white/50 text-white shadow-md ${searchFocused || searchTerm ? 'w-80 scale-105 shadow-lg' : 'w-32'} border border-white/10`}
            style={{
              boxShadow: searchFocused || searchTerm ? '0 4px 24px 0 rgba(0,0,0,0.10)' : '0 1px 4px 0 rgba(0,0,0,0.06)',
            }}
          />
        </form>
      </div>

      {/* 可拖动日历卡片 */}
      <div
        ref={calendarRef}
        className={`z-30 flex flex-col items-end cursor-move select-none transition-shadow duration-200 ${dragging ? 'shadow-2xl opacity-90' : ''}`}
        style={{
          position: 'absolute',
          top: calendarPos.top,
          right: 24,
        }}
        onMouseDown={onMouseDown}
      >
        <div className="w-80 p-4 rounded-2xl shadow-lg bg-black/20 backdrop-blur-md text-white/90 select-none">
          <div className="flex flex-col items-start mb-2">
            <span className="font-semibold text-lg pl-2">{year}-{String(month+1).padStart(2,'0')}</span>
          </div>
          <div className="grid grid-cols-7 text-xs text-white/60 mb-1 text-center">
            {weekDays.map(d => <div key={d} className="text-center">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {weeks.flat().map((d, i) => {
              const dateStr = d ? `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}` : '';
              const hasNote = !!calendarNotes[dateStr];
              return d ? (
                <div
                  key={i}
                  className={`h-8 flex flex-col items-center justify-center rounded-full transition-all relative text-center
                    ${d === date ? 'bg-white/80 text-black font-bold shadow' : ''}
                    ${(i%7===0||i%7===6) && d !== date ? 'text-white/40' : ''}
                    ${hasNote ? 'cursor-pointer' : ''}`}
                  onDoubleClick={() => handleDateDblClick(d)}
                  onMouseEnter={() => hasNote && setNoteHoverDate(dateStr)}
                  onMouseLeave={() => setNoteHoverDate(null)}
                >
                  <span>{d}</span>
                  {hasNote && <span className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-0.5"></span>}
                  {/* 悬浮时显示事项列表 */}
                  {noteHoverDate === dateStr && (
                    <div className="absolute z-50 top-8 left-1/2 -translate-x-1/2 bg-white text-black rounded shadow-lg p-2 min-w-[120px] text-xs">
                      <div className="font-bold mb-1">{t('note_list')}</div>
                      <ul>
                        {(calendarNotes[dateStr]||[]).map((n, idx) => <li key={idx} className="mb-1">{n}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <div key={i} className="h-8" />
              );
            })}
          </div>
        </div>
      </div>

      {/* 底部Dock栏（macOS风格毛玻璃地板） */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 w-full flex justify-center pointer-events-none">
        <div className="flex items-end px-6 py-3 bg-white/30 backdrop-blur-md rounded-3xl shadow-2xl space-x-4 transition-shadow duration-200 pointer-events-auto"
          style={{ minWidth: 240, maxWidth: '90vw' }}>
          {mergedDockSites.map((site) => (
            <a
              key={site.domain + (site.addTime || '')}
              href={`https://${site.domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center group"
              title={site.domain}
              style={{ minWidth: 56 }}
              onMouseDown={(e) => {
                if (e.button === 0) {
                  longPressTimer.current = setTimeout(() => {
                    handleFaviconEdit(site.domain, site.addTime ? 'custom' : 'history');
                  }, 800);
                }
              }}
              onMouseUp={() => {
                if (longPressTimer.current) clearTimeout(longPressTimer.current);
              }}
              onMouseLeave={() => {
                if (longPressTimer.current) clearTimeout(longPressTimer.current);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                handleFaviconEdit(site.domain, site.addTime ? 'custom' : 'history');
              }}
            >
              <Favicon domain={site.domain} defaultFavicon={defaultFavicon} customFavicon={customFavicons[site.domain]} />
            </a>
          ))}
          {customSites.length < 5 && (
            <button
              className="flex flex-col items-center justify-center w-14 h-14 rounded-xl bg-white/40 hover:bg-white/60 shadow-md group transition"
              style={{ minWidth: 56 }}
              onClick={() => setShowAddSite(true)}
            >
              <Plus className="w-8 h-8 text-blue-500" />
            </button>
          )}
        </div>
      </div>

      {/* 添加网站弹窗 */}
      {showAddSite && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 shadow-2xl w-80 flex flex-col">
            <h3 className="text-lg font-semibold mb-4">{t('add_site')}</h3>
            <input
              className="mb-4 p-2 border rounded"
              placeholder={t('add_site_placeholder')}
              value={addSiteUrl}
              onChange={e => setAddSiteUrl(e.target.value)}
            />
            <div className="flex justify-end space-x-2">
              <button className="px-4 py-1 bg-gray-200 rounded" onClick={() => setShowAddSite(false)}>{t('cancel')}</button>
              <button className="px-4 py-1 bg-blue-500 text-white rounded" onClick={handleAddSite}>{t('add')}</button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {siteToConfirmDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 shadow-2xl w-72 flex flex-col items-center">
            <div className="mb-4 text-lg">{t('delete_confirm', [siteToConfirmDelete.domain])}</div>
            <div className="flex space-x-4">
              <button className="px-4 py-1 bg-gray-200 rounded" onClick={() => setSiteToConfirmDelete(null)}>{t('cancel')}</button>
              <button className="px-4 py-1 bg-red-500 text-white rounded" onClick={confirmDelete}>{t('delete')}</button>
            </div>
          </div>
        </div>
      )}

      {/* 更换图标弹窗 */}
      {faviconEditDomain && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 shadow-2xl w-80 flex flex-col">
            <h3 className="text-lg font-semibold mb-4">{t('change_icon')} - {faviconEditDomain}</h3>
            <div className="flex mb-2 space-x-2">
              <button className={`px-3 py-1 rounded ${faviconMode==='domain'?'bg-blue-500 text-white':'bg-gray-200'}`} onClick={()=>{setFaviconMode('domain'); setFaviconInput('');}}>{t('by_domain')}</button>
              <button className={`px-3 py-1 rounded ${faviconMode==='upload'?'bg-blue-500 text-white':'bg-gray-200'}`} onClick={()=>{setFaviconMode('upload'); setFaviconInput('');}}>{t('upload_image')}</button>
            </div>
            {faviconMode === 'domain' ? (
              <input
                className="mb-2 p-2 border rounded"
                placeholder={t('input_domain')}
                value={faviconInput}
                onChange={e => setFaviconInput(e.target.value)}
              />
            ) : (
              <>
                <input
                  type="file"
                  accept="image/*"
                  className="mb-2"
                  style={{ display: 'none' }}
                  ref={fileInputRef}
                  onChange={handleFaviconFile}
                />
                <button className="mb-2 px-4 py-1 bg-gray-200 rounded" onClick={() => fileInputRef.current?.click()}>{t('upload_image')}</button>
              </>
            )}
            <div className="flex justify-between mt-2">
              <button className="px-4 py-1 bg-gray-200 rounded" onClick={() => { setFaviconEditDomain(null); setFaviconEditType(null); setFaviconInput(''); }}>{t('cancel')}</button>
              <button className="px-4 py-1 bg-blue-500 text-white rounded" onClick={handleFaviconSave}>{t('save')}</button>
              <button className="px-4 py-1 bg-red-500 text-white rounded" onClick={() => { setFaviconInput(''); saveCustomFavicons({ ...customFavicons, [faviconEditDomain!]: '' }); setFaviconEditDomain(null); setFaviconEditType(null); }}>{t('restore_default')}</button>
            </div>
            <button className="mt-4 px-4 py-1 bg-red-600 text-white rounded" onClick={handleDeleteSite}>{t('remove_site')}</button>
            {/* 预览区 */}
            <div className="mt-4 flex flex-col items-center">
              {faviconMode === 'domain' && faviconInput.trim() && (
                <img src={`https://s2.googleusercontent.com/s2/favicons?sz=64&domain_url=${faviconInput.trim()}`} alt={t('preview')} className="w-14 h-14 object-contain rounded" />
              )}
              {faviconMode === 'upload' && faviconInput && (
                <img src={faviconInput} alt={t('preview')} className="w-14 h-14 object-contain rounded" />
              )}
              <div className="text-xs text-gray-500 mt-2">{faviconMode === 'domain' ? t('domain_favicon_tip') : t('upload_favicon_tip')}</div>
            </div>
          </div>
        </div>
      )}

      {/* 添加/查看事项弹窗 */}
      {noteEditDate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 shadow-2xl w-80 flex flex-col">
            <h3 className="text-lg font-semibold mb-4">{noteEditDate} {t('note_list')}</h3>
            <ul className="mb-2 max-h-32 overflow-y-auto">
              {(calendarNotes[noteEditDate]||[]).map((n, idx) => (
                <li key={idx} className="flex justify-between items-center mb-1">
                  <span>{n}</span>
                  <button className="ml-2 px-2 py-0.5 bg-red-200 text-xs rounded" onClick={()=>handleNoteDelete(idx)}>{t('delete')}</button>
                </li>
              ))}
            </ul>
            <div className="flex mb-2">
              <input
                className="flex-1 p-2 border rounded mr-2"
                placeholder={t('note_placeholder')}
                value={noteInput}
                onChange={e => setNoteInput(e.target.value)}
                onKeyDown={e => { if (e.key==='Enter') handleNoteAdd(); }}
              />
              <button className="px-3 py-1 bg-blue-500 text-white rounded" onClick={handleNoteAdd}>{t('add')}</button>
            </div>
            <button className="mt-2 px-4 py-1 bg-gray-200 rounded" onClick={()=>setNoteEditDate(null)}>{t('close')}</button>
          </div>
        </div>
      )}

      {/* 底部极简版权和下载按钮 */}
      <div className="absolute bottom-0 left-0 right-0 flex justify-between items-end p-4 select-none">
        <div
          className="text-xs"
          style={{
            letterSpacing: 0.2,
            color: copyrightColor,
            textShadow: copyrightShadow,
            background: copyrightBg,
            borderRadius: 6,
            padding: '2px 8px',
            maxWidth: 320,
            overflow: 'hidden',
            whiteSpace: 'nowrap',
          }}
        >
          {photographer && (
            <span>
              Photo by{' '}
              <a href={photoUrl} className="underline hover:text-white/80 transition">
                {photographer}
              </a>{' '}on{' '}
              <a href="https://unsplash.com" className="underline hover:text-white/80 transition">
                Unsplash
              </a>
            </span>
          )}
        </div>
        <div className="flex space-x-3">
          <button
            onClick={handleRefreshWallpaper}
            className="bg-black/30 backdrop-blur-md p-3 rounded-full shadow-md transition-transform duration-200 hover:scale-110 hover:shadow-lg"
            style={{ backgroundColor: textColor === 'white' ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)' }}
            title={isLoadingWallpaper ? "正在加载新壁纸..." : "刷新壁纸"}
            disabled={isLoadingWallpaper}
          >
            <RefreshCw className={`w-5 h-5 text-white/80 transition-all duration-200 ${isLoadingWallpaper ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowHistory(true)}
            className="bg-black/30 backdrop-blur-md p-3 rounded-full shadow-md transition-transform duration-200 hover:scale-110 hover:shadow-lg"
            style={{ backgroundColor: textColor === 'white' ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)' }}
            title={t('wallpaper_history')}
          >
            <History className="w-5 h-5 text-white/80" />
          </button>
          <button
            onClick={handleDownload}
            className="bg-black/30 backdrop-blur-md p-3 rounded-full shadow-md transition-transform duration-200 hover:scale-110 hover:shadow-lg"
            style={{ backgroundColor: textColor === 'white' ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)' }}
          >
            <Download className="w-5 h-5 text-white/80" />
          </button>
        </div>
      </div>

      {/* 壁纸历史记录弹窗 */}
      {showHistory && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-50"
          onClick={(e) => {
            // 点击遮罩层（外部区域）时关闭弹窗
            if (e.target === e.currentTarget) {
              setShowHistory(false);
            }
          }}
        >
          <div 
            ref={historyModalRef}
            className="bg-gradient-to-br from-white/95 to-white/85 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-8 max-w-6xl w-full max-h-[85vh] overflow-hidden"
            onClick={(e) => {
              // 阻止点击内容区域时关闭弹窗
              e.stopPropagation();
            }}
          >
            {/* 标题区域 */}
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-2xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent mb-2">
                  {t('wallpaper_history')}
                </h3>
                <p className="text-sm text-gray-500 flex items-center gap-2">
                  <History className="w-4 h-4" />
                  {t('history_limit_hint')} • {wallpaperHistory.length} / 20
                </p>
              </div>
              <button
                onClick={() => setShowHistory(false)}
                className="p-3 hover:bg-gray-100/80 rounded-full transition-all duration-200 hover:scale-110 group"
              >
                <X className="w-6 h-6 text-gray-500 group-hover:text-gray-700" />
              </button>
            </div>
            
            {/* 内容区域 */}
            <div className="overflow-y-auto max-h-[65vh] pr-2 custom-scrollbar">
              {wallpaperHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-20 h-20 bg-gradient-to-br from-blue-100 to-purple-100 rounded-full flex items-center justify-center mb-4">
                    <History className="w-10 h-10 text-gray-400" />
                  </div>
                  <p className="text-gray-500 text-lg font-medium mb-2">{t('no_history')}</p>
                  <p className="text-gray-400 text-sm">打开几个新标签页来开始收集美丽的壁纸吧！</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                  {wallpaperHistory.map((item, index) => (
                    <div key={item.id || index} className="group relative">
                      {/* 卡片容器 */}
                      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-gray-100 to-gray-50 shadow-lg hover:shadow-2xl transition-all duration-300 group-hover:scale-[1.02] group-hover:-translate-y-1">
                        {/* 图片 */}
                        <div className="aspect-[4/3] overflow-hidden">
                          <img
                            src={item.thumbnail}
                            alt={`Photo by ${item.photographer}`}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                            loading="lazy"
                          />
                        </div>
                        
                        {/* 渐变遮罩 */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10" />
                        
                        {/* 悬浮信息 */}
                        <div className="absolute inset-0 flex flex-col justify-between p-4 opacity-0 group-hover:opacity-100 transition-all duration-300 z-20">
                          {/* 顶部信息 */}
                          <div className="flex justify-end">
                            <div className="bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full">
                              <span className="text-white text-xs font-medium">
                                #{index + 1}
                              </span>
                            </div>
                          </div>
                          
                          {/* 底部信息和操作 */}
                          <div>
                            <div className="mb-3">
                              <p className="text-white text-sm font-semibold truncate mb-1">
                                📸 {item.photographer}
                              </p>
                              <p className="text-white/80 text-xs">
                                {new Date(item.timestamp).toLocaleDateString('zh-CN', {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </p>
                            </div>
                            
                            {/* 操作按钮 */}
                            <div className="flex justify-center space-x-3 relative z-30">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleHistoryDownload(item);
                                }}
                                className="bg-white/25 backdrop-blur-sm p-2.5 rounded-full hover:bg-white/35 transition-all duration-200 hover:scale-110 group/btn cursor-pointer relative z-40"
                                title={t('download')}
                              >
                                <Download className="w-4 h-4 text-white group-hover/btn:text-blue-200" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // 使用 Chrome API 在新标签页中打开链接
                                  if (typeof chrome !== 'undefined' && chrome.tabs) {
                                    chrome.tabs.create({ url: item.photoUrl });
                                  } else {
                                    // 开发环境使用 window.open
                                    window.open(item.photoUrl, '_blank');
                                  }
                                }}
                                className="bg-white/25 backdrop-blur-sm p-2.5 rounded-full hover:bg-white/35 transition-all duration-200 hover:scale-110 group/btn cursor-pointer relative z-40"
                                title={t('view_on_unsplash')}
                              >
                                <Search className="w-4 h-4 text-white group-hover/btn:text-green-200" />
                              </button>
                            </div>
                          </div>
                        </div>
                        
                        {/* 卡片边框光效 */}
                        <div className="absolute inset-0 rounded-2xl ring-1 ring-white/20 group-hover:ring-white/40 transition-all duration-300" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;