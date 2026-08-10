# README.md

<div align="center">

<img src="PUT-YOUR-LOGO-URL-HERE" alt="VCS Logo" width="150"/>

# **VCS — Virtual Cloud School**

### المدرسة السحابية الافتراضية • Open-Source, AI-Powered Virtual School Platform

<p align="center">
  <a href="#">⭐ GitHub Stars</a> •
  <a href="#">🔱 GitHub Forks</a> •
  <a href="#">🐞 Issues</a>
</p>

</div>

---

#  النسخة العربية

## 📘 ما هي VCS؟

**Virtual Cloud School (VCS)** منصة تعليمية شاملة، تهدف لإدخال قوة الذكاء الاصطناعي التوليدي إلى الصفوف الدراسية.
تمكن المعلمين من إنشاء مدارس افتراضية، إدارة الطلاب، وتصميم شخصيات معلمين افتراضيين مخصصة.
يمكن للطلاب والمعلمين توليد محتوى تعليمي غني ومتعدد الصيغ—بما في ذلك الشروحات التفصيلية، المخططات، التمارين التفاعلية، الشرائح، والاختبارات—كل ذلك بدعم من نماذج Google Gemini.

---

## ✨ المميزات

<table>
<tr>
<td>🏫<br>**إدارة المدارس**<br>إنشاء مدارس افتراضية، توليد رموز الانضمام، وإدارة طلبات التسجيل.</td>
<td>🤖<br>**شخصيات المعلم الافتراضي**<br>تصميم معلمين افتراضيين بشخصيات مختلفة مع تحديد المواد والمظهر.</td>
</tr>
<tr>
<td>📚<br>**توليد الدروس الذكي**<br>إنشاء دروس ديناميكية من موضوع، نص مرفوع، أو باستخدام نتائج بحث Google مباشرة.</td>
<td>🎓<br>**محتوى متعدد الصيغ**<br>Markdown، Smart-Board، Playground، Slides، اختبارات متعددة الخيارات.</td>
</tr>
<tr>
<td>💬<br>**دردشة تفاعلية**<br>طرح أسئلة متابعة للمعلم الذكي ضمن سياق الدرس.</td>
<td>🗓️<br>**جدول المدرسة الأسبوعي**<br>إدارة جدول حصص أسبوعي.</td>
</tr>
<tr>
<td>🌐<br>**منشورات المجتمع**<br>مساحة مشتركة لجميع مستخدمي المدرسة للنشر والتفاعل.</td>
<td>🔐<br>**تسجيل دخول آمن**<br>Firebase Realtime Database.</td>
</tr>
<tr>
<td>📱<br>**واجهة متجاوبة بالكامل**<br>دعم أجهزة سطح المكتب والهواتف المحمولة.</td>
<td>💡<br>**ذكي ومرن**<br>تجربة تعليمية مخصصة لكل مستخدم.</td>
</tr>
</table>

---

## 🛠️ التقنيات المستخدمة

* **Frontend:** React (Vite), TypeScript, Tailwind CSS
* **Backend:** Firebase Realtime Database
* **AI Engine:** Google Gemini Pro
* **النشر:** Firebase Hosting، Vercel، Netlify

---

## 🚀 بدء الاستخدام

### المتطلبات

* Node.js 18+
* Git
* Gemini API Key

### التثبيت

```bash
git clone https://github.com/yk445kauod-coder/VCS.git
cd VCS
npm install
```

### إعداد Firebase

1. إنشاء مشروع Firebase جديد
2. إنشاء Realtime Database (ابدأ في وضع الاختبار)
3. نسخ firebaseConfig إلى `src/services/firebase.ts`

### إعداد متغيرات البيئة

إنشاء ملف `.env.local` في جذر المشروع:

```
GEMINI_API_KEY=your_gemini_api_key_here
```

### تشغيل المشروع

```bash
npm run dev
```

سيعمل التطبيق على:

```
http://localhost:3000
```

---

# 🚢 النشر (Deployment)

