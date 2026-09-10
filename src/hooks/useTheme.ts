import { useEffect, useState } from "react";

type Tema = "light" | "dark";

const CLAVE = "cobranza_tema";

function temaInicial(): Tema {
  const guardado = localStorage.getItem(CLAVE);
  if (guardado === "light" || guardado === "dark") return guardado;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useTheme() {
  const [tema, setTema] = useState<Tema>(temaInicial);

  useEffect(() => {
    document.documentElement.dataset.theme = tema;
    localStorage.setItem(CLAVE, tema);
  }, [tema]);

  function alternar() {
    setTema((actual) => (actual === "dark" ? "light" : "dark"));
  }

  return { tema, alternar };
}
