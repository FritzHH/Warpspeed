# ODB - React Native Web App

A bare-bones React Native Web application with routing and Firebase integration.

## Features

- ✅ React Native Web
- ✅ React Router for navigation
- ✅ Firebase Authentication
- ✅ Firebase Firestore
- ✅ Firebase Storage
- ✅ Device detection (Mobile/Desktop)
- ✅ Responsive landing pages
- ✅ Auto-routing based on device type

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure Firebase:
   - Open `src/firebase/config.js`
   - Replace the placeholder values with your Firebase project credentials

3. Development credentials (for testing):
   - Email: support@bonitabikes.com
   - Password: BonitaBikes.69

## Running the App

Start the development server:
```bash
npm start
```

The app will open at `http://localhost:3000`

## Testing Mobile View

To test the mobile view, resize your browser window to mobile dimensions or use browser DevTools:
- Chrome: F12 > Toggle device toolbar (Ctrl+Shift+M)
- Select iPhone or any mobile device from the dropdown

## Build for Production

```bash
npm run build
```

The production build will be in the `dist` folder.

## Project Structure

```
ODB/
├── public/
│   └── index.html
├── src/
│   ├── firebase/
│   │   ├── config.js          # Firebase configuration
│   │   └── authService.js     # Authentication functions
│   ├── screens/
│   │   ├── LoginScreen.js     # Login page
│   │   ├── DesktopLanding.js  # Desktop landing page
│   │   └── MobileLanding.js   # Mobile landing page
│   ├── utils/
│   │   └── deviceDetection.js # Device detection utility
│   ├── App.js                 # Main app with routing
│   └── index.js               # Entry point
├── .babelrc
├── webpack.config.js
└── package.json
```

## Device Routing

The app automatically detects the device type and routes users to the appropriate landing page:
- **Mobile devices** (width ≤ 768px) → Mobile Landing
- **Desktop devices** (width > 768px) → Desktop Landing

## Firebase Services Available

- **Authentication** (`auth`): Sign in, sign up, sign out
- **Firestore** (`db`): Database operations
- **Storage** (`storage`): File storage
- **Analytics** (`analytics`): Usage analytics

