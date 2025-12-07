import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

// Console warning for developers/hackers
console.log(
  '%c[!] STOP!',
  'color: red; font-size: 60px; font-weight: bold; text-shadow: 2px 2px 0 black;'
);
console.log(
  '%cThis is a browser feature intended for developers.',
  'color: #ff6b6b; font-size: 18px; font-weight: bold;'
);
console.log(
  '%c[WARNING] If someone told you to copy-paste something here, it is likely a scam.',
  'color: #feca57; font-size: 16px;'
);
console.log(
  '%c[SECURITY] UniBuddy takes security seriously. Any unauthorized access attempts will be logged and reported.',
  'color: #54a0ff; font-size: 14px;'
);
console.log(
  '%c[DEV] Developed by Vincent Bernabe Romeo (Daisukie)',
  'color: #5f27cd; font-size: 12px; font-style: italic;'
);

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
