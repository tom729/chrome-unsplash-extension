import React, { useState, useEffect, useRef } from 'react';
import { Download, Search, Plus } from 'lucide-react';
import ColorThief from 'colorthief';

// Mock chrome API for development environment
const mockChrome = {
  storage: {
    sync: {
      get: (keys: string[] | string, callback: (result: any) => void) => {
        const keyList = Array.isArray(keys) ? keys : [keys];
        const result = keyList.reduce((acc, key) => ({ ...acc, [key]: localStorage.getItem(key) }), {});
        callback(result);
      },
      set: (items: { [key: string]: any }, callback?: () => void) => {
        Object.entries(items).forEach(([key, value]) => localStorage.setItem(key, JSON.stringify(value)));
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
  const [wallpaper, setWallpaper] = useState('');
  const [time, setTime] = useState(new Date());
  const [photographer, setPhotographer] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [error, setError] = useState('');
  const [textColor, setTextColor] = useState('white');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  // 日历相关
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const date = today.getDate();
  const weeks = getMonthCalendar(year, month);
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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
      chromeApi.storage.sync.get(['wallpaper', 'photographer', 'photoUrl', 'downloadUrl', 'error'], (result) => {
        if (result.error) setError(result.error);
        if (result.wallpaper) {
          setWallpaper(result.wallpaper);
          updateTextColor(result.wallpaper);
        }
        if (result.photographer) setPhotographer(result.photographer);
        if (result.photoUrl) setPhotoUrl(result.photoUrl);
        if (result.downloadUrl) setDownloadUrl(result.downloadUrl);
      });
    };

    getInitialData();

    const storageChangeListener = (changes: { [key: string]: any }, area: string) => {
      if (area === 'sync') {
        if (changes.wallpaper) setWallpaper(changes.wallpaper.newValue);
        if (changes.photographer) setPhotographer(changes.photographer.newValue);
        if (changes.photoUrl) setPhotoUrl(changes.photoUrl.newValue);
        if (changes.downloadUrl) setDownloadUrl(changes.downloadUrl.newValue);
        if (changes.error) setError(changes.error.newValue || '');
      }
    };

    chromeApi.storage.onChanged.addListener(storageChangeListener);

    // Request an update on load to get the latest wallpaper
    chromeApi.runtime.sendMessage({ action: 'updateWallpaper' });
    
    return () => {
      clearInterval(timer);
      chromeApi.storage.onChanged.removeListener(storageChangeListener);
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
      url: downloadUrl,
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
            placeholder="Search..."
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
          <div className="flex justify-between items-center mb-2">
            <span className="font-semibold text-lg">{year}-{String(month+1).padStart(2,'0')}</span>
            <span className="text-xs text-white/60">{today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
          </div>
          <div className="grid grid-cols-7 text-xs text-white/60 mb-1">
            {weekDays.map(d => <div key={d} className="text-center">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {weeks.flat().map((d, i) => {
              const dateStr = d ? `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}` : '';
              const hasNote = !!calendarNotes[dateStr];
              return d ? (
                <div
                  key={i}
                  className={`h-8 flex flex-col items-center justify-center rounded-full transition-all relative
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
                      <div className="font-bold mb-1">注意事项</div>
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
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-40 w-full flex justify-center pointer-events-none">
        <div className="flex items-end px-8 py-2 bg-white/30 backdrop-blur-md rounded-3xl shadow-2xl space-x-4 transition-shadow duration-200 pointer-events-auto"
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
            <h3 className="text-lg font-semibold mb-4">添加网站</h3>
            <input
              className="mb-4 p-2 border rounded"
              placeholder="网址，如 https://xxx.com"
              value={addSiteUrl}
              onChange={e => setAddSiteUrl(e.target.value)}
            />
            <div className="flex justify-end space-x-2">
              <button className="px-4 py-1 bg-gray-200 rounded" onClick={() => setShowAddSite(false)}>取消</button>
              <button className="px-4 py-1 bg-blue-500 text-white rounded" onClick={handleAddSite}>添加</button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {siteToConfirmDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 shadow-2xl w-72 flex flex-col items-center">
            <div className="mb-4 text-lg">
              {`确定要删除 ${siteToConfirmDelete.domain} 吗?`}
            </div>
            <div className="flex space-x-4">
              <button className="px-4 py-1 bg-gray-200 rounded" onClick={() => setSiteToConfirmDelete(null)}>取消</button>
              <button className="px-4 py-1 bg-red-500 text-white rounded" onClick={confirmDelete}>删除</button>
            </div>
          </div>
        </div>
      )}

      {/* 更换图标弹窗 */}
      {faviconEditDomain && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 shadow-2xl w-80 flex flex-col">
            <h3 className="text-lg font-semibold mb-4">更换图标 - {faviconEditDomain}</h3>
            <div className="flex mb-2 space-x-2">
              <button className={`px-3 py-1 rounded ${faviconMode==='domain'?'bg-blue-500 text-white':'bg-gray-200'}`} onClick={()=>{setFaviconMode('domain'); setFaviconInput('');}}>通过域名</button>
              <button className={`px-3 py-1 rounded ${faviconMode==='upload'?'bg-blue-500 text-white':'bg-gray-200'}`} onClick={()=>{setFaviconMode('upload'); setFaviconInput('');}}>上传图片</button>
            </div>
            {faviconMode === 'domain' ? (
              <input
                className="mb-2 p-2 border rounded"
                placeholder="输入域名（如 baidu.com）"
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
                <button className="mb-2 px-4 py-1 bg-gray-200 rounded" onClick={() => fileInputRef.current?.click()}>上传图片</button>
              </>
            )}
            <div className="flex justify-between mt-2">
              <button className="px-4 py-1 bg-gray-200 rounded" onClick={() => { setFaviconEditDomain(null); setFaviconEditType(null); setFaviconInput(''); }}>取消</button>
              <button className="px-4 py-1 bg-blue-500 text-white rounded" onClick={handleFaviconSave}>保存</button>
              <button className="px-4 py-1 bg-red-500 text-white rounded" onClick={() => { setFaviconInput(''); saveCustomFavicons({ ...customFavicons, [faviconEditDomain!]: '' }); setFaviconEditDomain(null); setFaviconEditType(null); }}>恢复默认</button>
            </div>
            <button className="mt-4 px-4 py-1 bg-red-600 text-white rounded" onClick={handleDeleteSite}>删除网站</button>
            {/* 预览区 */}
            <div className="mt-4 flex flex-col items-center">
              {faviconMode === 'domain' && faviconInput.trim() && (
                <img src={`https://s2.googleusercontent.com/s2/favicons?sz=64&domain_url=${faviconInput.trim()}`} alt="预览" className="w-14 h-14 object-contain rounded" />
              )}
              {faviconMode === 'upload' && faviconInput && (
                <img src={faviconInput} alt="预览" className="w-14 h-14 object-contain rounded" />
              )}
              <div className="text-xs text-gray-500 mt-2">
                {faviconMode === 'domain' ? '输入域名，自动获取 favicon 图标' : '上传图片作为自定义图标'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 添加/查看事项弹窗 */}
      {noteEditDate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 shadow-2xl w-80 flex flex-col">
            <h3 className="text-lg font-semibold mb-4">{noteEditDate} 的注意事项</h3>
            <ul className="mb-2 max-h-32 overflow-y-auto">
              {(calendarNotes[noteEditDate]||[]).map((n, idx) => (
                <li key={idx} className="flex justify-between items-center mb-1">
                  <span>{n}</span>
                  <button className="ml-2 px-2 py-0.5 bg-red-200 text-xs rounded" onClick={()=>handleNoteDelete(idx)}>删除</button>
                </li>
              ))}
            </ul>
            <div className="flex mb-2">
              <input
                className="flex-1 p-2 border rounded mr-2"
                placeholder="添加新事项"
                value={noteInput}
                onChange={e => setNoteInput(e.target.value)}
                onKeyDown={e => { if (e.key==='Enter') handleNoteAdd(); }}
              />
              <button className="px-3 py-1 bg-blue-500 text-white rounded" onClick={handleNoteAdd}>添加</button>
            </div>
            <button className="mt-2 px-4 py-1 bg-gray-200 rounded" onClick={()=>setNoteEditDate(null)}>关闭</button>
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
              <a href={photoUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-white/80 transition">
                {photographer}
              </a>{' '}
              on{' '}
              <a href="https://www.unsplash.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-white/80 transition">
                Unsplash
              </a>
            </span>
          )}
        </div>
        <div className="flex space-x-4">
          <button
            onClick={handleDownload}
            className="bg-black/30 backdrop-blur-md p-2 rounded-full shadow-md transition-transform duration-200 hover:scale-110 hover:shadow-lg"
            style={{ backgroundColor: textColor === 'white' ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)' }}
          >
            <Download className="w-6 h-6 text-white/80" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;