# Aesthetic and Productive Tab

<div align="center">

🌄 **Transform every new tab into a source of inspiration**

A beautiful Chrome extension that transforms your new tab into an aesthetic and efficient workspace featuring stunning Unsplash photography and powerful productivity tools.

[![Version](https://img.shields.io/badge/version-1.6-blue.svg)](https://github.com/tom729/chrome-unsplash-extension/releases/tag/v1.6)
[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Available-green.svg)](https://chrome.google.com/webstore)
[![License](https://img.shields.io/badge/license-MIT-orange.svg)](LICENSE)

</div>

## ✨ Features

### 🖼️ **Stunning Wallpapers**
- Daily auto-updated high-quality Unsplash photography
- Manual refresh support for instant new wallpapers
- Smart text color adaptation for optimal readability

### 📚 **Wallpaper History** *(New in v1.6)*
- Automatically saves your last 50 wallpapers
- Beautiful grid layout with hover effects
- One-click download from history
- Direct links to view photos and photographers on Unsplash
- Smart deduplication to avoid saving identical wallpapers

### 🔍 **Smart Search**
- Built-in multi-engine search bar
- Quick access to web content
- Clean, distraction-free search experience

### 🌐 **Intelligent Shortcuts**
- Smart website dock based on browsing history
- Customizable website icons
- Add/remove/edit favorite sites
- Automatic favicon fetching

### 📅 **Practical Calendar**
- Draggable mini calendar widget
- Add notes and reminders to any date
- Persistent note storage
- Intuitive date navigation

### 💾 **Download & Save**
- One-click wallpaper downloads
- Save current and historical wallpapers
- Automatic filename generation with photographer names

### 🌍 **Multi-language Support**
- Automatic Chinese/English interface adaptation
- Based on browser language settings
- Comprehensive i18n implementation

## 🎨 Design Philosophy

Features modern **glassmorphism design** with:
- Clean, elegant interface that doesn't overwhelm
- Smart text color adaptation for any background
- Smooth animations and hover effects
- Responsive design for all screen sizes
- Every feature thoughtfully designed for both beauty and functionality

## 🚀 Installation

### From Chrome Web Store *(Recommended)*
1. Visit the [Chrome Web Store page](https://chrome.google.com/webstore)
2. Click "Add to Chrome"
3. Enjoy your beautiful new tab experience!

### Manual Installation
1. Download the latest `extension.zip` from [Releases](https://github.com/tom729/chrome-unsplash-extension/releases)
2. Extract the zip file
3. Open Chrome and navigate to `chrome://extensions/`
4. Enable "Developer mode"
5. Click "Load unpacked" and select the extracted folder

## 🛠️ Development

### Prerequisites
- Node.js 16+ and npm
- Chrome browser for testing

### Setup
```bash
# Clone the repository
git clone https://github.com/tom729/chrome-unsplash-extension.git
cd chrome-unsplash-extension

# Install dependencies
npm install

# Create environment file
cp .env.example .env
# Add your Unsplash API key to .env

# Start development server
npm run dev

# Build for production
npm run build

# Create distribution package
npm run create-zip
```

### Environment Variables
Create a `.env` file in the root directory:
```
VITE_UNSPLASH_ACCESS_KEY=your_unsplash_api_key_here
```

Get your free API key from [Unsplash Developers](https://unsplash.com/developers).

## 📋 Permissions

This extension requires the following permissions:
- **storage**: Save settings, wallpaper history, and user data
- **downloads**: Download wallpapers to your device
- **search**: Integrate with browser search functionality
- **alarms**: Schedule automatic wallpaper updates
- **history**: Suggest frequently visited websites

## 🔄 What's New in v1.6

🎉 **Major Update - Wallpaper History Feature**

- ✨ **Wallpaper History**: Save and browse your last 50 wallpapers
- 📱 **One-click Access**: Beautiful grid layout with hover effects
- 💾 **Historical Downloads**: Download any previous wallpaper
- 🔗 **Photographer Links**: View original photos on Unsplash
- 🔧 **Link Improvements**: Fixed photographer links opening behavior
- 🌍 **Enhanced i18n**: Better multi-language support
- 🎨 **UI Enhancements**: Modern glassmorphism design updates

[View all releases](https://github.com/tom729/chrome-unsplash-extension/releases)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

### Development Guidelines
- Follow existing code style and conventions
- Test thoroughly before submitting PR
- Update documentation as needed
- Include meaningful commit messages

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Unsplash](https://unsplash.com) for providing beautiful, free photos
- [Lucide React](https://lucide.dev) for clean, beautiful icons
- [Tailwind CSS](https://tailwindcss.com) for utility-first styling
- All the amazing photographers on Unsplash

## 📧 Support

If you encounter any issues or have suggestions:
- Open an [issue](https://github.com/tom729/chrome-unsplash-extension/issues)
- Star ⭐ this repository if you find it useful!

---

<div align="center">

**Made with ❤️ for a more beautiful web experience**

[⬆ Back to top](#aesthetic-and-productive-tab)

</div>