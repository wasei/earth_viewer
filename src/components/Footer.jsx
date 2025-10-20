// src/components/Footer.jsx
import React from "react";
import "./Footer.css"; // CSSをインポート

const Footer = () => {
  return (
    <footer className="app-footer">
      <span>
        Developed by{" "}
        <a
          href="https://kazumasa-editor.netlify.app/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Yuki Kazumasa
        </a>
      </span>
      <div className="footer-links">
        <a
          href="https://github.com/wasei"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub
        </a>
        <a
          href="https://x.com/HDbflat"
          target="_blank"
          rel="noopener noreferrer"
        >
          X (Twitter)
        </a>
      </div>
    </footer>
  );
};

export default Footer;
