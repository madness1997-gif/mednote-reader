import React from "react";
import ReactDOM from "react-dom/client";
import Home from "../app/page";
import EquationComposer from "../app/equation-composer";
import NotePdfExporter from "../app/note-pdf-export";
import "../app/globals.css";
import "../app/textbox-fixes.css";
import "../app/note-zoom-fixes.css";
import "../app/note-pdf-export.css";
import "../app/note-symbol-library.css";
import "../app/note-zoom-runtime";
import "../app/pdf-wheel-zoom-runtime";
import "../app/note-symbol-library";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Home />
    <EquationComposer />
    <NotePdfExporter />
  </React.StrictMode>,
);