### Vercel / Netlify

1. ادفع الكود إلى GitHub
2. استورد المستودع في حسابك على Vercel أو Netlify
3. اضبط المتغيرات البيئية (مثل GEMINI_API_KEY)
4. أمر البناء:

```bash
npm run build
```

5. مجلد الإخراج: `dist`

### Firebase Hosting

```bash
firebase deploy
```

---

## 🤝 المساهمة

Fork → Branch → Commit → Push → Pull Request

---

## 📄 الرخصة

MIT License

---

## 📧 التواصل

**Yousef Khamis Madboult**
Email: [yousefmadbouly60@gmail.com](mailto:yousefmadbouly60@gmail.com)
Repo: [https://github.com/yk445kauod-coder/VCS](https://github.com/yk445kauod-coder/VCS)

---

# 🇺🇸 English Version

## 📘 What is VCS?

**Virtual Cloud School (VCS)** is a comprehensive educational platform designed to bring the power of generative AI into the classroom.
It allows educators to create virtual schools, manage students, and design custom AI teacher personas.
Students and teachers can generate rich, multi-format educational content—including detailed explanations, diagrams, interactive exercises, presentations, and quizzes—all powered by Google Gemini models.

---

## ✨ Features

<table>
<tr>
<td>🏫<br>**School Management**<br>Create virtual schools, generate join codes, manage student enrollment.</td>
<td>🤖<br>**AI Teacher Personas**<br>Design custom AI teachers with personalities, subjects, appearances.</td>
</tr>
<tr>
<td>📚<br>**Smart Lesson Generation**<br>Generate dynamic lessons from a topic, uploaded text, or live Google Search.</td>
<td>🎓<br>**Multi-Format Content**<br>Markdown, Smart-Board, Playground, Slides, MCQ Quizzes.</td>
</tr>
<tr>
<td>💬<br>**Interactive Chat**<br>Ask follow-up questions to the AI teacher.</td>
<td>🗓️<br>**Weekly School Schedule**<br>Manage class schedules.</td>
</tr>
<tr>
<td>🌐<br>**Community Feed**<br>Shared posting area for all school users.</td>
<td>🔐<br>**User Authentication**<br>Firebase RTDB.</td>
</tr>
<tr>
<td>📱<br>**Responsive Design**<br>Support for desktop and mobile.</td>
<td>💡<br>**Smart & Flexible**<br>Custom learning experience per user.</td>
</tr>
</table>

---

## 🛠️ Tech Stack

* **Frontend:** React (Vite), TypeScript, Tailwind CSS
* **Backend:** Firebase Realtime Database
* **Generative AI:** Google Gemini Pro
* **Deployment:** Firebase Hosting, Vercel, Netlify

---

## 🚀 Getting Started

### Prerequisites

* Node.js 18+
* Git
* Gemini API Key

### Installation

```bash
git clone https://github.com/yk445kauod-coder/VCS.git
cd VCS
npm install
```

### Firebase Setup

* Create Firebase project
* Create Realtime Database (test mode)
* Copy firebaseConfig to `src/services/firebase.ts`

### Environment Variables

```
GEMINI_API_KEY=your_gemini_api_key_here
```

### Run Development

```bash
npm run dev
```

App runs at: `http://localhost:3000`

---

## 🚢 Deployment

### Vercel / Netlify

* Push code to GitHub
* Import repo
* Set environment variables (GEMINI_API_KEY)
* Build command:

```bash
npm run build
```

* Output folder: `dist`

### Firebase Hosting

```bash
firebase deploy
```

---

## 🤝 Contributing

Fork → Branch → Commit → Push → Pull Request

---

## 📄 License

MIT License

---

## 📧 Contact

**Yousef Khamis Madboult**
Email: [yousefmadbouly60@gmail.com](mailto:yousefmadbouly60@gmail.com)
Repo: [https://github.com/yk445kauod-coder/VCS](https://github.com/yk445kauod-coder/VCS)
