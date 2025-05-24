# Frontend Setup

[![Befriend Frontend Setup](https://img.youtube.com/vi/7XlHxRbtC7s/0.jpg)](https://youtu.be/7XlHxRbtC7s)

## Installation Steps

### 1. Clone Repository

```bash
git clone https://github.com/befriend-app/befriend-app
```

### 2. Navigate to Directory

```bash
cd befriend-app
```

### 3. Install Packages

```bash
npm install -g cordova
npm install cordova-icon -g
npm install
```

### 4. Add Platforms

```bash
cordova platform add ios@7
cordova platform add android@12
```

### 5. Install OS Requirements

```bash
node scripts/install/ios.js
node scripts/install/android.js
```

### 6. Run Development Server

*When the app is built with the --dev flag, app.js and styles.css is loaded from a local server as opposed to from the device. This allows for much quicker development without having to rebuild the app each time.*

```bash
node scripts/dev/serve.js
```

### 7. Build App

#### Production Build

```bash
node scripts/build/device.js
```

#### Development Build

```bash
node scripts/build/device.js --dev http://localhost:3010 --api http://localhost:3000 --ws ws://localhost:8080
```

## Build Options

| Option | Description |
|--------|-------------|
| `--dev` | Frontend development server host |
| `--api` | Backend server host |
| `--ws` | Websocket server host |
| `--ios` | Build for iOS only |
| `--android` | Build for Android only |

### 8. Open Platform Project

#### iOS
1. Open Xcode
2. Open project folder: `befriend-app/platforms/ios`

#### Android
Coming soon

## Development Workflow

# Frontend Setup

## Installation Steps

### 1. Clone Repository

```bash
git clone https://github.com/befriend-app/befriend-app
```

### 2. Navigate to Directory

```bash
cd befriend-app
```

### 3. Install Packages

```bash
npm install -g cordova
npm install cordova-icon -g
npm install
```

### 4. Add Platforms

```bash
cordova platform add ios@7
cordova platform add android@12
```

### 5. Install OS Requirements

```bash
node scripts/install/ios.js
node scripts/install/android.js
```

### 6. Run Development Server

*When the app is built with the --dev flag, app.js and styles.css is loaded from a local server as opposed to from the device. This allows for much quicker development without having to rebuild the app each time.*

```bash
node scripts/dev/serve.js
```

### 7. Build App

#### Production Build

```bash
node scripts/build/device.js
```

#### Development Build

```bash
node scripts/build/device.js --dev http://localhost:3010 --api http://localhost:3000 --ws ws://localhost:8080
```

## Build Options

| Option | Description |
|--------|-------------|
| `--dev` | Frontend development server host |
| `--api` | Backend server host |
| `--ws` | Websocket server host |
| `--ios` | Build for iOS only |
| `--android` | Build for Android only |

### 8. Open Platform Project

#### iOS
1. Open Xcode
2. Open project folder: `befriend-app/platforms/ios`

#### Android
Coming soon

## Development Workflow

Building with the `--dev` flag enables much faster development by loading resources from a local server instead of rebuilding the entire app after each change.