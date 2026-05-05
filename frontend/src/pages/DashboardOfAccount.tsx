// src/pages/DashboardOfAccount.tsx
import React from "react";
import Layout from "../components/account/Layout";

type DashboardOfAccountProps = {
  token: string | null;
  setToken: (token: string | null) => void;
  theme: string;
  onThemeChange: (theme: string) => void;
  onLanguageChange: (lang: string) => void;
  currentLanguage: string;
};

const DashboardOfAccount: React.FC<DashboardOfAccountProps> = ({
  token,
  setToken,
  theme,
  onThemeChange,
  onLanguageChange,
  currentLanguage,
}) => {
  return (
    <Layout
      token={token}
      setToken={setToken}
      theme={theme}
      onThemeChange={onThemeChange}
      onLanguageChange={onLanguageChange}
      currentLanguage={currentLanguage}
    />
  );
};

export default DashboardOfAccount;
