import { createContext, useContext } from "react";
import { COPY, type Copy, type Lang } from "./copy";

const LangContext = createContext<Lang>("zh");

export const LangProvider: React.FC<{ lang: Lang; children: React.ReactNode }> = ({
  lang,
  children,
}) => <LangContext.Provider value={lang}>{children}</LangContext.Provider>;

export const useLang = (): Lang => useContext(LangContext);

export const useCopy = (): Copy => COPY[useLang()];
