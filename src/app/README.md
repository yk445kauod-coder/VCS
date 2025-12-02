
<div align="center">
  <img width="1200" height="475" alt="VCS Banner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
  <h1>VCS: Virtual Cloud School</h1>
  <p>
    <b>An open-source, AI-powered virtual school platform built with React and Google Gemini.</b>
  </p>
  <p>
    <a href="https://github.com/your-username/vcs-app/stargazers"><img src="https://img.shields.io/github/stars/your-username/vcs-app?style=social" alt="GitHub Stars"></a>
    <a href="https://github.com/your-username/vcs-app/network/members"><img src="https://img.shields.io/github/forks/your-username/vcs-app?style=social" alt="GitHub Forks"></a>
    <a href="https://github.com/your-username/vcs-app/issues"><img src="https://img.shields.io/github/issues/your-username/vcs-app" alt="GitHub issues"></a>
  </p>
</div>

**Virtual Cloud School (VCS)** is a comprehensive educational platform designed to bring the power of generative AI into the classroom. It allows educators to create virtual schools, manage students, and design custom AI teacher personas. Students and teachers can generate rich, multi-format educational content—including detailed explanations, diagrams, interactive exercises, presentations, and quizzes—all powered by Google's Gemini models.

## ✨ Features

- **🏫 School Management**: Teachers can create virtual schools, generate unique join codes, and manage student enrollment requests.
- **🤖 AI Teacher Personas**: Design custom AI teachers with distinct personalities (Formal, Friendly, Sarcastic, etc.), subjects, and appearances.
- **📚 Smart Lesson Generation**: Generate dynamic lessons from a topic, uploaded text, or by leveraging live Google Search results for up-to-date information.
- **🎓 Multi-Format Content**: Lessons are automatically structured into multiple formats:
  -   **Detailed Explanations**: In-depth text in Markdown format.
  -   **Smart-Board View**: A summary dashboard with key points and a visual diagram.
  -   **Interactive Playground**: Live, editable HTML/JS sandboxes to demonstrate concepts.
  -   **Slides**: Automatically generated presentation slides.
  -   **Quizzes**: Multiple-choice questions to test comprehension.
- **💬 Interactive Chat**: Students can ask follow-up questions to the AI teacher within the context of a lesson.
- **🗓️ School Schedule**: School owners can create and manage a weekly class schedule.
- **🌐 Community Feed**: A shared space for all users in a school to post messages and interact.
- **🔐 User Authentication**: Simple and secure login system using Firebase Realtime Database.
- **📱 Responsive Design**: Fully responsive interface for desktop and mobile devices.

## 🛠️ Tech Stack

- **Frontend**: React (Vite), TypeScript, Tailwind CSS
- **Backend**: Firebase Realtime Database
- **Generative AI**: Google Gemini 1.5 Flash (via Google AI SDK)
- **Deployment**: Firebase Hosting

## 🚀 Getting Started

Follow these instructions to get a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or newer recommended)
- [Git](https://git-scm.com/)
- [Firebase CLI](https://firebase.google.com/docs/cli) (for deployment)

### Installation & Setup

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/vcs-app.git
    cd vcs-app
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Set up environment variables:**
    -   Create a `.env` file in the root of the project by copying the example: `cp .env.example .env`
    -   Go to the [Firebase Console](https://console.firebase.google.com/) and create a new project.
    -   Enable the **Realtime Database** (start in test mode for easy setup).
    -   In your Firebase project settings, find your web app's Firebase configuration object.
    -   Add your Firebase credentials to the `.env` file. The variables must be prefixed with `VITE_`.
        ```
        VITE_FIREBASE_API_KEY="your-api-key"
        VITE_FIREBASE_AUTH_DOMAIN="your-auth-domain"
        VITE_FIREBASE_DATABASE_URL="your-database-url"
        VITE_FIREBASE_PROJECT_ID="your-project-id"
        VITE_FIREBASE_STORAGE_BUCKET="your-storage-bucket"
        VITE_FIREBASE_MESSAGING_SENDER_ID="your-sender-id"
        VITE_FIREBASE_APP_ID="your-app-id"
        ```

4.  **Run the development server:**
    ```bash
    npm run dev
    ```
    The application will start, and the first thing it will ask for is your **Google Gemini API Key**. You can get one from [Google AI Studio](https://aistudio.google.com/app/apikey). The app will save this key in your browser's local storage for convenience.

## 🚢 Deployment

This project is configured for easy deployment to **Firebase Hosting**.

### Manual Deployment

1.  **Login to Firebase:**
    ```bash
    firebase login
    ```

2.  **Build the project for production:**
    ```bash
    npm run build
    ```

3.  **Deploy to Firebase Hosting:**
    ```bash
    firebase deploy --only hosting
    ```

### Automated Deployment with GitHub Actions

This repository includes a GitHub Actions workflow (`.github/workflows/firebase-hosting-merge.yml`) that automatically deploys the app to Firebase Hosting when you push or merge to the `main` branch.

To enable this:
1.  Push your code to a GitHub repository.
2.  In your GitHub repository, go to **Settings > Secrets and variables > Actions**.
3.  Create a new repository secret named `FIREBASE_SERVICE_ACCOUNT_VCS_6D905`.
4.  The value of this secret should be the JSON content of a Firebase service account key. You can generate one from your **Firebase Project Settings > Service accounts > Generate new private key**.
5.  Create another secret named `FIREBASE_CLI_TOKEN`.
6.  Generate a CI token by running this command in your terminal: `firebase login:ci`. Copy the token and paste it as the value for the `FIREBASE_CLI_TOKEN` secret.

Now, every time you push to `main`, your app will be automatically built and deployed.

## 🤝 Contributing

Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

If you have a suggestion that would make this better, please fork the repo and create a pull request. You can also simply open an issue with the tag "enhancement".

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.
