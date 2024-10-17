import React, { useState, useEffect } from 'react';
import { Pause, Play, RotateCw, Search } from 'lucide-react';
import ColorThief from 'colorthief';

// Mock chrome API for development environment
const mockChrome = {
  storage: {
    sync: {
      get: (keys: string[], callback: (result: any) => void) => {
        const result = keys.reduce((acc, key) => ({ ...acc, [key]: localStorage.getItem(key) }), {});
        callback(result);
      },
      set: (items: { [key: string]: any }, callback?: () => void) => {
        Object.entries(items).forEach(([key, value]) => localStorage.setItem(key, JSON.stringify(value)));
        if (callback) callback();
      },
    },
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
};

const chromeApi = typeof chrome !== 'undefined' && chrome.storage ? chrome : mockChrome;

function App() {
  const [wallpaper, setWallpaper] = useState('');
  const [time, setTime] = useState(new Date());
  const [photographer, setPhotographer] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [isPaused, setIsPaused] = useState(false);
  const [error, setError] = useState('');
  const [textColor, setTextColor] = useState('white');
  const [searchEngine, setSearchEngine] = useState('google');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    chromeApi.storage.sync.get(['wallpaper', 'photographer', 'photoUrl'], (result) => {
      if (result.wallpaper) {
        setWallpaper(result.wallpaper);
        updateTextColor(result.wallpaper);
      }
      if (result.photographer) setPhotographer(result.photographer);
      if (result.photoUrl) setPhotoUrl(result.photoUrl);
    });

    chromeApi.runtime.onMessage.addListener((changes) => {
      if (changes.wallpaper) {
        setWallpaper(changes.wallpaper);
        updateTextColor(changes.wallpaper);
      }
      if (changes.photographer) setPhotographer(changes.photographer);
      if (changes.photoUrl) setPhotoUrl(changes.photoUrl);
    });

    chromeApi.runtime.sendMessage({ action: 'updateWallpaper' });
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
    let searchUrl = '';
    switch (searchEngine) {
      case 'bing':
        searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(searchTerm)}`;
        break;
      case 'baidu':
        searchUrl = `https://www.baidu.com/s?wd=${encodeURIComponent(searchTerm)}`;
        break;
      default:
        searchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchTerm)}`;
    }
    window.open(searchUrl, '_blank');
  };

  const togglePause = () => {
    setIsPaused(!isPaused);
    chromeApi.runtime.sendMessage({ action: isPaused ? 'resumeAlarm' : 'pauseAlarm' });
  };

  const updateWallpaper = () => {
    chromeApi.runtime.sendMessage({ action: 'updateWallpaper' });
  };

  return (
    <div className="min-h-screen bg-cover bg-center flex flex-col justify-between" style={{ backgroundImage: `url(${wallpaper})` }}>
      {error && (
        <div className="absolute top-0 left-0 right-0 bg-red-500 text-white p-2 text-center">
          {error}
        </div>
      )}
      <div className="flex justify-center mt-20">
        <div className={`bg-opacity-50 p-4 rounded-lg text-center`} style={{ backgroundColor: textColor === 'white' ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)' }}>
          <h1 className={`text-6xl font-bold`} style={{ color: textColor }}>{time.toLocaleTimeString()}</h1>
        </div>
      </div>

      <div className="flex justify-center mb-20">
        <form onSubmit={handleSearch} className="flex items-center">
          <select
            onChange={(e) => setSearchEngine(e.target.value)}
            className="h-12 px-4 rounded-l-full focus:outline-none bg-white bg-opacity-20 text-gray-700"
            style={{ color: textColor, backgroundColor: textColor === 'white' ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)' }}
          >
            <option value="google">Google</option>
            <option value="bing">Bing</option>
            <option value="baidu">Baidu</option>
          </select>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={`Search ${searchEngine.charAt(0).toUpperCase() + searchEngine.slice(1)}...`}
            className="h-12 px-4 w-80 focus:outline-none"
            style={{ 
              color: textColor, 
              backgroundColor: textColor === 'white' ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)',
              '::placeholder': { color: textColor === 'white' ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)' }
            }}
          />
          <button type="submit" className="h-12 px-4 rounded-r-full hover:bg-opacity-30 transition-colors duration-200" style={{ backgroundColor: textColor === 'white' ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)' }}>
            <Search className="w-6 h-6" style={{ color: textColor }} />
          </button>
        </form>
      </div>

      <div className="flex justify-between items-end p-4" style={{ color: textColor }}>
        <div>
          {photographer && photoUrl && (
            <p>Photo by <a href={photoUrl} target="_blank" rel="noopener noreferrer" className="underline">{photographer}</a> on Unsplash</p>
          )}
        </div>
        <div className="flex space-x-4">
          <button onClick={togglePause} className={`bg-opacity-50 p-2 rounded-full`} style={{ backgroundColor: textColor === 'white' ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)' }}>
            {isPaused ? <Play className="w-6 h-6" style={{ color: textColor }} /> : <Pause className="w-6 h-6" style={{ color: textColor }} />}
          </button>
          <button onClick={updateWallpaper} className={`bg-opacity-50 p-2 rounded-full`} style={{ backgroundColor: textColor === 'white' ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)' }}>
            <RotateCw className="w-6 h-6" style={{ color: textColor }} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;