# Figma to Flutter Plugin Walkthrough

This guide explains how to set up and run the Figma to Flutter conversion plugin.

## Prerequisites
- Node.js and npm installed.
- A Google Gemini API Key. [Get one here](https://makersuite.google.com/app/apikey).
- Figma Desktop App.

## Setup

### 1. Configure API Key
1.  Open `server/.env`.
2.  Replace `YOUR_API_KEY_HERE` with your actual Gemini API key.
    ```env
    GEMINI_API_KEY=AIzaSy...
    ```

### 2. Start the Server
The server handles the communication with Gemini.
1.  Open a terminal.
2.  Navigate to the `server` directory:
    ```bash
    cd server
    ```
3.  Start the server in dev mode (TypeScript):
    ```bash
    npm run dev
    ```
    You should see: `Server running on http://localhost:3000`

    For a production-style run:
    ```bash
    npm run build
    npm start
    ```

### 3. Build the Plugin (Optional)
The plugin is already built, but if you make changes:
1.  Open a new terminal.
2.  Navigate to the `plugin` directory:
    ```bash
    cd plugin
    ```
3.  Run build:
    ```bash
    npm run build
    ```
    Or watch for changes:
    ```bash
    npm run watch
    ```

## Running in Figma

1.  Open Figma.
2.  Go to **Plugins** > **Development** > **Import plugin from manifest...**
3.  Select the `plugin/manifest.json` file in this project.
4.  The plugin "Figma to Flutter (Gemini)" should appear.

## Usage

1.  Select a Frame or Component in Figma.
2.  Run the plugin: **Plugins** > **Development** > **Figma to Flutter (Gemini)**.
3.  Click **Convert Selection**.
4.  Wait a moment for the AI to generate the code.
5.  Copy the Flutter code from the text area.

## Troubleshooting
- **Server Error**: Ensure the server is running on port 3000.
- **API Key Error**: Check your `.env` file and restart the server.
