// Copy this file to firebase-config.js and fill in your own values:
//   cp firebase-config.example.js firebase-config.js
// firebase-config.js is git-ignored so your key never lands in the repo.
// The live site gets these values from GitHub Secrets at deploy time
// (see .github/workflows/deploy-pages.yml).
window.FIREBASE_CONFIG = {
    apiKey: 'PASTE_YOUR_API_KEY',
    authDomain: 'PASTE_YOUR_AUTH_DOMAIN',
    databaseURL: 'PASTE_YOUR_DATABASE_URL',
    projectId: 'PASTE_YOUR_PROJECT_ID',
    storageBucket: 'PASTE_YOUR_STORAGE_BUCKET',
    messagingSenderId: 'PASTE_YOUR_SENDER_ID',
    appId: 'PASTE_YOUR_APP_ID'
};
