const { app, BrowserWindow, Menu } = require("electron");
const path = require("path");

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false, // Show window when it is ready to prevent flash
    backgroundColor: "#F4F7FB", // Matches app background
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  // Determine if running in development mode
  const isDev = !app.isPackaged;

  if (isDev) {
    // Load local hot-reloading Expo Web packager
    mainWindow.loadURL("http://localhost:8081");
    // Open DevTools in development
    mainWindow.webContents.openDevTools();
  } else {
    // Load static built index.html from dist/ directory in production
    mainWindow.loadFile(path.join(__dirname, "dist", "index.html"));
  }

  // Optimize load presentation
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  // Handle closed window
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Set up clean menu for desktop software
  const template = [
    {
      label: "File",
      submenu: [
        { role: "quit" }
      ]
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" }
      ]
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { type: "separator" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// App lifecycle handlers
app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
