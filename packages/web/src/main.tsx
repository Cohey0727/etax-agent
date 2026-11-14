import React from "react";
import { createRoot } from "react-dom/client";
import { AppPage } from "@components/pages";
import "@configs/global.css";

const el = document.getElementById("root");
if (!el) throw new Error("#root が見つかりません");
createRoot(el).render(
  <React.StrictMode>
    <AppPage />
  </React.StrictMode>,
);
