import React from "react";
import ReactDOM from "react-dom/client";
import Home from "../app/page";
import EquationComposer from "../app/equation-composer";
import "../app/globals.css";
import "../app/textbox-fixes.css";
import "../app/note-zoom-fixes.css";
import "../app/note-zoom-runtime";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Home />
    <EquationComposer />
  </React.StrictMode>,
);
