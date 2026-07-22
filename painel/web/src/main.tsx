import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import "./estilos.css";

const raiz = document.getElementById("raiz");
if (!raiz) {
  throw new Error("Elemento #raiz não encontrado no index.html");
}

ReactDOM.createRoot(raiz).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
