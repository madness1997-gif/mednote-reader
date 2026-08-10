import React from "react";
import ReactDOM from "react-dom/client";
import Home from "../app/page";
import EquationComposer from "../app/equation-composer";
import NotePdfExporter from "../app/note-pdf-export";
import PdfExportE2EHarness from "../app/pdf-export-e2e-harness";
import "../app/globals.css";
import "../app/library-panel-fix.css";
import "../app/textbox-fixes.css";
import "../app/note-zoom-fixes.css";
import "../app/note-pdf-export.css";
import "../app/note-symbol-library.css";
import "../app/note-stickers.css";
import "../app/note-zoom-runtime";
import "../app/pdf-wheel-zoom-runtime";
import "../app/note-symbol-library";

const pdfExportE2E = new URLSearchParams(window.location.search).get("pdfExportE2E") === "1";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {pdfExportE2E ? (
      <PdfExportE2EHarness />
    ) : (
      <>
        <Home />
        <EquationComposer />
        <NotePdfExporter />
      </>
    )}
  </React.StrictMode>,
);
