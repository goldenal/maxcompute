# Figma to Flutter (Max Compute)

A powerful Figma plugin that converts your UI designs directly into clean, production-ready Flutter code using the Gemini AI API.

## 🚀 Features

- **Screenshot to Code**: Convert any selected Figma component or frame into Flutter code.
- **AI-Powered**: Uses Google's Gemini API to understand layouts and generate meaningful widget structures.
- **Precise Styling**: Extracts colors, spacing, and typography directly from Figma to ensure high-fidelity conversions.
- **Local Server**: A dedicated Node.js backend to handle complex AI processing securely.

---

## 🛠 Prerequisites

Before you begin, ensure you have the following installed:

- [Node.js](https://nodejs.org/) (v16 or higher)
- [Figma Desktop App](https://www.figma.com/downloads/)
- A **Gemini API Key**. You can get one from the [Google AI Studio](https://aistudio.google.com/).

---

## 📦 Installation & Setup

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd figma_plugin
```

### 2. Backend Server Setup

The server handles the communication with the Gemini API.

1. Navigate to the server directory:
   ```bash
   cd server
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the `server` directory:
   ```bash
   touch .env
   ```
4. Add your Gemini API Key to the `.env` file:
   ```env
   GEMINI_API_KEY=your_actual_api_key_here
   ```
5. Start the server (TypeScript):
   ```bash
   npm run dev
   ```
   The server will run on `http://localhost:3000`.

   For a production-style run:
   ```bash
   npm run build
   npm start
   ```

### 3. Figma Plugin Setup

1. Open a new terminal window and navigate to the plugin directory:
   ```bash
   cd plugin
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the plugin:
   ```bash
   npm run build
   ```
   _(Optional: Use `npm run watch` to automatically rebuild whenever you make changes.)_

---

## 🎨 How to Use in Figma

1. Open the **Figma Desktop App**.
2. Go to **Plugins** -> **Development** -> **Import plugin from manifest...**.
3. Select the `manifest.json` file located in the `plugin` directory of this project.
4. Select a frame or component in your Figma file.
5. Run the **Figma to Flutter (Max Compute)** plugin.
6. Ensure your backend server is running.

---

## 🖥 Using the Plugin UI

The plugin interface is divided into two main tabs: **Project** and **Generate**.

### 1. Project Tab (Connection)

Before generating code, you need to connect the plugin to a Flutter project.

- **Existing Project**: Enter the absolute path to your existing Flutter project (e.g., `/Users/name/projects/my_app`). Click **Load Project**.
- **New Project**: Select the "New Project" mode, provide a parent directory and a project name. Click **Create Project**.
- Once connected, the status will show "Connected: [path]".

### 2. Generate Tab (Code Conversion)

Once connected, you can start converting Figma designs:

- **Target Feature**: Select an existing feature folder or click the **+** button to create a new one (follows Clean Architecture/Feature-first pattern).
- **File Name**: Enter the name for the generated Dart file (e.g., `login_screen.dart`).
- **Widget Type**: Choose between **Stateless** or **Stateful** widget generation.
- **Generate & Save**: This will generate the code and automatically save it to `lib/features/[feature]/[file_name]`.
- **Generate Only**: Use this if you just want to preview the code in the output area without saving it to a file.
- **Copy**: Use the copy button in the output area to copy the code to your clipboard.

### 🖼 Handling Images

The plugin automatically detects images and vectors within your selection:

- It uploads them to the local server.
- If "Generate & Save" is used, it saves them into your project's `assets/images/` directory.
- The generated code will include the correct `Image.asset` paths.

---

## 📂 Project Structure

- `/plugin`: The Figma plugin frontend (TypeScript + HTML).
- `/server`: The Express.js backend that interfaces with Gemini AI.
- `/server/src/services`: Contains the logic for AI code generation and project management.

---

## 🤝 Troubleshooting

- **Server Not Found**: Ensure the backend server is running on `http://localhost:3000`. Check if any firewall is blocking the connection.
- **API Errors**: Verify that your `GEMINI_API_KEY` in the `.env` file is valid and has sufficient quota.
- **Plugin Not Updating**: If you are making changes to the plugin code, make sure you are running `npm run watch` or have rebuilt the plugin using `npm run build`.

---

## 📝 License

This project is licensed under the MIT License.
