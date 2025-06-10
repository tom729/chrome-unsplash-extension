import React, { useState, useEffect, useRef } from 'react';
import { Download, Search } from 'lucide-react';
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
  }
};

const chromeApi = typeof chrome !== 'undefined' && chrome.search ? chrome : mockChrome;

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
  const defaultCalendarPos = { top: 24, left: window.innerWidth - 400 };
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
    chromeApi.search.query({ text: searchTerm, disposition: 'NEW_TAB' });
  };

  const handleDownload = () => {
    // Sanitize the photographer's name to remove characters that are invalid in filenames
    const sanitizedPhotographer = photographer.replace(/[\\/:*?"<>|]/g, '').trim();
    const filename = `unsplash-${sanitizedPhotographer.replace(/\s+/g, '-') || 'wallpaper'}.jpg`;
    chromeApi.runtime.sendMessage({
      action: 'downloadWallpaper',
      url: downloadUrl,
      filename: filename
    });
  };

  // Dock栏相关
  const fallbackSites = [
    { domain: 'github.com', url: 'https://github.com', count: 1 },
    { domain: 'bilibili.com', url: 'https://bilibili.com', count: 1 },
    { domain: 'zhihu.com', url: 'https://zhihu.com', count: 1 },
    { domain: 'google.com', url: 'https://google.com', count: 1 },
    { domain: 'weixin.qq.com', url: 'https://weixin.qq.com', count: 1 },
    { domain: 'douban.com', url: 'https://douban.com', count: 1 },
    { domain: 'csdn.net', url: 'https://csdn.net', count: 1 },
    { domain: 'taobao.com', url: 'https://taobao.com', count: 1 },
    { domain: 'jd.com', url: 'https://jd.com', count: 1 },
    { domain: 'baidu.com', url: 'https://baidu.com', count: 1 },
  ];
  const [dockSites, setDockSites] = useState<{ domain: string; url: string; count: number }[]>([]);
  const [validDockSites, setValidDockSites] = useState<typeof dockSites>([]);
  const dockRef = useRef<HTMLDivElement>(null);
  const [maxDockIcons, setMaxDockIcons] = useState(10);

  // 统计最近一周常用网站
  useEffect(() => {
    if (!chrome.history) {
      setValidDockSites(fallbackSites);
      return;
    }
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    chrome.history.search({ text: '', startTime: oneWeekAgo, maxResults: 1000 }, (results) => {
      const domainMap: Record<string, { count: number; url: string; lastVisitTime: number }> = {};
      results.forEach(item => {
        const domain = getDomain(item.url || '');
        if (!domain || domain.endsWith('google.com') || domain.endsWith('baidu.com') || domain.endsWith('bing.com')) return; // 可排除搜索引擎
        if (!domainMap[domain]) domainMap[domain] = { count: 0, url: item.url || '', lastVisitTime: 0 };
        domainMap[domain].count += item.visitCount || 1;
        if ((item.lastVisitTime || 0) > (domainMap[domain].lastVisitTime || 0)) {
          domainMap[domain].url = item.url || '';
          domainMap[domain].lastVisitTime = item.lastVisitTime || 0;
        }
      });
      const arr = Object.entries(domainMap)
        .map(([domain, v]) => ({ domain, url: v.url, count: v.count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, maxDockIcons);
      setDockSites(arr);
    });
  }, [maxDockIcons]);

  // 根据底部宽度自适应最大图标数
  useEffect(() => {
    const calc = () => {
      const width = window.innerWidth;
      const iconSize = 56, gap = 16;
      const max = Math.max(4, Math.floor((width - 64) / (iconSize + gap)));
      setMaxDockIcons(max);
    };
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);

  // 过滤掉没有favicon的网站
  useEffect(() => {
    setValidDockSites([]); // 重置
  }, [dockSites]);

  const handleFaviconLoad = (domain: string) => {
    setValidDockSites(prev => {
      if (prev.find(site => site.domain === domain)) return prev;
      const site = dockSites.find(s => s.domain === domain);
      return site ? [...prev, site] : prev;
    });
  };
  const handleFaviconError = (domain: string) => {
    setValidDockSites(prev => prev.filter(site => site.domain !== domain));
  };

  // 版权自动反差样式
  const copyrightBg = textColor === 'white' ? 'rgba(0,0,0,0.28)' : 'rgba(255,255,255,0.28)';
  const copyrightColor = textColor === 'white' ? 'rgba(255,255,255,0.95)' : 'rgba(0,0,0,0.95)';
  const copyrightShadow = textColor === 'white'
    ? '0 1px 4px rgba(0,0,0,0.7)'
    : '0 1px 4px rgba(255,255,255,0.7)';

  // Dock栏相关
  const defaultFavicon = 'data:image/svg+xml;utf8,<svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="24" cy="24" r="20" fill="%23E5E7EB"/><circle cx="24" cy="24" r="18" fill="%233B82F6"/><path d="M24 6a18 18 0 100 36 18 18 0 000-36zm0 2c2.5 0 4.5 6.5 4.5 14.5S26.5 37 24 37 19.5 30.5 19.5 22.5 21.5 8 24 8z" fill="%23fff"/></svg>';

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

      {/* 右上角极简天气控件（固定） */}
      <div className="absolute top-6 right-6 z-30 flex flex-col items-end">
        <div className="px-6 h-12 flex items-center rounded-full shadow-sm bg-black/20 backdrop-blur-sm text-white/90 text-base font-light select-none">
          <span className="mr-2">☀️</span>
          <span>28°C</span>
          <span className="ml-3 text-xs text-white/60">Beijing</span>
        </div>
      </div>

      {/* 可拖动日历卡片 */}
      <div
        ref={calendarRef}
        className={`z-30 flex flex-col items-end cursor-move select-none transition-shadow duration-200 ${dragging ? 'shadow-2xl opacity-90' : ''}`}
        style={{
          position: 'absolute',
          top: calendarPos.top,
          left: calendarPos.left,
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
            {weeks.flat().map((d, i) =>
              d ? (
                <div
                  key={i}
                  className={`h-8 flex items-center justify-center rounded-full transition-all
                    ${d === date ? 'bg-white/80 text-black font-bold shadow' : ''}
                    ${(i%7===0||i%7===6) && d !== date ? 'text-white/40' : ''}
                  `}
                >
                  {d}
                </div>
              ) : (
                <div key={i} className="h-8" />
              )
            )}
          </div>
        </div>
      </div>

      {/* 底部Dock栏（macOS风格毛玻璃地板） */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-40 w-full flex justify-center pointer-events-none">
        <div className="flex items-end px-8 py-2 bg-white/30 backdrop-blur-md rounded-3xl shadow-2xl space-x-4 transition-shadow duration-200 pointer-events-auto"
          style={{ minWidth: 240, maxWidth: '90vw' }}>
          {fallbackSites.map(site => (
            <a
              key={site.domain}
              href={site.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center group"
              title={site.domain}
              style={{ minWidth: 56 }}
            >
              <img
                src={`https://www.google.com/s2/favicons?domain=${site.domain}&sz=64`}
                alt={site.domain}
                className="w-14 h-14 rounded-xl shadow-md bg-white/40 group-hover:scale-125 group-hover:shadow-2xl transition-transform duration-200"
                style={{ objectFit: 'contain' }}
                onLoad={() => handleFaviconLoad(site.domain)}
                onError={() => handleFaviconError(site.domain)}
              />
              <span className="mt-1 text-xs text-white/70 truncate w-14 text-center group-hover:text-white/90">{site.domain}</span>
            </a>
          ))}
        </div>
      </div>

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