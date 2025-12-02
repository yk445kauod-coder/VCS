
<div align="center">
  <img width="1200" height="475" alt="VCS Banner" src="https://github.com/user-attachments/assets/" />
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
- **Backend**: Firebase Realtime Database (for user data, lessons, schools)
- **Generative AI**: Google Gemini Pro (via Google AI SDK)
- **Deployment**: Ready to deploy on platforms like Vercel, Netlify, or Firebase Hosting.

## 🚀 Getting Started

Follow these instructions to get a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or newer recommended)
- [Git](https://git-scm.com/)
- A [Google Gemini API Key](https://aistudio.google.com/app/apikey)

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

3.  **Set up Firebase:**
    -   Go to the [Firebase Console](https://console.firebase.google.com/) and create a new project.
    -   Create a **Realtime Database**. Start in **test mode** for easy setup (you can secure it later with security rules).
    -   In your project settings, find your web app's Firebase configuration object.
    -   Copy this object into `src/services/firebase.ts`, replacing the placeholder `firebaseConfig`.

4.  **Set up environment variables:**
    -   Create a `.env.local` file in the root of the project.
    -   Add your Gemini API key to this file:
        ```
        GEMINI_API_KEY=your_gemini_api_key_here
        ```

5.  **Run the development server:**
    ```bash
    npm run dev
    ```
    The application should now be running at `http://localhost:3000`.

## 🚢 Deployment

This project is configured for easy deployment on modern hosting platforms.

### Vercel / Netlify

1.  Push your code to a GitHub repository.
2.  Import the repository into your Vercel or Netlify account.
3.  Configure the environment variables (e.g., `GEMINI_API_KEY`) in the platform's dashboard.
4.  Deploy! The build command is `npm run build` and the output directory is `dist`.

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

## 📧 Contact

Your Name - [@your_twitter](https://twitter.com/your_twitter) - email@example.com

Project Link: [https://github.com/your-username/vcs-app](https://github.com/your-username/vcs-app)
