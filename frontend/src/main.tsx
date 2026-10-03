import "@fontsource-variable/schibsted-grotesk";
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, useLocation } from "react-router-dom";
import App from "./App";
import "./styles.css";

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode><BrowserRouter><ScrollTop /><App /></BrowserRouter></StrictMode>,
);
